/* ===========================================================
   POST /api/shopee/push — penerima Push Mechanism (webhook) Shopee.

   Callback URL yang didaftarkan di Shopee Console → Push Mechanism:
     https://customer-service-teal.vercel.app/api/shopee/push
   (bisa diganti lewat env SHOPEE_PUSH_URL — HARUS persis sama dengan
   yang didaftarkan, karena URL itu ikut ditandatangani)

   ATURAN SHOPEE YANG MEMBENTUK BERKAS INI

   1. Jawab 2xx dengan BODY KOSONG dalam batas waktu (webchat_push:
      2 detik). Kalau tidak, push dianggap gagal; tingkat sukses
      < 30% mematikan langganan push otomatis.
   2. Setiap push membawa header Authorization = HMAC-SHA256
      (partner_key, URL + "|" + body mentah).

   MAKA: tanda tangan diperiksa DULU dan cepat; pekerjaan menyimpan
   dijalankan sesudah jawaban terkirim (after()). Push yang tanda
   tangannya tidak sah tetap dijawab 200 kosong — supaya verifikasi
   callback URL di Console dan push uji tidak dihitung gagal — tetapi
   TIDAK PERNAH diproses, dan penolakannya dicatat ke log (tanpa body).

   Tidak memanggil Claude. Tidak mengirim apa pun ke Shopee.
   =========================================================== */

import { after } from "next/server";
import { pushSah, petakanWebchat } from "@/lib/shopee/push";
import { simpanPesanPush } from "@/lib/shopee/simpanPush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const URL_BAWAAN = "https://customer-service-teal.vercel.app/api/shopee/push";

function kosong(): Response {
  return new Response(null, { status: 200 });
}

/** Kunci yang boleh menandatangani: sandbox dan (bila disetel) live. */
function daftarKunci(): string[] {
  return [process.env.SHOPEE_PARTNER_KEY, process.env.SHOPEE_LIVE_PARTNER_KEY]
    .map((k) => (k ?? "").trim())
    .filter((k) => k.length > 0);
}

export async function POST(req: Request) {
  const bodyMentah = await req.text();
  const url = (process.env.SHOPEE_PUSH_URL ?? "").trim() || URL_BAWAAN;

  if (!pushSah(url, bodyMentah, daftarKunci(), req.headers.get("authorization"))) {
    console.warn("[shopee/push] tanda tangan tidak sah — diabaikan", { panjang: bodyMentah.length });
    return kosong();
  }

  let json: unknown;
  try {
    json = JSON.parse(bodyMentah);
  } catch {
    console.warn("[shopee/push] body bukan JSON — diabaikan");
    return kosong();
  }

  const kode = Number((json as { code?: unknown })?.code);
  const pesan = petakanWebchat(json);
  if (!pesan) {
    /* Push sah tapi bukan pesan chat (kode lain, notifikasi). Dicatat
       kodenya saja supaya terlihat di log Vercel saat uji. */
    console.info("[shopee/push] diterima, tidak diproses", { kode });
    return kosong();
  }

  after(async () => {
    try {
      const hasil = await simpanPesanPush(pesan);
      console.info("[shopee/push] webchat disimpan", { hasil });
    } catch (err) {
      console.error("[shopee/push] gagal menyimpan:", (err as Error).message);
    }
  });
  return kosong();
}
