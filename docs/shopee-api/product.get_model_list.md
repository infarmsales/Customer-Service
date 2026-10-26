# v2.product.get_model_list

`GET /api/v2/product/get_model_list` — variasi (model) satu produk beserta
harga dan stok masing-masing.

**Belum dipakai.** Wajib dipanggil untuk produk dengan `has_model = true`,
karena `get_item_base_info` tidak memberi harga untuk produk bervariasi.

## Parameter request

| Nama | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `item_id` | int64 | ya | **Satu** produk per panggilan (tidak ada versi daftar) |

Untuk katalog besar ini berarti satu panggilan per produk bervariasi —
perhitungkan saat menjadwalkan sinkronisasi.

## Field response yang relevan

Di dalam `response`:

| Field | Keterangan |
|---|---|
| `tier_variation[]` | Definisi variasi: `name` (mis. "Ukuran") dan `option_list[].option` (mis. "100 ml") |
| `model[].model_id`, `model_sku` | |
| `model[].tier_index` | Indeks ke `tier_variation[i].option_list` — **nama variasi tidak ada di model**, harus dirakit dari sini |
| `model[].model_status` | `MODEL_NORMAL` (bisa dibeli) / `MODEL_UNAVAILABLE` |
| `model[].price_info[]` | `currency`, `original_price`, `current_price` |
| `model[].has_promotion` | |
| `model[].stock_info_v2.summary_info.total_available_stock` | Stok yang bisa dijual sekarang |
| `model[].pre_order.*` | Hanya untuk pengguna yang di-whitelist |
| `model[].weight`, `dimension` | Bila kosong, pakai milik item |

Harga di Indonesia hanya bilangan bulat (dua desimal hanya untuk
SG/MY/BR/MX/PL/ES/AR).

Contoh resmi memakai `"error": "-"`, `"message": "-"`, dan
`shopee_stock[].stock` bertipe string, sedangkan `seller_stock[].stock`
int32.

## Kode error khas

| Kode | Arti |
|---|---|
| `error_item_not_found` | Item tidak ada |
| `error_shop_not_found`, `error_param_shop_id_not_found` | |
| `product.error_param` | Contoh resmi: "invalid field ItemId: value must Not Null" |
| `error_system_busy`, `error_inner` | Coba ulang |

## API Permissions

ERP System, Seller In House System, Product Management, Accounting And
Finance, **Customer Service**, Customized APP, Ads Service, Swam ERP,
Livestream Management, Ads Facil, Affiliate Marketing Solution Management,
Shopee Video Management. ✅ Customer Service termasuk.

## Update Log terakhir

2026-07-31 — tipe `promotion_id` berubah jadi uint64.

## Sumber

https://open.shopee.com/documents/v2/v2.product.get_model_list?module=89&type=1
(dibaca 16 Okt 2026)
