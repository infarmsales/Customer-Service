"use client";

/* ===========================================================
   Hook: pesanan asli untuk tab "Daftar Pesanan" — per halaman.

   Dua sumber, dua jalur — sengaja:

   - orders dibaca LANGSUNG dari peramban. Policy orders_select
     memberi SELECT ke semua akun login, dan tabelnya tidak memuat
     data pribadi (alamat/telepon hanya di orders_raw yang tertutup).

   - nama toko lewat GET /api/shopee/toko, karena marketplace_shops
     berisi token dan sengaja tidak bisa dibaca peramban. Route itu
     hanya mengembalikan kolom yang aman. Kalau gagal, tabel pesanan
     tetap tampil — hanya nama tokonya "tidak dikenal".

   PAGINASI (12 Nov 2026): hanya PER_HALAMAN baris yang diminta tiap
   kali; saringan toko/status/cari dijalankan database sehingga
   mencakup SELURUH pesanan. Hitungan chip = satu COUNT per status
   dengan saringan toko + cari yang sama, dihitung ulang hanya saat
   toko/cari/muat-ulang berubah (bukan saat pindah halaman/status).

   Tidak memanggil marketplace dan tidak memanggil Claude: Rp 0.
   =========================================================== */

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import { headerBerSesi } from "@/lib/supabase/header";
import { SEMUA_STATUS_INTERNAL } from "@/lib/marketplace/tipe";
import {
  kunciCari,
  rentangHalaman,
  type BarisPesanan,
  type Saringan,
  type TokoRingkas,
} from "@/lib/daftarPesanan";

export type KeadaanDaftar = "tanpa_db" | "memuat" | "siap" | "galat";

const KOLOM =
  "id, platform, shop_id, external_order_id, status, raw_status, buyer_username, total_amount, currency, " +
  "shipping_carrier, tracking_number, items, ship_by_date, order_created_at, order_updated_at, synced_at";

/** Kode Postgres "kolom tidak ada" — migrasi cari_teks belum dijalankan. */
const KOLOM_TIDAK_ADA = "42703";

type TokoDariApi = {
  id: string;
  platform: string;
  external_shop_id: string;
  shop_name: string | null;
  is_active: boolean;
  orders_synced_until?: string | null;
};

async function bacaToko(): Promise<TokoRingkas[]> {
  try {
    const res = await fetch("/api/shopee/toko", { headers: await headerBerSesi(), cache: "no-store" });
    if (!res.ok) return [];
    const json = (await res.json()) as { toko?: TokoDariApi[] };
    return (json.toko ?? []).map((t) => ({
      id: t.id,
      nama: t.shop_name ?? `Toko ${t.external_shop_id}`,
      platform: t.platform,
      aktif: t.is_active,
      /* Pernah disinkronkan = titik sinkronnya sudah terisi. */
      sinkron: typeof t.orders_synced_until === "string" && t.orders_synced_until !== "",
    }));
  } catch {
    return [];
  }
}

/* Builder PostgREST bertipe sangat dalam; cukup diperlakukan sebagai
   rantai filter di sini. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Kueri = any;

/** Saringan toko + cari (tanpa status). null = pasti kosong, jangan bertanya ke database. */
function saringDasar(q: Kueri, toko: string, cari: string): Kueri | null {
  let k = q;
  if (toko !== "semua") k = k.eq("shop_id", toko);
  const pola = kunciCari(cari);
  if (pola === "") return null;
  if (pola !== null) k = k.ilike("cari_teks", `%${pola}%`);
  return k;
}

async function hitungStatus(
  sb: SupabaseClient,
  toko: string,
  cari: string,
): Promise<{ hitung: Record<string, number>; total: number; galat: string | null; kode: string | null }> {
  const kosong = { hitung: {}, total: 0, galat: null, kode: null };
  const satu = async (status: string | null) => {
    const q = saringDasar(sb.from("orders").select("id", { count: "exact", head: true }), toko, cari);
    if (q === null) return { n: 0, galat: null as string | null, kode: null as string | null };
    const r = await (status ? q.eq("status", status) : q);
    return { n: typeof r.count === "number" ? r.count : 0, galat: r.error?.message ?? null, kode: r.error?.code ?? null };
  };
  if (kunciCari(cari) === "") return kosong;
  const [semua, ...per] = await Promise.all([satu(null), ...SEMUA_STATUS_INTERNAL.map((s) => satu(s))]);
  const gagal = [semua, ...per].find((x) => x.galat);
  if (gagal) return { ...kosong, galat: gagal.galat, kode: gagal.kode };
  const hitung: Record<string, number> = {};
  SEMUA_STATUS_INTERNAL.forEach((s, i) => (hitung[s] = per[i].n));
  return { hitung, total: semua.n, galat: null, kode: null };
}

export function useDaftarPesanan(s: Saringan, halaman: number): {
  keadaan: KeadaanDaftar;
  daftar: BarisPesanan[];
  toko: TokoRingkas[];
  galat: string | null;
  /** Jumlah pesanan yang cocok saringan (termasuk status) — untuk paginasi. null = belum terbaca. */
  totalCocok: number | null;
  /** Hitungan per status, saringan toko + cari. */
  hitung: Record<string, number>;
  /** Total untuk chip "Semua" (toko + cari, tanpa status). */
  totalSemua: number;
  dimuatPada: string | null;
  muatUlang: () => void;
} {
  const adaDb = getSupabase() !== null;
  const [putaran, setPutaran] = useState(0);
  const [toko, setToko] = useState<TokoRingkas[]>([]);
  const [halamanData, setHalamanData] = useState<{
    keadaan: KeadaanDaftar;
    daftar: BarisPesanan[];
    galat: string | null;
    totalCocok: number | null;
    dimuatPada: string | null;
  }>({ keadaan: adaDb ? "memuat" : "tanpa_db", daftar: [], galat: null, totalCocok: null, dimuatPada: null });
  const [chip, setChip] = useState<{ hitung: Record<string, number>; totalSemua: number }>({
    hitung: {},
    totalSemua: 0,
  });

  /* Nama toko — sekali per muat ulang. */
  useEffect(() => {
    if (!adaDb) return;
    let batal = false;
    void (async () => {
      const t = await bacaToko();
      if (!batal) setToko(t);
    })();
    return () => {
      batal = true;
    };
  }, [adaDb, putaran]);

  /* Hitungan chip — hanya saat toko / cari / muat ulang berubah. */
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let batal = false;
    void (async () => {
      const r = await hitungStatus(sb, s.toko, s.cari);
      if (batal) return;
      if (r.galat) {
        console.error("[daftar pesanan] hitung status:", r.galat);
        return; /* galatnya dilaporkan kueri halaman, yang memakai saringan sama */
      }
      setChip({ hitung: r.hitung, totalSemua: r.total });
    })();
    return () => {
      batal = true;
    };
  }, [s.toko, s.cari, putaran]);

  /* Satu halaman baris. */
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let batal = false;
    void (async () => {
      const { dari, sampai } = rentangHalaman(halaman);
      let q = saringDasar(
        /* count "exact" = jumlah SEMUA baris yang cocok, tidak terpengaruh range. */
        sb.from("orders").select(KOLOM, { count: "exact" }),
        s.toko,
        s.cari,
      );
      if (q === null) {
        if (!batal)
          setHalamanData({ keadaan: "siap", daftar: [], galat: null, totalCocok: 0, dimuatPada: new Date().toISOString() });
        return;
      }
      if (s.status !== "semua") q = q.eq("status", s.status);
      const r = await q
        .order("order_created_at", { ascending: false, nullsFirst: false })
        /* Pengurut kedua: tanpa ini, pesanan dengan waktu sama bisa
           berpindah halaman di antara dua permintaan. */
        .order("id", { ascending: true })
        .range(dari, sampai);
      if (batal) return;
      if (r.error) {
        console.error("[daftar pesanan]", r.error.message);
        const galat =
          r.error.code === KOLOM_TIDAK_ADA
            ? "Pencarian belum siap: migrasi 20261112130000_status_shopee_tambahan.sql belum dijalankan."
            : r.error.message;
        setHalamanData((h) => ({ ...h, keadaan: "galat", galat }));
        return;
      }
      setHalamanData({
        keadaan: "siap",
        daftar: (r.data ?? []) as unknown as BarisPesanan[],
        galat: null,
        totalCocok: typeof r.count === "number" ? r.count : null,
        dimuatPada: new Date().toISOString(),
      });
    })();
    return () => {
      batal = true;
    };
  }, [s.toko, s.status, s.cari, halaman, putaran]);

  const muatUlang = useCallback(() => {
    setHalamanData((h) => (h.keadaan === "tanpa_db" ? h : { ...h, keadaan: "memuat" }));
    setPutaran((n) => n + 1);
  }, []);

  return { ...halamanData, toko, hitung: chip.hitung, totalSemua: chip.totalSemua, muatUlang };
}
