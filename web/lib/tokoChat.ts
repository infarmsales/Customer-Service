/* ===========================================================
   Daftar toko di panel kiri Chat — dibaca dari INTEGRASI ASLI.

   Sampai 12 Nov 2026 panel itu memakai DAFTAR_TOKO di lib/toko.ts:
   sepuluh nama yang ditulis tangan sebelum satu toko pun tersambung.
   Setelah toko Shopee asli diintegrasikan, panelnya tetap menampilkan
   "Infarm Bali", "Infarm Surabaya" — toko yang tidak ada — sementara
   toko yang benar-benar tersambung tidak muncul sama sekali.

   Sekarang sumbernya marketplace_shops (lewat GET /api/shopee/toko),
   dan setiap percakapan dipilah ke salah satu dari empat jenis:

     asli      datang dari marketplace (external_conversation_id terisi)
               di toko yang BUKAN toko uji. Balasan sampai ke pembeli.
     uji       datang dari marketplace, tetapi tokonya toko uji
               (sandbox). Pembelinya akun uji.
     simulasi  buatan halaman /simulasi (customer_id berawalan sim_).
     contoh    data contoh bawaan (seed) — tidak dari mana-mana.

   "Semua toko" HANYA berisi yang asli. Data uji/simulasi/contoh
   tidak pernah ikut angka antrean toko asli; semuanya punya tempat
   sendiri di bagian "Uji" yang terlihat jelas terpisah.

   Murni — tanpa React, tanpa jaringan — supaya bisa diuji:
     npm run uji-toko-chat
   =========================================================== */

import { namaTokoDari, SEMUA_TOKO, type Platform } from "./toko.ts";

export type JenisPercakapan = "asli" | "uji" | "simulasi" | "contoh";

/** Pilihan khusus di bagian Uji (bukan nama toko). */
export const PILIH_SIMULASI = "__simulasi__";
export const PILIH_CONTOH = "__contoh__";

export const LABEL_JENIS: Record<Exclude<JenisPercakapan, "asli">, string> = {
  uji: "UJI",
  simulasi: "SIMULASI",
  contoh: "CONTOH",
};

export type TokoChat = {
  nama: string;
  platform: Platform;
  aktif: boolean;
  /** Toko sandbox/uji — pembelinya bukan pembeli sungguhan. */
  uji: boolean;
};

/** Baris dari GET /api/shopee/toko yang dipakai di sini. */
export type TokoDariApi = {
  platform?: unknown;
  external_shop_id?: unknown;
  shop_name?: unknown;
  is_active?: unknown;
};

const PLATFORM_DIKENAL: readonly Platform[] = ["shopee", "tiktok", "lazada"];

/**
 * Apakah ini toko uji?
 *
 * Penandanya nama toko. TikTok memberi nama "SANDBOX_ID…" pada toko
 * pengembangan, dan nama itulah yang ditulis ke marketplace_shops.
 * Belum ada kolom penanda di tabel; menambah kolom berarti migrasi,
 * padahal nama sandbox memang selalu mengandung kata itu.
 *
 * Yang dicocokkan hanya kata "sandbox" — BUKAN "test"/"uji". Toko
 * asli boleh saja bernama "Infarm Testing Kit"; salah menganggapnya
 * toko uji berarti chat pembeli sungguhan hilang dari "Semua toko".
 */
export function tokoUji(nama: string): boolean {
  return /sandbox/i.test(nama);
}

/**
 * Ubah jawaban API menjadi daftar toko panel.
 * - Platform yang tidak dikenal dibuang (tidak bisa diberi lencana).
 * - Nama kosong diganti "<Platform> <shop_id>", sama dengan yang
 *   ditulis penerima push Shopee ke conversations.shop_name.
 * - Nama ganda (huruf besar-kecil diabaikan) hanya muncul sekali:
 *   percakapan dicocokkan ke toko lewat NAMA, jadi dua baris bernama
 *   sama akan menampilkan isi yang persis sama.
 * - Urutan: toko asli dulu (per platform, sesuai urutan API), toko uji
 *   di belakang.
 */
export function susunTokoChat(baris: readonly TokoDariApi[]): TokoChat[] {
  const hasil: TokoChat[] = [];
  const sudah = new Set<string>();
  for (const b of baris) {
    const platform = b.platform as Platform;
    if (!PLATFORM_DIKENAL.includes(platform)) continue;
    const namaMentah = typeof b.shop_name === "string" ? b.shop_name.trim() : "";
    const idToko = typeof b.external_shop_id === "string" || typeof b.external_shop_id === "number"
      ? String(b.external_shop_id)
      : "";
    const nama = namaMentah || `${platform === "shopee" ? "Shopee" : platform === "tiktok" ? "TikTok" : "Lazada"} ${idToko}`.trim();
    const kunci = nama.toLowerCase();
    if (sudah.has(kunci)) continue;
    sudah.add(kunci);
    hasil.push({ nama, platform, aktif: b.is_active === true, uji: tokoUji(nama) });
  }
  const urutPlatform = (p: Platform) => PLATFORM_DIKENAL.indexOf(p);
  return hasil
    .map((t, i) => ({ t, i }))
    .sort((a, b) =>
      Number(a.t.uji) - Number(b.t.uji) ||
      urutPlatform(a.t.platform) - urutPlatform(b.t.platform) ||
      a.i - b.i,
    )
    .map((x) => x.t);
}

type PercakapanMinimal = {
  customer_id?: string | null;
  shop_name?: string | null;
  external_conversation_id?: string | null;
  platform?: string | null;
};

/**
 * Jenis sebuah percakapan. Urutan pemeriksaan penting:
 * simulasi dulu (ia bisa memakai nama toko yang sama dengan toko
 * asli, mis. "infarm"), lalu ada/tidaknya id dari marketplace.
 */
export function jenisPercakapan(c: PercakapanMinimal): JenisPercakapan {
  if ((c.customer_id ?? "").startsWith("sim_")) return "simulasi";
  if (!c.external_conversation_id) return "contoh";
  return tokoUji(namaTokoDari(c.shop_name)) ? "uji" : "asli";
}

/** Apakah percakapan ini tampil untuk pilihan di panel kiri? */
export function cocokPilihan(c: PercakapanMinimal, pilihan: string): boolean {
  const jenis = jenisPercakapan(c);
  if (pilihan === SEMUA_TOKO) return jenis === "asli";
  if (pilihan === PILIH_SIMULASI) return jenis === "simulasi";
  if (pilihan === PILIH_CONTOH) return jenis === "contoh";
  if (jenis !== "asli" && jenis !== "uji") return false;
  return namaTokoDari(c.shop_name).toLowerCase() === pilihan.trim().toLowerCase();
}

export type HitunganPanel = {
  /** Percakapan asli seluruhnya — angka "Semua toko". */
  asli: number;
  simulasi: number;
  contoh: number;
  /** Per nama toko (huruf kecil), hanya percakapan asli & uji. */
  perToko: Map<string, number>;
};

export function hitungPanel(daftar: readonly PercakapanMinimal[]): HitunganPanel {
  const h: HitunganPanel = { asli: 0, simulasi: 0, contoh: 0, perToko: new Map() };
  for (const c of daftar) {
    const jenis = jenisPercakapan(c);
    if (jenis === "simulasi") h.simulasi++;
    else if (jenis === "contoh") h.contoh++;
    else {
      if (jenis === "asli") h.asli++;
      const kunci = namaTokoDari(c.shop_name).toLowerCase();
      if (kunci) h.perToko.set(kunci, (h.perToko.get(kunci) ?? 0) + 1);
    }
  }
  return h;
}

/**
 * Toko yang ditampilkan: semua toko aktif, ditambah toko nonaktif
 * yang MASIH punya percakapan — menyembunyikannya berarti chat
 * pembelinya tidak bisa dibuka dari mana pun.
 *
 * Percakapan asli yang tokonya tidak ada di daftar sama sekali
 * (mis. toko dihapus dari tabel) juga diberi baris sendiri, dengan
 * alasan yang sama.
 */
export function tokoTampil(
  toko: readonly TokoChat[],
  daftar: readonly PercakapanMinimal[],
  perToko: Map<string, number>,
): TokoChat[] {
  const tampil = toko.filter((t) => t.aktif || (perToko.get(t.nama.toLowerCase()) ?? 0) > 0);
  const dikenal = new Set(toko.map((t) => t.nama.toLowerCase()));
  for (const c of daftar) {
    const jenis = jenisPercakapan(c);
    if (jenis !== "asli" && jenis !== "uji") continue;
    const nama = namaTokoDari(c.shop_name);
    if (!nama || dikenal.has(nama.toLowerCase())) continue;
    dikenal.add(nama.toLowerCase());
    const p = PLATFORM_DIKENAL.find((x) => x === c.platform);
    tampil.push({ nama, platform: p ?? "shopee", aktif: false, uji: jenis === "uji" });
  }
  return tampil;
}
