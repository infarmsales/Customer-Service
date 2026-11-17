/* ===========================================================
   Perhitungan biaya token Claude.
   Dipakai panel pengukur di halaman AI Chatbot (/ai) untuk
   menjawab pertanyaan utama demo: satu balasan AI itu berapa
   rupiah, dan seberapa besar prompt caching menghematnya.
   =========================================================== */

/** Harga resmi Anthropic, USD per 1 juta token. Per Juni 2026. */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-fable-5": { input: 10, output: 50 },
};

/** Model yang dipakai bila ID tak dikenal (mis. diganti lewat env). */
const FALLBACK = PRICES["claude-sonnet-4-6"];

/** Token yang dibaca dari cache dihargai ~10% harga input biasa. */
const CACHE_READ_MULTIPLIER = 0.1;
/** Menulis ke cache dihargai ~125% harga input (dibayar sekali). */
const CACHE_WRITE_MULTIPLIER = 1.25;

/**
 * Kurs USD → IDR. ASUMSI, bukan kurs hidup — angka rupiah di layar
 * hanya perkiraan kasar. Ubah di sini bila kursnya jauh berbeda.
 */
export const USD_TO_IDR = 16500;

/** Bentuk `usage` yang dikembalikan Claude API (bagian yang dipakai). */
export type Usage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export type CostBreakdown = {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  /** Seluruh token masukan, termasuk yang dilayani cache. */
  totalInputTokens: number;
  /** Biaya sesungguhnya (USD) dengan prompt caching aktif. */
  usd: number;
  /** Biaya seandainya caching tidak dipakai sama sekali (USD). */
  usdWithoutCache: number;
  /** Selisih keduanya — penghematan berkat caching (USD). */
  savedUsd: number;
  idr: number;
  idrWithoutCache: number;
  savedIdr: number;
  /** Harga yang dipakai; null bila model tidak ada di tabel. */
  knownModel: boolean;
};

const n = (v: number | null | undefined) => (typeof v === "number" ? v : 0);

export function computeCost(model: string, usage: Usage): CostBreakdown {
  const price = PRICES[model];
  const p = price ?? FALLBACK;

  const inputTokens = n(usage.input_tokens);
  const outputTokens = n(usage.output_tokens);
  const cacheWriteTokens = n(usage.cache_creation_input_tokens);
  const cacheReadTokens = n(usage.cache_read_input_tokens);
  const totalInputTokens = inputTokens + cacheWriteTokens + cacheReadTokens;

  const perMillion = (tokens: number, rate: number) => (tokens / 1_000_000) * rate;

  const usd =
    perMillion(inputTokens, p.input) +
    perMillion(cacheWriteTokens, p.input * CACHE_WRITE_MULTIPLIER) +
    perMillion(cacheReadTokens, p.input * CACHE_READ_MULTIPLIER) +
    perMillion(outputTokens, p.output);

  // Pembanding: seluruh token masukan dibayar penuh, tanpa diskon cache.
  const usdWithoutCache =
    perMillion(totalInputTokens, p.input) + perMillion(outputTokens, p.output);

  const savedUsd = usdWithoutCache - usd;

  return {
    inputTokens,
    outputTokens,
    cacheWriteTokens,
    cacheReadTokens,
    totalInputTokens,
    usd,
    usdWithoutCache,
    savedUsd,
    idr: usd * USD_TO_IDR,
    idrWithoutCache: usdWithoutCache * USD_TO_IDR,
    savedIdr: savedUsd * USD_TO_IDR,
    knownModel: Boolean(price),
  };
}

/** Rupiah tanpa desimal untuk angka besar, 2 desimal untuk yang kecil. */
export function formatIdr(value: number): string {
  const opts: Intl.NumberFormatOptions =
    value > 0 && value < 100
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { maximumFractionDigits: 0 };
  return "Rp " + new Intl.NumberFormat("id-ID", opts).format(value);
}

export function formatUsd(value: number): string {
  return "$" + value.toFixed(value < 0.01 ? 5 : 4);
}

export function formatTokens(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}

/* ===========================================================
   Tarif Gemini — HANYA untuk meja uji (halaman AI Chatbot & Simulasi).

   USD per 1 juta token, tarif berbayar standar (bukan Batch/Flex).
   Sumber: tabel harga yang diberikan pemilik proyek, 16 Nov 2026
   (dari halaman harga Gemini API). Keluarga 2.0 belum ada di tabel
   itu dan masih angka lama yang belum diverifikasi.

   - Token "berpikir" (thoughtsTokenCount) ditagih sebagai keluar.
   - Token masuk yang dibaca dari cache (cachedContentTokenCount,
     sudah termasuk di promptTokenCount) memakai tarif `cache`.
   - Model ber-tingkat (Pro): prompt > 200 ribu token memakai `atas`.
   - Tarif audio tidak dipakai — meja uji hanya mengirim teks & foto.

   API key tier GRATIS tidak ditagih sama sekali — tetapi isi
   permintaannya boleh dipakai Google untuk melatih model. Angka di
   sini = seandainya berbayar.
   =========================================================== */
type TarifGemini = { input: number; output: number; cache: number };
type HargaGemini = TarifGemini & { atas?: TarifGemini };

/** Batas tingkat harga model Pro: prompt di atas ini memakai tarif `atas`. */
const BATAS_TINGKAT = 200_000;

const HARGA_GEMINI: [awalan: string, harga: HargaGemini][] = [
  /* Urutan penting: awalan yang lebih panjang lebih dulu
     (gemini-2.5-flash-lite sebelum gemini-2.5-flash). */
  ["gemini-4-argon", { input: 2, output: 10, cache: 0.1 }],
  ["gemini-4-carbon", { input: 2, output: 10, cache: 0.1 }],
  ["gemini-4-hydrogen", { input: 1.5, output: 7.5, cache: 0.075 }],
  [
    "gemini-3.1-pro-preview",
    { input: 2, output: 12, cache: 0.2, atas: { input: 4, output: 18, cache: 0.4 } },
  ],
  ["gemini-3.8-flash", { input: 0.75, output: 3.75, cache: 0.075 }],
  ["gemini-3.6-flash", { input: 0.75, output: 3.75, cache: 0.075 }],
  ["gemini-3.5-flash-lite", { input: 0.3, output: 2.5, cache: 0.03 }],
  ["gemini-3.1-flash-lite", { input: 0.25, output: 1.5, cache: 0.025 }],
  ["gemini-3-flash-preview", { input: 0.5, output: 3, cache: 0.05 }],
  [
    "gemini-2.5-pro",
    { input: 1.25, output: 10, cache: 0.125, atas: { input: 2.5, output: 15, cache: 0.25 } },
  ],
  ["gemini-2.5-flash-lite", { input: 0.1, output: 0.4, cache: 0.01 }],
  ["gemini-2.5-flash", { input: 0.3, output: 2.5, cache: 0.03 }],
  /* Belum diverifikasi — tidak ada di tabel harga 16 Nov 2026. */
  ["gemini-2.0-flash-lite", { input: 0.075, output: 0.3, cache: 0.075 }],
  ["gemini-2.0-flash", { input: 0.1, output: 0.4, cache: 0.1 }],
];

export type BiayaGemini = {
  masuk: number;
  keluar: number;
  berpikir: number;
  usd: number;
  idr: number;
  /** false = model tidak ada di tabel; usd/idr = 0 dan tidak boleh dibaca sebagai gratis. */
  dikenal: boolean;
};

export function biayaGemini(
  model: string,
  token: { masuk: number; keluar: number; berpikir: number; dariCache?: number },
): BiayaGemini {
  const { masuk, keluar, berpikir } = token;
  const harga = HARGA_GEMINI.find(([awalan]) => model === awalan || model.startsWith(awalan + "-"))?.[1];
  if (!harga) return { masuk, keluar, berpikir, usd: 0, idr: 0, dikenal: false };
  const tarif: TarifGemini = harga.atas && masuk > BATAS_TINGKAT ? harga.atas : harga;
  /* dariCache sudah termasuk di masuk; dijepit supaya angka rusak
     tidak pernah membuat biaya negatif. */
  const cache = Math.min(Math.max(token.dariCache ?? 0, 0), masuk);
  const per = (t: number, usdPerJuta: number) => (t / 1_000_000) * usdPerJuta;
  const usd = per(masuk - cache, tarif.input) + per(cache, tarif.cache) + per(keluar + berpikir, tarif.output);
  return { masuk, keluar, berpikir, usd, idr: usd * USD_TO_IDR, dikenal: true };
}

/* ===========================================================
   Tarif OpenAI — HANYA untuk meja uji pembanding (AI Chatbot &
   Simulasi), kembaran tabel Gemini di atas.

   USD per 1 juta token, tarif Standard (bukan Batch/Flex/Priority).
   ⚠️ BELUM DIVERIFIKASI: angka diambil dari pengetahuan agen coding
   (harga publik pertengahan 2026), BUKAN dari tabel yang diberikan
   pemilik proyek. Cocokkan dengan openai.com/api/pricing sebelum
   dipakai untuk keputusan. Model yang tidak ada di sini tampil
   "tarif belum ada di tabel" — bukan Rp 0.

   - Token penalaran (reasoning_tokens) ditagih sebagai keluar.
   - Token masuk dari cache (cached_tokens, sudah termasuk di
     prompt_tokens) memakai tarif `cache`.
   - OpenAI TIDAK punya tier gratis API: angka ini = yang ditagih.
   =========================================================== */
const HARGA_OPENAI: [awalan: string, harga: TarifGemini][] = [
  /* Urutan penting: awalan yang lebih panjang lebih dulu. */
  ["gpt-5.2", { input: 1.75, output: 14, cache: 0.175 }],
  ["gpt-5.1", { input: 1.25, output: 10, cache: 0.125 }],
  ["gpt-5-mini", { input: 0.25, output: 2, cache: 0.025 }],
  ["gpt-5-nano", { input: 0.05, output: 0.4, cache: 0.005 }],
  ["gpt-5", { input: 1.25, output: 10, cache: 0.125 }],
  ["gpt-4.1-mini", { input: 0.4, output: 1.6, cache: 0.1 }],
  ["gpt-4.1-nano", { input: 0.1, output: 0.4, cache: 0.025 }],
  ["gpt-4.1", { input: 2, output: 8, cache: 0.5 }],
  ["gpt-4o-mini", { input: 0.15, output: 0.6, cache: 0.075 }],
  ["gpt-4o", { input: 2.5, output: 10, cache: 1.25 }],
  ["o4-mini", { input: 1.1, output: 4.4, cache: 0.275 }],
  ["o3-mini", { input: 1.1, output: 4.4, cache: 0.55 }],
  ["o3", { input: 2, output: 8, cache: 0.5 }],
];

/**
 * Cocokkan model ke tarif. "gpt-5.1-chat-latest" memakai tarif gpt-5.1,
 * tetapi varian kecil yang BELUM ada di tabel (mis. "gpt-5.2-mini")
 * TIDAK boleh diam-diam memakai tarif kakaknya — hasilnya tidak dikenal.
 */
function tarifOpenAI(model: string): TarifGemini | null {
  for (const [awalan, harga] of HARGA_OPENAI) {
    if (model === awalan) return harga;
    if (model.startsWith(awalan + "-") && !/^(mini|nano|pro)\b/.test(model.slice(awalan.length + 1))) return harga;
  }
  return null;
}

export function biayaOpenAI(
  model: string,
  token: { masuk: number; keluar: number; berpikir: number; dariCache?: number },
): BiayaGemini {
  const { masuk, keluar, berpikir } = token;
  const tarif = tarifOpenAI(model);
  if (!tarif) return { masuk, keluar, berpikir, usd: 0, idr: 0, dikenal: false };
  const cache = Math.min(Math.max(token.dariCache ?? 0, 0), masuk);
  const per = (t: number, usdPerJuta: number) => (t / 1_000_000) * usdPerJuta;
  const usd = per(masuk - cache, tarif.input) + per(cache, tarif.cache) + per(keluar + berpikir, tarif.output);
  return { masuk, keluar, berpikir, usd, idr: usd * USD_TO_IDR, dikenal: true };
}
