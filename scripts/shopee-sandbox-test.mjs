#!/usr/bin/env node
/* ===========================================================
   Uji kredensial sandbox Shopee Open Platform.

     node --env-file=.env scripts/shopee-sandbox-test.mjs <perintah> [argumen]

   Menguji tiga hal secara berurutan:
     1. signature HMAC-SHA256 benar (perintah `shops`)
     2. alur otorisasi toko menghasilkan access_token (`auth` -> `token`)
     3. bentuk ASLI data pesanan dari API (`orders`)

   Tanpa dependency eksternal: hanya node:crypto dan fetch bawaan
   (Node.js 18+). Hanya memanggil host SANDBOX di bawah — tidak ada
   toko sungguhan maupun pelanggan sungguhan yang tersentuh.

   Partner ID & Partner Key dibaca HANYA dari environment variable.
   Jangan pernah menuliskannya di berkas ini, di chat, atau di commit.
   =========================================================== */

import { createHmac } from "node:crypto";

/**
 * Host sandbox Shopee Open Platform. Jangan diganti ke host produksi di skrip uji.
 *
 * KENAPA .shopee.sg, BUKAN partner.test-stable.shopeemobile.com
 *
 * Host sandbox berbeda per cluster, dan aplikasi "Infarm CS Bot"
 * terdaftar di cluster Singapura — lihat Test Partner ID aplikasinya
 * di konsol Shopee, jangan ditulis di berkas ini. Host yang
 * keliru menjawab `error_sign` — bukan "aplikasi tidak ditemukan" —
 * sehingga selama dua hari dugaan tertuju ke kunci yang sebenarnya
 * sudah benar sejak awal.
 *
 * Yang membuktikannya: API Test Tool di konsol Shopee memakai host ini,
 * dan tanda tangan yang dihasilkannya identik dengan yang dihitung
 * skrip ini memakai kunci di .env. Kunci benar, rumus benar, host salah.
 *
 * Kalau nanti host ini ditolak, salin URL dari API Test Tool di konsol
 * dan bandingkan bagian host-nya — itu sumber kebenaran yang paling
 * cepat, karena konsol memakai host cluster aplikasi itu sendiri.
 */
const HOST = "https://openplatform.sandbox.test-stable.shopee.sg";

/** Redirect bawaan setelah pemilik toko menyetujui otorisasi. */
const REDIRECT_BAWAAN = "http://localhost:3000/shopee/callback";

/** Rentang pencarian pesanan untuk perintah `orders`. */
const HARI_KE_BELAKANG = 14;

/* ---------------- Kredensial ---------------- */

/**
 * Membaca dan memvalidasi kredensial dari environment.
 *
 * Dipanggil hanya oleh perintah yang benar-benar butuh, supaya
 * menampilkan bantuan tetap bisa tanpa kredensial terpasang.
 */
function bacaKredensial() {
  const partnerId = (process.env.SHOPEE_PARTNER_ID ?? "").trim();
  const partnerKey = (process.env.SHOPEE_PARTNER_KEY ?? "").trim();

  if (!partnerId || !partnerKey) {
    console.error(
      "SHOPEE_PARTNER_ID dan/atau SHOPEE_PARTNER_KEY kosong.\n\n" +
        "Salin .env.example menjadi .env, isi kedua nilainya, lalu jalankan:\n" +
        "  node --env-file=.env scripts/shopee-sandbox-test.mjs <perintah>\n\n" +
        "Node di bawah 20.6 belum mengenal --env-file; ekspor kedua variabel\n" +
        "itu di terminal lebih dulu.",
    );
    process.exit(1);
  }

  // Partner ID dikirim sebagai ANGKA di badan JSON. Nilai yang bukan
  // angka akan ditolak Shopee dengan pesan yang tidak menyebut sebabnya.
  if (!/^\d+$/.test(partnerId)) {
    console.error("SHOPEE_PARTNER_ID harus berupa angka saja (tanpa spasi atau tanda kutip).");
    process.exit(1);
  }

  return { partnerId, partnerKey };
}

/* ---------------- Signature ---------------- */

/** Unix timestamp dalam DETIK, bukan milidetik. */
function timestampSekarang() {
  return Math.floor(Date.now() / 1000);
}

/**
 * HMAC-SHA256 dengan partner_key sebagai kunci, keluaran hex huruf kecil.
 *
 *   endpoint publik : partner_id + api_path + timestamp
 *   endpoint toko   : partner_id + api_path + timestamp + access_token + shop_id
 *
 * Urutannya tidak boleh tertukar dan tidak ada pemisah apa pun di antara
 * bagian-bagiannya.
 */
function buatSign(partnerKey, bagian) {
  return createHmac("sha256", partnerKey).update(bagian.join("")).digest("hex");
}

/** Parameter umum untuk endpoint publik (tanpa access_token/shop_id). */
function paramPublik({ partnerId, partnerKey }, apiPath) {
  const timestamp = timestampSekarang();
  const sign = buatSign(partnerKey, [partnerId, apiPath, timestamp]);
  return { partner_id: partnerId, timestamp: String(timestamp), sign };
}

/** Parameter umum untuk endpoint toko (butuh access_token + shop_id). */
function paramToko({ partnerId, partnerKey }, apiPath, accessToken, shopId) {
  const timestamp = timestampSekarang();
  const sign = buatSign(partnerKey, [partnerId, apiPath, timestamp, accessToken, shopId]);
  return {
    partner_id: partnerId,
    timestamp: String(timestamp),
    access_token: accessToken,
    shop_id: String(shopId),
    sign,
  };
}

/* ---------------- HTTP ---------------- */

function susunUrl(apiPath, query) {
  const url = new URL(apiPath, HOST);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  return url;
}

/**
 * Mengirim permintaan lalu mencetak jawabannya apa adanya.
 *
 * Galat dari Shopee sering datang dengan HTTP 200 dan kolom `error` terisi,
 * jadi keduanya diperiksa. Kode keluar 1 bila salah satunya menunjukkan
 * kegagalan, supaya skrip ini bisa dipakai di dalam skrip lain.
 */
async function kirim(method, url, badan) {
  console.log(`\n${method} ${url.origin}${url.pathname}`);

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: badan ? { "Content-Type": "application/json" } : undefined,
      body: badan ? JSON.stringify(badan) : undefined,
    });
  } catch (err) {
    console.error(`Gagal menghubungi ${HOST}: ${err.message}`);
    process.exit(1);
  }

  const teks = await res.text();
  let data;
  try {
    data = JSON.parse(teks);
  } catch {
    // Bukan JSON — biasanya halaman galat dari proxy. Cetak mentahnya.
    console.log(`HTTP ${res.status}`);
    console.log(teks);
    process.exitCode = 1;
    return null;
  }

  console.log(`HTTP ${res.status}`);
  console.log(JSON.stringify(data, null, 2));

  if (!res.ok || data.error) {
    process.exitCode = 1;
    if (data.error === "error_sign" || /sign/i.test(String(data.message ?? ""))) {
      console.error(
        "\nSignature ditolak. Periksa: partner key tanpa spasi di ujung, partner ID\n" +
          "yang cocok dengan key-nya, dan jam komputer yang tidak meleset jauh.",
      );
    }
  }
  return data;
}

/* ---------------- Validasi argumen ---------------- */

function wajib(nilai, nama) {
  if (!nilai) {
    console.error(`Argumen <${nama}> wajib diisi. Jalankan tanpa argumen untuk melihat bantuan.`);
    process.exit(1);
  }
  return nilai;
}

function shopIdAngka(nilai) {
  wajib(nilai, "shop_id");
  if (!/^\d+$/.test(nilai)) {
    console.error("<shop_id> harus berupa angka.");
    process.exit(1);
  }
  return Number(nilai);
}

/* ---------------- Perintah ---------------- */

/** 1. Cetak URL otorisasi untuk dibuka di peramban oleh pemilik toko sandbox. */
function perintahAuth(kred, redirect = REDIRECT_BAWAAN) {
  const apiPath = "/api/v2/shop/auth_partner";
  const url = susunUrl(apiPath, { ...paramPublik(kred, apiPath), redirect });

  console.log("\nBuka URL berikut di peramban dan login dengan akun toko SANDBOX:\n");
  console.log(url.toString());
  console.log(
    `\nSesudah disetujui, Shopee mengarahkan ke:\n  ${redirect}?code=...&shop_id=...\n` +
      "Salin nilai code dan shop_id dari alamat itu, lalu jalankan:\n" +
      "  node --env-file=.env scripts/shopee-sandbox-test.mjs token <code> <shop_id>\n\n" +
      "Catatan: tautan ini memuat timestamp dan berlaku singkat (sekitar 5 menit).\n" +
      "Kalau sudah kedaluwarsa, jalankan `auth` lagi. Halaman redirect boleh gagal\n" +
      "dimuat — yang dibutuhkan hanya parameter di alamatnya.",
  );
}

/** 2. Tes utama signature: endpoint publik yang tidak butuh toko. */
async function perintahShops(kred) {
  const apiPath = "/api/v2/public/get_shops_by_partner";
  const url = susunUrl(apiPath, { ...paramPublik(kred, apiPath), page_size: 100, page_no: 1 });
  const data = await kirim("GET", url);

  if (data && !data.error) {
    console.log(
      "\nSignature DITERIMA. Daftar toko kosong itu normal bila belum ada toko\n" +
        "sandbox yang diotorisasi. Lanjutkan dengan perintah `auth`.",
    );
  }
}

/** 3. Tukar code hasil otorisasi menjadi access_token + refresh_token. */
async function perintahToken(kred, code, shopId) {
  wajib(code, "code");
  const apiPath = "/api/v2/auth/token/get";
  const url = susunUrl(apiPath, paramPublik(kred, apiPath));
  const data = await kirim("POST", url, {
    code,
    shop_id: shopIdAngka(shopId),
    partner_id: Number(kred.partnerId),
  });

  if (data?.access_token) {
    console.log(
      `\naccess_token berlaku ${data.expire_in ?? "?"} detik. Simpan refresh_token —\n` +
        "code hanya bisa ditukar SEKALI, dan tanpa refresh_token otorisasi harus diulang.\n" +
        "Lanjutkan dengan:\n" +
        "  node --env-file=.env scripts/shopee-sandbox-test.mjs orders <access_token> <shop_id>",
    );
  }
}

/** 4. Perpanjang access_token memakai refresh_token. */
async function perintahRefresh(kred, refreshToken, shopId) {
  wajib(refreshToken, "refresh_token");
  const apiPath = "/api/v2/auth/access_token/get";
  const url = susunUrl(apiPath, paramPublik(kred, apiPath));
  const data = await kirim("POST", url, {
    refresh_token: refreshToken,
    shop_id: shopIdAngka(shopId),
    partner_id: Number(kred.partnerId),
  });

  if (data?.refresh_token) {
    console.log(
      "\nrefresh_token BARU diterbitkan. Simpan yang baru — yang lama tidak\n" +
        "boleh diandalkan lagi.",
    );
  }
}

/** 5. Ambil daftar pesanan 14 hari terakhir untuk melihat bentuk data aslinya. */
async function perintahOrders(kred, accessToken, shopId) {
  wajib(accessToken, "access_token");
  const idToko = shopIdAngka(shopId);
  const apiPath = "/api/v2/order/get_order_list";

  const sekarang = timestampSekarang();
  const url = susunUrl(apiPath, {
    ...paramToko(kred, apiPath, accessToken, idToko),
    time_range_field: "create_time",
    time_from: sekarang - HARI_KE_BELAKANG * 24 * 60 * 60,
    time_to: sekarang,
    page_size: 20,
  });

  const data = await kirim("GET", url);
  if (data && !data.error && !(data.response?.order_list ?? []).length) {
    console.log(
      `\nTidak ada pesanan dalam ${HARI_KE_BELAKANG} hari terakhir. Buat pesanan uji di\n` +
        "toko sandbox lebih dulu kalau ingin melihat bentuk datanya.",
    );
  }
}

/* ---------------- Bantuan ---------------- */

function tampilkanBantuan() {
  console.log(`
Uji kredensial sandbox Shopee Open Platform
Host: ${HOST}

PEMAKAIAN
  node --env-file=.env scripts/shopee-sandbox-test.mjs <perintah> [argumen]

PERINTAH
  shops                              Tes signature (endpoint publik). Hasil kosong = normal.
  auth [redirect_url]                Cetak URL otorisasi toko.
                                     Bawaan redirect: ${REDIRECT_BAWAAN}
  token <code> <shop_id>             Tukar code hasil otorisasi jadi access_token.
  refresh <refresh_token> <shop_id>  Perpanjang access_token.
  orders <access_token> <shop_id>    Daftar pesanan ${HARI_KE_BELAKANG} hari terakhir (endpoint toko).

URUTAN YANG DISARANKAN
  1. shops    pastikan signature diterima sebelum mencoba yang lain
  2. auth     buka URL-nya, setujui dengan akun toko sandbox
  3. token    tukar code + shop_id dari alamat redirect
  4. orders   lihat bentuk asli data pesanan

KREDENSIAL
  Dibaca hanya dari SHOPEE_PARTNER_ID dan SHOPEE_PARTNER_KEY.
  Salin .env.example menjadi .env lalu isi keduanya. Berkas .env tidak ikut ter-commit.
`);
}

/* ---------------- Titik masuk ---------------- */

const [perintah, ...argumen] = process.argv.slice(2);

switch (perintah) {
  case undefined:
  case "help":
  case "-h":
  case "--help":
    tampilkanBantuan();
    break;
  case "auth":
    perintahAuth(bacaKredensial(), argumen[0]);
    break;
  case "shops":
    await perintahShops(bacaKredensial());
    break;
  case "token":
    await perintahToken(bacaKredensial(), argumen[0], argumen[1]);
    break;
  case "refresh":
    await perintahRefresh(bacaKredensial(), argumen[0], argumen[1]);
    break;
  case "orders":
    await perintahOrders(bacaKredensial(), argumen[0], argumen[1]);
    break;
  default:
    console.error(`Perintah tidak dikenal: ${perintah}`);
    tampilkanBantuan();
    process.exit(1);
}
