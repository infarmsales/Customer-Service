-- ===========================================================
-- Infarm CS — toko mana yang ikut sinkron OTOMATIS
--
-- Sakelar 1 (marketplace_shops.ikut_sinkron_otomatis). HANYA mengatur
-- job terjadwal tiap 15 menit — dan job itu baru jalan bila mode
-- otomatis juga dinyalakan (nyalakan-sinkron-otomatis.sql).
--
-- Tombol "Sinkronkan" di Pengaturan TIDAK terpengaruh berkas ini: setiap
-- toko tetap bisa disinkronkan manual kapan saja. Toko yang tidak ikut
-- otomatis tetap terhubung dan tokennya tetap diperpanjang tiap hari.
--
-- ⚠️  SEBELUM TOKO BESAR (ribuan pesanan/hari) IKUT OTOMATIS:
--     1. Jalankan supabase/periksa-ukuran.sql. Toko besar menambah
--        ±1–3 KB per pesanan; database Free (500 MB) bisa penuh dalam
--        beberapa minggu. Pastikan paket database cukup, atau fungsi
--        retensi bersihkan_pesanan_lama() sudah terjadwal.
--     2. Pastikan SHOPEE_SIMPAN_RAW di Vercel = galat (bawaan) atau off,
--        BUKAN semua.
--     3. Sinkronkan toko itu SEKALI lewat tombol dulu sampai "selesai",
--        supaya job otomatis tinggal mengejar 15 menit terakhir.
--
-- SEBELUM MENJALANKAN: ganti GANTI_SHOP_ID dengan external_shop_id toko
-- (lihat kueri CEK 3 di bawah, atau baris "shop_id" di kartu toko).
-- ===========================================================

-- Ikut sinkron otomatis:
select * from public.atur_sinkron_otomatis_toko('GANTI_SHOP_ID', true);

-- Keluarkan lagi dari sinkron otomatis (hapus tanda -- di depan):
-- select * from public.atur_sinkron_otomatis_toko('GANTI_SHOP_ID', false);

-- ===========================================================
-- CEK — keadaan sesudah perubahan
-- ===========================================================

-- 1. Mode jadwal (sakelar 2)
select sinkron_pesanan_otomatis from public.settings where id = 1;

-- 2. Job pg_cron. shopee-orders-per-toko harus SAMA dengan nilai di atas;
--    shopee-tokens-harian harus SELALU active = true.
select jobname, schedule, active
from cron.job
where jobname in ('shopee-orders-15m', 'shopee-orders-per-toko', 'shopee-tokens-harian')
order by jobname;

-- 3. Toko + sakelar 1
select shop_name, external_shop_id, is_active, ikut_sinkron_otomatis,
       orders_synced_until, sinkron_terakhir_pada, sinkron_terakhir_status,
       cek_token_pada, cek_token_ok, cek_token_galat
from public.marketplace_shops
where platform = 'shopee'
order by ikut_sinkron_otomatis desc, shop_name;

-- 4. Lima panggilan pg_net terakhir. status_code 200 + "dilewati_..." itu
--    normal; 401 = CRON_SECRET tidak cocok; timed_out = pg_net berhenti
--    menunggu (fungsi Vercel tetap berjalan).
select created, status_code, timed_out, error_msg, left(content::text, 200) as isi
from net._http_response
order by created desc
limit 5;
