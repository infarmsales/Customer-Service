/* ===========================================================
   Batas umur sesi login — SEC-018.

   MASALAHNYA

   lib/supabase/client.ts menyalakan persistSession dan
   autoRefreshToken, dan Supabase menyimpan sesinya di localStorage.
   Dua sifat itu bergabung jadi satu akibat yang tidak pernah
   disengaja: token penyegar bertahan melewati penutupan peramban,
   lalu diperbarui sendiri tanpa batas. Sesi yang dibuat sekali
   hidup selamanya sampai ada yang menekan tombol keluar.

   Di komputer pribadi itu kenyamanan. Di komputer bersama — meja CS,
   PC gudang, laptop yang dipinjam — artinya siapa pun yang membuka
   peramban langsung masuk sebagai orang terakhir, tanpa kata sandi.

   KENAPA DI SINI, BUKAN DI SUPABASE

   Tempat yang benar sebenarnya Supabase: Authentication -> Sessions
   punya Time-box user sessions dan Inactivity timeout, dan keduanya
   berlaku DI SISI SERVER sehingga tokennya betul-betul mati. Pada
   2 Okt 2026 keduanya ternyata terkunci di paket Pro, dan menaikkan
   paket demi satu setelan akan melipatgandakan biaya bulanan
   proyek ini.

   Berkas ini adalah penggantinya, dan batasnya harus disebut jujur:
   ia berjalan DI PERAMBAN. Ia menutup ancaman yang nyata di kantor —
   orang lain duduk di komputer yang ditinggal — tetapi tidak
   menghentikan orang yang sengaja menyalin token dari devtools
   sebelum penghitungnya jalan. Hanya batas sisi server yang bisa.

   KENAPA DUA LAPIS, BUKAN SATU

   Keduanya menangani keadaan yang berbeda dan tidak saling
   menggantikan:

     umur sesi     tab sudah ditutup, orangnya datang lagi besok.
                   Tidak ada penghitung yang jalan semalaman, jadi
                   satu-satunya cara tahu adalah membandingkan jam
                   masuk terakhir dengan jam sekarang saat console
                   dibuka.

     waktu diam    tab masih terbuka dan console masih menyala di
                   layar, tetapi tidak ada yang menyentuhnya sejak
                   shift berakhir. Umur sesi belum tentu lewat —
                   penghitung diamlah yang menangkapnya.

   SIKAP TERHADAP NILAI YANG TIDAK TERBACA

   Keduanya memilih TIDAK mengeluarkan. Alasannya bukan kelonggaran,
   melainkan satu kegagalan yang jauh lebih buruk daripada sesi yang
   kepanjangan: kalau last_sign_in_at suatu hari tidak terisi, sikap
   "tidak terbaca = keluarkan" membuat setiap login langsung diikuti
   logout — masuk, keluar, masuk, keluar — dan console menjadi
   mustahil dipakai tanpa ada yang mengerti sebabnya.

   Nilai yang tidak terbaca adalah bug, dan bug tidak boleh mengunci
   seluruh tim CS di luar pintu. Yang dilakukan: kembalikan false,
   dan biarkan pemanggilnya mencatat peringatan.
   =========================================================== */

/**
 * Berapa lama sesi boleh hidup sejak kata sandi terakhir diketik.
 *
 * 12 jam dipilih supaya tidak ada sesi yang menyeberang hari: shift
 * CS 08.00–16.00, jadi sesi pagi mati sebelum shift besok dimulai,
 * sementara lembur sampai malam tidak terputus di tengah kerja.
 */
export const BATAS_USIA_SESI_JAM = 12;

/**
 * Berapa lama console boleh dibiarkan tanpa disentuh.
 *
 * 60 menit cukup longgar untuk rapat, makan siang, dan antre ke
 * gudang — tetapi menutup PC yang ditinggal pulang pukul 16.00
 * sebelum kantor benar-benar sepi.
 */
export const BATAS_DIAM_MENIT = 60;

/**
 * Umur sesi dalam jam, dihitung dari jam masuk terakhir.
 *
 * @param masukTerakhir `user.last_sign_in_at` dari Supabase, ISO-8601.
 *   Nilai ini TIDAK ikut berubah saat token disegarkan — itulah
 *   sebabnya ia yang dipakai, bukan `session.expires_at` yang hanya
 *   berumur satu jam dan selalu diperbarui.
 * @returns null bila tidak terbaca; lihat catatan di kepala berkas.
 */
export function usiaSesiJam(
  masukTerakhir: string | null | undefined,
  sekarang: Date,
): number | null {
  if (!masukTerakhir) return null;
  const mulai = Date.parse(masukTerakhir);
  if (Number.isNaN(mulai)) return null;

  const selisih = sekarang.getTime() - mulai;

  /* Selisih negatif berarti jam masuk ada di masa depan: jam
     peramban mundur, atau jam server maju. Umurnya dianggap nol,
     bukan dibiarkan negatif — supaya tidak ada keadaan di mana
     sesi justru terlihat makin muda seiring waktu. */
  return Math.max(0, selisih) / 3_600_000;
}

/** Apakah sesi sudah terlalu tua dan pemiliknya harus mengetik kata sandi lagi? */
export function sesiKedaluwarsa(
  masukTerakhir: string | null | undefined,
  sekarang: Date,
  batasJam: number = BATAS_USIA_SESI_JAM,
): boolean {
  const usia = usiaSesiJam(masukTerakhir, sekarang);
  if (usia === null) return false;

  /* Batas yang tidak masuk akal (0, negatif, NaN) diabaikan, bukan
     diturutkan. Nilai 0 secara harfiah berarti "kedaluwarsa pada
     milidetik yang sama dengan login" — persis jebakan masuk-keluar
     yang dijelaskan di kepala berkas. */
  if (!Number.isFinite(batasJam) || batasJam <= 0) return false;

  return usia >= batasJam;
}

/**
 * Apakah console dibiarkan tanpa disentuh terlalu lama?
 *
 * @param terakhirAktif epoch milidetik sentuhan terakhir
 *   (Date.now() saat klik atau ketik).
 * @param sekarang epoch milidetik.
 */
export function diamTerlaluLama(
  terakhirAktif: number,
  sekarang: number,
  batasMenit: number = BATAS_DIAM_MENIT,
): boolean {
  if (!Number.isFinite(terakhirAktif) || !Number.isFinite(sekarang)) return false;
  if (!Number.isFinite(batasMenit) || batasMenit <= 0) return false;

  /* Sentuhan terakhir di masa depan: jam peramban baru saja mundur.
     Dianggap baru saja aktif, bukan diam selamanya. */
  const diam = sekarang - terakhirAktif;
  if (diam < 0) return false;

  return diam >= batasMenit * 60_000;
}

/**
 * Alasan sesi diakhiri, untuk ditampilkan di halaman login.
 *
 * Tanpa kalimat ini, pengguna yang tiba-tiba kembali ke layar login
 * akan menyangka console-nya rusak. Itu keluhan yang paling mahal:
 * ia terlihat persis seperti kegagalan, padahal justru pengamannya
 * yang bekerja.
 */
export type SebabKeluar = "umur" | "diam";

export function pesanKeluar(sebab: SebabKeluar): string {
  return sebab === "umur"
    ? `Sesi berakhir setelah ${BATAS_USIA_SESI_JAM} jam. Silakan masuk lagi.`
    : `Keluar otomatis setelah ${BATAS_DIAM_MENIT} menit tanpa aktivitas.`;
}
