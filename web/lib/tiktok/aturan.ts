/* ===========================================================
   Aturan TikTok Shop — fungsi murni.

   Tidak membaca env, tidak menyentuh jaringan atau database. Diuji
   oleh scripts/uji-tiktok.mjs tanpa apa pun.
   =========================================================== */

import type { PesanTiktok, Peserta, TokoTerotorisasi } from "./tipe.ts";

/** Dokumentasi: access_token berlaku 7 hari bila tidak disebut lain. */
export const UMUR_ACCESS_TOKEN_DETIK = 7 * 86_400;

/**
 * Batas aman untuk membedakan epoch dari angka lain. Tidak ada epoch
 * yang lebih kecil dari 1e9 sejak 2001.
 */
const AMBANG_EPOCH = 1_000_000_000;

/**
 * Kedaluwarsa dari *_expire_in TikTok — yang memang EPOCH detik
 * (contoh resmi: 1660556783), bukan durasi seperti di Shopee.
 *
 * Nilai rusak atau bukan epoch -> `cadangan` detik dari sekarang.
 * Sengaja tidak "sudah kedaluwarsa": itu memicu refresh di setiap
 * panggilan.
 */
export function epochKeTanggal(
  nilai: number | null | undefined,
  sekarangDetik: number,
  cadangan: number = UMUR_ACCESS_TOKEN_DETIK,
): Date {
  if (typeof nilai === "number" && Number.isFinite(nilai) && nilai >= AMBANG_EPOCH) {
    return new Date(nilai * 1000);
  }
  return new Date((sekarangDetik + cadangan) * 1000);
}

/**
 * Toko yang bisa dipakai dari jawaban Get Authorized Shops.
 * Tanpa id atau cipher, sebuah toko tidak bisa dipanggil sama sekali,
 * jadi dibuang di sini — bukan disimpan setengah jadi.
 */
export type TokoLengkap = TokoTerotorisasi & { id: string; cipher: string };

export function tokoSah(shops: readonly TokoTerotorisasi[] | undefined): TokoLengkap[] {
  /* id dinormalkan ke teks: bentuk jawabannya belum terverifikasi,
     dan id toko yang datang sebagai angka tidak boleh membuat toko
     itu hilang diam-diam. */
  return (Array.isArray(shops) ? shops : [])
    .map((s) => ({ ...s, id: typeof s.id === "number" ? String(s.id) : s.id }))
    .filter(
      (s): s is TokoLengkap =>
        typeof s.id === "string" && s.id.trim() !== "" && typeof s.cipher === "string" && s.cipher.trim() !== "",
    );
}

/** Peserta berperan BUYER pertama; null bila tidak ada. */
export function pembeliDari(peserta: readonly Peserta[] | undefined): Peserta | null {
  return (peserta ?? []).find((p) => p.role === "BUYER") ?? null;
}

/**
 * Teks yang bisa dibaca manusia dari satu pesan.
 *
 * `content` TikTok adalah JSON yang DISERIALISASI JADI STRING. JSON
 * rusak tidak boleh melempar — satu pesan aneh tidak boleh membuat
 * seluruh percakapan gagal tampil.
 */
export function teksPesan(p: Pick<PesanTiktok, "type" | "content">): string {
  let isi: Record<string, unknown> = {};
  try {
    const hasil = JSON.parse(p.content ?? "{}");
    if (hasil && typeof hasil === "object") isi = hasil as Record<string, unknown>;
  } catch {
    return p.content ?? "";
  }

  const str = (k: string) => (typeof isi[k] === "string" || typeof isi[k] === "number" ? String(isi[k]) : "");

  switch (p.type) {
    case "TEXT":
    case "NOTIFICATION":
    case "ALLOCATED_SERVICE":
    case "BUYER_ENTER_FROM_TRANSFER":
    case "OTHER":
      return str("content");
    case "IMAGE":
      return "[Gambar]";
    case "VIDEO":
      return "[Video]";
    case "EMOTICONS":
      return "[Stiker]";
    case "ORDER_CARD":
    case "BUYER_ENTER_FROM_ORDER":
      return `[Kartu pesanan ${str("order_id")}]`.replace(" ]", "]");
    case "PRODUCT_CARD":
    case "BUYER_ENTER_FROM_PRODUCT":
      return `[Kartu produk ${str("product_id")}]`.replace(" ]", "]");
    case "RETURN_REFUND_CARD":
      return `[Kartu retur pesanan ${str("order_id")}]`.replace(" ]", "]");
    case "LOGISTICS_CARD":
      return `[Kartu pengiriman pesanan ${str("order_id")}]`.replace(" ]", "]");
    case "COUPON_CARD":
      return "[Kupon]";
    default:
      return str("content") || `[${p.type ?? "pesan"}]`;
  }
}
