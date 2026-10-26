# v2.public.get_shops_by_partner

`GET /api/v2/public/get_shops_by_partner` — daftar toko yang sudah
mengotorisasi app ini, beserta kapan otorisasinya habis.

Dipakai di: `scripts/shopee-sandbox-test.mjs` (perintah `shops`). Endpoint
Public: tanda tangan hanya `partner_id + path + timestamp`, tanpa token.

## Parameter request

| Nama | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `page_size` | int | tidak | Jumlah per halaman (batas atas tidak disebut) |
| `page_no` | int | tidak | Mulai dari 1 |

## Field response yang relevan (di akar, bukan di `response`)

| Field | Keterangan |
|---|---|
| `authed_shop_list[].shop_id` | Toko |
| `authed_shop_list[].region` | Kode wilayah |
| `authed_shop_list[].auth_time` | Kapan toko mengotorisasi |
| `authed_shop_list[].expire_time` | **Kapan otorisasi toko habis** (berbeda dari umur access token) |
| `more` | `true` = masih ada halaman berikutnya |

Nama field afiliasi SIP tidak konsisten: tabel menyebut
`sip_affi_shop_list`, contoh JSON memakai `sip_affi_shops`. Tidak relevan
untuk toko Indonesia lokal.

Berguna untuk pemeriksaan berkala: toko yang hilang dari daftar ini sudah
mencabut otorisasi, walau push `shop_authorization_canceled_push` terlewat.

## Kode error khas

Hanya kode umum (`error_param`, `error_server`, `error_network`,
`error_data`). Contoh galat resmi: `error_auth` — "Invalid partner_id or
shopid."

## API Permissions

Hampir semua tipe app, termasuk **Customer Service**. ✅

## Update Log terakhir

Bagian Update Log di halaman ini tertutup ("More") dan tidak memuat isi saat
dibaca — tanggal tidak tercatat.

## Sumber

https://open.shopee.com/documents/v2/v2.public.get_shops_by_partner?module=104&type=1
(dibaca 16 Okt 2026)
