# v2.public.get_access_token

`POST /api/v2/auth/token/get` — tukar `code` dari redirect otorisasi menjadi
`access_token` + `refresh_token`.

Dipakai di: callback `web/app/shopee/callback/route.ts` lewat
`web/lib/shopee/token.ts`. Jawaban dibaca lewat `permintaanMentah()` karena
isinya di **akar**, bukan di dalam `response`.

Endpoint Public: tanda tangan **tanpa** `access_token` dan `shop_id`
(`partner_id + path + timestamp`). `partner_id` juga dikirim di body JSON.

## Parameter request (body JSON)

| Nama | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `code` | string | ya | Dari URL redirect. **Sekali pakai, kedaluwarsa 10 menit** |
| `partner_id` | int64 | ya | ID app |
| `shop_id` | int64 | tidak | Untuk otorisasi satu toko |
| `main_account_id` | int64 | tidak | Untuk otorisasi lewat akun utama |

Catatan: dokumentasi menandai `shop_id` dan `main_account_id` sama-sama
opsional, tetapi kode error `invalid_shop_id` / `invalid_main_acount_id`
menunjukkan salah satunya diharapkan cocok dengan `code`.

## Field response yang relevan (di akar)

| Field | Keterangan |
|---|---|
| `access_token` | Bisa dipakai berkali-kali, **berlaku 4 jam** |
| `refresh_token` | Berlaku **30 hari**, per shop_id/merchant_id |
| `expire_in` | Disebut "masa berlaku dalam detik", tetapi contoh resminya bernilai **1767001812 (sebuah epoch)**. Lihat `hitungKedaluwarsaToken()` di `web/lib/shopee/otorisasi.ts` |
| `shop_id_list` | Semua toko yang diotorisasi kali ini |
| `merchant_id_list`, `supplier_id_list`, `user_id_list`, `principal_id_list` | Untuk otorisasi selain toko |

## Kode error khas

| Kode | Arti |
|---|---|
| `invalid_code` | `code` kedaluwarsa, sudah dipakai, atau salah |
| `invalid_shop_id` | `code` dan `shop_id` tidak cocok |
| `invalid_main_acount_id` | `code` dan `main_account_id` tidak cocok (ejaan resmi memang `acount`) |
| `error_auth` | Contoh galat resmi: "Invalid code" |
| `error_param`, `error_server`, `error_network`, `error_data` | Umum |

## API Permissions

Hampir semua tipe app, termasuk **Customer Service**. ✅

## Update Log terakhir

2026-07-13 — tambah `principal_id_list` di response.

## Sumber

https://open.shopee.com/documents/v2/v2.public.get_access_token?module=104&type=1
(dibaca 16 Okt 2026)
