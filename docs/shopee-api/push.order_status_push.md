# order_status_push (kode 3)

Push dari Shopee setiap kali status pesanan berubah, termasuk pembatalan
sebelum dikirim. Calon pengganti polling `get_order_list` tiap 15 menit.

Perhatikan: URL dokumentasinya `/push-mechanism/1`, tetapi **kode push-nya
3**. Nomor di URL bukan kode push.

## Sifat pengiriman

| Properti | Nilai |
|---|---|
| Kode | 3 |
| Batas waktu jawab | 3 detik |
| Urutan dijamin | **Tidak** |
| Bisa terkirim ganda | **Ya** |
| Jadwal ulang | 300 dtk, 1800 dtk, 10800 dtk |

Akibatnya: penerima harus idempoten (upsert per `ordersn`) dan tidak boleh
mengandalkan urutan — bandingkan `update_time` sebelum menimpa status.

## Isi push

| Field | Tipe | Keterangan |
|---|---|---|
| `data.ordersn` | string | Nomor pesanan. **Perhatikan ejaan: `ordersn`, bukan `order_sn`** |
| `data.status` | string | Status pesanan baru (lihat [data-definition.order_status](data-definition.order_status.md)) |
| `data.completed_scenario` | string | Untuk COMPLETED: `NORMAL`, atau `RRAOC` (retur setelah pesanan selesai sudah tuntas) |
| `data.update_time` | timestamp | Waktu perubahan terakhir |
| `shop_id` | int | Toko |
| `code` | int | Selalu 3 |
| `timestamp` | timestamp | Waktu push dikirim |

Push ini tidak membawa detail barang, total, atau pembeli — untuk itu tetap
panggil [order.get_order_detail](order.get_order_detail.md).

## Tipe app yang boleh berlangganan

Original, ERP System, Seller In House System, Order Management,
**Customer Service**, Swam ERP. ✅ Customer Service termasuk.

⚠️ Tabel tipe app di [push.pengantar](push.pengantar.md) (2023-01-16)
justru **tidak** memberi push ini ke app Customer Service. Pastikan di
Console → Push Mechanism sebelum membangun penerimanya.

## Update Log terakhir

2023-08-14 — tambah `completed_scenario`.

## Sumber

https://open.shopee.com/push-mechanism/1 (dibaca 16 Okt 2026)
