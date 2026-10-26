/* ===========================================================
   TikTok Shop — tanda tangan, klien, dan aturan.

     npm run uji-tiktok

   Biaya Rp 0. Tidak ada jaringan: fetch diganti tiruan, tidak ada
   panggilan ke TikTok, Supabase, maupun Claude.

   NILAI HARAPAN TANDA TANGAN DARI MANA

   Bukan dari menjalankan kode ini. Dihitung dengan OpenSSL, yang
   sama sekali terpisah dari Node:

     printf '%s' "abc000def111/authorization/202309/shopsapp_key123456timestamp1234567890abc000def111" \
       | openssl dgst -sha256 -hmac "abc000def111"

   String masukannya persis contoh di halaman "Create a hash to sign
   your test API call" (zip dokumentasi, 26 Okt 2026).
   =========================================================== */

import { buatSign, queryBertanda, stringUntukSign } from "../lib/tiktok/tandaTangan.ts";
import { GalatTiktok, mintaToken, permintaanTiktok } from "../lib/tiktok/klien.ts";
import { epochKeTanggal, pembeliDari, teksPesan, tokoSah } from "../lib/tiktok/aturan.ts";
import { gabungPesan, pesanKeChat, sudahTersambung } from "../lib/tiktok/pemetaChat.ts";

let lulus = 0;
let gagal = 0;

function uji(nama, dapat, harap) {
  const sama = JSON.stringify(dapat) === JSON.stringify(harap);
  if (sama) {
    lulus++;
    console.log(`  v ${nama}`);
  } else {
    gagal++;
    console.log(`  X ${nama}`);
    console.log(`      harap : ${JSON.stringify(harap)}`);
    console.log(`      dapat : ${JSON.stringify(dapat)}`);
  }
}

const RAHASIA = "abc000def111";
const KRED = { appKey: "123456", appSecret: RAHASIA };

console.log("\nTanda tangan — contoh dokumentasi, diverifikasi OpenSSL");
uji(
  "string yang ditandatangani persis contoh dokumentasi",
  stringUntukSign(RAHASIA, "/authorization/202309/shops", { timestamp: 1234567890, app_key: "123456" }),
  "abc000def111/authorization/202309/shopsapp_key123456timestamp1234567890abc000def111",
);
uji(
  "HMAC contoh dokumentasi",
  buatSign(RAHASIA, "/authorization/202309/shops", { app_key: "123456", timestamp: 1234567890 }),
  "c8767e4fd7a1b48a0ce3fd23197f058159ce11b53f1ae1ad6d1ec931a1da5540",
);
uji(
  "HMAC dengan shop_cipher + badan JSON (OpenSSL)",
  buatSign(
    RAHASIA,
    "/customer_service/202309/conversations/123/messages",
    { timestamp: 1234567890, shop_cipher: "ROW_abc", page_size: 10, app_key: "123456" },
    '{"content":"x"}',
  ),
  "18bc035395caa6f72d21d23908231b1189a85c7c2000b23c3ca4fa248a56e056",
);

console.log("\nTanda tangan — aturan susunan");
uji(
  "sign & access_token tidak ikut ditandatangani",
  stringUntukSign("K", "/p", { sign: "x", access_token: "y", b: 2, a: 1 }),
  "K/pa1b2K",
);
uji("urutan masukan tidak berpengaruh", buatSign("K", "/p", { b: 2, a: 1 }), buatSign("K", "/p", { a: 1, b: 2 }));
uji("badan mengubah tanda tangan", buatSign("K", "/p", { a: 1 }, "{}") === buatSign("K", "/p", { a: 1 }), false);
const q = queryBertanda(KRED, "/authorization/202309/shops", {}, undefined, 1234567890);
uji("queryBertanda: app_key, timestamp, sign", Object.keys(q).sort(), ["app_key", "sign", "timestamp"]);
uji("queryBertanda: sign sama dengan contoh", q.sign, "c8767e4fd7a1b48a0ce3fd23197f058159ce11b53f1ae1ad6d1ec931a1da5540");

console.log("\nKlien — tanpa jaringan");
function tiruan(jawaban, status = 200) {
  const catat = [];
  const fetchImpl = async (url, init) => {
    catat.push({ url: new URL(String(url)), init });
    return new Response(typeof jawaban === "string" ? jawaban : JSON.stringify(jawaban), { status });
  };
  return { catat, fetchImpl };
}

{
  const t = tiruan({ code: 0, message: "Success", request_id: "r1", data: { conversations: [] } });
  const hasil = await permintaanTiktok(
    { path: "/customer_service/202309/conversations", accessToken: "TOKEN-RAHASIA", shopCipher: "ROW_abc", query: { page_size: 20 } },
    { fetchImpl: t.fetchImpl, kredensial: KRED, sekarang: () => 1234567890 },
  );
  const { url, init } = t.catat[0];
  uji("code 0 -> data dikembalikan", hasil.data, { conversations: [] });
  uji("host Open API", url.origin, "https://open-api.tiktokglobalshop.com");
  uji("access token di header x-tts-access-token", init.headers["x-tts-access-token"], "TOKEN-RAHASIA");
  uji("access token TIDAK di query string", url.searchParams.has("access_token") || String(url).includes("TOKEN-RAHASIA"), false);
  uji("shop_cipher di query", url.searchParams.get("shop_cipher"), "ROW_abc");
  uji("app_secret TIDAK di URL Open API", String(url).includes(RAHASIA), false);
  uji(
    "sign di URL cocok dengan rumus",
    url.searchParams.get("sign"),
    buatSign(RAHASIA, "/customer_service/202309/conversations", {
      app_key: "123456",
      timestamp: 1234567890,
      shop_cipher: "ROW_abc",
      page_size: 20,
    }),
  );
}

{
  const t = tiruan({ code: 105002, message: "Expired credentials", request_id: "r2" });
  let galat = null;
  try {
    await permintaanTiktok({ path: "/x", accessToken: "TOKEN-RAHASIA" }, { fetchImpl: t.fetchImpl, kredensial: KRED });
  } catch (e) {
    galat = e;
  }
  uji("code bukan 0 -> GalatTiktok walau HTTP 200", galat instanceof GalatTiktok, true);
  uji("kode galat = code TikTok", galat?.kode, "105002");
  uji("request_id ikut", galat?.requestId, "r2");
  uji("pesan galat tanpa token/secret", /TOKEN-RAHASIA|abc000def111|sign=/.test(galat?.message ?? ""), false);
}

{
  const t = tiruan({ message: "tanpa code" });
  let galat = null;
  try {
    await permintaanTiktok({ path: "/x", accessToken: "a" }, { fetchImpl: t.fetchImpl, kredensial: KRED });
  } catch (e) {
    galat = e;
  }
  uji("amplop tanpa code dianggap galat", galat instanceof GalatTiktok, true);
}

{
  const t = tiruan("<html>bad gateway</html>", 502);
  let galat = null;
  try {
    await permintaanTiktok({ path: "/x", accessToken: "a" }, { fetchImpl: t.fetchImpl, kredensial: KRED });
  } catch (e) {
    galat = e;
  }
  uji("bukan JSON -> bukan_json", galat?.kode, "bukan_json");
}

{
  const t = tiruan({ code: 0, data: { access_token: "A" } });
  await mintaToken("/api/v2/token/get", { auth_code: "KODE", grant_type: "authorized_code" }, { fetchImpl: t.fetchImpl, kredensial: KRED });
  const { url, init } = t.catat[0];
  uji("token: host auth", url.origin, "https://auth.tiktok-shops.com");
  uji("token: GET", init.method, "GET");
  uji("token: grant_type persis authorized_code", url.searchParams.get("grant_type"), "authorized_code");
  uji("token: app_key & auth_code ikut", [url.searchParams.get("app_key"), url.searchParams.get("auth_code")], ["123456", "KODE"]);
}

{
  const t = tiruan({ code: 36004004, message: "Invalid auth code" });
  let galat = null;
  try {
    await mintaToken("/api/v2/token/get", { auth_code: "KODE", grant_type: "authorized_code" }, { fetchImpl: t.fetchImpl, kredensial: KRED });
  } catch (e) {
    galat = e;
  }
  uji("token: galat tidak memuat app_secret", (galat?.message ?? "").includes(RAHASIA), false);
  uji("token: kode 36004004 diteruskan", galat?.kode, "36004004");
}

console.log("\nAturan");
const SEKARANG = 1_800_000_000;
uji("epoch dipakai apa adanya", epochKeTanggal(1_900_000_000, SEKARANG).toISOString(), new Date(1_900_000_000_000).toISOString());
uji("nilai rusak -> 7 hari dari sekarang", epochKeTanggal(undefined, SEKARANG).getTime(), (SEKARANG + 7 * 86400) * 1000);
uji("durasi kecil bukan epoch -> cadangan", epochKeTanggal(604800, SEKARANG, 60).getTime(), (SEKARANG + 60) * 1000);

uji(
  "tokoSah membuang toko tanpa id/cipher",
  tokoSah([{ id: "1", cipher: "C1" }, { id: "2" }, { cipher: "C3" }, { id: " ", cipher: "C4" }]).map((t) => t.id),
  ["1"],
);
uji("tokoSah: id angka dinormalkan", tokoSah([{ id: 7, cipher: "C" }]).map((t) => t.id), ["7"]);
uji("tokoSah: bukan larik -> kosong", tokoSah(undefined), []);

uji("pembeliDari", pembeliDari([{ role: "SHOP", nickname: "Toko" }, { role: "BUYER", nickname: "Budi" }])?.nickname, "Budi");
uji("pembeliDari: tanpa pembeli", pembeliDari([{ role: "SHOP" }]), null);

uji("teks: TEXT", teksPesan({ type: "TEXT", content: '{"content":"Halo kak"}' }), "Halo kak");
uji("teks: IMAGE", teksPesan({ type: "IMAGE", content: '{"url":"x"}' }), "[Gambar]");
uji("teks: ORDER_CARD", teksPesan({ type: "ORDER_CARD", content: '{"order_id":"576"}' }), "[Kartu pesanan 576]");
uji("teks: ORDER_CARD tanpa id", teksPesan({ type: "ORDER_CARD", content: "{}" }), "[Kartu pesanan]");
uji("teks: JSON rusak tidak melempar", teksPesan({ type: "TEXT", content: "{rusak" }), "{rusak");
uji("teks: tipe asing", teksPesan({ type: "BARU", content: "{}" }), "[BARU]");

console.log("\nPemeta chat -> conversations");
const pesanPembeli = { id: "m1", type: "TEXT", content: '{"content":"halo kak"}', create_time: 1_800_000_000, is_visible: true, sender: { role: "BUYER" } };
const pesanRobot = { id: "m2", type: "TEXT", content: '{"content":"Obrolan dialihkan"}', create_time: 1_800_000_060, is_visible: true, sender: { role: "ROBOT" } };
uji("BUYER -> user", pesanKeChat(pesanPembeli)?.role, "user");
uji("ROBOT -> cs (bukan assistant)", pesanKeChat(pesanRobot)?.role, "cs");
uji("SHOP -> cs", pesanKeChat({ ...pesanPembeli, sender: { role: "SHOP" } })?.role, "cs");
uji("isi & waktu", [pesanKeChat(pesanPembeli)?.content, pesanKeChat(pesanPembeli)?.timestamp], ["halo kak", new Date(1_800_000_000_000).toISOString()]);
uji("idEksternal dibawa", pesanKeChat(pesanPembeli)?.idEksternal, "m1");
uji("is_visible false dibuang", pesanKeChat({ ...pesanPembeli, is_visible: false }), null);
uji("tanpa id dibuang", pesanKeChat({ ...pesanPembeli, id: undefined }), null);
uji(
  "IMAGE -> lampiran gambar",
  pesanKeChat({ id: "m3", type: "IMAGE", content: '{"url":"https://x/y.jpg"}', create_time: 1, sender: { role: "BUYER" } })?.lampiran,
  [{ url: "https://x/y.jpg", jenis: "gambar" }],
);
uji(
  "IMAGE tanpa url http -> tanpa lampiran",
  pesanKeChat({ id: "m4", type: "IMAGE", content: '{"url":"javascript:1"}', create_time: 1, sender: { role: "BUYER" } })?.lampiran,
  undefined,
);

const a = { role: "user", content: "lama", timestamp: "2027-01-15T08:00:00.000Z", idEksternal: "a" };
const b1 = { role: "cs", content: "versi lama", timestamp: "2027-01-15T08:01:00.000Z", idEksternal: "b" };
const b2 = { ...b1, content: "versi baru" };
const c = { role: "user", content: "baru", timestamp: "2027-01-15T08:02:00.000Z", idEksternal: "c" };
const lokal = { role: "cs", content: "catatan lokal", timestamp: "2027-01-15T08:01:30.000Z" };
uji("gabung: tidak menggandakan id yang sama", gabungPesan([a, b1], [b2, c]).map((m) => m.content), ["lama", "versi baru", "baru"]);
uji("gabung: pesan lama di luar halaman dipertahankan", gabungPesan([a], [c]).map((m) => m.idEksternal), ["a", "c"]);
uji("gabung: catatan tanpa id dipertahankan & urut waktu", gabungPesan([a, lokal], [c]).map((m) => m.content), ["lama", "catatan lokal", "baru"]);
uji("gabung: masukan tidak berurutan diurutkan", gabungPesan([], [c, a]).map((m) => m.idEksternal), ["a", "c"]);
uji("gabung dua kali = sama (idempoten)", gabungPesan(gabungPesan([a], [b2, c]), [b2, c]).length, 3);

uji("sudahTersambung: ya", sudahTersambung([{ id: "x" }, { id: "b" }], new Set(["b"])), true);
uji("sudahTersambung: tidak", sudahTersambung([{ id: "x" }], new Set(["b"])), false);

console.log(`\n${lulus} lulus, ${gagal} gagal\n`);
process.exit(gagal === 0 ? 0 : 1);
