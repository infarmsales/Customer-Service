-- ===========================================================
-- Infarm CS — service_role boleh menulis conversations
--
-- 26 Okt 2026. SQL Editor -> tempel seluruh isi -> Run. Idempoten.
--
-- KENAPA
--
-- Sinkronisasi chat TikTok (lib/tiktok/sinkronChat.ts) menulis ke
-- conversations lewat service_role, dan ditolak:
--
--   permission denied for table conversations
--
-- service_role melewati RLS, tetapi TIDAK melewati GRANT. Tabel di
-- proyek ini dibuat lewat SQL Editor, jadi tidak mendapat GRANT
-- bawaan Supabase (lihat grants.sql), dan grants.sql hanya memberi
-- hak ke authenticated. Sebelum 26 Okt 2026 tidak ada kode server
-- yang menulis ke conversations, sehingga lubang ini tidak pernah
-- terlihat. marketplace_shops dan orders sudah memberi GRANT ke
-- service_role di migrasinya sendiri; ini menyamakan conversations.
--
-- SENGAJA tanpa DELETE: sinkronisasi hanya membaca, menambah, dan
-- memperbarui. Hak yang tidak dipakai tidak diberikan.
--
-- Tidak mengubah hak authenticated maupun anon, dan tidak mengubah
-- kebijakan RLS apa pun.
-- ===========================================================

grant select, insert, update on public.conversations to service_role;


-- ===========================================================
-- CEK — harus: sr_baca, sr_tambah, sr_ubah = true; sr_hapus = false
-- ===========================================================

select
  has_table_privilege('service_role', 'public.conversations', 'select') as sr_baca,
  has_table_privilege('service_role', 'public.conversations', 'insert') as sr_tambah,
  has_table_privilege('service_role', 'public.conversations', 'update') as sr_ubah,
  has_table_privilege('service_role', 'public.conversations', 'delete') as sr_hapus;
