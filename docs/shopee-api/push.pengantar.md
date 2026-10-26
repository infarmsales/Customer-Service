# Push Mechanism — pengantar & verifikasi signature

Push Mechanism = webhook Shopee. Shopee mengirim `HTTP POST` ke callback URL
kita saat sebuah peristiwa terjadi. Push hanya memberi tahu **"ada yang
berubah"**; detailnya tetap diambil lewat API yang bersangkutan.

## Memverifikasi bahwa push benar dari Shopee ⭐

Setiap push membawa header **`Authorization`** berisi tanda tangan. Shopee
menyebut langkah ini "secara teknis opsional" tetapi sangat disarankan.
Untuk proyek ini anggap **wajib**: callback URL bersifat publik, dan tanpa
verifikasi siapa pun bisa mengirim "pesan chat" atau "perubahan status" palsu.

Cara menghitung:

1. **String dasar** = `<URL callback lengkap>` + `|` + `<body mentah>`
   - URL harus persis sama dengan yang didaftarkan di Console (skema, host,
     path).
   - Body dipakai **mentah, byte apa adanya**. Dokumentasi secara eksplisit
     tidak menyarankan `json.loads` lalu serialisasi ulang — urutan kunci dan
     spasi akan berubah dan tanda tangan tidak cocok. Di Next.js: baca
     `await req.text()`, **jangan** `req.json()` sebelum verifikasi.
2. **Kunci** = partner key app (dari env, tidak pernah di kode).
3. `HMAC-SHA256(kunci, stringDasar)` → **hex huruf kecil**.
4. Bandingkan dengan header `Authorization`. Tidak sama → tolak.

Sketsa (belum ada di kode, belum diuji dengan push sungguhan):

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

function pushSah(url: string, bodyMentah: string, partnerKey: string, header: string | null): boolean {
  if (!header) return false;
  const hitung = createHmac("sha256", partnerKey).update(`${url}|${bodyMentah}`).digest("hex");
  const a = Buffer.from(hitung), b = Buffer.from(header.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Perbedaan dengan tanda tangan API biasa (`lib/shopee/tandaTangan.ts`):
API biasa menyambung `partner_id + path + timestamp + ...` **tanpa
pemisah**; push memakai **URL lengkap + `|` + body**.

Jebakan yang mungkin muncul di Vercel: bila ada proxy/redirect yang mengubah
URL (mis. `http`↔`https`, garis miring di ujung), URL yang dihitung tidak
sama dengan yang dipakai Shopee. Pakai URL yang didaftarkan di Console sebagai
konstanta, bukan `req.url`.

## Cara menjawab push

- Jawab **status 2xx dengan body kosong**, dalam batas waktu push itu
  (2 dtk untuk `webchat_push`, 3 dtk untuk kebanyakan push lain).
- Selain itu dihitung gagal dan dikirim ulang sesuai jadwal tiap push.
- Semua push bisa terkirim ganda → penerima harus idempoten.

## Peringatan & pemutusan langganan

Dihitung dari push 6 jam terakhir, hanya bila jumlahnya > 600:

| Tingkat sukses | Akibat |
|---|---|
| < 70% | Email peringatan tiap 30 menit |
| < 30% | **Langganan push dimatikan**; push selama mati tidak dikirim ulang |

Ini alasan lain handler push harus cepat dan tidak bergantung pada Claude.

## Berlangganan

Lewat Console → Push Mechanism → pilih app → Set Push → isi callback URL →
Verify (Shopee mengirim POST uji; URL harus menjawab 2xx). Bisa juga lewat
API `v2.push.set_app_push_config`. Sandbox punya *Test Callback URL* sendiri
dan tombol *Push Test Data*; konfigurasi sandbox terpisah dari produksi.

Toko bisa diblokir dari push (maks. 500 toko). Push hanya datang untuk toko
yang sudah mengotorisasi app.

## Push apa yang tersedia untuk app tipe Customer Service

Tabel di halaman pengantar (terakhir diperbarui **2023-01-16**) menyebut app
**Customer Service** hanya mendapat:

- Shop Authorization Push (kode 1)
- Shop Authorization Canceled Push (kode 2)
- Open API Authorization Expiry Push (kode 12) — peringatan 7 hari sebelum
  otorisasi toko habis (otorisasi berlaku 1 tahun)
- Shopee Updates (kode 5)
- **Webchat Push (kode 10)**

⚠️ **Bertentangan dengan halaman push masing-masing.** Halaman
`order_status_push` (diperbarui 2023-08-14) dan `return_updates_push`
(2024-12-24) sama-sama mencantumkan Customer Service di aturan langganannya.
Halaman per push lebih baru, jadi kemungkinan tabel pengantar ini sudah
usang — tetapi **belum terbukti**. Pastikan dengan melihat daftar push yang
bisa dicentang di Console → Push Mechanism untuk app ini.

ERP System adalah satu-satunya tipe yang secara eksplisit **tidak** mendapat
Webchat Push.

## Sumber

https://open.shopee.com/developer-guide/18 (Last Updated 2023-01-16; dibaca
16 Okt 2026). Ringkasan pengantar versi Brasil:
https://open.shopee.com/developer-guide/746 (2026-07-20).
