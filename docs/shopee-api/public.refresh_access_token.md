# v2.public.refresh_access_token

`POST /api/v2/auth/access_token/get` — perbarui `access_token` yang habis
(umur 4 jam) memakai `refresh_token`.

Dipakai di: `web/lib/shopee/token.ts` (cron `/api/sync/shopee-tokens`).
Jawaban di **akar** → `permintaanMentah()`.

> **Refresh token SEKALI PAKAI.** Setiap panggilan berhasil menerbitkan
> `refresh_token` baru; yang lama hangus. Bila dua proses me-refresh
> bersamaan, salah satunya memakai token yang sudah hangus dan toko bisa
> terputus. Itu sebabnya proyek ini memasang kunci `refreshing_until`.

## Parameter request (body JSON)

| Nama | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `refresh_token` | string | ya | Berlaku 30 hari, sekali pakai |
| `partner_id` | int64 | ya | Ditaruh di body |
| `shop_id` | int64 | tidak* | Isi **salah satu** dari shop_id / merchant_id / supplier_id / user_id; masing-masing di-refresh terpisah |
| `merchant_id`, `supplier_id`, `user_id` | int64 | tidak* | Idem |
| `principal_id` | int64 | tidak | Baru (2026-07-13) |

## Field response yang relevan (di akar)

| Field | Keterangan |
|---|---|
| `access_token` | Baru, berlaku 4 jam |
| `refresh_token` | **Baru** — wajib disimpan, yang lama sudah tidak berlaku |
| `expire_in` | "Dalam detik"; contoh resmi `14400` (= 4 jam). Bertentangan dengan contoh `get_access_token` yang memberi epoch |
| `shop_id`, `partner_id` | Toko yang di-refresh |

## Kode error khas

| Kode | Arti | Toko perlu otorisasi ulang? |
|---|---|---|
| `refresh_token_expired` | Refresh token lewat 30 hari | Ya |
| `error_shop_refresh_token` | Refresh token salah / bukan milik shop_id ini (termasuk yang sudah dipakai) | Ya |
| `shop_access_expired` | Akses ke toko habis (otorisasi 1 tahun berakhir) | Ya |
| `shop_no_linked` | Toko tidak lagi terhubung ke app (dicabut) | Ya |
| `shop_banned` | Akun toko diblokir; izin ditangguhkan sampai toko pulih | Sementara — jangan hapus data |
| `merchant_access_expired`, `merchant_no_linked`, `error_merchant_refresh_token` | Padanan untuk merchant | — |
| `supplier_access_expired`, `supplier_no_linked` | Padanan untuk supplier | — |
| `error_auth` | Contoh galat resmi: "Invalid refresh_token." | Ya |
| `error_param`, `error_server`, `error_network`, `error_data` | Umum — coba ulang, **jangan** nonaktifkan toko | Tidak |

## API Permissions

Hampir semua tipe app, termasuk **Customer Service**. ✅

## Update Log terakhir

2026-07-13 — tambah `principal_id` di request dan response.

## Sumber

https://open.shopee.com/documents/v2/v2.public.refresh_access_token?module=104&type=1
(dibaca 16 Okt 2026)
