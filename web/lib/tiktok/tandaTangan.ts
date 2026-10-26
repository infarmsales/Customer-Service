/* ===========================================================
   Tanda tangan permintaan TikTok Shop Open API.

   HANYA DIPANGGIL DARI SERVER. Menerima App Secret sebagai argumen;
   mengimpornya dari komponen klien akan menyeret kunci itu ke bundel
   peramban.

   RUMUSNYA (Create a hash to sign your test API call, dibaca 26 Okt
   2026 dari zip dokumentasi di _referensi/tiktok-docs/)

     1. Ambil semua parameter query KECUALI `sign` dan `access_token`.
     2. Urutkan menurut nama, alfabetis.
     3. Sambung nama+nilai tanpa pemisah:  app_key123timestamp456
     4. Taruh path API di depannya:        /authorization/202309/shops...
     5. Bila ada badan JSON, sambung badan mentahnya di belakang.
     6. Bungkus dengan App Secret di depan DAN di belakang.
     7. HMAC-SHA256 dengan kunci App Secret, keluaran hex huruf kecil.

   Langkah 5 tidak dirinci di halaman yang ada di zip (ia merujuk ke
   "Sign your API request" yang tidak ikut diunduh). Yang ditulis di
   sini — badan mentah persis seperti yang dikirim, disambung apa
   adanya — sesuai kalimat "the body used for signing exactly matches
   the body sent". Fase baca-saja hanya memakai GET tanpa badan, jadi
   langkah 5 belum pernah diuji terhadap TikTok sungguhan.

   Perbedaan penting dari Shopee: kuncinya DIBUNGKUS di kedua ujung
   string, bukan hanya jadi kunci HMAC; dan parameter disusun menurut
   abjad, bukan urutan tetap.
   =========================================================== */

import { createHmac } from "node:crypto";

/** Open API toko (Customer Service, Authorization, Order, ...). */
export const HOST_API = "https://open-api.tiktokglobalshop.com";

/** Server otorisasi — HANYA untuk token/get dan token/refresh. */
export const HOST_AUTH = "https://auth.tiktok-shops.com";

export type Kredensial = {
  appKey: string;
  appSecret: string;
};

/** Detik sejak epoch. TikTok menolak milidetik (36009004 Invalid timestamp). */
export function timestampSekarang(): number {
  return Math.floor(Date.now() / 1000);
}

/** Parameter yang TIDAK ikut ditandatangani. */
const DIKECUALIKAN = new Set(["sign", "access_token"]);

/**
 * String yang ditandatangani, SEBELUM HMAC. Dipisah supaya uji bisa
 * memeriksa susunannya, bukan hanya hasil akhirnya.
 */
export function stringUntukSign(
  appSecret: string,
  path: string,
  query: Readonly<Record<string, string | number>>,
  badan?: string,
): string {
  const urut = Object.keys(query)
    .filter((k) => !DIKECUALIKAN.has(k))
    .sort()
    .map((k) => `${k}${String(query[k])}`)
    .join("");
  return `${appSecret}${path}${urut}${badan ?? ""}${appSecret}`;
}

export function buatSign(
  appSecret: string,
  path: string,
  query: Readonly<Record<string, string | number>>,
  badan?: string,
): string {
  return createHmac("sha256", appSecret)
    .update(stringUntukSign(appSecret, path, query, badan))
    .digest("hex");
}

/**
 * Query lengkap untuk satu permintaan: app_key, timestamp, parameter
 * khas endpoint, lalu sign yang dihitung atas semuanya.
 */
export function queryBertanda(
  kred: Kredensial,
  path: string,
  khas: Readonly<Record<string, string | number>>,
  badan?: string,
  timestamp: number = timestampSekarang(),
): Record<string, string> {
  const q: Record<string, string> = { app_key: kred.appKey, timestamp: String(timestamp) };
  for (const [k, v] of Object.entries(khas)) q[k] = String(v);
  q.sign = buatSign(kred.appSecret, path, q, badan);
  return q;
}

export function susunUrl(host: string, path: string, query: Readonly<Record<string, string>>): URL {
  const url = new URL(path, host);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return url;
}
