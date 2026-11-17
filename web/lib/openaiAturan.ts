/* ===========================================================
   OpenAI (ChatGPT) — aturan MURNI (tanpa jaringan, tanpa env).

   Dipakai lib/openai.ts (yang memanggil OpenAI) dan diuji oleh
   scripts/uji-openai.mjs (npm run uji-openai) tanpa satu pun
   panggilan berbayar.

   Bentuk permintaan & jawaban mengikuti REST Chat Completions
   (api.openai.com/v1/chat/completions) dan models.list (/v1/models).
   OpenAI HANYA dipakai di meja uji (halaman AI Chatbot dan
   Simulasi) sebagai pembanding Gemini; chat pelanggan tetap Claude.

   Aturan yang tidak bergantung pada penyedia — rapikan riwayat,
   periksa foto, potong foto lama, CATATAN_FOTO — DIPAKAI ULANG dari
   geminiAturan.ts, supaya kedua meja uji menerima masukan yang
   persis sama dan perbandingannya adil.
   =========================================================== */

import type { GambarUji, PesanRiwayat } from "./geminiAturan";

/**
 * Nama model yang sah. Nama ini masuk ke BADAN permintaan, bukan
 * path URL seperti Gemini — tapi dijaga sama ketatnya supaya tidak
 * ada teks bebas dari peramban yang diteruskan ke OpenAI.
 */
export function modelSahOpenAI(nama: unknown): nama is string {
  return (
    typeof nama === "string" &&
    nama.length > 0 &&
    nama.length <= 80 &&
    /^(gpt-|chatgpt-|o[1-9])[a-z0-9.-]*$/.test(nama) &&
    !nama.includes("..")
  );
}

/* ===========================================================
   NVIDIA API Catalog (integrate.api.nvidia.com/v1) — memakai bentuk
   Chat Completions yang SAMA dengan OpenAI, jadi seluruh berkas ini
   dipakai ulang. Bedanya hanya: alamat server, key `nvapi-…`, nama
   model ber-"penerbit/" (meta/llama-3.3-70b-instruct,
   openai/gpt-oss-120b), dan kolom jatah token `max_tokens`.
   =========================================================== */
export type PenyediaKompatibel = "openai" | "nvidia";

/** Nama model NVIDIA: "penerbit/model". Masuk ke badan, bukan URL. */
export function modelSahNvidia(nama: unknown): nama is string {
  return (
    typeof nama === "string" &&
    nama.length > 0 &&
    nama.length <= 120 &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(nama) &&
    !nama.includes("..")
  );
}

export function modelSahPenyedia(penyedia: PenyediaKompatibel, nama: unknown): nama is string {
  return penyedia === "nvidia" ? modelSahNvidia(nama) : modelSahOpenAI(nama);
}

/**
 * Dari /v1/models NVIDIA: buang yang jelas bukan model obrolan teks
 * (embedding, rerank, penjaga keamanan, pengurai dokumen, gambar,
 * suara). Daftar NVIDIA tidak menyebut kemampuan, jadi disaring dari
 * nama — model yang lolos tapi tetap bukan obrolan akan menjawab galat
 * yang jelas, bukan diam.
 */
export function saringModelNvidia(json: unknown): ModelOpenAI[] {
  const daftar = (json && typeof json === "object" ? (json as { data?: unknown }).data : null) ?? [];
  if (!Array.isArray(daftar)) return [];
  const hasil: ModelOpenAI[] = [];
  const lihat = new Set<string>();
  for (const m of daftar) {
    if (!m || typeof m !== "object") continue;
    const id = (m as { id?: unknown }).id;
    if (!modelSahNvidia(id) || lihat.has(id)) continue;
    if (
      /embed|rerank|retriever|guard|safety|reward|parse|ocr|detector|clip|nv-dino|cosmos|flux|stable-diffusion|sdxl|asr|tts|riva|whisper|audio|translate|-pii|deplot|kosmos/i.test(
        id,
      )
    )
      continue;
    lihat.add(id);
    hasil.push({ id, nama: id, batasMasuk: null });
  }
  return hasil.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
}

/** Susun badan Chat Completions. */
export function susunPermintaanOpenAI(a: {
  model: string;
  system: string;
  riwayat?: readonly PesanRiwayat[];
  teks: string;
  gambar?: GambarUji | null;
  maksToken: number;
  /**
   * OpenAI: max_completion_tokens (model penalaran menolak max_tokens).
   * NVIDIA: max_tokens — kolom yang pasti dikenal semua model di sana.
   */
  kolomMaks?: "max_completion_tokens" | "max_tokens";
}): Record<string, unknown> {
  type Pesan = { role: "system" | "user" | "assistant"; content: string | Record<string, unknown>[] };
  const messages: Pesan[] = [{ role: "system", content: a.system }];

  const bagianPengguna = (teks: string, gambar: GambarUji | null | undefined): Record<string, unknown>[] => {
    const parts: Record<string, unknown>[] = [];
    /* Teks kosong + foto adalah kejadian biasa; diberi penanda yang
       sama dengan Gemini supaya kedua model membaca hal yang sama. */
    parts.push({ type: "text", text: teks.trim() !== "" ? teks : "(pelanggan hanya mengirim foto, tanpa teks)" });
    if (gambar) parts.push({ type: "image_url", image_url: { url: `data:${gambar.mime};base64,${gambar.data}` } });
    return parts;
  };
  /* Giliran berurutan dengan role sama digabung — sama dengan Gemini,
     supaya riwayat yang dibaca kedua model berbentuk sama. */
  const tambah = (role: "user" | "assistant", parts: Record<string, unknown>[]) => {
    const akhir = messages.at(-1);
    if (akhir && akhir.role === role && Array.isArray(akhir.content)) akhir.content.push(...parts);
    else messages.push({ role, content: parts });
  };

  for (const m of a.riwayat ?? []) {
    if (!m || typeof m.content !== "string") continue;
    if (m.role === "assistant") {
      if (m.content.trim() !== "") tambah("assistant", [{ type: "text", text: m.content }]);
    } else if (m.content.trim() !== "" || m.gambar) {
      tambah("user", bagianPengguna(m.content, m.gambar));
    }
  }
  tambah("user", bagianPengguna(a.teks, a.gambar));

  return {
    model: a.model,
    messages,
    /* Bawaan max_completion_tokens, BUKAN max_tokens: model penalaran
       OpenAI (seri o & GPT-5) menolak max_tokens. Jatah ini TERMASUK
       token penalaran. */
    [a.kolomMaks ?? "max_completion_tokens"]: a.maksToken,
  };
}

export type JawabanOpenAI = {
  teks: string;
  /** stop, length, content_filter, ... ; null bila tidak ada pilihan. */
  alasanSelesai: string | null;
  /** Diisi bila model menolak menjawab (field `refusal`). */
  ditolak: string | null;
  /**
   * Sama bentuknya dengan Gemini. `keluar` = teks yang terlihat saja:
   * OpenAI menghitung token penalaran DI DALAM completion_tokens, jadi
   * dikurangkan di sini supaya angka "keluar" kedua model sebanding.
   */
  token: { masuk: number; keluar: number; berpikir: number; dariCache: number };
  versiModel: string | null;
};

const angka = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

/** Baca jawaban Chat Completions. Tidak pernah melempar. */
export function bacaJawabanOpenAI(json: unknown): JawabanOpenAI {
  const j = (json && typeof json === "object" ? json : {}) as {
    choices?: { message?: { content?: unknown; refusal?: unknown }; finish_reason?: unknown }[];
    usage?: {
      prompt_tokens?: unknown;
      completion_tokens?: unknown;
      prompt_tokens_details?: { cached_tokens?: unknown };
      completion_tokens_details?: { reasoning_tokens?: unknown };
    };
    model?: unknown;
  };
  const p = Array.isArray(j.choices) ? j.choices[0] : undefined;
  const isi = p?.message?.content;
  /* Model penalaran terbuka (DeepSeek-R1, Qwen, dll. di NVIDIA) kadang
     menaruh pikirannya di dalam teks sebagai <think>…</think>. Itu
     bukan balasan untuk pelanggan — dan akan merusak hitungan 600
     karakter. Blok yang tidak ditutup (jatah habis saat berpikir)
     juga dibuang. */
  const teks = (typeof isi === "string" ? isi : "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    .trim();
  const u = j.usage ?? {};
  const selesai = angka(u.completion_tokens);
  /* Dijepit: angka rusak tidak boleh membuat "keluar" negatif. */
  const berpikir = Math.min(angka(u.completion_tokens_details?.reasoning_tokens), selesai);
  const masuk = angka(u.prompt_tokens);
  return {
    teks,
    alasanSelesai: typeof p?.finish_reason === "string" ? p.finish_reason : null,
    ditolak: typeof p?.message?.refusal === "string" && p.message.refusal ? p.message.refusal : null,
    token: {
      masuk,
      keluar: selesai - berpikir,
      berpikir,
      dariCache: Math.min(angka(u.prompt_tokens_details?.cached_tokens), masuk),
    },
    versiModel: typeof j.model === "string" ? j.model : null,
  };
}

/** Jelaskan jawaban kosong — model penalaran bisa menghabiskan jatahnya untuk berpikir. */
export function sebabKosongOpenAI(j: JawabanOpenAI): string | null {
  if (j.teks.trim() !== "") return null;
  if (j.ditolak) return `Model menolak menjawab: ${j.ditolak.slice(0, 200)}`;
  if (j.alasanSelesai === "length") {
    return j.token.berpikir > 0
      ? `Jatah token habis untuk "berpikir" (${j.token.berpikir} token) sebelum menulis balasan. Naikkan OPENAI_MAX_TOKENS / NVIDIA_MAX_TOKENS atau pilih model non-penalaran.`
      : "Jatah token habis sebelum balasan selesai. Naikkan OPENAI_MAX_TOKENS / NVIDIA_MAX_TOKENS (model penalaran bisa menghabiskannya untuk berpikir).";
  }
  if (j.alasanSelesai === "content_filter") return "Balasan ditahan filter konten OpenAI (content_filter).";
  if (j.alasanSelesai) return `OpenAI berhenti tanpa teks (${j.alasanSelesai}).`;
  return "OpenAI tidak mengembalikan pilihan balasan.";
}

export type ModelOpenAI = { id: string; nama: string; batasMasuk: number | null };

/**
 * Dari jawaban /v1/models: hanya model obrolan yang bisa Chat
 * Completions. OpenAI tidak menyebut kemampuan model di daftar ini,
 * jadi disaring dari namanya. Snapshot bertanggal (…-2025-04-14)
 * disembunyikan supaya dropdown tidak berisi puluhan nama kembar.
 */
export function saringModelOpenAI(json: unknown): ModelOpenAI[] {
  const daftar = (json && typeof json === "object" ? (json as { data?: unknown }).data : null) ?? [];
  if (!Array.isArray(daftar)) return [];
  const hasil: ModelOpenAI[] = [];
  for (const m of daftar) {
    if (!m || typeof m !== "object") continue;
    const id = (m as { id?: unknown }).id;
    if (!modelSahOpenAI(id)) continue;
    /* Bukan model obrolan teks, atau hanya bisa lewat Responses API. */
    if (
      /embedding|tts|whisper|transcribe|audio|realtime|image|dall-e|moderation|instruct|search|codex|computer-use|-pro\b|deep-research/.test(
        id,
      )
    )
      continue;
    if (/-\d{4}-\d{2}-\d{2}$/.test(id) || /-\d{4}$/.test(id)) continue;
    hasil.push({ id, nama: id, batasMasuk: null });
  }
  return hasil.sort((a, b) => b.id.localeCompare(a.id, "en", { numeric: true }));
}

/**
 * Galat yang layak dicoba ulang sekali: server penuh/sibuk sesaat.
 * 429 TIDAK — bisa berarti saldo habis (insufficient_quota) atau batas
 * per menit; mencoba lagi hanya memperpanjang penolakan.
 */
export function bolehCobaUlangOpenAI(status: number): boolean {
  return status === 500 || status === 502 || status === 503;
}

/** Kalimat galat untuk manusia; pesan asli OpenAI tetap ikut di belakang. */
export function jelaskanGalatOpenAI(
  status: number,
  kode: string | null,
  asli: string,
  penyedia: PenyediaKompatibel = "openai",
): string {
  if (penyedia === "nvidia") {
    if (status === 401 || status === 403) {
      return `API key NVIDIA ditolak — periksa NVIDIA_API_KEY (harus berawalan nvapi-, belum kedaluwarsa), atau model ini butuh izin tambahan di build.nvidia.com. — ${asli}`;
    }
    if (status === 402) return `Kredit uji NVIDIA habis. Cek sisa kredit di build.nvidia.com. — ${asli}`;
    if (status === 429) return `Batas permintaan NVIDIA per menit tercapai. Tunggu sebentar lalu coba lagi. — ${asli}`;
    if (status === 404) return `Model ini tidak ada atau tidak bisa dipakai untuk obrolan di NVIDIA. Pilih model lain. — ${asli}`;
    if (status === 400 && /image|vision|multimodal/i.test(asli)) {
      return `Model ini tidak bisa membaca foto. Hapus fotonya atau pilih model vision (nama berisi "vision"/"vl"). — ${asli}`;
    }
    if (status === 503 || status === 502 || status === 500) {
      return `Server NVIDIA sedang sibuk (bukan kesalahan Anda). Coba lagi sebentar lagi atau pilih model lain. — ${asli}`;
    }
    if (status === 504 || status === 408) {
      return `NVIDIA terlalu lama menjawab dan permintaan dihentikan. Coba lagi, atau pilih model yang lebih kecil. — ${asli}`;
    }
    return asli;
  }
  if (status === 401) return `API key OpenAI ditolak — periksa OPENAI_API_KEY (salah ketik, dicabut, atau beda project). — ${asli}`;
  if (kode === "insufficient_quota") {
    return `Saldo/kredit API OpenAI habis atau billing belum aktif. Isi kredit di platform.openai.com → Billing. Langganan ChatGPT Plus TIDAK termasuk kredit API. — ${asli}`;
  }
  if (status === 429) return `Batas permintaan OpenAI per menit tercapai. Tunggu sebentar lalu coba lagi. — ${asli}`;
  if (status === 404 || kode === "model_not_found") {
    return `Model ini tidak tersedia untuk key Anda (belum dibuka untuk akun/organisasi, atau hanya lewat Responses API). Pilih model lain. — ${asli}`;
  }
  if (status === 503 || status === 502 || status === 500) {
    return `Server OpenAI sedang sibuk (bukan kesalahan Anda). Coba lagi sebentar lagi atau pilih model lain. — ${asli}`;
  }
  if (status === 504 || status === 408) {
    return `OpenAI terlalu lama menjawab dan permintaan dihentikan. Coba lagi, atau pilih model yang lebih ringan (mis. mini/nano). — ${asli}`;
  }
  return asli;
}

/** Pesan galat yang aman ditampilkan: API key tidak boleh ikut. */
export function galatAmanOpenAI(pesan: string, kunci: string | undefined): string {
  let t = pesan;
  if (kunci && kunci.length >= 8) t = t.split(kunci).join("[disembunyikan]");
  /* Pola key OpenAI (sk-..., sk-proj-...). OpenAI kadang mengutip
     sebagian key di pesan "Incorrect API key provided: sk-ab***xy". */
  t = t.replace(/sk-[A-Za-z0-9_*-]{6,}/g, "[disembunyikan]");
  /* Pola key NVIDIA. */
  t = t.replace(/nvapi-[A-Za-z0-9_*-]{6,}/g, "[disembunyikan]");
  return t.length > 300 ? t.slice(0, 300) + "…" : t;
}
