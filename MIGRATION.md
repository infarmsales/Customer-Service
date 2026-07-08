# MIGRATION.md — Migrasi ke Next.js + Supabase + Vercel

> Versi: 1.0 | Dibuat: 08 Juli 2026
> Acuan perilaku AI: `claude.md`, `sop.md` — tidak berubah selama migrasi, hanya berpindah tempat baca.
> Acuan pengujian: `TEST-PLAN-SINKRONISASI.md` — dijalankan penuh setelah Fase 3 (Supabase aktif).

---

## 1. Target Arsitektur

```
[Supabase]  <──────────────►  [Next.js — Application Server]
 Database                        Backend: API Routes (Node.js)
                                  Frontend: React + TypeScript + Tailwind CSS
                                        │
                                        ▼
                                   [GitHub]  ──►  [Vercel]  ──►  AI Customer Service
                                Version control   Cloud Deploy      (Infarm.id)

Local Development: VS Code + Claude Code (sudah berjalan sekarang)
```

Satu aplikasi Next.js menggantikan dua bagian terpisah yang ada sekarang (halaman statis HTML/CSS/JS + `backend/` Express).

## 2. Pemetaan: Sekarang → Nanti

| Sekarang | Menjadi |
|---|---|
| `index.html`, `dashboard.html`, `beranda.html`, `pesanan.html`, `ai.html`, `broadcast.html`, `statistik.html`, `settings.html` | Route React di `app/(...)/page.tsx` |
| `dashboard.css`, `*.css` per halaman | Tailwind classes + `tailwind.config` (token warna dari `claude.md`) |
| `dashboard.js`, `pesanan.js`, `ai.js`, `broadcast.js`, `statistik.js`, `settings.js`, `rail.js` | Komponen React + hooks (`useState`, custom hooks) |
| `backend/server.js` (Express) | `app/api/*/route.ts` (Next.js API Routes) |
| `backend/knowledge.js` | Modul server (`lib/knowledge.ts`) — logika sama, load `claude.md` + `sop.md` + `products.json` + `faq-cs.md` |
| Data mock (`CONVERSATIONS`, `REVIEWS`, dll di tiap `*.js`) | Tabel Supabase (`conversations`, `escalations`, dll) |
| Login hardcode (`Infarm.sales` / `123Infarm`) | Supabase Auth |
| `localStorage` (pengaturan AI di Settings) | Tabel Supabase (1 sumber kebenaran untuk semua admin) |
| Badge unread dummy (`rail.js`) | Query realtime Supabase |

## 3. Prasyarat Sebelum Mulai

- [ ] **Install Node.js LTS** (belum terpasang — cek dengan `node -v`)
- [x] Git sudah terpasang (`git version 2.54.0`)
- [ ] Buat akun & repo **GitHub**
- [ ] Buat project **Supabase** (gratis) — catat `Project URL` + `anon key`
- [ ] Buat akun **Vercel**, hubungkan ke GitHub
- [ ] API key **Anthropic** (`ANTHROPIC_API_KEY`) — sudah ada saldo $5 di console.anthropic.com

---

## 4. Tahapan Migrasi

### Fase 0 — Checkpoint Aman
- [ ] `git init` di root proyek → commit kondisi sekarang apa adanya (rollback point).
- [ ] Push ke repo GitHub baru.
- [ ] **Jangan hapus file HTML/CSS/JS lama** sampai migrasi selesai — dipakai sebagai referensi visual & fallback yang tetap bisa dibuka manual.

### Fase 1 — Scaffold Next.js
```bash
npx create-next-app@latest web --typescript --tailwind --app
```
- [ ] Struktur folder: `web/app/`, `web/app/api/`, `web/lib/`, `web/components/`
- [ ] Isi `tailwind.config.ts` dengan palet hijau dari `claude.md`:
  ```ts
  colors: {
    green: { DEFAULT: '#16a34a', hover: '#128a3e', dark: '#15803d', soft: '#f4fbf6', mint: '#ecfdf3' },
    page: '#eef7f0',
  }
  ```
- [ ] Buat komponen layout bersama: `<TopBar>`, `<Rail>` (sidebar ikon), `<Toast>` — dipakai di semua halaman via `app/(dashboard)/layout.tsx`.

### Fase 2 — Pindahkan AI Engine Lebih Dulu (paling kritikal, dikerjakan sedini mungkin)
- [ ] `app/api/chat/route.ts` — port logika dari `backend/server.js` + `backend/knowledge.js`:
  - Muat `claude.md` + `sop.md` + ringkasan `products.json` + `faq-cs.md` sebagai system prompt
  - Panggil Claude API (`@anthropic-ai/sdk`)
  - Kembalikan `{ action, reply, usage }`
- [ ] Uji endpoint ini **berdiri sendiri** (Postman/curl) sebelum disambungkan ke UI apa pun.
- [ ] `ANTHROPIC_API_KEY` → `.env.local` (lokal) dan **Vercel Project Settings → Environment Variables** (produksi). Tidak pernah ditaruh di kode/commit.

### Fase 3 — Supabase (Database & Auth)
- [ ] Buat tabel sesuai skema di `claude.md` bagian Tech Stack:
  - `conversations` (id, platform, customer_id, order_id, messages JSONB, action, handover_summary, timestamps)
  - `escalations` (id, conversation_id, reason, status, assigned_to, created_at)
- [ ] Aktifkan **Supabase Realtime** pada kedua tabel (dasar untuk sinkronisasi multi-admin).
- [ ] Ganti login hardcode → **Supabase Auth** (email/password untuk tiap admin).
- [ ] Pindahkan pengaturan AI (Settings) dari `localStorage` → tabel `settings` (1 baris, dibaca semua admin).

> Setelah fase ini selesai, **`TEST-PLAN-SINKRONISASI.md` baru bisa dijalankan secara nyata** (sebelumnya terhalang karena data masih mock per-browser).

### Fase 4 — Migrasi Halaman (satu per satu, urutan dari risiko rendah → tinggi)
1. **Statistik** — banyak tampilan (chart), sedikit state → pemanasan
2. **Beranda** — mirip, banyak kartu statis
3. **Settings** — form + toggle, state sederhana
4. **Broadcast** — form + tabel per marketplace
5. **Pesanan** — 3 sub-tab + aksi massal (checklist, approve/reject)
6. **AI Chatbot** — panel uji coba yang sudah manggil `/api/chat`
7. **Dashboard (Chat)** — paling kompleks: realtime, pencarian massal, modal integrasi toko → dikerjakan **terakhir**

Setiap halaman dianggap selesai migrasi bila:
- [ ] Tampilan visual setara dengan versi HTML lama
- [ ] Semua interaksi (tombol, filter, modal) berfungsi
- [ ] Data berasal dari Supabase/API, bukan array mock

### Fase 5 — Integrasi GitHub → Vercel
- [ ] Push branch migrasi ke GitHub.
- [ ] Import project di Vercel, hubungkan ke repo.
- [ ] Set semua environment variables di Vercel (Anthropic key, Supabase URL/key).
- [ ] Tiap `git push` ke `main` → auto-deploy preview/production.

### Fase 6 — Uji & Cutover
- [ ] Jalankan penuh **`TEST-PLAN-SINKRONISASI.md`** dengan 3 admin nyata di Supabase Realtime.
- [ ] Bandingkan sisi-bersisi: halaman lama (HTML) vs halaman baru (Next.js) untuk tiap sub-tab.
- [ ] Setelah semua kasus **Kritikal** pada test plan lulus → arahkan domain produksi ke Vercel.
- [ ] Arsipkan (jangan hapus) file HTML/CSS/JS lama ke folder `legacy/` sebagai referensi historis.

---

## 5. Prinsip Keamanan Migrasi

1. **Tidak big-bang** — migrasi per halaman, app lama tetap bisa dibuka sampai penggantinya lulus uji.
2. **AI Engine dipindah paling awal** dan diuji terpisah dari UI — bagian paling berisiko diberi waktu paling banyak.
3. **Supabase disiapkan sebelum migrasi halaman** — supaya halaman React langsung pakai data nyata, tidak dua kali kerja (mock → real).
4. **Setiap fase = commit git terpisah** — mudah rollback bila ada regresi.
5. **Rahasia (API key, Supabase key) tidak pernah masuk kode/commit** — selalu lewat environment variables.
6. **Aturan `claude.md` & `sop.md` tidak diubah** selama migrasi — hanya berpindah cara dibaca (dari `fs.readFileSync` di Express, menjadi hal yang sama di API Route Next.js).

## 6. Estimasi Waktu (kerja santai, 1 orang)

| Fase | Estimasi |
|---|---|
| 0 — Checkpoint | 0.5 hari |
| 1 — Scaffold Next.js | 1 hari |
| 2 — AI Engine | 1 hari |
| 3 — Supabase & Auth | 1–2 hari |
| 4 — Migrasi 8 halaman | 7–10 hari |
| 5 — GitHub → Vercel | 0.5 hari |
| 6 — Uji & cutover | 1–2 hari |
| **Total** | **~2–3 minggu** |

## 7. Status Saat Ini

- [ ] Node.js terinstall di mesin pengembangan
- [ ] Repo GitHub dibuat
- [ ] Project Supabase dibuat
- [ ] Project Vercel dihubungkan
- [ ] Fase 0 dimulai

---

*Dokumen ini adalah panduan migrasi arsitektur. Perbarui checklist di atas seiring progres; jangan hapus fase yang sudah selesai — beri tanda centang agar riwayat migrasi tetap terlihat.*
