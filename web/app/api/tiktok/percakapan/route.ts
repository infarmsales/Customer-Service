/* ===========================================================
   GET /api/tiktok/percakapan — BACA SAJA. WAJIB LOGIN.

     ?toko=<uuid>                       daftar percakapan (20 terbaru)
     ?toko=<uuid>&percakapan=<id>       10 pesan terbaru percakapan itu
     tanpa ?toko                        daftar toko TikTok terhubung

   Tidak ada satu pun panggilan yang mengubah sesuatu di TikTok: Get
   Messages tidak menandai pesan sebagai sudah dibaca (dokumentasinya
   menyebut itu butuh API Read Message tersendiri). Gratis — tidak
   menyentuh Claude.

   Batas TikTok: 10.000 permintaan per hari per API (galat 45101004).
   =========================================================== */

import { NextResponse } from "next/server";
import { getSupabaseSebagai, tokenDariHeader } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { GalatKonfigurasiAdmin } from "@/lib/supabase/admin";
import { GalatKonfigurasiTiktok, GalatTiktok, permintaanTiktok } from "@/lib/tiktok/klien";
import { GalatTokoTiktok, daftarTokoTiktok, tokenTokoValid } from "@/lib/tiktok/token";
import { pembeliDari, teksPesan } from "@/lib/tiktok/aturan";
import type { DaftarPercakapan, DaftarPesan } from "@/lib/tiktok/tipe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Id percakapan TikTok berupa angka panjang. Selain itu ditolak sebelum menyentuh path. */
const POLA_ID = /^\d{1,30}$/;
const POLA_UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: Request) {
  if (isSupabaseConfigured()) {
    const sb = getSupabaseSebagai(tokenDariHeader(req));
    if (!sb) return NextResponse.json({ error: "Butuh sesi login." }, { status: 401 });
    const { data, error } = await sb.auth.getUser();
    if (error || !data.user) return NextResponse.json({ error: "Sesi tidak berlaku." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tokoId = searchParams.get("toko") ?? "";
  const percakapanId = searchParams.get("percakapan") ?? "";

  try {
    if (!tokoId) return NextResponse.json({ toko: await daftarTokoTiktok() });
    if (!POLA_UUID.test(tokoId)) return NextResponse.json({ error: "toko tidak valid" }, { status: 400 });

    const { accessToken, shopCipher, namaToko } = await tokenTokoValid(tokoId);

    if (percakapanId) {
      if (!POLA_ID.test(percakapanId)) return NextResponse.json({ error: "percakapan tidak valid" }, { status: 400 });
      const { data, requestId } = await permintaanTiktok<DaftarPesan>({
        path: `/customer_service/202309/conversations/${percakapanId}/messages`,
        accessToken,
        shopCipher,
        query: { page_size: 10, locale: "id-ID", sort_order: "DESC", sort_field: "create_time" },
      });
      return NextResponse.json({
        namaToko,
        requestId,
        pesan: (data.messages ?? [])
          .filter((m) => m.is_visible !== false)
          .map((m) => ({
            id: m.id ?? "",
            tipe: m.type ?? "",
            teks: teksPesan(m),
            peran: m.sender?.role ?? "",
            nama: m.sender?.nickname ?? "",
            waktu: m.create_time ?? null,
          })),
      });
    }

    const { data, requestId } = await permintaanTiktok<DaftarPercakapan>({
      path: "/customer_service/202309/conversations",
      accessToken,
      shopCipher,
      query: { page_size: 20, locale: "id-ID" },
    });
    return NextResponse.json({
      namaToko,
      requestId,
      percakapan: (data.conversations ?? []).map((c) => {
        const pembeli = pembeliDari(c.participants);
        return {
          id: c.id ?? "",
          pembeli: pembeli?.nickname ?? "(tanpa nama)",
          platformPembeli: pembeli?.buyer_platform ?? null,
          belumDibaca: c.unread_count ?? 0,
          bisaKirim: c.can_send_message ?? false,
          terakhir: c.latest_message ? teksPesan(c.latest_message) : "",
          waktu: c.latest_message?.create_time ?? c.create_time ?? null,
        };
      }),
    });
  } catch (err) {
    if (err instanceof GalatTiktok) {
      return NextResponse.json(
        { error: `TikTok menolak: ${err.kode}${err.pesan ? ` — ${err.pesan}` : ""}`, requestId: err.requestId },
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
