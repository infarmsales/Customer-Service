"use client";

/* ===========================================================
   Bagian bersama panel Gemini: UjiGemini (sekali tanya, halaman AI
   Chatbot) dan ObrolanGemini (bolak-balik, Simulasi).

   Tidak ada yang di sini memanggil generateContent. useInfoGemini
   hanya GET /api/uji-gemini — status + models.list, tanpa kuota
   generate.
   =========================================================== */

import { useEffect, useState } from "react";
import { headerBerSesi } from "@/lib/supabase/header";

export type InfoGemini = {
  tersedia: boolean;
  terkunci: boolean;
  modelBawaan: string;
  maksToken: number;
  model: { id: string; nama: string; batasMasuk: number | null }[];
  galatModel: string | null;
};

/** Sisi terpanjang foto setelah dikecilkan di peramban. */
const SISI_MAKS = 1280;

/** Kecilkan foto di peramban -> JPEG base64 (tanpa awalan data:). */
export async function kecilkanFoto(berkas: File): Promise<{ mime: string; data: string; pratinjau: string }> {
  const url = URL.createObjectURL(berkas);
  try {
    const img = await new Promise<HTMLImageElement>((ok, gagal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => gagal(new Error("Berkas bukan gambar yang bisa dibaca."));
      i.src = url;
    });
    const skala = Math.min(1, SISI_MAKS / Math.max(img.naturalWidth, img.naturalHeight));
    const kanvas = document.createElement("canvas");
    kanvas.width = Math.max(1, Math.round(img.naturalWidth * skala));
    kanvas.height = Math.max(1, Math.round(img.naturalHeight * skala));
    const ctx = kanvas.getContext("2d");
    if (!ctx) throw new Error("Peramban tidak bisa mengolah gambar.");
    ctx.drawImage(img, 0, 0, kanvas.width, kanvas.height);
    const dataUrl = kanvas.toDataURL("image/jpeg", 0.85);
    return { mime: "image/jpeg", data: dataUrl.split(",")[1] ?? "", pratinjau: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Status Gemini + daftar model untuk dropdown. */
export function useInfoGemini() {
  const [info, setInfo] = useState<InfoGemini | null>(null);
  const [galatInfo, setGalatInfo] = useState<string | null>(null);
  const [model, setModel] = useState("");

  useEffect(() => {
    let batal = false;
    void (async () => {
      try {
        const r = await fetch("/api/uji-gemini", { headers: await headerBerSesi(), cache: "no-store" });
        const j = await r.json();
        if (batal) return;
        if (!r.ok) {
          setGalatInfo(j?.error ?? `HTTP ${r.status}`);
          return;
        }
        setInfo(j as InfoGemini);
        setModel((j as InfoGemini).modelBawaan);
      } catch (e) {
        if (!batal) setGalatInfo((e as Error).message);
      }
    })();
    return () => {
      batal = true;
    };
  }, []);

  const daftar = info?.model ?? [];
  /* Model bawaan selalu ada di pilihan, walau daftar dari Google gagal dimuat. */
  const pilihanModel =
    info && !daftar.some((m) => m.id === info.modelBawaan)
      ? [{ id: info.modelBawaan, nama: `${info.modelBawaan} (bawaan)`, batasMasuk: null }, ...daftar]
      : daftar;

  const statusTeks = galatInfo
    ? "status tidak terbaca"
    : !info
      ? "memeriksa…"
      : !info.tersedia
        ? "GEMINI_API_KEY belum diisi ⚠️"
        : info.terkunci
          ? "Gemini dikunci 🔒"
          : "Gemini siap ✅";
  const statusKelas = !info
    ? "text-muted"
    : !info.tersedia
      ? "text-[#d97706]"
      : info.terkunci
        ? "text-[#b91c1c]"
        : "text-green-dark";

  return {
    info,
    galatInfo,
    model,
    setModel,
    pilihanModel,
    siap: Boolean(info?.tersedia && !info.terkunci),
    statusTeks,
    statusKelas,
  };
}
