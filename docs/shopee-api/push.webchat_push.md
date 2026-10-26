# webchat_push (kode 10)

Push untuk **pesan chat masuk**. Inilah jalur realistis membawa chat
Shopee ke console, karena modul API SellerChat tidak tercantum sama sekali
di daftar isi API v2 yang bisa dilihat akun ini (lihat README).

## Sifat pengiriman

| Properti | Nilai |
|---|---|
| Kode | 10 |
| Batas waktu jawab | **2 detik** |
| Urutan dijamin | Ya |
| Bisa terkirim ganda | **Ya** |
| Jadwal ulang | 1 dtk, 2 dtk, 3 dtk |

Batas 2 detik dan jadwal ulang yang cepat berarti penerima harus langsung
menjawab 200 lalu memproses di belakang. **Jangan panggil Claude di dalam
handler push** — jawaban AI jelas lebih lama dari 2 detik. Simpan pesan
dengan kunci unik `message_id` supaya pengiriman ganda tidak jadi baris ganda.

## Dua jenis isi (`data.type`)

### `notification`
Peristiwa percakapan, mis. `mark_as_replied`. Field di `data.content`:
`user_id`, `conversation_id`, `type`, `timestamp`, `msg_id`, `biz_id`.

### `message`
Pesan sungguhan. Field di `data.content`:

| Field | Keterangan |
|---|---|
| `message_id` | Pengenal unik pesan — kunci idempotensi |
| `conversation_id` | Pengenal percakapan |
| `from_id`, `from_user_name` | Pengirim. `from_id` = user id pembeli bila pembeli yang menulis — sama dengan `buyer_user_id` di `get_order_detail` |
| `to_id`, `to_user_name` | Penerima |
| `shop_id` | Toko penerima |
| `message_type` | `text` / `image` / `video` / `item` / `faq_liveagent` (juga `bundle_message`) |
| `content.text` | Isi teks (untuk `text` dan `faq_liveagent`) |
| `content.url`, `thumb_url` | Gambar — **AI tidak bisa melihatnya**, sesuai aturan claude-core.md |
| `content.item_id` | Untuk `item`: produk yang dibagikan pembeli |
| `source_content` | Konteks asal chat. Pada contoh `faq_liveagent` berisi **`order_sn`** — penghubung langsung ke pesanan |
| `created_timestamp` | Waktu percakapan dibuat |
| `is_in_chatbot_session` | Apakah sedang dalam sesi chatbot Shopee |
| `shopee_chatbot_replied` | Untuk `bundle_message`: `true` = chatbot Shopee sudah ikut menjawab. Shopee **menyarankan beralih ke balasan manual** |
| `business_type` | 0 = pembeli↔penjual, 11 = afiliasi↔penjual |
| `status` | normal / auto_reply / blocked / user_chat / web_chat / censored_whitelist / censored_blacklist / offwork_autoreply |
| `from_shop_id`, `to_shop_id` | Toko pengirim / penerima |
| `sub_account_id`, `sub_account_name` | Sub-akun pengirim; 0 bila bukan |
| `quoted_msg.message_id` | Pesan yang dikutip |

Pesan keluar dari toko sendiri (balasan CS, auto-reply) kemungkinan juga
ikut terkirim — saring dengan membandingkan `from_shop_id`/`from_id` dengan
toko kita. Ini kesimpulan dari struktur field, **belum terbukti** dengan push
sungguhan.

## Tipe app yang boleh berlangganan

Seller In House System, **Customer Service**, Original, Ads Service App.
✅ Customer Service termasuk.

## Update Log terakhir

2025-04-18 — tambah `from_shop_id`, `to_shop_id`, `status`.

## Sumber

https://open.shopee.com/push-mechanism/10 (dibaca 16 Okt 2026)
