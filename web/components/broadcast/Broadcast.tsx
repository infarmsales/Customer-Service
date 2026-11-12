"use client";

/* ===========================================================
   Halaman Broadcast — port dari broadcast.html + broadcast.js.
   Step 11.

   Perilaku yang dipertahankan:
   - Tiga tab marketplace, tiap marketplace punya daftar sendiri.
   - Tombol "Tambah Tugas" mengganti daftar dengan form (bukan
     modal), persis showForm()/showList() versi lama.
   - "Bantu tulis (AI)" menyusun draf sesuai segmen yang dipilih
     — template-nya sama dengan GENERIC_TEMPLATES /
     BELUM_ORDER_TEMPLATES di broadcast.js.
   - Segmentasi Pelanggan (AI) dengan pencarian produk dari
     katalog (kini lewat /api/products, lihat lib/catalog.ts).

   Data tugas kini ada di store (lib/db/store.ts) supaya tugas
   yang dibuat saat demo tetap ada saat berpindah halaman —
   dulu hilang karena tiap halaman punya array sendiri.
   =========================================================== */

import { useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { DemoNotice, ScopeSelect, TableWrap, Td, Th } from "@/components/ui/Bits";
import {
  catalogStatusText,
  perkiraanPembeli,
  searchProducts,
  useCatalog,
} from "@/lib/catalog";
import { addBroadcastTask, useBroadcast } from "@/lib/db";
import type { BroadcastTask, Product } from "@/lib/db/types";
import { angka } from "@/lib/format";

type MpKey = "lazada" | "shopee" | "tiktok";

const MP: { key: MpKey; label: string }[] = [
  { key: "lazada", label: "Lazada" },
  { key: "shopee", label: "Shopee" },
  { key: "tiktok", label: "TikTok" },
];

const STATUS_LABEL: Record<BroadcastTask["status"], string> = {
  done: "Selesai",
  sending: "Sedang Dikirim",
  draft: "Draf",
};

const STATUS_DOT: Record<BroadcastTask["status"], string> = {
  done: "bg-green",
  sending: "bg-[#f59e0b]",
  draft: "bg-[#94a3b8]",
};

/* ---------------- Draf pesan AI (gaya claude.md) ---------------- */

const GENERIC_TEMPLATES = [
  "Halo, Kak 😊 Terima kasih sudah mampir ke toko Infarm. Lagi cari kebutuhan berkebun apa, Kak? minfarm bantu pilihkan yang paling cocok ya 🌱",
  "Hai, Kak! Kalau lagi mulai berkebun di rumah, benih & media tanam Infarm bisa jadi pilihan. Ada yang ingin ditanyakan dulu sebelum pesan, Kak? 🙏",
  "Halo, Kak 🌿 Pesanan sebelumnya semoga tumbuh subur ya. Kalau butuh nutrisi lanjutan atau bibit baru, minfarm siap bantu rekomendasikan yang sesuai kebutuhan Kakak.",
];

const BELUM_ORDER_TEMPLATES = [
  "Halo, Kak 👋 Kenalin, Infarm — perlengkapan berkebun & tanaman rumahan. Kalau lagi cari benih, pupuk, atau alat kebun, boleh mampir dulu ke toko kami ya, Kak 🌱",
  "Hai, Kak! Baru mulai hobi berkebun di rumah? Infarm siapin benih sayur & pupuk organik yang cocok buat pemula. Ada yang mau ditanyakan dulu, Kak?",
];

/* ---------------- Daftar tugas ---------------- */

function TaskList({
  mp,
  onAdd,
}: {
  mp: MpKey;
  onAdd: () => void;
}) {
  const broadcast = useBroadcast();
  const toast = useToast();
  const rows = broadcast[mp] ?? [];

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3.5 py-2.5 text-[0.82rem] text-[#92400e]">
        <span>
          ⚠️ Jumlah pembeli yang dapat dilayani melalui fitur Pesan Broadcast akan segera
          habis. Anda dapat{" "}
          <button
            type="button"
            onClick={() => toast("Halaman langganan belum tersedia di demo")}
            className="cursor-pointer border-none bg-transparent p-0 font-bold text-[#92400e] underline"
          >
            Tingkatkan ke VIP
          </button>{" "}
          untuk mendapatkan lebih banyak kuota.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <ScopeSelect
          label="Filter status"
          options={["Status", "Selesai", "Sedang Dikirim", "Draf"]}
        />
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-line bg-white px-3 py-2">
          <span aria-hidden className="opacity-50">
            🔍
          </span>
          <input
            placeholder="Harap isi Nama Tugas"
            aria-label="Cari nama tugas"
            className="w-full border-none text-[0.9rem] outline-none"
          />
        </div>
        <span className="text-[0.82rem] font-semibold text-muted">
          {rows.length}/50 ⓘ
        </span>
        <button
          type="button"
          onClick={onAdd}
          className="cursor-pointer rounded-xl border-none bg-green px-4 py-2.5 font-bold text-white transition hover:bg-green-hover"
        >
          ＋ Tambah Tugas
        </button>
      </div>

      {/* Bilah kuota */}
      <div className="h-1.5 overflow-hidden rounded-full bg-green-mint">
        <div
          className="h-full rounded-full bg-green"
          style={{ width: `${Math.min(100, (rows.length / 50) * 100)}%` }}
        />
      </div>

      {rows.length > 0 ? (
        <TableWrap minWidth={880}>
          <thead>
            <tr>
              <Th>Nama</Th>
              <Th>Status</Th>
              <Th>Rencana Jumlah Dikirim</Th>
              <Th>Berhasil Dikirim</Th>
              <Th>Gagal Dikirim</Th>
              <Th>Pembuat / Waktu Membuat</Th>
              <Th>Aksi</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={`${t.name}-${t.at}-${i}`}>
                <Td className="font-semibold">{t.name}</Td>
                <Td>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <i className={`h-2 w-2 rounded-full ${STATUS_DOT[t.status]}`} />
                    {STATUS_LABEL[t.status]}
                  </span>
                </Td>
                <Td>{angka(t.plan)}</Td>
                <Td>
                  <span className={t.ok > 0 ? "font-bold text-green-dark" : ""}>
                    {angka(t.ok)}
                  </span>
                </Td>
                <Td>
                  <span className={t.fail > 0 ? "font-bold text-[#dc2626]" : ""}>
                    {angka(t.fail)}
                  </span>
                </Td>
                <Td>
                  <div className="font-semibold">{t.by}</div>
                  <div className="mt-0.5 text-[0.78rem] text-muted">{t.at}</div>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => toast("Rincian tugas belum tersedia di demo")}
                      className="cursor-pointer border-none bg-transparent p-0 text-[0.82rem] font-semibold text-green-dark underline"
                    >
                      Rincian
                    </button>
                    <button
                      type="button"
                      onClick={() => toast("Tugas disalin ke draf baru")}
                      className="cursor-pointer border-none bg-transparent p-0 text-[0.82rem] font-semibold text-green-dark underline"
                    >
                      Salin
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      ) : (
        <div className="grid place-items-center rounded-xl border border-line bg-white py-14 text-center">
          <div className="text-4xl opacity-40" aria-hidden>
            📦
          </div>
          <p className="mt-3 mb-0 text-muted">Tidak Ada Data</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-[0.84rem] text-muted">
        <span>
          Total <b className="text-text">{rows.length}</b>
        </span>
        <ScopeSelect label="Jumlah per halaman" options={["50/halaman"]} />
      </div>
    </>
  );
}

/* ---------------- Segmentasi pelanggan ---------------- */

type SegKey = "sudah_order" | "sudah_order_produk" | "belum_order";

const SEGMENTS: { key: SegKey; ico: string; title: string; desc: string }[] = [
  {
    key: "sudah_order",
    ico: "🛒",
    title: "Sudah Pernah Order",
    desc: "Semua pembeli yang minimal 1× checkout di toko ini — cocok untuk info restock atau promo loyalitas.",
  },
  {
    key: "sudah_order_produk",
    ico: "🎯",
    title: "Sudah Pernah Order — Produk Tertentu",
    desc: "Pembeli yang pernah membeli produk spesifik — cocok untuk upsell/repurchase produk terkait.",
  },
  {
    key: "belum_order",
    ico: "🆕",
    title: "Belum Pernah Order",
    desc: "Kontak yang pernah chat tapi belum checkout — cocok untuk promo pembuka/perkenalan produk.",
  },
];

function SegmentPanel({
  seg,
  setSeg,
  picked,
  setPicked,
}: {
  seg: SegKey;
  setSeg: (s: SegKey) => void;
  picked: Product | null;
  setPicked: (p: Product | null) => void;
}) {
  const catalog = useCatalog();
  const [q, setQ] = useState("");
  const matches = useMemo(
    () => searchProducts(catalog.products, q, 15),
    [catalog.products, q],
  );

  const jumlah = (key: SegKey) => {
    if (key === "sudah_order") return "± 342 pembeli";
    if (key === "belum_order") return "± 156 kontak";
    return picked ? `± ${perkiraanPembeli(picked.sku)} pembeli` : "pilih produk";
  };

  return (
    <div className="mt-4 rounded-2xl border border-line bg-green-soft p-4">
      <div className="flex flex-col gap-2.5">
        {SEGMENTS.map((s) => (
          <label
            key={s.key}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-3.5 transition ${
              seg === s.key ? "border-green shadow-[0_0_0_1px_var(--color-green)]" : "border-line"
            }`}
          >
            <input
              type="radio"
              name="segmen"
              className="mt-1 accent-green"
              checked={seg === s.key}
              onChange={() => setSeg(s.key)}
            />
            <span className="text-[1.3rem]" aria-hidden>
              {s.ico}
            </span>
            <span className="flex-1">
              <span className="block font-bold">{s.title}</span>
              <span className="mt-1 block text-[0.8rem] leading-snug text-muted">
                {s.desc}
              </span>
            </span>
            <span className="shrink-0 text-[0.78rem] font-bold whitespace-nowrap text-green-dark">
              {jumlah(s.key)}
            </span>
          </label>
        ))}
      </div>

      {seg === "sudah_order_produk" && (
        <div className="mt-3.5 rounded-xl border border-line bg-white p-3.5">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-green-soft px-3 py-2">
            <span aria-hidden className="opacity-50">
              🔍
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari produk yang pernah dibeli…"
              aria-label="Cari produk"
              className="w-full border-none bg-transparent text-[0.9rem] outline-none"
            />
          </div>
          <div className="mt-2 text-[0.76rem] text-muted">
            Menampilkan <b className="text-text">{matches.length}</b> hasil ·{" "}
            {catalogStatusText(catalog)}
          </div>

          <div className="mt-2 flex max-h-64 flex-col gap-2 overflow-y-auto">
            {matches.length === 0 && (
              <div className="py-6 text-center text-[0.84rem] text-muted">
                Produk tidak ditemukan. Coba kata kunci lain.
              </div>
            )}
            {matches.map((p) => (
              <button
                key={p.sku}
                type="button"
                onClick={() => setPicked(p)}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 text-left transition hover:bg-green-soft ${
                  picked?.sku === p.sku ? "border-green bg-green-mint" : "border-line bg-white"
                }`}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-green-mint">
                  🌱
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.86rem] font-semibold">
                    {p.nama_produk}
                  </span>
                  <span className="mt-0.5 block truncate text-[0.74rem] text-muted">
                    {p.sku} · {p.kategori} · ± {perkiraanPembeli(p.sku)} pembeli
                  </span>
                </span>
              </button>
            ))}
          </div>

          {picked && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl bg-green-mint px-3 py-2 text-[0.82rem] text-green-dark">
              🎯 Produk terpilih: <b>{picked.nama_produk}</b> (±{" "}
              {perkiraanPembeli(picked.sku)} pembeli)
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="ml-auto cursor-pointer rounded-lg border border-green bg-white px-2 py-1 text-[0.76rem] font-bold text-green-dark"
              >
                Ganti
              </button>
            </div>
          )}
        </div>
      )}

      <p className="mt-3.5 mb-0 rounded-xl bg-white p-3 text-[0.78rem] leading-relaxed text-text-2">
        🤖 Sesuai <b className="text-green-dark">claude.md</b>: pilih segmen yang
        benar-benar relevan dengan isi pesan — mendukung penjualan tanpa memaksa.
        Perkiraan jumlah penerima masih bersifat contoh; setelah integrasi data pesanan
        marketplace, jumlah diambil dari transaksi nyata.
      </p>
    </div>
  );
}

/* ---------------- Form tambah tugas ---------------- */

type Lampiran = { icon: string; label: string };

function TaskForm({
  mp,
  onDone,
}: {
  mp: MpKey;
  onDone: () => void;
}) {
  const toast = useToast();
  const [nama, setNama] = useState("");
  const [pesan, setPesan] = useState("");
  const [penerima, setPenerima] = useState("penandaan");
  const [seg, setSeg] = useState<SegKey>("sudah_order");
  const [picked, setPicked] = useState<Product | null>(null);
  const [lampiran, setLampiran] = useState<Lampiran[]>([]);
  const [aiIdx, setAiIdx] = useState(0);

  const mpLabel = MP.find((m) => m.key === mp)!.label;

  /** Sama dengan buildAiMessage() di broadcast.js. */
  const draftAi = () => {
    let text: string;
    if (penerima !== "segmentasi") {
      text = GENERIC_TEMPLATES[aiIdx % GENERIC_TEMPLATES.length];
    } else if (seg === "belum_order") {
      text = BELUM_ORDER_TEMPLATES[aiIdx % BELUM_ORDER_TEMPLATES.length];
    } else if (seg === "sudah_order_produk" && picked) {
      const nama = picked.nama_produk.replace(/^INFARM - /, "");
      text = `Halo, Kak 😊 Terima kasih sudah pernah beli ${nama} di toko kami. Kalau stok di rumah mulai menipis atau ingin restock, minfarm siap bantu ya, Kak 🌿`;
    } else {
      text = GENERIC_TEMPLATES[aiIdx % GENERIC_TEMPLATES.length];
    }
    setAiIdx(aiIdx + 1);
    setPesan(text);
    toast("Draf pesan AI dibuat (gaya claude.md)");
  };

  const submit = (status: BroadcastTask["status"], pesanToast: string) => {
    if (!nama.trim()) {
      toast("Isi Nama tugas dulu, Kak");
      return;
    }
    if (!pesan.trim()) {
      toast("Isi konten pesan dulu, Kak");
      return;
    }
    addBroadcastTask(mp, {
      name: nama.trim(),
      status,
      plan: status === "draft" ? 0 : 50,
      ok: 0,
      fail: 0,
      by: "Infarm.sales",
      at: "2026-06-25 08:24",
    });
    toast(pesanToast);
    onDone();
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onDone}
          className="cursor-pointer border-none bg-transparent p-0 font-semibold text-green-dark"
        >
          ‹ Kembali ke Daftar
        </button>
        <span className="text-[0.86rem] text-muted">
          Broadcast <b className="text-text">{mpLabel}</b>
        </span>
      </div>

      {/* Informasi dasar */}
      <div className="rounded-2xl border border-line bg-white p-5 max-mini:p-4">
        <div className="mb-4 text-[0.95rem] font-bold">Informasi Dasar</div>

        <label className="mb-1.75 block text-[0.84rem] font-semibold text-text-2">
          <span className="text-[#dc2626]">*</span> Nama
        </label>
        <div className="relative mb-4">
          <input
            value={nama}
            maxLength={50}
            onChange={(e) => setNama(e.target.value)}
            placeholder="Harap Isi"
            className="w-full rounded-[10px] border border-line bg-green-soft px-3 py-2.5 pr-16 text-[0.9rem] focus:bg-white focus:outline-2 focus:outline-green"
          />
          <span className="absolute top-1/2 right-3 -translate-y-1/2 text-[0.74rem] text-muted">
            {nama.length} / 50
          </span>
        </div>

        <label className="mb-1.75 block text-[0.84rem] font-semibold text-text-2">
          <span className="text-[#dc2626]">*</span> Penerima
        </label>
        <div className="flex flex-col gap-1">
          {[
            { v: "penandaan", l: "Penandaan Pembeli yang Ditentukan" },
            { v: "pesanan", l: "Pesanan yang Ditentukan ⓘ" },
            { v: "impor", l: "Impor Pesanan" },
            { v: "segmentasi", l: "Segmentasi Pelanggan (AI)", baru: true },
          ].map((o) => (
            <label
              key={o.v}
              className="flex cursor-pointer items-center gap-2 py-1.5 text-[0.9rem]"
            >
              <input
                type="radio"
                name="penerima"
                className="accent-green"
                checked={penerima === o.v}
                onChange={() => setPenerima(o.v)}
              />
              {o.l}
              {o.baru && (
                <span className="rounded-md bg-green px-1.5 py-px text-[0.62rem] font-bold text-white">
                  Baru
                </span>
              )}
            </label>
          ))}
        </div>

        {penerima === "segmentasi" && (
          <SegmentPanel seg={seg} setSeg={setSeg} picked={picked} setPicked={setPicked} />
        )}
      </div>

      {/* Konten pengiriman */}
      <div className="rounded-2xl border border-line bg-white p-5 max-mini:p-4">
        <div className="mb-4 text-[0.95rem] font-bold">Konten Pengiriman</div>

        <div className="mb-4 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3.5 py-2.5 text-[0.8rem] leading-relaxed text-[#92400e]">
          ⚠️ Karena keterbatasan antar muka API {mpLabel}, jika pembeli belum membalas
          pesan maksimal hanya dapat mengirimkan 5 pesan. 1 kartu produk / 1 voucher
          belanja dihitung sebagai 1 pesan terpisah.
        </div>

        <label className="mb-1.75 block text-[0.84rem] font-semibold text-text-2">
          <span className="text-[#dc2626]">*</span> Kirim Pesan
        </label>
        <div className="overflow-hidden rounded-xl border border-line">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-green-soft px-3 py-2">
            <span className="text-[0.82rem] font-semibold text-text-2">Nama Pembeli</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={draftAi}
                className="cursor-pointer rounded-lg border border-green bg-white px-2.5 py-1 text-[0.78rem] font-bold text-green-dark transition hover:bg-green-mint"
              >
                ✨ Bantu tulis (AI)
              </button>
              <button
                type="button"
                onClick={() => toast("Sisip gambar belum tersedia di demo")}
                title="Sisipkan gambar"
                className="cursor-pointer rounded-lg border-none bg-transparent px-2 py-1"
              >
                🖼️
              </button>
              <button
                type="button"
                onClick={() => setPesan("")}
                title="Hapus"
                className="cursor-pointer rounded-lg border-none bg-transparent px-2 py-1"
              >
                🗑️
              </button>
            </div>
          </div>
          <textarea
            value={pesan}
            maxLength={500}
            onChange={(e) => setPesan(e.target.value)}
            rows={5}
            placeholder="Harap Isi — sapa dengan 'Kak', ramah & tidak memaksa (sesuai claude.md)"
            className="w-full resize-y border-none p-3 text-[0.9rem] outline-none"
          />
          <div className="border-t border-line px-3 py-1.5 text-right text-[0.74rem] text-muted">
            {pesan.length} / 500
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setLampiran([...lampiran, { icon: "🏷️", label: "POC Buah Infarm 250 ml" }]);
              toast("Kartu produk ditambahkan");
            }}
            className="cursor-pointer rounded-xl border border-dashed border-green bg-green-soft px-3 py-2 text-[0.84rem] font-semibold text-green-dark"
          >
            ＋ Pilih Produk
          </button>
          <button
            type="button"
            onClick={() => {
              setLampiran([...lampiran, { icon: "🎟️", label: "Voucher Belanja Rp 10.000" }]);
              toast("Voucher ditambahkan");
            }}
            className="cursor-pointer rounded-xl border border-dashed border-green bg-green-soft px-3 py-2 text-[0.84rem] font-semibold text-green-dark"
          >
            ＋ Pilih Voucher
          </button>
        </div>

        {lampiran.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {lampiran.map((a, i) => (
              <span
                key={`${a.label}-${i}`}
                className="inline-flex items-center gap-2 rounded-3xl bg-green-mint px-3 py-1.5 text-[0.82rem] font-semibold text-green-dark"
              >
                {a.icon} {a.label}
                <button
                  type="button"
                  aria-label={`Hapus ${a.label}`}
                  onClick={() => setLampiran(lampiran.filter((_, j) => j !== i))}
                  className="cursor-pointer border-none bg-transparent font-bold text-green-dark"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Bilah aksi */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4">
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => submit("sending", "Tugas broadcast dikirim ✅")}
            className="cursor-pointer rounded-xl border-none bg-green px-5 py-2.5 font-bold text-white transition hover:bg-green-hover"
          >
            Kirim
          </button>
          <button
            type="button"
            onClick={() => submit("draft", "Tugas disimpan sebagai draf")}
            className="cursor-pointer rounded-xl border border-line bg-white px-5 py-2.5 font-bold text-text-2 transition hover:bg-green-soft"
          >
            Simpan
          </button>
          <button
            type="button"
            onClick={() => {
              toast("Tugas dibatalkan");
              onDone();
            }}
            className="cursor-pointer rounded-xl border border-line bg-white px-5 py-2.5 font-bold text-text-2 transition hover:bg-green-soft"
          >
            Batalkan
          </button>
        </div>
        <label className="flex items-center gap-2 text-[0.84rem] text-text-2">
          <input type="checkbox" defaultChecked className="accent-green" />
          Saat Kirim, Terjemahkan Otomatis 〔Pesan Dikirim〕
        </label>
      </div>
    </>
  );
}

/* ---------------- Halaman ---------------- */

export default function Broadcast() {
  const [mp, setMp] = useState<MpKey>("shopee");
  const [mode, setMode] = useState<"list" | "form">("list");

  return (
    <div className="flex flex-col gap-4 p-5 px-6 pb-10 max-mobile:p-3.5 max-mobile:pb-8">
      {/* Tab marketplace */}
      {/* overflow-y-hidden + pb-px: sama dengan tab Chat & Pesanan — tanpa
          ini -mb-px pada tombol memunculkan bilah gulir vertikal. */}
      <div className="flex gap-1.5 overflow-x-auto overflow-y-hidden border-b border-line pb-px">
        {MP.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => {
              setMp(m.key);
              setMode("list");
            }}
            aria-current={mp === m.key ? "page" : undefined}
            className={[
              "-mb-px cursor-pointer border-x-0 border-t-0 border-b-2 bg-transparent px-4 py-2.5 text-[0.92rem] font-bold whitespace-nowrap transition",
              mp === m.key
                ? "border-green text-green-dark"
                : "border-transparent text-muted hover:text-text-2",
            ].join(" ")}
          >
            {m.label}
          </button>
        ))}
      </div>

      <DemoNotice
        sumber="contoh"
        detail="Broadcast milik API marketplace, bukan tabel kita — tugas yang dibuat tersimpan selama sesi ini saja dan belum dikirim."
      />

      {mode === "list" ? (
        <TaskList mp={mp} onAdd={() => setMode("form")} />
      ) : (
        <TaskForm mp={mp} onDone={() => setMode("list")} />
      )}
    </div>
  );
}
