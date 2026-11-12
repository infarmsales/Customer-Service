/* ===========================================================
   Uji aturan tab "Daftar Pesanan" (lib/daftarPesanan.ts).

     npm run uji-daftar-pesanan

   Biaya Rp 0, tanpa jaringan, tanpa database.

   Yang paling penting dijaga: tidak ada pesanan yang bisa "hilang"
   dari layar — status asing tetap punya chip, toko tak dikenal tetap
   punya pilihan, dan nomor bertanda baca tetap ketemu.
   =========================================================== */

const {
  saringPesanan,
  saringTanpaStatus,
  chipStatus,
  jenisPill,
  ringkasBarang,
  namaToko,
  tokoBelumDisinkron,
  pilihanToko,
  SARINGAN_AWAL,
} = await import("../lib/daftarPesanan.ts");

let lulus = 0;
let gagal = 0;
function uji(nama, dapat, harap) {
  if (JSON.stringify(dapat) === JSON.stringify(harap)) {
    lulus++;
    console.log(`  v ${nama}`);
  } else {
    gagal++;
    console.log(`  X ${nama}`);
    console.log(`      harap : ${JSON.stringify(harap)}`);
    console.log(`      dapat : ${JSON.stringify(dapat)}`);
  }
}

const p = (o) => ({
  id: o.id,
  platform: "shopee",
  shop_id: o.shop ?? "A",
  external_order_id: o.sn ?? o.id,
  status: o.status ?? "perlu_dikirim",
  raw_status: null,
  buyer_username: o.buyer ?? null,
  total_amount: 10000,
  currency: "IDR",
  shipping_carrier: null,
  tracking_number: o.resi ?? null,
  items: o.items ?? [],
  ship_by_date: null,
  order_created_at: null,
  order_updated_at: null,
  synced_at: null,
});

const daftar = [
  p({ id: "1", sn: "241015ABCDEF", shop: "A", status: "perlu_dikirim", buyer: "budi_tani", items: [{ nama: "POC Buah", qty: 2 }] }),
  p({ id: "2", sn: "241015XYZ123", shop: "A", status: "selesai", resi: "SPXID0123456789", items: [{ nama: "Pupuk Daun", qty: 1 }, { nama: "Benih Cabai", qty: 1 }] }),
  p({ id: "3", sn: "241016QQQ999", shop: "B", status: "dibatalkan", buyer: "Sari, Kebun" }),
  p({ id: "4", sn: "241016ZZZ000", shop: "B", status: "status_baru_shopee" }),
  p({ id: "5", sn: "241017LOST01", shop: "C", status: "selesai" }),
];
const ids = (r) => r.map((x) => x.id);

console.log("\nSaringan dasar");
uji("saringan awal = semua baris", ids(saringPesanan(daftar, SARINGAN_AWAL)), ["1", "2", "3", "4", "5"]);
uji("saring toko B", ids(saringPesanan(daftar, { ...SARINGAN_AWAL, toko: "B" })), ["3", "4"]);
uji("saring status selesai", ids(saringPesanan(daftar, { ...SARINGAN_AWAL, status: "selesai" })), ["2", "5"]);
uji("toko + status", ids(saringPesanan(daftar, { toko: "A", status: "selesai", cari: "" })), ["2"]);

console.log("\nPencarian");
uji("nomor bertanda baca tetap ketemu", ids(saringPesanan(daftar, { ...SARINGAN_AWAL, cari: "2410 15abc-def" })), ["1"]);
uji("potongan nomor", ids(saringPesanan(daftar, { ...SARINGAN_AWAL, cari: "XYZ" })), ["2"]);
uji("nomor resi", ids(saringPesanan(daftar, { ...SARINGAN_AWAL, cari: "spxid 0123" })), ["2"]);
uji("nama pembeli dengan koma", ids(saringPesanan(daftar, { ...SARINGAN_AWAL, cari: "sari, keb" })), ["3"]);
uji("nama produk (bukan barang pertama)", ids(saringPesanan(daftar, { ...SARINGAN_AWAL, cari: "benih" })), ["2"]);
uji("spasi saja = tidak menyaring", ids(saringPesanan(daftar, { ...SARINGAN_AWAL, cari: "   " })).length, 5);
uji("tidak ada yang cocok", ids(saringPesanan(daftar, { ...SARINGAN_AWAL, cari: "tidakada" })), []);
uji("tanda baca saja tidak mencocokkan semua nomor", ids(saringPesanan(daftar, { ...SARINGAN_AWAL, cari: "-" })), []);

console.log("\nChip status");
const chip = chipStatus(saringTanpaStatus(daftar, SARINGAN_AWAL));
uji("chip pertama = Semua dengan total", chip[0], { value: "semua", label: "Semua", count: 5 });
uji(
  "urut kosakata, hanya yang punya pesanan",
  chip.slice(1).map((c) => c.value),
  ["perlu_dikirim", "selesai", "dibatalkan", "status_baru_shopee"],
);
uji("status asing tetap punya chip", chip.find((c) => c.value === "status_baru_shopee")?.count, 1);
uji("hitungan selesai", chip.find((c) => c.value === "selesai")?.count, 2);
uji(
  "chip mengikuti toko yang dipilih",
  chipStatus(saringTanpaStatus(daftar, { ...SARINGAN_AWAL, toko: "A" })).map((c) => [c.value, c.count]),
  [["semua", 2], ["perlu_dikirim", 1], ["selesai", 1]],
);
uji(
  "chip tidak ikut tersaring oleh status aktif",
  chipStatus(saringTanpaStatus(daftar, { ...SARINGAN_AWAL, status: "selesai" }))[0].count,
  5,
);
uji("daftar kosong = hanya chip Semua 0", chipStatus([]), [{ value: "semua", label: "Semua", count: 0 }]);

console.log("\nPill");
uji("selesai -> done", jenisPill("selesai"), "done");
uji("dibatalkan -> cancel", jenisPill("dibatalkan"), "cancel");
uji("proses_batal -> cancel", jenisPill("proses_batal"), "cancel");
uji("perlu_dikirim -> wait", jenisPill("perlu_dikirim"), "wait");
uji("dalam_pengiriman -> cont", jenisPill("dalam_pengiriman"), "cont");
uji("status asing tetap punya warna", jenisPill("xyz"), "refund");

console.log("\nRingkasan barang");
uji("satu barang qty 2", ringkasBarang([{ nama: "POC Buah", qty: 2 }]), "POC Buah ×2");
uji("qty 1 tanpa ×", ringkasBarang([{ nama: "POC Buah", qty: 1 }]), "POC Buah");
uji("banyak barang", ringkasBarang([{ nama: "A", qty: 1 }, { nama: "B", qty: 1 }, { nama: "C", qty: 3 }]), "A · +2 produk");
uji("kosong", ringkasBarang([]), "—");
uji("null", ringkasBarang(null), "—");
uji("nama kosong dilewati", ringkasBarang([{ nama: "  ", qty: 1 }, { nama: "B", qty: 1 }]), "B");

console.log("\nToko");
const toko = [
  { id: "A", nama: "Infarm Kecil", platform: "shopee", aktif: true, sinkron: true },
  { id: "B", nama: "OpenSANDBOX", platform: "shopee", aktif: false, sinkron: true },
  { id: "D", nama: "Toko Besar", platform: "shopee", aktif: true, sinkron: false },
];
uji("nama toko dikenal", namaToko("A", toko), "Infarm Kecil");
uji("toko tak dikenal tidak dikosongkan", namaToko("C", toko), "Toko tidak dikenal");
uji(
  "pilihan: punya pesanan atau aktif, plus yang tak dikenal",
  pilihanToko(daftar, toko).map((o) => o.value),
  ["semua", "A", "B", "D", "C"],
);
uji("toko nonaktif ditandai", pilihanToko(daftar, toko).find((o) => o.value === "B")?.label, "OpenSANDBOX · shopee (nonaktif)");
uji(
  "toko nonaktif tanpa pesanan tidak muncul",
  pilihanToko([], [{ id: "X", nama: "Lama", platform: "shopee", aktif: false, sinkron: false }]).map((o) => o.value),
  ["semua"],
);

console.log("\nToko yang belum disinkronkan (toko besar yang baru diotorisasi)");
uji(
  "toko belum disinkron diberi keterangan",
  pilihanToko(daftar, toko).find((o) => o.value === "D")?.label,
  "Toko Besar · shopee — pesanan belum disinkronkan",
);
uji("toko tersinkron tanpa keterangan", pilihanToko(daftar, toko).find((o) => o.value === "A")?.label, "Infarm Kecil · shopee");
uji("pilih toko belum disinkron -> peringatan", tokoBelumDisinkron("D", toko)?.nama, "Toko Besar");
uji("pilih toko tersinkron -> tanpa peringatan", tokoBelumDisinkron("A", toko), null);
uji("pilih semua -> tanpa peringatan", tokoBelumDisinkron("semua", toko), null);
uji("toko tak dikenal -> tanpa peringatan palsu", tokoBelumDisinkron("C", toko), null);

console.log(`\nDaftar Pesanan : ${gagal === 0 ? "LULUS" : "GAGAL"} ${lulus}/${lulus + gagal}`);
process.exit(gagal === 0 ? 0 : 1);
