-- ===========================================================
-- Infarm CS — dua status pesanan baru + perbaikan pesanan lama
--
-- Branch status-shopee-dan-jumlah-pesanan (12 Nov 2026).
--
-- MASALAH
--   Shopee mengirim status yang belum dikenali pemeta:
--   TO_CONFIRM_RECEIVE, RETRY_SHIP, TO_RETURN. Pesanan berstatus itu
--   jatuh ke 'lainnya', dan jawaban mentahnya ikut disimpan di
--   orders_raw (karena 'lainnya' = pemetaan meragukan).
--
-- YANG DILAKUKAN BERKAS INI
--   1. CHECK orders.status ditambah dua nilai:
--        menunggu_konfirmasi  <- TO_CONFIRM_RECEIVE
--        pengembalian         <- TO_RETURN
--      (RETRY_SHIP dipetakan ke 'perlu_dikirim' yang sudah ada.)
--   2. Pesanan LAMA yang sudah tersimpan sebagai 'lainnya' dengan
--      raw_status di atas diperbaiki statusnya. Tanpa langkah ini
--      mereka tetap 'lainnya' selamanya: sinkronisasi melewati pesanan
--      yang update_time-nya tidak berubah.
--
--   3. Kolom cari_teks (otomatis) untuk pencarian Daftar Pesanan
--      yang kini berhalaman — lihat langkah 3 di bawah.
--
--   Tidak ada baris yang dihapus. Jawaban mentah lama di orders_raw
--   dibersihkan oleh bersihkan_pesanan_lama() (umur > 7 hari), bukan
--   oleh berkas ini.
--
-- URUTAN — PENTING
--   Jalankan berkas ini SEBELUM kode branch ini di-merge/deploy.
--   Kalau kodenya jalan lebih dulu, pesanan TO_RETURN /
--   TO_CONFIRM_RECEIVE ditolak CHECK lama dan potongan sinkron yang
--   memuatnya gagal tersimpan. Sebaliknya aman: CHECK baru tetap
--   menerima semua nilai lama.
--
-- SEBELUM MENJALANKAN: tidak ada yang perlu diganti.
-- Cara pakai: SQL Editor -> tempel seluruh isi -> Run. Idempoten.
-- ===========================================================

begin;

-- 1. Ganti CHECK status. Nama constraint dicari, bukan ditebak:
--    CHECK yang ditulis di dalam CREATE TABLE diberi nama otomatis.
do $blk$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.orders'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
      and pg_get_constraintdef(con.oid) ilike '%menunggu_pembayaran%'
  loop
    execute format('alter table public.orders drop constraint %I', r.conname);
  end loop;
end
$blk$;

alter table public.orders
  add constraint orders_status_check check (status in (
    'menunggu_pembayaran',
    'perlu_dikirim',
    'diproses',
    'dalam_pengiriman',
    'menunggu_konfirmasi',
    'selesai',
    'proses_batal',
    'dibatalkan',
    'menunggu_invoice',
    'pengembalian',
    'lainnya'
  ));

-- 2. Perbaiki pesanan lama. HANYA yang sekarang 'lainnya' — status
--    lain tidak disentuh.
update public.orders
set status = case raw_status
               when 'TO_CONFIRM_RECEIVE' then 'menunggu_konfirmasi'
               when 'TO_RETURN'          then 'pengembalian'
               when 'RETRY_SHIP'         then 'perlu_dikirim'
             end
where status = 'lainnya'
  and raw_status in ('TO_CONFIRM_RECEIVE', 'TO_RETURN', 'RETRY_SHIP');

-- 3. Kolom pencarian untuk paginasi Daftar Pesanan.
--    Tab itu kini mengambil 50 baris per halaman dan menyaring di
--    database, jadi pencarian harus bisa dijalankan database juga.
--    Isinya: nomor pesanan, resi, akun pembeli, dan NAMA PRODUK —
--    huruf kecil tanpa spasi/tanda baca, sama dengan normalkan() di
--    web/lib/cocok.ts. "2410 15abc-def" tetap menemukan 241015ABCDEF.
--    GENERATED ... STORED: diisi otomatis oleh Postgres setiap kali
--    baris ditulis; kode sinkron tidak perlu tahu kolom ini ada.
--    Menambah kolom ini menulis ulang tabel orders sekali (detik untuk
--    ribuan baris). Tambahan ukuran kira-kira 100 byte per pesanan.
--    Sengaja TANPA index trigram: index itu bisa sebesar tabelnya
--    sendiri, sedangkan pencarian berurutan atas puluhan ribu baris
--    masih cepat. Tambahkan nanti bila pencarian terasa lambat.
alter table public.orders
  add column if not exists cari_teks text
  generated always as (
    regexp_replace(
      lower(
        coalesce(external_order_id, '') || ' ' ||
        coalesce(tracking_number, '')   || ' ' ||
        coalesce(buyer_username, '')    || ' ' ||
        coalesce(jsonb_path_query_array(items, '$[*].nama')::text, '')
      ),
      '[^a-z0-9]+', '', 'g'
    )
  ) stored;

commit;


-- ===========================================================
-- Cek hasil (hanya SELECT). Yang diharapkan:
--   - baris 'menunggu_konfirmasi' / 'pengembalian' muncul bila tokonya
--     punya pesanan berstatus itu;
--   - 'lainnya' tinggal raw_status yang memang belum dikenal
--     (mis. PENDING) atau kosong.
-- ===========================================================
select status, raw_status, count(*) as jumlah
from public.orders
group by status, raw_status
order by status, jumlah desc;

-- Kolom pencarian terisi (diharapkan: kosong = 0, contoh berisi
-- nomor pesanan + nama produk tanpa spasi).
select count(*) filter (where cari_teks is null or cari_teks = '') as kosong,
       (select cari_teks from public.orders limit 1)                as contoh
from public.orders;
