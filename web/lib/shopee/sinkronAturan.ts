/* ===========================================================
   Aturan sinkronisasi pesanan Shopee — fungsi murni.

   Tidak membaca env, tidak menyentuh jaringan atau database. Diuji
   oleh scripts/uji-shopee-pemeta.mjs. Yang menyentuh Shopee ada di
   tarikPesanan.ts, yang menyentuh database di sinkron.ts.
   =========================================================== */

/**
 * Batas Shopee: selisih time_from–time_to paling lama 15 hari per
 * panggilan get_order_list. 14 dipakai supaya tidak berada persis di
 * batas yang tidak dijelaskan inklusif atau tidak.
 */
export const MAKS_HARI_PER_PANGGILAN = 14;

/** Batas Shopee: order_sn_list get_order_detail "limit [1,50]". */
export const MAKS_DETAIL_PER_PANGGILAN = 50;

/** Batas Shopee: page_size get_order_list "between 1 and 100". */
export const PAGE_SIZE_DAFTAR = 100;

/**
 * Saat pertama kali menyinkronkan sebuah toko, seberapa jauh ke
 * belakang. 1 hari — sesuai brief. Riwayat lebih lama diambil dengan
 * memundurkan orders_synced_until secara manual bila diperlukan.
 */
export const HARI_PERTAMA_KALI = 1;

/**
 * Jendela berikutnya mulai sedikit SEBELUM titik sinkronisasi
 * terakhir. Tanpa ini, pesanan yang update_time-nya tepat di detik
 * terakhir jendela sebelumnya bisa terlewat; dengan ini ia ditarik
 * dua kali — dan upsert membuat itu tidak berbahaya.
 */
export const TUMPANG_TINDIH_DETIK = 5 * 60;

/**
 * Field opsional yang diminta dari get_order_detail.
 *
 * Daftar ini adalah PAGAR DATA PRIBADI: apa pun yang tidak disebut
 * di sini tidak pernah keluar dari Shopee, jadi tidak pernah masuk
 * orders_raw sekalipun. recipient_address, dropshipper_phone, dan
 * buyer_cpf_id sengaja tidak ada. Uji di uji-shopee-pemeta.mjs
 * menjaga supaya tidak ada yang menambahkannya "sementara".
 */
export const FIELD_OPSIONAL_DETAIL: readonly string[] = [
  "buyer_user_id",
  "buyer_username",
  "item_list",
  "total_amount",
  "shipping_carrier",
];

export type Rentang = { dari: number; sampai: number };

/**
 * Pecah rentang [dari, sampai] (epoch detik) menjadi potongan yang
 * masing-masing tidak melebihi maksHari. Potongan berurutan dan
 * bersambung; rentang kosong atau terbalik -> [].
 */
export function pecahRentang(
  dari: number,
  sampai: number,
  maksHari: number = MAKS_HARI_PER_PANGGILAN,
): Rentang[] {
  if (!Number.isFinite(dari) || !Number.isFinite(sampai) || dari >= sampai) return [];
  const lebar = Math.max(1, Math.floor(maksHari)) * 86_400;
  const hasil: Rentang[] = [];
  let awal = dari;
  while (awal < sampai) {
    const akhir = Math.min(awal + lebar, sampai);
    hasil.push({ dari: awal, sampai: akhir });
    awal = akhir;
  }
  return hasil;
}

/**
 * Dari mana jendela sinkronisasi dimulai.
 *
 * @param syncedUntilIso orders_synced_until toko, null bila belum pernah.
 * @param sekarangDetik epoch detik.
 */
export function titikMulai(syncedUntilIso: string | null | undefined, sekarangDetik: number): number {
  const bawaan = sekarangDetik - HARI_PERTAMA_KALI * 86_400;
  if (!syncedUntilIso) return bawaan;
  const t = Date.parse(syncedUntilIso);
  if (Number.isNaN(t)) return bawaan;
  const terakhir = Math.floor(t / 1000);
  /* Nilai di masa depan (jam server pernah salah) tidak boleh
     membuat jendela kosong selamanya. */
  const mulai = Math.min(terakhir, sekarangDetik) - TUMPANG_TINDIH_DETIK;
  return Math.max(mulai, 0);
}

/** Bagi larik menjadi potongan berukuran n. n <= 0 -> satu potongan. */
export function bagi<T>(larik: readonly T[], n: number): T[][] {
  if (larik.length === 0) return [];
  const ukuran = Number.isFinite(n) && n > 0 ? Math.floor(n) : larik.length;
  const hasil: T[][] = [];
  for (let i = 0; i < larik.length; i += ukuran) hasil.push(larik.slice(i, i + ukuran));
  return hasil;
}

/* ===========================================================
   SINKRON SKALA BESAR (perbaikan-sinkron-skala-besar, 12 Nov 2026)

   Toko utama Infarm berganti 6–10 ribu pesanan per hari. Menarik satu
   hari utuh dalam satu panggilan route tidak pernah muat di batas
   waktu fungsi, dan karena titik sinkron dulu baru dimajukan di AKHIR,
   setiap percobaan mengulang jendela yang sama — makin lebar — tanpa
   pernah selesai. Aturan di bawah memecah pekerjaan menjadi potongan
   yang masing-masing disimpan lalu dicatat sebelum potongan berikutnya.
   =========================================================== */

/** Lebar potongan bawaan: 1 jam. */
export const LEBAR_POTONGAN_DETIK = 60 * 60;

/** Potongan dengan order_sn lebih dari ini dibelah dua sebelum detail ditarik. */
export const MAKS_SN_PER_POTONGAN = 1_000;

/** Potongan tidak dibelah lebih sempit dari ini, berapa pun isinya. */
export const LEBAR_POTONGAN_MIN_DETIK = 60;

/** Batas waktu route sinkron pesanan (= export maxDuration di route). */
export const BATAS_ROUTE_DETIK = 300;

/** Margin aman sebelum batas route: berhenti mengambil potongan baru. */
export const MARGIN_AMAN_DETIK = 30;

/** Sisa waktu minimum untuk memulai potongan baru, walau potongan sebelumnya cepat. */
export const SISA_MIN_POTONGAN_MS = 20_000;

/**
 * Lama kunci sinkron per toko. Lebih panjang dari batas route, supaya
 * kunci milik proses yang masih hidup tidak pernah dianggap tertinggal;
 * kunci milik fungsi yang mati lepas sendiri setelah waktu ini.
 */
export const LAMA_KUNCI_SINKRON_DETIK = BATAS_ROUTE_DETIK + 60;

/**
 * Pecah [dari, sampai] (epoch detik) menjadi potongan selebar `lebar`
 * detik. Bersambung tanpa celah; rentang kosong/terbalik/rusak -> [].
 */
export function pecahPotongan(dari: number, sampai: number, lebar: number = LEBAR_POTONGAN_DETIK): Rentang[] {
  if (!Number.isFinite(dari) || !Number.isFinite(sampai) || dari >= sampai) return [];
  const l = Number.isFinite(lebar) && lebar >= 1 ? Math.floor(lebar) : LEBAR_POTONGAN_DETIK;
  const hasil: Rentang[] = [];
  for (let awal = dari; awal < sampai; awal += l) hasil.push({ dari: awal, sampai: Math.min(awal + l, sampai) });
  return hasil;
}

/**
 * Pembelahan adaptif: potongan yang order_sn-nya melebihi batas dibelah
 * dua (kiri dulu, supaya titik sinkron tetap maju berurutan). null =
 * tidak perlu dibelah, atau sudah terlalu sempit untuk dibelah — potongan
 * itu diproses apa adanya.
 */
export function belahBilaPerlu(
  p: Rentang,
  jumlahSn: number,
  batas: number = MAKS_SN_PER_POTONGAN,
  lebarMin: number = LEBAR_POTONGAN_MIN_DETIK,
): [Rentang, Rentang] | null {
  if (!(jumlahSn > batas)) return null;
  const lebar = p.sampai - p.dari;
  if (!(lebar >= lebarMin * 2)) return null;
  const tengah = p.dari + Math.floor(lebar / 2);
  return [
    { dari: p.dari, sampai: tengah },
    { dari: tengah, sampai: p.sampai },
  ];
}

/** Batas waktu (epoch ms) panggilan route yang dimulai pada mulaiMs. */
export function tenggatRoute(
  mulaiMs: number,
  batasDetik: number = BATAS_ROUTE_DETIK,
  marginDetik: number = MARGIN_AMAN_DETIK,
): number {
  return mulaiMs + Math.max(0, batasDetik - marginDetik) * 1000;
}

/**
 * Bolehkah potongan berikutnya dimulai? Butuh sisa waktu sedikitnya dua
 * kali potongan terlama sejauh ini, dan tidak kurang dari
 * SISA_MIN_POTONGAN_MS. Nilai rusak = tidak boleh (berhenti lebih awal
 * selalu aman: titik sinkron sudah tercatat sampai potongan terakhir).
 */
export function bolehMulaiPotongan(sekarangMs: number, tenggatMs: number, potonganTerlamaMs: number = 0): boolean {
  if (!Number.isFinite(sekarangMs) || !Number.isFinite(tenggatMs)) return false;
  const terlama = Number.isFinite(potonganTerlamaMs) && potonganTerlamaMs > 0 ? potonganTerlamaMs : 0;
  return tenggatMs - sekarangMs >= Math.max(SISA_MIN_POTONGAN_MS, terlama * 2);
}

/**
 * Titik sinkron baru sesudah sebuah potongan TERSIMPAN. Tidak pernah
 * mundur: potongan yang lebih awal dari titik sekarang tidak mengubahnya.
 */
export function majukanTitik(titikSekarangIso: string | null | undefined, ujungPotonganDetik: number): string {
  const baru = ujungPotonganDetik * 1000;
  const lama = titikSekarangIso ? Date.parse(titikSekarangIso) : Number.NaN;
  return new Date(Number.isFinite(lama) && lama > baru ? lama : baru).toISOString();
}

/**
 * Kunci sinkron masih dipegang proses lain? Nilai kosong atau rusak =
 * bebas (pemegangnya mungkin mati, dan kunci yang tak bisa dibaca tidak
 * boleh mengunci toko selamanya). Kunci yang terlalu jauh di masa depan
 * — lebih dari dua kali lama kunci — juga dianggap rusak.
 */
export function kunciSinkronDipegang(sampaiIso: string | null | undefined, sekarangMs: number): boolean {
  if (!sampaiIso) return false;
  const t = Date.parse(sampaiIso);
  if (Number.isNaN(t)) return false;
  if (t - sekarangMs > LAMA_KUNCI_SINKRON_DETIK * 2 * 1000) return false;
  return t > sekarangMs;
}

/** Waktu dalam ms dari ISO; null/rusak -> null. */
function msDari(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/**
 * Pisahkan pesanan hasil pemetaan menjadi yang perlu ditulis dan yang
 * dilewati karena update_time Shopee-nya SAMA dengan baris yang sudah
 * ada. Baris yang belum ada, atau yang waktunya tidak terbaca di salah
 * satu sisi, selalu ditulis — melewatkan yang ragu bisa membuat status
 * pesanan membeku.
 */
export function pisahkanBerubah<T extends { external_order_id: string; order_updated_at: string | null }>(
  baris: readonly T[],
  yangAda: ReadonlyMap<string, string | null>,
): { tulis: T[]; lewati: T[] } {
  const tulis: T[] = [];
  const lewati: T[] = [];
  for (const b of baris) {
    const lama = msDari(yangAda.get(b.external_order_id));
    const baru = msDari(b.order_updated_at);
    if (lama !== null && baru !== null && lama === baru) lewati.push(b);
    else tulis.push(b);
  }
  return { tulis, lewati };
}

/* ---------------- orders_raw: SHOPEE_SIMPAN_RAW ---------------- */

export type ModeRaw = "off" | "galat" | "semua";

/** Nilai env SHOPEE_SIMPAN_RAW. Kosong atau tidak dikenal -> 'galat'. */
export function bacaModeRaw(nilai: string | null | undefined): ModeRaw {
  const v = (nilai ?? "").trim().toLowerCase();
  return v === "off" || v === "semua" ? v : "galat";
}

/**
 * Perlukah jawaban mentah pesanan ini disimpan di orders_raw? Mode
 * 'galat' hanya menyimpan pesanan yang pemetaannya meragukan: status
 * jatuh ke 'lainnya', status asli kosong, barang kosong, atau waktu
 * dibuat tidak terbaca — persis kasus yang butuh dilihat saat debug.
 */
export function perluSimpanRaw(
  mode: ModeRaw,
  p: { status: string; raw_status: string | null; items: readonly unknown[] | null; order_created_at: string | null },
): boolean {
  if (mode === "semua") return true;
  if (mode === "off") return false;
  return (
    p.status === "lainnya" ||
    !p.raw_status ||
    !Array.isArray(p.items) ||
    p.items.length === 0 ||
    !p.order_created_at
  );
}

/* ---------------- Dua sakelar: siapa disinkronkan, kapan ---------------- */

export type KeputusanSinkron = "jalan" | "dilewati_toko_nonaktif" | "dilewati_mode_manual";

/**
 * Sakelar 1 (per toko, marketplace_shops.sinkron_pesanan) dan sakelar 2
 * (settings.sinkron_pesanan_otomatis). HANYA `true` yang berarti nyala;
 * null, string, angka, atau nilai rusak apa pun = mati. Tombol admin
 * tidak melihat mode jadwal, tetapi tetap tunduk pada sakelar toko.
 */
export function keputusanSinkron(a: {
  pemicu: "cron" | "admin";
  sinkronPesanan: unknown;
  modeOtomatis: unknown;
}): KeputusanSinkron {
  if (a.sinkronPesanan !== true) return "dilewati_toko_nonaktif";
  if (a.pemicu === "admin") return "jalan";
  if (a.pemicu === "cron" && a.modeOtomatis === true) return "jalan";
  return "dilewati_mode_manual";
}

/* ---------------- Tombol "Sinkronkan sekarang" ---------------- */

/** Batas putaran per toko per klik — pagar terhadap putaran tanpa akhir. */
export const MAKS_PUTARAN_TOMBOL = 40;

/**
 * Setelah satu jawaban route, apakah tombol memanggil lagi untuk toko
 * yang sama? Hanya untuk "belum_selesai", belum dihentikan pengguna,
 * dan belum melewati batas putaran. Galat, dilewati, atau status asing
 * = berhenti.
 */
export function lanjutPutaran(
  status: unknown,
  putaranKe: number,
  dihentikan: boolean,
  maks: number = MAKS_PUTARAN_TOMBOL,
): boolean {
  if (dihentikan) return false;
  if (!(Number.isFinite(putaranKe) && putaranKe < maks)) return false;
  return status === "belum_selesai";
}
