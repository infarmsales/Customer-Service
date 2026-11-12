-- ===========================================================
-- Infarm CS — sinkron pesanan skala besar: dua sakelar, kunci per
-- toko, job pg_cron per toko, cek kesehatan token
--
-- Branch perbaikan-sinkron-skala-besar (12 Nov 2026). Sesudah
-- 20261012160100_pg_cron.sql dan 20261026120000_tiktok.sql.
--
-- MASALAH YANG DIPECAHKAN
--
-- Toko utama Infarm (3.000–4.000 pesanan/hari) akan diotorisasi lewat
-- akun utama. Kode lama macet selamanya pada sinkron pertama toko
-- sebesar itu, dan job 15 menit akan menariknya terus tanpa ditanya.
--
-- TOMBOL DULU, JADWAL NANTI
--
--   Tombol "Sinkronkan" di Pengaturan ada di SETIAP toko dan bisa dipakai
--   admin kapan saja, untuk toko mana pun. Kapan menyinkronkan adalah
--   keputusan admin. Yang diatur lewat SQL hanya JADWAL otomatisnya:
--
--   1. marketplace_shops.ikut_sinkron_otomatis (per toko, bawaan FALSE)
--        Toko ini ikut ditarik job otomatis. Toko baru — termasuk SETIAP
--        toko dari shop_id_list otorisasi akun utama — tidak pernah ikut
--        jadwal hanya karena baru diotorisasi. Ubah dengan
--        atur_sinkron_otomatis_toko().
--   2. settings.sinkron_pesanan_otomatis (mode jadwal, bawaan FALSE)
--        false = manual. Ubah dengan atur_sinkron_otomatis(), yang
--        sekaligus menyalakan/mematikan job pg_cron — keduanya tidak bisa
--        berbeda keadaan.
--   Job otomatis hanya menarik toko bila KEDUANYA nyala.
--
-- Job 'shopee-tokens-harian' TIDAK disentuh: tetap aktif untuk semua toko,
-- apa pun nilai kedua sakelar.
--
-- ===========================================================
-- SEBELUM MENJALANKAN
-- ===========================================================
--
-- 1. TIDAK ADA yang perlu diganti dalam keadaan normal. URL Vercel dan
--    CRON_SECRET untuk job baru DISALIN OTOMATIS dari job lama
--    'shopee-orders-15m', jadi rahasianya tidak perlu diketik ulang.
--    Hanya bila job lama tidak ada (berkas berhenti dengan pesan galat),
--    isi GANTI_URL_VERCEL dan GANTI_CRON_SECRET di bagian 6.
--
-- 2. Jalankan SEBELUM kode branch ini di-merge/deploy. (Kode baru tetap
--    berjalan tanpa migrasi ini, tetapi tombol Sinkronkan akan gagal
--    menyimpan kunci per toko sampai kolomnya ada.)
--
-- Cara pakai: SQL Editor -> tempel seluruh isi -> Run. Idempoten.
-- ===========================================================

begin;

-- ===========================================================
-- 1. Kolom baru marketplace_shops
-- ===========================================================

alter table public.marketplace_shops
  add column if not exists ikut_sinkron_otomatis        boolean not null default false,
  add column if not exists sinkron_kunci_sampai   timestamptz,
  add column if not exists sinkron_terakhir_pada  timestamptz,
  add column if not exists sinkron_terakhir_status text,
  add column if not exists cek_token_pada         timestamptz,
  add column if not exists cek_token_ok           boolean,
  add column if not exists cek_token_galat        text;

comment on column public.marketplace_shops.ikut_sinkron_otomatis is
  'Sakelar 1: toko ini ikut ditarik job otomatis shopee-orders-per-toko (bila mode otomatis nyala). Tidak memengaruhi tombol Sinkronkan admin. Bawaan false, termasuk toko baru dari otorisasi akun utama. Ubah dengan atur_sinkron_otomatis_toko().';
comment on column public.marketplace_shops.sinkron_kunci_sampai is
  'Kunci sinkron pesanan per toko: proses yang sedang menarik memegangnya sampai waktu ini. Kunci milik fungsi yang mati lepas sendiri (lib/shopee/sinkron.ts).';
comment on column public.marketplace_shops.sinkron_terakhir_status is
  'Hasil panggilan sinkron terakhir: selesai / belum_selesai / galat.';
comment on column public.marketplace_shops.cek_token_pada is
  'Kapan job token harian terakhir mengecek toko ini dengan get_shop_info. Isi jawabannya tidak disimpan.';
comment on column public.marketplace_shops.cek_token_galat is
  'Kode galat cek token terakhir (mis. error_auth). Null bila ok.';


-- ===========================================================
-- 2. Sakelar 2 di settings (pola yang sama dengan jadwal-ai.sql:
--    kolom di baris tunggal id = 1)
-- ===========================================================

alter table public.settings
  add column if not exists sinkron_pesanan_otomatis boolean not null default false;

comment on column public.settings.sinkron_pesanan_otomatis is
  'Sakelar 2: true = job pg_cron shopee-orders-per-toko menarik pesanan tiap 15 menit; false = manual (tombol saja). Ubah HANYA lewat atur_sinkron_otomatis() supaya job ikut berubah. Nilai selain true dianggap manual oleh kode.';


-- ===========================================================
-- 3. Toko mana yang ikut sinkron OTOMATIS — sengaja belum ada
-- ===========================================================
-- Semua toko mulai dengan ikut_sinkron_otomatis = false. Ini TIDAK
-- menghalangi tombol "Sinkronkan" di Pengaturan, yang bisa dipakai admin
-- untuk toko mana pun kapan saja. Sakelar ini baru berarti saat mode
-- otomatis dinyalakan; tandai tokonya waktu itu dengan
-- supabase/atur-sinkron-otomatis-toko.sql.


-- ===========================================================
-- 4. atur_sinkron_otomatis_toko() — sakelar 1
-- ===========================================================

create or replace function public.atur_sinkron_otomatis_toko(p_external_shop_id text, nyala boolean)
returns table (
  id                  uuid,
  shop_name           text,
  external_shop_id    text,
  is_active           boolean,
  ikut_sinkron_otomatis     boolean,
  orders_synced_until timestamptz
)
language plpgsql
security invoker
set search_path = public
as $fn$
#variable_conflict use_column
begin
  if nyala is null then
    raise exception 'nyala harus true atau false, bukan null.';
  end if;

  -- UPDATE dibungkus CTE: RETURN QUERY menuntut kueri berbentuk SELECT.
  return query
    with diubah as (
      update public.marketplace_shops s
         set ikut_sinkron_otomatis = nyala
       where s.platform = 'shopee'
         and s.external_shop_id = trim(p_external_shop_id)
      returning s.id, s.shop_name, s.external_shop_id, s.is_active, s.ikut_sinkron_otomatis, s.orders_synced_until
    )
    select * from diubah;

  if not found then
    raise exception 'Toko Shopee dengan external_shop_id % tidak ditemukan.', p_external_shop_id
      using hint = 'Lihat daftarnya: select shop_name, external_shop_id from public.marketplace_shops where platform = ''shopee'';';
  end if;
end
$fn$;

comment on function public.atur_sinkron_otomatis_toko(text, boolean) is
  'Sakelar 1: satu toko Shopee ikut/tidak ditarik job otomatis. Tombol Sinkronkan admin tidak terpengaruh. Hanya postgres/service_role.';

revoke all on function public.atur_sinkron_otomatis_toko(text, boolean) from public, anon, authenticated;
grant execute on function public.atur_sinkron_otomatis_toko(text, boolean) to service_role;


-- ===========================================================
-- 5. atur_sinkron_otomatis() — sakelar 2 + job pg_cron, satu transaksi
-- ===========================================================
-- security definer (pemilik: postgres) karena cron.alter_job() hanya
-- boleh mengubah job milik pemanggil — dan job dibuat oleh postgres.

create or replace function public.atur_sinkron_otomatis(nyala boolean)
returns table (
  sinkron_pesanan_otomatis boolean,
  job                      text,
  job_aktif                boolean
)
language plpgsql
security definer
set search_path = public
as $fn$
#variable_conflict use_column
declare
  v_job bigint;
begin
  if nyala is null then
    raise exception 'nyala harus true atau false, bukan null.';
  end if;

  select j.jobid into v_job from cron.job j where j.jobname = 'shopee-orders-per-toko';
  if v_job is null then
    raise exception 'Job pg_cron shopee-orders-per-toko belum terpasang. Jalankan migrasi 20261112120000_sinkron_skala_besar.sql dulu.';
  end if;

  update public.settings set sinkron_pesanan_otomatis = nyala, updated_at = now() where id = 1;
  if not found then
    raise exception 'Baris settings (id = 1) tidak ada.';
  end if;

  perform cron.alter_job(job_id := v_job, active := nyala);

  return query
    select s.sinkron_pesanan_otomatis, j.jobname::text, j.active
      from public.settings s, cron.job j
     where s.id = 1 and j.jobid = v_job;
end
$fn$;

comment on function public.atur_sinkron_otomatis(boolean) is
  'Sakelar 2: mode jadwal sinkron pesanan. Mengubah settings.sinkron_pesanan_otomatis DAN job pg_cron shopee-orders-per-toko dalam satu transaksi. Hanya postgres/service_role.';

revoke all on function public.atur_sinkron_otomatis(boolean) from public, anon, authenticated;
grant execute on function public.atur_sinkron_otomatis(boolean) to service_role;


-- ===========================================================
-- 6. Job pg_cron: matikan yang lama, pasang pengganti per toko
-- ===========================================================
-- Job lama memanggil route SEKALI untuk semua toko. Route baru menolak
-- panggilan tanpa ?toko (400, tanpa menyentuh Shopee), jadi job lama
-- dimatikan — bukan dihapus — supaya riwayatnya tetap terlihat.
--
-- Job pengganti memanggil route SEKALI PER TOKO yang ikut_sinkron_otomatis =
-- true. net.http_post hanya mengantre; panggilan per toko berjalan
-- sejajar di Vercel, dan toko besar tidak memakan waktu toko lain.
--
-- timeout_milliseconds = 300000 menyamai maxDuration route. Timeout
-- pg_net (bawaan 2 detik) HANYA berarti pg_net berhenti menunggu dan
-- mencatat jawabannya sebagai timed_out di net._http_response; fungsi
-- Vercel TIDAK ikut berhenti. Nilai panjang dipakai supaya hasil
-- sebenarnya (200 + status) tercatat dan bisa dipantau.

do $blk$
declare
  v_lama     text;
  v_url      text;
  v_rahasia  text;
  v_job      bigint;
  v_perintah text;
begin
  select command into v_lama from cron.job where jobname = 'shopee-orders-15m';

  v_url := coalesce(
    (regexp_match(v_lama, $re$url\s*:=\s*'([^']+?)/api/sync/shopee-orders'$re$))[1],
    'GANTI_URL_VERCEL'
  );
  v_rahasia := coalesce(
    (regexp_match(v_lama, $re$Bearer ([^"\s]+)"$re$))[1],
    'GANTI_CRON_SECRET'
  );
  if v_url like 'GANTI_%' or v_rahasia like 'GANTI_%' or v_url !~ '^https://' then
    raise exception 'Job lama shopee-orders-15m tidak ditemukan atau tidak terbaca. Isi GANTI_URL_VERCEL dan GANTI_CRON_SECRET di bagian 6.';
  end if;

  -- Matikan job lama (bila ada).
  perform cron.alter_job(job_id := j.jobid, active := false)
     from cron.job j where j.jobname = 'shopee-orders-15m';

  v_perintah := format(
    $cmd$
    select net.http_post(
      url     := %L || '/api/sync/shopee-orders?toko=' || s.id::text,
      headers := jsonb_build_object('Authorization', %L, 'Content-Type', 'application/json'),
      body    := '{}'::jsonb,
      timeout_milliseconds := 300000
    )
    from public.marketplace_shops s
    where s.platform = 'shopee' and s.is_active and s.ikut_sinkron_otomatis
    limit 50;
    $cmd$,
    v_url,
    'Bearer ' || v_rahasia
  );

  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'shopee-orders-per-toko';
  v_job := cron.schedule('shopee-orders-per-toko', '*/15 * * * *', v_perintah);

  -- Keadaan job mengikuti sakelar 2. Pada pemasangan pertama sakelar itu
  -- false, jadi job terpasang TIDAK AKTIF. Menjalankan ulang berkas ini
  -- tidak membuat job dan setting berbeda keadaan.
  perform cron.alter_job(
    job_id := v_job,
    active := coalesce((select s.sinkron_pesanan_otomatis from public.settings s where s.id = 1), false)
  );
end
$blk$;

commit;


-- ===========================================================
-- CEK 1 — job: lama mati, pengganti terpasang tapi tidak aktif,
-- token tetap aktif
--
-- Yang diharapkan:
--   shopee-orders-15m       active = false
--   shopee-orders-per-toko  active = false   (selama mode manual)
--   shopee-tokens-harian    active = true
-- ===========================================================
select jobname, schedule, active
from cron.job
where jobname in ('shopee-orders-15m', 'shopee-orders-per-toko', 'shopee-tokens-harian')
order by jobname;


-- ===========================================================
-- CEK 2 — daftar toko; ikut_sinkron_otomatis semuanya false (tombol tetap bisa dipakai)
-- ===========================================================
select shop_name, external_shop_id, is_active, ikut_sinkron_otomatis, orders_synced_until
from public.marketplace_shops
where platform = 'shopee'
order by ikut_sinkron_otomatis desc, shop_name;


-- ===========================================================
-- CEK 3 — mode jadwal manual, fungsi hanya untuk service_role
--
-- Yang diharapkan: sinkron_pesanan_otomatis = false; kedua fungsi
-- anon = false, authenticated = false, service_role = true.
-- ===========================================================
select sinkron_pesanan_otomatis from public.settings where id = 1;

select f.fungsi,
       has_function_privilege('anon',          f.fungsi, 'execute') as anon,
       has_function_privilege('authenticated', f.fungsi, 'execute') as authenticated,
       has_function_privilege('service_role',  f.fungsi, 'execute') as service_role
from (values ('public.atur_sinkron_otomatis_toko(text, boolean)'),
             ('public.atur_sinkron_otomatis(boolean)')) as f(fungsi);
