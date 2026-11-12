"use client";

/* ===========================================================
   Halaman Chat — port dari dashboard.html + dashboard.js.
   Step 14, halaman paling kompleks (dikerjakan terakhir sesuai
   urutan risiko di MIGRATION.md Fase 4).

   Empat panel seperti versi lama:
     Toko Terhubung · Daftar Percakapan · Jendela Chat · Info
   Di layar sempit panel tersier & sekunder disembunyikan dan
   dibuka lewat tombol 🏪 / ☰ / ℹ️ sebagai overlay penuh
   (claude.md → STANDAR RESPONSIVITAS poin 2).

   Perilaku yang dipertahankan dari dashboard.js:
   - Filter tab Semua / Belum dibaca / Perlu CS.
   - Pencarian topbar berlingkup (nama, pesanan, resi, isi chat,
     produk) termasuk hasil pencarian massal — kini lewat
     lib/search.ts karena TopBar ada di layout terpisah. Sejak
     11 Sep 2026 inilah SATU-SATUNYA pencarian di halaman ini;
     kotak kedua di kepala panel daftar sudah dihapus.
   - Membuka percakapan menandainya sudah dibaca (badge rail ikut
     turun karena keduanya membaca store yang sama).
   - Panel AI Assist: Gunakan / Edit dulu / Alihkan ke CS, dan
     tombol ✨ memanggil /api/chat sungguhan.
   - Tab kanan Pesanan / Rincian Produk / Voucher, dengan katalog
     produk mengikuti konteks percakapan aktif.

   Perubahan yang disengaja: isi pesan dirender sebagai teks
   (whitespace-pre-line), bukan innerHTML seperti dashboard.js —
   menutup jalur XSS dari isi chat pelanggan.
   =========================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { actionTagClass } from "@/components/ai/actionTag";
import { DemoNotice } from "@/components/ui/Bits";
import IntegrateModal, { type PlatformName } from "./IntegrateModal";
import SimulasiPesan from "./SimulasiPesan";
import SinkronTiktok from "./SinkronTiktok";
import PapanCroscek from "./PapanCroscek";
import {
  appendMessage,
  markRead,
  selectEscalations,
  setAiSuggestion,
  useConversations,
  useDb,
} from "@/lib/db";
import type { ActionCode, Conversation } from "@/lib/db/types";
import { catalogStatusText, searchProducts, useCatalog } from "@/lib/catalog";
import { inisial, jam, stempel, tanggalPanjang } from "@/lib/format";
import { useSearch, type SearchScope } from "@/lib/search";
import { cocokKata } from "@/lib/cocok";
import { belumTerjawab } from "@/lib/tunggakan";
import { bukaPapan, useCroscek } from "@/lib/croscek";
import {
  cocokToko,
  HURUF_LOGO,
  KELAS_LOGO,
  LABEL_PLATFORM,
  namaTokoDari,
  SEMUA_TOKO,
  type Platform,
} from "@/lib/toko";
import {
  cocokPilihan,
  hitungPanel,
  jenisPercakapan,
  LABEL_JENIS,
  PILIH_CONTOH,
  PILIH_SIMULASI,
  tokoTampil,
  type TokoChat,
} from "@/lib/tokoChat";
import { useTokoChat, type SumberToko } from "@/lib/db/useTokoChat";
import { useRouter } from "next/navigation";
import { headerBerSesi } from "@/lib/supabase/header";
import {
  buatPesananDummy,
  idPesananDummy,
  resiDummy,
  rupiah,
} from "@/lib/pesananDummy";
import { usePesananPembeli } from "@/lib/db/usePesananPembeli";
import PanelPesananNyata from "@/components/chat/PanelPesananNyata";
import {
  MENIT_GENTING,
  menitMenunggu,
  sedangDijeda,
  teksMenunggu,
  teksSisaJeda,
} from "@/lib/handover";

/* ---------------- Peta klasifikasi (ACTIONS di dashboard.js) --------------- */

const ACTION_META: Record<ActionCode, { tag: string; conf: string }> = {
  AUTO_REPLY: { tag: "AUTO", conf: "Sumber: Knowledge Base · keyakinan tinggi" },
  ASK_INFORMATION: { tag: "TANYA", conf: "Butuh info tambahan sebelum menjawab" },
  HANDOVER_TO_CS: { tag: "CS", conf: "Perlu ditangani CS manusia" },
  CHECK_ORDER_SYSTEM: { tag: "ORDER", conf: "Perlu cek data sistem pesanan" },
};

/** Lencana jenis percakapan non-asli (UJI / SIMULASI / CONTOH). */
function LencanaJenis({ c }: { c: Conversation }) {
  const jenis = jenisPercakapan(c);
  if (jenis === "asli") return null;
  return (
    <span
      title="Bukan pembeli asli"
      className="shrink-0 rounded-md bg-[#fef3c7] px-1.5 py-px text-[0.58rem] font-extrabold tracking-wide text-[#92400e]"
    >
      {LABEL_JENIS[jenis]}
    </span>
  );
}

/* ---------------- Penyaringan daftar percakapan --------------- */

/** Nilai yang dicari sesuai lingkup dropdown (fieldValue di dashboard.js). */
function fieldValue(c: Conversation, scope: SearchScope) {
  switch (scope) {
    /* Nomor pesanan dan resi mundur ke nilai contoh bila kolomnya
       masih kosong. Tanpa ini, nomor yang JELAS terbaca di panel
       kanan tidak ditemukan saat diketik di kotak pencarian — dan
       kegagalan seperti itu membuat orang berhenti memercayai
       pencariannya sama sekali, termasuk untuk data yang sungguhan.

       Keduanya sengaja memakai fungsi yang sama dengan yang
       merender panel, bukan salinan logikanya. */
    case "pesanan":
      return idPesananDummy(c) ?? "";
    case "resi":
      return resiDummy(c) ?? "";
    case "chat":
      return c.messages.map((m) => m.content).join(" ");
    case "produk":
      return c.product_query;
    default:
      return c.customer_name ?? "";
  }
}

/** Bidang yang dicoba saat lingkupnya "Semua". */
const BIDANG_SEMUA: SearchScope[] = ["nama", "pesanan", "resi", "chat"];

/**
 * Cocokkan satu percakapan terhadap kata kunci pada lingkup tertentu.
 *
 * Lingkup "semua" mencoba tiap bidang SATU PER SATU, bukan
 * menggabungkannya jadi satu teks panjang. Bedanya bukan gaya:
 * cocokKata() punya aturan khusus untuk nilai yang berbentuk nomor
 * — yang membuat "Pesanan: 260909KMTPRWX" tetap ketemu — dan
 * aturan itu hanya berlaku kalau nilainya memang nomor itu
 * sendiri. Digabung dengan nama, toko, dan seluruh isi chat, nilai
 * itu berhenti berbentuk nomor dan aturannya mati diam-diam.
 */
function cocokLingkup(c: Conversation, scope: SearchScope, kunci: string): boolean {
  if (scope === "semua") {
    return BIDANG_SEMUA.some((s) => cocokKata(fieldValue(c, s), kunci));
  }
  return cocokKata(fieldValue(c, scope), kunci);
}


/** Kutipan pesan terakhir untuk baris daftar (dulu field `snippet`). */
function snippet(c: Conversation) {
  const last = c.messages[c.messages.length - 1];
  return last ? last.content.replace(/\s+/g, " ") : "";
}

/* ---------------- Panel: daftar toko ---------------- */

/* Sejak 12 Nov 2026 daftarnya dari marketplace_shops (lib/tokoChat.ts),
   dibagi tiga bagian:
     1. "Semua toko" — HANYA percakapan dari toko asli.
     2. Toko asli, dikelompokkan per marketplace.
     3. "Uji" — toko sandbox, Simulasi, dan Data contoh. Bisa dilipat,
        dan labelnya menegaskan isinya tidak sampai ke pembeli asli.
   Di mode demo (tanpa Supabase) bagian 3 tidak ada dan daftarnya
   tetap daftar contoh, seperti sebelumnya. */

const URUTAN_PLATFORM: Platform[] = ["shopee", "tiktok", "lazada"];

function BarisToko({
  label,
  logo,
  kelasLogo,
  n,
  aktif,
  dot,
  onClick,
  judul,
}: {
  label: string;
  logo: string;
  kelasLogo: string;
  n: number;
  aktif: boolean;
  dot?: string;
  onClick: () => void;
  judul?: string;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        title={judul ?? label}
        className={`flex w-full cursor-pointer items-center gap-2.5 border-none px-3.5 py-2.5 text-left transition ${
          aktif ? "bg-green-mint" : "bg-transparent hover:bg-green-soft"
        }`}
      >
        <span
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[0.7rem] font-extrabold text-white ${kelasLogo}`}
          aria-hidden
        >
          {logo}
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-[0.86rem] ${n > 0 ? "font-semibold" : "font-normal text-muted"}`}
        >
          {label}
        </span>
        {/* Angka nol sengaja TIDAK ditampilkan sebagai "0": yang berguna
            dilihat adalah toko mana yang ramai. */}
        {n > 0 && (
          <span className="shrink-0 rounded-lg bg-green-mint px-1.5 py-px text-[0.68rem] font-bold text-green-dark">
            {n}
          </span>
        )}
        {dot && <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />}
      </button>
    </li>
  );
}

function ShopsPanel({
  shops,
  sumber,
  active,
  total,
  perToko,
  jumlahSimulasi,
  jumlahContoh,
  galatToko,
  memuatToko,
  onMuatUlang,
  onPick,
  onIntegrate,
  onClose,
}: {
  shops: TokoChat[];
  sumber: SumberToko;
  active: string;
  /** Angka "Semua toko". */
  total: number;
  /** Berapa percakapan per nama toko — kunci huruf kecil semua. */
  perToko: Map<string, number>;
  jumlahSimulasi: number;
  jumlahContoh: number;
  galatToko: string | null;
  memuatToko: boolean;
  onMuatUlang: () => void;
  onPick: (name: string) => void;
  onIntegrate: () => void;
  onClose?: () => void;
}) {
  const asli = shops.filter((s) => !s.uji);
  const uji = shops.filter((s) => s.uji);
  const adaBagianUji = sumber === "db" && (uji.length > 0 || jumlahSimulasi > 0 || jumlahContoh > 0);
  const pilihanUji =
    active === PILIH_SIMULASI || active === PILIH_CONTOH || uji.some((s) => s.nama === active);
  const [bukaUji, setBukaUji] = useState(false);
  const ujiTerbuka = bukaUji || pilihanUji;
  const totalUji =
    uji.reduce((a, s) => a + (perToko.get(s.nama.toLowerCase()) ?? 0), 0) + jumlahSimulasi + jumlahContoh;

  const barisToko = (s: TokoChat) => (
    <BarisToko
      key={s.nama}
      label={s.nama}
      logo={HURUF_LOGO[s.platform]}
      kelasLogo={KELAS_LOGO[s.platform]}
      n={perToko.get(s.nama.toLowerCase()) ?? 0}
      aktif={s.nama === active}
      dot={s.aktif ? "bg-green" : "bg-[#cbd5e1]"}
      judul={s.aktif ? s.nama : `${s.nama} — nonaktif`}
      onClick={() => onPick(s.nama)}
    />
  );

  return (
    <div className="flex h-full flex-col bg-white">
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="m-2 cursor-pointer rounded-xl border border-line bg-white px-3 py-2 font-bold text-text-2"
        >
          ✕ Tutup
        </button>
      )}
      <div className="flex items-center justify-between border-b border-line px-3.5 py-3">
        <span className="text-[0.9rem] font-bold">Toko Terhubung</span>
      </div>
      <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
        {/* "Semua toko" harus ada, dan harus jadi pilihan awal.
            Tanpanya, layar pertama yang dilihat CS adalah daftar
            toko teratas — yang kebetulan belum punya satu percakapan
            pun — dan console terlihat seperti kosong padahal penuh. */}
        <BarisToko
          label="Semua toko"
          logo="∀"
          kelasLogo="bg-green"
          n={total}
          aktif={active === SEMUA_TOKO}
          judul={sumber === "db" ? "Semua toko asli — tanpa data uji, simulasi, dan contoh" : "Semua toko"}
          onClick={() => onPick(SEMUA_TOKO)}
        />

        {galatToko && (
          <li className="mx-3 my-2 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[0.74rem] text-[#b91c1c]">
            Daftar toko gagal dimuat ({galatToko}).{" "}
            <button
              type="button"
              onClick={onMuatUlang}
              className="cursor-pointer border-none bg-transparent p-0 font-bold text-[#b91c1c] underline"
            >
              Coba lagi
            </button>
          </li>
        )}
        {memuatToko && (
          <li className="px-3.5 py-2 text-[0.76rem] text-muted">Memuat daftar toko…</li>
        )}
        {sumber === "db" && !memuatToko && !galatToko && asli.length === 0 && (
          <li className="px-3.5 py-2 text-[0.76rem] text-muted">Belum ada toko asli yang terhubung.</li>
        )}

        {URUTAN_PLATFORM.map((p) => {
          const kelompok = asli.filter((s) => s.platform === p);
          if (kelompok.length === 0) return null;
          return (
            <li key={p}>
              <div className="px-3.5 pt-3 pb-1 text-[0.68rem] font-bold tracking-wider text-muted uppercase">
                {LABEL_PLATFORM[p]}
              </div>
              <ul className="m-0 list-none p-0">{kelompok.map(barisToko)}</ul>
            </li>
          );
        })}

        {adaBagianUji && (
          <li className="mt-2 border-t border-line">
            <button
              type="button"
              onClick={() => setBukaUji((b) => !b)}
              aria-expanded={ujiTerbuka}
              className="flex w-full cursor-pointer items-center gap-2 border-none bg-[#fffbeb] px-3.5 py-2.5 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[0.72rem] font-bold tracking-wider text-[#92400e] uppercase">
                  🧪 Uji {!ujiTerbuka && totalUji > 0 ? `(${totalUji})` : ""}
                </span>
                <span className="block text-[0.68rem] text-[#92400e]">Tidak sampai ke pembeli asli</span>
              </span>
              <span className="text-[0.8rem] text-[#92400e]" aria-hidden>
                {ujiTerbuka ? "▾" : "▸"}
              </span>
            </button>
            {ujiTerbuka && (
              <ul className="m-0 list-none bg-[#fffdf5] p-0">
                {uji.map(barisToko)}
                <BarisToko
                  label="Simulasi"
                  logo="🛍"
                  kelasLogo="bg-[#f59e0b]"
                  n={jumlahSimulasi}
                  aktif={active === PILIH_SIMULASI}
                  judul="Percakapan buatan tombol Simulasi"
                  onClick={() => onPick(PILIH_SIMULASI)}
                />
                <BarisToko
                  label="Data contoh"
                  logo="📄"
                  kelasLogo="bg-[#94a3b8]"
                  n={jumlahContoh}
                  aktif={active === PILIH_CONTOH}
                  judul="Percakapan contoh bawaan — bukan dari marketplace"
                  onClick={() => onPick(PILIH_CONTOH)}
                />
              </ul>
            )}
          </li>
        )}
      </ul>
      <button
        type="button"
        onClick={onIntegrate}
        className="m-3 cursor-pointer rounded-xl border border-green bg-green-soft px-3 py-2.5 font-bold text-green-dark transition hover:bg-green-mint"
      >
        ＋ Integrasikan Toko Baru
      </button>
    </div>
  );
}

/* ---------------- Badge lama menunggu ---------------- */

/**
 * Berdetak sendiri tiap 30 detik.
 *
 * Tanpa itu angkanya membeku pada saat halaman dimuat. CS yang
 * membiarkan tab terbuka sepanjang shift — yang memang kebiasaan
 * normal — akan melihat "2 menit" pada kasus yang sebenarnya sudah
 * menunggu satu jam, persis kebalikan dari gunanya badge ini.
 *
 * 30 detik dipilih karena satuan terkecil yang ditampilkan adalah
 * menit; memperbarui lebih sering hanya menghabiskan render tanpa
 * mengubah satu huruf pun di layar.
 */
function BadgeMenunggu({ sejak }: { sejak: string }) {
  const [, tik] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tik((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const menit = menitMenunggu(sejak);
  const genting = menit >= MENIT_GENTING;
  return (
    <span
      title={`Menunggu CS sejak ${stempel(sejak)}`}
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[0.6rem] font-extrabold ${
        genting ? "bg-[#fee2e2] text-[#b91c1c]" : "bg-green-mint text-green-dark"
      }`}
    >
      ⏳ {teksMenunggu(menit)}
    </span>
  );
}

/* ---------------- Panel: daftar percakapan ---------------- */

type FilterKey = "all" | "unread" | "cs" | "menunggu";

function ConversationsPanel({
  rows,
  activeId,
  filter,
  setFilter,
  counts,
  menungguSejak,
  jumlahSimulasi,
  tersembunyi,
  adaPenyaring,
  tokoDipilih,
  pesanKosong,
  onPick,
  onClose,
}: {
  rows: Conversation[];
  activeId: string;
  filter: FilterKey;
  setFilter: (f: FilterKey) => void;
  counts: { unread: number; menunggu: number; cs: number };
  /** id percakapan -> sejak kapan eskalasinya terbuka. */
  menungguSejak: Map<string, string>;
  /** Berapa percakapan buatan simulasi yang bisa dibersihkan. */
  jumlahSimulasi: number;
  /** Cocok dengan tab ini, tetapi disembunyikan toko/pencarian. */
  tersembunyi: number;
  /** Ada penyaring yang sedang menyala sama sekali? */
  adaPenyaring: boolean;
  /** Satu toko tertentu sedang dipilih (bukan "Semua toko"). */
  tokoDipilih: boolean;
  /** Kalimat khusus saat daftar kosong; menang atas kalimat bawaan. */
  pesanKosong?: string | null;
  onPick: (id: string) => void;
  onClose?: () => void;
}) {
  /* Dibaca langsung dari store, bukan diteruskan lewat prop.
     Papan croscek tidak ada hubungannya dengan percakapan mana pun,
     jadi menyalurkannya turun lewat halaman hanya menambah dua
     lapis prop tanpa menambah kejelasan apa pun. */
  const croscek = useCroscek();

  return (
    <div className="flex h-full flex-col border-r border-line bg-white">
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="m-2 cursor-pointer rounded-xl border border-line bg-white px-3 py-2 font-bold text-text-2"
        >
          ✕ Tutup
        </button>
      )}

      {/* overflow-x-auto sejak tab keempat. Empat label tidak muat di
          layar sempit, dan tab yang terpotong tanpa cara menggulirnya
          sama saja dengan tab yang tidak ada. */}
      {/* Hanya bergulir ke kanan-kiri (17 Sep 2026). overflow-x-auto saja
          membuat browser ikut menyalakan sumbu vertikal, dan -mb-px pada
          tombol tab di bawah melimpah 1px — cukup untuk memunculkan
          bilah gulir atas-bawah yang mengganggu. overflow-y-hidden
          mematikan sumbu itu; pb-px memberi ruang 1px itu di dalam
          kotak, supaya garis bawah tab aktif tidak ikut terpotong. */}
      <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line px-2 pt-2 pb-px">
        {(
          [
            { key: "all", label: "Semua", n: 0, warn: false },
            { key: "unread", label: "Belum dibaca", n: counts.unread, warn: false },
            /* "Menunggu balasan", bukan "Belum terjawab".

               Tab di sebelahnya sudah berbunyi "Belum dibaca", dan dua
               label yang sama-sama diawali "Belum" akan tertukar
               justru saat sedang buru-buru — yaitu saat tab ini paling
               dibutuhkan. Keduanya memang berbeda: "belum dibaca"
               berubah begitu ada yang MEMBUKA, yang ini baru berubah
               kalau ada yang MEMBALAS. */
            { key: "menunggu", label: "Menunggu balasan", n: counts.menunggu, warn: true },
            { key: "cs", label: "Perlu CS", n: counts.cs, warn: true },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            aria-pressed={filter === t.key}
            className={[
              "-mb-px flex cursor-pointer items-center gap-1.5 border-x-0 border-t-0 border-b-2 bg-transparent px-2.5 py-2 text-[0.82rem] font-bold whitespace-nowrap transition",
              filter === t.key
                ? "border-green text-green-dark"
                : "border-transparent text-muted hover:text-text-2",
            ].join(" ")}
          >
            {t.label}
            {t.n > 0 && (
              <span
                className={`rounded-lg px-1.5 py-px text-[0.68rem] font-bold ${
                  t.warn ? "bg-[#fee2e2] text-[#b91c1c]" : "bg-green-mint text-green-dark"
                }`}
              >
                {t.n}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Kotak "Cari nama atau nomor pesanan…" DIHAPUS 11 Sep 2026.

          Ia mencari bidang yang sama persis dengan kotak pencarian di
          topbar — nama, nomor pesanan, resi, isi chat, produk — hanya
          dengan lingkup terkunci "semua". Dua kotak pencarian di satu
          layar bukan sekadar berlebihan: keduanya menyaring daftar
          yang sama secara bersamaan, jadi mengetik di salah satunya
          sementara yang lain masih terisi memberi hasil yang tidak
          bisa dijelaskan tanpa memeriksa dua tempat.

          Yang di topbar yang dipertahankan karena ia bisa lebih:
          punya pemilih lingkup dan pencarian massal. */}

      {/* Penanda mode demo — di kepala daftar, bukan melayang di atas
          composer (versi melayang menutupi tombol Kirim). */}
      <div className="border-b border-line-soft px-2 py-2">
        <DemoNotice detail="Balasan tersimpan selama sesi ini." />
      </div>

      <SimulasiPesan jumlahSimulasi={jumlahSimulasi} />
      <SinkronTiktok />

      {/* Jalan kembali ke papan yang disembunyikan. Tanpa tombol
          ini, menutup papan berarti kehilangan daftarnya untuk
          selamanya — datanya masih ada di localStorage, tapi tidak
          ada satu pun cara memanggilnya lagi. */}
      {croscek.nomor.length > 0 && !croscek.buka && (
        <div className="border-b border-line-soft px-2 py-2">
          <button
            type="button"
            onClick={() => bukaPapan(true)}
            className="w-full cursor-pointer rounded-xl border border-[#f59e0b]/50 bg-[#fffbeb] px-3 py-2 text-[0.78rem] font-bold text-[#92400e] transition hover:bg-[#fef3c7]"
          >
            📋 Buka papan croscek ({croscek.sudah.length}/{croscek.nomor.length})
          </button>
        </div>
      )}

      {/* Spanduk "N percakapan lain disembunyikan pilihan toko" dihapus
          17 Sep 2026 atas permintaan pemilik proyek: muncul setiap kali
          admin memilih satu toko, padahal memilih toko memang berarti
          ingin menyembunyikan toko lain. Keadaan yang benar-benar
          berbahaya — daftar KOSONG padahal yang menunggu ada di toko
          lain — tetap dikatakan lewat kalimat kosong di bawah. */}
      <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
        {rows.length === 0 && (
          <li className="px-4 py-8 text-center text-[0.84rem] text-muted">
            {/* Tiga kalimat, bukan dua. "Tidak ada yang menunggu CS 🎉"
                hanya boleh muncul kalau memang tidak ada — kalau yang
                menunggu sebenarnya ada tetapi tersembunyi penyaring,
                ucapan selamat itu menyuruh CS pulang dari antrean yang
                masih terisi. */}
            {/* Kalimat untuk pilihan toko diganti 17 Sep 2026 atas
                permintaan pemilik proyek. Pencarian tetap punya
                kalimatnya sendiri: "untuk toko ini" salah kalau yang
                menyembunyikan adalah kotak cari, bukan toko. */}
            {pesanKosong
              ? pesanKosong
              : tersembunyi > 0
              ? tokoDipilih
                ? "Belum ada pesan masuk untuk toko ini."
                : "Tidak ada percakapan yang cocok dengan pencarian ini."
              : adaPenyaring
                ? "Tidak ada percakapan yang cocok dengan penyaring ini."
                : filter === "cs"
                  ? "Tidak ada yang menunggu CS 🎉"
                  : filter === "menunggu"
                    ? "Semua chat sudah dibalas 🎉"
                    : "Tidak ada percakapan yang cocok."}
          </li>
        )}
        {rows.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onPick(c.id)}
              className={`flex w-full cursor-pointer items-start gap-2.5 border-none border-b border-b-line-soft px-3.5 py-3 text-left transition ${
                c.id === activeId
                  ? "bg-green-mint"
                  : c.unread
                    ? "bg-green-soft hover:bg-green-mint"
                    : "bg-white hover:bg-green-soft"
              }`}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-green text-[0.78rem] font-bold text-white">
                {inisial(c.customer_name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={`truncate text-[0.88rem] ${c.unread ? "font-extrabold" : "font-semibold"}`}
                    >
                      {c.customer_name}
                    </span>
                    <LencanaJenis c={c} />
                  </span>
                  <span className="shrink-0 text-[0.72rem] text-muted">
                    {jam(c.last_message_at)}
                  </span>
                </span>
                <span className="mt-1 flex items-center justify-between gap-2">
                  <span className="truncate text-[0.78rem] text-muted">{snippet(c)}</span>
                  {/* Lama menunggu menggantikan lencana tindakan pada
                      percakapan yang sedang mengantre. Menampilkan
                      keduanya berarti mengulang hal yang sama: sebuah
                      eskalasi terbuka SELALU ber-action HANDOVER, jadi
                      lencana itu tidak menambah satu pun informasi —
                      sementara "sudah 23 menit" menambah banyak. */}
                  {menungguSejak.has(c.id) ? (
                    <BadgeMenunggu sejak={menungguSejak.get(c.id)!} />
                  ) : (
                    c.action && (
                      <span
                        className={`shrink-0 rounded-md px-1.5 py-0.5 text-[0.6rem] font-extrabold ${actionTagClass(c.action)}`}
                      >
                        {ACTION_META[c.action].tag}
                      </span>
                    )
                  )}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- Panel kanan: info pelanggan ---------------- */

type InfoTab = "pesanan" | "produk" | "voucher";

function InfoPanel({
  c,
  onClose,
}: {
  c: Conversation;
  onClose?: () => void;
}) {
  const [tab, setTab] = useState<InfoTab>("pesanan");
  /* Kata kunci awal mengikuti konteks percakapan. Saat percakapan
     berganti, komponen ini dipasang ulang lewat prop `key` di
     pemanggilnya — jadi tidak perlu menyalin state lewat effect. */
  const [q, setQ] = useState(c.product_query);
  const catalog = useCatalog();

  /* Dihitung ulang hanya saat percakapan atau katalog berganti.
     Isinya deterministik dari id percakapan, jadi hasilnya sama
     setiap kali — nomor pesanan yang dicari CS tidak akan berpindah
     di antara dua render. */
  const pesanan = useMemo(
    () => buatPesananDummy(c, catalog.products),
    [c, catalog.products],
  );

  /* Pesanan NYATA dari tabel orders (sinkronisasi Shopee), dicocokkan
     lewat order_id, id pembeli, atau nama akun. Bila ada, ini yang
     tampil; pesanan contoh di atas hanya cadangan. */
  const nyata = usePesananPembeli(c);

  const matches = useMemo(
    () => searchProducts(catalog.products, q, 20),
    [catalog.products, q],
  );

  return (
    /* TIGA BAGIAN: kepala tetap, isi menggulir, ringkasan tetap.
       Sebelum ini akar panel yang diberi overflow-y-auto, sementara
       isi tab diberi `min-h-0 flex-1` TANPA gulir sendiri. Di dalam
       wadah yang menggulir, kombinasi itu menyuruh isinya menyusut
       ke tinggi yang tersedia sambil isinya sendiri melimpah keluar
       tanpa dipotong — dan daftar produk yang panjang tercetak
       menimpa blok Ringkasan Internal CS di bawahnya.

       Yang menggulir sekarang HANYA bagian tengah. Akarnya tidak. */
    <div className="flex h-full min-h-0 flex-col border-l border-line bg-white">
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="m-2 shrink-0 cursor-pointer rounded-xl border border-line bg-white px-3 py-2 font-bold text-text-2"
        >
          ✕ Tutup
        </button>
      )}

      <div className="flex shrink-0 items-center gap-3 border-b border-line p-3.5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-green text-[0.95rem] font-bold text-white">
          {inisial(c.customer_name)}
        </span>
        <div className="min-w-0">
          <div className="truncate font-bold">{c.customer_name}</div>
          <div className="mt-0.5 truncate text-[0.78rem] text-muted">
            {(c.shop_name ?? "").split(" · ")[0]}{" "}
            <span className="rounded bg-green-mint px-1 text-[0.66rem] font-bold text-green-dark">
              ID
            </span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 gap-1 border-b border-line px-2 pt-2">
        {(
          [
            { key: "pesanan", label: "Pesanan" },
            { key: "produk", label: "Rincian Produk" },
            { key: "voucher", label: "Voucher" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={[
              "-mb-px cursor-pointer border-x-0 border-t-0 border-b-2 bg-transparent px-2.5 py-2 text-[0.8rem] font-bold whitespace-nowrap transition",
              tab === t.key
                ? "border-green text-green-dark"
                : "border-transparent text-muted hover:text-text-2",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Satu-satunya bagian yang menggulir. */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
        {tab === "pesanan" &&
          (nyata.daftar.length > 0 ? (
            <PanelPesananNyata daftar={nyata.daftar} />
          ) : pesanan ? (
            <div className="flex flex-col gap-3">
              {/* Ditandai TEGAS. Pembeli ini tidak punya pesanan di tabel
                  orders, jadi yang tampil adalah contoh; CS yang mengira
                  angka di bawah nyata bisa menjanjikan pengiriman yang
                  tidak pernah ada. */}
              <DemoNotice
                sumber="contoh"
                detail={
                  nyata.keadaan === "memuat"
                    ? "Mencari pesanan pembeli ini di tabel orders…"
                    : "Pesanan contoh. Pembeli ini belum punya pesanan dari API marketplace — dicocokkan lewat nomor pesanan, id pembeli, dan nama akun."
                }
              />

              <div className="rounded-2xl border border-line p-3.5">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-[0.86rem] font-bold break-all">
                      #{pesanan.id}
                    </div>
                    <div className="mt-0.5 text-[0.72rem] text-muted">
                      {tanggalPanjang(pesanan.tanggal)}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-md bg-green-mint px-1.5 py-0.5 text-[0.66rem] font-extrabold text-green-dark">
                    {pesanan.status}
                  </span>
                </div>

                <div className="flex justify-between py-1 text-[0.82rem]">
                  <span className="text-muted">Kurir</span>
                  <b>{pesanan.kurir}</b>
                </div>
                <div className="flex justify-between gap-3 py-1 text-[0.82rem]">
                  <span className="shrink-0 text-muted">Resi</span>
                  <b className="truncate font-mono">{pesanan.resi}</b>
                </div>
              </div>

              {pesanan.item.length > 0 && (
                <div className="rounded-2xl border border-line p-3.5">
                  <div className="mb-2 text-[0.82rem] font-bold">Rincian Barang</div>
                  <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                    {pesanan.item.map((it) => (
                      <li key={it.sku} className="flex items-start gap-2.5">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-green-mint">
                          🌱
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[0.8rem] leading-snug font-semibold">
                            {it.nama}
                          </span>
                          <span className="mt-0.5 block text-[0.7rem] text-muted">
                            {it.sku} · {it.qty} × {rupiah(it.harga)}
                          </span>
                        </span>
                        <b className="shrink-0 text-[0.78rem] tabular-nums">
                          {rupiah(it.harga * it.qty)}
                        </b>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-3 border-t border-line pt-2.5">
                    <div className="flex justify-between py-0.5 text-[0.78rem]">
                      <span className="text-muted">Ongkir</span>
                      <span className="tabular-nums">{rupiah(pesanan.ongkir)}</span>
                    </div>
                    <div className="flex justify-between py-0.5 text-[0.88rem] font-extrabold">
                      <span>Total</span>
                      <span className="tabular-nums">{rupiah(pesanan.total)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid place-items-center py-10 text-center">
              <div className="text-3xl opacity-40" aria-hidden>
                📦
              </div>
              <p className="mt-2 mb-0 text-[0.84rem] text-muted">
                Tidak Ada Pesanan dalam 1 Bulan Terakhir
              </p>
              {/* Percakapan simulasi memang tidak punya pesanan, dan
                  itu perlu dikatakan — kalau tidak, tab kosong di sini
                  terbaca sebagai fitur yang rusak. */}
              {(c.customer_id ?? "").startsWith("sim_") && (
                <p className="mt-1 mb-0 text-[0.72rem] text-muted">
                  Percakapan simulasi tidak dibuatkan pesanan.
                </p>
              )}
            </div>
          ))}

        {tab === "produk" && (
          <>
            <div className="flex items-center gap-2 rounded-xl border border-line bg-green-soft px-3 py-2">
              <span aria-hidden className="opacity-50">
                🔍
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari produk / SKU…"
                aria-label="Cari produk"
                className="w-full border-none bg-transparent text-[0.86rem] outline-none"
              />
            </div>
            <div className="mt-2 text-[0.74rem] text-muted">
              Menampilkan <b className="text-text">{matches.length}</b> hasil ·{" "}
              {catalogStatusText(catalog)}
            </div>
            <div className="mt-2 flex flex-col gap-2">
              {matches.length === 0 && (
                <div className="py-6 text-center text-[0.82rem] text-muted">
                  Produk tidak ditemukan. Coba kata kunci lain.
                </div>
              )}
              {matches.map((p) => (
                <div
                  key={p.sku}
                  className="flex items-start gap-2.5 rounded-xl border border-line p-2.5"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-green-mint">
                    🌱
                  </span>
                  <div className="min-w-0">
                    <div className="text-[0.82rem] font-semibold">{p.nama_produk}</div>
                    <div className="mt-0.5 text-[0.72rem] text-muted">
                      {p.sku} · {p.kategori}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "voucher" && (
          <div className="grid place-items-center py-10 text-center">
            <div className="text-3xl opacity-40" aria-hidden>
              🎟️
            </div>
            <p className="mt-2 mb-0 text-[0.84rem] text-muted">
              Belum ada voucher aktif untuk pelanggan ini.
            </p>
          </div>
        )}
      </div>

      {/* Ringkasan handover internal — format dari claude.md.

          Dibatasi 38% tinggi panel dan menggulir sendiri. Tanpa
          batas itu, ringkasan handover yang panjang mendesak bagian
          tengah sampai tinggal beberapa piksel — daftar produknya
          tetap ada dan tetap bisa digulir, tapi jendelanya menyempit
          sampai tidak ada gunanya. */}
      <div className="max-h-[38%] shrink-0 overflow-y-auto border-t border-line p-3.5">
        <div className="mb-2 text-[0.82rem] font-bold">📝 Ringkasan Internal CS</div>

        {/* Keadaan jeda ditampilkan terpisah dari ringkasan, karena
            ia satu-satunya baris di panel ini yang berubah sendiri
            seiring waktu — sisanya beku sejak handover dibuat.
            Tanpa baris ini CS tidak punya cara mengetahui bahwa
            balasan otomatis sedang dimatikan untuk pelanggan ini. */}
        {sedangDijeda(c.ai_paused_until) && (
          <p className="mt-0 mb-2.5 rounded-xl bg-green-mint px-2.5 py-2 text-[0.76rem] leading-relaxed text-green-dark">
            <b>🤖 AI dijeda</b> — balasan otomatis dimatikan untuk percakapan ini.
            Aktif lagi {teksSisaJeda(c.ai_paused_until)}, dan setiap balasan Kakak
            memundurkannya 24 jam lagi.
          </p>
        )}
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[0.8rem]">
          {Object.entries(c.handover_detail ?? {}).map(([k, v]) => (
            <li key={k} className="flex justify-between gap-3">
              <span className="text-muted">{k}</span>
              <b className="text-right">{v}</b>
            </li>
          ))}
          {c.action && (
            <li className="flex items-center justify-between gap-3">
              <span className="text-muted">Tindakan AI</span>
              <b
                className={`rounded-md px-1.5 py-0.5 text-[0.62rem] font-extrabold ${actionTagClass(c.action)}`}
              >
                {c.action}
              </b>
            </li>
          )}
        </ul>
        {c.handover_summary && (
          <p className="mt-2.5 mb-0 rounded-xl bg-green-soft p-2.5 text-[0.78rem] leading-relaxed text-text-2">
            {c.handover_summary}
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------------- Halaman ---------------- */

export default function Chat() {
  const conversations = useConversations();
  const escalations = useDb(selectEscalations);
  const search = useSearch();
  const toast = useToast();

  const [activeId, setActiveId] = useState<string>(conversations[0]?.id ?? "");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [draft, setDraft] = useState("");
  const router = useRouter();
  const tokoChat = useTokoChat();
  /* Toko yang ditambahkan lewat modal — HANYA di mode demo (tanpa
     Supabase). Di mode database, menambah toko berarti otorisasi
     sungguhan di Pengaturan; baris karangan di sini akan berbohong. */
  const [tokoDemo, setTokoDemo] = useState<TokoChat[]>([]);
  const [activeShop, setActiveShop] = useState<string>(SEMUA_TOKO);
  const modeDb = tokoChat.sumber === "db";
  const [modal, setModal] = useState(false);
  const [overlay, setOverlay] = useState<null | "shops" | "conv" | "info">(null);
  const [meminta, setMeminta] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);

  /* `active` dihitung di bawah, setelah `rows`: percakapan yang dibuka
     bawaan harus diambil dari daftar yang TERLIHAT. Sebelumnya ia
     selalu conversations[0] — di mode database itu bisa percakapan
     contoh, yang tampil di jendela chat sementara daftar "Semua toko"
     (yang kini hanya toko asli) tidak memuatnya. */

  /* --- Antrean "Perlu CS" bersandar pada eskalasi TERBUKA --------

     Sebelum ini tabnya menyaring `action === "HANDOVER_TO_CS"`.
     Itu tidak pernah bisa jadi antrean, karena `action` adalah
     catatan keputusan terakhir AI dan tidak pernah berubah setelah
     CS menanganinya — daftarnya hanya bertambah panjang, tidak
     pernah berkurang, sampai berhenti dibaca orang.

     `escalations.status` justru bergerak: dibuka saat handover,
     ditutup oleh balasan pertama dari manusia (lihat appendMessage
     di lib/db/store.ts). Itulah yang membuatnya antrean. */
  const menungguSejak = useMemo(() => {
    const peta = new Map<string, string>();
    for (const e of escalations) {
      if (e.status !== "open" || !e.conversation_id) continue;
      // Kalau satu percakapan punya beberapa eskalasi terbuka,
      // yang dihitung adalah yang PALING LAMA menunggu.
      const ada = peta.get(e.conversation_id);
      if (!ada || e.created_at < ada) peta.set(e.conversation_id, e.created_at);
    }
    return peta;
  }, [escalations]);

  /* --- Penyaring di luar tab: toko, kotak cari panel, cari topbar --

     Dipisahkan dari tab dan dihitung SEKALI, lalu dipakai daftar DAN
     angka di lencana tab. Sebelum 10 Sep 2026 keduanya dihitung
     sendiri-sendiri: lencana hanya memperhitungkan toko, sedangkan
     daftar juga memperhitungkan pencarian. Akibatnya tab "Perlu CS"
     bisa menulis 3 sementara daftarnya berbunyi "Tidak ada yang
     menunggu CS 🎉" — dua kalimat di layar yang sama yang saling
     membantah, tanpa satu pun galat.

     Dilaporkan pemilik proyek setelah mengirim foto dari /simulasi:
     angkanya naik, percakapannya tidak pernah muncul. Sekarang
     mustahil berselisih, karena sumbernya satu. */
  const dasar = useMemo(() => {
    return conversations.filter((c) => {
      /* Penyaringan toko — sampai 10 Sep 2026 baris ini TIDAK ADA.
         `activeShop` disimpan, warnanya berubah saat diklik, tetapi
         daftar percakapannya tidak pernah ikut berubah. Toko yang
         berbeda menampilkan pelanggan yang persis sama, dan tidak
         ada galat apa pun yang menunjukkan bahwa itu keliru. */
      /* Mode database (12 Nov 2026): "Semua toko" hanya toko asli;
         uji/simulasi/contoh punya pilihan sendiri. Mode demo tetap
         perilaku lama — semua percakapan dicocokkan lewat nama toko. */
      if (modeDb ? !cocokPilihan(c, activeShop) : !cocokToko(c.shop_name, activeShop)) return false;

      /* Pencarian topbar (lingkup + massal), sama seperti dashboard.js
         — dan sejak 11 Sep 2026 inilah SATU-SATUNYA pencarian yang
         menyaring daftar ini. Kotak kedua di kepala panel sudah
         dihapus; ia mencari bidang yang sama dengan lingkup terkunci
         "semua", jadi dua kotak terisi sekaligus memberi hasil yang
         tidak bisa dijelaskan tanpa memeriksa dua tempat. */
      if (search.terms.length) {
        if (!search.terms.some((t) => cocokLingkup(c, search.scope, t))) return false;
      } else if (search.single.trim()) {
        if (!cocokLingkup(c, search.scope, search.single.trim())) return false;
      }
      return true;
    });
  }, [conversations, search, activeShop, modeDb]);

  /** Apakah sebuah percakapan masuk tab yang sedang dibuka. */
  const cocokTab = useCallback(
    (c: Conversation) => {
      if (filter === "unread") return c.unread;
      if (filter === "menunggu") return belumTerjawab(c.messages);
      if (filter === "cs") return menungguSejak.has(c.id);
      return true;
    },
    [filter, menungguSejak],
  );

  const rows = useMemo(() => {
    const tersaring = dasar.filter(cocokTab);

    /* Urutan antrean berlawanan dengan urutan inbox, dan itu
       disengaja. Daftar biasa menaruh yang terbaru di atas; antrean
       menaruh yang PALING LAMA MENUNGGU di atas, karena aturan
       balasan di bawah 15 menit hanya bisa dijaga kalau yang paling
       terancam melanggar terlihat lebih dulu. */
    /* Alasan yang sama berlaku untuk "Menunggu balasan", hanya
       jamnya diambil dari tempat berbeda: tab Perlu CS punya baris
       eskalasi dengan created_at sendiri, sedangkan di sini yang
       menandai lamanya menunggu adalah pesan terakhir pelanggan. */
    if (filter === "menunggu") {
      return [...tersaring].sort(
        (a, b) => Date.parse(a.last_message_at) - Date.parse(b.last_message_at),
      );
    }

    if (filter !== "cs") return tersaring;
    return [...tersaring].sort(
      (a, b) =>
        Date.parse(menungguSejak.get(a.id) ?? "") -
        Date.parse(menungguSejak.get(b.id) ?? ""),
    );
  }, [dasar, cocokTab, filter, menungguSejak]);

  /* Percakapan yang dibuka: pilihan CS bila masih ada, kalau tidak
     baris teratas dari daftar yang TERLIHAT. Di mode demo tetap jatuh
     ke percakapan pertama seperti dulu. */
  const active =
    conversations.find((c) => c.id === activeId) ??
    rows[0] ??
    (modeDb ? null : conversations[0]) ??
    null;

  // Membuka percakapan = menandainya sudah dibaca (dashboard.js).
  useEffect(() => {
    if (active) markRead(active.id);
  }, [active]);

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [active?.id, active?.messages.length]);

  /* Hitungan per toko — dipakai lencana di panel kiri.
     Sengaja dihitung atas SELURUH percakapan, bukan atas `rows`:
     gunanya justru memberi tahu ada apa di toko yang sedang TIDAK
     dipilih. Kalau ikut tersaring, semuanya akan selalu nol kecuali
     satu, dan lencananya tidak memberi informasi apa pun.

     Mode database memakai hitungPanel(): percakapan simulasi yang
     kebetulan memakai nama toko asli (mis. "infarm") TIDAK ikut
     angka toko itu. */
  const panel = useMemo(() => {
    if (modeDb) return hitungPanel(conversations);
    const perToko = new Map<string, number>();
    for (const c of conversations) {
      const kunci = namaTokoDari(c.shop_name).toLowerCase();
      if (!kunci) continue;
      perToko.set(kunci, (perToko.get(kunci) ?? 0) + 1);
    }
    return { asli: conversations.length, simulasi: 0, contoh: 0, perToko };
  }, [conversations, modeDb]);

  const shops = useMemo(
    () =>
      modeDb
        ? tokoTampil(tokoChat.toko, conversations, panel.perToko)
        : [...tokoChat.toko, ...tokoDemo],
    [modeDb, tokoChat.toko, conversations, panel.perToko, tokoDemo],
  );

  /* Angka tab dihitung atas `dasar` — persis himpunan yang dipakai
     daftar. Lencana yang berbunyi 3 karena itu selalu berarti tiga
     baris yang benar-benar bisa dilihat dan diklik. */
  const counts = {
    unread: dasar.filter((c) => c.unread).length,
    menunggu: dasar.filter((c) => belumTerjawab(c.messages)).length,
    cs: dasar.filter((c) => menungguSejak.has(c.id)).length,
  };

  /* --- Yang disembunyikan penyaring, dan harus tetap dikatakan ----

     Menyamakan lencana dengan daftar memperbaiki kebohongannya,
     tetapi memunculkan bahaya kedua yang lebih halus: percakapan
     yang menunggu CS di toko lain sekarang menghitung NOL, dan
     layar berbunyi "Tidak ada yang menunggu CS 🎉" pada saat ada
     orang yang benar-benar menunggu. Diam yang menenangkan justru
     lebih berbahaya daripada angka yang salah.

     Jadi yang tersembunyi tetap dihitung. Sejak 17 Sep 2026 angkanya
     hanya dipakai saat daftar KOSONG — spanduk yang muncul setiap kali
     satu toko dipilih dihapus karena mengganggu, sedangkan daftar
     kosong yang diam-diam menyembunyikan antrean tetap dikatakan. */
  /* Di mode database, "Semua toko" memang tidak memuat data uji —
     itu bukan "tersembunyi penyaring", jadi tidak dihitung di sini.
     Kalimat kosongnya sendiri diatur lewat `pesanKosong`. */
  const tersembunyi = useMemo(
    () =>
      conversations.filter(
        (c) => cocokTab(c) && (!modeDb || activeShop !== SEMUA_TOKO || jenisPercakapan(c) === "asli"),
      ).length - rows.length,
    [conversations, cocokTab, rows.length, modeDb, activeShop],
  );

  /* "Semua toko" kosong karena chat toko asli memang belum ada —
     harus dikatakan, dan harus menunjuk ke tempat data ujinya. */
  const pesanKosong =
    modeDb && activeShop === SEMUA_TOKO && panel.asli === 0
      ? conversations.length > 0
        ? "Belum ada chat dari toko asli. Chat uji, simulasi, dan contoh ada di bagian 🧪 Uji di panel toko."
        : "Belum ada chat dari toko asli."
      : null;

  const adaPenyaring =
    activeShop !== SEMUA_TOKO ||
    search.terms.length > 0 ||
    search.single.trim().length > 0;

  /* Dihitung atas SELURUH percakapan, bukan atas toko yang sedang
     dipilih. Tombol bersih-bersih menghapus semuanya sekaligus, jadi
     angkanya harus menyebut yang sebenarnya akan terhapus — bukan
     yang kebetulan sedang terlihat. */
  const jumlahSimulasi = conversations.filter((c) =>
    (c.customer_id ?? "").startsWith("sim_"),
  ).length;

  /* Calon untuk papan croscek — dari SELURUH percakapan, tanpa
     memedulikan toko yang dipilih maupun tab yang aktif.

     Daftar dari tim gudang tidak mengenal pembagian itu: satu
     nomor bisa milik toko mana pun. Kalau calonnya ikut tersaring,
     nomor yang sebenarnya ada akan dilaporkan "tidak ada
     percakapan" hanya karena CS kebetulan sedang membuka toko
     lain — dan CS akan menghubungi gudang untuk mengonfirmasi
     sesuatu yang tidak pernah salah. */
  const calonCroscek = useMemo(
    () =>
      conversations.map((c) => ({
        id: c.id,
        nama: c.customer_name ?? "(tanpa nama)",
        nomorPesanan: idPesananDummy(c) ?? "",
        nomorResi: resiDummy(c) ?? "",
      })),
    [conversations],
  );

  const pick = (id: string) => {
    setActiveId(id);
    setOverlay(null);
  };

  /* Percakapan hasil sinkronisasi marketplace.
     - TikTok: balasan dikirim SUNGGUHAN lewat /api/tiktok/kirim
       (disetujui 26 Okt 2026) dan baru dicatat setelah TikTok
       menerimanya.
     - Marketplace lain yang kelak ikut disinkronkan: Kirim ditutup,
       karena appendMessage() saja hanya menulis ke database kita dan
       CS akan mengira pembeli menerima balasannya. */
  const dariMarketplace = !!active?.external_conversation_id;
  const viaTiktok = dariMarketplace && active?.platform === "tiktok";
  const belumTersambung = dariMarketplace && !viaTiktok;
  const [mengirim, setMengirim] = useState(false);

  const kirimKeTiktok = async (id: string, text: string) => {
    setMengirim(true);
    try {
      const r = await fetch("/api/tiktok/kirim", {
        method: "POST",
        headers: await headerBerSesi(),
        body: JSON.stringify({ conversationId: id, teks: text }),
      });
      const d = (await r.json()) as { ok?: boolean; messageId?: string; error?: string };
      if (!r.ok || !d.ok) {
        /* Draf DIBIARKAN supaya CS bisa memperbaiki & mengirim ulang. */
        toast(`Belum terkirim: ${d.error ?? `HTTP ${r.status}`}`);
        return;
      }
      appendMessage(id, text, d.messageId || undefined);
      setDraft("");
      toast("Terkirim ke TikTok");
    } catch (e) {
      /* Jaringan putus SESUDAH permintaan berangkat bisa berarti
         TikTok sudah menerimanya. Sinkronkan dulu sebelum mengirim
         ulang, supaya pembeli tidak menerima pesan dobel. */
      toast(`Status tidak pasti (${(e as Error).message}). Sinkronkan dulu sebelum mengirim ulang.`);
    } finally {
      setMengirim(false);
    }
  };

  const kirim = () => {
    const text = draft.trim();
    if (!active) return;
    if (belumTersambung) {
      toast("Balas dari Seller Center dulu — kirim ke marketplace ini belum tersambung");
      return;
    }
    if (!text) {
      toast("Tulis pesan dulu, Kak");
      return;
    }
    if (viaTiktok) {
      if (!mengirim) void kirimKeTiktok(active.id, text);
      return;
    }
    appendMessage(active.id, text);
    setDraft("");
    toast("Pesan terkirim");
  };

  /** Tombol ✨ — memanggil /api/chat sungguhan (askClaude di dashboard.js). */
  const mintaSaran = async () => {
    if (!active || meminta) return;
    const lastIn = [...active.messages].reverse().find((m) => m.role === "user");
    const message = (lastIn?.content ?? snippet(active)).trim();
    if (!message) {
      toast("Belum ada pesan pelanggan untuk dianalisa");
      return;
    }

    setMeminta(true);
    toast("Meminta saran ke AI…");
    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        // Token sesi wajib ikut: percakapan ini sungguhan, dan
        // /api/chat perlu bisa menandainya bila jawabannya ternyata
        // harus dialihkan ke manusia. Tanpa token, penulisannya
        // berjalan sebagai anon dan ditolak RLS diam-diam.
        headers: await headerBerSesi(),
        // Inilah yang membedakan panggilan ini dari halaman AI
        // Chatbot: ada percakapan nyata di baliknya, jadi handover
        // yang diputuskan boleh dicatat ke antrean CS.
        body: JSON.stringify({ message, history: [], conversationId: active.id }),
      });
      /* 423 = penjaga saldo, bukan kerusakan.
         Dipisah dari galat lain karena keduanya terlihat sama di
         layar tetapi artinya berlawanan: yang satu "ada yang rusak",
         yang satu "sistem menolak membelanjakan uang Anda, sesuai
         perintah". Saat memperagakan ke orang lain, membiarkan
         keduanya berbunyi "AI belum aktif" membuat pengaman yang
         bekerja dengan benar terlihat seperti kegagalan. */
      if (resp.status === 423) {
        toast("🔒 Penguncian saldo aktif — Claude sengaja tidak dipanggil");
        return;
      }
      if (!resp.ok) throw new Error(String(resp.status));
      const data = (await resp.json()) as {
        action: ActionCode;
        reply: string;
        source?: string;
        sisaJeda?: string;
        handover?: { eskalasiBaru: boolean } | null;
      };

      // Percakapan sedang dijeda: balasannya sengaja kosong. Menimpa
      // draf dengan string kosong di sini berarti kalimat yang
      // sedang diketik CS hilang begitu saja — hukuman yang aneh
      // untuk menekan tombol saran.
      if (data.source === "dijeda") {
        toast(`Sedang ditangani CS — AI berhenti, aktif lagi ${data.sisaJeda}`);
        return;
      }

      setAiSuggestion(active.id, data.reply, data.action);
      setDraft(data.reply);
      toast(
        data.handover?.eskalasiBaru
          ? "Masuk antrean Perlu CS — AI dijeda 24 jam 🔔"
          : data.source === "template"
            ? "Balasan dari template (tanpa biaya AI) ✨"
            : "Saran dari Claude siap ✨",
      );
    } catch {
      // Sama seperti versi lama: tanpa API key, pakai saran contoh.
      setDraft(active.ai_suggestion ?? "");
      toast("AI belum aktif — pakai saran contoh");
    } finally {
      setMeminta(false);
    }
  };

  /* Di mode database tombol "Integrasikan Toko Baru" membuka bagian
     Integrasi di Pengaturan — tempat otorisasi yang sungguhan. Modal
     lama hanya menambah baris karangan di layar, dan itu hanya pantas
     di mode demo. */
  const integrasikan = () => {
    setOverlay(null);
    if (modeDb) router.push("/settings?bagian=integrasi");
    else setModal(true);
  };

  const panelToko = (onClose?: () => void) => (
    <ShopsPanel
      shops={shops}
      sumber={tokoChat.sumber}
      active={activeShop}
      total={panel.asli}
      perToko={panel.perToko}
      jumlahSimulasi={panel.simulasi}
      jumlahContoh={panel.contoh}
      galatToko={tokoChat.galat}
      memuatToko={tokoChat.memuat}
      onMuatUlang={tokoChat.muatUlang}
      onPick={(n) => {
        setActiveShop(n);
        /* Pilihan percakapan lama dilepas: kalau tidak, jendela chat
           tetap menampilkan percakapan dari toko sebelumnya. */
        setActiveId("");
        setOverlay(null);
      }}
      onIntegrate={integrasikan}
      onClose={onClose}
    />
  );

  const panelPercakapan = (onClose?: () => void) => (
    <ConversationsPanel
      rows={rows}
      activeId={active?.id ?? ""}
      filter={filter}
      setFilter={setFilter}
      counts={counts}
      menungguSejak={menungguSejak}
      jumlahSimulasi={jumlahSimulasi}
      tersembunyi={tersembunyi}
      adaPenyaring={adaPenyaring}
      tokoDipilih={activeShop !== SEMUA_TOKO}
      pesanKosong={pesanKosong}
      onPick={pick}
      onClose={onClose}
    />
  );

  /* Tanpa percakapan terpilih, panel toko dan daftar tetap tampil.
     Dulu seluruh halaman diganti satu kalimat "Belum ada
     percakapan." — di mode database itu berarti, selama toko asli
     belum punya chat, bagian 🧪 Uji tidak bisa dibuka sama sekali. */
  if (!active) {
    return (
      <div className="relative flex h-full min-h-0">
        <aside className="w-56 shrink-0 max-tablet:hidden">{panelToko()}</aside>
        <section className="w-72 shrink-0 max-mobile:hidden">{panelPercakapan()}</section>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-page">
          {/* Tombol pembuka panel hanya perlu di layar sempit. */}
          <div className="hidden gap-2 border-b border-line bg-white px-3.5 py-2.5 max-tablet:flex">
            <button
              type="button"
              onClick={() => setOverlay("shops")}
              title="Toko terhubung"
              className="hidden h-10 w-10 cursor-pointer rounded-xl border border-line bg-white max-tablet:block"
            >
              🏪
            </button>
            <button
              type="button"
              onClick={() => setOverlay("conv")}
              title="Daftar percakapan"
              className="hidden h-10 w-10 cursor-pointer rounded-xl border border-line bg-white max-mobile:block"
            >
              ☰
            </button>
          </div>
          <div className="grid flex-1 place-items-center p-6 text-center text-muted">
            {conversations.length === 0 ? "Belum ada percakapan." : "Pilih percakapan di daftar."}
          </div>
        </main>
        {overlay && overlay !== "info" && (
          <div className="absolute inset-0 z-40 bg-white">
            {overlay === "shops" ? panelToko(() => setOverlay(null)) : panelPercakapan(() => setOverlay(null))}
          </div>
        )}
        <PapanCroscek calon={calonCroscek} onPilih={(id) => pick(id)} />
      </div>
    );
  }

  const meta = ACTION_META[active.action ?? "AUTO_REPLY"];
  /* Saran yang berupa PEMBERITAHUAN (⏳ di luar jangkauan, 🔕 AI mati)
     bukan kalimat untuk pembeli — memasukkannya ke kotak ketik lalu
     menekan Kirim akan mengirim catatan internal ke pembeli TikTok. */
  const saranBisaDipakai =
    !!active.ai_suggestion && !/^\s*(⏳|🔕)/u.test(active.ai_suggestion);

  return (
    <div className="relative flex h-full min-h-0">
      {/* Panel 1 — toko (disembunyikan ≤980px) */}
      <aside className="w-56 shrink-0 max-tablet:hidden">{panelToko()}</aside>

      {/* Panel 2 — daftar percakapan (disembunyikan ≤760px) */}
      <section className="w-72 shrink-0 max-mobile:hidden">{panelPercakapan()}</section>

      {/* Panel 3 — jendela chat */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-page">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-white px-3.5 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setOverlay("shops")}
              title="Toko terhubung"
              className="hidden h-9 w-9 cursor-pointer rounded-xl border border-line bg-white max-tablet:block"
            >
              🏪
            </button>
            <button
              type="button"
              onClick={() => setOverlay("conv")}
              title="Daftar percakapan"
              className="hidden h-9 w-9 cursor-pointer rounded-xl border border-line bg-white max-mobile:block"
            >
              ☰
            </button>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-green text-[0.82rem] font-bold text-white">
              {inisial(active.customer_name)}
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-bold">{active.customer_name}</span>
                <LencanaJenis c={active} />
              </div>
              <div className="truncate text-[0.78rem] text-muted">{active.shop_name}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-[0.78rem] text-muted">
            <span>⏱ <b className="text-text">{jam(active.last_message_at)}</b></span>
            <span>💬 <b className="text-text">{active.chat_count}</b> chat</span>
            <button
              type="button"
              onClick={() => setOverlay("info")}
              title="Info pelanggan"
              className="hidden h-9 w-9 cursor-pointer rounded-xl border border-line bg-white max-wide:block"
            >
              ℹ️
            </button>
          </div>
        </div>

        <div ref={streamRef} className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-4 text-center">
            <span className="rounded-3xl bg-white px-3 py-1 text-[0.72rem] text-muted">
              {tanggalPanjang(active.created_at)}
            </span>
          </div>

          {active.messages.map((m, i) => {
            // 'cs' dan 'assistant' sama-sama keluar dari sisi toko,
            // jadi sama-sama di kanan. Yang membedakan bukan posisi,
            // melainkan siapa yang mengetiknya — dan itu ditandai di
            // bawah gelembung, bukan lewat warna, supaya percakapan
            // tidak berubah jadi lampu lalu lintas.
            const dariToko = m.role !== "user";
            return (
              <div
                key={i}
                className={`mb-3 flex flex-col ${dariToko ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[min(560px,78%)] rounded-2xl px-3.5 py-2.5 text-[0.88rem] leading-relaxed whitespace-pre-line ${
                    dariToko
                      ? "bg-green text-white"
                      : "border border-line bg-white text-text"
                  }`}
                >
                  {m.content}

                  {/* Lampiran. Ditampilkan sebagai tautan, BUKAN
                      <img>: URL-nya berasal dari marketplace dan
                      kedaluwarsa, dan gambar yang gagal dimuat
                      terlihat persis seperti pesan yang tidak punya
                      lampiran sama sekali. Tautan yang mati setidaknya
                      memberi tahu bahwa ada sesuatu di sana.

                      Membukanya di tab baru dengan noreferrer: alamat
                      console kami tidak perlu ikut terkirim ke server
                      marketplace. */}
                  {m.lampiran?.map((l, j) => (
                    <a
                      key={j}
                      href={l.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className={`mt-1.5 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[0.76rem] font-semibold no-underline ${
                        dariToko
                          ? "bg-white/20 text-white"
                          : "bg-green-mint text-green-dark"
                      }`}
                    >
                      <span aria-hidden>
                        {l.jenis === "gambar" ? "🖼️" : l.jenis === "video" ? "🎬" : "📎"}
                      </span>
                      {l.nama ?? (l.jenis === "gambar" ? "Foto" : "Lampiran")} — buka
                    </a>
                  ))}
                </div>
                <span className="mt-1 text-[0.7rem] text-muted">
                  {/* Hanya balasan mesin yang diberi tanda. Balasan
                      manusia adalah keadaan normal; menandai keduanya
                      membuat tandanya berhenti berarti. */}
                  {m.role === "assistant" && <b>🤖 AI · </b>}
                  {stempel(m.timestamp)}
                </span>
              </div>
            );
          })}
        </div>

        {/* AI Assist */}
        <div className="border-t border-line bg-white px-3.5 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-green-mint px-2 py-0.5 text-[0.74rem] font-bold text-green-dark">
              🤖 AI Assist
            </span>
            {/* Lencana & tingkat keyakinan hanya bila memang ada
                keputusan. Tanpa syarat ini percakapan tanpa action
                (chat marketplace yang belum dinilai) menampilkan
                lencana kosong dan "keyakinan tinggi" karangan. */}
            {active.action && (
              <>
                <span
                  className={`rounded-md px-1.75 py-0.5 text-[0.62rem] font-extrabold ${actionTagClass(active.action)}`}
                >
                  {active.action}
                </span>
                <span className="text-[0.76rem] text-muted">{meta.conf}</span>
              </>
            )}
          </div>
          {active.ai_suggestion ? (
            <p className="m-0 mb-2.5 rounded-xl bg-green-soft p-3 text-[0.86rem] leading-relaxed">
              {active.ai_suggestion}
            </p>
          ) : (
            <p className="m-0 mb-2.5 rounded-xl border border-dashed border-line p-3 text-[0.82rem] leading-relaxed text-muted">
              Belum ada saran AI untuk percakapan ini.
              {active.external_conversation_id
                ? " Tekan \"Sinkronkan chat TikTok\" untuk menilai pesan terbaru dengan template (gratis), atau ✨ untuk saran Claude (berbayar)."
                : " Tekan ✨ untuk meminta saran (bisa memanggil Claude — berbayar)."}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!saranBisaDipakai}
              onClick={() => {
                setDraft(active.ai_suggestion ?? "");
                toast("Balasan AI dimasukkan ke kotak ketik");
              }}
              className="cursor-pointer rounded-[10px] border-none bg-green px-3.5 py-1.5 text-[0.82rem] font-bold text-white transition hover:bg-green-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Gunakan balasan
            </button>
            <button
              type="button"
              disabled={!saranBisaDipakai}
              onClick={() => {
                setDraft(active.ai_suggestion ?? "");
                toast("Silakan edit balasan sebelum dikirim");
              }}
              className="cursor-pointer rounded-[10px] border border-line bg-white px-3.5 py-1.5 text-[0.82rem] font-bold text-text-2 transition hover:bg-green-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              Edit dulu
            </button>
            <button
              type="button"
              onClick={() => toast("Percakapan dialihkan ke CS manusia + ringkasan terkirim")}
              className="cursor-pointer rounded-[10px] border border-[#fecaca] bg-white px-3.5 py-1.5 text-[0.82rem] font-bold text-[#b91c1c] transition hover:bg-[#fee2e2]"
            >
              Alihkan ke CS
            </button>
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-line bg-white p-3">
          <div className="mb-2 flex items-center gap-1">
            {["😊", "🖼️", "🎬", "🏷️"].map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => toast("Alat ini belum tersedia di demo")}
                className="h-8 w-8 cursor-pointer rounded-lg border-none bg-transparent hover:bg-green-mint"
              >
                {i}
              </button>
            ))}
            <span className="flex-1" />
            <button
              type="button"
              onClick={mintaSaran}
              disabled={meminta}
              title="Minta saran AI"
              className="h-8 w-8 cursor-pointer rounded-lg border-none bg-transparent hover:bg-green-mint disabled:opacity-50"
            >
              ✨
            </button>
          </div>

          {belumTersambung && (
            <p className="m-0 mb-2 rounded-xl border border-dashed border-[#f59e0b] bg-[#fffbeb] px-3 py-2 text-[0.78rem] text-[#92400e]">
              <b>Chat marketplace — baca saja.</b> Mengirim balasan ke marketplace ini belum tersambung; balas
              dari Seller Center.
            </p>
          )}
          {viaTiktok && (
            <p className="m-0 mb-2 rounded-xl border border-[#bbf7d0] bg-green-soft px-3 py-2 text-[0.78rem] text-green-dark">
              <b>Balasan dikirim langsung ke pembeli di TikTok.</b> Pesan pembeli yang baru masuk ditarik
              dengan tombol &quot;Sinkronkan chat TikTok&quot;.
            </p>
          )}

          <textarea
            value={draft}
            disabled={belumTersambung || mengirim}
            maxLength={600}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                kirim();
              }
            }}
            rows={3}
            placeholder="Tulis balasan… (Enter kirim, Shift+Enter baris baru)"
            aria-label="Tulis balasan"
            className="w-full resize-y rounded-xl border border-line bg-green-soft p-3 text-[0.9rem] outline-none focus:bg-white"
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => toast("Terjemahan otomatis aktif saat backend terhubung")}
              className="cursor-pointer rounded-[9px] border border-line bg-white px-3 py-1.5 text-[0.8rem] font-semibold text-text-2"
            >
              🌐 Terjemahkan
            </button>
            <span className="ml-auto text-[0.74rem] text-muted">{draft.length}/600</span>
            <button
              type="button"
              onClick={kirim}
              disabled={belumTersambung || mengirim}
              className="cursor-pointer rounded-xl border-none bg-green px-5 py-2 font-bold text-white transition hover:bg-green-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mengirim ? "Mengirim…" : viaTiktok ? "Kirim ke TikTok" : "Kirim"}
            </button>
          </div>
        </div>
      </main>

      {/* Panel 4 — info pelanggan (disembunyikan ≤1180px) */}
      <aside className="w-72 shrink-0 max-wide:hidden">
        <InfoPanel key={active.id} c={active} />
      </aside>

      {/* Overlay panel untuk layar sempit */}
      {overlay && (
        <div className="absolute inset-0 z-40 bg-white">
          {overlay === "shops" && panelToko(() => setOverlay(null))}
          {overlay === "conv" && panelPercakapan(() => setOverlay(null))}
          {overlay === "info" && (
            <InfoPanel key={active.id} c={active} onClose={() => setOverlay(null)} />
          )}
        </div>
      )}

      {/* Papan croscek — mengapung di atas seluruh halaman, dan
          sengaja DI LUAR keempat panel. Isinya daftar tugas milik
          CS, bukan bagian dari percakapan mana pun; menaruhnya di
          dalam salah satu panel berarti ia ikut tergeser setiap
          kali panel itu berubah. */}
      <PapanCroscek
        calon={calonCroscek}
        onPilih={(id) => {
          pick(id);
          setOverlay(null);
        }}
      />

      {modal && (
        <IntegrateModal
          onClose={() => setModal(false)}
          onAdd={({ name, platform }: { name: string; platform: PlatformName }) => {
            const p: Platform =
              platform === "Shopee" ? "shopee" : platform === "TikTok Shop" ? "tiktok" : "lazada";
            setTokoDemo((prev) => [...prev, { nama: name, platform: p, aktif: true, uji: false }]);
          }}
        />
      )}
    </div>
  );
}
