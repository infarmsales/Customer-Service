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

/** Satu giliran obrolan. `gambar` hanya bermakna pada giliran pelanggan. */
export type PesanRiwayat = { role: "user" | "assistant"; content: string; gambar?: GambarUji | null };

/**
 * Batas riwayat obrolan uji. Seluruh riwayat dikirim ulang SETIAP
 * giliran (Gemini tidak mengingat apa pun di antara panggilan), jadi
 * token masuk tumbuh tiap balasan — batas ini menjaga biayanya.
 */
export const MAKS_RIWAYAT = 20;

/**
 * Foto yang ikut dikirim ulang, TERMASUK foto giliran sekarang. Foto
 * yang lebih lama diganti penanda teks; balasan model tentang foto itu
 * tetap ada di riwayat. Menjaga badan permintaan di bawah batas Vercel
 * (4,5 MB) dan token gambar tidak menumpuk.
 */
export const MAKS_FOTO_OBROLAN = 3;

/** Penanda foto lama yang tidak dikirim ulang. */
export const PENANDA_FOTO_LAMA = "[pelanggan mengirim foto di sini — tidak dikirim ulang]";

/**
 * Buang data foto yang lebih tua dari `maksFoto` foto terakhir.
 * Dipakai peramban (sebelum mengirim) DAN server (sebelum ke Google).
 */
export function potongFotoLama<T extends PesanRiwayat>(riwayat: readonly T[], maksFoto: number): T[] {
  let sisa = Math.max(0, maksFoto);
  const hasil = [...riwayat];
  for (let i = hasil.length - 1; i >= 0; i--) {
    const m = hasil[i];
    if (!m.gambar) continue;
    if (sisa > 0) {
      sisa--;
      continue;
    }
    hasil[i] = { ...m, gambar: null, content: m.content ? `${PENANDA_FOTO_LAMA} ${m.content}` : PENANDA_FOTO_LAMA };
  }
  return hasil;
}

/**
 * Rapikan riwayat kiriman peramban. Tidak pernah melempar.
 *   - bukan larik / tidak ada  -> riwayat kosong (galat bila bukan larik)
 *   - role selain user/assistant, isi bukan teks -> dibuang
 *   - foto rusak               -> galat (bukan dibuang diam-diam)
 *   - hanya MAKS_RIWAYAT terakhir; giliran AI di awal dibuang
 *     (Gemini meminta obrolan dibuka giliran pengguna)
 *   - foto dipotong sampai `maksFoto`
 */
export function rapikanRiwayat(
  raw: unknown,
  maksFoto: number,
): { riwayat: PesanRiwayat[]; galat: string | null } {
  if (raw === undefined || raw === null) return { riwayat: [], galat: null };
  if (!Array.isArray(raw)) return { riwayat: [], galat: "Riwayat harus berupa daftar pesan." };
  const bersih: PesanRiwayat[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const { role, content, gambar } = m as { role?: unknown; content?: unknown; gambar?: unknown };
    if (role !== "user" && role !== "assistant") continue;
    const teks = typeof content === "string" ? content.slice(0, 2000) : "";
    let g: GambarUji | null = null;
    if (role === "user" && gambar !== undefined && gambar !== null) {
      const salah = periksaGambar(gambar);
      if (salah) return { riwayat: [], galat: `Foto di riwayat: ${salah}` };
      g = gambar as GambarUji;
    }
    if (teks.trim() === "" && !g) continue;
    bersih.push({ role, content: teks, gambar: g });
  }
  let akhir = bersih.slice(-MAKS_RIWAYAT);
  while (akhir.length > 0 && akhir[0].role !== "user") akhir = akhir.slice(1);
  return { riwayat: potongFotoLama(akhir, maksFoto), galat: null };
}

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
  "CATATAN UJI INTERNAL: foto dari pelanggan di percakapan ini ikut terkirim dan BISA kamu lihat. " +
  "Abaikan aturan bahwa kamu tidak bisa melihat gambar untuk percakapan ini saja. Sebutkan singkat apa yang " +
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
  /* Giliran berurutan dengan role yang sama (mis. pembeli mengirim dua
     pesan karena yang pertama gagal dibalas) DIGABUNG jadi satu giliran
     — obrolan Gemini harus bergantian user/model. */
  const tambah = (role: "user" | "model", parts: Record<string, unknown>[]) => {
    const akhir = contents.at(-1);
    if (akhir && akhir.role === role) akhir.parts.push(...parts);
    else contents.push({ role, parts });
  };
  const bagianPengguna = (teks: string, gambar: GambarUji | null | undefined) => {
    const parts: Record<string, unknown>[] = [];
    if (gambar) parts.push({ inlineData: { mimeType: gambar.mime, data: gambar.data } });
    /* Teks kosong + foto adalah kejadian biasa ("[foto]" tanpa kata).
       Gemini menolak part teks kosong, jadi diganti penanda. */
    parts.push({ text: teks.trim() !== "" ? teks : "(pelanggan hanya mengirim foto, tanpa teks)" });
    return parts;
  };
  for (const m of a.riwayat ?? []) {
    if (!m || typeof m.content !== "string") continue;
    if (m.role === "assistant") {
      if (m.content.trim() !== "") tambah("model", [{ text: m.content }]);
    } else if (m.content.trim() !== "" || m.gambar) {
      tambah("user", bagianPengguna(m.content, m.gambar));
    }
  }
  tambah("user", bagianPengguna(a.teks, a.gambar));
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
