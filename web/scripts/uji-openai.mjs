/* ===========================================================
   Uji aturan OpenAI (lib/openaiAturan.ts + biayaOpenAI di pricing).

     npm run uji-openai

   Biaya Rp 0: TANPA jaringan, tanpa API key, tanpa satu pun
   panggilan ke OpenAI. Yang diuji hanya cara kita MENYUSUN permintaan
   dan MEMBACA jawaban — bentuknya mengikuti dokumentasi REST
   Chat Completions & /v1/models.

   Yang paling dijaga:
   - API key (sk-..., sk-proj-...) tidak pernah ikut di pesan galat;
   - token penalaran TIDAK dihitung dua kali (OpenAI memasukkannya ke
     completion_tokens; kalau tidak dikurangkan, biaya membengkak);
   - max_completion_tokens, bukan max_tokens (model penalaran menolak);
   - jawaban kosong karena jatah habis untuk berpikir dijelaskan;
   - saldo habis (insufficient_quota) tidak dicoba ulang dan dijelaskan;
   - varian model yang belum ada di tabel tidak memakai tarif kakaknya.
   =========================================================== */

const {
  modelSahOpenAI,
  susunPermintaanOpenAI,
  bacaJawabanOpenAI,
  sebabKosongOpenAI,
  saringModelOpenAI,
  bolehCobaUlangOpenAI,
  jelaskanGalatOpenAI,
  galatAmanOpenAI,
} = await import("../lib/openaiAturan.ts");
const { biayaOpenAI } = await import("../lib/pricing.ts");

let lulus = 0;
let gagal = 0;
function uji(nama, dapat, harap) {
  if (JSON.stringify(dapat) === JSON.stringify(harap)) {
    lulus++;
    console.log(`  v ${nama}`);
  } else {
    gagal++;
    console.log(`  X ${nama}\n      dapat: ${JSON.stringify(dapat)}\n      harap: ${JSON.stringify(harap)}`);
  }
}

console.log("\nNama model");
uji("gpt-4.1-mini sah", modelSahOpenAI("gpt-4.1-mini"), true);
uji("gpt-5 sah", modelSahOpenAI("gpt-5"), true);
uji("o4-mini sah", modelSahOpenAI("o4-mini"), true);
uji("chatgpt-4o-latest sah", modelSahOpenAI("chatgpt-4o-latest"), true);
uji("gemini ditolak", modelSahOpenAI("gemini-2.5-flash"), false);
uji("claude ditolak", modelSahOpenAI("claude-sonnet-4-6"), false);
uji("garis miring ditolak", modelSahOpenAI("gpt-4o/../x"), false);
uji("spasi/kutip ditolak", modelSahOpenAI('gpt-4o", "x'), false);
uji("huruf besar ditolak", modelSahOpenAI("GPT-4o"), false);
uji("kosong / bukan string ditolak", [modelSahOpenAI(""), modelSahOpenAI(null), modelSahOpenAI(5)], [false, false, false]);
uji("terlalu panjang ditolak", modelSahOpenAI("gpt-" + "a".repeat(100)), false);
uji("o tanpa angka ditolak (bukan nama model)", modelSahOpenAI("omni"), false);

console.log("\nMenyusun permintaan Chat Completions");
const p = susunPermintaanOpenAI({
  model: "gpt-4.1-mini",
  system: "SYS",
  teks: "daunnya kenapa?",
  gambar: { mime: "image/jpeg", data: "QUJD" },
  riwayat: [
    { role: "user", content: "halo" },
    { role: "assistant", content: "Halo Kak" },
    { role: "user", content: "pesan 1" },
    { role: "user", content: "pesan 2" },
  ],
  maksToken: 4096,
});
uji("system di pesan pertama", p.messages[0], { role: "system", content: "SYS" });
uji("max_completion_tokens dipakai", p.max_completion_tokens, 4096);
uji("max_tokens TIDAK dikirim", "max_tokens" in p, false);
uji("model ikut di badan", p.model, "gpt-4.1-mini");
uji("urutan role bergantian", p.messages.map((m) => m.role), ["system", "user", "assistant", "user"]);
uji(
  "dua pesan pembeli berurutan + pesan sekarang digabung",
  p.messages[3].content.filter((c) => c.type === "text").map((c) => c.text),
  ["pesan 1", "pesan 2", "daunnya kenapa?"],
);
uji(
  "foto jadi data URL",
  p.messages[3].content.find((c) => c.type === "image_url")?.image_url.url,
  "data:image/jpeg;base64,QUJD",
);
const hanyaFoto = susunPermintaanOpenAI({ model: "gpt-4o", system: "S", teks: "  ", gambar: { mime: "image/png", data: "QUJD" }, maksToken: 10 });
uji("foto tanpa teks diberi penanda", hanyaFoto.messages[1].content[0].text, "(pelanggan hanya mengirim foto, tanpa teks)");
const balasanKosong = susunPermintaanOpenAI({
  model: "gpt-4o",
  system: "S",
  teks: "x",
  riwayat: [{ role: "user", content: "a" }, { role: "assistant", content: "   " }],
  maksToken: 10,
});
uji("balasan AI kosong dibuang (pesan pembeli digabung)", balasanKosong.messages.map((m) => m.role), ["system", "user"]);

console.log("\nMembaca jawaban");
const j = bacaJawabanOpenAI({
  model: "gpt-5-mini-2025-08-07",
  choices: [{ message: { content: "ACTION: AUTO_REPLY\nHalo Kak" }, finish_reason: "stop" }],
  usage: {
    prompt_tokens: 20000,
    completion_tokens: 500,
    prompt_tokens_details: { cached_tokens: 18000 },
    completion_tokens_details: { reasoning_tokens: 448 },
  },
});
uji("teks terbaca", j.teks, "ACTION: AUTO_REPLY\nHalo Kak");
uji("token penalaran dipisah dari keluar (tidak dihitung dua kali)", j.token, { masuk: 20000, keluar: 52, berpikir: 448, dariCache: 18000 });
uji("versi model terbaca", j.versiModel, "gpt-5-mini-2025-08-07");
uji("jawaban rusak tidak melempar", bacaJawabanOpenAI(null).teks, "");
uji(
  "angka rusak dijepit (penalaran > completion)",
  bacaJawabanOpenAI({ usage: { completion_tokens: 10, completion_tokens_details: { reasoning_tokens: 99 } } }).token,
  { masuk: 0, keluar: 0, berpikir: 10, dariCache: 0 },
);
uji(
  "cache > masuk dijepit",
  bacaJawabanOpenAI({ usage: { prompt_tokens: 5, prompt_tokens_details: { cached_tokens: 50 } } }).token.dariCache,
  5,
);

console.log("\nJawaban kosong dijelaskan");
uji("ada teks = tidak ada sebab", sebabKosongOpenAI(j), null);
const habisBerpikir = bacaJawabanOpenAI({
  choices: [{ message: { content: "" }, finish_reason: "length" }],
  usage: { completion_tokens: 4096, completion_tokens_details: { reasoning_tokens: 4096 } },
});
uji("habis untuk berpikir disebut", sebabKosongOpenAI(habisBerpikir)?.includes("berpikir"), true);
uji(
  "penolakan model disebut",
  sebabKosongOpenAI(bacaJawabanOpenAI({ choices: [{ message: { content: null, refusal: "I can't help" }, finish_reason: "stop" }] }))?.startsWith("Model menolak"),
  true,
);
uji(
  "content_filter disebut",
  sebabKosongOpenAI(bacaJawabanOpenAI({ choices: [{ message: { content: "" }, finish_reason: "content_filter" }] }))?.includes("content_filter"),
  true,
);
uji("tanpa pilihan disebut", sebabKosongOpenAI(bacaJawabanOpenAI({})), "OpenAI tidak mengembalikan pilihan balasan.");

console.log("\nDaftar model");
const daftar = saringModelOpenAI({
  data: [
    { id: "gpt-4.1-mini" },
    { id: "gpt-4.1-mini-2025-04-14" },
    { id: "gpt-5" },
    { id: "o4-mini" },
    { id: "text-embedding-3-small" },
    { id: "whisper-1" },
    { id: "tts-1" },
    { id: "dall-e-3" },
    { id: "gpt-image-1" },
    { id: "gpt-4o-realtime-preview" },
    { id: "gpt-4o-mini-transcribe" },
    { id: "gpt-4o-search-preview" },
    { id: "gpt-3.5-turbo-instruct" },
    { id: "omni-moderation-latest" },
    { id: "gpt-5-codex" },
    { id: "o1-pro" },
    { id: "gpt-4-0613" },
    { id: "babbage-002" },
    null,
    { id: 5 },
  ],
});
uji("hanya model obrolan, snapshot bertanggal disembunyikan", daftar.map((m) => m.id), ["o4-mini", "gpt-5", "gpt-4.1-mini"]);
uji("bentuk jawaban bukan daftar -> kosong", saringModelOpenAI({ data: "x" }), []);

console.log("\nGalat & coba ulang");
uji("503/500/502 dicoba ulang", [503, 500, 502].map(bolehCobaUlangOpenAI), [true, true, true]);
uji("429 (kuota/saldo) TIDAK dicoba ulang", bolehCobaUlangOpenAI(429), false);
uji("400/401/404 TIDAK dicoba ulang", [400, 401, 404].map(bolehCobaUlangOpenAI), [false, false, false]);
uji("saldo habis dijelaskan", jelaskanGalatOpenAI(429, "insufficient_quota", "x").includes("Billing"), true);
uji("batas per menit dijelaskan", jelaskanGalatOpenAI(429, "rate_limit_exceeded", "x").startsWith("Batas permintaan"), true);
uji("key salah dijelaskan", jelaskanGalatOpenAI(401, "invalid_api_key", "x").includes("OPENAI_API_KEY"), true);
uji("model tidak ada dijelaskan", jelaskanGalatOpenAI(404, "model_not_found", "x").includes("Pilih model lain"), true);
uji("galat lain apa adanya", jelaskanGalatOpenAI(400, null, "asli"), "asli");

console.log("\nAPI key tidak pernah bocor");
const kunci = "sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
uji("key utuh disembunyikan", galatAmanOpenAI(`gagal pakai ${kunci} ya`, kunci).includes("AbCdEf"), false);
uji(
  "key yang dikutip sebagian oleh OpenAI ikut disembunyikan",
  galatAmanOpenAI("Incorrect API key provided: sk-proj-Ab***********789.", undefined).includes("sk-proj"),
  false,
);
uji("key lain berpola sk- disembunyikan", galatAmanOpenAI("key sk-abcdef1234567890 salah", "lain-lain-lain").includes("sk-abc"), false);
uji("pesan panjang dipotong", galatAmanOpenAI("a".repeat(500), undefined).length, 301);

console.log("\nBiaya (USD / 1 juta token)");
const juta = { masuk: 1_000_000, keluar: 0, berpikir: 0 };
uji("gpt-4.1-mini $0,40 masuk", biayaOpenAI("gpt-4.1-mini", juta).usd, 0.4);
uji("gpt-4.1 tidak tertukar dengan mini", biayaOpenAI("gpt-4.1", juta).usd, 2);
uji("gpt-5-mini tidak tertukar dengan gpt-5", biayaOpenAI("gpt-5-mini", juta).usd, 0.25);
uji("snapshot bertanggal memakai tarif keluarganya", biayaOpenAI("gpt-4.1-mini-2025-04-14", juta).usd, 0.4);
uji("chat-latest memakai tarif keluarganya", biayaOpenAI("gpt-5.1-chat-latest", juta).usd, 1.25);
uji("token penalaran ditagih sebagai keluar", biayaOpenAI("gpt-5-mini", { masuk: 0, keluar: 0, berpikir: 1_000_000 }).usd, 2);
uji("token cache bertarif cache", biayaOpenAI("gpt-4.1-mini", { ...juta, dariCache: 1_000_000 }).usd, 0.1);
uji("varian belum di tabel TIDAK memakai tarif kakaknya", biayaOpenAI("gpt-5.2-mini", juta).dikenal, false);
uji("model asing = tidak dikenal, bukan gratis", biayaOpenAI("gpt-9", juta), { masuk: 1_000_000, keluar: 0, berpikir: 0, usd: 0, idr: 0, dikenal: false });
uji("cache negatif tidak membuat biaya negatif", biayaOpenAI("gpt-4o", { ...juta, dariCache: -5 }).usd, 2.5);

console.log("\nNVIDIA (bentuk Chat Completions yang sama)");
const { modelSahNvidia, modelSahPenyedia, saringModelNvidia } = await import("../lib/openaiAturan.ts");
uji("meta/llama-3.3-70b-instruct sah", modelSahNvidia("meta/llama-3.3-70b-instruct"), true);
uji("openai/gpt-oss-120b sah", modelSahNvidia("openai/gpt-oss-120b"), true);
uji("huruf besar & garis bawah sah", modelSahNvidia("nvidia/Llama-3_3-Nemotron-Super-49B-v1"), true);
uji("tanpa penerbit ditolak", modelSahNvidia("llama-3.3-70b"), false);
uji("dua garis miring ditolak", modelSahNvidia("a/b/c"), false);
uji("dua titik ditolak", modelSahNvidia("meta/../x"), false);
uji("spasi/kutip ditolak", modelSahNvidia('meta/x", "y'), false);
uji("nama OpenAI tidak sah di NVIDIA", modelSahPenyedia("nvidia", "gpt-4.1-mini"), false);
uji("nama NVIDIA tidak sah di OpenAI", modelSahPenyedia("openai", "meta/llama-3.3-70b-instruct"), false);
const pn = susunPermintaanOpenAI({ model: "meta/llama-3.3-70b-instruct", system: "S", teks: "x", maksToken: 4096, kolomMaks: "max_tokens" });
uji("NVIDIA memakai max_tokens", [pn.max_tokens, "max_completion_tokens" in pn], [4096, false]);
uji(
  "daftar NVIDIA: embedding/rerank/guard/gambar dibuang, kembar dibuang",
  saringModelNvidia({
    data: [
      { id: "meta/llama-3.3-70b-instruct" },
      { id: "meta/llama-3.3-70b-instruct" },
      { id: "nvidia/nv-embedqa-e5-v5" },
      { id: "nvidia/llama-3.2-nv-rerankqa-1b-v2" },
      { id: "meta/llama-guard-4-12b" },
      { id: "nvidia/llama-3.1-nemoguard-8b-content-safety" },
      { id: "stabilityai/stable-diffusion-xl" },
      { id: "openai/gpt-oss-120b" },
      { id: "tanpa-penerbit" },
    ],
  }).map((m) => m.id),
  ["meta/llama-3.3-70b-instruct", "openai/gpt-oss-120b"],
);
uji(
  "<think> model penalaran dibuang dari balasan",
  bacaJawabanOpenAI({ choices: [{ message: { content: "<think>hmm pelanggan tanya</think>\nACTION: AUTO_REPLY\nHalo Kak" } }] }).teks,
  "ACTION: AUTO_REPLY\nHalo Kak",
);
uji(
  "<think> yang tidak ditutup (jatah habis) = kosong, bukan pikiran bocor",
  bacaJawabanOpenAI({ choices: [{ message: { content: "<think>masih mikir..." }, finish_reason: "length" }] }).teks,
  "",
);
uji("key nvapi- disembunyikan", galatAmanOpenAI("key nvapi-AbCdEf123456789xyz salah", undefined).includes("AbCdEf"), false);
uji("NVIDIA 401 menyebut NVIDIA_API_KEY", jelaskanGalatOpenAI(401, null, "x", "nvidia").includes("NVIDIA_API_KEY"), true);
uji("NVIDIA 402 = kredit habis", jelaskanGalatOpenAI(402, null, "x", "nvidia").startsWith("Kredit uji NVIDIA habis"), true);
uji("NVIDIA tidak menyebut Billing OpenAI", jelaskanGalatOpenAI(429, "insufficient_quota", "x", "nvidia").includes("OpenAI"), false);
uji("model NVIDIA tidak punya tarif (bukan Rp 0 diam-diam)", biayaOpenAI("openai/gpt-oss-120b", juta).dikenal, false);

console.log(`\n${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
