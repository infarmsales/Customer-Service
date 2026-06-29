# TEST PLAN — Sinkronisasi Multi-Admin
**Aplikasi:** Infarm CS — Customer Service Console
**Versi dokumen:** 1.0 · **Dibuat:** 25 Juni 2026
**Acuan:** `claude.md` (SOP & klasifikasi aksi), Tech Stack (Supabase Realtime, tabel `conversations` & `escalations`)

---

## 1. Tujuan
Memastikan saat aplikasi dipakai **3 admin secara bersamaan**, data tetap **konsisten**, tidak ada **balasan ganda** ke pelanggan, dan tidak ada **pemrosesan dobel** (refund/pembatalan). Pengujian fokus pada kondisi *concurrent* (aksi serempak), bukan sekadar fitur jalan.

## 2. Prasyarat (WAJIB sebelum mulai)
> ⚠️ Saat ini data masih mock per-browser. Sinkronisasi nyata baru bisa diuji setelah item di bawah aktif.

- [ ] Backend berjalan (`backend/` — `npm run dev`)
- [ ] Supabase Realtime aktif untuk tabel `conversations` & `escalations`
- [ ] Endpoint live: status chat, klaim chat, unread count, keputusan pembatalan
- [ ] 3 akun admin tersedia (mis. Admin A, Admin B, Admin C)
- [ ] Mekanisme penguncian (lock) / idempotensi pada aksi kritikal sudah dipasang

## 3. Lingkungan Uji
- 3 sesi terpisah: 3 browser / mode incognito / 3 perangkat
- 1 pengamat memantau **admin ketiga** saat 2 admin lain beraksi
- Alat bantu: DevTools → Network (untuk throttling & cek payload), stopwatch

## 4. Definisi Lulus (Pass Criteria)
- Setelah sebuah aksi, data Admin A = B = C (tanpa refresh manual)
- Tidak ada balasan ganda terkirim ke pelanggan
- Aksi pada objek yang sama hanya berefek **satu kali**
- Sinkron muncul di admin lain **< 2 detik** (jaringan normal)

---

## 5. Checklist Pengujian

### A. Klaim & Penanganan Chat
- [ ] **A1 — Klaim chat bersamaan.** Admin A & B membuka chat yang sama (mis. `budi.santoso`) di waktu sama.
  - *Diharapkan:* hanya 1 admin yang "memegang"; yang lain melihat label "sedang ditangani Admin A". Tidak bisa dobel-balas.
- [ ] **A2 — Balasan real-time.** Admin A mengirim pesan ke pelanggan.
  - *Diharapkan:* Admin B & C melihat pesan itu muncul tanpa refresh, urutan benar.
- [ ] **A3 — Lepas/alih chat.** Admin A melepas chat, Admin B mengambil.
  - *Diharapkan:* kepemilikan berpindah bersih, tidak nyangkut di dua admin.

### B. Badge & Antrian
- [ ] **B1 — Badge belum-dibaca.** Admin A membuka chat yang belum dibaca.
  - *Diharapkan:* badge 💬 di Admin B & C ikut berkurang, tidak menghitung ganda.
- [ ] **B2 — Chat baru masuk.** Pelanggan kirim chat baru.
  - *Diharapkan:* muncul di antrian ketiga admin dengan jumlah yang sama.
- [ ] **B3 — Tidak ada chat "jatuh".** Setelah berbagai aksi, tidak ada chat yang hilang dari antrian semua admin.

### C. Handover / Eskalasi (claude.md)
- [ ] **C1 — Eskalasi ke CS.** Admin A klik "Alihkan ke CS" (HANDOVER_TO_CS).
  - *Diharapkan:* status + ringkasan handover muncul di Admin B/C, tidak dobel.
- [ ] **C2 — Resolusi eskalasi.** Admin B menandai eskalasi selesai.
  - *Diharapkan:* status "selesai" tampil sinkron di semua admin.

### D. AI Auto-Reply vs Admin (claude.md)
- [ ] **D1 — Tabrakan AI & manusia.** AI sedang menyiapkan balasan saat Admin A mengambil alih & mengetik.
  - *Diharapkan:* hanya 1 balasan terkirim; AI berhenti saat chat diambil alih manusia.
- [ ] **D2 — Aturan klasifikasi.** Pesan refund masuk.
  - *Diharapkan:* AI tidak auto-reply, otomatis HANDOVER_TO_CS, sama di semua admin.

### E. Pesanan Dibatalkan — Aksi Massal (fitur baru)
- [ ] **E1 — Approve dobel.** Admin A & B menyetujui **pesanan yang sama** bersamaan.
  - *Diharapkan:* pesanan dibatalkan **sekali saja**; admin yang kalah dapat pesan "sudah diproses admin lain".
- [ ] **E2 — Approve vs Reject bentrok.** Admin A "Setujui" (batalkan) & Admin B "Tolak" (lanjutkan) pesanan sama, bersamaan.
  - *Diharapkan:* hasil deterministik (aturan jelas siapa menang), bukan status campur aduk.
- [ ] **E3 — Hitungan tab sinkron.** Setelah keputusan, jumlah pada tab (Menunggu/Sudah Diproses/Sudah Dibatalkan) update benar di semua admin.
- [ ] **E4 — Idempotensi.** Klik "Setujui" 2× cepat oleh 1 admin.
  - *Diharapkan:* hanya 1× efek.

### F. Pengaturan (Settings)
- [ ] **F1 — Perubahan global.** Admin A ubah model Claude / ambang keyakinan / kata kunci eskalasi.
  - *Diharapkan:* berlaku untuk semua admin (1 sumber kebenaran), bukan per-browser.
- [ ] **F2 — Edit bersamaan.** Admin A & B menyimpan pengaturan berbeda hampir bersamaan.
  - *Diharapkan:* tidak ada data korup; aturan konflik jelas (last-write-wins + log).

### G. Broadcast
- [ ] **G1 — Buat tugas bersamaan.** Admin A & B membuat tugas broadcast di marketplace sama.
  - *Diharapkan:* kedua tugas tercatat, kuota terpotong benar, tidak dobel/hilang.
- [ ] **G2 — Kuota habis.** Kuota broadcast mendekati nol saat 2 admin mengirim.
  - *Diharapkan:* sistem cegah over-limit secara konsisten.

### H. Ketahanan Jaringan
- [ ] **H1 — Reconnect.** Admin C putus koneksi, lalu tersambung lagi.
  - *Diharapkan:* data menyusul lengkap, tanpa duplikat / tanpa kehilangan.
- [ ] **H2 — Jaringan lambat.** Throttle (DevTools) ke "Slow 3G", ulangi A2 & E1.
  - *Diharapkan:* tidak ada balasan/aksi ganda akibat lambatnya respons.

### I. Hak Akses (jika ada beda peran)
- [ ] **I1 — Aksi terbatas.** Admin dengan peran terbatas mencoba aksi terlarang.
  - *Diharapkan:* ditolak konsisten di server, bukan hanya disembunyikan di UI.

---

## 6. Aspek yang Dinilai di Setiap Kasus
| Aspek | Pertanyaan |
|---|---|
| Konsistensi | Apakah A = B = C setelah aksi? |
| Race condition | Apakah 2 aksi serempak menghasilkan data benar? |
| Idempotensi | Apakah klik/aksi ganda tetap berefek 1×? |
| Latensi | Berapa detik sinkron muncul di admin lain? |
| Urutan | Apakah urutan pesan sama di semua admin? |
| Recovery | Setelah putus-sambung, data benar? |

## 7. Prioritas
1. **Kritikal:** A1, A2, D1, E1, E2 (mencegah balasan ganda & pembatalan dobel)
2. **Tinggi:** B1, C1, E3, F1, H1
3. **Sedang:** B2, B3, C2, D2, E4, G1, G2, F2, H2, I1

## 8. Format Pencatatan Hasil
| ID | Tanggal | Penguji | Hasil (Lulus/Gagal) | Latensi | Catatan / Bug |
|----|---------|---------|---------------------|---------|----------------|
| A1 |         |         |                     |         |                |
| A2 |         |         |                     |         |                |
| …  |         |         |                     |         |                |

## 9. Sign-off
- [ ] Semua kasus **Kritikal** lulus
- [ ] Tidak ada bug duplikasi data terbuka
- Diuji oleh: ________________  Tanggal: __________
- Disetujui oleh: ________________  Tanggal: __________
