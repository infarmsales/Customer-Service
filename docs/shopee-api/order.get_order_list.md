# v2.order.get_order_list

`GET /api/v2/order/get_order_list` — cari nomor pesanan dalam rentang waktu,
bisa disaring per status.

Dipakai di: `web/lib/shopee/tarikPesanan.ts` (sinkronisasi),
`web/lib/shopee/pesanan.ts` (halaman uji koneksi).

## Parameter request

| Nama | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `time_range_field` | string | ya | `create_time` atau `update_time` |
| `time_from` | timestamp | ya | Awal rentang (epoch detik) |
| `time_to` | timestamp | ya | Akhir rentang. Selisih dengan `time_from` **maks. 15 hari** |
| `page_size` | int32 | ya | 1–100 |
| `cursor` | string | tidak | Kosong untuk halaman pertama; berikutnya isi dengan `next_cursor` |
| `order_status` | string | tidak | Satu status per permintaan: UNPAID / READY_TO_SHIP / PROCESSED / SHIPPED / COMPLETED / IN_CANCEL / CANCELLED / INVOICE_PENDING |
| `response_optional_fields` | string | tidak | Satu-satunya nilai: `order_status`. **Tanpa ini status tidak dikembalikan** |
| `request_order_status_pending` | boolean | tidak | `true` = ikut kembalikan status PENDING (parameter masa migrasi) |
| `logistics_channel_id` | int32 | tidak | Hanya BR — abaikan |

## Field response yang relevan

Di dalam `response`:

| Field | Keterangan |
|---|---|
| `more` | `true` = masih ada halaman berikutnya |
| `next_cursor` | Kirim sebagai `cursor` berikutnya; string kosong bila `more = false` |
| `order_list[].order_sn` | Nomor pesanan |
| `order_list[].order_status` | Hanya ada bila diminta lewat `response_optional_fields` |
| `order_list[].booking_sn` | Hanya untuk pesanan *advance fulfilment* |

Contoh balasan resmi memang hanya berisi `order_sn` — bukti bahwa status
harus diminta eksplisit.

## Kode error khas

| Kode | Arti |
|---|---|
| `order.order_list_invalid_time` | `time_from` tidak lebih awal dari `time_to`, atau selisihnya > 15 hari |
| `error_param` | Parameter salah / data tidak ditemukan / "request not from gateway" |
| `error_permission` | Tidak punya izin |
| `error_shop` | `shop_id` tidak valid |
| `error_server`, `error_network`, `error_data` | Galat sisi Shopee — coba ulang |

Balasan galat tetap HTTP 200 dengan `error` terisi.

## API Permissions

ERP System, Seller In House System, Order Management, **Customer Service**,
Brand Membership, Ads Service, Swam ERP, Livestream Management, Affiliate
Marketing Solution Management, Payment Service Provider.

✅ Customer Service termasuk.

## Update Log terakhir

2025-04-23 — perubahan parameter input `cursor`.

## Sumber

https://open.shopee.com/documents/v2/v2.order.get_order_list?module=94&type=1
(dibaca 16 Okt 2026)
