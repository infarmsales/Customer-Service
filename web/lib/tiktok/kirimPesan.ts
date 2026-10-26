import "server-only";

/* ===========================================================
   Kirim balasan CS ke pembeli TikTok — MENGIRIM SUNGGUHAN.

   Disetujui pemilik proyek 26 Okt 2026, dengan batas:
     - hanya balasan MANUAL CS (sender_role CUSTOMER_SERVICE);
     - hanya teks;
     - AI tidak pernah memanggil fungsi ini sendiri.

   POST /customer_service/202606/conversations/{id}/messages
   Badan: { type: "TEXT", content: "{\"content\":\"...\"}", sender_role }
   — `content` adalah JSON yang diserialisasi JADI STRING, persis
   seperti bentuk pesan yang dibaca dari Get Messages.

   Ini panggilan TikTok pertama di proyek ini yang punya badan JSON,
   jadi langkah "badan ikut ditandatangani" di tandaTangan.ts baru
   diuji sungguhan di sini. Kalau rumusnya meleset, TikTok menolak
   dengan 106001 (sign tidak sah) dan TIDAK ada pesan yang terkirim.
   =========================================================== */

import { getSupabaseAdmin } from "../supabase/admin.ts";
import { namaTokoDari } from "../toko.ts";
import { permintaanTiktok } from "./klien.ts";
import { GalatTokoTiktok, tokenTokoValid } from "./token.ts";

/** Batas TikTok untuk TEXT. Console membatasi 600 lebih dulu (claude-core.md). */
export const MAKS_KARAKTER_TIKTOK = 2000;

/** id baris marketplace_shops untuk toko TikTok dengan nama ini. */
async function idTokoDariNama(namaToko: string): Promise<string> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("marketplace_shops")
    .select("id")
    .eq("platform", "tiktok")
    .eq("shop_name", namaToko)
    .limit(2);
  if (error) throw new GalatTokoTiktok("database", error.message);
  if (!data || data.length === 0) throw new GalatTokoTiktok("tidak_ditemukan", `Toko TikTok "${namaToko}" tidak terhubung.`);
  if (data.length > 1) throw new GalatTokoTiktok("database", `Ada lebih dari satu toko TikTok bernama "${namaToko}".`);
  return data[0].id as string;
}

/**
 * Kirim satu pesan teks. Mengembalikan message_id dari TikTok.
 *
 * @param shopName isi conversations.shop_name, mis. "SANDBOX_ID... · TikTok Shop".
 */
export async function kirimTeksTiktok(shopName: string, conversationId: string, teks: string): Promise<string> {
  const idToko = await idTokoDariNama(namaTokoDari(shopName));
  const { accessToken, shopCipher } = await tokenTokoValid(idToko);
  const { data } = await permintaanTiktok<{ message_id?: string }>({
    path: `/customer_service/202606/conversations/${conversationId}/messages`,
    method: "POST",
    accessToken,
    shopCipher,
    body: {
      type: "TEXT",
      content: JSON.stringify({ content: teks }),
      sender_role: "CUSTOMER_SERVICE",
    },
  });
  /* code 0 tanpa message_id tetap berarti terkirim; id kosong hanya
     membuat sinkronisasi berikutnya menambahkan salinan dari TikTok. */
  return data.message_id ?? "";
}
