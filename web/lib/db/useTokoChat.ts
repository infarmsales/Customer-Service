"use client";

/* ===========================================================
   Hook: daftar toko untuk panel kiri Chat.

   sumber "db"      Supabase aktif — toko dari marketplace_shops lewat
                    GET /api/shopee/toko (tabelnya berisi token, jadi
                    tidak dibaca langsung dari peramban).
   sumber "contoh"  Supabase tidak dikonfigurasi (mode demo lokal) —
                    daftar contoh DAFTAR_TOKO, perilaku lama utuh.

   Kalau route gagal, sumber tetap "db" dengan daftar kosong dan
   `galat` terisi. Sengaja TIDAK jatuh kembali ke daftar contoh:
   itu akan memunculkan lagi toko karangan dan mencampur data contoh
   ke "Semua toko" — persis yang diperbaiki di sini. Percakapan asli
   tetap terjangkau, karena panel menambahkan baris untuk toko yang
   punya percakapan tetapi tidak ada di daftar.

   Tidak memanggil marketplace, tidak memanggil Claude: Rp 0.
   =========================================================== */

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { headerBerSesi } from "@/lib/supabase/header";
import { DAFTAR_TOKO } from "@/lib/toko";
import { susunTokoChat, type TokoChat, type TokoDariApi } from "@/lib/tokoChat";

export type SumberToko = "db" | "contoh";

const DARI_CONTOH: TokoChat[] = DAFTAR_TOKO.map((t) => ({
  nama: t.nama,
  platform: t.platform,
  aktif: t.status !== "offline",
  uji: false,
}));

export function useTokoChat(): {
  sumber: SumberToko;
  toko: TokoChat[];
  memuat: boolean;
  galat: string | null;
  muatUlang: () => void;
} {
  const adaDb = getSupabase() !== null;
  const [putaran, setPutaran] = useState(0);
  const [hasil, setHasil] = useState<{ toko: TokoChat[]; memuat: boolean; galat: string | null }>({
    toko: adaDb ? [] : DARI_CONTOH,
    memuat: adaDb,
    galat: null,
  });

  useEffect(() => {
    if (!adaDb) return;
    let batal = false;
    void (async () => {
      try {
        const res = await fetch("/api/shopee/toko", { headers: await headerBerSesi(), cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as { toko?: TokoDariApi[]; error?: string };
        if (batal) return;
        if (!res.ok) {
          setHasil({ toko: [], memuat: false, galat: json.error ?? `HTTP ${res.status}` });
          return;
        }
        setHasil({ toko: susunTokoChat(json.toko ?? []), memuat: false, galat: null });
      } catch (err) {
        if (!batal) setHasil({ toko: [], memuat: false, galat: err instanceof Error ? err.message : "jaringan" });
      }
    })();
    return () => {
      batal = true;
    };
  }, [adaDb, putaran]);

  const muatUlang = useCallback(() => {
    setHasil((h) => ({ ...h, memuat: true }));
    setPutaran((n) => n + 1);
  }, []);

  return { sumber: adaDb ? "db" : "contoh", ...hasil, muatUlang };
}
