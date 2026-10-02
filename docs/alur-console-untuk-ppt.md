# Alur Kerja Console AI Customer Service Infarm

> Materi presentasi. Semua angka diambil langsung dari kode, 1 Oktober 2026.

---

## 1. Masalah yang dipecahkan

Tim CS Infarm menjawab ribuan chat di Shopee dan TikTok Shop. Ada tiga tekanan sekaligus:

- **Kecepatan.** Marketplace menghitung persentase balasan cepat. Lewat batas waktu, peringkat toko turun.
- **Pengulangan.** Sebagian besar pertanyaan sama: dosis, cara pakai, jadwal kirim, benih apa saja yang tersedia.
- **Biaya.** Layanan sejenis (Duoke) Rp 500.000–2.000.000 per bulan.

Console ini dibangun sendiri supaya ketiganya tertangani tanpa langganan bulanan pihak ketiga.

---

## 2. Prinsip utama: AI adalah lapisan TERAKHIR, bukan pertama

Ini keputusan desain yang paling penting dan paling membedakan.

Setiap pesan pelanggan melewati **rangkaian gerbang bertingkat**. Gerbang yang paling murah dan paling pasti diperiksa lebih dulu. AI (Claude) hanya dipanggil kalau tidak ada gerbang lain yang bisa menjawab.

Dua alasannya:

1. **Biaya.** Menyuruh AI menyimpulkan "ini harus ditangani manusia" membakar token untuk keputusan yang bisa diambil gratis dan pasti.
2. **Kepastian.** Instruksi di dalam prompt AI adalah imbauan, bukan jaminan. Untuk refund dan keracunan, imbauan tidak cukup — yang dibutuhkan aturan yang tidak bisa dibujuk.

---

## 3. Gambaran besar — perjalanan satu pesan

```
Pesan masuk dari pelanggan
        |
   Gerbang -1      Sedang ditangani CS manusia?   -> AI diam
        |
   Gerbang -0.5    Ada foto / lampiran?           -> alihkan ke CS
        |
   Gerbang  0      SATPAM: topik sensitif?        -> alihkan ke CS
        |
   Gerbang jadwal  Masih jam kerja tim CS?        -> AI diam
        |
   Gerbang  1      Cocok balasan baku?            -> kirim, biaya Rp 0
        |
   Gerbang  2      Maksudnya mirip balasan baku?  -> kirim, ~Rp 0,003
        |
   Claude Sonnet (AI penuh)                       -> jawab dari Knowledge Base
```

Pesan yang berhenti di gerbang mana pun **tidak pernah sampai ke AI**, jadi tidak menimbulkan biaya AI.

---

## 4. Gerbang -1 — percakapan yang sudah dipegang manusia

Begitu seorang CS mengambil alih satu percakapan, AI otomatis bisu di percakapan itu selama **24 jam**.

Kenapa diperiksa paling awal: kalau pelanggan sudah mengobrol dengan manusia, AI menyela adalah kesalahan yang paling terlihat dan paling merusak kepercayaan. Lebih baik AI diam terlalu sering daripada menyela sekali.

---

## 5. Gerbang -0.5 — ada lampiran

Pelanggan mengirim foto tanaman yang rusak atau paket yang bocor.

AI tidak menerima gambar sama sekali. Meminta foto yang tidak bisa dilihat berarti membuat pelanggan menunggu penilaian yang tidak akan pernah terjadi. Jadi: ada lampiran, langsung ke CS manusia.

---

## 6. Gerbang 0 — SATPAM

Penjaga yang **tidak bisa dimatikan**, bahkan oleh admin.

**7 kategori** topik yang wajib ditangani manusia:

| Kategori | Contoh |
|---|---|
| Refund & retur | "mau refund", "batalkan pesanan" |
| Barang bermasalah | bocor, kurang, salah kirim |
| Keamanan | keracunan, anak, hewan peliharaan |
| Tanaman rusak | diduga akibat produk Infarm |
| Pelanggan marah | ancaman, sengketa |
| Minta manusia | "mau bicara dengan CS" |
| Transaksi luar | diarahkan keluar marketplace |

Daftarnya **diturunkan dari SOP CS Infarm**, bukan dikarang — setiap entri menyebut butir SOP asalnya. Isinya bisa diedit admin lewat halaman Kata Sensitif, tanpa menyentuh kode.

Satu hal yang **sengaja tidak** dimasukkan: "belum sampai". Itu pertanyaan pelacakan biasa dan jumlahnya paling banyak; memasukkannya akan membanjiri CS manusia dengan pertanyaan yang jawabannya ada di sistem pesanan.

---

## 7. Gerbang jadwal — AI tahu jam kerja tim CS

Default: **08:00–16:00 WIB AI diam.** Di luar jam itu AI menjawab.

Alasannya: selama tim CS bertugas, mereka lebih baik daripada AI. AI mengambil alih malam, dini hari, dan hari libur — justru saat persentase balasan cepat paling mudah jatuh.

Jadwalnya bisa diubah langsung dari header console, dan ada tombol "nyalakan sekarang" untuk keadaan mendadak.

**Peringatan tunggakan.** Kalau AI akan menyala dalam 30 menit dan masih ada chat yang belum dijawab, header menampilkan peringatan: *"AI nyala 12 menit lagi · 5 chat belum terjawab"*.

Tim diperingatkan **sebelum** tunggakan terbentuk. AI tidak pernah menyapu tunggakan diam-diam di belakang, karena chat yang sudah lama menunggu biasanya justru yang paling sensitif.

---

## 8. Gerbang 1 — balasan baku (biaya Rp 0)

**154 balasan baku** yang ditulis tim CS sendiri, diambil dari chat sungguhan. Dipicu oleh **43 aturan** pencocokan kata.

Bahasanya persis bahasa tim CS — termasuk "kak", emoji, dan gaya santainya. Pelanggan tidak bisa membedakan.

Aturannya bertingkat, jadi menyebut nama produk saja tidak memicu balasan dosis: *"NPK habis"* bukan pertanyaan dosis, sedangkan *"dosis NPK berapa"* iya.

Biayanya **nol rupiah, berapa kali pun**.

---

## 9. Gerbang 2 — Pengenal Maksud (~Rp 0,003 per pesan)

Masalah Gerbang 1: pelanggan tidak menulis seperti di buku.

> *"nem oilnya dipakenya gmn kak"*

Tidak ada satu kata pun yang sama dengan *"cara pakai neem oil"*. Gerbang 1 lewat.

Gerbang 2 mengubah kalimat menjadi deretan angka, lalu mencari balasan baku yang **maksudnya** paling dekat — bukan katanya. Ambangnya dijaga ketat: skor harus di atas 0,5 **dan** menang cukup jauh dari kandidat kedua, supaya tidak ada balasan terkirim hanya karena "kira-kira mirip".

Biaya sekitar **Rp 0,003 per pesan** — sekitar sepertiga rupiah untuk 100 pesan.

---

## 10. Claude Sonnet — lapisan terakhir

Hanya untuk pertanyaan yang benar-benar baru. Claude dibekali dua hal:

- **Aturan perilaku CS Infarm** — identitas, gaya bahasa, dan larangan mutlak
- **Knowledge Base resmi** — produk, dosis, FAQ

Larangan yang paling ketat: tidak boleh mengarang dosis, stok, harga, atau estimasi kirim; tidak boleh menjanjikan refund; tidak boleh menyatakan pesanan sudah dikirim tanpa data sistem. Kalau dasar jawabannya tidak ada, AI wajib mengalihkan ke manusia — **bukan** menjawab supaya terlihat membantu.

Balasan dibatasi 600 karakter, 2–5 kalimat pendek.

---

## 11. Isi console — 8 halaman

| Halaman | Fungsi |
|---|---|
| **Beranda** | Ringkasan hari ini: antrean tertua, chat masuk, eskalasi |
| **Chat** | Daftar percakapan per toko, tab "Menunggu balasan", ambil alih dari AI |
| **Pesanan** | Status pesanan, penilaian, refund, pembatalan |
| **AI Chatbot** | Panel uji: lihat sebuah pesan berhenti di gerbang mana, tanpa membayar AI |
| **Broadcast** | Kirim pesan massal |
| **Statistik** | Berapa dijawab otomatis, berapa dialihkan, kecepatan balas |
| **Knowledge Base** | Tim CS mengedit balasan baku & contoh pertanyaan sendiri |
| **Pengaturan** | Jadwal AI, kata sensitif, pengguna, toko |

Semua halaman responsif — nyaman dipakai di laptop maupun handphone, karena tim CS sering memantau dari ponsel.

---

## 12. Yang dikelola tim CS sendiri, tanpa programmer

Ini pembeda terbesar dibanding memakai layanan pihak ketiga:

- Menambah dan mengedit **balasan baku**
- Menambah **contoh pertanyaan** supaya Gerbang 2 makin pintar
- Mengubah **kata sensitif** yang wajib dialihkan ke manusia
- Mengubah **jadwal** AI
- Melihat **perkiraan biaya** sebelum menekan tombol yang berbayar

Pemeriksa mutu bawaan menolak contoh pertanyaan yang terlalu rapi — karena pelanggan sungguhan menulis "gmn", "brp", "kk", dan contoh yang terlalu bagus justru membuat Gerbang 2 meleset.

---

## 13. Keamanan

Audit **OWASP Top 10** dijalankan 17 September 2026: **16 temuan** tercatat, **2 temuan Critical sudah ditutup dan diverifikasi**.

Prinsip yang dipakai:

- Database memakai **Row Level Security** — setiap akun hanya melihat data yang memang haknya
- Kunci yang terkirim ke peramban **tidak bisa** membaca tabel pengaturan dan tabel internal; dibuktikan dengan uji otomatis
- Akun CS biasa **tidak bisa** menaikkan dirinya sendiri menjadi admin
- Kunci API (Claude, Voyage, Shopee) hanya hidup di sisi server, tidak pernah ikut terkirim ke peramban

---

## 14. Biaya

| Komponen | Biaya per bulan |
|---|---|
| Claude API (hanya pesan yang lolos semua gerbang) | Rp 150.000–400.000 |
| Pengenal Maksud (Voyage) | mendekati Rp 0 |
| Database & hosting (Supabase + Vercel) | Rp 0 |
| **Total** | **Rp 150.000–400.000** |

Dibandingkan Duoke Rp 500.000–2.000.000 per bulan — dengan dua tambahan: seluruh data percakapan tetap milik Infarm, dan aturannya bisa diubah kapan saja.

Pengaman saldo: ada kunci sisi server yang bisa mematikan panggilan berbayar seketika. Dipakai saat peragaan supaya demo tidak menghabiskan saldo.

---

## 15. Mutu: 410+ kasus uji otomatis, semuanya gratis

Setiap aturan penting punya uji otomatis yang bisa dijalankan tanpa biaya sepeser pun — termasuk kasus-kasus yang sengaja dibuat jahat:

- 54 kasus jadwal AI (termasuk jendela yang melewati tengah malam, dan nilai rusak yang bisa membisukan AI selamanya)
- 48 kasus pencocokan balasan baku
- 46 kasus pencarian
- 41 kasus jeda setelah CS mengambil alih
- 40 kasus kata sensitif
- 33 kasus peringatan tunggakan
- dan seterusnya

Artinya perubahan di kemudian hari bisa diuji sebelum menyentuh pelanggan.

---

## 16. Status hari ini

**Sudah jalan:**

- Seluruh rangkaian gerbang, dari -1 sampai Claude
- Console 8 halaman, sudah dipakai tim CS untuk mengisi balasan baku
- Jadwal AI, peringatan tunggakan, ambil alih percakapan
- Keamanan: 2 temuan Critical ditutup

**Masih menunggu pihak luar:**

- **Chat Shopee belum tersambung.** Butuh persetujuan whitelist Shopee untuk izin mengirim pesan. Pengajuan sedang diproses lewat Account Manager.
- Jalur teknis ke Shopee **sudah terbukti** di lingkungan sandbox: tanda tangan permintaan, otorisasi toko, dan pengambilan data sudah berhasil. Pindah ke produksi hanya mengganti alamat server dan kunci — bukan menulis ulang.

**Jujur soal batasnya:**

- Halaman Pesanan masih memakai data contoh sampai akses pesanan sungguhan dibuka
- Gerbang 2 berjalan dalam mode bayangan: keputusannya dihitung dan dicatat, tapi belum dikirim ke pelanggan — sengaja, supaya ketepatannya terbukti dulu sebelum dipercaya

---

## 17. Kesimpulan

Yang dibangun bukan chatbot, tapi **sistem penyaring berlapis** di mana AI adalah pilihan terakhir, bukan yang pertama.

Hasilnya tiga hal sekaligus:

1. **Cepat** — pertanyaan berulang dijawab seketika, 24 jam
2. **Aman** — refund, keracunan, dan pelanggan marah tidak pernah disentuh AI
3. **Murah** — sekitar sepertiga biaya layanan langganan, dan aturannya milik sendiri

Yang tersisa sebelum melayani pelanggan sungguhan adalah **izin**, bukan pekerjaan teknis.
