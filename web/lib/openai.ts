/* ===========================================================
   Klien Chat Completions — OpenAI (ChatGPT) & NVIDIA. SISI SERVER SAJA.

   Hanya untuk MEJA UJI pembanding (halaman AI Chatbot & Simulasi),
   kembaran lib/gemini.ts. Chat pelanggan di halaman Chat tetap
   memakai Claude (lib/claude.ts) dan tidak pernah melewati berkas ini.

   NVIDIA API Catalog memakai bentuk REST yang SAMA dengan OpenAI,
   jadi satu klien melayani keduanya; bedanya hanya di KONFIG di bawah.

   Tanpa SDK: dua panggilan REST biasa dengan fetch.
     - GET  /v1/models            -> daftar model untuk dropdown. Tidak
                                     menghasilkan teks.
     - POST /v1/chat/completions  -> OpenAI: BERBAYAR, tanpa tier gratis.
                                     NVIDIA: memakai kredit uji akun.

   Env OpenAI: OPENAI_API_KEY, OPENAI_MODEL, OPENAI_MAX_TOKENS, OPENAI_LOCK
   Env NVIDIA: NVIDIA_API_KEY, NVIDIA_MODEL, NVIDIA_MAX_TOKENS, NVIDIA_LOCK,
               NVIDIA_BASE_URL (bawaan https://integrate.api.nvidia.com/v1)
   AI_TEST_LOCK=1 mengunci keduanya (saklar induk semua AI berbayar).
   =========================================================== */

import "server-only";
import {
  bacaJawabanOpenAI,
  bolehCobaUlangOpenAI,
  galatAmanOpenAI,
  jelaskanGalatOpenAI,
  saringModelNvidia,
  saringModelOpenAI,
  susunPermintaanOpenAI,
  type JawabanOpenAI,
  type ModelOpenAI,
  type PenyediaKompatibel,
} from "./openaiAturan";
import type { GambarUji, PesanRiwayat } from "./geminiAturan";

const ya = (v: string | undefined) => {
  const t = (v || "").trim().toLowerCase();
  return t === "1" || t === "true" || t === "ya";
};

type Konfig = {
  nama: string;
  dasar: string;
  envKey: string;
  modelBawaan: string;
  /**
   * OpenAI 4096: model penalaran (GPT-5, seri o) memakai jatah ini juga
   * untuk berpikir. NVIDIA sama, untuk DeepSeek-R1/gpt-oss/Qwen. Yang
   * ditagih hanya token yang benar-benar dipakai.
   */
  maksToken: number;
  terkunci: () => boolean;
  kolomMaks: "max_completion_tokens" | "max_tokens";
  saring: (json: unknown) => ModelOpenAI[];
};

/** Dibaca saat dipakai (bukan saat modul dimuat) supaya env yang diubah terbaca setelah restart server. */
function konfig(p: PenyediaKompatibel): Konfig {
  if (p === "nvidia") {
    return {
      nama: "NVIDIA",
      /* Hanya bisa diubah lewat env server, tidak pernah dari peramban. */
      dasar: (process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/+$/, ""),
      envKey: "NVIDIA_API_KEY",
      modelBawaan: process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct",
      maksToken: Number(process.env.NVIDIA_MAX_TOKENS || 4096),
      terkunci: () => ya(process.env.AI_TEST_LOCK) || ya(process.env.NVIDIA_LOCK),
      kolomMaks: "max_tokens",
      saring: saringModelNvidia,
    };
  }
  return {
    nama: "OpenAI",
    dasar: "https://api.openai.com/v1",
    envKey: "OPENAI_API_KEY",
    modelBawaan: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    maksToken: Number(process.env.OPENAI_MAX_TOKENS || 4096),
    terkunci: () => ya(process.env.AI_TEST_LOCK) || ya(process.env.OPENAI_LOCK),
    kolomMaks: "max_completion_tokens",
    saring: saringModelOpenAI,
  };
}

const kunciDari = (p: PenyediaKompatibel) => process.env[konfig(p).envKey]?.trim() || undefined;

export const modelBawaan = (p: PenyediaKompatibel) => konfig(p).modelBawaan;
export const maksToken = (p: PenyediaKompatibel) => konfig(p).maksToken;
export const terkunci = (p: PenyediaKompatibel) => konfig(p).terkunci();
export const tersedia = (p: PenyediaKompatibel) => Boolean(kunciDari(p));
export const namaEnvKey = (p: PenyediaKompatibel) => konfig(p).envKey;
export const namaPenyedia = (p: PenyediaKompatibel) => konfig(p).nama;

export class GalatOpenAI extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Di Vercel: di bawah maxDuration route (60 dtk), termasuk satu coba
 * ulang — kalau Vercel memutus lebih dulu, peramban hanya menerima
 * halaman galat tanpa penjelasan.
 * Di lokal (npm run dev) tidak ada batas itu, dan endpoint GRATIS
 * NVIDIA memakai antrean bersama yang bisa lebih dari 50 detik untuk
 * prompt ±20 ribu token — jadi diberi 150 detik.
 */
const ANGGARAN_MS = process.env.VERCEL ? 50_000 : 150_000;
const SISA_MINIMAL_COBA_ULANG_MS = 15_000;

async function panggilSekali(
  p: PenyediaKompatibel,
  path: string,
  init: RequestInit,
  kunci: string,
  batasMs: number,
): Promise<unknown> {
  const k = konfig(p);
  let res: Response;
  try {
    res = await fetch(`${k.dasar}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${kunci}`,
        ...(init.headers ?? {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(batasMs),
    });
  } catch (err) {
    const habisWaktu = (err as Error).name === "TimeoutError" || (err as Error).name === "AbortError";
    if (habisWaktu) {
      throw new GalatOpenAI(
        jelaskanGalatOpenAI(504, null, `tidak ada jawaban dalam ${Math.round(batasMs / 1000)} detik`, p),
        504,
      );
    }
    throw new GalatOpenAI(galatAmanOpenAI(`Tidak bisa menghubungi ${k.nama}: ${(err as Error).message}`, kunci), 502);
  }
  const json = (await res.json().catch(() => null)) as {
    error?: { message?: unknown; code?: unknown } | string;
    detail?: unknown;
    title?: unknown;
  } | null;
  if (!res.ok) {
    /* OpenAI: {error:{message,code}}. NVIDIA kadang {detail} / {title}
       / {error:"teks"}. Semua dicoba supaya galat tidak jadi "HTTP 400" polos. */
    const e = json?.error;
    const isi =
      typeof e === "string"
        ? e
        : typeof e?.message === "string"
          ? e.message
          : typeof json?.detail === "string"
            ? json.detail
            : typeof json?.title === "string"
              ? json.title
              : `HTTP ${res.status}`;
    const kode = typeof e === "object" && typeof e?.code === "string" ? e.code : null;
    throw new GalatOpenAI(
      galatAmanOpenAI(
        jelaskanGalatOpenAI(res.status, kode, `${k.nama} menolak permintaan: ${isi}${kode ? ` (${kode})` : ""}`, p),
        kunci,
      ),
      res.status,
    );
  }
  return json;
}

async function panggil(p: PenyediaKompatibel, path: string, init: RequestInit): Promise<unknown> {
  const kunci = kunciDari(p);
  if (!kunci) throw new GalatOpenAI(`${konfig(p).envKey} belum diisi di environment server.`, 503);
  const batas = Date.now() + ANGGARAN_MS;
  try {
    return await panggilSekali(p, path, init, kunci, ANGGARAN_MS);
  } catch (err) {
    if (!(err instanceof GalatOpenAI) || !bolehCobaUlangOpenAI(err.status)) throw err;
    await new Promise((r) => setTimeout(r, 1500));
    const sisa = batas - Date.now();
    if (sisa < SISA_MINIMAL_COBA_ULANG_MS) throw err;
    return await panggilSekali(p, path, init, kunci, sisa);
  }
}

const cacheModel = new Map<PenyediaKompatibel, { pada: number; daftar: ModelOpenAI[] }>();
const UMUR_CACHE_MODEL_MS = 10 * 60_000;

/** Daftar model untuk dropdown. Di-cache 10 menit per instance server. */
export async function daftarModel(p: PenyediaKompatibel): Promise<ModelOpenAI[]> {
  const c = cacheModel.get(p);
  if (c && Date.now() - c.pada < UMUR_CACHE_MODEL_MS) return c.daftar;
  const json = await panggil(p, "/models", { method: "GET" });
  const daftar = konfig(p).saring(json);
  cacheModel.set(p, { pada: Date.now(), daftar });
  return daftar;
}

/** Satu balasan. OpenAI: BERBAYAR. NVIDIA: memakai kredit uji. */
export async function mintaBalasan(
  p: PenyediaKompatibel,
  a: { model: string; system: string; teks: string; riwayat?: PesanRiwayat[]; gambar?: GambarUji | null },
): Promise<JawabanOpenAI> {
  const k = konfig(p);
  const badan = susunPermintaanOpenAI({ ...a, maksToken: k.maksToken, kolomMaks: k.kolomMaks });
  const json = await panggil(p, "/chat/completions", { method: "POST", body: JSON.stringify(badan) });
  return bacaJawabanOpenAI(json);
}
