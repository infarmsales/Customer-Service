/* ===========================================================
   Batas umur sesi login (SEC-018).

     npm run uji-sesi

   Biaya Rp 0. Tidak ada jaringan, tidak ada Supabase, tidak ada
   Claude — hanya fungsi murni di lib/sesi.ts.

   YANG DIJAGA DI SINI

   Dua kegagalan yang berlawanan, dan yang kedua jauh lebih mahal:

     sesi terlalu lama hidup   console tetap terbuka di komputer
                               yang ditinggal, dan siapa pun yang
                               duduk di situ membaca chat semua toko

     sesi terlalu cepat mati   seluruh tim CS terlempar ke layar
                               login di tengah jam sibuk, dan dalam
                               bentuk terburuknya — nilai yang tidak
                               terbaca dianggap "kedaluwarsa" —
                               setiap login langsung diikuti logout
                               sehingga console mustahil dipakai

   Karena itu setiap fungsi di lib/sesi.ts sengaja menjawab false
   untuk masukan yang tidak terbaca, dan blok "nilai rusak" di bawah
   ada supaya sikap itu tidak pernah dibalik diam-diam oleh orang
   yang merasa "lebih aman kalau dikeluarkan saja".

   Waktu disusun eksplisit dalam UTC, bukan lewat new Date("...")
   tanpa zona — supaya hasilnya sama di laptop developer dan di
   server Vercel.
   =========================================================== */

import {
  BATAS_DIAM_MENIT,
  BATAS_USIA_SESI_JAM,
  diamTerlaluLama,
  pesanKeluar,
  sesiKedaluwarsa,
  usiaSesiJam,
} from "../lib/sesi.ts";

let lulus = 0;
let gagal = 0;

function uji(nama, dapat, harap) {
  const sama = JSON.stringify(dapat) === JSON.stringify(harap);
  if (sama) {
    lulus++;
    console.log(`  v ${nama}`);
  } else {
    gagal++;
    console.log(`  X ${nama}`);
    console.log(`      harap : ${JSON.stringify(harap)}`);
    console.log(`      dapat : ${JSON.stringify(dapat)}`);
  }
}

/** Saat acuan "sekarang": 2 Okt 2026 pukul 20.00 UTC = 03.00 WIB. */
const SEKARANG = new Date(Date.UTC(2026, 9, 2, 20, 0, 0));

/** Jam masuk, dinyatakan sebagai sekian jam SEBELUM SEKARANG. */
const masukJamLalu = (jam) =>
  new Date(SEKARANG.getTime() - jam * 3_600_000).toISOString();

/** Saat diam, dinyatakan sebagai sekian menit SEBELUM SEKARANG. */
const diamMenitLalu = (menit) => SEKARANG.getTime() - menit * 60_000;
const kini = SEKARANG.getTime();

console.log("\nTetapan");
uji("batas umur sesi 12 jam", BATAS_USIA_SESI_JAM, 12);
uji("batas diam 60 menit", BATAS_DIAM_MENIT, 60);

/* Kalau penghitung diam lebih longgar daripada umur sesi, lapis
   kedua tidak pernah berbunyi lebih dulu dan keberadaannya sia-sia. */
uji(
  "batas diam lebih ketat daripada umur sesi",
  BATAS_DIAM_MENIT < BATAS_USIA_SESI_JAM * 60,
  true,
);

console.log("\nusiaSesiJam");
uji("baru saja masuk", usiaSesiJam(masukJamLalu(0), SEKARANG), 0);
uji("enam jam lalu", usiaSesiJam(masukJamLalu(6), SEKARANG), 6);
uji("dua belas jam lalu", usiaSesiJam(masukJamLalu(12), SEKARANG), 12);
uji("setengah jam lalu", usiaSesiJam(masukJamLalu(0.5), SEKARANG), 0.5);
uji("null", usiaSesiJam(null, SEKARANG), null);
uji("undefined", usiaSesiJam(undefined, SEKARANG), null);
uji("string kosong", usiaSesiJam("", SEKARANG), null);
uji("bukan tanggal", usiaSesiJam("kemarin sore", SEKARANG), null);

/* Jam peramban mundur, atau jam server maju. Umurnya nol, BUKAN
   negatif: sesi yang terlihat makin muda seiring waktu berjalan
   adalah keadaan yang tidak boleh ada. */
uji("jam masuk di masa depan", usiaSesiJam(masukJamLalu(-5), SEKARANG), 0);

/* Dua penulisan saat yang SAMA. Kalau keduanya berbeda, berarti ada
   yang membaca jam dinding, bukan saat mutlak — bug yang hanya
   muncul di server dengan zona waktu lain. */
const samaDalamZ = "2026-10-02T14:00:00.000Z";
const samaDalamWib = "2026-10-02T21:00:00.000+07:00";
uji(
  "offset WIB dan Z yang menunjuk saat sama dibaca sama",
  usiaSesiJam(samaDalamZ, SEKARANG) === usiaSesiJam(samaDalamWib, SEKARANG),
  true,
);
uji("dan nilainya memang enam jam", usiaSesiJam(samaDalamWib, SEKARANG), 6);

console.log("\nsesiKedaluwarsa — batas bawaan");
uji("baru masuk", sesiKedaluwarsa(masukJamLalu(0), SEKARANG), false);
uji("enam jam", sesiKedaluwarsa(masukJamLalu(6), SEKARANG), false);
uji("sebelas jam lewat 59 menit", sesiKedaluwarsa(masukJamLalu(11.9833), SEKARANG), false);
uji("dua belas jam tepat", sesiKedaluwarsa(masukJamLalu(12), SEKARANG), true);
uji("dua belas jam lewat satu menit", sesiKedaluwarsa(masukJamLalu(12.0167), SEKARANG), true);
uji("tiga hari", sesiKedaluwarsa(masukJamLalu(72), SEKARANG), true);

console.log("\nsesiKedaluwarsa — nilai rusak TIDAK BOLEH mengeluarkan siapa pun");
uji("null", sesiKedaluwarsa(null, SEKARANG), false);
uji("undefined", sesiKedaluwarsa(undefined, SEKARANG), false);
uji("bukan tanggal", sesiKedaluwarsa("besok", SEKARANG), false);
uji("jam masuk di masa depan", sesiKedaluwarsa(masukJamLalu(-100), SEKARANG), false);
uji("batas 0 jam", sesiKedaluwarsa(masukJamLalu(99), SEKARANG, 0), false);
uji("batas negatif", sesiKedaluwarsa(masukJamLalu(99), SEKARANG, -5), false);
uji("batas NaN", sesiKedaluwarsa(masukJamLalu(99), SEKARANG, Number.NaN), false);
uji("batas Infinity", sesiKedaluwarsa(masukJamLalu(99), SEKARANG, Infinity), false);

console.log("\nsesiKedaluwarsa — batas yang disetel sendiri");
uji("batas 1 jam, baru 30 menit", sesiKedaluwarsa(masukJamLalu(0.5), SEKARANG, 1), false);
uji("batas 1 jam, sudah 2 jam", sesiKedaluwarsa(masukJamLalu(2), SEKARANG, 1), true);
uji("batas 24 jam, baru 13 jam", sesiKedaluwarsa(masukJamLalu(13), SEKARANG, 24), false);

console.log("\ndiamTerlaluLama");
uji("baru saja menyentuh", diamTerlaluLama(diamMenitLalu(0), kini), false);
uji("diam 30 menit", diamTerlaluLama(diamMenitLalu(30), kini), false);
uji("diam 59 menit", diamTerlaluLama(diamMenitLalu(59), kini), false);
uji("diam 60 menit tepat", diamTerlaluLama(diamMenitLalu(60), kini), true);
uji("diam 61 menit", diamTerlaluLama(diamMenitLalu(61), kini), true);
uji("ditinggal semalam", diamTerlaluLama(diamMenitLalu(900), kini), true);

console.log("\ndiamTerlaluLama — nilai rusak TIDAK BOLEH mengeluarkan siapa pun");
uji("sentuhan di masa depan", diamTerlaluLama(diamMenitLalu(-10), kini), false);
uji("terakhirAktif NaN", diamTerlaluLama(Number.NaN, kini), false);
uji("sekarang NaN", diamTerlaluLama(diamMenitLalu(999), Number.NaN), false);
uji("terakhirAktif Infinity", diamTerlaluLama(Infinity, kini), false);
uji("batas 0 menit", diamTerlaluLama(diamMenitLalu(999), kini, 0), false);
uji("batas negatif", diamTerlaluLama(diamMenitLalu(999), kini, -1), false);

console.log("\ndiamTerlaluLama — batas yang disetel sendiri");
uji("batas 5 menit, diam 4", diamTerlaluLama(diamMenitLalu(4), kini, 5), false);
uji("batas 5 menit, diam 6", diamTerlaluLama(diamMenitLalu(6), kini, 5), true);

/* Kalimatnya dibaca orang yang baru saja terlempar ke layar login,
   dan satu-satunya yang menjawab "kenapa" adalah angkanya. Uji ini
   gagal kalau seseorang menyederhanakannya jadi "Sesi berakhir." */
console.log("\npesanKeluar");
uji("sebab umur menyebut jumlah jamnya", pesanKeluar("umur").includes("12 jam"), true);
uji("sebab diam menyebut jumlah menitnya", pesanKeluar("diam").includes("60 menit"), true);
uji("dua sebab berbunyi berbeda", pesanKeluar("umur") !== pesanKeluar("diam"), true);

console.log(`\n${"-".repeat(52)}`);
console.log(`Batas umur sesi : ${gagal === 0 ? "LULUS" : "GAGAL"} ${lulus}/${lulus + gagal}`);

if (gagal > 0) {
  console.error(`\n${gagal} kasus gagal.`);
  process.exit(1);
}
console.log("\nSemua kasus lulus");
