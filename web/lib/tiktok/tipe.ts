/* ===========================================================
   Tipe jawaban TikTok Shop — hanya yang dipakai.

   Sumber: zip dokumentasi di _referensi/tiktok-docs/ (diunduh 26 Okt
   2026), KECUALI TokoTerotorisasi: halaman Get Authorized Shops tidak
   ikut di zip, jadi bentuknya dari pengetahuan umum tentang API
   202309 dan BELUM terbukti. Pembacanya (token.ts) sengaja longgar.
   =========================================================== */

/** data dari token/get dan token/refresh. */
export type JawabanToken = {
  access_token?: string;
  /** Epoch detik — BUKAN durasi. Bawaan 7 hari. */
  access_token_expire_in?: number;
  refresh_token?: string;
  /** Epoch detik; sama dengan lama otorisasi yang dipilih penjual. */
  refresh_token_expire_in?: number;
  open_id?: string;
  seller_name?: string;
  seller_base_region?: string;
  /** 0 = penjual TikTok Shop. */
  user_type?: number;
  granted_scopes?: string[];
};

/** Satu toko dari GET /authorization/202309/shops — BELUM terverifikasi. */
export type TokoTerotorisasi = {
  id?: string;
  name?: string;
  region?: string;
  cipher?: string;
  code?: string;
  seller_type?: string;
};

export type DaftarTokoTerotorisasi = { shops?: TokoTerotorisasi[] };

/** Peserta percakapan. */
export type Peserta = {
  im_user_id?: string;
  user_id?: string;
  role?: "BUYER" | "SHOP" | "CUSTOMER_SERVICE" | string;
  nickname?: string;
  avatar?: string;
  /** Khusus toko Indonesia: TIKTOK_SHOP atau TOKOPEDIA. */
  buyer_platform?: string;
};

export type PesanTiktok = {
  id?: string;
  /** TEXT, IMAGE, ORDER_CARD, PRODUCT_CARD, NOTIFICATION, ... */
  type?: string;
  /** JSON dalam bentuk STRING, mis. "{\"content\":\"halo\"}". */
  content?: string;
  create_time?: number;
  /** false = jangan ditampilkan ke CS (mis. permintaan rating dari sistem). */
  is_visible?: boolean;
  sender?: { im_user_id?: string; role?: string; nickname?: string; avatar?: string };
  index?: string;
};

export type Percakapan = {
  id?: string;
  participant_count?: number;
  can_send_message?: boolean;
  unread_count?: number;
  create_time?: number;
  participants?: Peserta[];
  latest_message?: PesanTiktok;
};

export type DaftarPercakapan = {
  next_page_token?: string;
  conversations?: Percakapan[];
};

export type DaftarPesan = {
  next_page_token?: string;
  unsupported_msg_tips?: string;
  messages?: PesanTiktok[];
};
