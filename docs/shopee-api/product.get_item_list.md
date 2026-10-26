# v2.product.get_item_list

`GET /api/v2/product/get_item_list` — daftar `item_id` produk toko.

**Belum dipakai.** Calon langkah pertama sinkronisasi katalog produk
(item_id → `get_item_base_info` → `get_model_list`), supaya jawaban AI soal
produk/harga/stok memakai data toko sungguhan, bukan katalog statis.

## Parameter request

| Nama | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `offset` | int64 | ya | Mulai 0; berikutnya pakai `next_offset` |
| `page_size` | int64 | ya | Maks. 100 |
| `item_status` | string[] | ya | NORMAL / BANNED / UNLIST / REVIEWING / SELLER_DELETE / SHOPEE_DELETE. Beberapa status = **kunci diulang**: `item_status=NORMAL&item_status=UNLIST` |
| `update_time_from` / `update_time_to` | timestamp | tidak | Saring per waktu ubah produk (batas rentang tidak disebut) |

⚠️ `item_status` yang diulang tidak bisa dinyatakan dengan
`query: Record<string, string | number>` di `web/lib/shopee/klien.ts` — satu
kunci hanya satu nilai. Cukup untuk satu status (`NORMAL`); untuk lebih dari
satu, klien perlu diubah.

Ada batas offset tersembunyi: error "get items offset over limit, please use
the next field".

## Field response yang relevan

Di dalam `response`:

| Field | Keterangan |
|---|---|
| `item[].item_id` | |
| `item[].item_status` | |
| `item[].update_time` | |
| `item[].tag.kit` | Produk kit/bundel |
| `total_count` | Jumlah seluruh produk |
| `has_next_page`, `next_offset` | Pagination |

Ada juga `warning` di akar balasan (string; kosong bila tidak ada
peringatan).

## Kode error khas

| Kode | Arti |
|---|---|
| `error_param_item_status` | Status tidak valid |
| `error_update_time_range` | `update_time_to` tidak lebih akhir dari `_from` |
| `error_param` | Termasuk "offset over limit" |
| `error_param_shop_id_not_found` | |
| `error_system_busy`, `error_inner` | Coba ulang |

## API Permissions

ERP System, Seller In House System, Product Management, **Customer
Service**, Customized APP, Ads Service, Custom APP, Swam ERP, Livestream
Management, Ads Facil, Affiliate Marketing Solution Management, Shopee Video
Management. ✅ Customer Service termasuk.

## Update Log terakhir

2024-10-18 — tambah `tag` di response.

## Sumber

https://open.shopee.com/documents/v2/v2.product.get_item_list?module=89&type=1
(dibaca 16 Okt 2026)
