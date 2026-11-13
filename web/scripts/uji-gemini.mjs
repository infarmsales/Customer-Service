/* ===========================================================
   Uji aturan Gemini (lib/geminiAturan.ts + biayaGemini di pricing).

     npm run uji-gemini

   Biaya Rp 0: TANPA jaringan, tanpa API key, tanpa satu pun
   panggilan ke Google. Yang diuji hanya cara kita MENYUSUN permintaan
   dan MEMBACA jawaban — bentuknya mengikuti dokumentasi REST
   generateContent & models.list.

   Yang paling dijaga:
   - nama model tidak bisa menyusup ke path URL;
   - API key tidak pernah ikut di pesan galat;
   - jawaban kosong karena token habis untuk "berpikir" dijelaskan,
     bukan tampil sebagai "AI tidak menjawab";
   - ringkasan berpikir (thought) tidak ikut jadi balasan pelanggan.
   =========================================================== */

const {
  modelSah,
  periksaGambar,
  susunPermintaan,
  bacaJawaban,
  sebabKosong,
  saringModel,
  galatAman,
  CATATAN_FOTO,
  MAKS_BASE64,
} = await import("../lib/geminiAturan.ts");
const { biayaGemini } = await import("../lib/pricing.ts");

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

console.log("\nNama model (masuk ke path URL)");
uji("gemini-2.5-flash sah", modelSah("gemini-2.5-flash"), true);
uji("versi pratinjau sah", modelSah("gemini-2.5-flash-preview-09-2025"), true);
uji("bukan gemini ditolak", modelSah("claude-sonnet-4-6"), false);
uji("garis miring ditolak", modelSah("gemini-2.5-flash/../../x"), false);
uji("tanda tanya ditolak", modelSah("gemini-2.5-flash?key=x"), false);
uji("titik dua ditolak", modelSah("gemini-2.5-flash:streamGenerateContent"), false);
uji("dua titik ditolak", modelSah("gemini-..x"), false);
uji("awalan models/ ditolak (harus id polos)", modelSah("models/gemini-2.5-flash"), false);
uji("huruf besar ditolak", modelSah("Gemini-2.5-Flash"), false);
uji("kosong / bukan string ditolak", [modelSah(""), modelSah(null), modelSah(5)], [false, false, false]);
uji("terlalu panjang ditolak", modelSah("gemini-" + "a".repeat(100)), false);

console.log("\nGambar uji");
uji("tanpa gambar = sah", periksaGambar(undefined), null);
uji("jpeg base64 sah", periksaGambar({ mime: "image/jpeg", data: "QUJD" }), null);
uji("gif ditolak", periksaGambar({ mime: "image/gif", data: "QUJD" })?.includes("JPEG"), true);
uji("data kosong ditolak", periksaGambar({ mime: "image/png", data: "" }), "Data gambar kosong.");
uji("bukan base64 ditolak", periksaGambar({ mime: "image/png", data: "abc def<script>" }), "Data gambar bukan base64 yang sah.");
uji("awalan data: ditolak (harus base64 polos)", periksaGambar({ mime: "image/png", data: "data:image/png;base64,QUJD" }) !== null, true);
uji("terlalu besar ditolak", periksaGambar({ mime: "image/jpeg", data: "A".repeat(MAKS_BASE64 + 4) })?.includes("terlalu besar"), true);
uji("bukan objek ditolak", periksaGambar("foto.jpg"), "Format gambar tidak dikenal.");

console.log("\nMenyusun permintaan generateContent");
const p = susunPermintaan({
  system: "SYS",
  teks: "daunnya kenapa?",
  gambar: { mime: "image/jpeg", data: "QUJD" },
  riwayat: [
    { role: "user", content: "halo" },
    { role: "assistant", content: "halo kak" },
    { role: "user", content: "" },
  ],
  maksToken: 2048,
});
uji("system prompt di systemInstruction", p.systemInstruction, { parts: [{ text: "SYS" }] });
uji("assistant -> model, pesan kosong dibuang", p.contents.map((c) => c.role), ["user", "model", "user"]);
uji("foto ikut di pesan terakhir sebagai inlineData", p.contents.at(-1).parts[0], { inlineData: { mimeType: "image/jpeg", data: "QUJD" } });
uji("teks di belakang foto", p.contents.at(-1).parts[1], { text: "daunnya kenapa?" });
uji("maxOutputTokens terpasang", p.generationConfig, { maxOutputTokens: 2048 });
const hanyaFoto = susunPermintaan({ system: "S", teks: "   ", gambar: { mime: "image/png", data: "QUJD" }, maksToken: 10 });
uji("foto tanpa teks -> penanda, bukan part teks kosong", hanyaFoto.contents[0].parts[1].text.includes("hanya mengirim foto"), true);
uji("tanpa foto -> satu part teks", susunPermintaan({ system: "S", teks: "hai", maksToken: 10 }).contents[0].parts, [{ text: "hai" }]);
uji("catatan foto menegaskan handover tetap berlaku", CATATAN_FOTO.includes("HANDOVER_TO_CS"), true);

console.log("\nMembaca jawaban");
const contohJawab = {
  candidates: [
    {
      content: { parts: [{ text: "ringkasan pikiran", thought: true }, { text: "ACTION: AUTO_REPLY\n" }, { text: "Halo kak!" }] },
      finishReason: "STOP",
    },
  ],
  usageMetadata: { promptTokenCount: 5000, candidatesTokenCount: 80, thoughtsTokenCount: 300, cachedContentTokenCount: 1000 },
  modelVersion: "gemini-2.5-flash",
};
const j = bacaJawaban(contohJawab);
uji("bagian thought TIDAK ikut jadi balasan", j.teks, "ACTION: AUTO_REPLY\nHalo kak!");
uji("token terbaca", j.token, { masuk: 5000, keluar: 80, berpikir: 300, dariCache: 1000 });
uji("alasan selesai", j.alasanSelesai, "STOP");
uji("jawaban normal -> tidak kosong", sebabKosong(j), null);
const habisMikir = bacaJawaban({ candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }], usageMetadata: { thoughtsTokenCount: 2040 } });
uji("token habis untuk berpikir dijelaskan", sebabKosong(habisMikir)?.includes("berpikir"), true);
const blokir = bacaJawaban({ promptFeedback: { blockReason: "SAFETY" } });
uji("prompt diblokir dijelaskan", sebabKosong(blokir)?.includes("diblokir"), true);
uji("jawaban rusak tidak melempar", bacaJawaban("bukan json").teks, "");
uji("null tidak melempar", bacaJawaban(null).token, { masuk: 0, keluar: 0, berpikir: 0, dariCache: 0 });
uji("token negatif/NaN jadi 0", bacaJawaban({ usageMetadata: { promptTokenCount: -5, candidatesTokenCount: Number.NaN } }).token.masuk, 0);

console.log("\nDaftar model untuk dropdown");
const daftar = saringModel({
  models: [
    { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", supportedGenerationMethods: ["generateContent", "countTokens"], inputTokenLimit: 1048576 },
    { name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", supportedGenerationMethods: ["generateContent"] },
    { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
    { name: "models/gemini-embedding-001", supportedGenerationMethods: ["embedContent"] },
    { name: "models/gemini-2.5-flash-preview-tts", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.0-flash-live-001", supportedGenerationMethods: ["bidiGenerateContent"] },
    { name: "models/gemini-2.0-flash-preview-image-generation", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-x/../evil", supportedGenerationMethods: ["generateContent"] },
    null,
  ],
});
uji("hanya model teks generateContent", daftar.map((m) => m.id), ["gemini-2.5-pro", "gemini-2.5-flash"]);
uji("nama tampilan & batas token ikut", daftar.find((m) => m.id === "gemini-2.5-flash"), { id: "gemini-2.5-flash", nama: "Gemini 2.5 Flash", batasMasuk: 1048576 });
uji("jawaban rusak -> daftar kosong", saringModel({ models: "x" }), []);

console.log("\nPesan galat aman");
const KEY = "AIzaSyTESTKEY1234567890abcdefghij";
uji("key tidak ikut di pesan", galatAman(`API key not valid: ${KEY}`, KEY).includes(KEY), false);
uji("pola AIza lain juga disembunyikan", galatAman("key AIzaSyOTHERKEY_abcdefghijklmnopqrstu bocor", undefined).includes("AIza"), false);
uji("pesan panjang dipotong", galatAman("x".repeat(500), undefined).length <= 301, true);

console.log("\nBiaya (tarif bila berbayar)");
const b = biayaGemini("gemini-2.5-flash", { masuk: 1_000_000, keluar: 0, berpikir: 0 });
uji("1 juta token masuk flash = $0,30", Math.round(b.usd * 100) / 100, 0.3);
uji("token berpikir ditagih sebagai keluar", biayaGemini("gemini-2.5-flash", { masuk: 0, keluar: 0, berpikir: 1_000_000 }).usd, 2.5);
uji("flash-lite tidak tertukar dengan flash", biayaGemini("gemini-2.5-flash-lite", { masuk: 1_000_000, keluar: 0, berpikir: 0 }).usd, 0.1);
uji("versi pratinjau memakai tarif keluarganya", biayaGemini("gemini-2.5-pro-preview-06-05", { masuk: 1_000_000, keluar: 0, berpikir: 0 }).usd, 1.25);
const asing = biayaGemini("gemini-9-ultra", { masuk: 100, keluar: 100, berpikir: 0 });
uji("model asing: dikenal=false, bukan 'gratis' diam-diam", [asing.dikenal, asing.usd], [false, 0]);

console.log(`\nUji Gemini : ${gagal === 0 ? "LULUS" : "GAGAL"} ${lulus}/${lulus + gagal}`);
process.exit(gagal === 0 ? 0 : 1);
