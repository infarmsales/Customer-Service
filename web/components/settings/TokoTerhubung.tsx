"use client";

/* ===========================================================
   Bagian "Toko Terhubung" di Pengaturan → Integrasi Marketplace.

   Membaca /api/shopee/toko (bukan tabelnya langsung — tabel itu
   berisi token dan memang tertutup untuk peramban). Tombol
   "Hubungkan Toko Shopee" adalah tautan biasa ke /api/shopee/auth-url
   yang mengarahkan ke halaman persetujuan Shopee; sesudah disetujui,
   /shopee/callback mengembalikan ke /settings?shopee=ok|gagal.

   SINKRON PESANAN (perbaikan-sinkron-skala-besar, 12 Nov 2026)

   - SETIAP toko Shopee yang terhubung punya tombol "Sinkronkan" sendiri;
     kapan menyinkronkan toko mana adalah keputusan admin.
   - Label "Sinkron otomatis: nyala/mati" dan "Ikut sinkron otomatis"
     per toko hanya LABEL untuk job terjadwal. Mengubahnya lewat SQL
     (supabase/nyalakan-sinkron-otomatis.sql, atur-sinkron-otomatis-toko.sql).
   - Tombol memanggil route untuk toko itu saja dan mengulang selama
     jawabannya "belum_selesai" (dicicil per jam di server). Satu toko
     pada satu waktu, dibatasi MAKS_PUTARAN_TOMBOL, bisa dihentikan.
     Route memeriksa peran admin lagi — tombol tersembunyi bukan pengaman.

   Pesan hasil otorisasi dibaca dari window.location di dalam effect,
   bukan lewat useSearchParams — yang terakhir menuntut batas Suspense
   di halaman induk hanya untuk satu parameter sekali baca.
   =========================================================== */

import { useEffect, useRef, useState } from "react";
import { headerBerSesi } from "@/lib/supabase/header";
import { stempel } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { MAKS_PUTARAN_TOMBOL, lanjutPutaran } from "@/lib/shopee/sinkronAturan";

type Toko = {
  id: string;
  platform: string;
  external_shop_id: string;
  shop_name: string | null;
  region: string | null;
  is_active: boolean;
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  authorization_expires_at: string | null;
  /** Sampai kapan pesanan toko ini sudah ditarik; null = belum pernah. */
  orders_synced_until?: string | null;
  updated_at: string;
  ikut_sinkron_otomatis?: boolean;
  sinkron_terakhir_pada?: string | null;
  sinkron_terakhir_status?: string | null;
  cek_token_pada?: string | null;
  cek_token_ok?: boolean | null;
  cek_token_galat?: string | null;
};

/** Ringkasan satu panggilan route — lihat RingkasanToko di lib/shopee/sinkron.ts. */
type RingkasanRoute = {
  titik: string | null;
  potongan_selesai: number;
  potongan_sisa: number;
  disimpan: number;
  dilewati_sama: number;
  galat?: string;
};

type Kemajuan = {
  status: string;
  putaran: number;
  potongan: number;
  sisa: number;
  disimpan: number;
  dilewati: number;
  titik: string | null;
  galat?: string;
};

type Hasil = { shopee: "ok" | "gagal"; toko?: string; sebab?: string; catatan?: string } | null;

const LABEL_SEBAB: Record<string, string> = {
  parameter_kurang: "Shopee kembali tanpa code atau shop_id.",
  akun_utama_tanpa_toko:
    "Login dengan akun utama berhasil, tetapi Shopee tidak menyebut toko mana pun. Hubungkan lagi dan " +
    "pastikan toko yang dimaksud dicentang di halaman otorisasi Shopee.",
  invalid_main_acount_id: "Kode otorisasi tidak cocok dengan akun utama. Coba hubungkan lagi.",
  invalid_shop_id: "Kode otorisasi tidak cocok dengan toko. Coba hubungkan lagi.",
  invalid_code: "Kode otorisasi sudah kedaluwarsa atau sudah dipakai. Coba hubungkan lagi.",
  error_auth: "Kode otorisasi ditolak Shopee. Coba hubungkan lagi.",
  error_sign: "Tanda tangan ditolak — periksa partner key dan host.",
  konfigurasi: "Variabel lingkungan Shopee belum lengkap di server.",
  konfigurasi_supabase:
    "Shopee sudah menerbitkan token, tetapi SUPABASE_SERVICE_ROLE_KEY tidak terlihat oleh " +
    "deployment ini sehingga tidak bisa disimpan. Periksa variabelnya di Vercel, redeploy, lalu hubungkan lagi.",
  database: "Token diterima Shopee tetapi gagal disimpan. Lihat log server.",
};

/** Arti status dari route, untuk layar. */
const LABEL_STATUS: Record<string, string> = {
  selesai: "selesai",
  belum_selesai: "dicicil…",
  galat: "gagal",
  dilewati_tidak_ikut_otomatis: "dilewati — toko tidak ikut sinkron otomatis",
  dihentikan: "dihentikan",
  dilewati_mode_manual: "dilewati — mode manual",
  dilewati_perlu_otorisasi: "dilewati — perlu otorisasi ulang",
  dilewati_sedang_berjalan: "dilewati — sedang disinkronkan proses lain",
  toko_tidak_ditemukan: "toko tidak ditemukan",
};

const labelStatus = (s: string | null | undefined) => (s ? (LABEL_STATUS[s] ?? s) : "—");

/** Toko yang punya tombol Sinkronkan: semua toko Shopee yang masih terhubung. */
const bisaDisinkron = (t: Toko) => t.platform === "shopee" && t.is_active;

const KEMAJUAN_AWAL: Kemajuan = { status: "belum_selesai", putaran: 0, potongan: 0, sisa: 0, disimpan: 0, dilewati: 0, titik: null };

export default function TokoTerhubung() {
  const { isAdmin } = useAuth();
  const [daftar, setDaftar] = useState<Toko[] | null>(null);
  const [modeOtomatis, setModeOtomatis] = useState<boolean | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [hasil, setHasil] = useState<Hasil>(null);
  const [muatUlang, setMuatUlang] = useState(0);
  /** id toko yang sedang disinkronkan; satu toko pada satu waktu. */
  const [jalan, setJalan] = useState<string | null>(null);
  const [kemajuan, setKemajuan] = useState<Record<string, Kemajuan>>({});
  const berhenti = useRef(false);

  /* Tombol per toko. Hanya admin yang melihatnya, dan route di baliknya
     memeriksa peran admin lagi di server. Kapan menyinkronkan toko mana
     sepenuhnya keputusan admin — sakelar "ikut otomatis" hanya mengatur
     job terjadwal. Mengulang selama server menjawab "belum_selesai". */
  const sinkronToko = async (t: Toko) => {
    if (jalan) return;
    berhenti.current = false;
    setJalan(t.id);
    setKemajuan((m) => ({ ...m, [t.id]: KEMAJUAN_AWAL }));
    try {
      let putaran = 0;
      let status: string = "galat";
      do {
        putaran += 1;
        const ke = putaran;
        try {
          const res = await fetch(`/api/sync/shopee-orders?toko=${encodeURIComponent(t.id)}`, {
            method: "POST",
            headers: await headerBerSesi(),
          });
          const data = (await res.json().catch(() => ({}))) as {
            status?: string;
            error?: string;
            ringkasan?: RingkasanRoute | null;
          };
          const st = typeof data.status === "string" ? data.status : "galat";
          status = st;
          const r = data.ringkasan;
          setKemajuan((m) => {
            const k = m[t.id] ?? KEMAJUAN_AWAL;
            return {
              ...m,
              [t.id]: {
                status: st,
                putaran: ke,
                potongan: k.potongan + (r?.potongan_selesai ?? 0),
                sisa: r?.potongan_sisa ?? k.sisa,
                disimpan: k.disimpan + (r?.disimpan ?? 0),
                dilewati: k.dilewati + (r?.dilewati_sama ?? 0),
                titik: r?.titik ?? k.titik,
                galat: r?.galat ?? (res.ok ? undefined : (data.error ?? `HTTP ${res.status}`)),
              },
            };
          });
        } catch (err) {
          status = "galat";
          const pesan = (err as Error).message;
          setKemajuan((m) => ({ ...m, [t.id]: { ...(m[t.id] ?? KEMAJUAN_AWAL), status: "galat", putaran: ke, galat: pesan } }));
        }
      } while (lanjutPutaran(status, putaran, berhenti.current));
      if (berhenti.current) {
        setKemajuan((m) => ({ ...m, [t.id]: { ...(m[t.id] ?? KEMAJUAN_AWAL), status: "dihentikan" } }));
      }
    } finally {
      setJalan(null);
      setMuatUlang((n) => n + 1);
    }
  };

  useEffect(() => {
    let batal = false;
    void (async () => {
      /* Pesan hasil otorisasi dibaca dulu, di dalam IIFE yang sama
         dengan pengambilan data — supaya tidak ada setState sinkron di
         badan effect (eslint react-hooks/set-state-in-effect). */
      try {
        const q = new URLSearchParams(window.location.search);
        const s = q.get("shopee");
        if (s === "ok" || s === "gagal") {
          setHasil({
            shopee: s,
            toko: q.get("toko") ?? undefined,
            sebab: q.get("sebab") ?? undefined,
            catatan: q.get("catatan") ?? undefined,
          });
          /* Bersihkan URL supaya refresh tidak menampilkan pesan lama. */
          window.history.replaceState(null, "", "/settings");
        }
      } catch {
        /* window tidak tersedia — biarkan tanpa pesan. */
      }

      try {
        const res = await fetch("/api/shopee/toko", { headers: await headerBerSesi(), cache: "no-store" });
        const data = await res.json();
        if (batal) return;
        if (!res.ok) {
          setGalat(data?.error ?? `HTTP ${res.status}`);
          return;
        }
        setDaftar(data.toko as Toko[]);
        setModeOtomatis(data.modeOtomatis === true);
      } catch (err) {
        if (!batal) setGalat((err as Error).message);
      }
    })();
    return () => {
      batal = true;
    };
  }, [hasil, muatUlang]);

  return (
    <div className="mb-5 rounded-[18px] border border-line bg-white p-5 shadow-[0_8px_30px_rgb(15_23_42/0.04)] max-mini:p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div className="min-w-0">
          <div className="text-[0.95rem] font-bold">Toko Terhubung</div>
          {modeOtomatis !== null && (
            <div className="mt-0.5 text-[0.78rem] text-muted">
              Sinkron otomatis:{" "}
              <b className={modeOtomatis ? "text-green-dark" : "text-text-2"}>
                {modeOtomatis ? "nyala, tiap 15 menit" : "mati (manual)"}
              </b>{" "}
              · diubah lewat SQL. Tombol Sinkronkan di tiap toko selalu bisa dipakai.
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && jalan && (
            <button
              type="button"
              onClick={() => {
                berhenti.current = true;
              }}
              className="min-h-10 cursor-pointer rounded-[9px] border border-[#fecaca] bg-[#fef2f2] px-3.5 py-1.5 text-[0.84rem] font-bold text-[#b91c1c] transition hover:bg-[#fee2e2]"
            >
              ■ Berhenti
            </button>
          )}
          <a
            href="/api/shopee/auth-url"
            className="flex min-h-10 items-center rounded-[9px] bg-green px-3.5 py-1.5 text-[0.84rem] font-bold text-white no-underline transition hover:bg-green-hover"
          >
            Hubungkan Toko Shopee
          </a>
        </div>
      </div>

      {jalan && (
        <p role="status" className="mb-4 rounded-xl border border-line bg-green-soft px-3.5 py-2.5 text-[0.82rem] text-text-2">
          Menyinkronkan, dicicil per jam. Biarkan halaman ini terbuka; tekan Berhenti kapan saja — yang sudah
          tersimpan tidak hilang dan bisa dilanjutkan dengan menekan Sinkronkan lagi. Paling banyak{" "}
          {MAKS_PUTARAN_TOMBOL} putaran per klik.
        </p>
      )}

      {hasil?.shopee === "ok" && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-line bg-green-soft px-3.5 py-2.5 text-[0.86rem] text-green-dark"
        >
          Toko <b>{hasil.toko}</b> berhasil dihubungkan. Pesanannya belum ditarik — tekan <b>Sinkronkan</b> di
          kartu toko kapan pun Anda siap.
          {hasil.catatan === "nama_toko_belum" && " Nama tokonya belum terbaca."}
        </p>
      )}
      {hasil?.shopee === "gagal" && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3.5 py-2.5 text-[0.86rem] text-[#b91c1c]"
        >
          Gagal menghubungkan: {LABEL_SEBAB[hasil.sebab ?? ""] ?? `kode galat ${hasil.sebab}`}
        </p>
      )}

      {galat && (
        <p className="m-0 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3.5 py-2.5 text-[0.86rem] text-[#b91c1c]">
          Daftar toko tidak terbaca: {galat}
        </p>
      )}

      {!galat && daftar === null && <p className="m-0 text-[0.86rem] text-muted">Memuat…</p>}

      {daftar && daftar.length === 0 && (
        <p className="m-0 text-[0.86rem] text-muted">
          Belum ada toko yang terhubung lewat API. Tekan &quot;Hubungkan Toko Shopee&quot;,
          lalu masuk dengan akun penjual toko yang ingin dihubungkan.
        </p>
      )}

      {daftar && daftar.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {daftar.map((t) => {
            const k = kemajuan[t.id];
            const shopee = t.platform === "shopee";
            return (
              <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line p-3.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">
                    {t.shop_name ?? `Toko ${t.external_shop_id}`}
                    <span className="ml-2 rounded bg-green-mint px-1.5 py-0.5 text-[0.66rem] font-extrabold uppercase text-green-dark">
                      {t.platform}
                      {t.region ? ` · ${t.region}` : ""}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[0.72rem] text-muted">shop_id {t.external_shop_id}</div>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[0.76rem]">
                    <dt className="text-muted">Access token</dt>
                    <dd className="m-0">{t.access_token_expires_at ? `sampai ${stempel(t.access_token_expires_at)}` : "—"}</dd>
                    <dt className="text-muted">Refresh token</dt>
                    <dd className="m-0">{t.refresh_token_expires_at ? `sampai ${stempel(t.refresh_token_expires_at)}` : "—"}</dd>
                    <dt className="text-muted">Otorisasi toko</dt>
                    <dd className="m-0">{t.authorization_expires_at ? `sampai ${stempel(t.authorization_expires_at)}` : "—"}</dd>
                    {shopee && (
                      <>
                        <dt className="text-muted">Cek token harian</dt>
                        <dd className="m-0">
                          {!t.cek_token_pada ? (
                            "belum pernah"
                          ) : t.cek_token_ok ? (
                            <span className="text-green-dark">ok · {stempel(t.cek_token_pada)}</span>
                          ) : (
                            <span className="text-[#b91c1c]">
                              gagal ({t.cek_token_galat ?? "?"}) · {stempel(t.cek_token_pada)}
                            </span>
                          )}
                        </dd>
                        <dt className="text-muted">Ikut sinkron otomatis</dt>
                        <dd className="m-0">
                          {t.ikut_sinkron_otomatis ? (
                            <b className="text-green-dark">ya</b>
                          ) : (
                            <span className="text-muted">tidak — hanya lewat tombol</span>
                          )}
                        </dd>
                        <dt className="text-muted">Pesanan tersinkron</dt>
                        <dd className="m-0">
                          {t.orders_synced_until ? `sampai ${stempel(t.orders_synced_until)}` : "belum pernah"}
                        </dd>
                        <dt className="text-muted">Sinkron terakhir</dt>
                        <dd className="m-0">
                          {t.sinkron_terakhir_pada
                            ? `${stempel(t.sinkron_terakhir_pada)} · ${labelStatus(t.sinkron_terakhir_status)}`
                            : "—"}
                        </dd>
                      </>
                    )}
                  </dl>
                  {k && (
                    <p
                      className={`m-0 mt-2 rounded-lg px-2.5 py-1.5 text-[0.76rem] ${
                        k.status === "galat" ? "bg-[#fef2f2] text-[#b91c1c]" : "bg-green-soft text-text-2"
                      }`}
                    >
                      Putaran {k.putaran}: <b>{labelStatus(k.status)}</b> · {k.potongan} potongan · {k.disimpan} tersimpan ·{" "}
                      {k.dilewati} tidak berubah
                      {k.sisa > 0 ? ` · sisa ${k.sisa} potongan` : ""}
                      {k.titik ? ` · sampai ${stempel(k.titik)}` : ""}
                      {k.galat ? ` · ${k.galat}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2 max-mini:w-full max-mini:items-stretch">
                  <span
                    className={`text-[0.82rem] font-bold ${t.is_active ? "text-green-dark" : "text-[#d97706]"}`}
                  >
                    ● {t.is_active ? "Aktif" : "Perlu otorisasi ulang"}
                  </span>
                  {isAdmin && bisaDisinkron(t) && (
                    <button
                      type="button"
                      onClick={() => void sinkronToko(t)}
                      disabled={jalan !== null}
                      title={jalan && jalan !== t.id ? "Tunggu toko lain selesai disinkronkan" : undefined}
                      className="min-h-10 cursor-pointer rounded-[9px] border border-line bg-white px-3.5 py-1.5 text-[0.84rem] font-bold text-text-2 transition hover:bg-green-soft disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {jalan === t.id ? "Menyinkronkan…" : "↻ Sinkronkan"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
