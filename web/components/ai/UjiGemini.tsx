"use client";

/* ===========================================================
   Panel "Uji Gemini" — dipakai di halaman AI Chatbot dan Simulasi.

   Satu pesan uji (boleh dengan FOTO SUNGGUHAN) -> /api/uji-gemini ->
   satu balasan Gemini, lengkap dengan aksi, panjang, token, dan
   perkiraan biaya. Tidak membuat percakapan, tidak menyentuh antrean
   CS, tidak mengubah chat pelanggan (tetap Claude).

   SETIAP KLIK "Minta balasan" = SATU panggilan Gemini, kecuali
   pesannya dicegat Gerbang 0 / template (Rp 0). Panel ini tidak
   pernah memanggil sendiri: tidak ada panggilan saat dibuka, saat
   memilih model, atau saat memilih foto.
   =========================================================== */

import { useRef, useState } from "react";
import { actionTagClass } from "./actionTag";
import { headerBerSesi } from "@/lib/supabase/header";
import { kecilkanFoto, useInfoGemini } from "./geminiBersama";
import { BATAS_BALASAN } from "@/lib/limits";
import { formatIdr, formatTokens, formatUsd } from "@/lib/pricing";

type Hasil = {
  sumber: "gemini" | "satpam" | "template";
  action: string;
  reply: string;
  kode?: string;
  alasan?: string;
  kategori?: string;
  model?: string;
  versiModel?: string | null;
  token?: { masuk: number; keluar: number; berpikir: number; dariCache: number };
  biaya?: { usd: number; idr: number; dikenal: boolean };
  waktuMs?: number;
  denganFoto?: boolean;
  panjang?: { panjang: number; lewat: boolean; mepet: boolean; sisa: number };
};

export default function UjiGemini({ judul = "🧪 Uji Gemini", contoh = [] as string[] }) {
  const { info, galatInfo, model, setModel, pilihanModel, siap, statusTeks, statusKelas } = useInfoGemini();
  const [pesan, setPesan] = useState("");
  const [foto, setFoto] = useState<{ mime: string; data: string; pratinjau: string; nama: string } | null>(null);
  const [lewati, setLewati] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sesi, setSesi] = useState({ panggilan: 0, idr: 0, usd: 0 });
  const inputFoto = useRef<HTMLInputElement>(null);

  const pilihFoto = async (berkas: File | undefined) => {
    if (!berkas) return;
    try {
      const f = await kecilkanFoto(berkas);
      setFoto({ ...f, nama: berkas.name });
      setGalat(null);
    } catch (e) {
      setGalat((e as Error).message);
    }
  };

  const minta = async () => {
    if (!pesan.trim() && !foto) {
      setGalat("Tulis pesan atau lampirkan foto dulu.");
      return;
    }
    setSibuk(true);
    setGalat(null);
    setHasil(null);
    try {
      const r = await fetch("/api/uji-gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await headerBerSesi()) },
        body: JSON.stringify({
          pesan,
          model,
          lewatiGerbang: lewati,
          gambar: foto ? { mime: foto.mime, data: foto.data } : undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setGalat(j?.error ?? `Permintaan gagal (HTTP ${r.status}).`);
        /* Jawaban kosong tetap ditagih — hitung juga. */
        if (j?.biaya) setSesi((s) => ({ panggilan: s.panggilan + 1, idr: s.idr + j.biaya.idr, usd: s.usd + j.biaya.usd }));
        return;
      }
      const h = j as Hasil;
      setHasil(h);
      if (h.sumber === "gemini" && h.biaya) {
        setSesi((s) => ({ panggilan: s.panggilan + 1, idr: s.idr + h.biaya!.idr, usd: s.usd + h.biaya!.usd }));
      }
    } catch (e) {
      setGalat("Tidak bisa menghubungi /api/uji-gemini: " + (e as Error).message);
    } finally {
      setSibuk(false);
    }
  };

  return (
    <section className="rounded-2xl border border-line bg-white p-5 text-text max-mini:p-3.5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="m-0 text-lg font-bold">{judul}</h2>
          <p className="mt-1 mb-0 text-[0.86rem] text-muted">
            Meja uji saja — tidak membuat percakapan dan tidak mengubah chat pelanggan (tetap Claude). System prompt
            sama dengan Claude.
          </p>
        </div>
        <span className={`shrink-0 text-xs font-semibold ${statusKelas}`}>{statusTeks}</span>
      </div>

      <p className="mt-0 mb-3 rounded-xl bg-[#fef3c7] px-3 py-2 text-xs leading-relaxed text-[#92400e]">
        Setiap <b>Minta balasan</b> = 1 panggilan Gemini (berbayar, atau memakai kuota tier gratis), kecuali dicegat
        satpam/template. Teks dan foto dikirim ke Google — bila key Anda <b>tier gratis</b>, isinya boleh dipakai Google
        untuk melatih model, jadi <b>jangan pakai foto atau data pembeli asli</b>.
      </p>

      {galatInfo && (
        <p className="mt-0 mb-3 rounded-xl bg-[#fee2e2] px-3 py-2 text-xs text-[#b91c1c]">Status Gemini: {galatInfo}</p>
      )}
      {info?.galatModel && (
        <p className="mt-0 mb-3 rounded-xl bg-[#fef3c7] px-3 py-2 text-xs text-[#92400e]">
          Daftar model dari Google gagal dimuat ({info.galatModel}) — memakai model bawaan.
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="text-[0.86rem] font-semibold text-text-2" htmlFor="model-gemini">
          Model
        </label>
        <select
          id="model-gemini"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={!info || pilihanModel.length === 0}
          className="min-h-10 max-w-full min-w-0 flex-1 rounded-[9px] border border-line bg-green-soft px-2.5 text-[0.86rem] font-semibold text-text-2"
        >
          {pilihanModel.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nama === m.id ? m.id : `${m.nama} — ${m.id}`}
            </option>
          ))}
        </select>
      </div>

      <textarea
        rows={3}
        value={pesan}
        onChange={(e) => setPesan(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !sibuk) void minta();
        }}
        placeholder="Pesan pelanggan, mis. Daun cabai saya menguning kenapa ya kak?"
        className="w-full resize-y rounded-xl border border-line bg-green-soft p-3 text-[0.9rem] text-text outline-none focus:border-green"
      />

      {contoh.length > 0 && (
        <div className="my-2 flex flex-wrap gap-2">
          {contoh.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setPesan(c)}
              className="cursor-pointer rounded-lg border border-line bg-white px-2.5 py-1.5 text-left text-xs text-text-2"
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="my-2.5 flex flex-wrap items-center gap-3">
        <input
          ref={inputFoto}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            void pilihFoto(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => inputFoto.current?.click()}
          className="min-h-10 cursor-pointer rounded-xl border border-line bg-white px-3.5 text-[0.86rem] font-semibold text-text-2 hover:bg-green-soft"
        >
          📷 {foto ? "Ganti foto" : "Lampirkan foto"}
        </button>
        {foto && (
          <span className="flex min-w-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- pratinjau data: lokal, bukan aset */}
            <img src={foto.pratinjau} alt="Pratinjau foto uji" className="h-12 w-12 rounded-lg border border-line object-cover" />
            <span className="max-w-[160px] truncate text-xs text-muted" title={foto.nama}>
              {foto.nama}
            </span>
            <button
              type="button"
              onClick={() => setFoto(null)}
              className="cursor-pointer border-none bg-transparent p-1 text-xs font-semibold text-[#b91c1c]"
            >
              ✕ hapus
            </button>
          </span>
        )}
        <label className="flex items-center gap-2 text-[0.84rem] text-text-2" title="Satpam & template tidak dijalankan">
          <input type="checkbox" checked={lewati} onChange={(e) => setLewati(e.target.checked)} />
          Kirim langsung ke Gemini (lewati satpam & template)
        </label>
      </div>

      <button
        type="button"
        onClick={() => void minta()}
        disabled={sibuk || !siap}
        className="w-full cursor-pointer rounded-xl border-none bg-green px-6 py-3 font-bold text-white transition hover:bg-green-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {sibuk ? "Menunggu Gemini…" : "Minta balasan Gemini ✨"}
      </button>

      {galat && (
        <div className="mt-4 rounded-xl bg-[#fee2e2] px-4 py-3 text-[0.88rem] text-[#b91c1c]">
          <b>Gagal.</b> {galat}
        </div>
      )}

      {hasil && (
        <div className="mt-4 rounded-xl border border-line bg-green-soft p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-1.5 py-0.5 text-[0.6rem] font-extrabold ${actionTagClass(hasil.action)}`}>
              {hasil.action}
            </span>
            {hasil.sumber === "gemini" ? (
              <span className="text-xs text-muted">
                ✨ {hasil.model}
                {hasil.denganFoto ? " · dengan foto" : ""}
                {typeof hasil.waktuMs === "number" ? ` · ${(hasil.waktuMs / 1000).toFixed(1)} dtk` : ""}
              </span>
            ) : (
              <span className="rounded-md bg-green-mint px-1.5 py-0.5 text-[0.6rem] font-extrabold text-green-dark">
                {hasil.sumber === "satpam" ? "🛡️ SATPAM" : "⚡ TEMPLATE"} [{hasil.kode}] · Gemini tidak dipanggil · Rp 0
              </span>
            )}
          </div>

          <div className="text-[0.92rem] whitespace-pre-wrap">{hasil.reply || <i className="text-muted">(kosong)</i>}</div>

          {hasil.panjang && (
            <p
              className={`mt-2 mb-0 text-xs ${
                hasil.panjang.lewat ? "font-semibold text-[#b91c1c]" : hasil.panjang.mepet ? "text-[#92400e]" : "text-muted"
              }`}
            >
              {hasil.panjang.panjang} / {BATAS_BALASAN} karakter
              {hasil.panjang.lewat && ` — lewat ${-hasil.panjang.sisa}`}
            </p>
          )}

          {hasil.sumber !== "gemini" && hasil.alasan && (
            <p className="mt-2 mb-0 text-xs text-muted">
              {hasil.alasan} Centang &quot;Kirim langsung ke Gemini&quot; untuk melihat jawaban modelnya.
            </p>
          )}

          {hasil.sumber === "gemini" && hasil.token && hasil.biaya && (
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-white px-3 py-2 text-xs text-text-2 max-mini:grid-cols-1">
              <span>Token masuk: {formatTokens(hasil.token.masuk)}</span>
              <span>Token keluar: {formatTokens(hasil.token.keluar)}</span>
              <span>Token berpikir: {formatTokens(hasil.token.berpikir)}</span>
              <span>
                Biaya bila berbayar:{" "}
                {hasil.biaya.dikenal ? `${formatIdr(hasil.biaya.idr)} · ${formatUsd(hasil.biaya.usd)}` : "tarif model belum ada di tabel"}
              </span>
            </div>
          )}
        </div>
      )}

      {sesi.panggilan > 0 && (
        <p className="mt-3 mb-0 text-xs text-muted">
          Sesi ini: {sesi.panggilan} panggilan Gemini · perkiraan {formatIdr(sesi.idr)} bila berbayar (tier gratis: Rp 0).
        </p>
      )}
    </section>
  );
}
