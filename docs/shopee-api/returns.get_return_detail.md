# v2.returns.get_return_detail

`GET /api/v2/returns/get_return_detail` — isi lengkap satu permintaan
retur/refund.

**Belum dipakai** sebagai pemanggil — `web/lib/shopee/tipe.ts` hanya
menyebutnya sebagai sumber bentuk amplop `AmplopShopee`.

> ⚠️ **PAGAR DATA PRIBADI.** Endpoint ini **selalu** mengembalikan
> `return_pickup_address` (nama, **telepon**, **alamat lengkap** pembeli),
> `user.email`, serta foto dan video bukti — tanpa `response_optional_fields`
> untuk menolaknya. Ini berbeda dari `get_order_detail` yang bisa dipagari
> lewat daftar field. Bila dipakai, buang field ini **sebelum** menyimpan
> apa pun (termasuk ke tabel mentah seperti `orders_raw`).

## Parameter request

| Nama | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `return_sn` | string | ya | Satu nomor retur |

## Field response yang relevan

Di dalam `response`. Field yang sama dengan
[returns.get_return_list](returns.get_return_list.md) (status, alasan, nilai,
tenggat, `item[]`, `order_sn`, `return_solution`, ...) ditambah:

| Field | Keterangan |
|---|---|
| `seller_proof.seller_proof_status`, `seller_evidence_deadline` | Apakah & sampai kapan penjual harus mengirim bukti |
| `seller_compensation.*` | Status dan batas waktu pengajuan kompensasi |
| `negotiation.*` | `negotiation_status`, `latest_solution`, `latest_offer_amount`, `offer_due_date`, `counter_limit` |
| `reverse_logistics_status` | Status pengiriman balik terbaru (gunakan ini, bukan `logistics_status` yang usang) |
| `reverse_logistics_channel_name` | Kurir pengiriman balik |
| `item[].refund_amount` | Refund per barang (hanya toko yang di-whitelist Partial Qty RR) |
| `buyer_videos[]` | Video bukti pembeli |

**Data pribadi yang jangan disimpan:** `return_pickup_address.*`,
`user.email`, `user.portrait`, `image[]`, `buyer_videos[]`,
`virtual_contact_number`.

**Ketidakkonsistenan di dokumentasi:**
- Tabel: `reverse_logistics_status` / `reverse_logistics_channel_name`;
  contoh JSON: `reverse_logistic_status` / `reverse_logistic_channel_name`
  (tanpa "s"). Baca keduanya.
- `dispute_reason` didefinisikan `string[]`, tetapi contoh JSON memberi
  angka `2`.
- Contoh balasan sukses memakai `"error": "-"`.

## Kode error khas

| Kode | Arti |
|---|---|
| `error_param` | "Return SN or ID is invalid." |
| `error_data` | "The return you queried doesn't exist" / "The return detail is not available" |
| `error_permission` | Tidak berhak melihat retur ini / toko belum terhubung |

## API Permissions

ERP System, Seller In House System, **Customer Service**, Swam ERP.
✅ Customer Service termasuk.

## Update Log terakhir

2026-07-31 — tipe `promotion_id` berubah jadi uint64.

## Sumber

https://open.shopee.com/documents/v2/v2.returns.get_return_detail?module=102&type=1
(dibaca 16 Okt 2026)
