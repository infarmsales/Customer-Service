"use client";

/* ===========================================================
   Bagian "Toko Terhubung" di Pengaturan → Integrasi Marketplace.

   Membaca /api/shopee/toko (bukan tabelnya langsung — tabel itu
   berisi token dan memang tertutup untuk peramban). Tombol
   "Hubungkan Toko Shopee" adalah tautan biasa ke /api/shopee/auth-url
   yang mengarahkan ke halaman persetujuan Shopee; sesudah disetujui,
   /shopee/callback mengembalikan ke /settings?shopee=ok|gagal.

   Pesan hasilnya dibaca dari window.location di dalam effect, bukan
   lewat useSearchParams — yang terakhir menuntut batas Suspense di
   halaman induk hanya untuk satu parameter sekali baca.
   =========================================================== */

import { useEffect, useState } from "react";
import { headerBerSesi } from "@/lib/supabase/header";
import { stempel } from "@/lib/format";
import { useAuth } from "@/lib/auth";

type RingkasanToko = {
  toko: string;
  ok: boolean;
  ditemukan: number;
  disimpan: number;
  lama_ms: number;
  galat?: string;
};

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

export default function TokoTerhubung() {
  const { isAdmin } = useAuth();
  const [daftar, setDaftar] = useState<Toko[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [hasil, setHasil] = useState<Hasil>(null);
  const [sinkron, setSinkron] = useState<{ jalan: boolean; ringkasan: RingkasanToko[] | null; galat: string | null }>({
    jalan: false,
    ringkasan: null,
    galat: null,
  });

  /* Hanya admin yang melihat tombolnya, dan rute di baliknya memeriksa
     peran admin lagi di server — tombol yang disembunyikan bukan
     pengaman. Dipakai saat uji manual; cron-lah yang bekerja rutin. */
  const sinkronSekarang = async () => {
    setSinkron({ jalan: true, ringkasan: null, galat: null });
    try {
      const res = await fetch("/api/sync/shopee-orders", { method: "POST", headers: await headerBerSesi() });
      const data = await res.json();
      if (!res.ok) {
        setSinkron({ jalan: false, ringkasan: null, galat: data?.error ?? `HTTP ${res.status}` });
        return;
      }
      setSinkron({ jalan: false, ringkasan: data.toko as RingkasanToko[], galat: null });
    } catch (err) {
      setSinkron({ jalan: false, ringkasan: null, galat: (err as Error).message });
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
      } catch (err) {
        if (!batal) setGalat((err as Error).message);
      }
    })();
    return () => {
      batal = true;
    };
  }, [hasil]);

  return (
    <div className="mb-5 rounded-[18px] border border-line bg-white p-5 shadow-[0_8px_30px_rgb(15_23_42/0.04)] max-mini:p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div className="text-[0.95rem] font-bold">Toko Terhubung</div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={sinkronSekarang}
              disabled={sinkron.jalan}
              className="cursor-pointer rounded-[9px] border border-line bg-white px-3.5 py-1.5 text-[0.84rem] font-bold text-text-2 transition hover:bg-green-soft disabled:cursor-wait disabled:opacity-60"
            >
              {sinkron.jalan ? "Menyinkronkan…" : "Sinkronkan sekarang"}
            </button>
          )}
          <a
            href="/api/shopee/auth-url"
            className="rounded-[9px] bg-green px-3.5 py-1.5 text-[0.84rem] font-bold text-white no-underline transition hover:bg-green-hover"
          >
            Hubungkan Toko Shopee
          </a>
        </div>
      </div>

      {sinkron.galat && (
        <p role="alert" className="mb-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3.5 py-2.5 text-[0.86rem] text-[#b91c1c]">
          Sinkronisasi gagal dipicu: {sinkron.galat}
        </p>
      )}
      {sinkron.ringkasan && (
        <div className="mb-4 rounded-xl border border-line bg-green-soft px-3.5 py-2.5 text-[0.82rem]">
          <div className="mb-1 font-bold">Hasil sinkronisasi</div>
          {sinkron.ringkasan.length === 0 ? (
            <div className="text-muted">Tidak ada toko aktif.</div>
          ) : (
            <ul className="m-0 list-none p-0">
              {sinkron.ringkasan.map((r) => (
                <li key={r.toko} className="flex flex-wrap justify-between gap-2 py-0.5">
                  <span>{r.toko}</span>
                  <span className={r.ok ? "text-green-dark" : "text-[#b91c1c]"}>
                    {r.ok
                      ? `${r.ditemukan} berubah · ${r.disimpan} tersimpan · ${r.lama_ms} ms`
                      : `gagal: ${r.galat}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {hasil?.shopee === "ok" && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-line bg-green-soft px-3.5 py-2.5 text-[0.86rem] text-green-dark"
        >
          Toko <b>{hasil.toko}</b> berhasil dihubungkan.
          {hasil.catatan === "nama_toko_belum" && " Nama tokonya belum terbaca; akan terisi saat sinkronisasi."}
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
          {daftar.map((t) => (
            <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line p-3.5">
              <div className="min-w-0">
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
                  <dt className="text-muted">Pesanan tersinkron</dt>
                  <dd className="m-0">
                    {t.orders_synced_until ? `sampai ${stempel(t.orders_synced_until)}` : "belum pernah"}
                  </dd>
                </dl>
              </div>
              <span
                className={`shrink-0 text-[0.82rem] font-bold ${t.is_active ? "text-green-dark" : "text-[#d97706]"}`}
              >
                ● {t.is_active ? "Aktif" : "Perlu otorisasi ulang"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
