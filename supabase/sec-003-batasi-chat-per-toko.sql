-- ===========================================================
-- Infarm CS — SEC-003: chat pelanggan tidak lagi terbuka penuh
-- untuk setiap akun yang login
--
-- Temuan audit keamanan 17 Sep 2026 (Notion: Audit Security CS).
--
-- CELAHNYA
--
-- schema.sql memasang satu kebijakan untuk SEMUA aksi:
--
--   create policy conversations_all on public.conversations
--     for all to authenticated using (true) with check (true);
--   create policy escalations_all on public.escalations
--     for all to authenticated using (true) with check (true);
--
-- `for all` itu mencakup select, insert, update, DAN delete. Jadi
-- satu akun CS mana pun bisa:
--
--   * membaca nama pelanggan, nomor pesanan, resi, dan seluruh isi
--     chat dari SEMUA toko (brief menyebut 18 toko),
--   * menimpa riwayat chat percakapan mana pun,
--   * MENGHAPUS percakapan dan eskalasi — permanen, tanpa jejak.
--
-- Halaman Chat menulis langsung ke Supabase dari peramban, jadi
-- yang membatasi hanyalah kebijakan ini. Pemisahan per toko di
-- halaman Chat cuma penyaring tampilan atas shop_name; tidak ada
-- satu pun aturan database di belakangnya.
--
-- APA YANG BERUBAH DAN APA YANG TIDAK
--
-- Berkas ini memecah satu kebijakan `for all` menjadi empat
-- kebijakan terpisah, lalu memperketat yang paling berbahaya:
--
--   select  tetap terbuka untuk seluruh tim CS, KECUALI akun yang
--           sudah ditugaskan ke toko tertentu (lihat di bawah)
--   insert  sama dengan select
--   update  sama dengan select
--   delete  hanya admin — dengan satu pengecualian yang disengaja:
--           percakapan simulasi (customer_id berawalan 'sim_')
--           tetap boleh dihapus siapa pun, karena tombol
--           bersih-bersih di /api/simulasi memang dipakai tim CS
--           saat peragaan dan bukan data pelanggan.
--
-- Yang TIDAK berubah: tim CS tetap bekerja pada satu inbox bersama
-- selama belum ada penugasan toko. Itu memang cara kerja mereka
-- sekarang, dan mengubahnya sepihak akan mematikan halaman Chat
-- untuk semua orang pada hari yang sama berkas ini dijalankan.
--
-- PENUGASAN TOKO — OPSIONAL, MENYALA SENDIRI SAAT DIPAKAI
--
-- Tabel profil_toko memetakan akun -> shop_name. Fungsi
-- boleh_toko() berbunyi begini:
--
--   admin                      -> semua toko
--   akun TANPA baris penugasan -> semua toko (persis seperti hari ini)
--   akun DENGAN penugasan      -> hanya toko yang ditugaskan
--
-- Jadi hari ini tidak ada yang berubah bagi siapa pun. Begitu satu
-- baris penugasan dimasukkan untuk seorang CS, akun itu seketika
-- terbatas — tanpa deploy, tanpa mengubah berkas ini lagi.
--
-- ⚠️ INI MEMANG GAGAL-TERBUKA (fail-open), dan itu pilihan sadar:
-- alternatifnya adalah gagal-tertutup, yang berarti seluruh tim CS
-- kehilangan akses ke seluruh chat sampai 18 toko selesai
-- dipetakan satu per satu. Risiko yang diambil: kalau admin lupa
-- menugaskan, akun itu tetap melihat semua toko. Yang DITUTUP
-- berkas ini tanpa syarat adalah penghapusan data — bagian yang
-- tidak bisa dibatalkan.
--
-- Aman dijalankan berulang kali.
-- ===========================================================

begin;

-- -----------------------------------------------------------
-- 1. profil_toko — akun CS mana memegang toko mana
-- -----------------------------------------------------------
-- shop_name sengaja text, bukan referensi ke tabel toko: tabel itu
-- belum ada, dan nilai yang dipakai halaman Chat memang string
-- ('infarmofficialshop', dll) yang ditulis conversations.shop_name.
-- Salah tulis akan terlihat sebagai "CS tidak melihat chat apa
-- pun", jadi CEK 3 di bawah membandingkannya dengan nilai yang
-- sungguh ada di tabel conversations.

create table if not exists public.profil_toko (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  shop_name  text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, shop_name)
);

comment on table public.profil_toko is
  'SEC-003: toko yang boleh dilihat satu akun CS. Akun tanpa baris di sini melihat SEMUA toko.';

alter table public.profil_toko enable row level security;

-- Akun boleh melihat penugasannya sendiri (halaman Pengguna
-- menampilkannya), admin melihat semua.
drop policy if exists profil_toko_select on public.profil_toko;
create policy profil_toko_select on public.profil_toko
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Hanya admin yang menugaskan. Tanpa ini, seorang CS bisa menghapus
-- baris penugasannya sendiri dan kembali melihat semua toko.
drop policy if exists profil_toko_admin_insert on public.profil_toko;
create policy profil_toko_admin_insert on public.profil_toko
  for insert to authenticated with check (public.is_admin());

drop policy if exists profil_toko_admin_update on public.profil_toko;
create policy profil_toko_admin_update on public.profil_toko
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists profil_toko_admin_delete on public.profil_toko;
create policy profil_toko_admin_delete on public.profil_toko
  for delete to authenticated using (public.is_admin());

grant select, insert, update, delete on public.profil_toko to authenticated;


-- -----------------------------------------------------------
-- 2. boleh_toko() — satu tempat yang memutuskan
-- -----------------------------------------------------------
-- security definer, sama alasannya dengan is_admin(): fungsi ini
-- membaca profil_toko dari DALAM kebijakan profil_toko sendiri.
-- Tanpa definer, pembacaan itu terbentur RLS-nya sendiri.
--
-- shop null -> true. Baris tanpa shop_name adalah data lama dan
-- data peragaan; bukan chat pelanggan satu toko tertentu. Kalau
-- nanti kolom itu diwajibkan, baris ini boleh dihapus.

create or replace function public.boleh_toko(shop text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select
    public.is_admin()
    or shop is null
    or not exists (
      select 1 from public.profil_toko where user_id = auth.uid()
    )
    or exists (
      select 1 from public.profil_toko
      where user_id = auth.uid() and shop_name = shop
    );
$fn$;

comment on function public.boleh_toko(text) is
  'SEC-003: apakah pengguna yang login boleh menyentuh baris milik toko ini. Akun tanpa penugasan boleh semua.';

grant execute on function public.boleh_toko(text) to authenticated;


-- -----------------------------------------------------------
-- 3. conversations — satu kebijakan `for all` dipecah empat
-- -----------------------------------------------------------
-- Kebijakan lama HARUS dibuang. Kebijakan RLS bersifat OR: selama
-- conversations_all masih ada dan berbunyi using (true), kebijakan
-- ketat apa pun di sebelahnya tidak berarti apa-apa.

drop policy if exists conversations_all on public.conversations;

drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select to authenticated
  using (public.boleh_toko(shop_name));

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations
  for insert to authenticated
  with check (public.boleh_toko(shop_name));

-- using  = baris yang boleh disentuh
-- check  = bentuk baris SESUDAH diubah
-- Keduanya diperiksa supaya sebuah baris tidak bisa dipindahkan ke
-- toko lain lewat update shop_name.
drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations
  for update to authenticated
  using (public.boleh_toko(shop_name))
  with check (public.boleh_toko(shop_name));

-- Penghapusan: admin, atau percakapan peragaan.
--
-- Awalan 'sim_' ditulis /api/simulasi (AWALAN_SIMULASI di
-- app/api/simulasi/route.ts) dan dipakai tombol bersih-bersih di
-- halaman Chat. Tanpa pengecualian ini, tombol itu diam-diam
-- menghapus nol baris untuk CS non-admin — gejala RLS yang paling
-- sulit ditelusuri, karena tidak memunculkan galat sama sekali.
drop policy if exists conversations_delete on public.conversations;
create policy conversations_delete on public.conversations
  for delete to authenticated
  using (
    public.is_admin()
    or (customer_id like 'sim\_%' and public.boleh_toko(shop_name))
  );


-- -----------------------------------------------------------
-- 4. escalations — ikut keterlihatan percakapannya
-- -----------------------------------------------------------
-- escalations tidak punya shop_name; penghubungnya conversation_id.
-- Subkueri di bawah dijalankan dengan hak pemanggil, jadi RLS
-- conversations ikut berlaku di dalamnya. Akibatnya aturannya
-- otomatis sinkron: eskalasi terlihat tepat ketika percakapannya
-- terlihat, tanpa menyalin aturan toko ke dua tempat.
--
-- conversation_id null tetap terlihat: kolomnya memang nullable dan
-- baris tanpa percakapan bukan data pelanggan satu toko.

drop policy if exists escalations_all on public.escalations;

drop policy if exists escalations_select on public.escalations;
create policy escalations_select on public.escalations
  for select to authenticated
  using (
    escalations.conversation_id is null
    or exists (
      select 1 from public.conversations c where c.id = escalations.conversation_id
    )
  );

drop policy if exists escalations_insert on public.escalations;
create policy escalations_insert on public.escalations
  for insert to authenticated
  with check (
    escalations.conversation_id is null
    or exists (
      select 1 from public.conversations c where c.id = escalations.conversation_id
    )
  );

drop policy if exists escalations_update on public.escalations;
create policy escalations_update on public.escalations
  for update to authenticated
  using (
    escalations.conversation_id is null
    or exists (
      select 1 from public.conversations c where c.id = escalations.conversation_id
    )
  )
  with check (
    escalations.conversation_id is null
    or exists (
      select 1 from public.conversations c where c.id = escalations.conversation_id
    )
  );

-- Eskalasi percakapan simulasi ikut terhapus lewat
-- `on delete cascade` di definisi tabelnya, jadi tombol
-- bersih-bersih tidak butuh hak delete di sini.
drop policy if exists escalations_delete on public.escalations;
create policy escalations_delete on public.escalations
  for delete to authenticated using (public.is_admin());

commit;


-- ===========================================================
-- CEK 1 — kebijakannya memang terpasang seperti yang dimaksud
--
-- Harus memunculkan 8 baris: 4 conversations + 4 escalations.
-- Yang PALING penting: TIDAK ADA lagi baris bernama
-- conversations_all atau escalations_all. Kalau salah satunya masih
-- ada, seluruh berkas ini tidak berpengaruh apa pun.
-- ===========================================================

select tablename, policyname, cmd, qual is not null as ada_using
from pg_policies
where schemaname = 'public'
  and tablename in ('conversations', 'escalations')
order by tablename, cmd, policyname;


-- ===========================================================
-- CEK 2 — BUKTIKAN penghapusan sudah tertutup (tidak mengubah apa pun)
--
-- Jalankan blok ini TERPISAH, sesudah bagian atas berhasil.
-- Seluruhnya di dalam satu transaksi yang berakhir ROLLBACK.
--
-- Yang dilakukan: sesi menyamar sebagai akun CS biasa, persis
-- seperti permintaan dari peramban, lalu mencoba menghapus satu
-- percakapan pelanggan sungguhan.
--
-- HASIL YANG BENAR : terhapus = 0
-- HASIL YANG SALAH : terhapus = 1 — celah MASIH terbuka
--                    (tetap aman: semuanya di-rollback)
--
-- CATATAN: RLS tidak berlaku bagi pemilik tabel, jadi
-- `set local role authenticated` di bawah WAJIB ada. Tanpa baris
-- itu blok ini selalu "berhasil menghapus" dan hasilnya menipu.
-- ===========================================================

-- begin;
--
-- -- akun non-admin mana pun
-- select set_config('uji.id',
--   (select p.id::text from public.profiles p
--     where p.role <> 'admin' order by p.created_at limit 1), true);
--
-- -- percakapan pelanggan sungguhan (bukan simulasi)
-- select set_config('uji.chat',
--   (select c.id::text from public.conversations c
--     where c.customer_id not like 'sim\_%' limit 1), true);
--
-- select set_config('request.jwt.claim.sub', current_setting('uji.id'), true);
-- select set_config('request.jwt.claims',
--   json_build_object('sub', current_setting('uji.id'),
--                     'role', 'authenticated')::text, true);
-- set local role authenticated;
--
-- with hapus as (
--   delete from public.conversations
--   where id = current_setting('uji.chat')::uuid
--   returning 1
-- )
-- select count(*) as terhapus from hapus;
--
-- rollback;


-- ===========================================================
-- CEK 3 — nama toko yang boleh ditugaskan
--
-- Jalankan ini SEBELUM memasukkan baris ke profil_toko. Nilai
-- shop_name harus persis seperti yang ada di tabel conversations;
-- salah satu huruf saja membuat akun itu tidak melihat chat apa pun
-- dan TIDAK memunculkan galat.
-- ===========================================================

select shop_name, count(*) as jumlah_chat
from public.conversations
group by shop_name
order by jumlah_chat desc;


-- ===========================================================
-- CARA MENUGASKAN SEORANG CS KE SATU TOKO (opsional)
--
-- Selama tidak dijalankan, tidak ada yang berubah bagi siapa pun.
-- ===========================================================

-- insert into public.profil_toko (user_id, shop_name)
-- select p.id, 'infarmofficialshop'
-- from public.profiles p
-- join auth.users u on u.id = p.id
-- where u.email = 'ganti@infarm.co.id'
-- on conflict do nothing;

-- Membatalkan penugasan (akun kembali melihat semua toko):
-- delete from public.profil_toko
-- where user_id = (select id from auth.users where email = 'ganti@infarm.co.id');
