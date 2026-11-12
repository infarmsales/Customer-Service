/* ===========================================================
   Uji daftar toko panel Chat (lib/tokoChat.ts).

     npm run uji-toko-chat

   Biaya Rp 0, tanpa jaringan, tanpa database.

   Yang paling penting dijaga:
   - chat pembeli ASLI tidak pernah hilang dari "Semua toko"
     (mis. toko asli bernama "…Test…" tidak dianggap toko uji);
   - data uji/simulasi/contoh tidak pernah ikut "Semua toko",
     termasuk simulasi yang memakai nama toko asli;
   - percakapan dari toko yang tidak ada di daftar tetap punya baris.
   =========================================================== */

const {
  tokoUji,
  susunTokoChat,
  jenisPercakapan,
  cocokPilihan,
  hitungPanel,
  tokoTampil,
  PILIH_SIMULASI,
  PILIH_CONTOH,
} = await import("../lib/tokoChat.ts");
const { SEMUA_TOKO } = await import("../lib/toko.ts");

let lulus = 0;
let gagal = 0;
function uji(nama, dapat, harap) {
  if (JSON.stringify(dapat) === JSON.stringify(harap)) {
    lulus++;
    console.log(`  v ${nama}`);
  } else {
    gagal++;
    console.log(`  X ${nama}\n      dapat: ${JSON.stringify(dapat)}\n      harap: ${JSON.stringify(harap)}`);
  }
}

/* ---------- contoh percakapan ---------- */
const asliShopee = { customer_id: "u1", shop_name: "infarmjakarta · Shopee", external_conversation_id: "c1", platform: "shopee" };
const asliShopee2 = { customer_id: "u2", shop_name: "INFARMJAKARTA · Shopee", external_conversation_id: "c2", platform: "shopee" };
const ujiTiktok = { customer_id: "t1", shop_name: "SANDBOX_ID7698393095713998598 · TikTok Shop", external_conversation_id: "c3", platform: "tiktok" };
const simulasiNamaAsli = { customer_id: "sim_abc", shop_name: "infarmjakarta · Shopee", external_conversation_id: null, platform: "shopee" };
const simulasiBerIdLuar = { customer_id: "sim_x", shop_name: "infarm · Shopee", external_conversation_id: "zzz", platform: "shopee" };
const contoh = { customer_id: "budi", shop_name: "infarm · Shopee", external_conversation_id: null, platform: "shopee" };
const contohIdKosong = { customer_id: "diky", shop_name: "infarm · Shopee", external_conversation_id: "", platform: "shopee" };
const asliTokoHilang = { customer_id: "u9", shop_name: "Toko Lama · TikTok Shop", external_conversation_id: "c9", platform: "tiktok" };
const asliTanpaCustomer = { customer_id: null, shop_name: "infarmjakarta · Shopee", external_conversation_id: "c10", platform: "shopee" };

console.log("\ntokoUji");
uji("nama SANDBOX_ID… = uji", tokoUji("SANDBOX_ID7698393095713998598"), true);
uji("huruf kecil 'sandbox' = uji", tokoUji("infarm sandbox shopee"), true);
uji("toko asli biasa bukan uji", tokoUji("infarmjakarta"), false);
uji("nama berisi 'Test' BUKAN uji (jangan sembunyikan pembeli asli)", tokoUji("Infarm Testing Kit"), false);
uji("nama berisi 'uji' BUKAN uji", tokoUji("Infarm Uji Tanah"), false);
uji("nama kosong bukan uji", tokoUji(""), false);

console.log("\njenisPercakapan");
uji("dari marketplace, toko asli = asli", jenisPercakapan(asliShopee), "asli");
uji("dari marketplace, toko sandbox = uji", jenisPercakapan(ujiTiktok), "uji");
uji("simulasi memakai nama toko asli tetap simulasi", jenisPercakapan(simulasiNamaAsli), "simulasi");
uji("sim_ menang walau ada id luar", jenisPercakapan(simulasiBerIdLuar), "simulasi");
uji("tanpa id luar = contoh", jenisPercakapan(contoh), "contoh");
uji("id luar string kosong = contoh", jenisPercakapan(contohIdKosong), "contoh");
uji("customer_id null + id luar = asli", jenisPercakapan(asliTanpaCustomer), "asli");
uji("shop_name kosong + id luar = asli (tidak dianggap uji)", jenisPercakapan({ external_conversation_id: "x", shop_name: null }), "asli");

console.log("\ncocokPilihan");
uji("Semua toko memuat asli", cocokPilihan(asliShopee, SEMUA_TOKO), true);
uji("Semua toko TIDAK memuat uji", cocokPilihan(ujiTiktok, SEMUA_TOKO), false);
uji("Semua toko TIDAK memuat simulasi", cocokPilihan(simulasiNamaAsli, SEMUA_TOKO), false);
uji("Semua toko TIDAK memuat contoh", cocokPilihan(contoh, SEMUA_TOKO), false);
uji("toko asli memuat chatnya", cocokPilihan(asliShopee, "infarmjakarta"), true);
uji("toko asli tidak peka huruf besar", cocokPilihan(asliShopee2, "infarmjakarta"), true);
uji("toko asli TIDAK memuat simulasi bernama sama", cocokPilihan(simulasiNamaAsli, "infarmjakarta"), false);
uji("toko asli 'infarm' TIDAK memuat data contoh 'infarm'", cocokPilihan(contoh, "infarm"), false);
uji("toko sandbox memuat chat ujinya", cocokPilihan(ujiTiktok, "SANDBOX_ID7698393095713998598"), true);
uji("pilihan Simulasi hanya simulasi", [asliShopee, ujiTiktok, simulasiNamaAsli, contoh].map((c) => cocokPilihan(c, PILIH_SIMULASI)), [false, false, true, false]);
uji("pilihan Data contoh hanya contoh", [asliShopee, ujiTiktok, simulasiNamaAsli, contoh].map((c) => cocokPilihan(c, PILIH_CONTOH)), [false, false, false, true]);

console.log("\nhitungPanel");
const semua = [asliShopee, asliShopee2, ujiTiktok, simulasiNamaAsli, simulasiBerIdLuar, contoh, contohIdKosong, asliTokoHilang];
const h = hitungPanel(semua);
uji("asli = 3", h.asli, 3);
uji("simulasi = 2", h.simulasi, 2);
uji("contoh = 2", h.contoh, 2);
uji("per toko: infarmjakarta = 2 (simulasi bernama sama tidak dihitung)", h.perToko.get("infarmjakarta"), 2);
uji("per toko: sandbox = 1", h.perToko.get("sandbox_id7698393095713998598"), 1);
uji("per toko: 'infarm' (hanya contoh/simulasi) tidak ada", h.perToko.has("infarm"), false);
uji("jumlah semua jenis = jumlah percakapan", h.asli + h.simulasi + h.contoh + 1, semua.length);

console.log("\nsusunTokoChat");
const api = [
  { platform: "tiktok", external_shop_id: "7698", shop_name: "SANDBOX_ID7698393095713998598", is_active: true },
  { platform: "shopee", external_shop_id: "654825025", shop_name: "infarmjakarta", is_active: true },
  { platform: "shopee", external_shop_id: "111", shop_name: "Infarm Sandbox Lama", is_active: false },
  { platform: "tiktok", external_shop_id: "222", shop_name: "Infarm Official", is_active: true },
  { platform: "shopee", external_shop_id: "333", shop_name: null, is_active: true },
  { platform: "shopee", external_shop_id: "444", shop_name: "  ", is_active: true },
  { platform: "tokopedia", external_shop_id: "555", shop_name: "Toko Asing", is_active: true },
  { platform: "shopee", external_shop_id: "666", shop_name: "INFARMJAKARTA", is_active: true },
  { platform: "shopee", external_shop_id: 777, shop_name: "", is_active: "true" },
];
const toko = susunTokoChat(api);
uji("urutan: asli dulu, uji di belakang; di dalamnya per platform", toko.map((t) => t.nama), [
  "infarmjakarta",
  "Shopee 333",
  "Shopee 444",
  "Shopee 777",
  "Infarm Official",
  "Infarm Sandbox Lama",
  "SANDBOX_ID7698393095713998598",
]);
uji("platform tidak dikenal dibuang", toko.some((t) => t.nama === "Toko Asing"), false);
uji("nama ganda (beda huruf) hanya sekali", toko.filter((t) => t.nama.toLowerCase() === "infarmjakarta").length, 1);
uji("is_active harus true persis ('true' string = nonaktif)", toko.find((t) => t.nama === "Shopee 777").aktif, false);
uji("toko sandbox ditandai uji", toko.filter((t) => t.uji).map((t) => t.nama), ["Infarm Sandbox Lama", "SANDBOX_ID7698393095713998598"]);
uji("baris kosong / bukan array aman", susunTokoChat([]), []);

console.log("\ntokoTampil");
const tampil = tokoTampil(toko, semua, h.perToko);
uji("toko nonaktif TANPA chat disembunyikan", tampil.some((t) => t.nama === "Infarm Sandbox Lama"), false);
uji("toko yang hilang dari tabel tapi punya chat asli tetap tampil", tampil.find((t) => t.nama === "Toko Lama"), {
  nama: "Toko Lama",
  platform: "tiktok",
  aktif: false,
  uji: false,
});
const tokoNonaktifBerchat = tokoTampil(
  [{ nama: "infarmjakarta", platform: "shopee", aktif: false, uji: false }],
  [asliShopee],
  hitungPanel([asliShopee]).perToko,
);
uji("toko nonaktif yang MASIH punya chat tetap tampil", tokoNonaktifBerchat.map((t) => t.nama), ["infarmjakarta"]);
uji(
  "simulasi/contoh tidak memunculkan toko karangan",
  tokoTampil([], [simulasiNamaAsli, contoh], hitungPanel([simulasiNamaAsli, contoh]).perToko),
  [],
);
uji(
  "chat uji dari toko sandbox yang tak terdaftar tampil sebagai uji",
  tokoTampil([], [ujiTiktok], hitungPanel([ujiTiktok]).perToko).map((t) => [t.nama, t.uji]),
  [["SANDBOX_ID7698393095713998598", true]],
);

console.log(`\n${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
