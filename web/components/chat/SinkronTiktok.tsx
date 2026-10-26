"use client";

/* ===========================================================
   Tombol "Sinkronkan chat TikTok" di daftar percakapan.

   Manual, bukan cron (keputusan 26 Okt 2026). Hasilnya tidak perlu
   dimuat ulang di sini: sinkronisasi menulis ke tabel conversations,
   dan langganan Realtime halaman ini (store.ts) memuat ulang daftar
   sendiri begitu barisnya berubah.

   Gratis — hanya membaca TikTok dan tidak menyentuh Claude.
   =========================================================== */

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { headerBerSesi } from "@/lib/supabase/header";

type HasilToko = { toko: string; ok: boolean; percakapan: number; baru: number; diperbarui: number; galat?: string };

export default function SinkronTiktok() {
  const [sibuk, setSibuk] = useState(false);
  const toast = useToast();

  const sinkron = async () => {
    if (sibuk) return;
    setSibuk(true);
    try {
      const r = await fetch("/api/sync/tiktok-chat", { method: "POST", headers: await headerBerSesi() });
      const d = (await r.json()) as { toko?: HasilToko[]; error?: string };
      if (!r.ok || d.error) {
        toast(`Sinkron TikTok gagal: ${d.error ?? `HTTP ${r.status}`}`);
        return;
      }
      const toko = d.toko ?? [];
      if (toko.length === 0) {
        toast("Belum ada toko TikTok yang terhubung");
        return;
      }
      const gagal = toko.filter((t) => !t.ok);
      if (gagal.length > 0) {
        toast(`Sinkron TikTok gagal di ${gagal[0].toko}: ${gagal[0].galat ?? "?"}`);
        return;
      }
      const baru = toko.reduce((n, t) => n + t.baru, 0);
      const diperbarui = toko.reduce((n, t) => n + t.diperbarui, 0);
      toast(baru + diperbarui === 0 ? "Chat TikTok sudah terbaru" : `TikTok: ${baru} percakapan baru, ${diperbarui} diperbarui`);
    } catch (e) {
      toast("Sinkron TikTok gagal: " + (e as Error).message);
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div className="border-b border-line-soft px-2 py-2">
      <button
        type="button"
        onClick={() => void sinkron()}
        disabled={sibuk}
        className="min-h-10 w-full cursor-pointer rounded-xl border border-line bg-white px-3 py-2 text-[0.78rem] font-bold text-text-2 transition hover:bg-green-soft disabled:opacity-50"
      >
        {sibuk ? "Menarik chat TikTok…" : "🔄 Sinkronkan chat TikTok"}
      </button>
    </div>
  );
}
