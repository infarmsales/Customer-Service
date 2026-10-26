/* ===========================================================
   Daftar toko Infarm — SATU sumber untuk semua halaman.

   Sebelum ini daftarnya hidup sebagai SHOPS_AWAL di dalam
   Chat.tsx, dan halaman /simulasi punya daftar karangannya sendiri
   berisi "Toko A / Toko B / Toko C". Akibatnya peragaan menunjukkan
   toko yang tidak ada di console — pertanyaan pertama penonton pasti
   "toko A itu yang mana?", dan tidak ada jawabannya.

   BAGAIMANA PERCAKAPAN DIHUBUNGKAN KE TOKO

   Kolom `conversations.shop_name` berisi gabungan, misalnya
   "infarm · Shopee". Bentuk itu sudah dipakai data lama dan data
   demo, jadi diikuti apa adanya, bukan diganti dengan kolom baru
   yang memaksa migrasi.

   Konsekuensinya: pemisahnya (" · ") menjadi bagian dari kontrak
   data. Kalau suatu saat ada nama toko yang mengandung " · ", nama
   itu harus ditolak — bukan pemisahnya yang diganti diam-diam.
   =========================================================== */

export type Platform = "shopee" | "tiktok" | "lazada";

export type Toko = {
  nama: string;
  platform: Platform;
  status: "online" | "away" | "offline";
};

export const LABEL_PLATFORM: Record<Platform, string> = {
  shopee: "Shopee",
  tiktok: "TikTok Shop",
  lazada: "Lazada",
};

/** Warna lencana, mengikuti warna resmi tiap marketplace. */
export const KELAS_LOGO: Record<Platform, string> = {
  shopee: "bg-shp",
  tiktok: "bg-tt",
  lazada: "bg-lz",
};

export const HURUF_LOGO: Record<Platform, string> = {
  shopee: "S",
  tiktok: "T",
  lazada: "L",
};

/** Warna latar header di halaman /simulasi — warna brand marketplace. */
export const WARNA_PLATFORM: Record<Platform, string> = {
  shopee: "#ee4d2d",
  tiktok: "#010101",
  lazada: "#0f146d",
};

export const DAFTAR_TOKO: Toko[] = [
  { nama: "infarmofficialshop", platform: "shopee", status: "online" },
  { nama: "infarm", platform: "shopee", status: "online" },
  { nama: "Infarm Official", platform: "tiktok", status: "online" },
  { nama: "Infarm Yogyakarta", platform: "shopee", status: "online" },
  { nama: "Infarm Tangerang", platform: "shopee", status: "away" },
  { nama: "Infarm Jakarta", platform: "tiktok", status: "online" },
  { nama: "Infarm Semarang", platform: "shopee", status: "away" },
  { nama: "Infarm Bali", platform: "tiktok", status: "online" },
  { nama: "Infarm Surabaya", platform: "lazada", status: "offline" },
  /* Toko uji TikTok (Partner Center → Toko Pengembangan), 26 Okt 2026.
     Namanya HARUS sama dengan marketplace_shops.shop_name, karena itu
     yang ditulis sinkronisasi chat ke conversations.shop_name. Hapus
     baris ini begitu toko TikTok Infarm yang sebenarnya tersambung. */
  { nama: "SANDBOX_ID7698393095713998598", platform: "tiktok", status: "online" },
];

/** Nilai `activeShop` yang berarti "jangan saring toko sama sekali". */
export const SEMUA_TOKO = "__semua__";

const PEMISAH = " · ";

/** Susun isi kolom shop_name: "infarm · Shopee". */
export function susunShopName(nama: string, platform: Platform): string {
  return nama + PEMISAH + LABEL_PLATFORM[platform];
}

/**
 * Ambil nama toko dari shop_name.
 *
 * Memakai pemisah PERTAMA, bukan terakhir. Nama marketplace tidak
 * pernah mengandung " · ", sedangkan nama toko suatu saat bisa —
 * dan kalau itu terjadi, memotong di pemisah terakhir akan
 * memenggal nama tokonya, bukan platformnya.
 *
 * @returns "" bila kosong; percakapan tanpa shop_name tidak pernah
 *          cocok dengan toko mana pun, dan itu memang benar.
 */
export function namaTokoDari(shopName: string | null | undefined): string {
  if (!shopName) return "";
  const i = shopName.indexOf(PEMISAH);
  return (i === -1 ? shopName : shopName.slice(0, i)).trim();
}

/** Cari toko berdasarkan namanya. */
export function cariToko(nama: string): Toko | undefined {
  return DAFTAR_TOKO.find((t) => t.nama === nama);
}

/**
 * Apakah percakapan ini milik toko yang sedang dipilih?
 *
 * Perbandingannya TIDAK peka huruf besar-kecil. Daftar toko ditulis
 * manusia ("infarm", "Infarm Bali"), sementara shop_name bisa datang
 * dari data lama maupun dari simulasi — memaksa keduanya sama persis
 * berarti satu huruf kapital yang berbeda membuat percakapan hilang
 * dari layar tanpa ada yang tahu sebabnya.
 */
export function cocokToko(shopName: string | null | undefined, pilihan: string): boolean {
  if (pilihan === SEMUA_TOKO) return true;
  return namaTokoDari(shopName).toLowerCase() === pilihan.trim().toLowerCase();
}
