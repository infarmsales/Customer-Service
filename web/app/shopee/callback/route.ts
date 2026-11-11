/* ===========================================================
   GET /shopee/callback — Shopee mengembalikan peramban ke sini
   sesudah pemilik toko menyetujui otorisasi, dengan ?code=&shop_id=
   (akun toko) atau ?code=&main_account_id= (akun utama — bisa
   beberapa toko sekaligus, lihat akunUtama() di bawah).

   Alurnya:
     1. tukar code -> access_token + refresh_token   (token/get)
     2. simpan ke marketplace_shops                   (service_role)
     3. ambil nama toko & kapan otorisasinya habis    (get_shop_info)
     4. kembali ke /settings dengan pesan — TANPA token di URL

   KENAPA TIDAK MEMERIKSA LOGIN

   Sama dengan auth-url: ini navigasi yang datang dari Shopee, bukan
   dari console, jadi tidak ada header sesi. Yang membatasinya adalah
   `code` itu sendiri: hanya sah 10 menit, sekali pakai, dan hanya
   bisa didapat oleh orang yang baru saja login ke akun penjual
   Shopee dan menyetujui aplikasi ini.

   YANG TIDAK PERNAH DILAKUKAN BERKAS INI

   Menaruh token di URL pengalihan, di log, atau di badan jawaban.
   URL balik ke /settings hanya memuat status dan nama toko atau kode
   galat — hal-hal yang memang akan ditampilkan di layar.
   =========================================================== */

import { NextResponse } from "next/server";
import { GalatKonfigurasi, GalatShopee } from "@/lib/shopee/klien";
import { GalatKonfigurasiAdmin } from "@/lib/supabase/admin";
import {
  GalatToko,
  ambilInfoToko,
  perbaruiProfilToko,
  simpanTokoBaru,
  tukarKode,
  tukarKodeAkunUtama,
} from "@/lib/shopee/token";
import { bacaBalikOtorisasi } from "@/lib/shopee/otorisasi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function keSettings(req: Request, param: Record<string, string>): NextResponse {
  const url = new URL("/settings", req.url);
  for (const [k, v] of Object.entries(param)) url.searchParams.set(k, v);
  return NextResponse.redirect(url.toString(), 302);
}

export async function GET(req: Request) {
  const balik = bacaBalikOtorisasi(new URL(req.url).searchParams);
  if (!balik) {
    return keSettings(req, { shopee: "gagal", sebab: "parameter_kurang" });
  }

  /* Login dengan akun UTAMA (Main account): Shopee kembali membawa
     main_account_id, dan toko yang dipilih baru diketahui dari
     shop_id_list di jawaban token/get. */
  if (balik.jenis === "akun_utama") {
    return akunUtama(req, balik.code, balik.mainAccountId);
  }

  const { code, shopId } = balik;
  let id: string;
  try {
    const token = await tukarKode(code, shopId);
    id = await simpanTokoBaru(shopId, token);

    /* Nama toko adalah pelengkap: kalau get_shop_info gagal, toko
       tetap tersimpan dan bisa dipakai — hanya namanya kosong. Jangan
       sampai kegagalan di langkah hiasan membatalkan langkah inti. */
    try {
      const info = await ambilInfoToko(token.accessToken, shopId);
      await perbaruiProfilToko(id, info);
      return keSettings(req, { shopee: "ok", toko: info.shop_name ?? shopId });
    } catch (err) {
      console.warn(
        "[shopee/callback] toko tersimpan, get_shop_info gagal:",
        err instanceof GalatShopee ? err.kode : (err as Error).name,
      );
      return keSettings(req, { shopee: "ok", toko: shopId, catatan: "nama_toko_belum" });
    }
  } catch (err) {
    const sebab = sebabGalat(err);
    return keSettings(req, { shopee: "gagal", sebab });
  }
}

/** Hanya KODE yang dibawa ke URL — bukan pesan lengkapnya, yang untuk
    beberapa galat bisa memantulkan input. */
function sebabGalat(err: unknown): string {
  let sebab = "tak_dikenal";
  if (err instanceof GalatShopee) sebab = err.kode;
  else if (err instanceof GalatToko) sebab = err.kode;
  else if (err instanceof GalatKonfigurasi) sebab = "konfigurasi";
  /* Dilempar getSupabaseAdmin() — SESUDAH Shopee menerbitkan token.
     Pada 12 Okt 2026 galat ini sempat muncul sebagai "tak_dikenal"
     karena belum dipetakan, dan itu menyembunyikan fakta bahwa
     penukaran kodenya sendiri sudah berhasil. */
  else if (err instanceof GalatKonfigurasiAdmin) sebab = "konfigurasi_supabase";
  /* Nama kelasnya dicatat supaya "tak_dikenal" berikutnya bisa
     ditelusuri dari log Vercel. Nama kelas tidak memuat rahasia. */
  console.error("[shopee/callback] gagal:", sebab, sebab === "tak_dikenal" ? (err as Error).name : "");
  return sebab;
}

/**
 * Otorisasi lewat akun utama: satu pasang token untuk semua toko yang
 * dipilih di halaman Shopee. Setiap toko disimpan sebagai baris sendiri
 * (lihat tukarKodeAkunUtama di lib/shopee/token.ts).
 *
 * Toko pertama yang gagal disimpan menghentikan proses — toko yang
 * sudah tersimpan sebelumnya tetap ada dan bisa dipakai. Nama toko,
 * seperti jalur satu toko, hanya pelengkap.
 */
async function akunUtama(req: Request, code: string, mainAccountId: string): Promise<NextResponse> {
  try {
    const { token, shopIds } = await tukarKodeAkunUtama(code, mainAccountId);
    if (shopIds.length === 0) {
      console.warn("[shopee/callback] akun utama tanpa toko di shop_id_list");
      return keSettings(req, { shopee: "gagal", sebab: "akun_utama_tanpa_toko" });
    }

    const nama: string[] = [];
    let adaTanpaNama = false;
    for (const shopId of shopIds) {
      const id = await simpanTokoBaru(shopId, token);
      try {
        const info = await ambilInfoToko(token.accessToken, shopId);
        await perbaruiProfilToko(id, info);
        nama.push(info.shop_name ?? shopId);
      } catch (err) {
        console.warn(
          "[shopee/callback] toko tersimpan (akun utama), get_shop_info gagal:",
          err instanceof GalatShopee ? err.kode : (err as Error).name,
        );
        nama.push(shopId);
        adaTanpaNama = true;
      }
    }
    console.info("[shopee/callback] akun utama: toko tersimpan", { jumlah: shopIds.length });
    return keSettings(req, {
      shopee: "ok",
      toko: nama.join(", "),
      ...(adaTanpaNama ? { catatan: "nama_toko_belum" } : {}),
    });
  } catch (err) {
    return keSettings(req, { shopee: "gagal", sebab: sebabGalat(err) });
  }
}
