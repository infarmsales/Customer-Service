# v2.logistics.get_tracking_number

`GET /api/v2/logistics/get_tracking_number` — nomor resi satu pesanan.

**Belum dipakai.** Direncanakan untuk mengisi kolom resi yang sekarang
"belum tersedia" di panel Chat (`web/lib/marketplace/pemetaPesanan.ts:98`),
karena `get_order_detail` tidak mengembalikan resi.

## Parameter request

| Nama | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `order_sn` | string | ya | **Satu** nomor pesanan per panggilan (tidak ada versi daftar di endpoint ini) |
| `package_number` | string | tidak | Wajib untuk pesanan yang dipecah (lihat error `package_number_not_exist`). Jangan kirim string kosong |
| `response_optional_fields` | string | tidak | `plp_number`, `first_mile_tracking_number`, `last_mile_tracking_number` — semuanya khusus BR / lintas negara, tidak perlu |

Untuk banyak pesanan sekaligus ada `v2.logistics.get_mass_tracking_number`
(belum dibaca).

## Field response yang relevan

Di dalam `response`:

| Field | Keterangan |
|---|---|
| `tracking_number` | Nomor resi. **Boleh kosong** — bergantung pada kurir |
| `hint` | Alasan bila resi belum bisa didapat |
| `pickup_code` | Khusus pesanan lokal ID dengan Instant/Sameday — kode untuk kurir |

Dokumentasi: resi bisa belum ada sesaat setelah pengiriman diatur;
**boleh dipanggil ulang dengan jeda 5 menit** sampai terisi. Jangan
memanggilnya untuk pesanan yang belum `PROCESSED`/`SHIPPED`.

## Kode error khas

| Kode | Arti |
|---|---|
| `logistics.error_param` | Pesanan sedang dialokasikan — tunggu |
| `logistics.invalid_error` | Pesanan tidak ada |
| `logistics.package_not_exist` | Paket tidak ada |
| `logistics.package_number_not_exist` | Pesanan dipecah — kirim `package_number` |
| `logistics.invalid_address_version` | Alamat tidak lagi didukung regulasi baru |
| `common.invalid_shop` | shop_id tidak valid |
| `error_permission` | Tidak punya izin |

## API Permissions

ERP System, Seller In House System, Order Management, **Customer Service**,
Swam ERP. ✅ Customer Service termasuk.

## Update Log terakhir

2021-06-15 — tambah field `hint`.

## Sumber

https://open.shopee.com/documents/v2/v2.logistics.get_tracking_number?module=95&type=1
(dibaca 16 Okt 2026)
