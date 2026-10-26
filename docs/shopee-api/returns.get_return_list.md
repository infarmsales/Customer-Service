# v2.returns.get_return_list

`GET /api/v2/returns/get_return_list` — daftar permintaan retur/refund toko,
lengkap dengan isinya (bukan hanya nomor seperti `get_order_list`).

**Belum dipakai.** Calon sumber tab Refund di halaman Pesanan. Retur/refund
selalu **handover ke CS manusia** — data ini untuk CS, bukan untuk dijawab AI.

## Parameter request

| Nama | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `page_no` | int64 | ya | Halaman. Contoh resmi mulai dari **1**, tetapi deskripsinya menyebut "default 0" — belum jelas |
| `page_size` | int64 | ya | ≤ 100 (bawaan 40) |
| `create_time_from` / `create_time_to` | timestamp | tidak | Rentang waktu dibuat; **maks. 15 hari** |
| `update_time_from` / `update_time_to` | timestamp | tidak | Rentang waktu diperbarui; **maks. 15 hari**, dan `update_time_from` harus ≥ `create_time_from` |
| `status` | string | tidak | Saring per status retur ([data-definition.return_status](data-definition.return_status.md)) |
| `negotiation_status`, `seller_proof_status`, `seller_compensation_status` | string | tidak | Saringan lain |

Pagination memakai `page_no`, **bukan cursor** seperti Order.

## Field response yang relevan

Di dalam `response`: `more` dan larik **`return`** (nama field-nya memang
`return`, kata kunci di JS — akses dengan `data["return"]`).

| Field | Keterangan |
|---|---|
| `return_sn` | Nomor retur |
| `order_sn` | Pesanan asal |
| `status` | Status retur |
| `reason` | Alasan pilihan pembeli (mis. `PHYSICAL_DMG`) |
| `text_reason` | Alasan yang ditulis pembeli |
| `reassessed_request_reason` | Alasan hasil tinjau ulang Shopee; `NONE` bila tidak ada |
| `refund_amount`, `currency`, `amount_before_discount` | Nilai |
| `create_time`, `update_time` | |
| `due_date` | Batas penjual menanggapi |
| `return_ship_due_date`, `return_seller_due_date` | Batas kirim balik (pembeli) / tanggapan penjual setelah dikirim |
| `return_solution` | 0 = retur + refund, 1 = refund saja |
| `return_refund_type` | `RRBOC` (sebelum pesanan selesai) / `RRAOC` (sesudah) |
| `negotiation_status`, `seller_proof_status`, `seller_compensation_status` | |
| `item[]` | `item_id`, `model_id`, `name`, `amount`, `item_price`, `item_sku`, `variation_sku` |
| `tracking_number` | Resi pengiriman balik |
| `needs_logistics` | Barang perlu dikirim balik |

**Data pribadi:** `user.username`, `user.email` (tersamar sebagian),
`user.portrait`, serta `image[]` (foto bukti dari pembeli). Endpoint ini tidak
punya `response_optional_fields` — semuanya **selalu** dikembalikan. Kalau
dipakai, jangan simpan `user.email` dan `image[]` mentah tanpa keputusan
pemilik proyek.

Contoh resmi memakai `"error": "-"` pada balasan sukses (lihat README).

## Kode error khas

| Kode | Arti |
|---|---|
| `error_param` | Rentang > 15 hari, `*_to` lebih awal dari `*_from`, atau `update_time_from` < `create_time_from` |
| `error_permission` | "You don't have permission to view this return data" / "Please link shop and partner on seller center" |
| `error_data` | Retur tidak ada / gagal query |

Daftar resminya memuat puluhan kode "Core server error." yang tidak spesifik.

## API Permissions

ERP System, Seller In House System, **Customer Service**, Swam ERP.
✅ Customer Service termasuk. (Order Management **tidak**.)

## Update Log terakhir

2026-08-31 — tambah `is_partial_quantity_return` dan
`is_refund_amount_adjusted`.

## Sumber

https://open.shopee.com/documents/v2/v2.returns.get_return_list?module=102&type=1
(dibaca 16 Okt 2026)
