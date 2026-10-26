# v2.logistics.get_tracking_info

`GET /api/v2/logistics/get_tracking_info` — riwayat perjalanan paket (lini
masa kurir) satu pesanan.

**Belum dipakai.** Berguna untuk menjawab "paket saya sudah sampai mana?" —
tetapi menurut claude-core.md status pengiriman adalah `CHECK_ORDER_SYSTEM`,
jadi data ini sebaiknya tampil untuk CS / menjadi sumber jawaban, bukan
ditebak AI.

## Parameter request

| Nama | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `order_sn` | string | ya | Satu nomor pesanan |
| `package_number` | string | tidak | Untuk pesanan yang dipecah |

## Field response yang relevan

Di dalam `response`:

| Field | Keterangan |
|---|---|
| `logistics_status` | Status logistik pesanan saat ini (lihat [data-definition.logistics_status](data-definition.logistics_status.md)) |
| `tracking_info[]` | Lini masa: `update_time`, `description` (teks dari kurir, bahasanya mengikuti kurir), `logistics_status` per langkah |
| `tracking_info[].return_code` | OTP retur ke penjual — **khusus SPX Instant & Sameday di ID**, hanya ada setelah kurir memulai retur |

⚠️ `logistics_status` di dalam `tracking_info[]` memakai nilai yang
**berbeda** dari `logistics_status` di tingkat atas: contoh resmi
memperlihatkan `LOGISTICS_DELIVERY_FAILED` di atas dan `FAILED_DELIVERED`
di dalam lini masa. Jangan memetakan keduanya dengan tabel yang sama.

`reversed_*` (lintas negara) dan `collection_pin_code` (TW) tidak relevan.

Contoh resmi juga memperlihatkan `"error": "-"` pada balasan sukses. Bila
benar terjadi, `klien.ts` yang menganggap `error` terisi = gagal akan salah
menolaknya. **Belum terbukti** dengan panggilan sungguhan.

## Kode error khas

| Kode | Arti |
|---|---|
| `logistics.error_status_limit` | Status pesanan belum memungkinkan pelacakan |
| `logistics.error_param` | Pesanan sedang dialokasikan |
| `logistics.invalid_error` | Pesanan tidak ada |
| `logistics.package_not_exist`, `logistics.package_number_not_exist` | Masalah paket / pesanan dipecah |
| `common.invalid_shop`, `error_permission` | |

## API Permissions

ERP System, Seller In House System, Order Management, **Customer Service**,
Swam ERP. ✅ Customer Service termasuk.

## Update Log terakhir

2026-05-29 — tambah `collection_pin_code`.

## Sumber

https://open.shopee.com/documents/v2/v2.logistics.get_tracking_info?module=95&type=1
(dibaca 16 Okt 2026)
