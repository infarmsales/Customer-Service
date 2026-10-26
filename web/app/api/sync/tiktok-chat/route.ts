/* ===========================================================
   POST /api/sync/tiktok-chat — tarik chat TikTok ke conversations.
   WAJIB LOGIN. Dipicu tombol di halaman Chat.

   Baca saja terhadap TikTok; menulis hanya ke database kita. Gratis:
   tidak memanggil Claude maupun Voyage. Lihat lib/tiktok/sinkronChat.ts.
   =========================================================== */

import { NextResponse } from "next/server";
import { getSupabaseSebagai, tokenDariHeader } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { GalatKonfigurasiAdmin } from "@/lib/supabase/admin";
import { GalatKonfigurasiTiktok } from "@/lib/tiktok/klien";
import { sinkronChatTiktok } from "@/lib/tiktok/sinkronChat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* Beberapa toko × beberapa halaman pesan bisa melewati 10 detik bawaan. */
export const maxDuration = 60;

export async function POST(req: Request) {
  if (isSupabaseConfigured()) {
    const sb = getSupabaseSebagai(tokenDariHeader(req));
    if (!sb) return NextResponse.json({ error: "Butuh sesi login." }, { status: 401 });
    const { data, error } = await sb.auth.getUser();
    if (error || !data.user) return NextResponse.json({ error: "Sesi tidak berlaku." }, { status: 401 });
  }

  try {
    return NextResponse.json({ toko: await sinkronChatTiktok() });
  } catch (err) {
    if (err instanceof GalatKonfigurasiTiktok || err instanceof GalatKonfigurasiAdmin) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
}
