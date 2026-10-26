# shop_authorization_canceled_push (kode 2)

Push saat sebuah toko, merchant, atau user **mencabut otorisasi** app ini —
termasuk karena otorisasi kedaluwarsa atau toko dibekukan.

Relevan untuk `marketplace_shops`: saat push ini datang, toko harus ditandai
nonaktif dan cron sinkronisasi berhenti memanggil API untuknya (kalau tidak,
setiap panggilan akan gagal dengan galat izin).

## Sifat pengiriman

| Properti | Nilai |
|---|---|
| Kode | 2 |
| Batas waktu jawab | 3 detik |
| Urutan dijamin | Tidak |
| Bisa terkirim ganda | Ya |
| Jadwal ulang | 300 dtk, 1800 dtk, 10800 dtk |

## Isi push

Berbeda dari push lain: **tidak ada `shop_id` di akar**; yang ada
`partner_id`.

| Field | Keterangan |
|---|---|
| `partner_id` | App kita |
| `code` (=2), `timestamp` | |
| `data.shop_id` / `data.shop_id_list` | Toko yang dicabut (opsional, salah satu) |
| `data.merchant_id` / `data.merchant_id_list` | Merchant yang dicabut (opsional) |
| `data.user_id` / `data.user_id_list` | User yang dicabut (opsional) |
| `data.main_account_id` | Bila pencabutan lewat akun utama |
| `data.authorize_type` | Sebabnya, mis. `user cancel shop authorization`, `expiry`, `App status is abnormal`, `shop and main account is disconnected` |
| `data.extra` | Keterangan bebas |
| `data.success` | 1 = berhasil |

⚠️ **Jebakan ejaan:** tabel parameter menyebut `shop_id`, tetapi contoh
JSON resmi untuk kasus `expiry`, toko beku, dan akun terputus memakai
**`shopid`** (tanpa garis bawah). Contoh pencabutan oleh penjual malah tidak
membawa id toko sama sekali — hanya teks di `extra`. Penerima harus membaca
`shop_id`, `shopid`, dan `shop_id_list`, dan tetap aman bila ketiganya kosong.

## Tipe app yang boleh berlangganan

Hampir semua tipe, termasuk **Customer Service**. ✅

## Update Log terakhir

Update Log hanya mencatat 2022-08-18 (push baru), sedangkan halamannya
bertanda "Last Updated: 29 Dec 2025".

## Sumber

https://open.shopee.com/push-mechanism/16 (dibaca 16 Okt 2026)
