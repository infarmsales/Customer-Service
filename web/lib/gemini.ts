/* ===========================================================
   Klien Gemini (Google AI Studio) — SISI SERVER SAJA.

   Hanya untuk MEJA UJI: halaman AI Chatbot dan bagian uji foto di
   Simulasi. Chat pelanggan di halaman Chat tetap memakai Claude
   (lib/claude.ts) dan tidak pernah melewati berkas ini.

   Tanpa SDK: dua panggilan REST biasa dengan fetch.
     - models.list       -> daftar model untuk dropdown. TIDAK menghasilkan
                            teks, tidak memakai kuota generate.
     - generateContent   -> BERBAYAR (atau memakai kuota tier gratis).

   Env:
     GEMINI_API_KEY      wajib. Dibuat di aistudio.google.com.
     GEMINI_MODEL        model bawaan bila pemanggil tidak memilih.
     GEMINI_MAX_TOKENS   jatah token keluar, TERMASUK token berpikir.
     GEMINI_LOCK=1       kunci Gemini sendirian. AI_TEST_LOCK=1 juga
                         mengunci Gemini (saklar induk semua AI berbayar).

   Key dikirim lewat header x-goog-api-key, BUKAN ?key= di URL —
   URL bisa ikut tercetak di log dan pesan galat.
   =========================================================== */

import "server-only";
import {
  bacaJawaban,
  bolehCobaUlang,
  galatAman,
  jelaskanGalat,
  saringModel,
  susunPermintaan,
  type GambarUji,
  type JawabanGemini,
  type ModelGemini,
  type PesanRiwayat,
} from "./geminiAturan";

const DASAR = "https://generativelanguage.googleapis.com/v1beta";

export const MODEL_GEMINI_BAWAAN = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/**
 * 2048, bukan 600 seperti Claude: pada model "thinking" (2.5 Pro/Flash)
 * jatah ini ikut dipakai untuk berpikir. 600 bisa habis sebelum satu
 * kata balasan pun ditulis.
 */
export const MAKS_TOKEN_GEMINI = Number(process.env.GEMINI_MAX_TOKENS || 2048);

const ya = (v: string | undefined) => {
  const t = (v || "").trim().toLowerCase();
  return t === "1" || t === "true" || t === "ya";
};

/** Kunci saldo — sama semangatnya dengan aiTerkunci() untuk Claude. */
export function geminiTerkunci(): boolean {
  return ya(process.env.AI_TEST_LOCK) || ya(process.env.GEMINI_LOCK);
}

export function geminiTersedia(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export class GalatGemini extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Anggaran waktu SATU permintaan ke route, termasuk satu coba ulang.
 * Harus di bawah maxDuration route (60 dtk): kalau Vercel yang memutus
 * lebih dulu, peramban hanya menerima halaman galat HTML tanpa
 * penjelasan apa pun.
 */
const ANGGARAN_MS = 50_000;
/** Coba ulang hanya bila sisa waktu masih cukup untuk satu jawaban. */
const SISA_MINIMAL_COBA_ULANG_MS = 15_000;

async function panggilSekali(path: string, init: RequestInit, kunci: string, batasMs: number): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${DASAR}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", "x-goog-api-key": kunci, ...(init.headers ?? {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(batasMs),
    });
  } catch (err) {
    const habisWaktu = (err as Error).name === "TimeoutError" || (err as Error).name === "AbortError";
    if (habisWaktu) {
      throw new GalatGemini(
        jelaskanGalat(504, `tidak ada jawaban dalam ${Math.round(batasMs / 1000)} detik`),
        504,
      );
    }
    throw new GalatGemini(galatAman(`Tidak bisa menghubungi Gemini: ${(err as Error).message}`, kunci), 502);
  }
  const json = (await res.json().catch(() => null)) as { error?: { message?: unknown; status?: unknown } } | null;
  if (!res.ok) {
    const isi = typeof json?.error?.message === "string" ? json.error.message : `HTTP ${res.status}`;
    const status = typeof json?.error?.status === "string" ? ` (${json.error.status})` : "";
    throw new GalatGemini(jelaskanGalat(res.status, galatAman(`Gemini menolak permintaan: ${isi}${status}`, kunci)), res.status);
  }
  return json;
}

async function panggil(path: string, init: RequestInit): Promise<unknown> {
  const kunci = process.env.GEMINI_API_KEY;
  if (!kunci) throw new GalatGemini("GEMINI_API_KEY belum diisi di environment server.", 503);
  const batas = Date.now() + ANGGARAN_MS;
  try {
    return await panggilSekali(path, init, kunci, ANGGARAN_MS);
  } catch (err) {
    /* Satu coba ulang untuk server Google yang penuh sesaat. Permintaan
       yang ditolak 503/500 tidak menghasilkan balasan dan tidak ditagih. */
    if (!(err instanceof GalatGemini) || !bolehCobaUlang(err.status)) throw err;
    await new Promise((r) => setTimeout(r, 1500));
    const sisa = batas - Date.now();
    if (sisa < SISA_MINIMAL_COBA_ULANG_MS) throw err;
    return await panggilSekali(path, init, kunci, sisa);
  }
}

let cacheModel: { pada: number; daftar: ModelGemini[] } | null = null;
const UMUR_CACHE_MODEL_MS = 10 * 60_000;

/** Daftar model untuk dropdown. Di-cache 10 menit per instance server. */
export async function daftarModelGemini(): Promise<ModelGemini[]> {
  if (cacheModel && Date.now() - cacheModel.pada < UMUR_CACHE_MODEL_MS) return cacheModel.daftar;
  const json = await panggil("/models?pageSize=1000", { method: "GET" });
  const daftar = saringModel(json);
  cacheModel = { pada: Date.now(), daftar };
  return daftar;
}

/** Satu balasan. BERBAYAR (atau memakai kuota tier gratis). */
export async function mintaGemini(a: {
  model: string;
  system: string;
  teks: string;
  riwayat?: PesanRiwayat[];
  gambar?: GambarUji | null;
}): Promise<JawabanGemini> {
  const badan = susunPermintaan({ ...a, maksToken: MAKS_TOKEN_GEMINI });
  const json = await panggil(`/models/${encodeURIComponent(a.model)}:generateContent`, {
    method: "POST",
    body: JSON.stringify(badan),
  });
  return bacaJawaban(json);
}
