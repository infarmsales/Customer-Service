"use client";

/* ===========================================================
   Obrolan Gemini — uji BOLAK-BALIK di Simulasi.

   Anda berperan sebagai pembeli, Gemini sebagai CS. Setiap giliran
   mengirim SELURUH riwayat obrolan ini (maks. MAKS_RIWAYAT giliran,
   MAKS_FOTO_OBROLAN foto terakhir) ke /api/uji-gemini, karena Gemini
   tidak mengingat apa pun di antara panggilan. Akibatnya token masuk
   tumbuh tiap balasan — panel menampilkannya per giliran.

   SETIAP "Kirim" = SATU panggilan Gemini, kecuali dicegat satpam /
   template (Rp 0). Tidak ada panggilan saat dibuka, saat memilih model,
   atau saat memilih foto.

   Obrolan hanya hidup di memori halaman: tidak membuat percakapan,
   tidak masuk console CS, hilang saat panel ditutup atau dimulai ulang.
   =========================================================== */

import { useEffect, useRef, useState } from "react";
import { actionTagClass } from "./actionTag";
import { kecilkanFoto, useInfoGemini } from "./geminiBersama";
import { headerBerSesi } from "@/lib/supabase/header";
import { BATAS_BALASAN } from "@/lib/limits";
import { formatIdr, formatTokens, formatUsd } from "@/lib/pricing";
import { MAKS_FOTO_OBROLAN, MAKS_RIWAYAT, potongFotoLama, type GambarUji } from "@/lib/geminiAturan";

type Foto = GambarUji & { pratinjau: string };

type Giliran =
  | { id: number; role: "user"; content: string; foto: Foto | null }
  | {
      id: number;
      role: "assistant";
      content: string;
      sumber: "gemini" | "satpam" | "template";
      action: string;
      kode?: string;
      model?: string;
      waktuMs?: number;
      token?: { masuk: number; keluar: number; berpikir: number; dariCache: number };
      biaya?: { usd: number; idr: number; dikenal: boolean };
      panjang?: { panjang: number; lewat: boolean; mepet: boolean; sisa: number };
    }
  | { id: number; role: "galat"; content: string };

let urut = 0;
const idBaru = () => ++urut;

export default function ObrolanGemini({
  judul = "🧪 Obrolan dengan Gemini",
  contoh = [] as string[],
}) {
  const { info, galatInfo, model, setModel, pilihanModel, siap, statusTeks, statusKelas } = useInfoGemini();
  const [obrolan, setObrolan] = useState<Giliran[]>([]);
  const [pesan, setPesan] = useState("");
  const [foto, setFoto] = useState<(Foto & { nama: string }) | null>(null);
  const [lewati, setLewati] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [sesi, setSesi] = useState({ panggilan: 0, idr: 0, usd: 0 });
  const inputFoto = useRef<HTMLInputElement>(null);
  const bawah = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bawah.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [obrolan, sibuk]);

  const pilihFoto = async (berkas: File | undefined) => {
    if (!berkas) return;
    try {
      const f = await kecilkanFoto(berkas);
      setFoto({ ...f, nama: berkas.name });
    } catch (e) {
      setObrolan((o) => [...o, { id: idBaru(), role: "galat", content: (e as Error).message }]);
    }
  };

  const catatBiaya = (biaya: { idr: number; usd: number } | undefined) => {
    if (biaya) setSesi((s) => ({ panggilan: s.panggilan + 1, idr: s.idr + biaya.idr, usd: s.usd + biaya.usd }));
  };

  const kirim = async () => {
    const teks = pesan.trim();
    if ((!teks && !foto) || sibuk || !siap) return;

    /* Riwayat = giliran SEBELUM pesan ini; giliran galat bukan bagian
       obrolan. Foto lama dipotong di sini juga supaya badan permintaan
       tidak membengkak — server memotong lagi dengan aturan yang sama. */
    const riwayat = potongFotoLama(
      obrolan
        .filter((g): g is Exclude<Giliran, { role: "galat" }> => g.role !== "galat")
        .map((g) =>
          g.role === "user"
            ? { role: "user" as const, content: g.content, gambar: g.foto ? { mime: g.foto.mime, data: g.foto.data } : null }
            : { role: "assistant" as const, content: g.content },
        )
        .slice(-MAKS_RIWAYAT),
      MAKS_FOTO_OBROLAN - (foto ? 1 : 0),
    );

    const fotoKirim = foto ? { mime: foto.mime, data: foto.data, pratinjau: foto.pratinjau } : null;
    setObrolan((o) => [...o, { id: idBaru(), role: "user", content: teks, foto: fotoKirim }]);
    setPesan("");
    setFoto(null);
    setSibuk(true);
    try {
      const r = await fetch("/api/uji-gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await headerBerSesi()) },
        body: JSON.stringify({
          pesan: teks,
          model,
          lewatiGerbang: lewati,
          gambar: fotoKirim ? { mime: fotoKirim.mime, data: fotoKirim.data } : undefined,
          riwayat,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        /* Jawaban kosong tetap ditagih — hitung juga. */
        catatBiaya(j?.biaya);
        setObrolan((o) => [
          ...o,
          { id: idBaru(), role: "galat", content: j?.error ?? `Permintaan gagal (HTTP ${r.status}).` },
        ]);
        return;
      }
      if (j.sumber === "gemini") catatBiaya(j.biaya);
      setObrolan((o) => [
        ...o,
        {
          id: idBaru(),
          role: "assistant",
          content: j.reply ?? "",
          sumber: j.sumber,
          action: j.action,
          kode: j.kode,
          model: j.model,
          waktuMs: j.waktuMs,
          token: j.token,
          biaya: j.biaya,
          panjang: j.panjang,
        },
      ]);
    } catch (e) {
      setObrolan((o) => [
        ...o,
        { id: idBaru(), role: "galat", content: "Tidak bisa menghubungi /api/uji-gemini: " + (e as Error).message },
      ]);
    } finally {
      setSibuk(false);
    }
  };

  const jumlahGiliran = obrolan.filter((g) => g.role !== "galat").length;

  return (
    <section className="flex flex-col rounded-2xl border border-line bg-white text-text">
      {/* ---------- Kepala ---------- */}
      <div className="border-b border-line p-4 max-mini:p-3">
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="m-0 text-lg font-bold">{judul}</h2>
            <p className="mt-1 mb-0 text-[0.84rem] text-muted">
              Anda = pembeli, Gemini = CS. Tidak masuk console CS dan hilang saat panel ditutup.
            </p>
          </div>
          <span className={`shrink-0 text-xs font-semibold ${statusKelas}`}>{statusTeks}</span>
        </div>

        <p className="mt-0 mb-2.5 rounded-xl bg-[#fef3c7] px-3 py-2 text-xs leading-relaxed text-[#92400e]">
          Setiap <b>Kirim</b> = 1 panggilan Gemini (kecuali dicegat satpam/template), dan seluruh obrolan dikirim ulang
          tiap giliran — token masuk makin besar. Bila key Anda <b>tier gratis</b>, isinya boleh dipakai Google untuk
          melatih model: <b>jangan pakai foto atau data pembeli asli</b>.
        </p>

        {galatInfo && (
          <p className="mt-0 mb-2.5 rounded-xl bg-[#fee2e2] px-3 py-2 text-xs text-[#b91c1c]">Status Gemini: {galatInfo}</p>
        )}
        {info?.galatModel && (
          <p className="mt-0 mb-2.5 rounded-xl bg-[#fef3c7] px-3 py-2 text-xs text-[#92400e]">
            Daftar model dari Google gagal dimuat ({info.galatModel}) — memakai model bawaan.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Model Gemini"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={!info || pilihanModel.length === 0}
            className="min-h-10 max-w-full min-w-0 flex-1 rounded-[9px] border border-line bg-green-soft px-2.5 text-[0.84rem] font-semibold text-text-2"
          >
            {pilihanModel.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nama === m.id ? m.id : `${m.nama} — ${m.id}`}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setObrolan([]);
              setFoto(null);
            }}
            disabled={sibuk || obrolan.length === 0}
            className="min-h-10 cursor-pointer rounded-xl border border-line bg-white px-3 text-[0.84rem] font-semibold text-text-2 hover:bg-green-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            ↺ Mulai ulang
          </button>
        </div>
        <label className="mt-2 flex items-center gap-2 text-[0.82rem] text-text-2">
          <input type="checkbox" checked={lewati} onChange={(e) => setLewati(e.target.checked)} />
          Kirim langsung ke Gemini (lewati satpam &amp; template)
        </label>
      </div>

      {/* ---------- Obrolan ---------- */}
      <div className="flex min-h-[320px] flex-col gap-3 bg-green-soft p-4 max-mini:p-3">
        {obrolan.length === 0 && (
          <div className="m-auto max-w-md text-center text-[0.86rem] text-muted">
            <div className="text-3xl">💬</div>
            <p className="mt-2 mb-3">Mulai obrolan sebagai pembeli. Boleh lampirkan foto di giliran mana pun.</p>
            {contoh.length > 0 && (
              <div className="flex flex-col gap-2">
                {contoh.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPesan(c)}
                    className="cursor-pointer rounded-lg border border-line bg-white px-3 py-2 text-left text-xs text-text-2"
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {obrolan.map((g) =>
          g.role === "user" ? (
            <div key={g.id} className="flex max-w-[85%] flex-col items-end gap-1.5 self-end">
              {g.foto && (
                /* eslint-disable-next-line @next/next/no-img-element -- pratinjau data: lokal, bukan aset */
                <img src={g.foto.pratinjau} alt="Foto pembeli" className="max-h-48 max-w-full rounded-xl border border-line" />
              )}
              {g.content && (
                <div className="rounded-2xl rounded-br-md bg-green px-3.5 py-2 text-[0.9rem] whitespace-pre-wrap text-white">
                  {g.content}
                </div>
              )}
            </div>
          ) : g.role === "galat" ? (
            <div key={g.id} className="self-center rounded-xl bg-[#fee2e2] px-3 py-2 text-xs text-[#b91c1c]">
              <b>Gagal.</b> {g.content}
            </div>
          ) : (
            <div key={g.id} className="flex max-w-[85%] flex-col gap-1 self-start">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded-md px-1.5 py-0.5 text-[0.58rem] font-extrabold ${actionTagClass(g.action)}`}>
                  {g.action}
                </span>
                {g.sumber === "gemini" ? (
                  <span className="text-[0.7rem] text-muted">
                    ✨ {g.model}
                    {typeof g.waktuMs === "number" ? ` · ${(g.waktuMs / 1000).toFixed(1)} dtk` : ""}
                  </span>
                ) : (
                  <span className="rounded-md bg-green-mint px-1.5 py-0.5 text-[0.58rem] font-extrabold text-green-dark">
                    {g.sumber === "satpam" ? "🛡️ SATPAM" : "⚡ TEMPLATE"} [{g.kode}] · Gemini tidak dipanggil
                  </span>
                )}
              </div>
              <div className="rounded-2xl rounded-bl-md border border-line bg-white px-3.5 py-2 text-[0.9rem] whitespace-pre-wrap">
                {g.content || <i className="text-muted">(kosong)</i>}
              </div>
              <div className="text-[0.68rem] text-muted">
                {g.panjang && (
                  <span className={g.panjang.lewat ? "font-semibold text-[#b91c1c]" : g.panjang.mepet ? "text-[#92400e]" : ""}>
                    {g.panjang.panjang}/{BATAS_BALASAN} kar
                  </span>
                )}
                {g.sumber === "gemini" && g.token && (
                  <>
                    {" · "}token masuk {formatTokens(g.token.masuk)} · keluar {formatTokens(g.token.keluar)} · berpikir{" "}
                    {formatTokens(g.token.berpikir)}
                    {g.biaya &&
                      (g.biaya.dikenal
                        ? ` · ${formatIdr(g.biaya.idr)} (${formatUsd(g.biaya.usd)}) bila berbayar`
                        : " · tarif model belum ada di tabel")}
                  </>
                )}
              </div>
            </div>
          ),
        )}

        {sibuk && <div className="self-start text-xs text-muted">Gemini sedang mengetik…</div>}
        <div ref={bawah} />
      </div>

      {/* ---------- Kotak tulis ---------- */}
      <div className="border-t border-line p-3">
        {foto && (
          <div className="mb-2 flex min-w-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- pratinjau data: lokal, bukan aset */}
            <img src={foto.pratinjau} alt="Pratinjau foto" className="h-12 w-12 rounded-lg border border-line object-cover" />
            <span className="max-w-[180px] truncate text-xs text-muted" title={foto.nama}>
              {foto.nama}
            </span>
            <button
              type="button"
              onClick={() => setFoto(null)}
              className="cursor-pointer border-none bg-transparent p-1 text-xs font-semibold text-[#b91c1c]"
            >
              ✕ hapus
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
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
            aria-label="Lampirkan foto"
            onClick={() => inputFoto.current?.click()}
            className="min-h-11 min-w-11 cursor-pointer rounded-xl border border-line bg-white text-lg hover:bg-green-soft"
          >
            📷
          </button>
          <textarea
            rows={1}
            value={pesan}
            onChange={(e) => setPesan(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void kirim();
              }
            }}
            placeholder={siap ? "Tulis pesan sebagai pembeli…" : "Gemini belum siap"}
            className="min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-line bg-green-soft px-3 py-2.5 text-[0.9rem] text-text outline-none focus:border-green"
          />
          <button
            type="button"
            onClick={() => void kirim()}
            disabled={sibuk || !siap || (!pesan.trim() && !foto)}
            className="min-h-11 cursor-pointer rounded-xl border-none bg-green px-4 font-bold text-white hover:bg-green-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            Kirim
          </button>
        </div>
        <p className="mt-2 mb-0 text-[0.7rem] text-muted">
          Enter = kirim · Shift+Enter = baris baru · {jumlahGiliran} giliran
          {sesi.panggilan > 0 &&
            ` · ${sesi.panggilan} panggilan Gemini, perkiraan ${formatIdr(sesi.idr)} bila berbayar (tier gratis: Rp 0)`}
        </p>
      </div>
    </section>
  );
}
