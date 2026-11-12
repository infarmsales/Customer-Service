"use client";

/* ===========================================================
   Halaman Pesanan — port dari pesanan.html + pesanan.js.
   Step 12. Tiga sub-halaman: Penilaian, Pengembalian Dana,
   Pesanan Dibatalkan.

   Perilaku yang dipertahankan:
   - Filter bintang + "hanya penilaian negatif" pada Penilaian.
   - Chip status pada Refund & Cancel, dengan hitungan chip
     Cancel yang ikut berubah setelah keputusan CS.
   - Checklist + aksi massal Setujui/Tolak pada Cancel; hanya
     baris "menunggu" yang punya checkbox.
   - Tombol 💬 di tiap baris membuka Quick Chat ke pembeli.

   Keputusan pembatalan kini lewat decideCancels() di store,
   bukan mengubah array global — supaya hasilnya tetap ada saat
   berpindah sub-tab, dan supaya nanti tinggal diganti panggilan
   API pesanan marketplace.
   =========================================================== */

import { useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import {
  DemoNotice,
  GhostButton,
  Pill,
  ScopeSelect,
  TableWrap,
  Td,
  Th,
} from "@/components/ui/Bits";
import { actionTagClass } from "@/components/ai/actionTag";
import QuickChat, { type QcMessage, type QuickChatTarget } from "./QuickChat";
import DaftarPesanan from "./DaftarPesanan";
import {
  decideCancels,
  useCancelCount,
  useCancels,
  useRefunds,
  useReviews,
} from "@/lib/db";
import type { Cancel, Refund, Review } from "@/lib/db/types";

type TabKey = "daftar" | "penilaian" | "refund" | "cancel";

/* ---------------- Potongan kecil ---------------- */

function Stars({ n }: { n: number }) {
  return (
    <span aria-label={`${n} dari 5 bintang`} className="whitespace-nowrap">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= n ? "text-[#f59e0b]" : "text-[#cbd5e1]"}>
          ★
        </span>
      ))}
    </span>
  );
}

function ChatButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Chat ke pembeli"
      aria-label="Chat ke pembeli"
      className="ml-1.5 h-7 w-7 cursor-pointer rounded-lg border border-line bg-white text-[0.8rem] transition hover:bg-green-mint"
    >
      💬
    </button>
  );
}

function ChipTabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={o.value === value}
          className={[
            "cursor-pointer rounded-3xl border px-3 py-1.5 text-[0.82rem] font-semibold whitespace-nowrap transition",
            o.value === value
              ? "border-green bg-green-mint text-green-dark"
              : "border-line bg-white text-muted hover:bg-green-soft",
          ].join(" ")}
        >
          {o.label}
          {o.count !== undefined && <b className="ml-1.5 text-text">{o.count}</b>}
        </button>
      ))}
    </div>
  );
}

function PlatformTabs({ tabs }: { tabs: { label: string; count?: number }[] }) {
  const [active, setActive] = useState(0);
  return (
    <div className="flex flex-wrap gap-1">
      {tabs.map((t, i) => (
        <button
          key={t.label}
          type="button"
          onClick={() => setActive(i)}
          className={[
            "cursor-pointer rounded-[9px] border px-3 py-1.5 text-[0.84rem] font-semibold whitespace-nowrap",
            i === active
              ? "border-green bg-green-mint text-green-dark"
              : "border-line bg-white text-muted hover:bg-green-soft",
          ].join(" ")}
        >
          {t.label}
          {t.count !== undefined && <b className="ml-1.5 text-text">{t.count}</b>}
        </button>
      ))}
    </div>
  );
}

function AiNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 rounded-xl border border-line-soft bg-green-soft px-3.5 py-2.5 text-[0.82rem] leading-relaxed text-text-2">
      🤖 {children}
    </p>
  );
}

function SearchField({ placeholder }: { placeholder: string }) {
  return (
    <div className="flex min-w-[200px] items-center gap-2 rounded-xl border border-line bg-white px-3 py-1.5">
      <span aria-hidden className="opacity-50">
        🔍
      </span>
      <input
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full border-none text-[0.86rem] outline-none"
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="grid place-items-center rounded-xl border border-line bg-white py-14 text-center">
      <div className="text-4xl opacity-40" aria-hidden>
        📦
      </div>
      <p className="mt-3 mb-0 text-muted">Tidak Ada Data</p>
    </div>
  );
}

function TableFoot({ total }: { total: number }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[0.84rem] text-muted">
      <span>
        Total <b className="text-text">{total}</b>
      </span>
      <ScopeSelect label="Jumlah per laman" options={["10/laman", "20/laman"]} />
    </div>
  );
}

/* ---------------- Panel 1: Penilaian ---------------- */

function PanelPenilaian({ onChat }: { onChat: (r: Review) => void }) {
  const reviews = useReviews();
  const toast = useToast();
  const [star, setStar] = useState<string>("all");
  const [negOnly, setNegOnly] = useState(false);

  const rows = useMemo(
    () =>
      reviews.filter((r) => {
        if (star !== "all" && r.rating.all !== Number(star)) return false;
        if (negOnly && r.rating.all > 2) return false;
        return true;
      }),
    [reviews, star, negOnly],
  );

  // Hitungan chip dihitung dari data, bukan angka tetap seperti HTML lama.
  const hitung = (n: number) => reviews.filter((r) => r.rating.all === n).length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <PlatformTabs
          tabs={[
            { label: "Lazada", count: 8 },
            { label: "Shopee", count: 5 },
            { label: "TikTok" },
            { label: "Mercado" },
          ]}
        />
        <ScopeSelect label="Toko" options={["Seluruh Toko", "infarm", "infarmofficialshop"]} />
        <ScopeSelect label="Jenis penilaian" options={["Penilaian Produk", "Penilaian Toko"]} />
        <SearchField placeholder="Cari nomor pesanan / nama pembeli" />
        <GhostButton onClick={() => toast("Filter lanjutan belum tersedia di demo")}>
          Reset
        </GhostButton>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ChipTabs
          value={star}
          onChange={setStar}
          options={[
            { value: "all", label: "Semua" },
            { value: "5", label: "5 Bintang", count: hitung(5) },
            { value: "4", label: "4 Bintang", count: hitung(4) },
            { value: "3", label: "3 Bintang", count: hitung(3) },
            { value: "2", label: "2 Bintang", count: hitung(2) },
            { value: "1", label: "1 Bintang", count: hitung(1) },
          ]}
        />
        <label className="flex items-center gap-2 text-[0.84rem] text-text-2">
          <input
            type="checkbox"
            checked={negOnly}
            onChange={(e) => setNegOnly(e.target.checked)}
            className="accent-green"
          />
          Hanya melihat penilaian negatif
        </label>
        <GhostButton onClick={() => toast("Menyiapkan ekspor data…")}>Ekspor</GhostButton>
        <button
          type="button"
          onClick={() => toast("Sinkronisasi data dari marketplace…")}
          className="cursor-pointer rounded-[9px] border-none bg-green px-3.5 py-1.5 text-[0.84rem] font-bold text-white transition hover:bg-green-hover"
        >
          Sinkronisasi Penilaian
        </button>
      </div>

      <AiNote>
        Sesuai SOP <b className="text-green-dark">claude.md</b>: penilaian negatif (≤2
        bintang) disarankan dibalas empati &amp; ditindaklanjuti. Balasan AI tersedia di
        kolom Aksi.
      </AiNote>

      {rows.length > 0 ? (
        <TableWrap minWidth={1080}>
          <thead>
            <tr>
              <Th>Informasi Produk</Th>
              <Th>Penilaian</Th>
              <Th>Konten Penilaian</Th>
              <Th>Catatan</Th>
              <Th>Status</Th>
              <Th>Aksi</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const neg = r.rating.all <= 2;
              return (
                <tr key={r.order}>
                  <Td>
                    <div className="font-mono text-[0.82rem] font-semibold">{r.order}</div>
                    <div className="mt-2 flex items-start gap-2.5">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-green-mint">
                        {r.emoji}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[0.86rem] font-semibold">{r.prod}</div>
                        <div className="mt-0.5 text-[0.74rem] text-muted">SKU: {r.sku}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="mb-2 text-[0.82rem]">
                      Nama Pembeli: <b>{r.buyer}</b>
                      <ChatButton onClick={() => onChat(r)} />
                    </div>
                    <div className="flex flex-col gap-1 text-[0.78rem] text-muted">
                      <span className="flex justify-between gap-3">
                        Keseluruhan <Stars n={r.rating.all} />
                      </span>
                      <span className="flex justify-between gap-3">
                        Produk <Stars n={r.rating.produk} />
                      </span>
                      <span className="flex justify-between gap-3">
                        Pelayanan Penjual <Stars n={r.rating.penjual} />
                      </span>
                      <span className="flex justify-between gap-3">
                        Jasa Kirim <Stars n={r.rating.kirim} />
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <div className="max-w-[280px] text-[0.84rem] leading-relaxed">
                      {r.content}
                      <div className="mt-1.5 text-[0.74rem] text-muted">{r.date}</div>
                    </div>
                  </Td>
                  <Td>
                    <span className="text-[0.82rem] text-muted">
                      Daerah: <b className="text-text">Indonesia</b>
                      <br />
                      Toko: <b className="text-text">infarm</b>
                    </span>
                  </Td>
                  <Td>
                    <Pill kind={r.status}>
                      {r.status === "done" ? "Sudah Dibalas" : "Menunggu Diproses"}
                    </Pill>
                  </Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          toast(
                            neg
                              ? "Balasan empati AI disiapkan (HANDOVER_TO_CS bila perlu kompensasi)"
                              : "Balasan terima kasih AI disiapkan",
                          )
                        }
                        className="cursor-pointer border-none bg-transparent p-0 text-left text-[0.82rem] font-semibold text-green-dark underline"
                      >
                        Pesan Balasan{neg ? " (AI)" : ""}
                      </button>
                      <button
                        type="button"
                        onClick={() => toast("Penandaan belum tersedia di demo")}
                        className="cursor-pointer border-none bg-transparent p-0 text-left text-[0.82rem] font-semibold text-green-dark underline"
                      >
                        Penandaan ▾
                      </button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      ) : (
        <EmptyState />
      )}

      <TableFoot total={rows.length} />
    </>
  );
}

/* ---------------- Panel 2: Pengembalian dana ---------------- */

function PanelRefund({ onChat }: { onChat: (r: Refund) => void }) {
  const refunds = useRefunds();
  const toast = useToast();
  const [status, setStatus] = useState<string>("all");

  const rows = refunds.filter((r) => status === "all" || r.status === status);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <PlatformTabs
          tabs={[{ label: "Lazada" }, { label: "Shopee", count: 26 }, { label: "TikTok", count: 14 }]}
        />
        <ScopeSelect label="Toko" options={["Seluruh Toko"]} />
        <ScopeSelect
          label="Jenis pengembalian"
          options={["Jenis Pengembalian", "Barang Rusak", "Tidak Sampai"]}
        />
        <SearchField placeholder="Cari nomor pesanan" />
        <GhostButton onClick={() => toast("Filter lanjutan belum tersedia di demo")}>
          Reset
        </GhostButton>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ChipTabs
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "Semua", count: refunds.length },
            {
              value: "dana",
              label: "Pengembalian Dana",
              count: refunds.filter((r) => r.status === "dana").length,
            },
            {
              value: "batal",
              label: "Sudah Dibatalkan",
              count: refunds.filter((r) => r.status === "batal").length,
            },
          ]}
        />
        <GhostButton onClick={() => toast("Menyiapkan ekspor data…")}>Ekspor</GhostButton>
        <button
          type="button"
          onClick={() => toast("Sinkronisasi data dari marketplace…")}
          className="cursor-pointer rounded-[9px] border-none bg-green px-3.5 py-1.5 text-[0.84rem] font-bold text-white transition hover:bg-green-hover"
        >
          Sinkronisasi
        </button>
      </div>

      <AiNote>
        Sesuai <b className="text-green-dark">claude.md</b>: permintaan refund / barang
        rusak / tidak sampai wajib <b>HANDOVER_TO_CS</b> — AI tidak menjanjikan refund,
        hanya meneruskan + ringkasan.
      </AiNote>

      {rows.length > 0 ? (
        <TableWrap minWidth={980}>
          <thead>
            <tr>
              <Th>Nomor Pesanan</Th>
              <Th>Pembeli</Th>
              <Th>Produk</Th>
              <Th>Jenis Pengembalian</Th>
              <Th>Nominal</Th>
              <Th>Status</Th>
              <Th>Tindakan AI</Th>
              <Th>Aksi</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.order}>
                <Td className="font-mono text-[0.82rem] font-semibold">{r.order}</Td>
                <Td>
                  <span className="whitespace-nowrap">
                    {r.buyer}
                    <ChatButton onClick={() => onChat(r)} />
                  </span>
                </Td>
                <Td>{r.prod}</Td>
                <Td>{r.jenis}</Td>
                <Td className="font-semibold whitespace-nowrap">{r.nominal}</Td>
                <Td>
                  <Pill kind={r.pill}>{r.label}</Pill>
                </Td>
                <Td>
                  <span
                    className={`rounded-md px-1.75 py-0.75 text-[0.62rem] font-extrabold whitespace-nowrap ${actionTagClass("HANDOVER_TO_CS")}`}
                  >
                    HANDOVER_TO_CS
                  </span>
                </Td>
                <Td>
                  <button
                    type="button"
                    onClick={() => toast("Rincian pengembalian belum tersedia di demo")}
                    className="cursor-pointer border-none bg-transparent p-0 text-[0.82rem] font-semibold text-green-dark underline"
                  >
                    Detail
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      ) : (
        <EmptyState />
      )}

      <TableFoot total={rows.length} />
    </>
  );
}

/* ---------------- Panel 3: Pesanan dibatalkan ---------------- */

const CANCEL_STATUS: Record<Cancel["status"], { pill: string; label: string }> = {
  menunggu: { pill: "wait", label: "Menunggu Diproses" },
  proses: { pill: "done", label: "Sudah Diproses" },
  batal: { pill: "cancel", label: "Sudah Dibatalkan" },
};

function PanelCancel({ onChat }: { onChat: (c: Cancel) => void }) {
  const cancels = useCancels();
  const count = useCancelCount();
  const toast = useToast();
  const [status, setStatus] = useState<string>("all");
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const rows = cancels.filter((c) => status === "all" || c.status === status);
  const pendingRows = rows.filter((r) => r.status === "menunggu");
  const terpilih = [...checked].filter((o) =>
    pendingRows.some((r) => r.order === o),
  );

  const toggle = (order: string) => {
    const next = new Set(checked);
    if (next.has(order)) next.delete(order);
    else next.add(order);
    setChecked(next);
  };

  const putuskan = (orders: string[], keputusan: "batal" | "lanjut") => {
    if (!orders.length) {
      toast("Pilih pesanan dulu, Kak");
      return;
    }
    const n = decideCancels(orders, keputusan);
    if (!n) return;
    setChecked(new Set());
    toast(
      keputusan === "batal"
        ? `${n} pesanan disetujui — dibatalkan`
        : `${n} pesanan ditolak — pesanan dilanjutkan`,
    );
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <PlatformTabs
          tabs={[{ label: "Lazada" }, { label: "Shopee", count: 5 }, { label: "TikTok" }]}
        />
        <ScopeSelect label="Toko" options={["Seluruh Toko"]} />
        <SearchField placeholder="Cari nomor pesanan" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ChipTabs
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "Semua", count: count.all },
            { value: "menunggu", label: "Menunggu Diproses", count: count.menunggu },
            { value: "proses", label: "Sudah Diproses", count: count.proses },
            { value: "batal", label: "Sudah Dibatalkan", count: count.batal },
          ]}
        />
        <GhostButton onClick={() => toast("Menyiapkan ekspor data…")}>Ekspor</GhostButton>
      </div>

      <AiNote>
        Sesuai <b className="text-green-dark">claude.md</b>: AI hanya meneruskan
        permintaan pembatalan (<b>HANDOVER_TO_CS</b>). Keputusan <b>Setujui</b> (pesanan
        dibatalkan) atau <b>Tolak</b> (pesanan dilanjutkan) dilakukan oleh CS manusia.
      </AiNote>

      {/* Bilah aksi massal */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white px-3.5 py-2.5">
        <label className="flex items-center gap-2 text-[0.84rem] font-semibold text-text-2">
          <input
            type="checkbox"
            className="accent-green"
            checked={pendingRows.length > 0 && terpilih.length === pendingRows.length}
            onChange={(e) =>
              setChecked(e.target.checked ? new Set(pendingRows.map((r) => r.order)) : new Set())
            }
          />
          Pilih Semua
        </label>
        <span className="text-[0.82rem] text-muted">{terpilih.length} dipilih</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            disabled={terpilih.length === 0}
            onClick={() => putuskan(terpilih, "batal")}
            className="cursor-pointer rounded-[9px] border-none bg-green px-3.5 py-1.5 text-[0.82rem] font-bold text-white transition hover:bg-green-hover disabled:cursor-not-allowed disabled:bg-[#cbd5e1]"
          >
            ✓ Setujui Massal — Batalkan Pesanan
          </button>
          <button
            type="button"
            disabled={terpilih.length === 0}
            onClick={() => putuskan(terpilih, "lanjut")}
            className="cursor-pointer rounded-[9px] border border-[#fecaca] bg-white px-3.5 py-1.5 text-[0.82rem] font-bold text-[#b91c1c] transition hover:bg-[#fee2e2] disabled:cursor-not-allowed disabled:border-line disabled:text-muted"
          >
            ✕ Tolak Massal — Lanjutkan Pesanan
          </button>
        </div>
      </div>

      {rows.length > 0 ? (
        <TableWrap minWidth={1100}>
          <thead>
            <tr>
              <Th> </Th>
              <Th>Nomor Pesanan</Th>
              <Th>Pembeli</Th>
              <Th>Produk</Th>
              <Th>Alasan Pembatalan</Th>
              <Th>Nominal</Th>
              <Th>Status</Th>
              <Th>Tindakan AI</Th>
              <Th>Aksi</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const pending = c.status === "menunggu";
              const meta = CANCEL_STATUS[c.status];
              return (
                <tr key={`${c.order}-${c.status}`}>
                  <Td>
                    {pending && (
                      <input
                        type="checkbox"
                        className="accent-green"
                        aria-label={`Pilih pesanan ${c.order}`}
                        checked={checked.has(c.order)}
                        onChange={() => toggle(c.order)}
                      />
                    )}
                  </Td>
                  <Td className="font-mono text-[0.82rem] font-semibold">{c.order}</Td>
                  <Td>
                    <span className="whitespace-nowrap">
                      {c.buyer}
                      <ChatButton onClick={() => onChat(c)} />
                    </span>
                  </Td>
                  <Td>{c.prod}</Td>
                  <Td>{c.alasan}</Td>
                  <Td className="font-semibold whitespace-nowrap">{c.nominal}</Td>
                  <Td>
                    <Pill kind={c.note ? "cont" : meta.pill}>{c.note || meta.label}</Pill>
                  </Td>
                  <Td>
                    <span
                      className={`rounded-md px-1.75 py-0.75 text-[0.62rem] font-extrabold whitespace-nowrap ${actionTagClass("CHECK_ORDER_SYSTEM")}`}
                    >
                      CHECK_ORDER_SYSTEM
                    </span>
                  </Td>
                  <Td>
                    {pending ? (
                      <div className="flex flex-col gap-1.5">
                        <button
                          type="button"
                          onClick={() => putuskan([c.order], "batal")}
                          className="cursor-pointer rounded-lg border-none bg-green-mint px-2.5 py-1 text-[0.78rem] font-bold whitespace-nowrap text-green-dark"
                        >
                          ✓ Setujui (Batalkan)
                        </button>
                        <button
                          type="button"
                          onClick={() => putuskan([c.order], "lanjut")}
                          className="cursor-pointer rounded-lg border-none bg-[#fee2e2] px-2.5 py-1 text-[0.78rem] font-bold whitespace-nowrap text-[#b91c1c]"
                        >
                          ✕ Tolak (Lanjutkan)
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toast("Rincian pembatalan belum tersedia di demo")}
                        className="cursor-pointer border-none bg-transparent p-0 text-[0.82rem] font-semibold text-green-dark underline"
                      >
                        Detail
                      </button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      ) : (
        <EmptyState />
      )}

      <TableFoot total={rows.length} />
    </>
  );
}

/* ---------------- Halaman ---------------- */

export default function Pesanan() {
  const [tab, setTab] = useState<TabKey>("daftar");
  const [chat, setChat] = useState<QuickChatTarget | null>(null);
  /* Riwayat Quick Chat per nomor pesanan — dulu objek global
     QC_THREADS di quickchat.js. Disimpan di sini, bukan di dalam
     widget, supaya tidak hilang saat berpindah pembeli. */
  const [threads, setThreads] = useState<Record<string, QcMessage[]>>({});
  const reviews = useReviews();
  const refunds = useRefunds();
  const count = useCancelCount();

  /* Membuka widget sekaligus menyemai pesan pertama bila nomor
     pesanan ini belum pernah dibuka (dulu dilakukan openQuickChat). */
  const buka = (t: QuickChatTarget) => {
    setThreads((prev) =>
      prev[t.id]
        ? prev
        : {
            ...prev,
            [t.id]: t.initialMessage
              ? [{ side: "in", time: "baru saja", text: t.initialMessage }]
              : [],
          },
    );
    setChat(t);
  };

  const kirim = (text: string) => {
    if (!chat) return;
    setThreads((prev) => ({
      ...prev,
      [chat.id]: [...(prev[chat.id] ?? []), { side: "out", time: "baru saja", text }],
    }));
  };

  /* Susunan konteks Quick Chat sama dengan handleChatClick() lama. */
  const chatReview = (r: Review) =>
    buka({
      id: r.order,
      name: r.buyer,
      shop: "infarmofficialshop · Shopee",
      context: `⭐ ${r.rating.all}/5 · ${r.prod}`,
      initialMessage: r.content,
    });

  const chatRefund = (r: Refund) =>
    buka({
      id: r.order,
      name: r.buyer,
      shop: "infarmofficialshop · Shopee",
      context: `💸 ${r.jenis} · ${r.nominal} · #${r.order}`,
      initialMessage: `Halo min, saya mau tanya soal pengajuan pengembalian dana untuk pesanan #${r.order}.`,
    });

  const chatCancel = (c: Cancel) =>
    buka({
      id: c.order,
      name: c.buyer,
      shop: "infarmofficialshop · Shopee",
      context: `❌ ${c.alasan} · ${c.nominal} · #${c.order}`,
      initialMessage: `Halo min, saya mau tanya soal pembatalan pesanan #${c.order}.`,
    });

  const TABS: { key: TabKey; label: string; count?: number }[] = [
    { key: "daftar", label: "Daftar Pesanan" },
    { key: "penilaian", label: "Pengelolaan Penilaian", count: reviews.length },
    { key: "refund", label: "Pesanan Pengembalian Dana", count: refunds.length },
    { key: "cancel", label: "Pesanan Dibatalkan", count: count.menunggu },
  ];

  return (
    <div className="flex flex-col gap-3.5 p-5 px-6 pb-10 max-mobile:p-3.5 max-mobile:pb-8">
      {/* Hanya bergulir kanan-kiri. overflow-x-auto saja ikut menyalakan
          sumbu vertikal, dan -mb-px pada tombol tab melimpah 1px —
          cukup untuk memunculkan bilah gulir atas-bawah di ujung kanan
          (dilaporkan 12 Nov 2026). pb-px memberi ruang 1px itu supaya
          garis bawah tab aktif tidak terpotong. Sama dengan tab Chat. */}
      <div className="flex gap-1.5 overflow-x-auto overflow-y-hidden border-b border-line pb-px">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={[
              "-mb-px flex cursor-pointer items-center gap-2 border-x-0 border-t-0 border-b-2 bg-transparent px-4 py-2.5 text-[0.92rem] font-bold whitespace-nowrap transition",
              tab === t.key
                ? "border-green text-green-dark"
                : "border-transparent text-muted hover:text-text-2",
            ].join(" ")}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="rounded-lg bg-green-mint px-1.5 py-px text-[0.72rem] text-green-dark">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Daftar Pesanan membaca tabel orders asli; penanda "contoh"
          hanya untuk tiga tab lainnya. */}
      {tab !== "daftar" && (
        <DemoNotice
          sumber="contoh"
          detail="Ulasan, refund, dan pembatalan milik API pesanan marketplace — keputusan di sini tersimpan selama sesi ini saja dan belum dikirim."
        />
      )}

      {tab === "daftar" && <DaftarPesanan />}

      {tab === "penilaian" && <PanelPenilaian onChat={chatReview} />}
      {tab === "refund" && <PanelRefund onChat={chatRefund} />}
      {tab === "cancel" && <PanelCancel onChat={chatCancel} />}

      {chat && (
        <QuickChat
          key={chat.id}
          target={chat}
          messages={threads[chat.id] ?? []}
          onSend={kirim}
          onClose={() => setChat(null)}
        />
      )}
    </div>
  );
}
