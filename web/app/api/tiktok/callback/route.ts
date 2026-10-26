/* ===========================================================
   GET /api/tiktok/callback — TikTok mengembalikan peramban ke sini
   sesudah penjual (atau toko uji di Partner Center) menyetujui app.

   Parameter yang datang: code, app_key, locale, shop_region, dan
   kadang state. Otorisasi yang dimulai dari tombol "Otorisasikan
   aplikasi" di Partner Center TIDAK membawa state, jadi state tidak
   bisa diwajibkan di sini.

   Alurnya:
     1. tukar code -> access_token + refresh_token   (token/get)
     2. ambil toko & shop_cipher                     (authorization/202309/shops)
     3. simpan ke marketplace_shops                  (service_role)
     4. kembali ke /tiktok dengan status — TANPA token di URL

   KENAPA TIDAK MEMERIKSA LOGIN

   Navigasi ini datang dari TikTok, bukan dari console. Pembatasnya
   adalah code itu sendiri: sah 30 menit, sekali pakai, dan hanya
   didapat oleh orang yang baru saja menyetujui app ini di TikTok.
   =========================================================== */

import { NextResponse } from "next/server";
import { GalatKonfigurasiAdmin } from "@/lib/supabase/admin";
import { GalatKonfigurasiTiktok, GalatTiktok } from "@/lib/tiktok/klien";
import { GalatTokoTiktok, ambilTokoTerotorisasi, simpanToko, tukarKode } from "@/lib/tiktok/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function keHalaman(req: Request, param: Record<string, string>): NextResponse {
  const url = new URL("/tiktok", req.url);
  for (const [k, v] of Object.entries(param)) url.searchParams.set(k, v);
  return NextResponse.redirect(url.toString(), 302);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = (searchParams.get("code") ?? "").trim();

  /* Penjual menolak: TikTok tetap mengalihkan, dengan code=null. */
  if (!code || code === "null" || searchParams.get("error")) {
    return keHalaman(req, { tiktok: "gagal", sebab: searchParams.get("error") ?? "tanpa_kode" });
  }

  try {
    const token = await tukarKode(code);
    const toko = await ambilTokoTerotorisasi(token.accessToken);
    const jumlah = await simpanToko(token, toko);

    /* Scope Customer Service yang tidak ikut diberikan adalah sebab
       paling mungkin halaman /tiktok nanti gagal membaca chat. Dicek
       di sini supaya ketahuan saat itu juga, bukan belakangan. */
    const adaCs = token.grantedScopes.some((s) => s.includes("customer_service"));
    return keHalaman(req, {
      tiktok: "ok",
      toko: String(jumlah),
      ...(token.grantedScopes.length > 0 && !adaCs ? { catatan: "scope_cs_tidak_ada" } : {}),
    });
  } catch (err) {
    let sebab = "tak_dikenal";
    if (err instanceof GalatTiktok) sebab = err.kode;
    else if (err instanceof GalatTokoTiktok) sebab = err.kode;
    else if (err instanceof GalatKonfigurasiTiktok) sebab = "konfigurasi_tiktok";
    else if (err instanceof GalatKonfigurasiAdmin) sebab = "konfigurasi_supabase";
    /* Hanya kode & nama kelas ke log — tidak pernah code, token, atau URL. */
    console.error("[tiktok/callback] gagal:", sebab, sebab === "tak_dikenal" ? (err as Error).name : "");
    return keHalaman(req, { tiktok: "gagal", sebab });
  }
}
