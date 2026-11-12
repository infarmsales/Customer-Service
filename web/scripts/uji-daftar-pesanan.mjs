/* ===========================================================
   Uji aturan tab "Daftar Pesanan" (lib/daftarPesanan.ts).

     npm run uji-daftar-pesanan

   Biaya Rp 0, tanpa jaringan, tanpa database.

   Yang paling penting dijaga: tidak ada pesanan yang bisa "hilang"
   dari layar — status asing tetap punya chip, toko tak dikenal tetap
   punya pilihan, dan nomor bertanda baca tetap ketemu.
   =========================================================== */

import fs from "node:fs";

const {
  kunciCari,
  rentangHalaman,
  halamanAman,
  jumlahHalaman,
  teksRentang,
  nomorHalaman,
  chipDariHitungan,
  angka,
  PER_HALAMAN,
  jenisPill,
  ringkasBarang,
  namaToko,
  tokoBelumDisinkron,
  pilihanToko,
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

/* ---------- Pencarian di database (kolom orders.cari_teks) ----------
   Postgres yang menyaring; di sini kolomnya DITIRU persis seperti
   ekspresi GENERATED di migrasi 20261112130000, lalu dicocokkan dengan
   ilike '%pola%'. Gunanya: kasus pencarian lama (sebelum paginasi)
   tetap terbukti menemukan baris yang sama. */
const cariTeks = (r) =>
  (
    (r.external_order_id ?? "") + " " +
    (r.tracking_number ?? "") + " " +
    (r.buyer_username ?? "") + " " +
    JSON.stringify((r.items ?? []).map((i) => i.nama))
  )
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
const cariDb = (q) => {
  const pola = kunciCari(q);
  if (pola === null) return ids(daftar);
  if (pola === "") return [];
  return ids(daftar.filter((r) => cariTeks(r).includes(pola)));
};

console.log("\nKunci cari (dikirim ke database)");
uji("kosong -> tidak menyaring", kunciCari(""), null);
uji("spasi saja -> tidak menyaring", kunciCari("   "), null);
uji("tanda baca saja -> tidak ada yang cocok (BUKAN semua)", kunciCari(" - , "), "");
uji("nomor bertanda baca dinormalkan", kunciCari("2410 15abc-DEF"), "241015abcdef");
uji("hasil hanya [a-z0-9] (aman untuk filter PostgREST & ILIKE)", /^[a-z0-9]*$/.test(kunciCari("100% a_b,c.(d)*")), true);
uji("% dan _ tidak lolos sebagai wildcard", kunciCari("%_%"), "");

console.log("\nPencarian (tiruan kolom database)");
uji("nomor bertanda baca tetap ketemu", cariDb("2410 15abc-def"), ["1"]);
uji("potongan nomor", cariDb("XYZ"), ["2"]);
uji("nomor resi", cariDb("spxid 0123"), ["2"]);
uji("nama pembeli dengan koma", cariDb("sari, keb"), ["3"]);
uji("nama produk (bukan barang pertama)", cariDb("benih"), ["2"]);
uji("nama produk dua kata", cariDb("pupuk daun"), ["2"]);
uji("akun pembeli bergaris bawah", cariDb("budi_tani"), ["1"]);
uji("spasi saja = tidak menyaring", cariDb("   ").length, 5);
uji("tidak ada yang cocok", cariDb("tidakada"), []);
uji("tanda baca saja tidak mencocokkan semua nomor", cariDb("-"), []);
uji(
  "ekspresi di migrasi = tiruan di uji ini (tiga kolom + nama produk, tanpa tanda baca)",
  (() => {
    const sql = fs.readFileSync(
      new URL("../../supabase/migrations/20261112130000_status_shopee_tambahan.sql", import.meta.url),
      "utf8",
    );
    return (
      /coalesce\(external_order_id, ''\)/.test(sql) &&
      /coalesce\(tracking_number, ''\)/.test(sql) &&
      /coalesce\(buyer_username, ''\)/.test(sql) &&
      /jsonb_path_query_array\(items, '\$\[\*\]\.nama'\)/.test(sql) &&
      /'\[\^a-z0-9\]\+', '', 'g'/.test(sql) &&
      /lower\(/.test(sql)
    );
  })(),
  true,
);

console.log("\nPaginasi");
uji("PER_HALAMAN = 50", PER_HALAMAN, 50);
uji("halaman 1 -> 0..49", rentangHalaman(1), { dari: 0, sampai: 49 });
uji("halaman 3 -> 100..149", rentangHalaman(3), { dari: 100, sampai: 149 });
uji("halaman 0 / negatif / NaN -> 1", [halamanAman(0), halamanAman(-4), halamanAman(Number.NaN)], [1, 1, 1]);
uji("halaman pecahan dibulatkan ke bawah", halamanAman(2.7), 2);
uji("halaman melewati akhir dijepit ke halaman terakhir", halamanAman(999, 9005), 181);
uji("total belum terbaca -> halaman apa adanya", halamanAman(7, null), 7);
uji("9.005 pesanan = 181 halaman", jumlahHalaman(9005), 181);
uji("tepat 50 = 1 halaman", jumlahHalaman(50), 1);
uji("51 = 2 halaman", jumlahHalaman(51), 2);
uji("0 pesanan tetap 1 halaman (bukan 'dari 0')", jumlahHalaman(0), 1);
uji("total rusak -> 1 halaman", jumlahHalaman(Number.NaN), 1);
uji("teks halaman 1", teksRentang(1, 50, 9005), "Menampilkan 1–50 dari 9.005 pesanan");
uji("teks halaman terakhir yang tidak penuh", teksRentang(181, 5, 9005), "Menampilkan 9.001–9.005 dari 9.005 pesanan");
uji("teks tanpa total yang masuk akal", teksRentang(2, 50, null), "Menampilkan 51–100 pesanan");
uji("teks: total lebih kecil dari rentang tidak ditulis", teksRentang(2, 50, 60), "Menampilkan 51–100 pesanan");
uji("teks kosong -> null", teksRentang(1, 0, 0), null);
uji("ribuan pakai titik", angka(1234567), "1.234.567");

console.log("\nTombol nomor halaman");
uji("sedikit halaman = semua tampil", nomorHalaman(2, 4), [1, 2, 3, 4]);
uji("tengah", nomorHalaman(50, 181), [1, "…", 48, 49, 50, 51, 52, "…", 181]);
uji("awal", nomorHalaman(1, 181), [1, 2, 3, "…", 181]);
uji("akhir", nomorHalaman(181, 181), [1, "…", 179, 180, 181]);
uji("dekat awal: 1 menyambung ke 2..6 tanpa …", nomorHalaman(4, 181), [1, 2, 3, 4, 5, 6, "…", 181]);
uji("satu halaman", nomorHalaman(1, 1), [1]);
uji("aktif di luar jangkauan dijepit", nomorHalaman(500, 3), [1, 2, 3]);

console.log("\nChip status dari hitungan database");
const hitung = { perlu_dikirim: 4, diproses: 425, selesai: 0, dibatalkan: 27, pengembalian: 3 };
uji("chip pertama = Semua dengan total", chipDariHitungan(hitung, 500)[0], { value: "semua", label: "Semua", count: 500 });
uji(
  "urut kosakata, hanya yang punya pesanan",
  chipDariHitungan(hitung, 500).slice(1).map((c) => c.value),
  ["perlu_dikirim", "diproses", "dibatalkan", "pengembalian"],
);
uji("status pengembalian punya label", chipDariHitungan(hitung, 500).find((c) => c.value === "pengembalian")?.label, "Pengembalian / retur");
uji(
  "status yang SEDANG dipilih tetap tampil walau nol",
  chipDariHitungan(hitung, 500, "selesai").map((c) => c.value).includes("selesai"),
  true,
);
uji("hitungan kosong = hanya chip Semua", chipDariHitungan({}, 0), [{ value: "semua", label: "Semua", count: 0 }]);
uji("kunci asing di hitungan diabaikan", chipDariHitungan({ xyz: 5 }, 5).length, 1);

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
  "toko yang belum pernah disinkron diberi keterangan",
  pilihanToko(daftar, toko).find((o) => o.value === "D")?.label,
  "Toko Besar · shopee — belum pernah disinkronkan",
);
uji("toko tersinkron tanpa keterangan", pilihanToko(daftar, toko).find((o) => o.value === "A")?.label, "Infarm Kecil · shopee");
uji("pilih toko belum disinkron -> peringatan", tokoBelumDisinkron("D", toko)?.nama, "Toko Besar");
uji("pilih toko tersinkron -> tanpa peringatan", tokoBelumDisinkron("A", toko), null);
uji("pilih semua -> tanpa peringatan", tokoBelumDisinkron("semua", toko), null);
uji("toko tak dikenal -> tanpa peringatan palsu", tokoBelumDisinkron("C", toko), null);

console.log("\nStatus baru (12 Nov 2026)");
uji("menunggu_konfirmasi -> cont", jenisPill("menunggu_konfirmasi"), "cont");
uji("pengembalian -> refund", jenisPill("pengembalian"), "refund");

console.log(`\nDaftar Pesanan : ${gagal === 0 ? "LULUS" : "GAGAL"} ${lulus}/${lulus + gagal}`);
process.exit(gagal === 0 ? 0 : 1);
