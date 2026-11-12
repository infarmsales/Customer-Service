/* ===========================================================
   Tab "Daftar Pesanan" di halaman Pesanan — aturan murni.

   Tidak menyentuh Supabase atau React; itu ada di
   lib/db/useDaftarPesanan.ts. Diuji oleh scripts/uji-daftar-
   pesanan.mjs (npm run uji-daftar-pesanan).

   Tab ini membaca tabel orders ASLI — pesanan yang ditarik
   sinkronisasi dari marketplace — bukan data contoh. Gunanya dua:
   tim CS melihat pesanan tanpa membuka Seller Center, dan sesudah
   toko baru diotorisasi, inilah bukti yang terlihat bahwa pesanannya
   benar-benar masuk.

   PAGINASI DI DATABASE (12 Nov 2026)

   Sebelumnya 500 pesanan terbaru dimuat sekaligus lalu disaring di
   peramban. Dua masalahnya: 500 baris yang tampil terbaca sebagai
   "baru 500 pesanan tersinkron" (isinya 9.005), dan saringan toko /
   status / pencarian diam-diam hanya mencari di 500 itu.

   Sekarang setiap halaman meminta PER_HALAMAN baris saja, dan
   saringannya dijalankan database — jadi mencakup SELURUH pesanan.
   Angka chip status dihitung database juga, dengan saringan toko +
   pencarian yang sama, supaya chip dan tabel tetap sepakat.
   =========================================================== */

import { normalkan } from "./cocok.ts";
import { SEMUA_STATUS_INTERNAL, LABEL_STATUS } from "./marketplace/tipe.ts";
import type { PesananPembeli } from "./pesananPembeli.ts";

/** Baris per halaman tabel. */
export const PER_HALAMAN = 50;

export type BarisPesanan = PesananPembeli & {
  platform: string;
  shop_id: string;
  buyer_username: string | null;
  synced_at: string | null;
};

export type TokoRingkas = {
  id: string;
  nama: string;
  platform: string;
  aktif: boolean;
  /** Pernah disinkronkan (orders_synced_until terisi). false = toko terhubung tapi pesanannya belum pernah ditarik. */
  sinkron: boolean;
};

/**
 * Toko yang dipilih di saringan tapi pesanannya BELUM PERNAH disinkronkan
 * (mis. toko besar yang baru diotorisasi dan belum ditekan tombolnya). Daftar kosong untuk toko
 * ini tidak boleh terbaca sebagai "tidak ada pesanan".
 */
export function tokoBelumDisinkron(pilihan: string, toko: readonly TokoRingkas[]): TokoRingkas | null {
  if (pilihan === "semua") return null;
  const t = toko.find((x) => x.id === pilihan);
  return t && !t.sinkron ? t : null;
}

export type Saringan = {
  /** "semua" atau uuid baris marketplace_shops. */
  toko: string;
  /** "semua" atau status internal. */
  status: string;
  cari: string;
};

export const SARINGAN_AWAL: Saringan = { toko: "semua", status: "semua", cari: "" };

/**
 * Pola pencarian untuk kolom orders.cari_teks.
 *
 * Kolom itu berisi nomor pesanan, resi, akun pembeli, dan nama
 * produk — huruf kecil, TANPA spasi dan tanda baca (lihat migrasi
 * 20261112130000). Kata kunci dinormalkan dengan cara yang sama,
 * jadi "2410 15abc-def" tetap menemukan 241015ABCDEF dan "sari, keb"
 * menemukan akun "Sari, Kebun".
 *
 * Hasilnya hanya [a-z0-9]: tidak ada koma, titik, kurung, % atau _
 * yang bisa merusak filter PostgREST atau menjadi wildcard ILIKE.
 *
 * @returns null  = tidak menyaring (kotak kosong / spasi saja)
 *          ""    = TIDAK ADA yang cocok (kata kunci hanya tanda baca —
 *                  bukan "cocok dengan semua")
 *          teks  = pola untuk ilike '%teks%'
 */
export function kunciCari(cari: string): string | null {
  if (cari.trim() === "") return null;
  return normalkan(cari);
}

/** Halaman yang sah: bilangan bulat >= 1, dan tidak melewati halaman terakhir bila total diketahui. */
export function halamanAman(halaman: number, total: number | null = null, per: number = PER_HALAMAN): number {
  const h = Number.isFinite(halaman) ? Math.max(1, Math.floor(halaman)) : 1;
  if (total === null || !Number.isFinite(total) || total < 0) return h;
  return Math.min(h, jumlahHalaman(total, per));
}

/** Banyak halaman; minimal 1 supaya "Halaman 1 dari 0" tidak pernah muncul. */
export function jumlahHalaman(total: number, per: number = PER_HALAMAN): number {
  if (!Number.isFinite(total) || total <= 0 || per <= 0) return 1;
  return Math.ceil(total / per);
}

/** Rentang indeks untuk .range(dari, sampai) — keduanya inklusif, mulai 0. */
export function rentangHalaman(halaman: number, per: number = PER_HALAMAN): { dari: number; sampai: number } {
  const h = halamanAman(halaman);
  return { dari: (h - 1) * per, sampai: h * per - 1 };
}

/** "Menampilkan 51–100 dari 9.005 pesanan" — null bila kosong. */
export function teksRentang(halaman: number, jumlahBaris: number, total: number | null, per: number = PER_HALAMAN): string | null {
  if (jumlahBaris <= 0) return null;
  const dari = (halamanAman(halaman) - 1) * per + 1;
  const sampai = dari + jumlahBaris - 1;
  const dariTotal = total !== null && Number.isFinite(total) && total >= sampai ? ` dari ${angka(total)}` : "";
  return `Menampilkan ${angka(dari)}–${angka(sampai)}${dariTotal} pesanan`;
}

/**
 * Nomor halaman untuk tombol: selalu halaman pertama, terakhir, dan
 * dua di kiri-kanan halaman aktif; celah diganti "…".
 * Contoh (5 dari 181): [1, "…", 3, 4, 5, 6, 7, "…", 181]
 */
export function nomorHalaman(aktif: number, total: number): (number | "…")[] {
  const n = Math.max(1, Math.floor(total));
  const a = Math.min(Math.max(1, Math.floor(aktif)), n);
  const pilih = new Set<number>([1, n]);
  for (let i = a - 2; i <= a + 2; i++) if (i >= 1 && i <= n) pilih.add(i);
  const urut = [...pilih].sort((x, y) => x - y);
  const hasil: (number | "…")[] = [];
  for (let i = 0; i < urut.length; i++) {
    if (i > 0 && urut[i] - urut[i - 1] > 1) hasil.push("…");
    hasil.push(urut[i]);
  }
  return hasil;
}

/**
 * Chip status dari hitungan database: "Semua" + setiap status yang
 * PUNYA pesanan, urut kosakata internal. Status yang sedang dipilih
 * tetap tampil walau nol — kalau hilang, tidak ada cara melihat chip
 * mana yang menyala.
 */
export function chipDariHitungan(
  hitung: Readonly<Record<string, number>>,
  total: number,
  aktif: string = "semua",
): { value: string; label: string; count: number }[] {
  const dikenal = SEMUA_STATUS_INTERNAL.filter((s) => (hitung[s] ?? 0) > 0 || s === aktif).map((s) => ({
    value: s as string,
    label: LABEL_STATUS[s],
    count: hitung[s] ?? 0,
  }));
  return [{ value: "semua", label: "Semua", count: total }, ...dikenal];
}

/** 9005 -> "9.005" (pemisah ribuan Indonesia, tanpa bergantung locale mesin). */
export function angka(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Jenis Pill untuk sebuah status. */
export function jenisPill(status: string): string {
  switch (status) {
    case "selesai":
      return "done";
    case "dibatalkan":
    case "proses_batal":
      return "cancel";
    case "dalam_pengiriman":
    case "menunggu_konfirmasi":
    case "diproses":
      return "cont";
    case "perlu_dikirim":
    case "menunggu_pembayaran":
    case "menunggu_invoice":
      return "wait";
    default:
      return "refund";
  }
}

/** "Pupuk A ×2 · +1 produk" — ringkasan kolom Produk. */
export function ringkasBarang(items: BarisPesanan["items"] | null | undefined): string {
  const daftar = (items ?? []).filter((i) => i && typeof i.nama === "string" && i.nama.trim() !== "");
  if (daftar.length === 0) return "—";
  const [a, ...sisa] = daftar;
  const qty = Number.isFinite(a.qty) && a.qty > 1 ? ` ×${a.qty}` : "";
  return `${a.nama.trim()}${qty}${sisa.length > 0 ? ` · +${sisa.length} produk` : ""}`;
}

/**
 * Nama toko untuk sebuah baris. Toko yang tidak terbaca (route toko
 * gagal, atau baris lama) tetap ditandai — bukan dikosongkan, supaya
 * pesanannya tidak tampak yatim.
 */
export function namaToko(shopId: string, toko: readonly TokoRingkas[]): string {
  return toko.find((t) => t.id === shopId)?.nama ?? "Toko tidak dikenal";
}

/** Toko yang muncul di pilihan saringan: yang punya pesanan, ditambah yang aktif. */
export function pilihanToko(
  daftar: readonly BarisPesanan[],
  toko: readonly TokoRingkas[],
): { value: string; label: string }[] {
  const punya = new Set(daftar.map((p) => p.shop_id));
  const terpakai = toko.filter((t) => punya.has(t.id) || t.aktif);
  const tanpaNama = [...punya].filter((id) => !toko.some((t) => t.id === id));
  return [
    { value: "semua", label: "Semua toko" },
    ...terpakai.map((t) => ({
      value: t.id,
      label:
        `${t.nama} · ${t.platform}` +
        (t.aktif ? "" : " (nonaktif)") +
        (t.sinkron ? "" : " — belum pernah disinkronkan"),
    })),
    ...tanpaNama.map((id) => ({ value: id, label: "Toko tidak dikenal" })),
  ];
}
