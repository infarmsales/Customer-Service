# v2.order.get_order_detail

`GET /api/v2/order/get_order_detail` — isi lengkap satu atau beberapa pesanan.

Dipakai di: `web/lib/shopee/tarikPesanan.ts`; daftar field yang diminta ada di
`FIELD_OPSIONAL_DETAIL` (`web/lib/shopee/sinkronAturan.ts`).

## Parameter request

| Nama | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `order_sn_list` | string | ya | Nomor pesanan dipisah koma, **1–50 nomor** |
| `response_optional_fields` | string | tidak | Field tambahan dipisah koma. Menyebut objek (mis. `item_list`) otomatis membawa semua anaknya |
| `request_order_status_pending` | boolean | tidak | `true` = dukung status PENDING dan kembalikan `pending_terms` |

Nilai yang boleh untuk `response_optional_fields`: buyer_user_id,
buyer_username, estimated_shipping_fee, recipient_address,
actual_shipping_fee, goods_to_declare, note, note_update_time, item_list,
pay_time, dropshipper, dropshipper_phone, split_up, buyer_cancel_reason,
cancel_by, cancel_reason, actual_shipping_fee_confirmed, buyer_cpf_id,
fulfillment_flag, pickup_done_time, package_list, shipping_carrier,
payment_method, total_amount, invoice_data, order_chargeable_weight_gram,
return_request_due_date, edt, payment_info, international_label.

## Field response yang relevan

Di dalam `response.order_list[]`.

**Selalu dikembalikan** (tanpa diminta): `order_sn`, `region`, `currency`,
`cod`, `order_status`, `message_to_seller`, `create_time`, `update_time`,
`days_to_ship`, `ship_by_date`, `booking_sn`.

**Hanya bila diminta:**

| Field | Keterangan |
|---|---|
| `buyer_user_id` | int64 — penghubung ke percakapan chat |
| `buyer_username` | Nama akun pembeli |
| `total_amount` | Total dibayar pembeli; baru ada setelah pembeli membayar |
| `shipping_carrier` | Layanan kirim pilihan pembeli |
| `pay_time` | Waktu UNPAID → PAID; NULL bila belum bayar |
| `cancel_by` | buyer / seller / system / Ops |
| `cancel_reason`, `buyer_cancel_reason` | Alasan pembatalan |
| `payment_method` | Lihat Data Definition – Payment Methods |
| `item_list[]` | `item_id`, `item_name`, `item_sku`, `model_id`, `model_name`, `model_sku`, `model_quantity_purchased`, `model_original_price`, `model_discounted_price`, `image_info.image_url`, plus jumlah `cancelled_qty` / `return_requested_qty` / `returned_qty` |
| `package_list[]` | `package_number`, `logistics_status` (lihat Data Definition – LogisticsStatus), `shipping_carrier`, `logistics_channel_id` |
| `return_request_due_date` | Batas pembeli mengajukan retur setelah COMPLETED |
| `dropshipper` | Khusus Indonesia — nama dropshipper |

**Data pribadi — sengaja TIDAK diminta proyek ini:** `recipient_address`
(nama, telepon, alamat lengkap), `dropshipper_phone`, `buyer_cpf_id` (BR).

**Tidak ada nomor resi.** Endpoint ini tidak mengembalikan
`tracking_number` sama sekali, bahkan di `package_list`. Resi harus diambil
lewat [logistics.get_tracking_number](logistics.get_tracking_number.md).

Catatan: `model_discounted_price` bernilai 0 untuk barang bundle deal.

## Kode error khas

| Kode | Arti |
|---|---|
| `error_not_found` | Pesanan tidak ditemukan ("the order is not found") |
| `error_param` | Parameter salah, termasuk lebih dari 50 nomor |
| `error_permission` | Tidak punya izin |
| `error_shop` | `shop_id` tidak valid |
| `error_server`, `error_network`, `error_data` | Galat sisi Shopee |

## API Permissions

ERP System, Seller In House System, Order Management, Accounting And
Finance, **Customer Service**, Brand Membership, Ads Service, Swam ERP,
Livestream Management, Affiliate Marketing Solution Management, Payment
Service Provider.

✅ Customer Service termasuk.

## Update Log terakhir

2026-08-27 — tambah `is_fulfillment_mapping`, `bundle_sku_id`, `components`
di `item_list`.

## Sumber

https://open.shopee.com/documents/v2/v2.order.get_order_detail?module=94&type=1
(dibaca 16 Okt 2026)
