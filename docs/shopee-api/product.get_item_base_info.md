# v2.product.get_item_base_info

`GET /api/v2/product/get_item_base_info` — info dasar produk: nama,
deskripsi, harga, stok, status, berat.

**Belum dipakai.** Inilah endpoint yang memberi **deskripsi produk** (tempat
penjual biasanya menulis dosis/cara pakai) dan **stok** — dua hal yang menurut
claude-core.md tidak boleh dikarang AI.

## Parameter request

| Nama | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `item_id_list` | int64[] | ya | **Maks. 50** item per panggilan |
| `need_tax_info` | boolean | tidak | Info pajak (BR/PL/IN) — tidak perlu |
| `need_complaint_policy` | boolean | tidak | Khusus PL — tidak perlu |

Format larik di query string tidak jelas: contoh resmi menulis
`item_id_list=[34001 34002]`. Endpoint Shopee lain biasanya menerima nilai
dipisah koma (`34001,34002`) — **belum dicoba**.

## Field response yang relevan

Di dalam `response.item_list[]`:

| Field | Keterangan |
|---|---|
| `item_id`, `item_name`, `item_sku`, `category_id` | |
| `description` | Deskripsi teks — **hanya terisi bila `description_type = normal`** |
| `description_type` + `description_info.extended_description.field_list[]` | Deskripsi "extended" (teks + gambar) untuk penjual yang di-whitelist; teks ada di `field_list[].text` |
| `item_status` | NORMAL / BANNED / UNLIST / SELLER_DELETE / SHOPEE_DELETE / REVIEWING |
| `has_model` | `true` = punya variasi → harga & stok per variasi lewat [product.get_model_list](product.get_model_list.md) |
| `price_info[]` | `currency`, `original_price`, `current_price` (harga promo bila ada). **Tidak dikembalikan bila produk punya variasi** |
| `has_promotion` | Sedang promo |
| `stock_info_v2.summary_info.total_available_stock` | Stok tersedia |
| `pre_order.is_pre_order`, `pre_order.days_to_ship` | |
| `weight` (string, KG), `dimension.*` (CM) | |
| `image.image_url_list[]` | |
| `attribute_list[]` | Atribut kategori (merek, berat bersih, dll.) |
| `item_dangerous` | Khusus ID/MY lokal: 1 = barang berbahaya |
| `purchase_limit_info` | Batas beli per pesanan |
| `create_time`, `update_time` | |

Contoh resmi memakai `"error": "-"` dan `"warning": "-"` pada balasan
sukses, serta `deboost: "false"` sebagai string padahal tipenya boolean.

## Kode error khas

| Kode | Arti |
|---|---|
| `error_item_not_found` | Item tidak ada |
| `error_query_over_itemid_size` | Terlalu banyak item_id (> 50) |
| `error_param_shop_id_not_found`, `error_get_shop_fail` | |
| `error_system_busy`, `error_inner` | Coba ulang |

## API Permissions

Hampir semua tipe, termasuk **Customer Service**. ✅

## Update Log terakhir

2026-04-03 — `promotion_id` dihapus dari response.

## Sumber

https://open.shopee.com/documents/v2/v2.product.get_item_base_info?module=89&type=1
(dibaca 16 Okt 2026)
