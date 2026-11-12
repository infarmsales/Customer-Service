"use client";

/* ===========================================================
   Hook: pesanan asli untuk tab "Daftar Pesanan".

   Dua sumber, dua jalur — sengaja:

   - orders dibaca LANGSUNG dari peramban. Policy orders_select
     memberi SELECT ke semua akun login, dan tabelnya tidak memuat
     data pribadi (alamat/telepon hanya di orders_raw yang tertutup).

   - nama toko lewat GET /api/shopee/toko, karena marketplace_shops
     berisi token dan sengaja tidak bisa dibaca peramban. Route itu
     hanya mengembalikan kolom yang aman. Kalau gagal, tabel pesanan
     tetap tampil — hanya nama tokonya "tidak dikenal".

   Tidak memanggil marketplace dan tidak memanggil Claude: Rp 0.
   =========================================================== */

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { headerBerSesi } from "@/lib/supabase/header";
import { BATAS_BARIS, type BarisPesanan, type TokoRingkas } from "@/lib/daftarPesanan";

export type KeadaanDaftar = "tanpa_db" | "memuat" | "siap" | "galat";

const KOLOM =
  "id, platform, shop_id, external_order_id, status, raw_status, buyer_username, total_amount, currency, " +
  "shipping_carrier, tracking_number, items, ship_by_date, order_created_at, order_updated_at, synced_at";

type TokoDariApi = {
  id: string;
  platform: string;
  external_shop_id: string;
  shop_name: string | null;
  is_active: boolean;
  sinkron_pesanan?: unknown;
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
      /* Hanya true yang berarti disinkronkan; kolom yang belum ada
         (migrasi belum jalan) = tidak. */
      sinkron: t.sinkron_pesanan === true,
    }));
  } catch {
    return [];
  }
}

export function useDaftarPesanan(): {
  keadaan: KeadaanDaftar;
  daftar: BarisPesanan[];
  toko: TokoRingkas[];
  galat: string | null;
  /** true bila jumlah baris menyentuh BATAS_BARIS — ada pesanan lebih lama yang tidak dimuat. */
  terpotong: boolean;
  dimuatPada: string | null;
  muatUlang: () => void;
} {
  const adaDb = getSupabase() !== null;
  const [putaran, setPutaran] = useState(0);
  const [hasil, setHasil] = useState<{
    keadaan: KeadaanDaftar;
    daftar: BarisPesanan[];
    toko: TokoRingkas[];
    galat: string | null;
    dimuatPada: string | null;
  }>({ keadaan: adaDb ? "memuat" : "tanpa_db", daftar: [], toko: [], galat: null, dimuatPada: null });

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let batal = false;
    void (async () => {
      const [pesanan, toko] = await Promise.all([
        sb
          .from("orders")
          .select(KOLOM)
          .order("order_created_at", { ascending: false, nullsFirst: false })
          .limit(BATAS_BARIS),
        bacaToko(),
      ]);
      if (batal) return;
      if (pesanan.error) {
        console.error("[daftar pesanan]", pesanan.error.message);
        setHasil((h) => ({ ...h, keadaan: "galat", galat: pesanan.error.message, toko }));
        return;
      }
      setHasil({
        keadaan: "siap",
        daftar: (pesanan.data ?? []) as unknown as BarisPesanan[],
        toko,
        galat: null,
        dimuatPada: new Date().toISOString(),
      });
    })();
    return () => {
      batal = true;
    };
  }, [putaran]);

  const muatUlang = useCallback(() => {
    setHasil((h) => (h.keadaan === "tanpa_db" ? h : { ...h, keadaan: "memuat" }));
    setPutaran((n) => n + 1);
  }, []);

  return { ...hasil, terpotong: hasil.daftar.length >= BATAS_BARIS, muatUlang };
}
