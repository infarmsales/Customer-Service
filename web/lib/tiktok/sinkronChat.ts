import "server-only";

/* ===========================================================
   Sinkronisasi chat TikTok -> tabel conversations. BACA SAJA.

   Dipicu tombol "Sinkronkan chat TikTok" di halaman Chat (keputusan
   26 Okt 2026: manual, belum cron, belum webhook).

   Per toko TikTok aktif:
     1. 20 percakapan terbaru                    (1 panggilan)
     2. hanya percakapan yang BERUBAH sejak sinkron terakhir:
        pesan terbaru, 10 per halaman, berhenti begitu menyentuh
        pesan yang sudah tersimpan — maks. 5 halaman
     3. gabung dengan pesan tersimpan, tulis ke conversations
        (service_role; kunci unik platform + external_conversation_id)

   Tidak ada yang dikirim ke TikTok, tidak ada yang ditandai sudah
   dibaca, dan Claude tidak disentuh sama sekali. Menulis ke
   conversations TIDAK memicu AI: tidak ada kode yang memanggil
   /api/chat secara otomatis (diperiksa 26 Okt 2026).

   Kuota TikTok 10.000 permintaan/hari per API. Satu kali sinkron
   = 1 + (percakapan berubah × ≤5) panggilan.
   =========================================================== */

import { getSupabaseAdmin } from "../supabase/admin.ts";
import { susunShopName } from "../toko.ts";
import type { ChatMessage } from "../db/types.ts";
import { pembeliDari } from "./aturan.ts";
import { permintaanTiktok } from "./klien.ts";
import { gabungPesan, pesanKeChat, sudahTersambung } from "./pemetaChat.ts";
import { daftarTokoTiktok, tokenTokoValid } from "./token.ts";
import type { DaftarPercakapan, DaftarPesan, PesanTiktok } from "./tipe.ts";

const MAKS_HALAMAN_PESAN = 5;

export type HasilToko = {
  toko: string;
  ok: boolean;
  percakapan: number;
  baru: number;
  diperbarui: number;
  galat?: string;
};

type Tersimpan = { id: string; external_conversation_id: string; messages: ChatMessage[] | null };

async function tarikPesan(
  conversationId: string,
  akses: { accessToken: string; shopCipher: string },
  idTersimpan: ReadonlySet<string>,
): Promise<PesanTiktok[]> {
  const hasil: PesanTiktok[] = [];
  let pageToken = "";
  for (let i = 0; i < MAKS_HALAMAN_PESAN; i++) {
    const { data } = await permintaanTiktok<DaftarPesan>({
      path: `/customer_service/202309/conversations/${conversationId}/messages`,
      accessToken: akses.accessToken,
      shopCipher: akses.shopCipher,
      query: {
        page_size: 10,
        locale: "id-ID",
        sort_order: "DESC",
        sort_field: "create_time",
        ...(pageToken ? { page_token: pageToken } : {}),
      },
    });
    const halaman = data.messages ?? [];
    hasil.push(...halaman);
    if (sudahTersambung(halaman, idTersimpan) || !data.next_page_token) break;
    pageToken = data.next_page_token;
  }
  return hasil;
}

async function sinkronSatuToko(t: { id: string; shop_name: string | null; external_shop_id: string }): Promise<HasilToko> {
  const nama = t.shop_name ?? t.external_shop_id;
  const hasil: HasilToko = { toko: nama, ok: false, percakapan: 0, baru: 0, diperbarui: 0 };
  try {
    const akses = await tokenTokoValid(t.id);
    const { data } = await permintaanTiktok<DaftarPercakapan>({
      path: "/customer_service/202309/conversations",
      accessToken: akses.accessToken,
      shopCipher: akses.shopCipher,
      query: { page_size: 20, locale: "id-ID" },
    });
    /* Id dipakai di PATH permintaan berikutnya, jadi hanya angka yang lolos. */
    const daftar = (data.conversations ?? []).filter((c) => typeof c.id === "string" && /^\d{1,30}$/.test(c.id));
    hasil.percakapan = daftar.length;
    if (daftar.length === 0) return { ...hasil, ok: true };

    const sb = getSupabaseAdmin();
    const { data: ada, error } = await sb
      .from("conversations")
      .select("id, external_conversation_id, messages")
      .eq("platform", "tiktok")
      .in(
        "external_conversation_id",
        daftar.map((c) => c.id as string),
      );
    if (error) throw new Error(`baca conversations: ${error.message}`);
    const peta = new Map(((ada ?? []) as Tersimpan[]).map((r) => [r.external_conversation_id, r]));

    for (const c of daftar) {
      const lama = peta.get(c.id as string);
      const pesanLama = Array.isArray(lama?.messages) ? lama.messages : [];
      const idTersimpan = new Set(pesanLama.map((m) => m.idEksternal).filter((x): x is string => !!x));

      /* Pesan terakhir sudah tersimpan -> tidak ada yang berubah. */
      if (lama && c.latest_message?.id && idTersimpan.has(c.latest_message.id)) continue;

      const mentah = await tarikPesan(c.id as string, akses, idTersimpan);
      const pesan = gabungPesan(
        pesanLama,
        mentah.map(pesanKeChat).filter((m): m is ChatMessage => m !== null),
      );
      const terakhir = pesan.at(-1)?.timestamp ?? new Date((c.create_time ?? Date.now() / 1000) * 1000).toISOString();
      const pembeli = pembeliDari(c.participants);

      const isi = {
        platform: "tiktok",
        external_conversation_id: c.id as string,
        customer_id: pembeli?.user_id ?? null,
        customer_name: pembeli?.nickname ?? null,
        shop_name: susunShopName(nama, "tiktok"),
        messages: pesan,
        unread: (c.unread_count ?? 0) > 0,
        last_message_at: terakhir,
        updated_at: new Date().toISOString(),
      };

      if (lama) {
        const { error: e } = await sb.from("conversations").update(isi).eq("id", lama.id);
        if (e) throw new Error(`perbarui percakapan: ${e.message}`);
        hasil.diperbarui++;
      } else {
        const { error: e } = await sb.from("conversations").insert({
          ...isi,
          created_at: c.create_time ? new Date(c.create_time * 1000).toISOString() : new Date().toISOString(),
        });
        if (e) throw new Error(`tambah percakapan: ${e.message}`);
        hasil.baru++;
      }
    }
    return { ...hasil, ok: true };
  } catch (err) {
    /* Pesan galat di sini berasal dari GalatTiktok / GalatTokoTiktok /
       Supabase — tidak pernah memuat token atau app secret. */
    return { ...hasil, galat: (err as Error).message };
  }
}

/** Semua toko TikTok aktif, berurutan. Tidak melempar karena satu toko. */
export async function sinkronChatTiktok(): Promise<HasilToko[]> {
  const toko = (await daftarTokoTiktok()).filter((t) => t.is_active);
  const hasil: HasilToko[] = [];
  for (const t of toko) hasil.push(await sinkronSatuToko(t));
  return hasil;
}
