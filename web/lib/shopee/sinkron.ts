import "server-only";

/* ===========================================================
   Sinkronisasi pesanan Shopee -> tabel orders, SATU TOKO per panggilan.

   Dipanggil oleh /api/sync/shopee-orders?toko=<uuid> — dari job pg_cron
   (satu panggilan per toko, hanya bila mode otomatis) atau dari tombol
   "Sinkronkan sekarang" di Pengaturan (berulang selama "belum_selesai").

   KENAPA DICICIL (perbaikan-sinkron-skala-besar, 12 Nov 2026)

   Toko utama berganti 6–10 ribu pesanan sehari. Dulu satu panggilan
   menarik seluruh jendela lalu baru memajukan orders_synced_until di
   akhir; fungsi terpotong batas waktu, titiknya tidak pernah maju, dan
   percobaan berikutnya mengulang jendela yang sama — makin lebar.

   Sekarang jendela dipecah per jam (pecahPotongan). Tiap potongan:
   tarik order_sn -> belah dua bila > 1.000 -> detail -> simpan -> BARU
   majukan titik ke ujung potongan itu. Potongan baru tidak dimulai bila
   sisa waktu tidak cukup; panggilan berikutnya melanjutkan dari titik
   yang sudah tercatat. Aturannya murni di sinkronAturan.ts dan diuji
   oleh scripts/uji-shopee-sinkron.mjs.

   DUA SAKELAR — keduanya diperiksa DI SINI, di server, sebelum Shopee
   disentuh. Menyembunyikan tombol bukan pengaman.
     1. marketplace_shops.sinkron_pesanan   per toko, bawaan false
     2. settings.sinkron_pesanan_otomatis   mode jadwal, hanya untuk cron

   SATU PROSES PER TOKO: kunci sinkron_kunci_sampai mencegah cron dan
   tombol menarik toko yang sama bersamaan. Kunci milik fungsi yang mati
   lepas sendiri sesudah LAMA_KUNCI_SINKRON_DETIK.
   =========================================================== */

import { getSupabaseAdmin } from "../supabase/admin.ts";
import { petakanPesananShopee } from "../marketplace/pemetaPesanan.ts";
import type { PesananInternal } from "../marketplace/tipe.ts";
import { GalatShopee } from "./klien.ts";
import {
  LAMA_KUNCI_SINKRON_DETIK,
  MAKS_SN_PER_POTONGAN,
  bacaModeRaw,
  belahBilaPerlu,
  bolehMulaiPotongan,
  keputusanSinkron,
  majukanTitik,
  pecahPotongan,
  perluSimpanRaw,
  pisahkanBerubah,
  titikMulai,
  type ModeRaw,
} from "./sinkronAturan.ts";
import { timestampSekarang } from "./tandaTangan.ts";
import { daftarSnBerubah, detailPesanan } from "./tarikPesanan.ts";
import { GalatToko, bacaToko, tokenTokoValid, type TokoUntukLayar } from "./token.ts";

export type StatusSinkronToko =
  | "selesai"
  | "belum_selesai"
  | "galat"
  | "dilewati_toko_nonaktif"
  | "dilewati_mode_manual"
  | "dilewati_perlu_otorisasi"
  | "dilewati_sedang_berjalan"
  | "toko_tidak_ditemukan";

export type RingkasanToko = {
  toko: string;
  shop_id: string;
  ok: boolean;
  status: StatusSinkronToko;
  /** Jendela yang dituju panggilan ini, ISO. */
  dari: string;
  sampai: string;
  /** orders_synced_until sesudah panggilan ini — dari sinilah panggilan berikutnya lanjut. */
  titik: string | null;
  potongan_selesai: number;
  potongan_sisa: number;
  dibelah: number;
  ditemukan: number;
  disimpan: number;
  /** Dilewati karena update_time Shopee sama dengan baris yang sudah ada. */
  dilewati_sama: number;
  raw_disimpan: number;
  lama_ms: number;
  /** Kode galat saja — tidak pernah pesan yang memuat token. */
  galat?: string;
};

const UKURAN_UPSERT = 200;
const TABEL_TOKO = "marketplace_shops";

function namaToko(t: TokoUntukLayar): string {
  return t.shop_name ?? `Toko ${t.external_shop_id}`;
}

function kodeGalat(err: unknown): string {
  if (err instanceof GalatShopee) return err.kode;
  if (err instanceof GalatToko) return err.kode;
  return (err as Error)?.name ?? "tak_dikenal";
}

/* ---------------- Simpan ---------------- */

type HasilSimpan = { disimpan: number; dilewati: number; raw: number };

/**
 * Simpan baris pesanan yang BERUBAH, plus jawaban mentah hanya untuk
 * yang perlu (SHOPEE_SIMPAN_RAW). Baris yang update_time-nya sama
 * dengan yang sudah ada tidak ditulis ulang — upsert tanpa perubahan
 * tetap menambah dead tuple di Postgres.
 */
async function simpanPesanan(
  baris: PesananInternal[],
  mentah: Map<string, unknown>,
  modeRaw: ModeRaw,
): Promise<HasilSimpan> {
  const sb = getSupabaseAdmin();
  const sekarang = new Date().toISOString();
  const hasil: HasilSimpan = { disimpan: 0, dilewati: 0, raw: 0 };

  for (let i = 0; i < baris.length; i += UKURAN_UPSERT) {
    const potongan = baris.slice(i, i + UKURAN_UPSERT);

    const { data: ada, error: galatBaca } = await sb
      .from("orders")
      .select("external_order_id, order_updated_at")
      .eq("platform", "shopee")
      .in(
        "external_order_id",
        potongan.map((b) => b.external_order_id),
      );
    if (galatBaca) throw new GalatToko("database", `orders (baca): ${galatBaca.message}`);
    const peta = new Map<string, string | null>(
      (ada ?? []).map((r) => [r.external_order_id as string, (r.order_updated_at as string | null) ?? null]),
    );

    const { tulis, lewati } = pisahkanBerubah(potongan, peta);
    hasil.dilewati += lewati.length;
    if (tulis.length === 0) continue;

    const { data, error } = await sb
      .from("orders")
      .upsert(
        tulis.map((b) => ({ ...b, synced_at: sekarang })),
        { onConflict: "platform,external_order_id" },
      )
      .select("id, external_order_id");
    if (error) throw new GalatToko("database", `orders: ${error.message}`);
    hasil.disimpan += data?.length ?? 0;

    /* orders_raw butuh uuid baris orders — itu sebabnya upsert di atas
       memilih id. Hanya service_role yang sampai ke sini. */
    const perluRaw = new Set(tulis.filter((b) => perluSimpanRaw(modeRaw, b)).map((b) => b.external_order_id));
    const barisMentah = (data ?? [])
      .filter((d) => perluRaw.has(d.external_order_id as string) && mentah.has(d.external_order_id as string))
      .map((d) => ({ order_id: d.id as string, raw: mentah.get(d.external_order_id as string), synced_at: sekarang }));
    if (barisMentah.length > 0) {
      const { error: galatMentah } = await sb.from("orders_raw").upsert(barisMentah, { onConflict: "order_id" });
      if (galatMentah) throw new GalatToko("database", `orders_raw: ${galatMentah.message}`);
      hasil.raw += barisMentah.length;
    }
  }
  return hasil;
}

/* ---------------- Kunci per toko ---------------- */

/**
 * Pegang kunci sinkron toko. Mengembalikan nilai kunci yang dipegang,
 * atau null bila proses lain sedang memegangnya. Satu UPDATE bersyarat —
 * atomik di Postgres. Kunci kosong, sudah lewat, atau terlalu jauh di
 * masa depan (rusak) boleh diambil; aturan yang sama dengan
 * kunciSinkronDipegang() di sinkronAturan.ts.
 */
async function klaimKunciSinkron(id: string, sekarangMs: number): Promise<string | null> {
  const sb = getSupabaseAdmin();
  const kini = new Date(sekarangMs).toISOString();
  const rusak = new Date(sekarangMs + LAMA_KUNCI_SINKRON_DETIK * 2 * 1000).toISOString();
  const sampai = new Date(sekarangMs + LAMA_KUNCI_SINKRON_DETIK * 1000).toISOString();
  const { data, error } = await sb
    .from(TABEL_TOKO)
    .update({ sinkron_kunci_sampai: sampai })
    .eq("id", id)
    .or(`sinkron_kunci_sampai.is.null,sinkron_kunci_sampai.lt.${kini},sinkron_kunci_sampai.gt.${rusak}`)
    .select("id");
  if (error) throw new GalatToko("database", `kunci sinkron: ${error.message}`);
  return (data?.length ?? 0) === 1 ? sampai : null;
}

/** Lepas kunci — hanya bila masih kunci MILIK KITA (bukan milik proses yang mengambilnya sesudah kedaluwarsa). */
async function lepasKunciSinkron(id: string, kunci: string, status: StatusSinkronToko): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from(TABEL_TOKO)
    .update({ sinkron_kunci_sampai: null, sinkron_terakhir_pada: new Date().toISOString(), sinkron_terakhir_status: status })
    .eq("id", id)
    .eq("sinkron_kunci_sampai", kunci);
  /* Gagal melepas tidak fatal: kunci lepas sendiri sesudah kedaluwarsa. */
  if (error) console.warn("[sinkron] kunci tidak terlepas:", error.code ?? "?");
}

/** settings.sinkron_pesanan_otomatis apa adanya; galat/kosong -> null (= manual). */
export async function bacaModeOtomatis(): Promise<unknown> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("settings").select("sinkron_pesanan_otomatis").eq("id", 1).maybeSingle();
  if (error || !data) return null;
  return (data as { sinkron_pesanan_otomatis?: unknown }).sinkron_pesanan_otomatis ?? null;
}

/* ---------------- Satu toko, dicicil ---------------- */

function ringkasanKosong(t: TokoUntukLayar, status: StatusSinkronToko, mulaiMs: number): RingkasanToko {
  const kini = new Date().toISOString();
  return {
    toko: namaToko(t),
    shop_id: t.external_shop_id,
    ok: !status.startsWith("galat"),
    status,
    dari: kini,
    sampai: kini,
    titik: t.orders_synced_until,
    potongan_selesai: 0,
    potongan_sisa: 0,
    dibelah: 0,
    ditemukan: 0,
    disimpan: 0,
    dilewati_sama: 0,
    raw_disimpan: 0,
    lama_ms: Date.now() - mulaiMs,
  };
}

/**
 * Tarik pesanan satu toko sampai jendelanya habis atau tenggat dekat.
 * Tidak memeriksa sakelar — itu tugas sinkronkanToko() di bawah.
 */
async function cicilToko(t: TokoUntukLayar, tenggatMs: number): Promise<RingkasanToko> {
  const mulaiMs = Date.now();
  const sekarang = timestampSekarang();
  const dari = titikMulai(t.orders_synced_until, sekarang);
  const antrean = pecahPotongan(dari, sekarang);
  const modeRaw = bacaModeRaw(process.env.SHOPEE_SIMPAN_RAW);
  const r: RingkasanToko = {
    ...ringkasanKosong(t, "belum_selesai", mulaiMs),
    dari: new Date(dari * 1000).toISOString(),
    sampai: new Date(sekarang * 1000).toISOString(),
  };

  let terlama = 0;
  try {
    const { accessToken, shopId } = await tokenTokoValid(t.id);
    const sb = getSupabaseAdmin();

    while (antrean.length > 0) {
      if (!bolehMulaiPotongan(Date.now(), tenggatMs, terlama)) break;
      const p = antrean[0];
      const t0 = Date.now();

      let daftarSn = await daftarSnBerubah(accessToken, shopId, p.dari, p.sampai, MAKS_SN_PER_POTONGAN);
      const belahan = belahBilaPerlu(p, daftarSn.length);
      if (belahan) {
        antrean.splice(0, 1, ...belahan);
        r.dibelah += 1;
        terlama = Math.max(terlama, Date.now() - t0);
        continue;
      }
      /* Lebih dari batas tetapi sudah terlalu sempit untuk dibelah:
         daftar tadi berhenti di tengah, tarik ulang selengkapnya. */
      if (daftarSn.length > MAKS_SN_PER_POTONGAN) {
        daftarSn = await daftarSnBerubah(accessToken, shopId, p.dari, p.sampai);
      }

      if (daftarSn.length > 0) {
        const detail = await detailPesanan(accessToken, shopId, daftarSn);
        const mentah = new Map<string, unknown>(detail.map((d) => [d.order_sn, d]));
        const s = await simpanPesanan(
          detail.map((d) => petakanPesananShopee(d, t.id)),
          mentah,
          modeRaw,
        );
        r.ditemukan += daftarSn.length;
        r.disimpan += s.disimpan;
        r.dilewati_sama += s.dilewati;
        r.raw_disimpan += s.raw;
      }

      /* BARU sekarang, sesudah potongan ini tersimpan, titiknya maju. */
      const titikBaru = majukanTitik(r.titik, p.sampai);
      const { error } = await sb.from(TABEL_TOKO).update({ orders_synced_until: titikBaru }).eq("id", t.id);
      if (error) throw new GalatToko("database", `orders_synced_until: ${error.message}`);
      r.titik = titikBaru;
      antrean.shift();
      r.potongan_selesai += 1;
      terlama = Math.max(terlama, Date.now() - t0);
    }

    r.status = antrean.length > 0 ? "belum_selesai" : "selesai";
  } catch (err) {
    r.ok = false;
    r.status = "galat";
    r.galat = kodeGalat(err);
    console.error(`[sinkron] ${r.toko} gagal:`, r.galat);
  }
  r.potongan_sisa = antrean.length;
  r.lama_ms = Date.now() - mulaiMs;
  return r;
}

/**
 * Pintu satu-satunya ke sinkronisasi pesanan. Memeriksa kedua sakelar
 * dan kunci SEBELUM menyentuh Shopee.
 *
 * @param id uuid baris marketplace_shops.
 * @param tenggatMs epoch ms; potongan baru tidak dimulai mendekati ini.
 */
export async function sinkronkanToko(
  id: string,
  pemicu: "cron" | "admin",
  tenggatMs: number,
): Promise<{ status: StatusSinkronToko; ringkasan: RingkasanToko | null }> {
  const mulaiMs = Date.now();
  const t = await bacaToko(id);
  if (!t) return { status: "toko_tidak_ditemukan", ringkasan: null };

  const keputusan = keputusanSinkron({
    pemicu,
    sinkronPesanan: t.sinkron_pesanan,
    /* Mode jadwal hanya dibaca untuk cron; tombol admin tidak melihatnya. */
    modeOtomatis: pemicu === "cron" ? await bacaModeOtomatis() : null,
  });
  if (keputusan !== "jalan") return { status: keputusan, ringkasan: ringkasanKosong(t, keputusan, mulaiMs) };

  if (!t.is_active) {
    return { status: "dilewati_perlu_otorisasi", ringkasan: ringkasanKosong(t, "dilewati_perlu_otorisasi", mulaiMs) };
  }

  const kunci = await klaimKunciSinkron(t.id, Date.now());
  if (!kunci) {
    return { status: "dilewati_sedang_berjalan", ringkasan: ringkasanKosong(t, "dilewati_sedang_berjalan", mulaiMs) };
  }

  let ringkasan: RingkasanToko | null = null;
  try {
    ringkasan = await cicilToko(t, tenggatMs);
    return { status: ringkasan.status, ringkasan };
  } finally {
    await lepasKunciSinkron(t.id, kunci, ringkasan?.status ?? "galat");
  }
}
