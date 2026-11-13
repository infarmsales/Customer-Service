"use client";

/* ===========================================================
   /simulasi — layar PELANGGAN, bukan layar CS.

   Dipakai berdampingan dengan halaman Chat di jendela sebelah:
   ketik di sini sebagai pembeli, lalu lihat pesannya muncul di
   console CS tanpa refresh. Realtime Supabase yang mengerjakan
   bagian itu; tidak ada polling di sini.

   KENAPA HALAMAN TERSENDIRI, BUKAN TOMBOL DI DALAM CONSOLE

   Peragaan yang meyakinkan butuh dua sudut pandang yang terpisah
   secara fisik. Selama pembeli dan CS berada di layar yang sama,
   penonton tidak pernah benar-benar melihat pesan itu "berpindah"
   — dan justru perpindahan itulah yang sedang diperagakan.

   Sengaja dibuat mirip aplikasi marketplace, bukan mirip console:
   latar gelap, gelembung di kanan, tanpa rail navigasi. Begitu
   penonton mengenali bentuknya, tidak perlu ada yang menjelaskan
   siapa yang sedang bicara.

   Halaman ini tidak dibungkus AuthGuard, tetapi tetap memakai sesi
   yang ada di peramban — endpoint /api/simulasi menulis sebagai
   pengguna yang sedang login, jadi buka console dulu di tab lain.
   =========================================================== */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { headerBerSesi } from "@/lib/supabase/header";
import { PESAN_SIMULASI_MATI, SIMULASI_HIDUP } from "@/lib/simulasi";
import ObrolanGemini from "@/components/ai/ObrolanGemini";
import {
  cariToko,
  DAFTAR_TOKO,
  LABEL_PLATFORM,
  WARNA_PLATFORM,
} from "@/lib/toko";

const USUL = [
  "kak barangnya rusak pas sampe, mau refund",
  "nem oilnya dipakenya gmn kak",
  "poc tuh bwt ap",
  "kak tanamannya kok layu ya",
];

type Gelembung = {
  dari: "pelanggan" | "toko" | "sistem";
  teks: string;
  meta?: string;
};

type Jawaban = {
  ok?: boolean;
  error?: string;
  gerbang?: string;
  kode?: string | null;
  balasan?: string;
  diluarJangkauan?: boolean;
  biaya?: string;
  modeProduksi?: string;
  handover?: { eskalasiBaru: boolean } | null;
  /** Terisi bila handover diputuskan tetapi gagal tercatat. */
  peringatan?: string | null;
  toko?: string;
  pengenal?: { jenis: string; skor?: number; alasan?: string } | null;
};

export default function SimulasiPelanggan() {
  /* Disimpan sebagai NAMA toko, bukan platform. Sebelumnya halaman
     ini hanya memilih platform, sehingga ketiga "toko" karangannya
     menulis shop_name yang sama untuk tiap marketplace — dan di
     console semuanya menumpuk di satu toko. */
  const [toko, setToko] = useState(DAFTAR_TOKO[1].nama);
  const [nama, setNama] = useState("budi.pembeli");
  const [teks, setTeks] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [riwayat, setRiwayat] = useState<Gelembung[]>([]);
  const [ujiGemini, setUjiGemini] = useState(false);
  /* Sekali dibuka, panel obrolan tetap terpasang (hanya disembunyikan)
     supaya obrolan tidak hilang karena "Tutup" yang tidak sengaja. */
  const [geminiDimuat, setGeminiDimuat] = useState(false);
  const bawah = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bawah.current?.scrollIntoView({ behavior: "smooth" });
  }, [riwayat]);

  const kirim = async (isi: string, foto = false) => {
    const pesan = isi.trim();
    if ((!pesan && !foto) || sibuk) return;

    setSibuk(true);
    setTeks("");
    setRiwayat((r) => [
      ...r,
      { dari: "pelanggan", teks: pesan || "(mengirim foto)", meta: foto ? "📷 berfoto" : undefined },
    ]);

    try {
      const res = await fetch("/api/simulasi", {
        method: "POST",
        headers: await headerBerSesi(),
        body: JSON.stringify({ teks: pesan, nama, toko, foto }),
      });
      const d = (await res.json()) as Jawaban;

      if (d.error) {
        setRiwayat((r) => [...r, { dari: "sistem", teks: d.error! }]);
        return;
      }

      if (d.balasan) {
        setRiwayat((r) => [
          ...r,
          {
            dari: "toko",
            teks: d.balasan!,
            meta:
              `Gerbang ${d.gerbang}` +
              (d.kode ? ` · [${d.kode}]` : "") +
              (d.pengenal?.skor ? ` · kemiripan ${d.pengenal.skor.toFixed(3)}` : "") +
              ` · ${d.biaya}`,
          },
        ]);
      }

      /* Inilah yang diminta: pemberitahuan, bukan panggilan berbayar.
         Kalimatnya ditulis dari sudut pandang PELANGGAN — di layar
         sungguhan, orang yang bertanya tidak pernah tahu bahwa ada
         gerbang, model, atau saldo. */
      if (d.diluarJangkauan) {
        setRiwayat((r) => [
          ...r,
          {
            dari: "sistem",
            teks:
              "Pertanyaan ini di luar jangkauan template dan Gerbang 2. " +
              "Di sistem sungguhan, Claude yang menjawabnya — pada peragaan " +
              "ini sengaja TIDAK dipanggil. Chatnya tetap masuk ke console " +
              "CS, lengkap dengan penandanya.",
            meta:
              d.pengenal?.jenis === "lewat"
                ? `Gerbang 2 dilewati — ${d.pengenal.alasan}`
                : d.pengenal?.skor
                  ? `Gerbang 2 ragu · skor tertinggi ${d.pengenal.skor.toFixed(3)}`
                  : undefined,
          },
        ]);
      }

      if (d.handover?.eskalasiBaru) {
        /* Nama tokonya ikut disebut. Console menyaring daftar per
           toko, jadi "masuk antrean" saja belum cukup menuntun
           orang ke barisnya — kalau panel kiri sedang memilih toko
           lain, barisnya memang ada tetapi tidak terlihat, dan itu
           terbaca persis seperti kegagalan. */
        setRiwayat((r) => [
          ...r,
          {
            dari: "sistem",
            teks:
              `Masuk antrean Perlu CS di console — toko ${d.toko ?? toko}. ` +
              "AI dijeda 24 jam.",
            meta: "Kalau tidak terlihat, pastikan panel toko di console memilih toko itu atau «Semua toko».",
          },
        ]);
      }

      /* Handover yang diputuskan tetapi gagal dicatat. Tanpa baris
         ini kegagalannya hanya ada di terminal server, sementara
         layar tetap tampak berhasil. */
      if (d.peringatan) {
        setRiwayat((r) => [...r, { dari: "sistem", teks: "⚠️ " + d.peringatan! }]);
      }
    } catch (e) {
      setRiwayat((r) => [...r, { dari: "sistem", teks: (e as Error).message }]);
    } finally {
      setSibuk(false);
    }
  };

  const aktif = cariToko(toko) ?? DAFTAR_TOKO[0];

  /* Halaman ini sebelumnya TIDAK ikut dijaga. Akibatnya di Vercel ia
     tetap termuat lengkap dengan kotak ketik dan tombol Kirim —
     lalu setiap kiriman dibalas 404 oleh API yang tertutup. Layar
     yang mengundang ditekan tetapi selalu gagal lebih buruk daripada
     layar yang mengatakan sejak awal bahwa ia sedang mati. */
  if (!SIMULASI_HIDUP) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#0f172a] p-6 text-white">
        <div className="max-w-md rounded-2xl border border-dashed border-white/25 p-6 text-center">
          <div className="text-2xl" aria-hidden>
            🔌
          </div>
          <p className="mt-2 text-[0.86rem] leading-relaxed text-white/80">
            {PESAN_SIMULASI_MATI}
          </p>
          <Link
            href="/chat"
            className="mt-4 inline-block rounded-lg bg-white/15 px-3 py-2 text-[0.78rem] font-bold text-white no-underline"
          >
            ← Kembali ke console
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#0f172a] text-white">
      <header
        className="flex flex-wrap items-center gap-3 px-4 py-3"
        style={{ background: WARNA_PLATFORM[aktif.platform] }}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/20 text-[1rem]">
          🌱
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.9rem] font-bold">{aktif.nama}</div>
          <div className="text-[0.7rem] opacity-80">
            {LABEL_PLATFORM[aktif.platform]} · biasanya membalas dalam beberapa menit
          </div>
        </div>
        {/* Obrolan uji dengan Gemini (bolak-balik, boleh foto SUNGGUHAN)
            — panel terpisah dari alur pembeli di bawah. Alur pembeli tetap tidak pernah memanggil
            AI berbayar (lihat /api/simulasi); panel ini memanggil
            Gemini HANYA saat tombol Kirim di dalam panel ditekan, dan
            tidak membuat percakapan apa pun. */}
        <button
          type="button"
          onClick={() => {
            setUjiGemini(true);
            setGeminiDimuat(true);
          }}
          className="min-h-9 shrink-0 cursor-pointer rounded-lg border-none bg-white/20 px-2.5 py-1.5 text-[0.72rem] font-bold text-white"
        >
          🧪 Uji Gemini
        </button>
        <Link
          href="/chat"
          className="shrink-0 rounded-lg bg-white/20 px-2.5 py-1.5 text-[0.72rem] font-bold text-white no-underline"
        >
          Console CS →
        </Link>
      </header>

      {geminiDimuat && (
        <div
          className={`fixed inset-0 z-50 overflow-y-auto bg-[#0f172a]/95 p-4 max-mini:p-2 ${ujiGemini ? "" : "hidden"}`}
        >
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            <button
              type="button"
              onClick={() => setUjiGemini(false)}
              className="min-h-10 cursor-pointer self-end rounded-xl border border-white/25 bg-white/10 px-3.5 text-[0.84rem] font-bold text-white"
            >
              ✕ Tutup
            </button>
            <ObrolanGemini
              judul="🧪 Obrolan dengan Gemini"
              contoh={[
                "Kak tanaman saya kenapa ya daunnya begini?",
                "Ini produk yang saya terima, cara pakainya gimana?",
                "Paket saya datang begini kak",
              ]}
            />
          </div>
        </div>
      )}

      {/* Toko yang SAMA dengan panel kiri console. Penonton harus
          bisa menunjuk nama yang sama di dua layar; nama karangan
          seperti "Toko A" langsung memunculkan pertanyaan "yang mana
          itu di console?" yang tidak ada jawabannya. */}
      <div className="flex flex-wrap gap-2 border-b border-white/10 px-4 py-2.5">
        {DAFTAR_TOKO.map((t) => (
          <button
            key={t.nama}
            type="button"
            onClick={() => setToko(t.nama)}
            aria-pressed={toko === t.nama}
            title={LABEL_PLATFORM[t.platform]}
            className={`cursor-pointer rounded-lg border px-2.5 py-1 text-[0.72rem] font-bold transition ${
              toko === t.nama
                ? "border-white bg-white text-[#0f172a]"
                : "border-white/25 bg-transparent text-white/70"
            }`}
          >
            {t.nama}
          </button>
        ))}
        <input
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          aria-label="Nama pembeli"
          className="ml-auto w-36 rounded-lg border border-white/25 bg-transparent px-2 py-1 text-[0.72rem] outline-none placeholder:text-white/40"
          placeholder="nama pembeli"
        />
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {riwayat.length === 0 && (
          <div className="mx-auto max-w-md rounded-2xl border border-dashed border-white/20 p-5 text-center">
            <div className="text-2xl" aria-hidden>
              💬
            </div>
            <p className="mt-2 mb-3 text-[0.84rem] leading-relaxed text-white/70">
              Anda sedang berperan sebagai <b className="text-white">pembeli</b>.
              Tulis pertanyaan, lalu lihat chatnya masuk ke console CS di jendela
              sebelah — tanpa refresh.
            </p>
            <div className="flex flex-col gap-1.5">
              {USUL.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => void kirim(u)}
                  className="cursor-pointer rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-left text-[0.78rem] text-white/90 transition hover:bg-white/10"
                >
                  {u}
                </button>
              ))}
            </div>
            <p className="mt-3 mb-0 text-[0.7rem] text-white/40">
              Empat kalimat ini sengaja berbeda nasib: Gerbang 0, Gerbang 2, dan
              satu yang tidak terjawab siapa pun.
            </p>
          </div>
        )}

        <div className="mx-auto flex max-w-md flex-col gap-3">
          {riwayat.map((g, i) => (
            <div
              key={i}
              className={`flex flex-col ${
                g.dari === "pelanggan"
                  ? "items-end"
                  : g.dari === "sistem"
                    ? "items-center"
                    : "items-start"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[0.84rem] leading-relaxed whitespace-pre-line ${
                  g.dari === "pelanggan"
                    ? "bg-[#16a34a] text-white"
                    : g.dari === "sistem"
                      ? "border border-dashed border-amber-400/50 bg-amber-400/10 text-center text-[0.76rem] text-amber-200"
                      : "bg-white text-[#0f172a]"
                }`}
              >
                {g.teks}
              </div>
              {g.meta && (
                <span className="mt-1 text-[0.66rem] text-white/40">{g.meta}</span>
              )}
            </div>
          ))}
          <div ref={bawah} />
        </div>
      </main>

      <footer className="flex gap-2 border-t border-white/10 px-4 py-3">
        <input
          value={teks}
          onChange={(e) => setTeks(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void kirim(teks);
          }}
          disabled={sibuk}
          placeholder={sibuk ? "mengirim…" : "Tulis pesan…"}
          aria-label="Pesan"
          className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2.5 text-[0.86rem] text-white outline-none placeholder:text-white/40"
        />
        {/* Kirim foto. Fotonya karangan — yang diperagakan bukan
            gambarnya, melainkan KEPUTUSANNYA: apa pun isinya, dan
            apa pun teks yang menyertainya, pesan berlampiran selalu
            dialihkan ke CS karena AI tidak bisa melihat gambar. */}
        <button
          type="button"
          onClick={() => void kirim(teks, true)}
          disabled={sibuk}
          title="Kirim sebagai pesan berfoto"
          aria-label="Kirim foto"
          className="shrink-0 cursor-pointer rounded-xl border border-white/25 bg-white/10 px-3 py-2.5 text-[1rem] disabled:opacity-40"
        >
          📷
        </button>
        <button
          type="button"
          onClick={() => void kirim(teks)}
          disabled={sibuk || !teks.trim()}
          className="shrink-0 cursor-pointer rounded-xl bg-[#16a34a] px-4 py-2.5 text-[0.84rem] font-bold text-white disabled:opacity-40"
        >
          Kirim
        </button>
      </footer>
    </div>
  );
}
