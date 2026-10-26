"use client";

/* ===========================================================
   Halaman uji chat TikTok — BACA SAJA.

   Menjawab satu pertanyaan: "apakah console bisa membaca chat toko
   TikTok?" Tiga langkah: pilih toko -> daftar percakapan -> pesan.
   Tidak ada tombol kirim di sini, dan tidak ada panggilan yang
   menandai pesan sebagai sudah dibaca.
   =========================================================== */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardHead } from "@/components/ui/Card";
import { GhostButton, PageHead } from "@/components/ui/Bits";
import { headerBerSesi } from "@/lib/supabase/header";

type Toko = { id: string; external_shop_id: string; shop_name: string | null; is_active: boolean };
type Ringkas = {
  id: string;
  pembeli: string;
  platformPembeli: string | null;
  belumDibaca: number;
  bisaKirim: boolean;
  terakhir: string;
  waktu: number | null;
};
type Pesan = { id: string; tipe: string; teks: string; peran: string; nama: string; waktu: number | null };

/** Arti kode `sebab` dari /api/tiktok/callback. */
const ARTI_SEBAB: Record<string, string> = {
  tanpa_kode: "TikTok tidak mengirim kode otorisasi (otorisasi ditolak atau dibatalkan).",
  "36004004": "Kode otorisasi sudah dipakai atau lewat 30 menit. Klik ulang \"Otorisasikan aplikasi\".",
  konfigurasi_tiktok: "TIKTOK_APP_KEY / TIKTOK_APP_SECRET belum disetel di server (Vercel).",
  konfigurasi_supabase: "SUPABASE_SERVICE_ROLE_KEY belum disetel di server.",
  tanpa_toko: "Token didapat, tetapi daftar toko kosong atau tanpa shop_cipher.",
  database: "Token didapat, tetapi gagal disimpan. Apakah migrasi 20261026120000_tiktok.sql sudah dijalankan?",
};

function jam(epoch: number | null): string {
  if (!epoch) return "";
  return new Date(epoch * 1000).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
}

async function ambil<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: await headerBerSesi(), cache: "no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

export default function UjiPercakapan() {
  const params = useSearchParams();
  const status = params.get("tiktok");
  const sebab = params.get("sebab") ?? "";
  const catatan = params.get("catatan");

  const [toko, setToko] = useState<Toko[] | null>(null);
  const [tokoId, setTokoId] = useState("");
  const [daftar, setDaftar] = useState<Ringkas[] | null>(null);
  const [dipilih, setDipilih] = useState("");
  const [pesan, setPesan] = useState<Pesan[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [versi, setVersi] = useState(0);

  /* 1. Daftar toko TikTok terhubung. */
  useEffect(() => {
    let batal = false;
    void ambil<{ toko: Toko[] }>("/api/tiktok/percakapan")
      .then((d) => {
        if (batal) return;
        setToko(d.toko);
        const aktif = d.toko.find((t) => t.is_active);
        if (aktif) setTokoId((lama) => lama || aktif.id);
      })
      .catch((e: Error) => !batal && setGalat(e.message));
    return () => {
      batal = true;
    };
  }, [versi]);

  /* 2. Percakapan toko terpilih. */
  useEffect(() => {
    if (!tokoId) return;
    let batal = false;
    void ambil<{ percakapan: Ringkas[] }>(`/api/tiktok/percakapan?toko=${tokoId}`)
      .then((d) => !batal && (setDaftar(d.percakapan), setGalat(null)))
      .catch((e: Error) => !batal && setGalat(e.message));
    return () => {
      batal = true;
    };
  }, [tokoId, versi]);

  /* 3. Pesan percakapan terpilih. */
  useEffect(() => {
    if (!tokoId || !dipilih) return;
    let batal = false;
    void ambil<{ pesan: Pesan[] }>(`/api/tiktok/percakapan?toko=${tokoId}&percakapan=${dipilih}`)
      .then((d) => !batal && setPesan([...d.pesan].reverse()))
      .catch((e: Error) => !batal && setGalat(e.message));
    return () => {
      batal = true;
    };
  }, [tokoId, dipilih, versi]);

  const muatUlang = () => {
    setGalat(null);
    setVersi((v) => v + 1);
  };

  return (
    <div className="flex flex-col gap-4.5 p-5 max-mini:p-4">
      <PageHead title="Uji Chat TikTok">
        <GhostButton onClick={muatUlang}>Muat ulang</GhostButton>
      </PageHead>

      <p className="m-0 rounded-xl border border-dashed border-[#f59e0b] bg-[#fffbeb] px-3.5 py-2 text-[0.78rem] text-[#92400e]">
        <b>Alat diagnosa, baca saja.</b> Isinya langsung dari TikTok Shop lewat API Customer Service.
        Tidak ada pesan yang dikirim, dan pesan tidak ditandai sudah dibaca.
      </p>

      {status === "ok" && (
        <p className="m-0 rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] px-3.5 py-2.5 text-[0.88rem] text-green-dark">
          Otorisasi berhasil — {params.get("toko") ?? "?"} toko tersimpan.
          {catatan === "scope_cs_tidak_ada" && (
            <b className="block text-[#b45309]">
              Tetapi izin Customer Service tidak ikut diberikan; daftar percakapan kemungkinan ditolak.
            </b>
          )}
        </p>
      )}
      {status === "gagal" && (
        <p className="m-0 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3.5 py-2.5 text-[0.88rem] text-[#b91c1c]">
          Otorisasi gagal ({sebab}). {ARTI_SEBAB[sebab] ?? "Lihat log Vercel untuk rinciannya."}
        </p>
      )}
      {galat && (
        <p className="m-0 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3.5 py-2.5 text-[0.88rem] text-[#b91c1c] break-words">
          {galat}
        </p>
      )}

      <Card>
        <CardHead title="Toko TikTok terhubung" note={toko ? `${toko.length} toko` : "memuat…"} />
        {toko && toko.length === 0 && (
          <p className="m-0 text-[0.88rem] text-muted">
            Belum ada. Buka Partner Center → Toko Pengembangan → <b>Otorisasikan aplikasi</b>; sesudah
            menyetujui, TikTok mengarahkan kembali ke halaman ini.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {toko?.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTokoId(t.id);
                setDipilih("");
                setPesan(null);
              }}
              className={[
                "min-h-10 rounded-xl border px-3 text-[0.85rem]",
                t.id === tokoId ? "border-green bg-green-mint font-bold" : "border-line bg-white",
                t.is_active ? "" : "opacity-50",
              ].join(" ")}
            >
              {t.shop_name ?? t.external_shop_id}
            </button>
          ))}
        </div>
      </Card>

      {tokoId && (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4.5 max-tablet:grid-cols-1">
          <Card>
            <CardHead title="Percakapan" note={daftar ? `${daftar.length} terbaru` : "memuat…"} />
            {daftar?.length === 0 && (
              <p className="m-0 text-[0.88rem] text-muted">
                Belum ada percakapan. Kirim pesan dari Partner Center → Fitur percobaan → Tampilan untuk
                pembeli, lalu tekan Muat ulang.
              </p>
            )}
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {daftar?.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setDipilih(c.id)}
                    className={[
                      "w-full min-h-10 rounded-xl border px-3 py-2 text-left",
                      c.id === dipilih ? "border-green bg-green-mint" : "border-line bg-white",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <b className="truncate text-[0.88rem]">{c.pembeli}</b>
                      <span className="shrink-0 text-[0.72rem] text-muted">{jam(c.waktu)}</span>
                    </div>
                    <div className="truncate text-[0.8rem] text-muted">{c.terakhir || "—"}</div>
                    <div className="mt-0.5 flex flex-wrap gap-2 text-[0.7rem] text-muted">
                      {c.belumDibaca > 0 && <span className="font-bold text-green-dark">{c.belumDibaca} belum dibaca</span>}
                      {c.platformPembeli && <span>{c.platformPembeli}</span>}
                      {!c.bisaKirim && <span>tidak bisa dibalas</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHead title="Pesan" note={dipilih ? "10 terbaru" : "pilih percakapan"} />
            {pesan?.length === 0 && <p className="m-0 text-[0.88rem] text-muted">Tidak ada pesan yang bisa ditampilkan.</p>}
            <div className="flex flex-col gap-2">
              {pesan?.map((m) => {
                const dariPembeli = m.peran === "BUYER";
                return (
                  <div
                    key={m.id}
                    className={[
                      "max-w-[85%] rounded-xl px-3 py-2 text-[0.86rem] break-words",
                      dariPembeli ? "self-start bg-green-soft" : "self-end bg-green-mint",
                    ].join(" ")}
                  >
                    <div className="text-[0.7rem] text-muted">
                      {m.nama || m.peran} · {jam(m.waktu)}
                    </div>
                    {m.teks || <i className="text-muted">[{m.tipe}]</i>}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
