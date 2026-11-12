/* ===========================================================
   Aturan otorisasi & umur token Shopee — fungsi murni.

   Tidak membaca env, tidak menyentuh jaringan atau database. Semua
   yang di sini bisa diuji tanpa apa pun (scripts/uji-shopee-
   otorisasi.mjs). Yang menyentuh database ada di token.ts.

   KENAPA DIPISAH DARI token.ts

   Keputusan "token ini masih segar?" dan "expire_in ini detik atau
   epoch?" adalah tempat bug yang paling mahal: salah satu arah
   membuat sinkronisasi memakai token basi dan gagal diam-diam, arah
   lainnya membuat refresh dipanggil berulang sampai refresh_token
   hangus — dan refresh_token yang hangus berarti pemilik toko harus
   mengotorisasi ulang. Keputusan seperti itu harus bisa diuji tanpa
   Supabase dan tanpa Shopee.
   =========================================================== */

import {
  buatSign,
  susunUrl,
  timestampSekarang,
  type Kredensial,
} from "./tandaTangan.ts";

/** Dari dokumentasi: access_token berumur 4 jam. Dipakai bila expire_in tidak terbaca. */
export const UMUR_ACCESS_TOKEN_DETIK = 4 * 60 * 60;

/** Dari dokumentasi: refresh_token berlaku 30 hari. */
export const UMUR_REFRESH_TOKEN_HARI = 30;

/**
 * Token dianggap basi bila sisa umurnya kurang dari ini. Sinkronisasi
 * yang memakan beberapa menit tidak boleh mendapati tokennya mati di
 * tengah jalan.
 */
export const MARGIN_SEGAR_MENIT = 10;

/** Berapa lama satu proses boleh memegang kunci penyegaran. */
export const LAMA_KUNCI_DETIK = 30;

/**
 * Ambang untuk membedakan epoch dari durasi pada expire_in.
 *
 * 1e9 detik = sekitar 31 tahun. Tidak ada token yang berumur sepanjang
 * itu, dan tidak ada epoch yang lebih kecil dari itu sejak 2001. Jadi
 * nilai di bawah ambang pasti durasi, di atasnya pasti epoch.
 */
export const AMBANG_EPOCH = 1_000_000_000;

const JALUR_OTORISASI = "/api/v2/shop/auth_partner";

/**
 * URL yang dibuka pemilik toko untuk menyetujui otorisasi.
 *
 * Tanda tangannya memakai basis endpoint publik (tanpa access_token
 * dan shop_id). Tautan ini berumur singkat — sekitar 5 menit — jadi
 * selalu dibuat baru saat tombolnya ditekan, tidak pernah disimpan.
 *
 * @param redirect URL balik PERSIS seperti yang terdaftar di konsol
 *   Shopee. Shopee menambahkan ?code=...&shop_id=... di belakangnya.
 */
export function urlOtorisasi(
  kred: Kredensial,
  host: string,
  redirect: string,
  timestamp: number = timestampSekarang(),
): URL {
  return susunUrl(host, JALUR_OTORISASI, {
    partner_id: kred.partnerId,
    timestamp,
    sign: buatSign(kred.partnerKey, [kred.partnerId, JALUR_OTORISASI, timestamp]),
    redirect,
  });
}

/**
 * Kapan access_token habis, dari expire_in yang bentuknya tidak
 * konsisten di dokumentasi Shopee (lihat tipe.ts JawabanToken).
 *
 *   14400        -> durasi detik  -> sekarang + 14400
 *   1767001812   -> epoch detik   -> saat itu sendiri
 *   kosong/rusak -> sekarang + 4 jam (umur resmi dari dokumentasi)
 *
 * Nilai rusak sengaja TIDAK dianggap "sudah kedaluwarsa": itu akan
 * memicu refresh pada setiap panggilan, dan setiap refresh membakar
 * satu refresh_token sekali pakai.
 *
 * @param sekarangDetik epoch detik (bukan milidetik).
 */
export function hitungKedaluwarsaToken(
  expireIn: number | null | undefined,
  sekarangDetik: number,
): Date {
  if (typeof expireIn !== "number" || !Number.isFinite(expireIn) || expireIn <= 0) {
    return new Date((sekarangDetik + UMUR_ACCESS_TOKEN_DETIK) * 1000);
  }
  if (expireIn >= AMBANG_EPOCH) return new Date(expireIn * 1000);
  return new Date((sekarangDetik + expireIn) * 1000);
}

/**
 * Apakah access_token masih boleh dipakai tanpa disegarkan?
 *
 * Nilai yang tidak terbaca dianggap TIDAK segar. Ini kebalikan dari
 * sikap di sesi.ts, dan alasannya berbeda: di sini "tidak segar"
 * hanya berarti satu panggilan refresh — murah dan bisa dibatalkan —
 * sedangkan memakai token yang ternyata basi berarti seluruh
 * sinkronisasi gagal dengan galat yang menyamar jadi masalah lain.
 */
export function tokenMasihSegar(
  kedaluwarsaIso: string | null | undefined,
  sekarangMs: number,
  marginMenit: number = MARGIN_SEGAR_MENIT,
): boolean {
  if (!kedaluwarsaIso) return false;
  const batas = Date.parse(kedaluwarsaIso);
  if (Number.isNaN(batas)) return false;
  if (!Number.isFinite(marginMenit) || marginMenit < 0) marginMenit = MARGIN_SEGAR_MENIT;
  return batas - sekarangMs > marginMenit * 60_000;
}

/**
 * Apakah kunci penyegaran masih dipegang proses lain?
 *
 * Kunci yang sudah lewat waktunya dianggap bebas: proses pemegangnya
 * bisa saja mati di tengah jalan (timeout serverless), dan tanpa
 * aturan ini satu kematian seperti itu mengunci toko selamanya.
 */
export function kunciMasihDipegang(
  refreshingUntilIso: string | null | undefined,
  sekarangMs: number,
): boolean {
  if (!refreshingUntilIso) return false;
  const sampai = Date.parse(refreshingUntilIso);
  if (Number.isNaN(sampai)) return false;
  return sampai > sekarangMs;
}

/**
 * Kode galat refresh yang berarti refresh_token sudah tidak bisa
 * dipakai lagi — toko harus diotorisasi ulang oleh pemiliknya.
 *
 * Daftar dari: v2.public.refresh_access_token, Business Error Codes
 * dan Error Example. error_auth masuk karena contoh resminya berbunyi
 * "Invalid refresh_token." — tetapi HANYA dalam konteks refresh;
 * pada endpoint lain error_auth berarti hal yang berbeda.
 *
 * Yang sengaja TIDAK masuk: error_server, error_network, error_param.
 * Itu kegagalan sementara atau kesalahan kita; menonaktifkan toko
 * karena Shopee sedang sakit berarti memaksa 18 pemilik toko
 * mengotorisasi ulang tanpa alasan.
 */
export function kodeTokenHangus(kode: string | null | undefined): boolean {
  if (!kode) return false;
  switch (kode) {
    case "refresh_token_expired":
    case "error_shop_refresh_token":
    case "shop_access_expired":
    case "shop_no_linked":
    case "shop_banned":
    case "error_auth":
      return true;
    default:
      return false;
  }
}

/* -----------------------------------------------------------
   URL balik otorisasi: akun toko ATAU akun utama
   ----------------------------------------------------------- */

/** Batas toko yang diterima dari satu otorisasi akun utama. */
export const BATAS_TOKO_AKUN_UTAMA = 50;

const ANGKA_ID = /^\d{1,20}$/;

export type BalikOtorisasi =
  | { jenis: "toko"; code: string; shopId: string }
  | { jenis: "akun_utama"; code: string; mainAccountId: string };

/**
 * Baca parameter URL balik dari Shopee (docs/shopee-api/shop.auth_partner.md):
 *
 *   ?code=...&shop_id=...          login dengan akun toko — satu toko
 *   ?code=...&main_account_id=...  login dengan akun utama — bisa banyak
 *                                  toko, daftarnya baru diketahui dari
 *                                  shop_id_list di jawaban token/get
 *
 * shop_id didahulukan bila keduanya ada: jalur satu toko adalah yang
 * sudah terbukti. null = parameter kurang atau bukan angka.
 */
export function bacaBalikOtorisasi(p: URLSearchParams): BalikOtorisasi | null {
  const code = (p.get("code") ?? "").trim();
  if (!code) return null;
  const shopId = (p.get("shop_id") ?? "").trim();
  if (ANGKA_ID.test(shopId)) return { jenis: "toko", code, shopId };
  const mainAccountId = (p.get("main_account_id") ?? "").trim();
  if (ANGKA_ID.test(mainAccountId)) return { jenis: "akun_utama", code, mainAccountId };
  return null;
}

/**
 * shop_id_list dari token/get -> daftar shop_id teks: hanya angka
 * positif, tanpa kembar, urutan dipertahankan, paling banyak
 * BATAS_TOKO_AKUN_UTAMA. Nilai rusak dibuang satuan, tidak
 * menggagalkan seluruh daftar.
 */
export function daftarTokoAkunUtama(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const hasil: string[] = [];
  for (const v of list) {
    const s = typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? String(v) : typeof v === "string" ? v.trim() : "";
    if (!ANGKA_ID.test(s) || /^0+$/.test(s) || hasil.includes(s)) continue;
    hasil.push(s);
    if (hasil.length >= BATAS_TOKO_AKUN_UTAMA) break;
  }
  return hasil;
}

/* -----------------------------------------------------------
   Baris yang ditulis saat toko diotorisasi
   ----------------------------------------------------------- */

/**
 * Isi upsert marketplace_shops untuk toko yang baru diotorisasi
 * (akun toko maupun setiap shop_id dari otorisasi akun utama).
 *
 * SENGAJA TIDAK memuat sinkron_pesanan: toko BARU mendapat bawaan kolom
 * (false), dan toko LAMA yang diotorisasi ulang mempertahankan nilainya.
 * Toko besar tidak boleh ikut tersinkron hanya karena baru diotorisasi
 * lewat akun utama. Diuji di uji-shopee-sinkron.mjs.
 */
export function barisSimpanToko(
  platform: string,
  shopId: string,
  token: { accessToken: string; refreshToken: string; accessExpiresAt: Date; refreshExpiresAt: Date },
): Record<string, string | boolean | null> {
  return {
    platform,
    external_shop_id: shopId,
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    access_token_expires_at: token.accessExpiresAt.toISOString(),
    refresh_token_expires_at: token.refreshExpiresAt.toISOString(),
    refreshing_until: null,
    is_active: true,
  };
}
