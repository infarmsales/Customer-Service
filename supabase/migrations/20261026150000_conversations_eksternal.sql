-- ===========================================================
-- Infarm CS — conversations: pengenal percakapan marketplace
--
-- 26 Okt 2026. SQL Editor -> tempel seluruh isi -> Run. Idempoten.
--
-- KENAPA
--
-- Sinkronisasi chat TikTok (POST /api/sync/tiktok-chat) dijalankan
-- berulang kali. Tanpa pengenal yang unik, setiap tekanan tombol
-- "Sinkronkan" akan MENAMBAH percakapan yang sama sebagai baris baru.
-- Polanya sama dengan orders: unique (platform, external_order_id).
--
-- NULL tetap boleh dan tidak saling bentrok (di PostgreSQL dua NULL
-- dianggap berbeda), jadi percakapan simulasi dan data lama — yang
-- tidak punya pengenal marketplace — tidak terpengaruh sama sekali.
--
-- RLS conversations tidak disentuh. Baris dari sinkronisasi ditulis
-- oleh service_role dan dibaca console lewat kebijakan yang sudah ada.
-- ===========================================================

begin;

alter table public.conversations
  add column if not exists external_conversation_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.conversations'::regclass
       and conname = 'conversations_platform_external_unik'
  ) then
    alter table public.conversations
      add constraint conversations_platform_external_unik
      unique (platform, external_conversation_id);
  end if;
end $$;

comment on column public.conversations.external_conversation_id is
  'Id percakapan di marketplace (TikTok: conversation id). Null untuk simulasi & data lama. Unik bersama platform.';

commit;


-- ===========================================================
-- CEK — harus: ada_kolom = true, ada_unik = true
-- ===========================================================

select
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'conversations'
       and column_name = 'external_conversation_id'
  ) as ada_kolom,
  exists (
    select 1 from pg_constraint
     where conrelid = 'public.conversations'::regclass
       and conname = 'conversations_platform_external_unik'
  ) as ada_unik;
