"use client";

/* ===========================================================
   Bagian bersama panel meja uji: UjiGemini (sekali tanya, halaman AI
   Chatbot) dan ObrolanGemini (bolak-balik, Simulasi).

   Kedua panel melayani DUA penyedia lewat prop `penyedia`:
     "gemini" -> /api/uji-gemini   (Google)
     "openai" -> /api/uji-openai   (ChatGPT)
   Tampilan & alurnya sengaja sama supaya perbandingan model adil.

   Tidak ada yang di sini menghasilkan teks berbayar. useInfoPenyedia
   hanya GET status + daftar model (gratis).
   =========================================================== */

import { useEffect, useState } from "react";
import { headerBerSesi } from "@/lib/supabase/header";

export type Penyedia = "gemini" | "openai" | "nvidia";

type InfoPenyedia = {
  nama: string;
  endpoint: string;
  envKey: string;
  ikon: string;
  /** Kalimat soal biaya & data, tampil di kotak kuning panel. */
  peringatan: string;
  /** Ditempel di belakang angka rupiah per balasan. */
  akhiranBiaya: string;
  /** false = rupiah tidak dihitung sama sekali (NVIDIA memakai kredit uji, bukan tarif per token). */
  hitungRupiah: boolean;
  /** Pengganti angka biaya bila model tidak ada di tabel tarif. */
  tanpaTarif: string;
};

export const PENYEDIA: Record<Penyedia, InfoPenyedia> = {
  gemini: {
    nama: "Gemini",
    endpoint: "/api/uji-gemini",
    envKey: "GEMINI_API_KEY",
    ikon: "✨",
    peringatan: "Bila key Anda tier gratis, isinya boleh dipakai Google untuk melatih model.",
    akhiranBiaya: " bila berbayar (tier gratis: Rp 0)",
    hitungRupiah: true,
    tanpaTarif: "tarif model belum ada di tabel",
  },
  openai: {
    nama: "ChatGPT",
    endpoint: "/api/uji-openai",
    envKey: "OPENAI_API_KEY",
    ikon: "🤖",
    peringatan: "API OpenAI tidak punya tier gratis — setiap balasan memotong kredit sungguhan.",
    akhiranBiaya: "",
    hitungRupiah: true,
    tanpaTarif: "tarif model belum ada di tabel",
  },
  nvidia: {
    nama: "NVIDIA",
    endpoint: "/api/uji-openai?penyedia=nvidia",
    envKey: "NVIDIA_API_KEY",
    ikon: "🟩",
    peringatan:
      "NVIDIA memakai kredit uji akun build.nvidia.com (bukan tarif per token) dan dibatasi jumlah permintaan per menit. Cek sisa kredit di akun Anda.",
    akhiranBiaya: "",
    hitungRupiah: false,
    tanpaTarif: "memakai kredit uji NVIDIA",
  },
};

/** Sumber jawaban yang berarti model DIPANGGIL (bukan dicegat satpam/template). */
export const dariModel = (sumber: string | undefined) =>
  sumber === "gemini" || sumber === "openai" || sumber === "nvidia";

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

/**
 * Baca jawaban route tanpa pernah meledak. Bila Vercel memutus fungsi
 * (batas waktu, badan terlalu besar), yang datang adalah halaman galat
 * teks/HTML, bukan JSON — dulu tampil sebagai "Unexpected token 'A'".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- bentuk jawaban berbeda per sumber
export async function bacaJsonAman(r: Response): Promise<any> {
  const teks = await r.text();
  try {
    return JSON.parse(teks);
  } catch {
    const sebab = teks.includes("FUNCTION_INVOCATION_TIMEOUT")
      ? "melewati batas waktu server (60 detik) — model terlalu lama menjawab. Coba lagi atau pilih model yang lebih ringan."
      : teks.includes("FUNCTION_PAYLOAD_TOO_LARGE") || r.status === 413
        ? "kiriman terlalu besar (foto terlalu banyak/besar). Mulai ulang obrolan."
        : teks.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140) || "jawaban kosong";
    return { error: `Server memutus permintaan (HTTP ${r.status}): ${sebab}` };
  }
}

/** Status penyedia + daftar model untuk dropdown. */
export function useInfoPenyedia(penyedia: Penyedia = "gemini") {
  const p = PENYEDIA[penyedia];
  const [info, setInfo] = useState<InfoGemini | null>(null);
  const [galatInfo, setGalatInfo] = useState<string | null>(null);
  const [model, setModel] = useState("");

  useEffect(() => {
    let batal = false;
    void (async () => {
      try {
        const r = await fetch(p.endpoint, { headers: await headerBerSesi(), cache: "no-store" });
        const j = await bacaJsonAman(r);
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
  }, [p.endpoint]);

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
        ? `${p.envKey} belum diisi ⚠️`
        : info.terkunci
          ? `${p.nama} dikunci 🔒`
          : `${p.nama} siap ✅`;
  const statusKelas = !info
    ? "text-muted"
    : !info.tersedia
      ? "text-[#d97706]"
      : info.terkunci
        ? "text-[#b91c1c]"
        : "text-green-dark";

  return {
    p,
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
