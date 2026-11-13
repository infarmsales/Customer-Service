/* ===========================================================
   /api/uji-gemini — MEJA UJI Gemini. WAJIB LOGIN.

     GET   status (key ada? terkunci?) + daftar model untuk dropdown.
           models.list TIDAK menghasilkan teks dan tidak memakai kuota
           generate.
     POST  satu balasan Gemini untuk satu pesan uji, boleh dengan FOTO
           SUNGGUHAN. BERBAYAR (atau memakai kuota tier gratis).
           `riwayat` (opsional) = giliran sebelumnya untuk obrolan
           bolak-balik di Simulasi. Seluruh riwayat dikirim ulang ke
           Google tiap giliran, jadi token masuk tumbuh per balasan;
           dibatasi MAKS_RIWAYAT giliran & MAKS_FOTO_OBROLAN foto.

   BUKAN JALUR PELANGGAN
   Route ini tidak menulis apa pun: tidak membuat percakapan, tidak
   membuat eskalasi, tidak menyentuh antrean CS. Chat pelanggan tetap
   lewat /api/chat dengan Claude.

   GERBANG YANG DIJALANKAN
     Gerbang 0 (satpam)  tetap, kecuali pemanggil sengaja meminta
                         `lewatiGerbang` untuk melihat jawaban mentah
                         model (mis. foto paket rusak).
     Template            tetap, dengan pengecualian yang sama — dan
                         dilewati otomatis bila ada FOTO: template
                         tidak bisa melihat gambar, dan yang mau diuji
                         justru apakah modelnya melihat.
     Gerbang 2 (Voyage)  TIDAK dijalankan. Meja ini membandingkan
                         model bahasa; Voyage hanya menambah biaya
                         tanpa mengubah apa yang diuji.
     Gerbang -0.5        (pesan berlampiran -> selalu ke CS) TIDAK
                         berlaku di sini — itulah seluruh tujuan uji
                         foto. Di produksi gerbang itu tetap utuh.

   System prompt-nya SAMA dengan Claude (claude-core + FAQ kategori),
   supaya perbandingannya adil; uji foto menambah CATATAN_FOTO.
   =========================================================== */

import { NextResponse } from "next/server";
import { buildFaqBlock, getInvariantBlock, parseAction } from "@/lib/knowledge";
import { ukurBalasan } from "@/lib/limits";
import { biayaGemini } from "@/lib/pricing";
import {
  daftarModelGemini,
  GalatGemini,
  geminiTerkunci,
  geminiTersedia,
  MAKS_TOKEN_GEMINI,
  mintaGemini,
  MODEL_GEMINI_BAWAAN,
} from "@/lib/gemini";
import {
  CATATAN_FOTO,
  MAKS_BASE64,
  MAKS_FOTO_OBROLAN,
  modelSah,
  periksaGambar,
  rapikanRiwayat,
  sebabKosong,
  type GambarUji,
} from "@/lib/geminiAturan";
import { getSupabaseSebagai, tokenDariHeader } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { siapkanSumberTemplate } from "@/lib/db/templatesServer";
import { siapkanSumberSatpam } from "@/lib/db/satpamServer";
import "@/lib/templates";
import { bacaBerkasFaq, routeToCategory } from "@/content/knowledge-base/router.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function wajibLogin(req: Request): Promise<NextResponse | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabaseSebagai(tokenDariHeader(req));
  if (!sb) return NextResponse.json({ error: "Butuh sesi login." }, { status: 401 });
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return NextResponse.json({ error: "Sesi tidak berlaku." }, { status: 401 });
  return null;
}

export async function GET(req: Request) {
  const tolak = await wajibLogin(req);
  if (tolak) return tolak;

  const dasar = {
    tersedia: geminiTersedia(),
    terkunci: geminiTerkunci(),
    modelBawaan: MODEL_GEMINI_BAWAAN,
    maksToken: MAKS_TOKEN_GEMINI,
  };
  if (!dasar.tersedia) return NextResponse.json({ ...dasar, model: [], galatModel: null });
  try {
    return NextResponse.json({ ...dasar, model: await daftarModelGemini(), galatModel: null });
  } catch (err) {
    /* Daftar gagal tidak mematikan halaman: dropdown jatuh ke model bawaan. */
    const pesan = err instanceof GalatGemini ? err.message : "Daftar model tidak terbaca.";
    return NextResponse.json({ ...dasar, model: [], galatModel: pesan });
  }
}

export async function POST(req: Request) {
  const tolak = await wajibLogin(req);
  if (tolak) return tolak;

  let body: { pesan?: unknown; model?: unknown; gambar?: unknown; lewatiGerbang?: unknown; riwayat?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body harus JSON yang valid." }, { status: 400 });
  }

  const teks = typeof body.pesan === "string" ? body.pesan.slice(0, 2000) : "";
  const galatGambar = periksaGambar(body.gambar);
  if (galatGambar) return NextResponse.json({ error: galatGambar }, { status: 400 });
  const gambar = (body.gambar ?? null) as GambarUji | null;
  if (!teks.trim() && !gambar) {
    return NextResponse.json({ error: "Tulis pesan atau lampirkan foto." }, { status: 400 });
  }
  const model = body.model === undefined || body.model === "" ? MODEL_GEMINI_BAWAAN : body.model;
  if (!modelSah(model)) return NextResponse.json({ error: "Nama model Gemini tidak sah." }, { status: 400 });
  const lewati = body.lewatiGerbang === true;

  const { riwayat, galat: galatRiwayat } = rapikanRiwayat(body.riwayat, MAKS_FOTO_OBROLAN - (gambar ? 1 : 0));
  if (galatRiwayat) return NextResponse.json({ error: galatRiwayat }, { status: 400 });
  const totalFoto = riwayat.reduce((n, m) => n + (m.gambar?.data.length ?? 0), gambar?.data.length ?? 0);
  if (totalFoto > MAKS_BASE64) {
    return NextResponse.json({ error: "Foto di obrolan ini terlalu besar bila digabung. Mulai ulang obrolan." }, { status: 413 });
  }
  const adaFoto = Boolean(gambar) || riwayat.some((m) => m.gambar);

  await Promise.all([siapkanSumberTemplate(), siapkanSumberSatpam()]);
  const keputusan = routeToCategory(teks);

  /* Gerbang 0 & template — Rp 0, Gemini tidak dipanggil. */
  if (!lewati && keputusan.jenis === "handover") {
    return NextResponse.json({
      sumber: "satpam",
      action: keputusan.action,
      reply: keputusan.teks,
      kode: keputusan.kode,
      alasan: keputusan.alasan,
      kategori: keputusan.kategori,
      panjang: ukurBalasan(keputusan.teks),
    });
  }
  if (!lewati && !gambar && keputusan.jenis === "template") {
    return NextResponse.json({
      sumber: "template",
      action: keputusan.action,
      reply: keputusan.teks,
      kode: keputusan.kode,
      alasan: keputusan.alasan,
      kategori: keputusan.kategori,
      panjang: ukurBalasan(keputusan.teks),
    });
  }

  /* Penjaga saldo — sebelum apa pun yang menyentuh Google. */
  if (geminiTerkunci()) {
    return NextResponse.json(
      { error: "Gemini dikunci (GEMINI_LOCK atau AI_TEST_LOCK aktif) — tidak ada panggilan yang dikirim.", terkunci: true },
      { status: 423 },
    );
  }
  if (!geminiTersedia()) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY belum diisi. Tambahkan di Vercel → Environment Variables, lalu redeploy." },
      { status: 503 },
    );
  }

  const invarian = getInvariantBlock();
  const { teks: faqTeks } = bacaBerkasFaq(keputusan.berkas);
  const blokFaq = buildFaqBlock(faqTeks);
  const system = invarian.teks + blokFaq.teks + (adaFoto ?"\n\n" + CATATAN_FOTO : "");

  const mulai = Date.now();
  try {
    const j = await mintaGemini({ model, system, teks, gambar, riwayat });
    const kosong = sebabKosong(j);
    if (kosong) {
      return NextResponse.json(
        { error: kosong, model, token: j.token, biaya: biayaGemini(model, j.token) },
        { status: 502 },
      );
    }
    const { action, reply } = parseAction(j.teks);
    return NextResponse.json({
      sumber: "gemini",
      action,
      reply,
      model,
      versiModel: j.versiModel,
      alasanSelesai: j.alasanSelesai,
      token: j.token,
      biaya: biayaGemini(model, j.token),
      waktuMs: Date.now() - mulai,
      kategori: keputusan.kategori,
      berkasKb: keputusan.berkas,
      denganFoto: Boolean(gambar),
      jumlahRiwayat: riwayat.length,
      lewatiGerbang: lewati,
      panjang: ukurBalasan(reply),
    });
  } catch (err) {
    if (err instanceof GalatGemini) {
      return NextResponse.json({ error: err.message }, { status: err.status >= 400 && err.status < 600 ? err.status : 502 });
    }
    console.error("[uji-gemini]", (err as Error).message);
    return NextResponse.json({ error: "Galat tak terduga saat memanggil Gemini." }, { status: 500 });
  }
}
