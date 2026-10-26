# Data Definition — LogisticsStatus

Ada **tiga** keluarga status logistik yang berbeda. Jangan memetakan
semuanya dengan satu tabel.

## 1. LogisticsStatus — status pengiriman pesanan

Dipakai di `get_order_detail` → `package_list[].logistics_status` dan
`get_tracking_info` → `logistics_status` (tingkat atas).

| Nilai | Arti |
|---|---|
| `LOGISTICS_NOT_START` | Awal, pesanan belum siap dikirim |
| `LOGISTICS_PENDING_ARRANGE` | Menunggu pengaturan pengiriman |
| `LOGISTICS_COD_REJECTED` | COD ditolak (logistik terintegrasi) |
| `LOGISTICS_READY` | Siap dikirim dari sisi pembayaran (non-COD: sudah bayar; COD: lolos screening) |
| `LOGISTICS_REQUEST_CREATED` | Pengiriman sudah diatur |
| `LOGISTICS_PICKUP_DONE` | Sudah diserahkan ke kurir |
| `LOGISTICS_DELIVERY_DONE` | Berhasil diterima |
| `LOGISTICS_INVALID` | Batal saat masih `LOGISTICS_READY` |
| `LOGISTICS_REQUEST_CANCELED` | Batal saat `LOGISTICS_REQUEST_CREATED` |
| `LOGISTICS_PICKUP_FAILED` | Dibatalkan kurir: gagal jemput / tak bisa dilanjutkan |
| `LOGISTICS_PICKUP_RETRY` | Menunggu kurir menjemput ulang |
| `LOGISTICS_DELIVERY_FAILED` | Batal karena pengantaran gagal |
| `LOGISTICS_LOST` | Batal karena paket hilang di kurir |

Catatan: contoh `push.return_updates_push` memakai
`LOGISTICS_NOT_STARTED` (dengan "ED"), sedangkan definisi ini
`LOGISTICS_NOT_START`. Terima keduanya.

`PackageFulfillmentStatus` (per paket) memakai nilai yang sama tanpa
`PENDING_ARRANGE` dan `COD_REJECTED`.

## 2. TrackingLogisticsStatus — langkah di lini masa kurir

Dipakai di `get_tracking_info` → `tracking_info[].logistics_status`. Nilainya
jauh lebih rinci: `ORDER_CREATED`, `PICKUP_REQUESTED`, `PICKED_UP`,
`DELIVERY_PENDING`, `DELIVERED`, `PICKUP_RETRY`, `LOST`, `RETURN_STARTED`,
`RETURNED`, `CANCELED`, serta varian `FAILED_*` (mis. `FAILED_DELIVERED`)
— total 36 nilai.

## 3. Reverse Logistics Status — pengiriman balik retur

Dipakai di `get_return_detail` → `reverse_logistics_status`, dan
`return_updates_push` bila `update_field = logistics_status`.

- **Retur biasa:** `LOGISTICS_PENDING_ARRANGE`, `LOGISTICS_READY`,
  `LOGISTICS_REQUEST_CREATED`, `LOGISTICS_PICKUP_RETRY`,
  `LOGISTICS_PICKUP_FAILED`, `LOGISTICS_PICKUP_DONE`,
  `LOGISTICS_DELIVERY_FAILED`, `LOGISTICS_LOST`, `LOGISTICS_DELIVERY_DONE`
  — namanya sama dengan status pesanan tetapi **artinya arah sebaliknya**
  (dari pembeli ke penjual).
- **In-transit RR & Return-on-the-Spot:** teks bebas `Pickup Done`,
  `Delivered`, `Delivery Failed`, `Lost`.

Sumber: https://open.shopee.com/developer-guide/31 bagian LogisticsStatus,
PackageFulfillmentStatus, TrackingLogisticsStatus, Reverse Logistics Status
(dibaca 16 Okt 2026)
