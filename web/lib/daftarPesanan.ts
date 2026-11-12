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

   KENAPA PENYARINGAN DI SINI, BUKAN DI KUERI

   Hitungan per status di chip harus tetap menunjukkan seluruh
   pesanan toko yang dipilih, bukan hanya status yang sedang aktif.
   Dengan satu kueri lalu saring di peramban, chip dan tabel selalu
   sepakat. Batasnya BATAS_BARIS baris terbaru; kalau tercapai, layar
   mengatakannya, supaya "tidak ketemu" tidak terbaca sebagai jawaban.
   =========================================================== */

import { normalkan } from "./cocok.ts";
import { SEMUA_STATUS_INTERNAL, LABEL_STATUS } from "./marketplace/tipe.ts";
import type { PesananPembeli } from "./pesananPembeli.ts";

/** Berapa pesanan terbaru yang dimuat sekali buka. */
export const BATAS_BARIS = 500;

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
  /** marketplace_shops.sinkron_pesanan. false = toko terhubung tapi pesanannya tidak ditarik. */
  sinkron: boolean;
};

/**
 * Toko yang dipilih di saringan tapi pesanannya TIDAK disinkronkan
 * (mis. toko besar yang baru diotorisasi). Daftar kosong untuk toko
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

function cocokCari(p: BarisPesanan, cari: string): boolean {
  const k = cari.trim();
  if (k === "") return true;
  const nk = normalkan(k);
  /* Nomor pesanan & resi: dibandingkan tanpa tanda baca, supaya
     "2410 15ABC-DEF" tetap menemukan 241015ABCDEF. Nama akun &
     produk: cukup memuat teksnya. */
  const nomor = [p.external_order_id, p.tracking_number ?? ""];
  if (nk.length > 0 && nomor.some((n) => normalkan(n).includes(nk))) return true;
  const kecil = k.toLowerCase();
  if ((p.buyer_username ?? "").toLowerCase().includes(kecil)) return true;
  return (p.items ?? []).some((i) => (i?.nama ?? "").toLowerCase().includes(kecil));
}

/** Baris yang lolos saringan toko + cari (TANPA status) — dasar hitungan chip. */
export function saringTanpaStatus(daftar: readonly BarisPesanan[], s: Saringan): BarisPesanan[] {
  return daftar.filter((p) => (s.toko === "semua" || p.shop_id === s.toko) && cocokCari(p, s.cari));
}

/** Baris yang ditampilkan di tabel. */
export function saringPesanan(daftar: readonly BarisPesanan[], s: Saringan): BarisPesanan[] {
  return saringTanpaStatus(daftar, s).filter((p) => s.status === "semua" || p.status === s.status);
}

/**
 * Chip status: "Semua" + setiap status yang PUNYA pesanan, urut
 * kosakata internal. Status asing (tidak ada di kosakata) tetap
 * mendapat chip sendiri di belakang — tidak boleh ada pesanan yang
 * tidak bisa dijangkau lewat chip mana pun.
 */
export function chipStatus(daftar: readonly BarisPesanan[]): { value: string; label: string; count: number }[] {
  const hitung = new Map<string, number>();
  for (const p of daftar) hitung.set(p.status, (hitung.get(p.status) ?? 0) + 1);
  const dikenal = SEMUA_STATUS_INTERNAL.filter((s) => hitung.has(s)).map((s) => ({
    value: s as string,
    label: LABEL_STATUS[s],
    count: hitung.get(s) ?? 0,
  }));
  const asing = [...hitung.keys()]
    .filter((s) => !(SEMUA_STATUS_INTERNAL as readonly string[]).includes(s))
    .sort()
    .map((s) => ({ value: s, label: s, count: hitung.get(s) ?? 0 }));
  return [{ value: "semua", label: "Semua", count: daftar.length }, ...dikenal, ...asing];
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
        (t.sinkron ? "" : " — pesanan belum disinkronkan"),
    })),
    ...tanpaNama.map((id) => ({ value: id, label: "Toko tidak dikenal" })),
  ];
}
