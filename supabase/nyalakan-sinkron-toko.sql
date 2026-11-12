-- ===========================================================
-- Infarm CS — nyalakan / matikan sinkron pesanan SATU toko
--
-- Sakelar 1 (marketplace_shops.sinkron_pesanan). Toko yang dimatikan
-- tetap terhubung dan tokennya tetap diperpanjang tiap hari.
--
-- ⚠️  SEBELUM MENYALAKAN TOKO BESAR (ribuan pesanan/hari):
--     1. Jalankan supabase/periksa-ukuran.sql. Toko besar menambah
--        ±1–3 KB per pesanan; database Free (500 MB) bisa penuh dalam
--        beberapa minggu. Pastikan paket database cukup, atau fungsi
--        retensi bersihkan_pesanan_lama() sudah terjadwal.
--     2. Pastikan SHOPEE_SIMPAN_RAW di Vercel = galat (bawaan) atau off,
--        BUKAN semua.
--     3. Sinkron pertama menarik 1 hari ke belakang, dicicil per jam.
--        Tekan "Sinkronkan sekarang" dan biarkan halaman Pengaturan
--        terbuka sampai statusnya "selesai".
--
-- SEBELUM MENJALANKAN: ganti GANTI_SHOP_ID dengan external_shop_id toko
-- (lihat kueri CEK 3 di bawah, atau kartu toko di Pengaturan).
-- ===========================================================

-- Nyalakan:
select * from public.atur_sinkron_toko('GANTI_SHOP_ID', true);

-- Mematikan lagi (hapus tanda -- di depan):
-- select * from public.atur_sinkron_toko('GANTI_SHOP_ID', false);

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
select shop_name, external_shop_id, is_active, sinkron_pesanan,
       orders_synced_until, sinkron_terakhir_pada, sinkron_terakhir_status,
       cek_token_pada, cek_token_ok, cek_token_galat
from public.marketplace_shops
where platform = 'shopee'
order by sinkron_pesanan desc, shop_name;

-- 4. Lima panggilan pg_net terakhir. status_code 200 + "dilewati_..." itu
--    normal; 401 = CRON_SECRET tidak cocok; timed_out = pg_net berhenti
--    menunggu (fungsi Vercel tetap berjalan).
select created, status_code, timed_out, error_msg, left(content::text, 200) as isi
from net._http_response
order by created desc
limit 5;
