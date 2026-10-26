# Dokumentasi lokal Shopee Open Platform API v2

Ringkasan dokumentasi resmi Shopee (open.shopee.com) untuk endpoint yang
dipakai atau akan dipakai proyek ini. Semua halaman dibaca langsung dari
situs resmi pada **16 Oktober 2026** dengan akun developer yang sudah login.
Ditulis ulang dengan kata-kata sendiri — bukan salinan.

Tidak ada partner key, access token, atau data pembeli di folder ini.

## Indeks

### Public / Auth
| Berkas | Endpoint | Status di kode |
|---|---|---|
| [shop.auth_partner.md](shop.auth_partner.md) | Link otorisasi toko (`/api/v2/shop/auth_partner` & `/auth`) | Dipakai |
| [public.get_access_token.md](public.get_access_token.md) | `POST /api/v2/auth/token/get` | Dipakai |
| [public.refresh_access_token.md](public.refresh_access_token.md) | `POST /api/v2/auth/access_token/get` | Dipakai |
| [public.get_shops_by_partner.md](public.get_shops_by_partner.md) | `GET /api/v2/public/get_shops_by_partner` | CLI saja |

### Shop
| Berkas | Endpoint | Status di kode |
|---|---|---|
| [shop.get_shop_info.md](shop.get_shop_info.md) | `GET /api/v2/shop/get_shop_info` | Dipakai |

### Order
| Berkas | Endpoint | Status di kode |
|---|---|---|
| [order.get_order_list.md](order.get_order_list.md) | `GET /api/v2/order/get_order_list` | Dipakai |
| [order.get_order_detail.md](order.get_order_detail.md) | `GET /api/v2/order/get_order_detail` | Dipakai |

### Logistics
| Berkas | Endpoint | Status di kode |
|---|---|---|
| [logistics.get_tracking_number.md](logistics.get_tracking_number.md) | `GET /api/v2/logistics/get_tracking_number` | Rencana (resi) |
| [logistics.get_tracking_info.md](logistics.get_tracking_info.md) | `GET /api/v2/logistics/get_tracking_info` | Rencana |

### Returns
| Berkas | Endpoint | Status di kode |
|---|---|---|
| [returns.get_return_list.md](returns.get_return_list.md) | `GET /api/v2/returns/get_return_list` | Rencana (tab Refund) |
| [returns.get_return_detail.md](returns.get_return_detail.md) | `GET /api/v2/returns/get_return_detail` | Rencana |

### Product
| Berkas | Endpoint | Status di kode |
|---|---|---|
| [product.get_item_list.md](product.get_item_list.md) | `GET /api/v2/product/get_item_list` | Rencana (katalog) |
| [product.get_item_base_info.md](product.get_item_base_info.md) | `GET /api/v2/product/get_item_base_info` | Rencana |
| [product.get_model_list.md](product.get_model_list.md) | `GET /api/v2/product/get_model_list` | Rencana |

### Push Mechanism (webhook)
| Berkas | Kode | Customer Service boleh? |
|---|---|---|
| [push.pengantar.md](push.pengantar.md) — **verifikasi signature**, cara menjawab, pemutusan langganan | — | — |
| [push.webchat_push.md](push.webchat_push.md) | 10 | ✅ |
| [push.order_status_push.md](push.order_status_push.md) | 3 | ✅ menurut halaman push / ❌ menurut tabel pengantar |
| [push.return_updates_push.md](push.return_updates_push.md) | 29 | ✅ menurut halaman push |
| [push.shop_authorization_canceled_push.md](push.shop_authorization_canceled_push.md) | 2 | ✅ |
| [push.order_trackingno_push.md](push.order_trackingno_push.md) | 4 | ❌ |

### Data Definition
- [data-definition.order_status.md](data-definition.order_status.md)
- [data-definition.logistics_status.md](data-definition.logistics_status.md)
- [data-definition.return_status.md](data-definition.return_status.md)

## Halaman yang tidak tersedia

Tidak ada halaman dari daftar yang menampilkan "You have no permission of
this document" — **semua 22 halaman terbaca**.

Yang tidak ada sama sekali: **modul SellerChat**. Daftar isi API v2 yang
terlihat dari akun ini memuat ±40 modul (Product, Order, Logistics, Returns,
Push, Livestream, ...) tetapi tidak ada SellerChat / Chat. Jadi endpoint
kirim/ambil pesan chat tidak bisa dibaca dokumentasinya, apalagi dipanggil,
dari akun ini. Satu-satunya jalur chat yang terdokumentasi adalah
[`webchat_push`](push.webchat_push.md) — **hanya menerima, tidak bisa
membalas**.

## Temuan penting

### Izin (API Permissions) untuk app tipe Customer Service
- Semua 13 endpoint API di folder ini **boleh** dipanggil app Customer
  Service.
- `get_return_list` / `get_return_detail` hanya untuk ERP, Seller In House,
  **Customer Service**, Swam ERP — Order Management tidak termasuk.
- Push: `order_trackingno_push` **tidak** tersedia untuk Customer Service.
  Tabel di halaman pengantar push (2023) bahkan menyebut CS **hanya** dapat
  push otorisasi + `webchat_push`, bertentangan dengan halaman
  `order_status_push` dan `return_updates_push` yang lebih baru. **Cek
  daftar centang di Console → Push Mechanism** sebelum membangun penerima.

### Sandbox vs produksi
| | Produksi | Sandbox (app ini) |
|---|---|---|
| Host API | `partner.shopeemobile.com` | `openplatform.sandbox.test-stable.shopee.sg` |
| Link otorisasi (cara baru) | `open.shopee.com/auth` | `open.sandbox.test-stable.shopee.com/auth` |
| Redirect URL Domain | "Live" di Console | "Test" di Console |
| Push | Callback URL produksi | *Test Callback URL* terpisah + tombol *Push Test Data* |

Konfigurasi push sandbox **tidak** ikut ke produksi. Proyek ini pernah
kehilangan dua hari karena memakai host sandbox yang salah (`error_sign`
padahal kredensialnya benar).

### Jebakan
1. **`response_optional_fields` wajib diminta.** Tanpa itu
   `get_order_list` hanya mengembalikan `order_sn` (tanpa status), dan
   `get_order_detail` tidak mengembalikan `buyer_user_id`,
   `buyer_username`, `item_list`, `total_amount`, `shipping_carrier`,
   `pay_time`, `cancel_by`, `cancel_reason`, dst.
2. **Tidak ada nomor resi di `get_order_detail`** — harus
   `get_tracking_number`, satu pesanan per panggilan.
3. **`get_return_detail` tidak bisa dipagari.** Alamat, telepon, dan email
   pembeli selalu ikut. Buang sebelum disimpan.
4. **Balasan sukses dengan `"error": "-"`.** Contoh resmi
   `get_tracking_info`, Returns, dan Product memakai `"-"` sebagai isi
   `error`/`message` pada jawaban sukses. `klien.ts` menganggap `error`
   terisi = gagal. Belum terbukti apakah API sungguhan berperilaku begitu;
   uji dulu di sandbox sebelum memakai endpoint itu.
5. **Dua bentuk amplop.** Auth, `get_shop_info`, dan `get_shops_by_partner`
   menaruh isinya di akar jawaban; yang lain di dalam `response`.
6. **`expire_in` tidak konsisten** — contoh `get_access_token` memberi epoch,
   contoh refresh dan panduan otorisasi memberi detik (13859, 14344, 14400).
7. **Batas per panggilan:** `get_order_list` rentang ≤ 15 hari & page_size
   ≤ 100; `get_order_detail` ≤ 50 nomor; `get_item_base_info` ≤ 50 item;
   `get_return_list` rentang ≤ 15 hari & page_size ≤ 100;
   `get_tracking_number` / `get_tracking_info` / `get_model_list` /
   `get_return_detail` hanya satu per panggilan.
8. **Ejaan berbeda antar halaman:** `ordersn` (push) vs `order_sn` (API);
   `shopid` vs `shop_id` (contoh `shop_authorization_canceled_push`);
   `reverse_logistic_status` vs `reverse_logistics_status`;
   `LOGISTICS_NOT_STARTED` vs `LOGISTICS_NOT_START`.
9. **Signature push ≠ signature API.** Push: HMAC-SHA256 atas
   `URL callback + "|" + body mentah`. API: `partner_id + path + timestamp
   [+ access_token + shop_id]` tanpa pemisah.
10. **Push harus dijawab 2xx dengan body kosong dalam 2–3 detik**; tingkat
    sukses < 30% (dari > 600 push / 6 jam) mematikan langganan.
11. **OrderStatus punya 12 nilai**, bukan 8 seperti filter
    `get_order_list` (`PENDING`, `RETRY_SHIP`, `TO_CONFIRM_RECEIVE`,
    `TO_RETURN` tambahan).

## Belum dibaca (di luar cakupan)

`get_mass_tracking_number`, `v2.push.set_app_push_config`,
`get_lost_push_message` (mengambil push yang terlewat),
`open_api_authorization_expiry` push (kode 12), halaman Sandbox Testing V2.
