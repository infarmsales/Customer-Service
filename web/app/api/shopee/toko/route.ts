/* ===========================================================
   GET /api/shopee/toko — daftar toko terhubung untuk halaman
   Pengaturan. WAJIB LOGIN.

   Tabel marketplace_shops tidak punya policy RLS, jadi peramban tidak
   bisa membacanya langsung — dan itu disengaja, karena tabelnya
   berisi token. Route ini membacanya lewat service_role lalu
   mengembalikan HANYA kolom yang aman: nama, platform, status aktif,
   dan kapan masing-masing token habis. Tidak pernah tokennya.
   =========================================================== */

import { NextResponse } from "next/server";
import { getSupabaseSebagai, tokenDariHeader } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { GalatKonfigurasiAdmin } from "@/lib/supabase/admin";
import { GalatToko, daftarToko } from "@/lib/shopee/token";
import { bacaModeOtomatis } from "@/lib/shopee/sinkron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (isSupabaseConfigured()) {
    const sb = getSupabaseSebagai(tokenDariHeader(req));
    if (!sb) return NextResponse.json({ error: "Butuh sesi login." }, { status: 401 });
    const { data, error } = await sb.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ error: "Sesi tidak berlaku." }, { status: 401 });
    }
  }

  try {
    const [toko, mode] = await Promise.all([daftarToko(), bacaModeOtomatis()]);
    /* Hanya label: true = otomatis tiap 15 menit; apa pun selain true = manual. */
    return NextResponse.json({ toko, modeOtomatis: mode === true });
  } catch (err) {
    if (err instanceof GalatKonfigurasiAdmin) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof GalatToko) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    throw err;
  }
}
