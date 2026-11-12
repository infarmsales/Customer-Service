"use client";

/* ===========================================================
   Bagian "Toko Terhubung" di Pengaturan → Integrasi Marketplace.

   Membaca /api/shopee/toko (bukan tabelnya langsung — tabel itu
   berisi token dan memang tertutup untuk peramban). Tombol
   "Hubungkan Toko Shopee" adalah tautan biasa ke /api/shopee/auth-url
   yang mengarahkan ke halaman persetujuan Shopee; sesudah disetujui,
   /shopee/callback mengembalikan ke /settings?shopee=ok|gagal.

   SINKRON PESANAN (perbaikan-sinkron-skala-besar, 12 Nov 2026)

   - Label mode "manual"/"otomatis" dan "Sinkron pesanan aktif/nonaktif"
     per toko hanya LABEL. Mengubahnya tetap lewat SQL (berkas di
     supabase/: nyalakan-sinkron-*.sql) — sengaja tidak ada tombolnya.
   - "Sinkronkan sekarang" memanggil route SATU TOKO per panggilan,
     hanya untuk toko yang sinkron_pesanan-nya aktif, dan mengulang
     selama jawabannya "belum_selesai" (dicicil per jam di server).
     Dibatasi MAKS_PUTARAN_TOMBOL dan bisa dihentikan. Server memeriksa
     sakelarnya lagi — tombol yang disembunyikan bukan pengaman.

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
  sinkron_pesanan?: boolean;
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
  dilewati_toko_nonaktif: "dilewati — sinkron toko ini nonaktif",
  dilewati_mode_manual: "dilewati — mode manual",
  dilewati_perlu_otorisasi: "dilewati — perlu otorisasi ulang",
  dilewati_sedang_berjalan: "dilewati — sedang disinkronkan proses lain",
  toko_tidak_ditemukan: "toko tidak ditemukan",
};

const labelStatus = (s: string | null | undefined) => (s ? (LABEL_STATUS[s] ?? s) : "—");

/** Toko yang pesanannya ikut "Sinkronkan sekarang". */
const ikutSinkron = (t: Toko) => t.platform === "shopee" && t.sinkron_pesanan === true && t.is_active;

export default function TokoTerhubung() {
  const { isAdmin } = useAuth();
  const [daftar, setDaftar] = useState<Toko[] | null>(null);
  const [modeOtomatis, setModeOtomatis] = useState<boolean | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [hasil, setHasil] = useState<Hasil>(null);
  const [muatUlang, setMuatUlang] = useState(0);
  const [jalan, setJalan] = useState(false);
  const [kemajuan, setKemajuan] = useState<Record<string, Kemajuan>>({});
  const [galatSinkron, setGalatSinkron] = useState<string | null>(null);
  const berhenti = useRef(false);

  const perbarui = (id: string, ubah: (k: Kemajuan) => Kemajuan) =>
    setKemajuan((m) => ({
      ...m,
      [id]: ubah(m[id] ?? { status: "belum_selesai", putaran: 0, potongan: 0, sisa: 0, disimpan: 0, dilewati: 0, titik: null }),
    }));

  /* Hanya admin yang melihat tombolnya, dan rute di baliknya memeriksa
     peran admin DAN sakelar toko lagi di server. */
  const sinkronSekarang = async () => {
    const target = (daftar ?? []).filter(ikutSinkron);
    berhenti.current = false;
    setGalatSinkron(null);
    setKemajuan({});
    if (target.length === 0) {
      setGalatSinkron("Tidak ada toko dengan sinkron pesanan aktif.");
      return;
    }
    setJalan(true);
    try {
      for (const t of target) {
        let putaran = 0;
        let status: unknown = null;
        do {
          putaran += 1;
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
            status = typeof data.status === "string" ? data.status : "galat";
            const r = data.ringkasan;
            perbarui(t.id, (k) => ({
              status: status as string,
              putaran,
              potongan: k.potongan + (r?.potongan_selesai ?? 0),
              sisa: r?.potongan_sisa ?? k.sisa,
              disimpan: k.disimpan + (r?.disimpan ?? 0),
              dilewati: k.dilewati + (r?.dilewati_sama ?? 0),
              titik: r?.titik ?? k.titik,
              galat: r?.galat ?? (res.ok ? undefined : (data.error ?? `HTTP ${res.status}`)),
            }));
          } catch (err) {
            status = "galat";
            perbarui(t.id, (k) => ({ ...k, status: "galat", putaran, galat: (err as Error).message }));
          }
        } while (lanjutPutaran(status, putaran, berhenti.current));
        if (berhenti.current) break;
      }
    } finally {
      setJalan(false);
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

  const adaYangDisinkron = (daftar ?? []).some(ikutSinkron);

  return (
    <div className="mb-5 rounded-[18px] border border-line bg-white p-5 shadow-[0_8px_30px_rgb(15_23_42/0.04)] max-mini:p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div className="min-w-0">
          <div className="text-[0.95rem] font-bold">Toko Terhubung</div>
          {modeOtomatis !== null && (
            <div className="mt-0.5 text-[0.78rem] text-muted">
              Sinkron pesanan:{" "}
              <b className={modeOtomatis ? "text-green-dark" : "text-text-2"}>
                {modeOtomatis ? "otomatis tiap 15 menit" : "manual"}
              </b>{" "}
              · diubah lewat SQL
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && !jalan && (
            <button
              type="button"
              onClick={sinkronSekarang}
              disabled={!adaYangDisinkron}
              title={adaYangDisinkron ? undefined : "Tidak ada toko dengan sinkron pesanan aktif"}
              className="min-h-10 cursor-pointer rounded-[9px] border border-line bg-white px-3.5 py-1.5 text-[0.84rem] font-bold text-text-2 transition hover:bg-green-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              Sinkronkan sekarang
            </button>
          )}
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
          Menyinkronkan per toko, dicicil per jam. Biarkan halaman ini terbuka; tekan Berhenti kapan saja — yang
          sudah tersimpan tidak hilang dan bisa dilanjutkan nanti. Paling banyak {MAKS_PUTARAN_TOMBOL} putaran per toko.
        </p>
      )}
      {galatSinkron && (
        <p role="alert" className="mb-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3.5 py-2.5 text-[0.86rem] text-[#b91c1c]">
          {galatSinkron}
        </p>
      )}

      {hasil?.shopee === "ok" && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-line bg-green-soft px-3.5 py-2.5 text-[0.86rem] text-green-dark"
        >
          Toko <b>{hasil.toko}</b> berhasil dihubungkan. Toko yang BARU terhubung tidak disinkronkan pesanannya
          sampai sinkronnya dinyalakan lewat SQL — lihat baris &quot;Sinkron pesanan&quot; di kartunya.
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
                        <dt className="text-muted">Sinkron pesanan</dt>
                        <dd className="m-0">
                          {t.sinkron_pesanan ? (
                            <b className="text-green-dark">aktif</b>
                          ) : (
                            <span className="text-muted">nonaktif — tidak disinkronkan</span>
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
                <span
                  className={`shrink-0 text-[0.82rem] font-bold ${t.is_active ? "text-green-dark" : "text-[#d97706]"}`}
                >
                  ● {t.is_active ? "Aktif" : "Perlu otorisasi ulang"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
