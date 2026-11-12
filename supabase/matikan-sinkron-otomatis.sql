-- ===========================================================
-- Infarm CS — MATIKAN sinkron pesanan otomatis (kembali ke manual)
--
-- Sakelar 2. settings.sinkron_pesanan_otomatis = false DAN job pg_cron
-- shopee-orders-per-toko dimatikan, dalam satu transaksi. Tombol
-- "Sinkronkan sekarang" tetap bekerja untuk toko yang sinkron_pesanan =
-- true. Perpanjangan token harian (shopee-tokens-harian) TIDAK terpengaruh.
--
-- SEBELUM MENJALANKAN: tidak ada yang perlu diganti.
-- ===========================================================

select * from public.atur_sinkron_otomatis(false);

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
