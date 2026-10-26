import "server-only";

/* ===========================================================
   Saran balasan untuk chat marketplace yang disinkronkan — GRATIS.

   Hanya Gerbang -0.5 (lampiran), Gerbang 0 (kata sensitif), dan
   template. TIDAK Gerbang 2 (Voyage, berbayar) dan TIDAK Claude.
   Pesan yang tidak tertangkap ketiganya mendapat keterangan bahwa
   saran Claude bisa diminta lewat tombol ✨ — yang tetap manual dan
   tetap melewati semua penjaga biaya di /api/chat.

   BEDANYA DENGAN /api/simulasi

   Simulasi menulis balasan template sebagai pesan 'assistant', seolah
   sudah terkirim otomatis. Di sini TIDAK: hasilnya hanya mengisi
   panel saran (ai_suggestion). Mengirim ke pembeli tetap keputusan
   CS lewat tombol Kirim. Karena itu saklar jadwal AI tidak relevan di
   sini — saran untuk CS justru paling berguna saat CS bertugas.

   Sumber tabel (template & kata sensitif) dimuat lebih dulu, sama
   seperti setiap rute yang menilai Gerbang 0 / template — lihat
   scripts/uji-sumber-terpasang.mjs untuk alasannya.
   =========================================================== */

import "@/lib/templates";
import { siapkanSumberTemplate } from "@/lib/db/templatesServer";
import { siapkanSumberSatpam } from "@/lib/db/satpamServer";
import { routeToCategory, teksHandover } from "@/content/knowledge-base/router.js";
import type { ActionCode, ChatMessage } from "@/lib/db/types";

export type Saran = {
  action: ActionCode | null;
  ai_suggestion: string;
  template_code: string | null;
};

export const SARAN_TIDAK_TERJANGKAU =
  "⏳ Belum ada saran gratis: pesan ini di luar jangkauan kata sensitif dan template. " +
  "Tekan ✨ untuk meminta saran Claude (berbayar, tetap melewati semua penjaga biaya), " +
  "atau balas manual.";

/** Muat sumber tabel SEKALI per sinkronisasi, bukan per percakapan. */
export async function siapkanSaran(): Promise<void> {
  await Promise.all([siapkanSumberTemplate(), siapkanSumberSatpam()]);
}

/**
 * Saran untuk pesan PELANGGAN terakhir — bukan pesan terakhir.
 *
 * TikTok sering menyisipkan pesan robot/sistem ("Obrolan dialihkan
 * kepada ...") sesudah pesan pembeli; pesan itu tercatat 'cs'. Kalau
 * yang dipakai pesan terakhir, chat seperti itu tidak akan pernah
 * mendapat saran. Saran untuk pesan yang sudah dibalas CS tidak
 * berbahaya: ia hanya draf yang bisa diabaikan.
 *
 * @returns null bila belum ada pesan pelanggan sama sekali.
 */
export function saranUntuk(pesan: readonly ChatMessage[]): Saran | null {
  const terakhir = [...pesan].reverse().find((m) => m.role === "user");
  if (!terakhir) return null;

  /* Gerbang -0.5: AI tidak bisa melihat gambar. */
  if (terakhir.lampiran && terakhir.lampiran.length > 0) {
    return { action: "HANDOVER_TO_CS", ai_suggestion: teksHandover(), template_code: null };
  }

  const keputusan = routeToCategory(terakhir.content);
  if (keputusan.jenis === "handover" || keputusan.jenis === "template") {
    return { action: keputusan.action, ai_suggestion: keputusan.teks, template_code: keputusan.kode };
  }
  return { action: null, ai_suggestion: SARAN_TIDAK_TERJANGKAU, template_code: null };
}
