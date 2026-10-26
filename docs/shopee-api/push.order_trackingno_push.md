# order_trackingno_push (kode 4)

Push saat nomor resi sebuah pesanan terbit atau berubah — supaya tidak perlu
memanggil `get_tracking_number` berulang kali.

> ⚠️ **Customer Service TIDAK termasuk** tipe app yang boleh berlangganan
> push ini. Untuk app CS, resi tetap harus ditarik lewat
> [logistics.get_tracking_number](logistics.get_tracking_number.md) (mis.
> dipicu oleh `order_status_push` saat status jadi SHIPPED).

## Sifat pengiriman

| Properti | Nilai |
|---|---|
| Kode | 4 |
| Batas waktu jawab | 3 detik |
| Urutan dijamin | Tidak |
| Bisa terkirim ganda | Ya |
| Jadwal ulang | 300 dtk, 1800 dtk, 10800 dtk |

## Isi push

| Field | Keterangan |
|---|---|
| `data.ordersn` | Nomor pesanan (ejaan `ordersn`) |
| `data.package_number` | Nomor paket di dalam pesanan |
| `data.tracking_no` | Nomor resi |
| `data.forder_id` | Ditandai "coming offline" — jangan dipakai |
| `shop_id`, `code` (=4), `timestamp` | |

## Tipe app yang boleh berlangganan

Original, ERP System, Seller In House System, Order Management, Swam ERP.
❌ **Customer Service tidak termasuk.**

## Update Log terakhir

2022-08-18 — push baru.

## Sumber

https://open.shopee.com/push-mechanism/2 (dibaca 16 Okt 2026)
