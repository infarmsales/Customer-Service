/* ===========================================================
   Pemeta chat TikTok -> baris conversations — fungsi murni.

   Tidak membaca env, jaringan, atau database. Diuji oleh
   scripts/uji-tiktok.mjs.

   PERAN PESAN (keputusan 26 Okt 2026)

     BUYER                         -> 'user'  (pelanggan)
     SHOP, CUSTOMER_SERVICE,
     SYSTEM, ROBOT, lainnya        -> 'cs'

   Pesan robot/sistem TikTok ("Obrolan dialihkan kepada ...", balasan
   otomatis bawaan TikTok) SENGAJA ikut ditampilkan sebagai balasan
   toko: CS perlu tahu TikTok sudah membalas, supaya tidak dobel.
   Tidak pernah dipetakan ke 'assistant' — peran itu khusus balasan
   AI kita sendiri, dan mencampurnya membuat statistik AI berbohong.

   Pesan is_visible = false dibuang: dokumentasi menyebutnya tidak
   untuk ditampilkan ke CS (mis. permintaan rating dari sistem).
   =========================================================== */

import type { ChatMessage, Lampiran } from "../db/types.ts";
import { teksPesan } from "./aturan.ts";
import type { PesanTiktok } from "./tipe.ts";

function lampiranDari(m: PesanTiktok): Lampiran[] | undefined {
  if (m.type !== "IMAGE" && m.type !== "VIDEO") return undefined;
  try {
    const isi = JSON.parse(m.content ?? "{}") as { url?: unknown };
    if (typeof isi.url === "string" && isi.url.startsWith("http")) {
      return [{ url: isi.url, jenis: m.type === "IMAGE" ? "gambar" : "video" }];
    }
  } catch {
    /* JSON rusak: pesan tetap tampil sebagai [Gambar]/[Video] tanpa lampiran. */
  }
  return undefined;
}

/** Satu pesan TikTok -> ChatMessage; null bila tidak untuk ditampilkan. */
export function pesanKeChat(m: PesanTiktok): ChatMessage | null {
  if (m.is_visible === false) return null;
  if (!m.id || typeof m.create_time !== "number") return null;
  const lampiran = lampiranDari(m);
  return {
    role: m.sender?.role === "BUYER" ? "user" : "cs",
    content: teksPesan(m),
    timestamp: new Date(m.create_time * 1000).toISOString(),
    idEksternal: m.id,
    ...(lampiran ? { lampiran } : {}),
  };
}

/**
 * Gabungkan pesan yang sudah tersimpan dengan hasil tarikan baru.
 *
 * - Pesan dengan idEksternal yang sama: versi BARU yang dipakai.
 * - Pesan lama yang tidak ikut ditarik (lebih tua dari halaman yang
 *   diambil) DIPERTAHANKAN — sinkronisasi hanya menarik pesan
 *   terbaru, jadi membuangnya berarti riwayat menyusut setiap kali.
 * - Pesan tanpa idEksternal (catatan lokal) juga dipertahankan.
 * - Hasil diurutkan dari yang paling lama.
 */
export function gabungPesan(lama: readonly ChatMessage[], baru: readonly ChatMessage[]): ChatMessage[] {
  const idBaru = new Set(baru.map((m) => m.idEksternal).filter(Boolean));
  const sisa = lama.filter((m) => !m.idEksternal || !idBaru.has(m.idEksternal));
  return [...sisa, ...baru]
    .map((m, urutan) => ({ m, urutan }))
    .sort((a, b) => {
      const selisih = Date.parse(a.m.timestamp) - Date.parse(b.m.timestamp);
      return selisih !== 0 && Number.isFinite(selisih) ? selisih : a.urutan - b.urutan;
    })
    .map((x) => x.m);
}

/**
 * Apakah halaman pesan yang baru ditarik sudah menyentuh pesan yang
 * tersimpan? Kalau ya, halaman berikutnya tidak perlu diambil.
 */
export function sudahTersambung(halaman: readonly PesanTiktok[], idTersimpan: ReadonlySet<string>): boolean {
  return halaman.some((m) => m.id !== undefined && idTersimpan.has(m.id));
}
