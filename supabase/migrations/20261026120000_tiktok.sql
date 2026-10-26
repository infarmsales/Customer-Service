-- ===========================================================
-- Infarm CS — TikTok Shop masuk ke marketplace_shops
--
-- 26 Okt 2026. Cara pakai sama dengan berkas lain di supabase/:
-- SQL Editor -> tempel seluruh isi -> Run. Idempoten.
--
-- KENAPA TIDAK MEMBUAT TABEL TOKEN TERSENDIRI
--
-- marketplace_shops sudah dirancang untuk banyak marketplace: tanpa
-- policy RLS (hanya service_role), GRANT dicabut dari anon dan
-- authenticated, dan punya kunci refreshing_until. Tabel kedua untuk
-- TikTok berarti dua tempat token yang harus dijaga sama ketatnya —
-- dan dua tempat yang bisa menyimpang diam-diam.
--
-- DUA PERUBAHAN
--
-- 1. 'tiktok' boleh menjadi nilai kolom platform.
-- 2. Kolom shop_cipher: SETIAP panggilan API toko TikTok (termasuk
--    Customer Service) mewajibkan shop_cipher, dan nilainya hanya
--    didapat dari Get Authorized Shops sesudah otorisasi. Bukan
--    rahasia setara token, tetapi tetap tinggal di tabel tertutup ini.
-- ===========================================================

begin;

-- Nama constraint bawaan PostgreSQL untuk CHECK di kolom platform
-- adalah marketplace_shops_platform_check. Dicari lewat katalog,
-- bukan ditebak, supaya tetap jalan bila namanya pernah berbeda.
do $$
declare
  nama text;
begin
  for nama in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.marketplace_shops'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%platform%'
  loop
    execute format('alter table public.marketplace_shops drop constraint %I', nama);
  end loop;
end $$;

alter table public.marketplace_shops
  add constraint marketplace_shops_platform_check
  check (platform in ('shopee', 'tiktok', 'tokopedia', 'blibli', 'lazada'));

alter table public.marketplace_shops
  add column if not exists shop_cipher text;

comment on column public.marketplace_shops.shop_cipher is
  'TikTok: pengenal toko terenkripsi dari Get Authorized Shops; wajib di setiap panggilan API toko. Kosong untuk platform lain.';

commit;


-- ===========================================================
-- CEK — jalankan sesudah bagian atas berhasil
--
-- Harus: menerima_tiktok = true, ada_shop_cipher = true, dan keempat
-- kolom hak akses tetap false (migrasi ini tidak boleh membuka tabel).
-- ===========================================================

select
  exists (
    select 1 from pg_constraint c
     where c.conrelid = 'public.marketplace_shops'::regclass
       and pg_get_constraintdef(c.oid) ilike '%tiktok%'
  ) as menerima_tiktok,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'marketplace_shops'
       and column_name = 'shop_cipher'
  ) as ada_shop_cipher,
  has_table_privilege('authenticated', 'public.marketplace_shops', 'select') as auth_baca,
  has_table_privilege('authenticated', 'public.marketplace_shops', 'update') as auth_ubah,
  has_table_privilege('anon',          'public.marketplace_shops', 'select') as anon_baca,
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'marketplace_shops') > 0 as ada_policy;
