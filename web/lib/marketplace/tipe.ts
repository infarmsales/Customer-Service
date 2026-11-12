/* ===========================================================
   Format pesanan INTERNAL — yang dipakai seluruh aplikasi.

   Tidak ada satu pun nama field Shopee di sini. Konektor berikutnya
   (Tokopedia, Blibli, Lazada) menghasilkan bentuk yang sama lewat
   pemetanya masing-masing, dan halaman Pesanan, panel Chat, maupun
   AI tidak perlu tahu dari marketplace mana sebuah pesanan datang.

   Bentuknya sengaja = baris tabel public.orders (snake_case), supaya
   hasil pemeta bisa langsung di-upsert tanpa lapisan terjemahan kedua.
   =========================================================== */

/**
 * Kosakata status internal. Sama persis dengan CHECK di migrasi
 * 20261012120100_orders.sql — mengubah salah satu tanpa yang lain
 * membuat upsert ditolak database.
 */
export type StatusInternal =
  | "menunggu_pembayaran"
  | "perlu_dikirim"
  | "diproses"
  | "dalam_pengiriman"
  | "menunggu_konfirmasi"
  | "selesai"
  | "proses_batal"
  | "dibatalkan"
  | "menunggu_invoice"
  | "pengembalian"
  | "lainnya";

export const SEMUA_STATUS_INTERNAL: readonly StatusInternal[] = [
  "menunggu_pembayaran",
  "perlu_dikirim",
  "diproses",
  "dalam_pengiriman",
  "menunggu_konfirmasi",
  "selesai",
  "proses_batal",
  "dibatalkan",
  "menunggu_invoice",
  "pengembalian",
  "lainnya",
];

/** Label Bahasa Indonesia untuk layar. */
export const LABEL_STATUS: Record<StatusInternal, string> = {
  menunggu_pembayaran: "Menunggu pembayaran",
  perlu_dikirim: "Perlu dikirim",
  diproses: "Diproses",
  dalam_pengiriman: "Dalam pengiriman",
  menunggu_konfirmasi: "Menunggu konfirmasi diterima",
  selesai: "Selesai",
  proses_batal: "Proses batal",
  dibatalkan: "Dibatalkan",
  menunggu_invoice: "Menunggu invoice",
  pengembalian: "Pengembalian / retur",
  lainnya: "Lainnya",
};

/** Satu baris barang di kolom orders.items. Tidak pernah memuat data pembeli. */
export type ItemInternal = {
  nama: string;
  sku: string | null;
  varian: string | null;
  qty: number;
  /** Harga satuan sesudah diskon, dalam mata uang pesanan. */
  harga: number | null;
  gambar: string | null;
};

/** = baris public.orders tanpa kolom yang diisi database (id, created_at, ...). */
export type PesananInternal = {
  platform: string;
  /** uuid baris marketplace_shops — BUKAN shop_id marketplace. */
  shop_id: string;
  external_order_id: string;
  status: StatusInternal;
  raw_status: string | null;
  buyer_user_id: string | null;
  buyer_username: string | null;
  total_amount: number | null;
  currency: string | null;
  shipping_carrier: string | null;
  tracking_number: string | null;
  items: ItemInternal[];
  ship_by_date: string | null;
  order_created_at: string | null;
  order_updated_at: string | null;
};
