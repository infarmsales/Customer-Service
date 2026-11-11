/* ===========================================================
   Aturan otorisasi & umur token Shopee — lib/shopee/otorisasi.ts.

     npm run uji-shopee-otorisasi

   Biaya Rp 0. Tidak ada jaringan, tidak ada Supabase, tidak ada env.

   YANG DIJAGA DI SINI

   Dua kesalahan yang berlawanan dan sama-sama mahal:

     token dianggap segar padahal basi   sinkronisasi gagal dengan
                                         galat yang menyamar jadi
                                         masalah lain
     token dianggap basi padahal segar   refresh dipanggil berulang,
                                         dan tiap refresh membakar
                                         refresh_token sekali pakai;
                                         kehabisan = otorisasi ulang

   Dan satu jebakan dokumentasi: expire_in yang kadang durasi detik,
   kadang epoch. Kedua contoh resmi Shopee ada di bawah sebagai kasus.
   =========================================================== */

import {
  AMBANG_EPOCH,
  BATAS_TOKO_AKUN_UTAMA,
  bacaBalikOtorisasi,
  daftarTokoAkunUtama,
  MARGIN_SEGAR_MENIT,
  UMUR_ACCESS_TOKEN_DETIK,
  hitungKedaluwarsaToken,
  kodeTokenHangus,
  kunciMasihDipegang,
  tokenMasihSegar,
  urlOtorisasi,
} from "../lib/shopee/otorisasi.ts";
import { buatSign } from "../lib/shopee/tandaTangan.ts";

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

const KRED = { partnerId: "1000000", partnerKey: "kunci-uji-shopee" };
const HOST = "https://sandbox.uji.invalid";
const TS = 1700000000;
const KINI_MS = TS * 1000;
const menitKeDepan = (m) => new Date(KINI_MS + m * 60_000).toISOString();

console.log("\nurlOtorisasi");
{
  const url = urlOtorisasi(KRED, HOST, "https://console.uji/shopee/callback", TS);
  const q = url.searchParams;
  uji("host", url.origin, HOST);
  uji("jalur auth_partner", url.pathname, "/api/v2/shop/auth_partner");
  uji("partner_id", q.get("partner_id"), "1000000");
  uji("timestamp", q.get("timestamp"), String(TS));
  uji(
    "sign memakai basis publik (tanpa token/shop)",
    q.get("sign"),
    buatSign(KRED.partnerKey, ["1000000", "/api/v2/shop/auth_partner", TS]),
  );
  uji("redirect dibawa utuh", q.get("redirect"), "https://console.uji/shopee/callback");
  uji("tidak ada access_token", q.has("access_token"), false);
}

console.log("\nhitungKedaluwarsaToken — dua contoh resmi yang bertentangan");
{
  /* Contoh di v2.public.refresh_access_token: "expire_in": 14400 */
  uji("14400 dibaca sebagai durasi detik", hitungKedaluwarsaToken(14400, TS).getTime(), (TS + 14400) * 1000);
  /* Contoh di v2.public.get_access_token: "expire_in": 1767001812 */
  uji("1767001812 dibaca sebagai epoch", hitungKedaluwarsaToken(1767001812, TS).getTime(), 1767001812 * 1000);
  uji("tepat di ambang = epoch", hitungKedaluwarsaToken(AMBANG_EPOCH, TS).getTime(), AMBANG_EPOCH * 1000);
  uji("satu di bawah ambang = durasi", hitungKedaluwarsaToken(AMBANG_EPOCH - 1, TS).getTime(), (TS + AMBANG_EPOCH - 1) * 1000);
}

console.log("\nhitungKedaluwarsaToken — nilai rusak jatuh ke 4 jam, BUKAN ke 'sudah habis'");
{
  const empatJam = (TS + UMUR_ACCESS_TOKEN_DETIK) * 1000;
  uji("undefined", hitungKedaluwarsaToken(undefined, TS).getTime(), empatJam);
  uji("null", hitungKedaluwarsaToken(null, TS).getTime(), empatJam);
  uji("0", hitungKedaluwarsaToken(0, TS).getTime(), empatJam);
  uji("negatif", hitungKedaluwarsaToken(-5, TS).getTime(), empatJam);
  uji("NaN", hitungKedaluwarsaToken(Number.NaN, TS).getTime(), empatJam);
  uji("Infinity", hitungKedaluwarsaToken(Infinity, TS).getTime(), empatJam);
  uji("umur resmi memang 4 jam", UMUR_ACCESS_TOKEN_DETIK, 14400);
}

console.log("\ntokenMasihSegar — margin bawaan " + MARGIN_SEGAR_MENIT + " menit");
{
  uji("sisa 3 jam", tokenMasihSegar(menitKeDepan(180), KINI_MS), true);
  uji("sisa 11 menit", tokenMasihSegar(menitKeDepan(11), KINI_MS), true);
  uji("sisa 10 menit tepat = tidak segar", tokenMasihSegar(menitKeDepan(10), KINI_MS), false);
  uji("sisa 9 menit", tokenMasihSegar(menitKeDepan(9), KINI_MS), false);
  uji("sudah lewat", tokenMasihSegar(menitKeDepan(-1), KINI_MS), false);
  uji("margin sendiri 0: sisa 1 detik masih segar", tokenMasihSegar(new Date(KINI_MS + 1000).toISOString(), KINI_MS, 0), true);
}

console.log("\ntokenMasihSegar — nilai rusak dianggap TIDAK segar (memicu refresh, bukan memakai token basi)");
{
  uji("null", tokenMasihSegar(null, KINI_MS), false);
  uji("undefined", tokenMasihSegar(undefined, KINI_MS), false);
  uji("string kosong", tokenMasihSegar("", KINI_MS), false);
  uji("bukan tanggal", tokenMasihSegar("nanti", KINI_MS), false);
  uji("margin negatif jatuh ke bawaan", tokenMasihSegar(menitKeDepan(9), KINI_MS, -5), false);
}

console.log("\nkunciMasihDipegang");
{
  uji("null = bebas", kunciMasihDipegang(null, KINI_MS), false);
  uji("di masa depan = dipegang", kunciMasihDipegang(new Date(KINI_MS + 20_000).toISOString(), KINI_MS), true);
  uji("sudah lewat = bebas (pemegangnya mungkin mati)", kunciMasihDipegang(new Date(KINI_MS - 1000).toISOString(), KINI_MS), false);
  uji("tepat sekarang = bebas", kunciMasihDipegang(new Date(KINI_MS).toISOString(), KINI_MS), false);
  uji("rusak = bebas", kunciMasihDipegang("kapan-kapan", KINI_MS), false);
}

console.log("\nkodeTokenHangus — dari daftar galat v2.public.refresh_access_token");
{
  for (const k of ["refresh_token_expired", "error_shop_refresh_token", "shop_access_expired", "shop_no_linked", "shop_banned", "error_auth"]) {
    uji(`${k} = hangus`, kodeTokenHangus(k), true);
  }
  for (const k of ["error_server", "error_network", "error_param", "jaringan", "bukan_json", "http_502", "", null, undefined]) {
    uji(`${JSON.stringify(k)} = BUKAN hangus (jangan nonaktifkan toko)`, kodeTokenHangus(k), false);
  }
}

console.log("\nbacaBalikOtorisasi — akun toko vs akun utama (shop.auth_partner)");
{
  const q = (s) => bacaBalikOtorisasi(new URLSearchParams(s));
  uji("akun toko", q("code=abc&shop_id=123"), { jenis: "toko", code: "abc", shopId: "123" });
  uji("akun utama", q("code=abc&main_account_id=987"), { jenis: "akun_utama", code: "abc", mainAccountId: "987" });
  uji("keduanya ada = shop_id didahulukan", q("code=abc&shop_id=1&main_account_id=2")?.jenis, "toko");
  uji("shop_id rusak tapi main_account_id sah = akun utama", q("code=abc&shop_id=x1&main_account_id=2")?.jenis, "akun_utama");
  uji("spasi di ujung dirapikan", q("code=%20abc%20&main_account_id=%20987%20"), { jenis: "akun_utama", code: "abc", mainAccountId: "987" });
  uji("tanpa code = null", q("main_account_id=987"), null);
  uji("code kosong = null", q("code=&shop_id=1"), null);
  uji("tanpa id apa pun = null", q("code=abc"), null);
  uji("main_account_id bukan angka = null", q("code=abc&main_account_id=12a"), null);
  uji("main_account_id negatif = null", q("code=abc&main_account_id=-5"), null);
}

console.log("\ndaftarTokoAkunUtama — shop_id_list dari token/get");
{
  uji("angka biasa", daftarTokoAkunUtama([111, 222]), ["111", "222"]);
  uji("kembar dibuang, urutan tetap", daftarTokoAkunUtama([222, 111, 222]), ["222", "111"]);
  uji("string angka diterima", daftarTokoAkunUtama(["333", " 444 "]), ["333", "444"]);
  uji("nilai rusak dibuang satuan", daftarTokoAkunUtama([0, -1, 1.5, "x", null, {}, 555]), ["555"]);
  uji("string nol dibuang", daftarTokoAkunUtama(["000", "7"]), ["7"]);
  uji("bukan array = kosong", daftarTokoAkunUtama(undefined), []);
  uji("objek = kosong", daftarTokoAkunUtama({ 0: 1 }), []);
  uji("dibatasi BATAS_TOKO_AKUN_UTAMA", daftarTokoAkunUtama(Array.from({ length: 80 }, (_, i) => i + 1)).length, BATAS_TOKO_AKUN_UTAMA);
}

console.log(`\n${"-".repeat(52)}`);
console.log(`Otorisasi Shopee : ${gagal === 0 ? "LULUS" : "GAGAL"} ${lulus}/${lulus + gagal}`);

if (gagal > 0) {
  console.error(`\n${gagal} kasus gagal.`);
  process.exit(1);
}
console.log("\nSemua kasus lulus");
