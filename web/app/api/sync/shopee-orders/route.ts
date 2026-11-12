/* ===========================================================
   /api/sync/shopee-orders?toko=<uuid> — tarik pesanan SATU toko.

   GET maupun POST diterima: pg_net memanggil dengan POST, tombol di
   Pengaturan dengan POST. Isinya sama.

   Pemicu yang sah: Bearer CRON_SECRET, atau sesi admin
   (lib/sync/penjaga.ts). Lalu, SEBELUM Shopee disentuh,
   sinkronkanToko() memeriksa:
     - sakelar toko (sinkron_pesanan)   false -> dilewati_toko_nonaktif
     - mode jadwal (khusus cron)        manual -> dilewati_mode_manual
     - kunci per toko                   dipegang -> dilewati_sedang_berjalan
   Semua "dilewati" dijawab 200 — bukan kegagalan, dan pg_cron tidak
   perlu mencatatnya sebagai galat.

   SATU TOKO PER PANGGILAN (A4): toko besar tidak boleh menghabiskan
   waktu toko lain. ?toko wajib; panggilan tanpa toko (mis. job lama
   'shopee-orders-15m' yang tidak sengaja dinyalakan lagi) ditolak 400
   tanpa menyentuh Shopee.

   maxDuration 300: batas Vercel Hobby dengan Fluid Compute. Potongan
   baru tidak dimulai dalam 30 detik terakhir (MARGIN_AMAN_DETIK);
   jawaban "belum_selesai" berarti panggil lagi — titik sinkron sudah
   tersimpan sampai potongan terakhir yang selesai.
   =========================================================== */

import { NextResponse } from "next/server";
import { periksaPemicu } from "@/lib/sync/penjaga";
import { sinkronkanToko } from "@/lib/shopee/sinkron";
import { tenggatRoute } from "@/lib/shopee/sinkronAturan";
import { GalatToko } from "@/lib/shopee/token";
import { GalatKonfigurasiAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* Harus sama dengan BATAS_ROUTE_DETIK di sinkronAturan.ts. Next.js
   menuntut nilai literal di sini, jadi tidak bisa diimpor. */
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function jalankan(req: Request) {
  const mulaiMs = Date.now();
  const pemicu = await periksaPemicu(req);
  if (!pemicu) {
    return NextResponse.json({ error: "Tidak berhak memicu sinkronisasi." }, { status: 401 });
  }

  const toko = (new URL(req.url).searchParams.get("toko") ?? "").trim();
  if (!UUID.test(toko)) {
    return NextResponse.json(
      { status: "toko_wajib", error: "Sertakan ?toko=<uuid marketplace_shops>. Satu toko per panggilan." },
      { status: 400 },
    );
  }

  try {
    const { status, ringkasan } = await sinkronkanToko(toko, pemicu.lewat, tenggatRoute(mulaiMs));
    if (status === "toko_tidak_ditemukan") {
      return NextResponse.json({ status, error: "Toko Shopee tidak ditemukan." }, { status: 404 });
    }
    console.log(
      `[sync/shopee-orders] oleh ${pemicu.lewat}: ${ringkasan?.toko ?? toko} = ${status}`,
      ringkasan
        ? {
            potongan: ringkasan.potongan_selesai,
            sisa: ringkasan.potongan_sisa,
            disimpan: ringkasan.disimpan,
            dilewati: ringkasan.dilewati_sama,
            galat: ringkasan.galat,
          }
        : {},
    );
    return NextResponse.json({ pemicu: pemicu.lewat, status, ringkasan });
  } catch (err) {
    if (err instanceof GalatKonfigurasiAdmin) {
      return NextResponse.json({ status: "galat", error: err.message }, { status: 503 });
    }
    /* Galat database saat membaca toko atau memegang kunci — sebelum
       Shopee disentuh. Kodenya saja, tanpa pesan yang bisa memuat isi. */
    if (err instanceof GalatToko) {
      console.error("[sync/shopee-orders] gagal sebelum mulai:", err.kode);
      return NextResponse.json({ status: "galat", error: err.kode }, { status: 500 });
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
