/* ===========================================================
   Pemeta pesanan Shopee -> internal, dan aturan sinkronisasi.

     npm run uji-shopee-pemeta

   Biaya Rp 0. Tidak ada jaringan, tidak ada Supabase, tidak ada env.

   YANG DIJAGA DI SINI

   1. Peta status: kedelapan nilai Shopee dari dokumentasi, dan nilai
      asing yang jatuh ke 'lainnya' TANPA kehilangan aslinya.
   2. Bentuk baris: contoh dari dokumentasi get_order_detail dipetakan
      ke baris orders yang bisa langsung di-upsert.
   3. PAGAR DATA PRIBADI: daftar field yang diminta dari Shopee tidak
      pernah memuat alamat, telepon, atau CPF — dan pemeta tidak punya
      tempat untuk menaruhnya sekalipun datang.
   4. Pemecahan rentang 14 hari dan titik mulai dengan tumpang tindih.
   =========================================================== */

import {
  PETA_STATUS_SHOPEE,
  epochKeIso,
  petakanItemShopee,
  petakanPesananShopee,
  petakanStatusShopee,
} from "../lib/marketplace/pemetaPesanan.ts";
import { SEMUA_STATUS_INTERNAL } from "../lib/marketplace/tipe.ts";
import {
  FIELD_OPSIONAL_DETAIL,
  HARI_PERTAMA_KALI,
  MAKS_DETAIL_PER_PANGGILAN,
  MAKS_HARI_PER_PANGGILAN,
  TUMPANG_TINDIH_DETIK,
  bagi,
  pecahRentang,
  titikMulai,
} from "../lib/shopee/sinkronAturan.ts";

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

console.log("\nPeta status — dari dokumentasi get_order_list");
{
  const harap = {
    UNPAID: "menunggu_pembayaran",
    READY_TO_SHIP: "perlu_dikirim",
    PROCESSED: "diproses",
    SHIPPED: "dalam_pengiriman",
    COMPLETED: "selesai",
    IN_CANCEL: "proses_batal",
    CANCELLED: "dibatalkan",
    INVOICE_PENDING: "menunggu_invoice",
  };
  for (const [k, v] of Object.entries(harap)) uji(`${k} -> ${v}`, petakanStatusShopee(k).status, v);
  /* Tambahan 12 Nov 2026 — muncul di get_order_detail toko asli. */
  uji("TO_CONFIRM_RECEIVE -> menunggu_konfirmasi (BUKAN selesai)", petakanStatusShopee("TO_CONFIRM_RECEIVE").status, "menunggu_konfirmasi");
  uji("RETRY_SHIP -> perlu_dikirim", petakanStatusShopee("RETRY_SHIP").status, "perlu_dikirim");
  uji("TO_RETURN -> pengembalian (BUKAN dibatalkan/lainnya)", petakanStatusShopee("TO_RETURN").status, "pengembalian");
  uji("TO_RETURN tetap menyimpan aslinya", petakanStatusShopee("TO_RETURN").raw_status, "TO_RETURN");
  {
    /* CHECK di migrasi terbaru harus memuat PERSIS kosakata internal —
       kalau tidak, upsert ditolak database dan sinkron gagal diam-diam. */
    const fs = await import("node:fs");
    const sql = fs.readFileSync(new URL("../../supabase/migrations/20261112130000_status_shopee_tambahan.sql", import.meta.url), "utf8");
    const blok = sql.match(/add constraint orders_status_check check \(status in \(([\s\S]*?)\)\)/);
    const diSql = blok ? [...blok[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort() : [];
    uji("CHECK migrasi = SEMUA_STATUS_INTERNAL", diSql, [...SEMUA_STATUS_INTERNAL].sort());
    const diUpdate = [...sql.matchAll(/when '([A-Z_]+)'\s+then '([a-z_]+)'/g)].map((m) => [m[1], m[2]]);
    uji(
      "perbaikan data lama di migrasi = peta di kode",
      diUpdate.every(([shopee, internal]) => PETA_STATUS_SHOPEE[shopee] === internal) && diUpdate.length === 3,
      true,
    );
  }
  uji("aslinya tersimpan di raw_status", petakanStatusShopee("SHIPPED").raw_status, "SHIPPED");
  uji("status asing -> lainnya", petakanStatusShopee("PENDING").status, "lainnya");
  uji("status asing tetap menyimpan aslinya", petakanStatusShopee("PENDING").raw_status, "PENDING");
  uji("huruf kecil TIDAK dikenali (Shopee selalu kapital)", petakanStatusShopee("shipped").status, "lainnya");
  uji("kosong -> lainnya, raw null", petakanStatusShopee(""), { status: "lainnya", raw_status: null });
  uji("undefined -> lainnya", petakanStatusShopee(undefined).status, "lainnya");
  /* Setiap nilai di peta harus ada di CHECK database. */
  uji(
    "semua hasil peta termasuk kosakata CHECK orders.status",
    Object.values(PETA_STATUS_SHOPEE).every((s) => SEMUA_STATUS_INTERNAL.includes(s)),
    true,
  );
}

console.log("\nepochKeIso");
{
  uji("1607930885 (contoh dokumentasi)", epochKeIso(1607930885), "2020-12-14T07:28:05.000Z");
  uji("0 -> null, bukan 1970", epochKeIso(0), null);
  uji("negatif -> null", epochKeIso(-5), null);
  uji("undefined -> null", epochKeIso(undefined), null);
  uji("NaN -> null", epochKeIso(Number.NaN), null);
}

console.log("\nPemetaan satu pesanan — contoh dari dokumentasi get_order_detail");
{
  /* Disusun dari nilai contoh di halaman dokumentasi, termasuk
     recipient_address yang SENGAJA ikut — untuk membuktikan pemeta
     tidak menyentuhnya sekalipun datang. */
  const contoh = {
    order_sn: "2404098R48U37H",
    region: "VN",
    currency: "VND",
    cod: false,
    total_amount: 1004.0,
    order_status: "CANCELLED",
    shipping_carrier: "Standard Delivery",
    create_time: 1607930885,
    update_time: 1608134691,
    ship_by_date: 1608103685,
    buyer_user_id: 1170319091,
    buyer_username: "xt4fdsf96j",
    recipient_address: { name: "Max", phone: "3828203", full_address: "C-15-14 BLOK C" },
    item_list: [
      {
        item_id: 2600144043,
        item_name: "backpack",
        item_sku: "sku",
        model_id: 0,
        model_name: "",
        model_sku: "",
        model_quantity_purchased: 1,
        model_original_price: 1000.0,
        model_discounted_price: 900.0,
        image_info: { image_url: "https://cf.shopee.vn/file/abc" },
      },
    ],
  };
  const b = petakanPesananShopee(contoh, "uuid-toko-1");

  uji("platform", b.platform, "shopee");
  uji("shop_id = uuid baris toko, bukan shop_id Shopee", b.shop_id, "uuid-toko-1");
  uji("external_order_id = order_sn", b.external_order_id, "2404098R48U37H");
  uji("status internal", b.status, "dibatalkan");
  uji("raw_status", b.raw_status, "CANCELLED");
  uji("buyer_user_id int64 -> teks", b.buyer_user_id, "1170319091");
  uji("buyer_username", b.buyer_username, "xt4fdsf96j");
  uji("total_amount", b.total_amount, 1004);
  uji("currency", b.currency, "VND");
  uji("shipping_carrier", b.shipping_carrier, "Standard Delivery");
  uji("tracking_number null — tidak ada di get_order_detail", b.tracking_number, null);
  uji("ship_by_date ISO", b.ship_by_date, "2020-12-16T07:28:05.000Z");
  uji("order_created_at ISO", b.order_created_at, "2020-12-14T07:28:05.000Z");
  uji("order_updated_at ISO", b.order_updated_at, "2020-12-16T16:04:51.000Z");
  uji("satu barang", b.items.length, 1);
  uji("barang: nama", b.items[0].nama, "backpack");
  uji("barang: sku jatuh ke item_sku bila model_sku kosong", b.items[0].sku, "sku");
  uji("barang: varian kosong -> null", b.items[0].varian, null);
  uji("barang: qty", b.items[0].qty, 1);
  uji("barang: harga = harga diskon", b.items[0].harga, 900);
  uji("barang: gambar", b.items[0].gambar, "https://cf.shopee.vn/file/abc");

  /* Pagar data pribadi — pemeta tidak punya tempat untuk ini. */
  const teks = JSON.stringify(b);
  uji("tidak ada 'recipient' di baris", teks.includes("recipient"), false);
  uji("tidak ada telepon pembeli di baris", teks.includes("3828203"), false);
  uji("tidak ada alamat pembeli di baris", teks.includes("BLOK C"), false);
  uji("tidak ada nama penerima di baris", teks.includes("Max"), false);
}

console.log("\nPemetaan — nilai yang hilang");
{
  const b = petakanPesananShopee({ order_sn: "X1" }, "u");
  uji("tanpa status -> lainnya", b.status, "lainnya");
  uji("tanpa total (belum bayar) -> null", b.total_amount, null);
  uji("tanpa buyer_user_id -> null", b.buyer_user_id, null);
  uji("tanpa buyer_username -> null", b.buyer_username, null);
  uji("tanpa item_list -> []", b.items, []);
  uji("tanpa tanggal -> null", b.order_created_at, null);
  uji("buyer_user_id 0 -> '0' (id sah, bukan kosong)", petakanPesananShopee({ order_sn: "X", buyer_user_id: 0 }, "u").buyer_user_id, "0");
  uji("item tanpa nama -> placeholder", petakanItemShopee({}).nama, "(tanpa nama)");
  uji("item tanpa qty -> 0", petakanItemShopee({}).qty, 0);
  uji("item: model_sku menang atas item_sku", petakanItemShopee({ item_sku: "A", model_sku: "A-M" }).sku, "A-M");
}

console.log("\nPAGAR DATA PRIBADI — field yang diminta dari Shopee");
{
  uji("buyer_user_id diminta", FIELD_OPSIONAL_DETAIL.includes("buyer_user_id"), true);
  uji("buyer_username diminta", FIELD_OPSIONAL_DETAIL.includes("buyer_username"), true);
  uji("item_list diminta", FIELD_OPSIONAL_DETAIL.includes("item_list"), true);
  uji("total_amount diminta", FIELD_OPSIONAL_DETAIL.includes("total_amount"), true);
  uji("recipient_address TIDAK diminta", FIELD_OPSIONAL_DETAIL.includes("recipient_address"), false);
  uji("dropshipper_phone TIDAK diminta", FIELD_OPSIONAL_DETAIL.includes("dropshipper_phone"), false);
  uji("buyer_cpf_id TIDAK diminta", FIELD_OPSIONAL_DETAIL.includes("buyer_cpf_id"), false);
  uji("invoice_data TIDAK diminta", FIELD_OPSIONAL_DETAIL.includes("invoice_data"), false);
}

console.log("\npecahRentang — batas 15 hari Shopee");
{
  const H = 86_400;
  const T0 = 1_700_000_000;
  uji("1 hari -> 1 potongan", pecahRentang(T0, T0 + H).length, 1);
  uji("14 hari tepat -> 1 potongan", pecahRentang(T0, T0 + 14 * H).length, 1);
  uji("15 hari -> 2 potongan", pecahRentang(T0, T0 + 15 * H).length, 2);
  const tiga = pecahRentang(T0, T0 + 30 * H);
  uji("30 hari -> 3 potongan (14,14,2)", tiga.map((r) => (r.sampai - r.dari) / H), [14, 14, 2]);
  uji("potongan bersambung tanpa celah", tiga[0].sampai === tiga[1].dari && tiga[1].sampai === tiga[2].dari, true);
  uji("ujungnya tepat", [tiga[0].dari, tiga[2].sampai], [T0, T0 + 30 * H]);
  uji("tidak ada potongan > batas", tiga.every((r) => r.sampai - r.dari <= MAKS_HARI_PER_PANGGILAN * H), true);
  uji("rentang terbalik -> []", pecahRentang(T0 + H, T0), []);
  uji("rentang kosong -> []", pecahRentang(T0, T0), []);
  uji("NaN -> []", pecahRentang(Number.NaN, T0), []);
  uji("batas 14 < 15 Shopee", MAKS_HARI_PER_PANGGILAN < 15, true);
}

console.log("\ntitikMulai");
{
  const KINI = 1_700_000_000;
  uji("belum pernah -> 1 hari ke belakang", titikMulai(null, KINI), KINI - HARI_PERTAMA_KALI * 86_400);
  uji("undefined -> 1 hari ke belakang", titikMulai(undefined, KINI), KINI - 86_400);
  uji("rusak -> 1 hari ke belakang", titikMulai("kemarin", KINI), KINI - 86_400);
  const terakhir = new Date((KINI - 3600) * 1000).toISOString();
  uji("ada -> terakhir dikurangi tumpang tindih", titikMulai(terakhir, KINI), KINI - 3600 - TUMPANG_TINDIH_DETIK);
  const masaDepan = new Date((KINI + 99_999) * 1000).toISOString();
  uji("masa depan -> dijepit ke sekarang (jendela tidak kosong selamanya)", titikMulai(masaDepan, KINI), KINI - TUMPANG_TINDIH_DETIK);
  uji("tumpang tindih 5 menit", TUMPANG_TINDIH_DETIK, 300);
}

console.log("\nbagi — batas 50 order_sn per get_order_detail");
{
  const seratusDuaPuluh = Array.from({ length: 120 }, (_, i) => `sn${i}`);
  uji("120 -> [50,50,20]", bagi(seratusDuaPuluh, MAKS_DETAIL_PER_PANGGILAN).map((p) => p.length), [50, 50, 20]);
  uji("kosong -> []", bagi([], 50), []);
  uji("n <= 0 -> satu potongan", bagi([1, 2, 3], 0).length, 1);
  uji("urutan terjaga", bagi([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  uji("batas 50 sesuai dokumentasi", MAKS_DETAIL_PER_PANGGILAN, 50);
}

console.log(`\n${"-".repeat(52)}`);
console.log(`Pemeta & sinkron Shopee : ${gagal === 0 ? "LULUS" : "GAGAL"} ${lulus}/${lulus + gagal}`);

if (gagal > 0) {
  console.error(`\n${gagal} kasus gagal.`);
  process.exit(1);
}
console.log("\nSemua kasus lulus");
