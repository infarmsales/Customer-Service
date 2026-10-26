/* ===========================================================
   POST /api/tiktok/kirim — kirim balasan CS ke pembeli TikTok.
   WAJIB LOGIN. MENGIRIM SUNGGUHAN ke pembeli.

   Badan: { conversationId: <uuid baris conversations>, teks: string }

   SIAPA YANG BOLEH

   Percakapan dibaca dengan SESI PEMANGGIL, bukan service_role. Jadi
   kebijakan RLS conversations (SEC-003, boleh_toko) yang memutuskan:
   akun yang tidak boleh melihat toko itu mendapat "tidak ditemukan",
   dan tidak ada yang terkirim. Keputusan pemilik proyek 26 Okt 2026:
   semua akun yang boleh melihat toko boleh membalas.

   Route ini TIDAK menulis pesan ke database. Ia mengembalikan
   message_id; peramban mencatatnya lewat appendMessage() supaya
   aturan eskalasi & jeda AI yang sudah ada tetap berlaku. Kalau
   pencatatan di peramban gagal, sinkronisasi berikutnya menarik
   pesan yang sama dari TikTok — tidak ada yang hilang.

   Tidak menyentuh Claude.
   =========================================================== */

import { NextResponse } from "next/server";
import { getSupabaseSebagai, tokenDariHeader } from "@/lib/supabase/server";
import { GalatKonfigurasiAdmin } from "@/lib/supabase/admin";
import { GalatKonfigurasiTiktok, GalatTiktok } from "@/lib/tiktok/klien";
import { GalatTokoTiktok } from "@/lib/tiktok/token";
import { MAKS_KARAKTER_TIKTOK, kirimTeksTiktok } from "@/lib/tiktok/kirimPesan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Batas console sendiri (claude-core.md: balasan maks. 600 karakter). */
const MAKS_KARAKTER_CONSOLE = 600;
const POLA_UUID = /^[0-9a-f-]{36}$/i;

/** Arti kode TikTok yang paling mungkin muncul saat mengirim. */
const ARTI: Record<string, string> = {
  "45101006": "TikTok menolak karena pesan mengandung kata sensitif. Ubah kalimatnya.",
  "45109001": "TikTok tidak mengizinkan membalas percakapan ini (aturan percakapan).",
  "45102007": "Tidak punya akses ke percakapan ini di TikTok.",
  "45101004": "Kuota harian TikTok (10.000 permintaan) habis. Coba lagi besok.",
  "106001": "Tanda tangan ditolak TikTok — kesalahan di sisi kita, pesan TIDAK terkirim.",
  "105002": "Token TikTok kedaluwarsa. Coba kirim sekali lagi.",
};

export async function POST(req: Request) {
  const sb = getSupabaseSebagai(tokenDariHeader(req));
  if (!sb) return NextResponse.json({ error: "Butuh sesi login." }, { status: 401 });
  const { data: user, error: galatUser } = await sb.auth.getUser();
  if (galatUser || !user.user) return NextResponse.json({ error: "Sesi tidak berlaku." }, { status: 401 });

  let badan: { conversationId?: unknown; teks?: unknown };
  try {
    badan = await req.json();
  } catch {
    return NextResponse.json({ error: "Badan bukan JSON." }, { status: 400 });
  }
  const conversationId = typeof badan.conversationId === "string" ? badan.conversationId : "";
  const teks = typeof badan.teks === "string" ? badan.teks.trim() : "";
  if (!POLA_UUID.test(conversationId)) return NextResponse.json({ error: "conversationId tidak valid." }, { status: 400 });
  if (!teks) return NextResponse.json({ error: "Pesan kosong." }, { status: 400 });
  if (teks.length > Math.min(MAKS_KARAKTER_CONSOLE, MAKS_KARAKTER_TIKTOK)) {
    return NextResponse.json({ error: `Pesan melebihi ${MAKS_KARAKTER_CONSOLE} karakter.` }, { status: 400 });
  }

  /* Dibaca dengan sesi pemanggil — RLS menentukan boleh-tidaknya. */
  const { data: percakapan, error } = await sb
    .from("conversations")
    .select("id, platform, shop_name, external_conversation_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!percakapan) return NextResponse.json({ error: "Percakapan tidak ditemukan." }, { status: 404 });
  if (percakapan.platform !== "tiktok" || !percakapan.external_conversation_id || !percakapan.shop_name) {
    return NextResponse.json({ error: "Bukan percakapan TikTok." }, { status: 400 });
  }
  if (!/^\d{1,30}$/.test(percakapan.external_conversation_id)) {
    return NextResponse.json({ error: "Id percakapan TikTok tidak valid." }, { status: 400 });
  }

  try {
    const messageId = await kirimTeksTiktok(percakapan.shop_name, percakapan.external_conversation_id, teks);
    return NextResponse.json({ ok: true, messageId });
  } catch (err) {
    if (err instanceof GalatTiktok) {
      return NextResponse.json(
        { error: ARTI[err.kode] ?? `TikTok menolak: ${err.kode}${err.pesan ? ` — ${err.pesan}` : ""}`, kode: err.kode, requestId: err.requestId },
        { status: 502 },
      );
    }
    if (err instanceof GalatTokoTiktok) return NextResponse.json({ error: err.message }, { status: 409 });
    if (err instanceof GalatKonfigurasiTiktok || err instanceof GalatKonfigurasiAdmin) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
}
