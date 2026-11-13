/* ===========================================================
   Gemini — aturan MURNI (tanpa jaringan, tanpa env).

   Dipakai lib/gemini.ts (yang memanggil Google) dan diuji oleh
   scripts/uji-gemini.mjs (npm run uji-gemini) tanpa satu pun
   panggilan berbayar.

   Bentuk permintaan & jawaban mengikuti REST Gemini API
   (generativelanguage.googleapis.com/v1beta, generateContent dan
   models.list). Gemini HANYA dipakai di meja uji (halaman AI Chatbot
   dan Simulasi); chat pelanggan tetap Claude.
   =========================================================== */

export type GambarUji = { mime: string; data: string };

export type PesanRiwayat = { role: "user" | "assistant"; content: string };

/** Jenis gambar yang diterima. Sama dengan yang didukung Gemini untuk foto. */
export const MIME_GAMBAR = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * Batas panjang base64 gambar. Peramban mengecilkan foto ke sisi
 * terpanjang 1280 px sebelum dikirim, jadi biasanya < 500 KB; batas
 * ini menjaga di bawah batas badan permintaan Vercel (4,5 MB).
 */
export const MAKS_BASE64 = 4_000_000;

/**
 * Nama model yang sah: huruf kecil, angka, titik, dan tanda hubung.
 * Nama ini disisipkan ke PATH URL, jadi "/" "?" ".." dan sejenisnya
 * harus mustahil — bukan sekadar tidak disarankan.
 */
export function modelSah(nama: unknown): nama is string {
  return (
    typeof nama === "string" &&
    nama.length > 0 &&
    nama.length <= 80 &&
    /^gemini-[a-z0-9][a-z0-9.-]*$/.test(nama) &&
    !nama.includes("..")
  );
}

/** Periksa gambar uji. null = sah; teks = alasan ditolak. */
export function periksaGambar(g: unknown): string | null {
  if (g === undefined || g === null) return null;
  if (typeof g !== "object") return "Format gambar tidak dikenal.";
  const { mime, data } = g as { mime?: unknown; data?: unknown };
  if (typeof mime !== "string" || !(MIME_GAMBAR as readonly string[]).includes(mime)) {
    return "Jenis gambar harus JPEG, PNG, atau WEBP.";
  }
  if (typeof data !== "string" || data.length === 0) return "Data gambar kosong.";
  if (data.length > MAKS_BASE64) return "Gambar terlalu besar (maks ±3 MB setelah dikecilkan).";
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return "Data gambar bukan base64 yang sah.";
  return null;
}

/**
 * Catatan tambahan system prompt KHUSUS uji foto.
 *
 * claude-core.md berkata AI tidak bisa melihat gambar dan tidak boleh
 * meminta foto — benar untuk produksi, karena route chat tidak pernah
 * mengirim gambar. Di uji ini gambarnya benar-benar dikirim; tanpa
 * catatan ini modelnya menerima dua perintah yang bertentangan.
 * Aturan pengalihan (barang rusak, refund, keamanan) sengaja ditegaskan
 * tetap berlaku: yang mau dilihat adalah apakah model MELIHAT dengan
 * benar, bukan apakah ia jadi berani menjanjikan ganti rugi.
 */
export const CATATAN_FOTO =
  "CATATAN UJI INTERNAL: pada pesan terakhir, foto dari pelanggan ikut terkirim dan BISA kamu lihat. " +
  "Abaikan aturan bahwa kamu tidak bisa melihat gambar untuk pesan ini saja. Sebutkan singkat apa yang " +
  "terlihat bila relevan dengan pertanyaannya. Semua aturan lain tetap berlaku — termasuk HANDOVER_TO_CS " +
  "untuk barang rusak, salah kirim, refund, keamanan, atau bila kamu tidak yakin dengan isi fotonya.";

/** Susun badan generateContent. */
export function susunPermintaan(a: {
  system: string;
  riwayat?: readonly PesanRiwayat[];
  teks: string;
  gambar?: GambarUji | null;
  maksToken: number;
}): Record<string, unknown> {
  const contents: { role: "user" | "model"; parts: Record<string, unknown>[] }[] = [];
  for (const m of a.riwayat ?? []) {
    if (!m || typeof m.content !== "string" || m.content === "") continue;
    contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] });
  }
  const parts: Record<string, unknown>[] = [];
  if (a.gambar) parts.push({ inlineData: { mimeType: a.gambar.mime, data: a.gambar.data } });
  /* Teks kosong + foto adalah kejadian biasa ("[foto]" tanpa kata).
     Gemini menolak part teks kosong, jadi diganti penanda. */
  parts.push({ text: a.teks.trim() !== "" ? a.teks : "(pelanggan hanya mengirim foto, tanpa teks)" });
  contents.push({ role: "user", parts });
  return {
    systemInstruction: { parts: [{ text: a.system }] },
    contents,
    generationConfig: { maxOutputTokens: a.maksToken },
  };
}

export type JawabanGemini = {
  teks: string;
  /** STOP, MAX_TOKENS, SAFETY, ... ; null bila tidak ada kandidat. */
  alasanSelesai: string | null;
  /** Diisi bila Google memblokir prompt-nya sendiri. */
  diblokir: string | null;
  token: { masuk: number; keluar: number; berpikir: number; dariCache: number };
  versiModel: string | null;
};

const angka = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

/** Baca jawaban generateContent. Tidak pernah melempar. */
export function bacaJawaban(json: unknown): JawabanGemini {
  const j = (json && typeof json === "object" ? json : {}) as {
    candidates?: { content?: { parts?: { text?: unknown; thought?: unknown }[] }; finishReason?: unknown }[];
    usageMetadata?: Record<string, unknown>;
    promptFeedback?: { blockReason?: unknown };
    modelVersion?: unknown;
  };
  const k = Array.isArray(j.candidates) ? j.candidates[0] : undefined;
  /* Bagian "thought" (ringkasan berpikir) bukan balasan untuk pelanggan. */
  const teks = (k?.content?.parts ?? [])
    .filter((p) => p && typeof p.text === "string" && p.thought !== true)
    .map((p) => p.text as string)
    .join("");
  const u = j.usageMetadata ?? {};
  return {
    teks,
    alasanSelesai: typeof k?.finishReason === "string" ? k.finishReason : null,
    diblokir: typeof j.promptFeedback?.blockReason === "string" ? j.promptFeedback.blockReason : null,
    token: {
      masuk: angka(u.promptTokenCount),
      keluar: angka(u.candidatesTokenCount),
      berpikir: angka(u.thoughtsTokenCount),
      dariCache: angka(u.cachedContentTokenCount),
    },
    versiModel: typeof j.modelVersion === "string" ? j.modelVersion : null,
  };
}

/**
 * Jelaskan jawaban kosong. Model "thinking" bisa menghabiskan seluruh
 * jatah token untuk berpikir lalu tidak menulis satu kata pun — dari
 * layar itu terlihat seperti "AI tidak menjawab" tanpa sebab.
 */
export function sebabKosong(j: JawabanGemini): string | null {
  if (j.teks.trim() !== "") return null;
  if (j.diblokir) return `Permintaan diblokir filter Google (${j.diblokir}).`;
  if (j.alasanSelesai === "MAX_TOKENS") {
    return j.token.berpikir > 0
      ? `Jatah token habis untuk "berpikir" (${j.token.berpikir} token) sebelum menulis balasan. Naikkan GEMINI_MAX_TOKENS atau pilih model Flash.`
      : "Jatah token habis sebelum balasan selesai. Naikkan GEMINI_MAX_TOKENS.";
  }
  if (j.alasanSelesai === "SAFETY") return "Balasan ditahan filter keamanan Google (SAFETY).";
  if (j.alasanSelesai) return `Gemini berhenti tanpa teks (${j.alasanSelesai}).`;
  return "Gemini tidak mengembalikan kandidat balasan.";
}

export type ModelGemini = { id: string; nama: string; batasMasuk: number | null };

/**
 * Dari jawaban models.list: hanya model teks Gemini yang bisa
 * generateContent. Embedding, TTS, audio/live, dan pembuat gambar
 * dibuang — memilihnya di dropdown hanya menghasilkan galat.
 */
export function saringModel(json: unknown): ModelGemini[] {
  const daftar = (json && typeof json === "object" ? (json as { models?: unknown }).models : null) ?? [];
  if (!Array.isArray(daftar)) return [];
  const hasil: ModelGemini[] = [];
  for (const m of daftar) {
    if (!m || typeof m !== "object") continue;
    const r = m as { name?: unknown; displayName?: unknown; supportedGenerationMethods?: unknown; inputTokenLimit?: unknown };
    const id = typeof r.name === "string" ? r.name.replace(/^models\//, "") : "";
    if (!modelSah(id)) continue;
    if (!Array.isArray(r.supportedGenerationMethods) || !r.supportedGenerationMethods.includes("generateContent")) continue;
    if (/embedding|tts|audio|live|image-generation|imagen|veo|aqa|robotics|computer-use/.test(id)) continue;
    hasil.push({
      id,
      nama: typeof r.displayName === "string" && r.displayName ? r.displayName : id,
      batasMasuk: typeof r.inputTokenLimit === "number" ? r.inputTokenLimit : null,
    });
  }
  /* Terbaru di atas: versi angka besar dulu, lalu "pro" < "flash" < "lite" tidak dipaksakan — urut nama menurun cukup. */
  return hasil.sort((a, b) => b.id.localeCompare(a.id, "en", { numeric: true }));
}

/**
 * Pesan galat yang aman ditampilkan: API key tidak boleh ikut,
 * apa pun isi pesan dari Google.
 */
export function galatAman(pesan: string, kunci: string | undefined): string {
  let t = pesan;
  if (kunci && kunci.length >= 8) t = t.split(kunci).join("[disembunyikan]");
  /* Pola key Google (AIza...) — berjaga bila key lain ikut tersebut. */
  t = t.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[disembunyikan]");
  return t.length > 300 ? t.slice(0, 300) + "…" : t;
}
