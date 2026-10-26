# Data Definition — OrderStatus

Nilai `order_status` (get_order_list, get_order_detail) dan `status`
(`order_status_push`).

| Nilai | Arti | Catatan untuk CS |
|---|---|---|
| `UNPAID` | Pesanan dibuat, pembeli belum bayar | |
| `PENDING` | Tertahan, belum bisa diatur pengirimannya | Hanya muncul bila `request_order_status_pending=true` (lihat `pending_terms` di get_order_detail) |
| `READY_TO_SHIP` | Penjual sudah bisa mengatur pengiriman | "Perlu dikirim" |
| `PROCESSED` | Pengiriman sudah diatur, resi sudah ada dari kurir | Resi bisa diambil lewat get_tracking_number |
| `RETRY_SHIP` | Kurir gagal menjemput, pengiriman harus diatur ulang | |
| `SHIPPED` | Paket sudah diserahkan ke / dijemput kurir | |
| `TO_CONFIRM_RECEIVE` | Paket sudah diterima pembeli (menunggu konfirmasi) | |
| `IN_CANCEL` | Pembatalan sedang diproses | Handover |
| `CANCELLED` | Dibatalkan | Lihat `cancel_by` / `cancel_reason` |
| `TO_RETURN` | Pembeli minta retur, retur sedang diproses | Handover |
| `COMPLETED` | Selesai | Retur masih bisa diajukan sampai `return_request_due_date` |

⚠️ Daftar ini **tidak sama** dengan daftar nilai filter di
`get_order_list` (UNPAID / READY_TO_SHIP / PROCESSED / SHIPPED / COMPLETED /
IN_CANCEL / CANCELLED / INVOICE_PENDING):

- `PENDING`, `RETRY_SHIP`, `TO_CONFIRM_RECEIVE`, `TO_RETURN` ada di Data
  Definition tetapi tidak di filter.
- `INVOICE_PENDING` ada di filter (khusus pesanan yang menunggu faktur,
  terutama BR) tetapi tidak di Data Definition.

Pemeta internal harus menerima **gabungan keduanya** (12 nilai) dan tetap
punya jalur aman untuk nilai asing.

Sumber: https://open.shopee.com/developer-guide/31 bagian OrderStatus
(halaman Last Updated 2026-09-21; dibaca 16 Okt 2026)
