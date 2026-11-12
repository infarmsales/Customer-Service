/* ===========================================================
   Pemeta pesanan Shopee -> format internal.

   INI SATU-SATUNYA BERKAS YANG TAHU NAMA FIELD SHOPEE untuk pesanan.
   Fungsi murni: tidak membaca env, tidak menyentuh jaringan atau
   database, diuji oleh scripts/uji-shopee-pemeta.mjs.

   Nama field diambil dari dokumentasi v2.order.get_order_detail
   (dibaca 12 Okt 2026), bukan dari tebakan. Field yang tidak ada di
   dokumentasi itu — tracking_number — ditandai, bukan dikarang.

   YANG SENGAJA TIDAK DIPETAKAN

   recipient_address (nama, telepon, alamat lengkap, koordinat),
   dropshipper_phone, buyer_cpf_id. Semuanya data pribadi pembeli
   yang tidak dibutuhkan CS untuk menjawab "pesanan saya sudah sampai
   mana". Pemeta ini tidak punya tempat untuk menaruhnya, dan
   tarikPesanan.ts tidak memintanya dari Shopee sejak awal.
   =========================================================== */

import type { DetailPesananShopee, ItemPesananShopee } from "../shopee/tipe.ts";
import type { ItemInternal, PesananInternal, StatusInternal } from "./tipe.ts";

/**
 * Status Shopee -> internal. Dari dokumentasi get_order_list,
 * parameter order_status. Nilai yang tidak ada di sini jatuh ke
 * 'lainnya' dan aslinya tetap tersimpan di raw_status.
 */
export const PETA_STATUS_SHOPEE: Readonly<Record<string, StatusInternal>> = {
  UNPAID: "menunggu_pembayaran",
  READY_TO_SHIP: "perlu_dikirim",
  PROCESSED: "diproses",
  SHIPPED: "dalam_pengiriman",
  COMPLETED: "selesai",
  IN_CANCEL: "proses_batal",
  CANCELLED: "dibatalkan",
  INVOICE_PENDING: "menunggu_invoice",
  /* Tiga nilai di bawah tidak ada di daftar parameter order_status
     get_order_list (yang dipakai saat peta ini pertama ditulis), tetapi
     MUNCUL di jawaban get_order_detail toko asli (12 Nov 2026: 35 dari
     214 pesanan infarmjakarta jatuh ke 'lainnya'). Dipetakan dari arti
     namanya; nilai aslinya tetap tersimpan di raw_status.
     - TO_CONFIRM_RECEIVE: paket sudah dikirim, menunggu pembeli
       mengonfirmasi diterima. Belum 'selesai' — pembeli masih bisa
       mengajukan komplain — jadi diberi status sendiri.
     - RETRY_SHIP: pengiriman perlu diatur ulang oleh penjual.
     - TO_RETURN: pembeli mengajukan pengembalian. Bukan pembatalan,
       dan justru kasus yang paling perlu dilihat CS, jadi tidak
       digabung ke 'lainnya' maupun 'dibatalkan'.
     PENDING sengaja TIDAK dipetakan: artinya tidak jelas, dan menebak
     lebih buruk daripada 'lainnya' yang jujur. */
  TO_CONFIRM_RECEIVE: "menunggu_konfirmasi",
  RETRY_SHIP: "perlu_dikirim",
  TO_RETURN: "pengembalian",
};

export function petakanStatusShopee(
  mentah: string | null | undefined,
): { status: StatusInternal; raw_status: string | null } {
  if (!mentah) return { status: "lainnya", raw_status: null };
  return { status: PETA_STATUS_SHOPEE[mentah] ?? "lainnya", raw_status: mentah };
}

/** Epoch detik Shopee -> ISO. Nol, negatif, atau rusak -> null (bukan 1970). */
export function epochKeIso(detik: number | null | undefined): string | null {
  if (typeof detik !== "number" || !Number.isFinite(detik) || detik <= 0) return null;
  return new Date(detik * 1000).toISOString();
}

function angkaAtauNull(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function teksAtauNull(s: unknown): string | null {
  return typeof s === "string" && s.trim() !== "" ? s : null;
}

export function petakanItemShopee(it: ItemPesananShopee): ItemInternal {
  return {
    nama: teksAtauNull(it.item_name) ?? "(tanpa nama)",
    /* SKU varian lebih spesifik daripada SKU induk; pakai yang ada. */
    sku: teksAtauNull(it.model_sku) ?? teksAtauNull(it.item_sku),
    varian: teksAtauNull(it.model_name),
    qty: angkaAtauNull(it.model_quantity_purchased) ?? 0,
    harga: angkaAtauNull(it.model_discounted_price) ?? angkaAtauNull(it.model_original_price),
    gambar: teksAtauNull(it.image_info?.image_url),
  };
}

/**
 * Satu pesanan Shopee -> satu baris orders.
 *
 * @param shopUuid id baris marketplace_shops, bukan shop_id Shopee.
 */
export function petakanPesananShopee(d: DetailPesananShopee, shopUuid: string): PesananInternal {
  const { status, raw_status } = petakanStatusShopee(d.order_status);
  return {
    platform: "shopee",
    shop_id: shopUuid,
    external_order_id: d.order_sn,
    status,
    raw_status,
    /* int64 -> teks, supaya platform lain dengan id non-numerik muat
       di kolom yang sama. */
    buyer_user_id: angkaAtauNull(d.buyer_user_id) !== null ? String(d.buyer_user_id) : null,
    buyer_username: teksAtauNull(d.buyer_username),
    /* Dokumentasi: total_amount "will only return after the buyer has
       completed payment" — null untuk pesanan belum bayar itu benar. */
    total_amount: angkaAtauNull(d.total_amount),
    currency: teksAtauNull(d.currency),
    shipping_carrier: teksAtauNull(d.shipping_carrier),
    /* TODO(logistics): tracking_number TIDAK ada di get_order_detail.
       Dokumentasinya hanya memberi package_list[].package_number, yang
       bukan nomor resi kurir. Nomor resi datang dari
       /api/v2/logistics/get_tracking_number — dipasang menyusul. */
    tracking_number: null,
    items: (d.item_list ?? []).map(petakanItemShopee),
    ship_by_date: epochKeIso(d.ship_by_date),
    order_created_at: epochKeIso(d.create_time),
    order_updated_at: epochKeIso(d.update_time),
  };
}
