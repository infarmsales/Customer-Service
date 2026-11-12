/* ===========================================================
   /api/sync/shopee-tokens — segarkan token SEMUA toko aktif, harian,
   lalu cek kesehatannya dengan satu panggilan baca get_shop_info.

   TIDAK TERPENGARUH KEDUA SAKELAR SINKRON PESANAN

   Toko dengan sinkron_pesanan = false (toko besar yang terhubung tapi
   belum boleh ditarik pesanannya) dan mode jadwal manual TETAP diproses
   di sini. refresh_token berumur 30 hari dan hanya diperpanjang saat
   DIPAKAI; kalau rute ini ikut dimatikan, toko harus diotorisasi ulang
   (dengan OTP akun utama) sebulan kemudian.

   tokenTokoValid() hanya menyegarkan bila access_token sudah basi
   (<10 menit sisa). Access token berumur 4 jam, jadi pada panggilan
   harian ia SELALU basi dan SELALU disegarkan — itulah yang dimaksud.

   CEK KESEHATAN: get_shop_info sesudah penyegaran membuktikan token
   barunya benar-benar diterima Shopee. Yang disimpan hanya waktu cek,
   ok/tidak, dan kode galat — bukan isi jawabannya.
   =========================================================== */

import { NextResponse } from "next/server";
import { periksaPemicu } from "@/lib/sync/penjaga";
import { GalatShopee } from "@/lib/shopee/klien";
import { GalatToko, ambilInfoToko, catatCekToken, daftarTokoAktif, tokenTokoValid } from "@/lib/shopee/token";
import { GalatKonfigurasiAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function kodeGalat(err: unknown): string {
  return err instanceof GalatShopee || err instanceof GalatToko ? err.kode : (err as Error).name;
}

async function jalankan(req: Request) {
  const pemicu = await periksaPemicu(req);
  if (!pemicu) {
    return NextResponse.json({ error: "Tidak berhak memicu penyegaran." }, { status: 401 });
  }

  try {
    const toko = await daftarTokoAktif();
    const hasil: { toko: string; ok: boolean; cek_token: boolean; galat?: string }[] = [];
    for (const t of toko) {
      const nama = t.shop_name ?? `Toko ${t.external_shop_id}`;
      let accessToken: string;
      try {
        ({ accessToken } = await tokenTokoValid(t.id));
      } catch (err) {
        const kode = kodeGalat(err);
        console.error(`[sync/shopee-tokens] ${nama} gagal diperpanjang:`, kode);
        await catatCekToken(t.id, false, kode);
        hasil.push({ toko: nama, ok: false, cek_token: false, galat: kode });
        continue;
      }
      try {
        await ambilInfoToko(accessToken, t.external_shop_id);
        await catatCekToken(t.id, true, null);
        hasil.push({ toko: nama, ok: true, cek_token: true });
      } catch (err) {
        /* Token sudah diperpanjang (ok), tetapi Shopee menolak memakainya. */
        const kode = kodeGalat(err);
        console.error(`[sync/shopee-tokens] ${nama} cek get_shop_info gagal:`, kode);
        await catatCekToken(t.id, false, kode);
        hasil.push({ toko: nama, ok: true, cek_token: false, galat: kode });
      }
    }
    return NextResponse.json({ pemicu: pemicu.lewat, toko: hasil });
  } catch (err) {
    if (err instanceof GalatKonfigurasiAdmin) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
}

export async function GET(req: Request) {
  return jalankan(req);
}

export async function POST(req: Request) {
  return jalankan(req);
}
