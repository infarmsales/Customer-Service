-- ===========================================================
-- Infarm CS — retensi pesanan: bersihkan_pesanan_lama()
--
-- Branch perbaikan-sinkron-skala-besar (12 Nov 2026). Sesudah
-- 20261112120000_sinkron_skala_besar.sql.
--
-- DESTRUKTIF — DAN KARENA ITU AMAN SECARA BAWAAN
--
--   select * from public.bersihkan_pesanan_lama();          -- HANYA MENGHITUNG
--   select * from public.bersihkan_pesanan_lama(60, true);  -- benar-benar menghapus
--
-- Bawaannya dry run: hanya menghitung berapa baris yang AKAN dihapus.
-- Menghapus baru terjadi bila jalankan = true, dan paling banyak 5.000
-- baris per bagian per panggilan supaya tidak mengunci tabel lama.
--
-- YANG DISENTUH
--   orders      HANYA status 'selesai' dan 'dibatalkan' yang
--               order_updated_at-nya lebih tua dari N hari. Pesanan yang
--               masih berjalan (perlu dikirim, dalam pengiriman, retur,
--               lainnya) TIDAK PERNAH dihapus, berapa pun umurnya. Baris
--               dengan order_updated_at kosong juga tidak.
--               orders_raw milik pesanan itu ikut terhapus (on delete cascade).
--   orders_raw  jawaban mentah yang lebih tua dari 7 hari (hanya untuk debug).
--
-- Pesanan yang terhapus akan muncul lagi bila Shopee mengubahnya dan
-- sinkronisasi menariknya ulang — sumber kebenarannya tetap marketplace.
--
-- SEBELUM MENJALANKAN: tidak ada yang perlu diganti.
-- Cara pakai: SQL Editor -> tempel seluruh isi -> Run. Idempoten.
-- Berkas ini HANYA membuat fungsi; tidak menghapus apa pun.
-- ===========================================================

begin;

create or replace function public.bersihkan_pesanan_lama(hari int default 60, jalankan boolean default false)
returns table (
  bagian    text,
  kandidat  bigint,
  dihapus   bigint
)
language plpgsql
security invoker
set search_path = public
as $fn$
#variable_conflict use_column
declare
  c_per_panggilan constant int := 5000;
  v_batas         timestamptz;
  v_n             bigint;
  v_hapus         bigint := 0;
  v_raw_n         bigint;
  v_raw_hapus     bigint := 0;
begin
  -- Pagar terhadap salah ketik (mis. 6 alih-alih 60).
  if hari is null or hari < 30 then
    raise exception 'hari minimal 30 (diberikan: %).', hari;
  end if;
  if jalankan is null then
    raise exception 'jalankan harus true atau false, bukan null.';
  end if;

  v_batas := now() - make_interval(days => hari);

  select count(*) into v_n
    from public.orders o
   where o.status in ('selesai', 'dibatalkan')
     and o.order_updated_at < v_batas;

  select count(*) into v_raw_n
    from public.orders_raw r
   where r.synced_at < now() - interval '7 days';

  if jalankan then
    with korban as (
      select o.id
        from public.orders o
       where o.status in ('selesai', 'dibatalkan')
         and o.order_updated_at < v_batas
       order by o.order_updated_at
       limit c_per_panggilan
    )
    delete from public.orders o using korban k where o.id = k.id;
    get diagnostics v_hapus = row_count;

    with korban as (
      select r.order_id
        from public.orders_raw r
       where r.synced_at < now() - interval '7 days'
       order by r.synced_at
       limit c_per_panggilan
    )
    delete from public.orders_raw r using korban k where r.order_id = k.order_id;
    get diagnostics v_raw_hapus = row_count;
  end if;

  return query values
    (format('orders: selesai/dibatalkan > %s hari', hari), v_n, v_hapus),
    ('orders_raw: > 7 hari'::text, v_raw_n, v_raw_hapus);
end
$fn$;

comment on function public.bersihkan_pesanan_lama(int, boolean) is
  'Retensi: bawaan HANYA menghitung. jalankan = true menghapus paling banyak 5.000 baris per bagian per panggilan. Hanya status selesai/dibatalkan > N hari (min 30) dan orders_raw > 7 hari. Hanya postgres/service_role.';

revoke all on function public.bersihkan_pesanan_lama(int, boolean) from public, anon, authenticated;
grant execute on function public.bersihkan_pesanan_lama(int, boolean) to service_role;

commit;


-- ===========================================================
-- CEK — dry run (tidak menghapus apa pun)
-- ===========================================================
select * from public.bersihkan_pesanan_lama();


-- ===========================================================
-- JADWAL HARIAN — SENGAJA DIKOMENTARI
--
-- Nyalakan HANYA setelah melihat hasil dry run di atas dan yakin
-- angkanya masuk akal. 21.30 UTC = 04.30 WIB, sesudah job token
-- (03.00 WIB). Satu panggilan menghapus paling banyak 5.000 pesanan;
-- kalau toko besar menyelesaikan lebih dari itu per hari, jadwalkan
-- lebih sering (mis. '30 * * * *' = tiap jam).
--
-- select cron.schedule(
--   'bersihkan-pesanan-harian',
--   '30 21 * * *',
--   $job$ select * from public.bersihkan_pesanan_lama(60, true); $job$
-- );
--
-- Mematikannya lagi:
-- select cron.unschedule('bersihkan-pesanan-harian');
-- ===========================================================
