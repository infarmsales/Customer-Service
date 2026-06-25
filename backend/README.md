# Infarm CS — Backend (AI Engine)

Server Node.js + Express yang menghubungkan dashboard ke **Claude API**, sesuai bagian *Tech Stack* di `claude.md`.

Isi dari `claude.md` dipakai sebagai **system prompt**, ditambah ringkasan `products.json` dan `faq-cs.md` sebagai Knowledge Base (Layer 4, Opsi A — inject ke prompt).

## Cara Menjalankan

> Prasyarat: **Node.js 20+** harus sudah terinstall. Cek dengan `node -v`.
> Kalau belum ada, install dari https://nodejs.org (pilih versi LTS).

```bash
# 1. Masuk ke folder backend
cd backend

# 2. Install dependency
npm install

# 3. Siapkan konfigurasi
copy .env.example .env       # (Windows)  — lalu isi ANTHROPIC_API_KEY
# cp .env.example .env       # (Mac/Linux)

# 4. Jalankan server
npm run dev                  # mode dev (auto-reload)
# atau: npm start
```

Buka: http://localhost:3000/dashboard.html

## Endpoint

| Method | Path | Fungsi |
|---|---|---|
| GET  | `/api/health` | Cek status server & konfigurasi Claude |
| POST | `/api/chat` | Kirim pesan pelanggan → dapat balasan + klasifikasi aksi |
| POST | `/api/webhook/:platform` | Placeholder webhook marketplace (Layer 2) |

### Contoh `POST /api/chat`

Request:
```json
{
  "message": "Dosis POC Buah buat tomat berapa ya kak?",
  "history": []
}
```

Response:
```json
{
  "action": "AUTO_REPLY",
  "reply": "Untuk tomat, POC Buah Infarm dipakai 2 ml per 1 liter air ya, Kak...",
  "model": "claude-sonnet-4-6",
  "usage": { "input_tokens": 1234, "output_tokens": 88 }
}
```

`action` selalu salah satu dari 4 klasifikasi di `claude.md`:
`AUTO_REPLY`, `ASK_INFORMATION`, `HANDOVER_TO_CS`, `CHECK_ORDER_SYSTEM`.

## Hubungkan ke Dashboard

File `dashboard.js` sudah punya fungsi `askClaude()` yang otomatis dipakai tombol
**✨ (Minta saran AI)** bila backend hidup. Jika backend mati, dashboard memakai
data contoh (mock) sehingga tetap bisa didemокan tanpa API key.

## Catatan

- Untuk KB besar, ganti Opsi A → **RAG/pgvector** (lihat Tech Stack di `claude.md`).
- `.env` berisi rahasia — sudah masuk `.gitignore`, jangan di-commit.
