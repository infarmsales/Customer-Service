/* ===========================================================
   /api/uji-openai — MEJA UJI ChatGPT (OpenAI) & NVIDIA. WAJIB LOGIN.

     /api/uji-openai                  -> OpenAI (api.openai.com)
     /api/uji-openai?penyedia=nvidia  -> NVIDIA (integrate.api.nvidia.com)
   Keduanya berbentuk Chat Completions yang sama; yang berbeda hanya
   konfig di lib/openai.ts.

   Kembaran /api/uji-gemini untuk membandingkan model. Masukan,
   gerbang, system prompt, dan bentuk jawabannya SAMA, supaya yang
   berbeda di layar hanya modelnya.

     GET   status (key ada? terkunci?) + daftar model untuk dropdown.
           /v1/models gratis — tidak menghasilkan teks.
     POST  satu balasan untuk satu pesan uji, boleh dengan FOTO dan
           `riwayat` (obrolan bolak-balik di Simulasi). BERBAYAR —
           OpenAI tidak punya tier gratis API.

   BUKAN JALUR PELANGGAN
   Tidak menulis apa pun: tidak membuat percakapan, eskalasi, atau
   menyentuh antrean CS. Chat pelanggan tetap lewat /api/chat (Claude).

   GERBANG — sama persis dengan /api/uji-gemini:
     Gerbang 0 (satpam) & template tetap jalan (Rp 0), kecuali
     `lewatiGerbang`; template dilewati otomatis bila ada FOTO.
     Gerbang 2 (Voyage) dan Gerbang -0.5 TIDAK dijalankan.
   =========================================================== */

import { NextResponse } from "next/server";
import { buildFaqBlock, getInvariantBlock, parseAction } from "@/lib/knowledge";
import { ukurBalasan } from "@/lib/limits";
import { biayaOpenAI } from "@/lib/pricing";
import {
  daftarModel,
  GalatOpenAI,
  maksToken,
  mintaBalasan,
  modelBawaan,
  namaEnvKey,
  namaPenyedia,
  terkunci,
  tersedia,
} from "@/lib/openai";
import { modelSahPenyedia, sebabKosongOpenAI, type PenyediaKompatibel } from "@/lib/openaiAturan";
import {
  CATATAN_FOTO,
  MAKS_BASE64,
  MAKS_FOTO_OBROLAN,
  periksaGambar,
  rapikanRiwayat,
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

/** Hanya dua nilai yang dikenal; apa pun selain "nvidia" = OpenAI. */
function penyediaDari(req: Request): PenyediaKompatibel {
  return new URL(req.url).searchParams.get("penyedia") === "nvidia" ? "nvidia" : "openai";
}

export async function GET(req: Request) {
  const tolak = await wajibLogin(req);
  if (tolak) return tolak;
  const p = penyediaDari(req);

  const dasar = {
    tersedia: tersedia(p),
    terkunci: terkunci(p),
    modelBawaan: modelBawaan(p),
    maksToken: maksToken(p),
  };
  if (!dasar.tersedia) return NextResponse.json({ ...dasar, model: [], galatModel: null });
  try {
    return NextResponse.json({ ...dasar, model: await daftarModel(p), galatModel: null });
  } catch (err) {
    const pesan = err instanceof GalatOpenAI ? err.message : "Daftar model tidak terbaca.";
    return NextResponse.json({ ...dasar, model: [], galatModel: pesan });
  }
}

export async function POST(req: Request) {
  const tolak = await wajibLogin(req);
  if (tolak) return tolak;
  const p = penyediaDari(req);

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
  const model = body.model === undefined || body.model === "" ? modelBawaan(p) : body.model;
  if (!modelSahPenyedia(p, model)) {
    return NextResponse.json({ error: `Nama model ${namaPenyedia(p)} tidak sah.` }, { status: 400 });
  }
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

  /* Gerbang 0 & template — Rp 0, OpenAI tidak dipanggil. */
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

  /* Penjaga saldo — sebelum apa pun yang menyentuh OpenAI. */
  if (terkunci(p)) {
    return NextResponse.json(
      {
        error: `${namaPenyedia(p)} dikunci (${p.toUpperCase()}_LOCK atau AI_TEST_LOCK aktif) — tidak ada panggilan yang dikirim.`,
        terkunci: true,
      },
      { status: 423 },
    );
  }
  if (!tersedia(p)) {
    return NextResponse.json(
      { error: `${namaEnvKey(p)} belum diisi. Lokal: web/.env.local lalu jalankan ulang server. Vercel: Environment Variables lalu redeploy.` },
      { status: 503 },
    );
  }

  const invarian = getInvariantBlock();
  const { teks: faqTeks } = bacaBerkasFaq(keputusan.berkas);
  const blokFaq = buildFaqBlock(faqTeks);
  const system = invarian.teks + blokFaq.teks + (adaFoto ? "\n\n" + CATATAN_FOTO : "");

  const mulai = Date.now();
  try {
    const j = await mintaBalasan(p, { model, system, teks, gambar, riwayat });
    const kosong = sebabKosongOpenAI(j);
    if (kosong) {
      return NextResponse.json(
        { error: kosong, model, token: j.token, biaya: biayaOpenAI(model, j.token) },
        { status: 502 },
      );
    }
    const { action, reply } = parseAction(j.teks);
    return NextResponse.json({
      sumber: p,
      action,
      reply,
      model,
      versiModel: j.versiModel,
      alasanSelesai: j.alasanSelesai,
      token: j.token,
      biaya: biayaOpenAI(model, j.token),
      waktuMs: Date.now() - mulai,
      kategori: keputusan.kategori,
      berkasKb: keputusan.berkas,
      denganFoto: Boolean(gambar),
      jumlahRiwayat: riwayat.length,
      lewatiGerbang: lewati,
      panjang: ukurBalasan(reply),
    });
  } catch (err) {
    if (err instanceof GalatOpenAI) {
      return NextResponse.json({ error: err.message }, { status: err.status >= 400 && err.status < 600 ? err.status : 502 });
    }
    console.error("[uji-openai]", (err as Error).message);
    return NextResponse.json({ error: `Galat tak terduga saat memanggil ${namaPenyedia(p)}.` }, { status: 500 });
  }
}
