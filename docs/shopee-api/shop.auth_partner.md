# Otorisasi toko — link otorisasi (`auth_partner` / `/auth`)

Bukan endpoint API biasa, melainkan **halaman** yang dibuka pemilik toko
untuk menyetujui app. Tidak punya halaman API reference sendiri; sumbernya
panduan "Authorization and Authentication".

Dipakai di: `urlOtorisasi()` (`web/lib/shopee/otorisasi.ts`) →
`/api/shopee/auth-url` → callback `web/app/shopee/callback/route.ts`.

## Dua cara membuat link

### Cara lama (yang dipakai kode sekarang)

`<host API>/api/v2/shop/auth_partner?partner_id=&timestamp=&sign=&redirect=`

- `sign` = HMAC-SHA256 hex atas `partner_id + path + timestamp` (basis
  endpoint Public).
- Masih muncul di contoh kode resmi (Python/Go/Java/PHP) dan sudah terbukti
  bekerja di sandbox proyek ini.
- Timestamp/sign **hanya berlaku 5 menit** — link selalu dibuat baru.

### Cara baru (disebut panduan sebagai metode utama)

`<URL otorisasi tetap>?partner_id=&auth_type=seller&redirect_uri=&response_type=code&state=`

| Lingkungan | URL tetap (global, selain CN/BR) |
|---|---|
| Produksi | `https://open.shopee.com/auth` |
| Sandbox | `https://open.sandbox.test-stable.shopee.com/auth` |

| Parameter | Wajib | Keterangan |
|---|---|---|
| `partner_id` | ya | |
| `auth_type` | ya | `seller` untuk toko/merchant |
| `redirect_uri` | ya | Domainnya harus cocok dengan *Redirect URL Domain* yang dideklarasikan di Console (Test dan Live terpisah). Bila belum dideklarasikan, belum divalidasi |
| `response_type` | ya | Selalu `code` |
| `state` | tidak | String acak untuk **mencegah CSRF**; dikembalikan apa adanya ke `redirect_uri` |

Panduan tidak menyebut `sign` untuk cara baru, tetapi catatannya tetap
menyebut "timestamp untuk menghitung sign berlaku 5 menit" — sisa dari cara
lama atau memang masih diperlukan, **belum jelas**.

## Yang dikembalikan ke redirect

`?code=...&shop_id=...` (otorisasi dari akun toko) **atau**
`?code=...&main_account_id=...` (otorisasi dari akun utama, bisa banyak
toko sekaligus). `code` sekali pakai, kedaluwarsa 10 menit.

Galat domain: "The domain of redirect_uri is not consistent with the
Redirect URL Domain declared in console".

## Fakta otorisasi lain

- Masa otorisasi **maksimal 365 hari**; pemilik toko bisa memilih 7/30/90/
  180/365 hari atau tanggal sendiri. Setelah habis, harus otorisasi ulang.
- Sub-akun tidak bisa membuka halaman otorisasi.
- Setelah refresh, access_token lama **masih berlaku 5 menit**.
- Otorisasi ulang menerbitkan refresh_token dan access_token baru.
- Refresh harus dipanggil selama masa otorisasi masih berlaku.
- Pencabutan: lewat `https://open.shopee.com/cancel_auth` (format sama) atau
  Seller Center → Platform Partner → "Separate".

## Host API per lingkungan

| Lingkungan | Host API |
|---|---|
| Produksi | `https://partner.shopeemobile.com` |
| Sandbox (app ini) | `https://openplatform.sandbox.test-stable.shopee.sg` |

## Sumber

https://open.shopee.com/developer-guide/20 (Last Updated 2026-07-24; dibaca
16 Okt 2026)
