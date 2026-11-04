/* ===========================================================
   Push Shopee (webhook) — verifikasi tanda tangan & pemetaan
   webchat_push. FUNGSI MURNI: tidak membaca env, jaringan, atau
   database. Diuji oleh scripts/uji-shopee-push.mjs.

   TANDA TANGAN PUSH (docs/shopee-api/push.pengantar.md)

     Authorization = hex( HMAC-SHA256( partner_key,
                          <URL callback> + "|" + <body mentah> ) )

   BERBEDA dari tanda tangan API biasa (tandaTangan.ts): di sini URL
   lengkap + pemisah "|" + body, bukan partner_id+path+timestamp.
   Body WAJIB mentah, byte apa adanya — JSON.parse lalu stringify
   ulang mengubah urutan/spasi dan tanda tangannya tidak cocok lagi.

   webchat_push (kode 10, docs/shopee-api/push.webchat_push.md)

     data.type = "message"       pesan sungguhan  -> dipetakan
     data.type = "notification"  mis. mark_as_replied -> diabaikan
   =========================================================== */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { ChatMessage, Lampiran } from "../db/types.ts";

/** Hitung tanda tangan push. */
export function tandaTanganPush(partnerKey: string, url: string, bodyMentah: string): string {
  return createHmac("sha256", partnerKey).update(`${url}|${bodyMentah}`).digest("hex");
}

/**
 * Sahkah push ini? Dicoba terhadap SETIAP kunci yang diberikan —
 * sandbox dan live punya partner key berbeda, dan tombol "Push Test
 * Data" bisa datang dari keduanya.
 */
export function pushSah(
  url: string,
  bodyMentah: string,
  kunci: readonly string[],
  header: string | null | undefined,
): boolean {
  const dari = (header ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(dari)) return false;
  const b = Buffer.from(dari);
  return kunci
    .filter((k) => k.length > 0)
    .some((k) => {
      const a = Buffer.from(tandaTanganPush(k, url, bodyMentah));
      return a.length === b.length && timingSafeEqual(a, b);
    });
}

/* ---------------- Pemetaan webchat_push ---------------- */

type IsiPesan = {
  message_id?: unknown;
  conversation_id?: unknown;
  shop_id?: unknown;
  from_id?: unknown;
  from_user_name?: unknown;
  to_id?: unknown;
  to_user_name?: unknown;
  from_shop_id?: unknown;
  to_shop_id?: unknown;
  message_type?: unknown;
  status?: unknown;
  content?: { text?: unknown; url?: unknown; video_url?: unknown; item_id?: unknown } | null;
  source_content?: { order_sn?: unknown; item_id?: unknown } | null;
};

type Amplop = {
  code?: unknown;
  shop_id?: unknown;
  timestamp?: unknown;
  data?: { type?: unknown; content?: IsiPesan | null } | null;
};

export type PesanPush = {
  conversationId: string;
  /** shop_id toko PENERIMA push (akar amplop). */
  shopId: string;
  pesan: ChatMessage;
  /** Lawan bicara toko: pembeli. Null bila pesan dari toko & nama pembeli tak terbaca. */
  pembeli: { id: string | null; nama: string | null };
  /** Dari source_content (mis. pesan faq_liveagent dari halaman pesanan). */
  orderSn: string | null;
};

const teks = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const idTeks = (v: unknown): string | null => {
  const s = teks(v).trim();
  return /^\d{1,30}$/.test(s) ? s : null;
};

/** Status pesan yang berarti balasan otomatis dari sisi toko. */
const STATUS_TOKO = new Set(["auto_reply", "offwork_autoreply"]);

/**
 * Amplop push -> satu pesan untuk conversations. null bila bukan
 * pesan chat yang perlu ditampilkan (kode lain, notifikasi, rusak).
 */
export function petakanWebchat(json: unknown): PesanPush | null {
  const a = (json ?? {}) as Amplop;
  if (Number(a.code) !== 10) return null;
  if (a.data?.type !== "message") return null;
  const c = a.data?.content;
  if (!c || typeof c !== "object") return null;

  const conversationId = idTeks(c.conversation_id);
  const messageId = teks(c.message_id).trim();
  const shopId = idTeks(a.shop_id) ?? idTeks(c.shop_id) ?? idTeks(c.to_shop_id);
  if (!conversationId || !messageId || !shopId) return null;

  /* Siapa pengirimnya. from_shop_id (ada sejak 2025-04-18) paling
     bisa dipegang; tanpanya, status auto-reply juga berarti toko. */
  const dariToko =
    (idTeks(c.from_shop_id) !== null && idTeks(c.from_shop_id) === shopId) || STATUS_TOKO.has(teks(c.status));

  const jenis = teks(c.message_type);
  const isi = c.content ?? {};
  let isiTeks: string;
  let lampiran: Lampiran[] | undefined;
  switch (jenis) {
    case "text":
    case "faq_liveagent":
      isiTeks = teks(isi.text);
      break;
    case "image": {
      isiTeks = "[Gambar]";
      const url = teks(isi.url);
      if (url.startsWith("http")) lampiran = [{ url, jenis: "gambar" }];
      break;
    }
    case "video": {
      isiTeks = "[Video]";
      const url = teks(isi.video_url);
      if (url.startsWith("http")) lampiran = [{ url, jenis: "video" }];
      break;
    }
    case "item":
      isiTeks = `[Kartu produk ${teks(isi.item_id)}]`.replace(" ]", "]");
      break;
    default:
      isiTeks = jenis ? `[${jenis}]` : "[pesan]";
  }

  /* Waktu: stempel akar push (detik). created_timestamp di content
     adalah waktu PERCAKAPAN dibuat, bukan waktu pesan ini. */
  const detik = Number(a.timestamp);
  const waktu = Number.isFinite(detik) && detik > 1_000_000_000 ? new Date(detik * 1000) : new Date();

  const orderSn = teks(c.source_content?.order_sn).trim();

  return {
    conversationId,
    shopId,
    pesan: {
      role: dariToko ? "cs" : "user",
      content: isiTeks,
      timestamp: waktu.toISOString(),
      idEksternal: messageId,
      ...(lampiran ? { lampiran } : {}),
    },
    pembeli: dariToko
      ? { id: idTeks(c.to_id), nama: teks(c.to_user_name) || null }
      : { id: idTeks(c.from_id), nama: teks(c.from_user_name) || null },
    orderSn: /^[0-9A-Z]{6,30}$/.test(orderSn) ? orderSn : null,
  };
}
