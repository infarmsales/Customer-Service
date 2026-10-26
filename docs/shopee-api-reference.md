# Shopee Open Platform API v2 — ringkasan untuk proyek ini

Pintu masuk singkat. Rincian per endpoint ada di
**[docs/shopee-api/](shopee-api/README.md)** — semuanya dibaca langsung dari
dokumentasi resmi pada 16 Oktober 2026.

> Berkas ini dibuat ulang pada 16 Okt 2026. Versi sebelumnya (yang
> disebut berisi temuan SellerChat dan `webchat_push`) tidak pernah masuk
> repo; isinya di bawah ini diverifikasi ulang dari dokumentasi, bukan
> disalin dari ingatan.

## Apa yang dipakai sekarang

| Kebutuhan | Endpoint | Kode |
|---|---|---|
| Otorisasi toko | `/api/v2/shop/auth_partner` | `lib/shopee/otorisasi.ts` |
| Token awal & refresh | `/api/v2/auth/token/get`, `/api/v2/auth/access_token/get` | `lib/shopee/token.ts` |
| Info toko | `/api/v2/shop/get_shop_info` | |
| Sinkronisasi pesanan | `get_order_list` → `get_order_detail` | `lib/shopee/tarikPesanan.ts` |

## Apa yang direncanakan

| Kebutuhan | Endpoint | Catatan |
|---|---|---|
| Resi di panel Chat | `logistics.get_tracking_number` | Satu pesanan per panggilan |
| Lini masa kurir | `logistics.get_tracking_info` | |
| Tab Refund | `returns.get_return_list` / `get_return_detail` | Detail selalu membawa alamat & telepon pembeli |
| Katalog produk asli | `product.get_item_list` → `get_item_base_info` → `get_model_list` | Sumber deskripsi, harga, stok |
| Chat masuk | `webchat_push` (kode 10) | Hanya menerima |
| Ganti polling pesanan | `order_status_push` (kode 3) | Ketersediaan untuk app CS belum pasti |

## Chat: kenyataannya

- **Modul API SellerChat tidak ada** di daftar isi API v2 yang bisa dilihat
  akun developer ini. Tidak ada endpoint untuk mengambil riwayat chat atau
  **mengirim balasan** yang bisa dibaca, apalagi dipanggil.
- **Chat masuk lewat `webchat_push`** (diizinkan untuk app Customer
  Service): Shopee mendorong setiap pesan ke callback URL kita. Push harus
  dijawab dalam 2 detik dan diverifikasi tanda tangannya.
- Konsekuensinya: AI bisa **membaca** chat Shopee secara real-time, tetapi
  **membalas** tetap butuh akses SellerChat (whitelist) yang belum ada.

## Tiga hal yang paling mudah salah

1. Signature push berbeda dari signature API — lihat
   [push.pengantar.md](shopee-api/push.pengantar.md).
2. `response_optional_fields` wajib disebut, atau field penting (status,
   `buyer_user_id`) tidak pernah datang.
3. Host sandbox app ini adalah cluster Singapura
   (`openplatform.sandbox.test-stable.shopee.sg`).

Daftar lengkap jebakan dan perbedaan sandbox/produksi:
[shopee-api/README.md](shopee-api/README.md#temuan-penting).
