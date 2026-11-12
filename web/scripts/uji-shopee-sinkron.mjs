/* ===========================================================
   Uji aturan sinkron pesanan skala besar (lib/shopee/sinkronAturan.ts).

     npm run uji-shopee-sinkron

   Biaya Rp 0: tanpa jaringan, tanpa database, tanpa Shopee.

   Yang dijaga — semuanya bentuk kegagalan yang TIDAK terlihat sebagai
   galat di layar:
     - sinkron pertama toko besar yang macet selamanya (titik sinkron
       tidak pernah maju, jendela makin lebar)
     - toko besar yang ikut ditarik JADWAL otomatis hanya karena baru diotorisasi
       lewat akun utama
     - cron yang menarik pesanan padahal mode jadwal manual
     - kunci yang tertinggal dan mengunci toko selamanya
     - status pesanan yang membeku karena "tidak berubah" salah tebak

   Simulasi di bagian "Cicilan" meniru urutan cicilToko() di
   lib/shopee/sinkron.ts memakai fungsi murni yang sama. Ia membuktikan
   ATURANNYA; perilaku dengan Shopee dan database sungguhan belum
   terbukti di sini.
   =========================================================== */

import { readFileSync } from "node:fs";
import {
  BATAS_ROUTE_DETIK,
  LAMA_KUNCI_SINKRON_DETIK,
  LEBAR_POTONGAN_DETIK,
  LEBAR_POTONGAN_MIN_DETIK,
  MAKS_PUTARAN_TOMBOL,
  MAKS_SN_PER_POTONGAN,
  MARGIN_AMAN_DETIK,
  SISA_MIN_POTONGAN_MS,
  bacaModeRaw,
  belahBilaPerlu,
  bolehMulaiPotongan,
  keputusanSinkron,
  kunciSinkronDipegang,
  lanjutPutaran,
  majukanTitik,
  pecahPotongan,
  perluSimpanRaw,
  pisahkanBerubah,
  tenggatRoute,
} from "../lib/shopee/sinkronAturan.ts";
import { barisSimpanToko, daftarTokoAkunUtama } from "../lib/shopee/otorisasi.ts";

let lulus = 0;
let gagal = 0;
function uji(nama, dapat, harap) {
  if (JSON.stringify(dapat) === JSON.stringify(harap)) {
    lulus++;
    console.log(`  v ${nama}`);
  } else {
    gagal++;
    console.log(`  X ${nama}`);
    console.log(`      harap : ${JSON.stringify(harap)}`);
    console.log(`      dapat : ${JSON.stringify(dapat)}`);
  }
}

const JAM = 3600;
const HARI = 86_400;
const T0 = 1_762_905_600; // 12 Nov 2025 00:00:00 UTC, epoch detik
const bersambung = (ps, dari, sampai) =>
  ps.length > 0 && ps[0].dari === dari && ps[ps.length - 1].sampai === sampai && ps.every((p, i) => i === 0 || p.dari === ps[i - 1].sampai);

/* ------------------------------------------------------------ */
console.log("\nKonstanta saling sepadan");
{
  const route = readFileSync(new URL("../app/api/sync/shopee-orders/route.ts", import.meta.url), "utf8");
  const m = route.match(/export const maxDuration = (\d+);/);
  uji("maxDuration route = BATAS_ROUTE_DETIK", m ? Number(m[1]) : null, BATAS_ROUTE_DETIK);
  uji("maxDuration 300 (batas Vercel Hobby + Fluid Compute)", BATAS_ROUTE_DETIK, 300);
  uji("kunci lebih lama dari batas route", LAMA_KUNCI_SINKRON_DETIK > BATAS_ROUTE_DETIK, true);
  uji("margin aman 30 detik", MARGIN_AMAN_DETIK, 30);
  uji("potongan bawaan 1 jam", LEBAR_POTONGAN_DETIK, JAM);
}

/* ------------------------------------------------------------ */
console.log("\npecahPotongan — jendela dipecah per jam");
{
  const satuHari = pecahPotongan(T0, T0 + HARI);
  uji("1 hari = 24 potongan", satuHari.length, 24);
  uji("bersambung tanpa celah, ujung tepat", bersambung(satuHari, T0, T0 + HARI), true);
  uji("tiap potongan 1 jam", satuHari.every((p) => p.sampai - p.dari === JAM), true);
  const ganjil = pecahPotongan(T0, T0 + 90 * 60);
  uji("90 menit = 1 jam + 30 menit", ganjil.map((p) => p.sampai - p.dari), [JAM, 30 * 60]);
  uji("rentang kosong = []", pecahPotongan(T0, T0), []);
  uji("rentang terbalik = []", pecahPotongan(T0 + 10, T0), []);
  uji("NaN = []", pecahPotongan(Number.NaN, T0), []);
  uji("lebar rusak jatuh ke 1 jam", pecahPotongan(T0, T0 + 2 * JAM, 0).length, 2);
}

/* ------------------------------------------------------------ */
console.log("\nbelahBilaPerlu — pembelahan adaptif (lonjakan 12.12)");
{
  const p = { dari: T0, sampai: T0 + JAM };
  uji("di bawah batas = tidak dibelah", belahBilaPerlu(p, 999), null);
  uji("tepat batas = tidak dibelah", belahBilaPerlu(p, MAKS_SN_PER_POTONGAN), null);
  const b = belahBilaPerlu(p, MAKS_SN_PER_POTONGAN + 1);
  uji("lebih dari batas = dua belahan", b?.length, 2);
  uji("belahan bersambung, kiri dulu", b ? bersambung(b, p.dari, p.sampai) : false, true);
  uji("belahan sama lebar", b ? b[0].sampai - b[0].dari : null, JAM / 2);
  const sempit = { dari: T0, sampai: T0 + LEBAR_POTONGAN_MIN_DETIK * 2 - 1 };
  uji("terlalu sempit = tidak dibelah (diproses apa adanya)", belahBilaPerlu(sempit, 5000), null);
  uji("jumlah rusak = tidak dibelah", belahBilaPerlu(p, Number.NaN), null);
}

/* ------------------------------------------------------------ */
console.log("\nAnggaran waktu");
{
  const mulai = 1_000_000;
  const tenggat = tenggatRoute(mulai);
  uji("tenggat = mulai + (300 - 30) detik", tenggat - mulai, 270_000);
  uji("waktu masih banyak = boleh", bolehMulaiPotongan(mulai, tenggat, 10_000), true);
  uji("sisa < 20 detik = tidak boleh", bolehMulaiPotongan(tenggat - SISA_MIN_POTONGAN_MS + 1, tenggat, 0), false);
  uji("sisa tepat 20 detik, potongan cepat = boleh", bolehMulaiPotongan(tenggat - SISA_MIN_POTONGAN_MS, tenggat, 1000), true);
  uji("sisa 100 dtk tapi potongan terlama 60 dtk = tidak boleh", bolehMulaiPotongan(tenggat - 100_000, tenggat, 60_000), false);
  uji("sisa 130 dtk, potongan terlama 60 dtk = boleh", bolehMulaiPotongan(tenggat - 130_000, tenggat, 60_000), true);
  uji("lewat tenggat = tidak boleh", bolehMulaiPotongan(tenggat + 1, tenggat), false);
  uji("nilai rusak = tidak boleh (berhenti selalu aman)", bolehMulaiPotongan(Number.NaN, tenggat), false);
  uji("terlama rusak dianggap 0", bolehMulaiPotongan(mulai, tenggat, Number.NaN), true);
}

/* ------------------------------------------------------------ */
console.log("\nmajukanTitik — hanya maju, tidak pernah mundur");
{
  const iso = (d) => new Date(d * 1000).toISOString();
  uji("belum pernah -> ujung potongan", majukanTitik(null, T0 + JAM), iso(T0 + JAM));
  uji("titik lama lebih awal -> maju", majukanTitik(iso(T0), T0 + JAM), iso(T0 + JAM));
  uji("titik lama lebih baru -> tetap (tidak mundur)", majukanTitik(iso(T0 + 2 * JAM), T0 + JAM), iso(T0 + 2 * JAM));
  uji("titik rusak -> ujung potongan", majukanTitik("kemarin", T0 + JAM), iso(T0 + JAM));
}

/* ------------------------------------------------------------ */
console.log("\nCicilan — simulasi urutan cicilToko() dengan toko besar");
{
  /* Toko besar: 8.000 pesanan berubah dalam sehari, menumpuk di
     jam 12.00–13.00 (kampanye) dengan 3.000 pesanan. */
  const snPerDetik = (t) => (t >= T0 + 12 * JAM && t < T0 + 13 * JAM ? 3000 / JAM : 5000 / (23 * JAM));
  const hitungSn = (p) => Math.round(snPerDetik(p.dari) * (p.sampai - p.dari));

  /** Satu "panggilan route": potongan dikerjakan sampai anggaran habis atau gagal di potongan ke-gagalDi. */
  function satuPanggilan(titikIso, sekarang, anggaranPotongan, gagalDi = -1) {
    const dariIso = titikIso;
    const dari = dariIso ? Math.floor(Date.parse(dariIso) / 1000) : sekarang - HARI;
    const antrean = pecahPotongan(dari, sekarang);
    let titik = titikIso;
    const selesai = [];
    let langkah = 0;
    while (antrean.length > 0 && langkah < anggaranPotongan) {
      const p = antrean[0];
      const n = hitungSn(p);
      const belah = belahBilaPerlu(p, n);
      if (belah) {
        antrean.splice(0, 1, ...belah);
        continue;
      }
      if (langkah === gagalDi) return { titik, selesai, status: "galat", sisa: antrean.length };
      /* simpan berhasil -> BARU titik maju */
      titik = majukanTitik(titik, p.sampai);
      selesai.push({ ...p, n });
      antrean.shift();
      langkah++;
    }
    return { titik, selesai, status: antrean.length > 0 ? "belum_selesai" : "selesai", sisa: antrean.length };
  }

  const sekarang = T0 + HARI;
  const a = satuPanggilan(null, sekarang, 10);
  uji("panggilan 1 terpotong anggaran = belum_selesai", a.status, "belum_selesai");
  uji("titik SUDAH maju walau belum selesai (tidak macet)", Date.parse(a.titik) > Date.parse(new Date(T0 * 1000).toISOString()), true);
  uji("titik = ujung potongan terakhir yang tersimpan", a.titik, new Date(a.selesai[a.selesai.length - 1].sampai * 1000).toISOString());

  let titik = a.titik;
  let panggilan = 1;
  let semua = [...a.selesai];
  let status = a.status;
  while (status === "belum_selesai" && panggilan < 50) {
    const r = satuPanggilan(titik, sekarang, 10);
    titik = r.titik;
    semua = semua.concat(r.selesai);
    status = r.status;
    panggilan++;
  }
  uji("beberapa panggilan kemudian = selesai", status, "selesai");
  uji("titik akhir = sekarang", titik, new Date(sekarang * 1000).toISOString());
  uji("tidak ada potongan yang melebihi batas order_sn", semua.every((p) => p.n <= MAKS_SN_PER_POTONGAN), true);
  uji("jam kampanye dibelah (potongan < 1 jam)", semua.some((p) => p.sampai - p.dari < JAM), true);

  const g = satuPanggilan(null, sekarang, 10, 3);
  uji("gagal di potongan ke-4 = galat", g.status, "galat");
  uji("titik berhenti di ujung potongan ke-3 (yang tersimpan saja)", g.titik, new Date(g.selesai[2].sampai * 1000).toISOString());
  const gagalAwal = satuPanggilan(null, sekarang, 10, 0);
  uji("gagal di potongan pertama = titik tidak berubah", gagalAwal.titik, null);
}

/* ------------------------------------------------------------ */
console.log("\nkunciSinkronDipegang — kunci kedaluwarsa lepas sendiri");
{
  const kini = Date.parse("2026-11-12T10:00:00Z");
  const iso = (ms) => new Date(ms).toISOString();
  uji("kosong = bebas", kunciSinkronDipegang(null, kini), false);
  uji("di masa depan = dipegang", kunciSinkronDipegang(iso(kini + 60_000), kini), true);
  uji("sudah lewat = bebas (pemegangnya mati)", kunciSinkronDipegang(iso(kini - 1), kini), false);
  uji("tepat sekarang = bebas", kunciSinkronDipegang(iso(kini), kini), false);
  uji("rusak = bebas", kunciSinkronDipegang("besok", kini), false);
  uji(
    "terlalu jauh ke depan (> 2x lama kunci) = dianggap rusak, bebas",
    kunciSinkronDipegang(iso(kini + LAMA_KUNCI_SINKRON_DETIK * 2 * 1000 + 1), kini),
    false,
  );
  uji("lama kunci penuh = dipegang", kunciSinkronDipegang(iso(kini + LAMA_KUNCI_SINKRON_DETIK * 1000), kini), true);
}

/* ------------------------------------------------------------ */
console.log("\npisahkanBerubah — lewati tulis yang tidak berubah");
{
  const b = (id, t) => ({ external_order_id: id, order_updated_at: t });
  const ada = new Map([
    ["A", "2026-11-12T10:00:00.000Z"],
    ["B", "2026-11-12T10:00:00.000Z"],
    ["D", null],
    ["E", "2026-11-12T10:00:00+00:00"],
  ]);
  const { tulis, lewati } = pisahkanBerubah(
    [
      b("A", "2026-11-12T10:00:00.000Z"), // sama -> lewati
      b("B", "2026-11-12T10:05:00.000Z"), // berubah -> tulis
      b("C", "2026-11-12T10:00:00.000Z"), // baru -> tulis
      b("D", "2026-11-12T10:00:00.000Z"), // lama tak terbaca -> tulis
      b("E", "2026-11-12T10:00:00.000Z"), // saat sama, format beda -> lewati
      b("F", null), // baru tak terbaca -> tulis
    ],
    ada,
  );
  uji("yang dilewati hanya update_time yang sama", lewati.map((x) => x.external_order_id), ["A", "E"]);
  uji("berubah, baru, dan yang ragu selalu ditulis", tulis.map((x) => x.external_order_id), ["B", "C", "D", "F"]);
  uji("daftar kosong", pisahkanBerubah([], ada), { tulis: [], lewati: [] });
}

/* ------------------------------------------------------------ */
console.log("\nSHOPEE_SIMPAN_RAW");
{
  uji("kosong = galat (bawaan)", bacaModeRaw(undefined), "galat");
  uji("'' = galat", bacaModeRaw(""), "galat");
  uji("'OFF' = off", bacaModeRaw("OFF"), "off");
  uji("' semua ' = semua", bacaModeRaw(" semua "), "semua");
  uji("nilai asing 'all' = galat", bacaModeRaw("all"), "galat");

  const normal = { status: "selesai", raw_status: "COMPLETED", items: [{ nama: "x" }], order_created_at: "2026-11-12T00:00:00Z" };
  uji("galat + pesanan normal = TIDAK disimpan", perluSimpanRaw("galat", normal), false);
  uji("galat + status lainnya = disimpan", perluSimpanRaw("galat", { ...normal, status: "lainnya", raw_status: "TO_RETURN" }), true);
  uji("galat + raw_status kosong = disimpan", perluSimpanRaw("galat", { ...normal, raw_status: null }), true);
  uji("galat + barang kosong = disimpan", perluSimpanRaw("galat", { ...normal, items: [] }), true);
  uji("galat + items rusak = disimpan", perluSimpanRaw("galat", { ...normal, items: null }), true);
  uji("galat + waktu dibuat kosong = disimpan", perluSimpanRaw("galat", { ...normal, order_created_at: null }), true);
  uji("semua = selalu disimpan", perluSimpanRaw("semua", normal), true);
  uji("off = tidak pernah, bahkan status lainnya", perluSimpanRaw("off", { ...normal, status: "lainnya" }), false);
}

/* ------------------------------------------------------------ */
console.log("\nDua sakelar — tabel keputusan");
{
  const k = (pemicu, ikutOtomatis, modeOtomatis) => keputusanSinkron({ pemicu, ikutOtomatis, modeOtomatis });
  /* Tombol admin: SELALU jalan, untuk toko mana pun (diminta pemilik proyek). */
  uji("tombol admin + toko tidak ikut otomatis = jalan", k("admin", false, false), "jalan");
  uji("tombol admin + toko tidak ikut otomatis, mode otomatis = jalan", k("admin", false, true), "jalan");
  uji("tombol admin + toko ikut otomatis, mode manual = jalan", k("admin", true, false), "jalan");
  uji("tombol admin + toko ikut otomatis, mode otomatis = jalan", k("admin", true, true), "jalan");
  /* Cron: hanya bila KEDUA sakelar nyala. */
  uji("cron + toko tidak ikut otomatis = dilewati", k("cron", false, true), "dilewati_tidak_ikut_otomatis");
  uji("cron + toko ikut otomatis + mode manual = dilewati", k("cron", true, false), "dilewati_mode_manual");
  uji("cron + toko ikut otomatis + mode otomatis = jalan", k("cron", true, true), "jalan");
  for (const rusak of [null, undefined, "true", 1, "ya", {}]) {
    const n = JSON.stringify(rusak) ?? "undefined";
    uji(`cron + kolom toko rusak ${n} = dilewati (aman)`, k("cron", rusak, true), "dilewati_tidak_ikut_otomatis");
    uji(`cron + setting rusak ${n} = dilewati (aman)`, k("cron", true, rusak), "dilewati_mode_manual");
    uji(`tombol admin + kolom toko rusak ${n} = tetap jalan`, k("admin", rusak, rusak), "jalan");
  }
  uji("pemicu asing = tidak jalan", k("tamu", true, true), "dilewati_mode_manual");
}

/* ------------------------------------------------------------ */
console.log("\nToko baru dari otorisasi = ikut_sinkron_otomatis false");
{
  const token = {
    accessToken: "a",
    refreshToken: "r",
    accessExpiresAt: new Date("2026-11-12T14:00:00Z"),
    refreshExpiresAt: new Date("2026-12-12T10:00:00Z"),
  };
  const satu = barisSimpanToko("shopee", "123", token);
  uji("baris simpan TIDAK memuat ikut_sinkron_otomatis (bawaan kolom = false)", "ikut_sinkron_otomatis" in satu, false);
  uji("toko tetap aktif (terhubung)", satu.is_active, true);
  const dariAkunUtama = daftarTokoAkunUtama([111, 222, 333]).map((id) => barisSimpanToko("shopee", id, token));
  uji("setiap toko dari shop_id_list juga tanpa ikut_sinkron_otomatis", dariAkunUtama.every((b) => !("ikut_sinkron_otomatis" in b)), true);
  uji("semua toko dari shop_id_list tersimpan", dariAkunUtama.map((b) => b.external_shop_id), ["111", "222", "333"]);
}

/* ------------------------------------------------------------ */
console.log("\nlanjutPutaran — tombol Sinkronkan");
{
  uji("belum_selesai = lanjut", lanjutPutaran("belum_selesai", 1, false), true);
  uji("selesai = berhenti", lanjutPutaran("selesai", 1, false), false);
  uji("galat = berhenti (tidak berputar tanpa akhir)", lanjutPutaran("galat", 1, false), false);
  uji("dilewati = berhenti", lanjutPutaran("dilewati_sedang_berjalan", 1, false), false);
  uji("status asing = berhenti", lanjutPutaran(undefined, 1, false), false);
  uji("ditekan Berhenti = berhenti", lanjutPutaran("belum_selesai", 1, true), false);
  uji("batas putaran = berhenti", lanjutPutaran("belum_selesai", MAKS_PUTARAN_TOMBOL, false), false);
  uji("putaran rusak = berhenti", lanjutPutaran("belum_selesai", Number.NaN, false), false);
}

console.log(`\n${"-".repeat(52)}`);
console.log(`Sinkron skala besar : ${gagal === 0 ? "LULUS" : "GAGAL"} ${lulus}/${lulus + gagal}`);
if (gagal > 0) {
  console.error(`\n${gagal} kasus gagal.`);
  process.exit(1);
}
console.log("\nSemua kasus lulus");
