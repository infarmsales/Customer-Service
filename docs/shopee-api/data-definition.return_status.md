# Data Definition — ReturnStatus & nilai retur terkait

## ReturnStatus

Dipakai di `get_return_list` / `get_return_detail` → `status`, dan
`return_updates_push` bila `update_field = return_status`.

| Nilai | Arti (ringkas) |
|---|---|
| `REQUESTED` | Pembeli mengajukan retur/refund |
| `PROCESSING` | Sedang diproses |
| `JUDGING` | Ditinjau Shopee |
| `SELLER_DISPUTE` | Penjual mengajukan sengketa |
| `ACCEPTED` | Disetujui (refund berjalan) |
| `CANCELLED` | Dibatalkan |
| `CLOSED` | Ditutup |

Dokumentasi hanya mencantumkan nama nilainya, **tanpa penjelasan** — arti di
atas adalah tafsiran dari namanya.

Semua status retur → **handover ke CS manusia** (claude-core.md: AI tidak
boleh menjanjikan refund/retur).

## Nilai terkait yang sering muncul

**ReturnSolution:** `RETURN_REFUND`, `REFUND` (di field `return_solution`
berupa angka: 0 = retur + refund, 1 = refund saja).

**ReturnReason** (alasan pembeli) — yang paling relevan untuk produk
Infarm: `NONRECEIPT`, `ITEM_MISSING`, `WRONG_ITEM`, `ITEM_DAMAGED`,
`PHYSICAL_DMG`, `FUNCTIONAL_DMG`, `SPILLED_CONTENTS` (isi tumpah — relevan
untuk pupuk cair), `BROKEN_PRODUCTS`, `DAMAGED_PACKAGE`, `EXPIRED_PRODUCT`,
`SPOILED_ROTTEN`, `DIFF_DESC` / `DIFFERENT_DESCRIPTION`, `ITEM_FAKE`,
`CHANGE_MIND` / `CHANGE_OF_MIND`. Total 32 nilai; beberapa kembar ejaan.

**SellerProofStatus:** `NOT_NEEDED`, `PENDING`, `UPLOADED`, `OVERDUE`.

**NegotiationStatus:** `PENDING_RESPOND`, `PENDING_BUYER_RESPOND`,
`TERMINATED`.

**SellerCompensationStatus:** `COMPENSATION_NOT_APPLICABLE`,
`COMPENSATION_INITIAL_STAGE`, `COMPENSATION_PENDING_REQUEST`,
`COMPENSATION_NOT_REQUIRED`, `COMPENSATION_REQUESTED`,
`COMPENSATION_APPROVED`, `COMPENSATION_REJECTED`, `COMPENSATION_CANCELLED`,
`COMPENSATION_NOT_ELIGIBLE`. (Contoh di halaman endpoint memakai bentuk
pendek `PENDING_REQUEST` / `NOT_REQUIRED` tanpa awalan `COMPENSATION_` —
terima keduanya.)

**Return Refund Request Type:** 0 = retur biasa (setelah diterima),
1 = diajukan saat paket masih di jalan, 2 = ditolak pembeli di tempat.

Sumber: https://open.shopee.com/developer-guide/31 bagian ReturnStatus,
ReturnSolution, ReturnReason, SellerProofStatus, NegotiationStatus,
SellerCompensationStatus, Return Refund Request Type (dibaca 16 Okt 2026)
