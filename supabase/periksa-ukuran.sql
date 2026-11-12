-- ===========================================================
-- Infarm CS — periksa ukuran database (HANYA SELECT)
--
-- Jalankan sebelum menyalakan sinkron toko besar, lalu berkala
-- (mis. seminggu sekali) sesudahnya. Tidak mengubah apa pun.
--
-- SEBELUM MENJALANKAN: tidak ada yang perlu diganti. Batas 500 MB =
-- paket Supabase Free; ubah angka 500 di bagian 5 bila paketnya lain.
-- ===========================================================


-- 1. Jumlah pesanan per toko
select coalesce(s.shop_name, s.external_shop_id) as toko,
       s.sinkron_pesanan,
       count(o.id)                                              as pesanan,
       count(o.id) filter (where o.order_created_at > now() - interval '7 days') as dibuat_7_hari,
       min(o.order_created_at)                                  as tertua,
       max(o.order_updated_at)                                  as terbaru
from public.marketplace_shops s
left join public.orders o on o.shop_id = s.id
where s.platform = 'shopee'
group by s.id, s.shop_name, s.external_shop_id, s.sinkron_pesanan
order by pesanan desc;


-- 2. Ukuran tabel utama (data + index + TOAST) dan perkiraan dead tuple
select c.relname                                          as tabel,
       pg_size_pretty(pg_total_relation_size(c.oid))      as ukuran_total,
       pg_total_relation_size(c.oid)                      as byte,
       st.n_live_tup                                      as baris_hidup,
       st.n_dead_tup                                      as dead_tuple,
       round(100.0 * st.n_dead_tup / nullif(st.n_live_tup + st.n_dead_tup, 0), 1) as persen_dead,
       st.last_autovacuum
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join pg_stat_user_tables st on st.relid = c.oid
where c.relname in ('orders', 'orders_raw', 'conversations', 'marketplace_shops')
order by pg_total_relation_size(c.oid) desc;


-- 3. Byte per pesanan (orders + orders_raw dibagi jumlah pesanan)
select count(*)                                                        as pesanan,
       pg_size_pretty(pg_total_relation_size('public.orders'))         as orders,
       pg_size_pretty(pg_total_relation_size('public.orders_raw'))     as orders_raw,
       round((pg_total_relation_size('public.orders')
            + pg_total_relation_size('public.orders_raw'))::numeric
            / nullif(count(*), 0))                                     as byte_per_pesanan
from public.orders;


-- 4. Ukuran seluruh database
select pg_size_pretty(pg_database_size(current_database())) as ukuran_database,
       pg_database_size(current_database())                 as byte;


-- 5. Perkiraan berapa hari lagi sampai 500 MB, dengan laju pesanan
--    BARU 7 hari terakhir. Perkiraan kasar: belum memperhitungkan
--    retensi, dead tuple, atau pertumbuhan tabel lain. null = belum
--    ada pesanan 7 hari terakhir (laju nol).
with laju as (
  select count(*) / 7.0 as pesanan_per_hari
  from public.orders
  where order_created_at > now() - interval '7 days'
),
ukuran as (
  select (pg_total_relation_size('public.orders') + pg_total_relation_size('public.orders_raw'))::numeric
         / nullif((select count(*) from public.orders), 0) as byte_per_pesanan,
         pg_database_size(current_database())::numeric   as terpakai,
         500 * 1024 * 1024::numeric                      as batas
)
select round(l.pesanan_per_hari)                                        as pesanan_per_hari,
       pg_size_pretty(round(l.pesanan_per_hari * u.byte_per_pesanan)::bigint) as tumbuh_per_hari,
       pg_size_pretty((u.batas - u.terpakai)::bigint)                   as sisa,
       round((u.batas - u.terpakai) / nullif(l.pesanan_per_hari * u.byte_per_pesanan, 0)) as hari_lagi_sampai_penuh
from laju l, ukuran u;
