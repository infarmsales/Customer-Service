# v2.shop.get_shop_info

`GET /api/v2/shop/get_shop_info` — nama, status, dan masa otorisasi toko.

Dipakai di: callback otorisasi / halaman Pengaturan (tipe `InfoToko` di
`web/lib/shopee/tipe.ts`). Jawaban di **akar** → `permintaanMentah()`.

## Parameter request

Tidak ada parameter khusus — cukup parameter umum (`partner_id`,
`timestamp`, `access_token`, `shop_id`, `sign`).

## Field response yang relevan (di akar)

| Field | Keterangan |
|---|---|
| `shop_name` | Nama toko |
| `region` | Kode wilayah, mis. `ID` |
| `status` | `NORMAL` / `BANNED` / `FROZEN` |
| `auth_time` | Kapan toko mengotorisasi app |
| `expire_time` | Kapan otorisasi toko habis (±1 tahun; bukan umur token) |
| `merchant_id` | `null` bila toko tidak di bawah merchant |
| `is_cb` | Toko lintas negara |
| `shop_fulfillment_flag` | Jenis fulfilment (Pure/PFF/LFF/Others/Unknown) |

Field Mart/Outlet, SIP, CBSC, dan Direct Shop tidak relevan untuk toko
Infarm.

## Kode error khas

| Kode | Arti |
|---|---|
| `error_shop` | shopid tidak valid |
| `error_param` | "The shop id you provided is not found" |
| `error_not_exists` | User tidak ada |
| `error_auth` | Contoh resmi: "Invalid partner_id or shopid." |

## API Permissions

ERP System, Seller In House System, Product Management, Order Management,
**Customer Service**, Customized APP, Ads Service, Swam ERP, Livestream
Management, Ads Facil, Affiliate Marketing Solution Management, Shopee Video
Management. ✅ Customer Service termasuk.

## Update Log terakhir

2026-05-19 — tambah `mart_outlet_structure_type` di response.

## Sumber

https://open.shopee.com/documents/v2/v2.shop.get_shop_info?module=92&type=1
(dibaca 16 Okt 2026)
