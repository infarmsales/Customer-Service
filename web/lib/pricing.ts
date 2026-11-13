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

   USD per 1 juta token, tarif berbayar (paid tier) untuk prompt
   <= 200 ribu token, dari pengetahuan per pertengahan 2026 — BELUM
   diverifikasi ulang ke ai.google.dev/pricing. Token "berpikir"
   (thoughtsTokenCount) ditagih sebagai token keluar.

   Diskon cache Gemini sengaja TIDAK dihitung: angkanya jadi
   perkiraan atas (lebih mahal), bukan lebih murah dari kenyataan.

   API key tier GRATIS tidak ditagih sama sekali — tetapi isi
   permintaannya boleh dipakai Google untuk melatih model. Angka di
   sini = seandainya berbayar.
   =========================================================== */
const HARGA_GEMINI: [awalan: string, harga: { input: number; output: number }][] = [
  /* Urutan penting: awalan yang lebih panjang lebih dulu. */
  ["gemini-2.5-flash-lite", { input: 0.1, output: 0.4 }],
  ["gemini-2.5-flash", { input: 0.3, output: 2.5 }],
  ["gemini-2.5-pro", { input: 1.25, output: 10 }],
  ["gemini-2.0-flash-lite", { input: 0.075, output: 0.3 }],
  ["gemini-2.0-flash", { input: 0.1, output: 0.4 }],
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
  token: { masuk: number; keluar: number; berpikir: number },
): BiayaGemini {
  const harga = HARGA_GEMINI.find(([awalan]) => model === awalan || model.startsWith(awalan + "-"))?.[1];
  const per = (t: number, tarif: number) => (t / 1_000_000) * tarif;
  const usd = harga ? per(token.masuk, harga.input) + per(token.keluar + token.berpikir, harga.output) : 0;
  return { ...token, usd, idr: usd * USD_TO_IDR, dikenal: Boolean(harga) };
}
