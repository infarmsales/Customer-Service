# Instruksi Proyek — AI Customer Service Infarm

> Berkas ini **hanya untuk Claude Code / agen coding**, bukan system
> prompt aplikasi.
>
> Sejak 2 September 2026 `claude.md` lama dipecah dua supaya dokumentasi
> developer tidak ikut dibayar sebagai token di setiap chat pelanggan
> (hemat ±16% token system prompt). Cadangannya ada di `claude.md.OLD`.

---

## ⛔ ATURAN PERTAMA: JANGAN PANGGIL API BERBAYAR TANPA IZIN

**Saldo Anthropic milik pemilik proyek terpotong sungguhan setiap kali
Claude API dipanggil.** Aturan ini pernah dilanggar dan menghabiskan
saldo tanpa sepengetahuan pemiliknya — jangan diulangi.

### Yang WAJIB minta izin dulu, setiap kali

- `POST /api/chat` (Next.js) dan endpoint chat di `backend/server.js`
- `POST /api/pengenal/bangun` **dengan `jalankan: true`** — membangun
  vektor contoh pertanyaan lewat Voyage. Tanpa `jalankan` ia hanya
  memperkirakan biaya dan aman dipanggil berapa kali pun.
- Skrip apa pun yang meng-import `@anthropic-ai/sdk` atau memanggil
  `api.anthropic.com`
- Uji apa pun yang tujuannya "memastikan balasan AI benar"

**`/api/chat` berbahaya justru karena kadang gratis.** Pesan yang cocok
template dijawab tanpa memanggil Claude, tapi yang tidak cocok
langsung berbayar — dan tidak ada cara memastikan sebelum menekan.
Jangan pakai alasan "pesan ini pasti kena template".

### Cara meminta izin

Sebutkan **berapa panggilan**, **pesan apa**, dan **perkiraan biayanya**
dalam rupiah. Lalu berhenti dan tunggu jawaban. Jangan lanjut sampai
pemilik proyek menjawab.

### Yang GRATIS — pakai ini untuk memverifikasi

| Perintah | Yang dibuktikan |
|---|---|
| `node knowledge-base/router.test.mjs` | 48 kasus pencocokan template |
| `node knowledge-base/periksa-katalog.mjs` | Tidak ada kode kembar, index.json sinkron, semua balasan <= 600 karakter |
| `node knowledge-base/uji-sumber-luar.mjs` | 23 kasus lapisan sumber tabel: tabel menang atas berkas, tabel kosong kembali ke berkas, pola rusak dibuang satuan |
| `node knowledge-base/uji-satpam-seed.mjs` | Seed Gerbang 0 di `supabase/schema-satpam.sql` setara dengan daftar SATPAM di router.js: 128 pesan, kategori yang benar, invarian frasa→pola |
| `node knowledge-base/uji-satpam-sumber.mjs` | 39 kasus lapisan sumber Gerbang 0: tabel menang atas kode, tabel kosong kembali ke kode UTUH, seluruh pola rusak tidak pernah berarti tanpa pengaman |
| `npm run uji-satpam-aturan` | 40 kasus aturan halaman Kata Sensitif: frasa dibersihkan, pola tidak bisa jadi regex jahat, dan peringatan kata terlalu lebar |
| `npm run uji-sumber-terpasang` | Setiap rute API yang menilai Gerbang 0 / template benar-benar memuat sumber tabelnya dulu — menangkap rute yang diam-diam masih membaca daftar di kode |
| `node knowledge-base/audit-voyage.mjs` | Audit kesiapan data Gerbang 2: jumlah contoh, gaya bahasa, kode ganda, kemiripan antar-template |
| `node knowledge-base/peraga-kemiripan.mjs` | Dari mana angka skor kemiripan datang — rumus kosinus dihitung ulang atas vektor yang sudah ada |
| `npm run uji-mutu` | 39 kasus pemeriksa mutu contoh pertanyaan: kalimat rapi ditandai, kalimat pelanggan tidak, ragam tingkat singkatan |
| `npm run uji-handover` | 41 kasus aturan jeda AI setelah handover: batas 24 jam, offset WIB vs Z, dan nilai rusak yang bisa membisukan AI selamanya |
| `npm run uji-jadwal-ai` | 54 kasus aturan kapan AI boleh menjawab: jam WIB vs jam server, jendela yang melewati tengah malam, override dua arah, dan nilai rusak yang bisa membisukan AI selamanya |
| `npm run uji-tunggakan` | 33 kasus aturan tunggakan: siapa yang bicara terakhir, role asing yang condong ke arah aman, jendela yang melewati tengah malam, dan kapan tim diperingatkan sebelum jam kerja habis |
| `npm run uji-sesi` | 48 kasus batas umur sesi login: sesi 12 jam, penghitung diam 60 menit, dan — yang paling penting — nilai waktu yang tidak terbaca TIDAK pernah mengeluarkan siapa pun |
| `npm run uji-ringkasan` | 21 kasus angka nyata Beranda & Statistik: antrean tertua (bukan rata-rata), rentang waktu, dan nol yang berbeda dari "belum ada data" |
| `npm run uji-pesanan` | 26 kasus pesanan contoh di tab Pesanan: nomor tidak pernah berubah (kalau berubah, pencarian diam-diam gagal), data asli tidak ditimpa, katalog kosong tidak mengarang nama produk |
| `npm run uji-cari` | 46 kasus pencocokan pencarian & papan croscek: nomor bertanda baca tetap ketemu, nama pendek TIDAK melebar, nomor yang tidak ketemu tidak pernah hilang dari daftar |
| `npm run periksa-jadwal` | Apakah gerbang jadwal siap: fungsi `jadwal_ai()` ada, jam WIB yang sedang berlaku, keputusan AI sekarang, dan bukti anon TIDAK bisa membaca tabel settings (membaca Supabase, tidak menulis) |
| `npm run periksa-sumber` | Apakah tabel `templates`, `satpam_rules`, `pustaka_router()` & `satpam_router()` siap dipakai router — termasuk uji cegat Gerbang 0 dan bukti anon TIDAK bisa membaca tabelnya (membaca Supabase, tidak menulis) |
| `npm run periksa-aturan` | Aturan pemicu di tabel masih sepadan dengan berkas .md — menangkap `also`/`unless` yang hilang |
| `POST /api/pengenal/bangun` tanpa `jalankan` | Berapa contoh yang belum bervektor & perkiraan biayanya |
| `POST /api/templates/uji` | Pesan tertentu kena template mana |
| `POST /api/pengenal/uji` | **BERBAYAR ~Rp 0,003** — uji Gerbang 2 tanpa memanggil Claude |
| `npm run tes0` | Kebingungan antar-contoh dari vektor yang sudah ada |
| `npm run tes-ambang` | **BERBAYAR ~Rp 0,04** — ukur ambang Gerbang 2 dengan 19 kalimat |
| `npm run uji-input-type` | **BERBAYAR ~Rp 0,13** — bandingkan query<->document vs query<->query. Tanpa `--jalankan` hanya memperkirakan |
| `GET /api/templates` | Daftar 152 template + aturan pemicunya |
| `GET /api/health` | Konfigurasi & ukuran KB (tidak memanggil Claude) |
| `npx tsc --noEmit` · `npx eslint .` · `npx next build` | Kode benar |
| `npm run sync-kb -- --check` | Berkas KB sinkron |

`knowledge-base/router.js` hanya meng-import `node:fs`, `node:path`,
dan `node:url` — tidak ada jaringan sama sekali. Semua yang di atas
berbiaya **Rp 0** berapa kali pun dijalankan.

### Kalau memang tidak bisa diverifikasi tanpa panggilan berbayar

Katakan apa adanya: **"bagian ini belum diuji karena butuh panggilan
berbayar"**. Laporan jujur jauh lebih baik daripada saldo terpotong
diam-diam. Jangan menulis seolah sesuatu sudah terbukti padahal belum.

---

## Aturan perilaku AI CS

Dikirim ke Claude API sebagai system prompt oleh `web/lib/knowledge.ts`
dan `backend/knowledge.js`. **Setiap tambahan di sini menambah biaya
setiap chat** — pastikan isinya benar-benar memengaruhi cara AI
menjawab pelanggan.

@claude-core.md

## Panduan developer

Tema warna, standar responsivitas, arsitektur, roadmap, estimasi biaya.
Tidak pernah dikirim ke Claude API — bebas ditambah tanpa biaya token.
Wajib diikuti saat membuat atau mengubah halaman UI.

@docs/tech-stack.md
