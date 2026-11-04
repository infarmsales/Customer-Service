/* ===========================================================
   Push Shopee (webhook) — tanda tangan & pemetaan webchat_push.

     npm run uji-shopee-push

   Biaya Rp 0. Tanpa jaringan dan tanpa database.

   NILAI HARAPAN TANDA TANGAN dihitung dengan OpenSSL, terpisah dari
   Node:

     printf '%s' 'https://contoh.test/api/shopee/push|{"code":10,"shop_id":1}' \
       | openssl dgst -sha256 -hmac "kunci-push-uji"
   =========================================================== */

import { petakanWebchat, pushSah, tandaTanganPush } from "../lib/shopee/push.ts";

let lulus = 0;
let gagal = 0;
function uji(nama, dapat, harap) {
  if (JSON.stringify(dapat) === JSON.stringify(harap)) {
    lulus++;
    console.log(`  v ${nama}`);
  } else {
    gagal++;
    console.log(`  X ${nama}\n      harap : ${JSON.stringify(harap)}\n      dapat : ${JSON.stringify(dapat)}`);
  }
}

const URL = "https://contoh.test/api/shopee/push";
const BODY = '{"code":10,"shop_id":1}';
const KUNCI = "kunci-push-uji";
const HARAP = "3f9391a7d8f24cebaf0df03d4d167ee84c8de6bd6dc49b76cd432560709e1564";

console.log("\nTanda tangan push — diverifikasi OpenSSL");
uji("HMAC(URL|body) cocok OpenSSL", tandaTanganPush(KUNCI, URL, BODY), HARAP);
uji("header sah diterima", pushSah(URL, BODY, [KUNCI], HARAP), true);
uji("header huruf besar tetap diterima", pushSah(URL, BODY, [KUNCI], HARAP.toUpperCase()), true);
uji("kunci kedua (live) juga dicoba", pushSah(URL, BODY, ["kunci-lain", KUNCI], HARAP), true);
uji("body diubah satu spasi -> ditolak", pushSah(URL, '{"code":10, "shop_id":1}', [KUNCI], HARAP), false);
uji("URL beda (garis miring ujung) -> ditolak", pushSah(URL + "/", BODY, [KUNCI], HARAP), false);
uji("kunci salah -> ditolak", pushSah(URL, BODY, ["salah"], HARAP), false);
uji("tanpa header -> ditolak", pushSah(URL, BODY, [KUNCI], null), false);
uji("header bukan hex 64 -> ditolak", pushSah(URL, BODY, [KUNCI], "abc"), false);
uji("tanpa kunci disetel -> ditolak", pushSah(URL, BODY, [], HARAP), false);
uji("kunci kosong diabaikan", pushSah(URL, BODY, ["", KUNCI], HARAP), true);

console.log("\nPemetaan webchat_push");
/* Bentuk mengikuti contoh dokumentasi; nilainya karangan. */
const amplop = (content, extra = {}) => ({
  msg_id: "",
  data: { type: "message", region: "ID", content },
  shop_id: 500,
  code: 10,
  timestamp: 1_800_000_000,
  ...extra,
});
const dariPembeli = {
  message_id: "9001",
  shop_id: 500,
  from_id: 777,
  from_user_name: "pembeli.uji",
  to_id: 888,
  to_user_name: "toko.uji",
  message_type: "text",
  content: { text: "Halo kak, pupuknya ready?" },
  conversation_id: "4242",
  from_shop_id: 0,
  to_shop_id: 500,
};

const p = petakanWebchat(amplop(dariPembeli));
uji("percakapan & toko", [p?.conversationId, p?.shopId], ["4242", "500"]);
uji("pesan pembeli -> user", p?.pesan.role, "user");
uji("isi teks", p?.pesan.content, "Halo kak, pupuknya ready?");
uji("idEksternal = message_id", p?.pesan.idEksternal, "9001");
uji("waktu dari stempel akar", p?.pesan.timestamp, new Date(1_800_000_000_000).toISOString());
uji("pembeli = pengirim", p?.pembeli, { id: "777", nama: "pembeli.uji" });

const dariToko = petakanWebchat(
  amplop({ ...dariPembeli, message_id: "9002", from_id: 888, from_user_name: "toko.uji", to_id: 777, to_user_name: "pembeli.uji", from_shop_id: 500, to_shop_id: 0 }),
);
uji("pesan dari toko (from_shop_id) -> cs", dariToko?.pesan.role, "cs");
uji("pembeli = penerima bila toko yang menulis", dariToko?.pembeli, { id: "777", nama: "pembeli.uji" });
uji("auto_reply -> cs", petakanWebchat(amplop({ ...dariPembeli, from_shop_id: undefined, status: "auto_reply" }))?.pesan.role, "cs");

uji(
  "gambar -> lampiran",
  petakanWebchat(amplop({ ...dariPembeli, message_type: "image", content: { url: "https://cf.shopee.co.id/file/x" } }))?.pesan.lampiran,
  [{ url: "https://cf.shopee.co.id/file/x", jenis: "gambar" }],
);
uji(
  "gambar tanpa url http -> tanpa lampiran",
  petakanWebchat(amplop({ ...dariPembeli, message_type: "image", content: { url: "javascript:1" } }))?.pesan.lampiran,
  undefined,
);
uji("kartu produk", petakanWebchat(amplop({ ...dariPembeli, message_type: "item", content: { item_id: 55 } }))?.pesan.content, "[Kartu produk 55]");
uji(
  "faq_liveagent membawa order_sn",
  petakanWebchat(amplop({ ...dariPembeli, message_type: "faq_liveagent", content: { text: "Chat dengan Penjual" }, source_content: { order_sn: "220818EGS328B9" } }))?.orderSn,
  "220818EGS328B9",
);
uji("order_sn aneh dibuang", petakanWebchat(amplop({ ...dariPembeli, source_content: { order_sn: "x;drop" } }))?.orderSn, null);

uji("notification diabaikan", petakanWebchat({ code: 10, shop_id: 1, data: { type: "notification", content: { conversation_id: "1" } } }), null);
uji("kode push lain diabaikan", petakanWebchat({ ...amplop(dariPembeli), code: 3 }), null);
uji("tanpa conversation_id diabaikan", petakanWebchat(amplop({ ...dariPembeli, conversation_id: undefined })), null);
uji("conversation_id bukan angka diabaikan", petakanWebchat(amplop({ ...dariPembeli, conversation_id: "../x" })), null);
uji("tanpa message_id diabaikan", petakanWebchat(amplop({ ...dariPembeli, message_id: "" })), null);
uji("bukan objek tidak melempar", petakanWebchat(null), null);

console.log(`\n${lulus} lulus, ${gagal} gagal\n`);
process.exit(gagal === 0 ? 0 : 1);
