import "server-only";

/* ===========================================================
   Simpan satu pesan webchat_push Shopee ke conversations.

   Ditulis service_role (GRANT select/insert/update, migrasi
   20261026160000). Kunci unik (platform, external_conversation_id)
   membuat push yang terkirim ganda — Shopee memang bisa mengirim
   ulang pesan yang sama — tidak menggandakan percakapan, dan
   idEksternal = message_id mencegah pesan dobel di dalamnya.

   Tidak mengirim apa pun ke Shopee dan tidak memanggil Claude. Saran
   balasan hanya dari Gerbang -0.5, Gerbang 0, dan template (gratis).
   Percakapan Shopee tetap BACA SAJA di halaman Chat: kotak Kirim
   tertutup untuk percakapan marketplace selain TikTok (Chat.tsx).
   =========================================================== */

import { getSupabaseAdmin } from "../supabase/admin.ts";
import { susunShopName } from "../toko.ts";
import type { ChatMessage } from "../db/types.ts";
import { gabungPesan } from "../tiktok/pemetaChat.ts";
import { saranUntuk, siapkanSaran } from "../tiktok/saranGratis.ts";
import type { PesanPush } from "./push.ts";

/** Nama toko di console untuk shop_id push. */
async function namaToko(shopId: string): Promise<string> {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("marketplace_shops")
    .select("shop_name")
    .eq("platform", "shopee")
    .eq("external_shop_id", shopId)
    .maybeSingle();
  /* Push uji dari Console membawa shop_id contoh yang tidak terhubung
     ke toko mana pun. Tetap disimpan — supaya uji jalurnya bisa
     dilihat — dengan nama yang jelas menunjukkan asalnya. */
  return (data?.shop_name as string | null) ?? `Shopee ${shopId}`;
}

export async function simpanPesanPush(p: PesanPush): Promise<"baru" | "diperbarui" | "sama"> {
  const sb = getSupabaseAdmin();
  const { data: ada, error } = await sb
    .from("conversations")
    .select("id, messages, customer_id, customer_name, order_id")
    .eq("platform", "shopee")
    .eq("external_conversation_id", p.conversationId)
    .maybeSingle();
  if (error) throw new Error(`baca conversations: ${error.message}`);

  const lama: ChatMessage[] = Array.isArray(ada?.messages) ? (ada.messages as ChatMessage[]) : [];
  if (lama.some((m) => m.idEksternal === p.pesan.idEksternal)) return "sama";

  const pesan = gabungPesan(lama, [p.pesan]);
  await siapkanSaran();
  const saran = p.pesan.role === "user" ? saranUntuk(pesan) : null;

  const isi = {
    platform: "shopee",
    external_conversation_id: p.conversationId,
    shop_name: susunShopName(await namaToko(p.shopId), "shopee"),
    customer_id: (ada?.customer_id as string | null) ?? p.pembeli.id,
    customer_name: (ada?.customer_name as string | null) ?? p.pembeli.nama,
    order_id: (ada?.order_id as string | null) ?? p.orderSn,
    messages: pesan,
    unread: p.pesan.role === "user" ? true : undefined,
    last_message_at: pesan.at(-1)?.timestamp ?? p.pesan.timestamp,
    updated_at: new Date().toISOString(),
    ...(saran ? { ai_suggestion: saran.ai_suggestion, action: saran.action, template_code: saran.template_code } : {}),
  };

  if (ada) {
    const { error: e } = await sb.from("conversations").update(isi).eq("id", ada.id);
    if (e) throw new Error(`perbarui percakapan: ${e.message}`);
    return "diperbarui";
  }
  const { error: e } = await sb.from("conversations").insert({ ...isi, unread: true, created_at: p.pesan.timestamp });
  if (e) throw new Error(`tambah percakapan: ${e.message}`);
  return "baru";
}
