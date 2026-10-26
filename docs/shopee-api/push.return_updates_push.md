# return_updates_push (kode 29)

Push saat sebuah permintaan retur/refund berubah pada salah satu dari empat
field: `return_status`, `return_solution`, `seller_proof_status`,
`logistics_status`.

Relevan untuk CS: retur dan refund **wajib handover** ke CS manusia
(claude-core.md), jadi push ini cocok sebagai pemicu notifikasi ke tim.

## Sifat pengiriman

| Properti | Nilai |
|---|---|
| Kode | 29 |
| Batas waktu jawab | 3 detik |
| Urutan dijamin | Tidak |
| Bisa terkirim ganda | Ya |
| Jadwal ulang | 300 dtk, 1800 dtk, 10800 dtk |

## Isi push

| Field | Keterangan |
|---|---|
| `data.order_sn` | Nomor pesanan (di push ini ejaannya `order_sn`, berbeda dari `order_status_push`) |
| `data.return_sn` | Nomor retur |
| `data.updated_values[]` | Daftar perubahan: `update_field`, `old_value`, `new_value`, `update_time` |
| `shop_id`, `code` (=29), `timestamp` | |

Satu push bisa membawa beberapa perubahan sekaligus (mis. `return_status`
dan `logistics_status` dalam satu pesan). Nilai `return_status` mengikuti
[data-definition.return_status](data-definition.return_status.md).

## Tipe app yang boleh berlangganan

ERP System, Seller In House System, Order Management, **Customer Service**,
Ads Service App, Swam ERP. ✅ Customer Service termasuk.

## Update Log terakhir

2024-12-24 — push baru.

## Sumber

https://open.shopee.com/push-mechanism/32 (dibaca 16 Okt 2026)
