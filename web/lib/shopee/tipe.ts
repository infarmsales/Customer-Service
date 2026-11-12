/* ===========================================================
   Tipe balasan Shopee Open Platform v2 — hanya yang dipakai.

   Setiap tipe menyebut halaman dokumentasi asalnya, dibaca 12 Okt
   2026. Berkas ini murni tipe — tidak ada kode yang berjalan, jadi
   aman diimpor dari mana pun.

   DUA BENTUK AMPLOP, DAN INI PENTING

   Endpoint "biasa" (Order, Returns, ...) menaruh isinya di dalam
   `response`. Endpoint auth (token/get, access_token/get) DAN
   get_shop_info menaruh isinya di AKAR jawaban, sejajar dengan
   `error`. Dokumentasinya tidak menandai perbedaan ini di mana pun;
   contoh JSON-nya saja yang memperlihatkannya.

   Akibatnya: tipe yang isinya di akar dibaca lewat permintaanMentah(),
   yang di dalam `response` lewat permintaanShopee(). Salah pilih
   tidak melempar — hasilnya objek kosong yang terlihat seperti
   "berhasil tanpa data".
   =========================================================== */

/**
 * Amplop endpoint biasa. `error` selalu ada; kosong berarti berhasil.
 * Shopee sering menjawab HTTP 200 dengan `error` terisi.
 *
 * Dari: v2.order.get_order_list, v2.returns.get_return_detail.
 */
export type AmplopShopee<T> = {
  request_id?: string;
  error?: string;
  message?: string;
  response?: T;
};

/** Dari: v2.order.get_order_list, parameter order_status. */
export type StatusPesananShopee =
  | "UNPAID"
  | "READY_TO_SHIP"
  | "PROCESSED"
  | "SHIPPED"
  | "COMPLETED"
  | "IN_CANCEL"
  | "CANCELLED"
  | "INVOICE_PENDING"
  /* Tidak di daftar parameter get_order_list, tetapi muncul di
     get_order_detail toko asli — lihat PETA_STATUS_SHOPEE. */
  | "TO_CONFIRM_RECEIVE"
  | "RETRY_SHIP"
  | "TO_RETURN";

/** Dari: v2.order.get_order_list, bagian Response. Di dalam `response`. */
export type DaftarPesanan = {
  /** true = masih ada halaman berikutnya; kirim next_cursor sebagai cursor. */
  more: boolean;
  /** Kosong bila more = false. */
  next_cursor: string;
  order_list: {
    order_sn: string;
    /** Hanya ada bila response_optional_fields=order_status diminta. */
    order_status?: StatusPesananShopee;
    booking_sn?: string;
  }[];
};

/**
 * Jawaban POST /api/v2/auth/token/get (v2.public.get_access_token)
 * dan POST /api/v2/auth/access_token/get (v2.public.refresh_access_token).
 * Isinya di AKAR — baca lewat permintaanMentah().
 *
 * expire_in: dokumentasinya berbunyi "validity period of the
 * access_token, in seconds", tetapi dua contoh resminya bertentangan:
 * get_access_token memberi 1767001812 (sebuah epoch), refresh memberi
 * 14400 (empat jam dalam detik). Jangan percaya salah satunya —
 * hitungKedaluwarsaToken() di otorisasi.ts menangani keduanya.
 *
 * refresh_token: berlaku 30 hari, SEKALI PAKAI. Setiap refresh
 * menerbitkan refresh_token baru dan yang lama hangus seketika.
 */
export type JawabanToken = {
  request_id?: string;
  error?: string;
  message?: string;
  access_token?: string;
  refresh_token?: string;
  expire_in?: number;
  /** token/get: semua shop_id yang diotorisasi kali ini. */
  shop_id_list?: number[];
  /** access_token/get: shop_id yang disegarkan. */
  shop_id?: number;
  partner_id?: number;
};

/**
 * Jawaban GET /api/v2/shop/get_shop_info (v2.shop.get_shop_info).
 * Isinya di AKAR — baca lewat permintaanMentah().
 *
 * Hanya field yang dipakai; dokumentasinya memuat belasan field lain
 * (SIP, fulfillment flag, mart/outlet) yang tidak relevan untuk CS.
 */
export type InfoToko = {
  request_id?: string;
  error?: string;
  message?: string;
  shop_name?: string;
  /** Kode wilayah, mis. "ID", "SG". */
  region?: string;
  /** BANNED | FROZEN | NORMAL */
  status?: string;
  /** Epoch detik saat toko mengotorisasi aplikasi ini. */
  auth_time?: number;
  /** Epoch detik saat OTORISASI toko habis — berbeda dari umur token. */
  expire_time?: number;
};

/**
 * Satu barang di get_order_detail -> item_list[]. Hanya field yang
 * dipakai pemeta; dokumentasinya memuat puluhan field promosi,
 * bundling, dan resep yang tidak relevan untuk CS.
 *
 * Dari: v2.order.get_order_detail, bagian item_list.
 */
export type ItemPesananShopee = {
  item_id?: number;
  item_name?: string;
  item_sku?: string;
  model_id?: number;
  model_name?: string;
  model_sku?: string;
  model_quantity_purchased?: number;
  model_original_price?: number;
  model_discounted_price?: number;
  image_info?: { image_url?: string };
};

/**
 * Satu pesanan di get_order_detail -> response.order_list[].
 *
 * "Return by default" (tanpa diminta): order_sn, region, currency,
 * cod, order_status, message_to_seller, create_time, update_time,
 * days_to_ship, ship_by_date. Sisanya hanya ada bila disebut di
 * response_optional_fields — daftar yang diminta ada di
 * sinkronAturan.ts, dan SENGAJA tidak memuat recipient_address.
 *
 * tracking_number TIDAK ADA di endpoint ini (lihat pemetaPesanan.ts).
 *
 * Dari: v2.order.get_order_detail, bagian Response.
 */
export type DetailPesananShopee = {
  order_sn: string;
  order_status?: StatusPesananShopee | string;
  region?: string;
  currency?: string;
  cod?: boolean;
  create_time?: number;
  update_time?: number;
  days_to_ship?: number;
  ship_by_date?: number;
  message_to_seller?: string;
  /* --- opsional, hanya bila diminta --- */
  total_amount?: number;
  shipping_carrier?: string;
  pay_time?: number;
  buyer_user_id?: number;
  buyer_username?: string;
  item_list?: ItemPesananShopee[];
  cancel_by?: string;
  cancel_reason?: string;
};

/** Di dalam `response`. */
export type DaftarDetailPesanan = {
  order_list: DetailPesananShopee[];
};
