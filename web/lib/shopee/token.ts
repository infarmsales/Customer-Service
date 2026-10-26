import "server-only";

/* ===========================================================
   Token toko Shopee — tukar kode, simpan, segarkan dengan kunci.

   HANYA DI SERVER, dan satu-satunya tempat yang menyentuh kolom
   access_token / refresh_token di marketplace_shops. Tabel itu tidak
   punya policy RLS, jadi semuanya lewat klien service_role.

   TIGA FAKTA DARI DOKUMENTASI YANG MEMBENTUK BERKAS INI

   1. refresh_token SEKALI PAKAI. Setiap refresh menerbitkan yang
      baru dan yang lama hangus seketika. Maka hasil refresh SELALU
      ditimpa ke database — kedua token sekaligus — sebelum dipakai.
      Refresh yang berhasil di Shopee tetapi gagal disimpan adalah
      bencana: token baru hilang, token lama sudah mati.

   2. Dua proses yang menyegarkan bersamaan (dua cron bertabrakan,
      atau cron dan klik manual) akan saling menghanguskan: yang
      kedua memakai refresh_token yang baru saja dibakar yang
      pertama. Kunci refreshing_until mencegahnya — hanya satu
      proses yang boleh menyegarkan, yang lain menunggu lalu membaca
      hasilnya.

   3. Beberapa kode galat berarti "refresh_token sudah mati" dan
      tidak ada gunanya mencoba lagi; satu-satunya jalan adalah
      pemilik toko mengotorisasi ulang. Untuk itu toko ditandai
      is_active = false supaya terlihat di halaman Pengaturan.
      Kode lain (server sakit, jaringan) TIDAK menonaktifkan toko.

   YANG TIDAK PERNAH DILAKUKAN BERKAS INI

   Mencetak token ke log atau mengembalikannya ke peramban. Fungsi
   daftarToko() memilih kolomnya satu per satu dan tidak pernah
   menyertakan token.
   =========================================================== */

/* Relatif, bukan alias "@/": berkas ini juga dijalankan langsung oleh
   Node untuk uji dan pemeriksaan dari CLI, dan Node tidak mengenal
   alias tsconfig. */
import { getSupabaseAdmin } from "../supabase/admin.ts";
import { GalatShopee, kredensialDariEnv, permintaanMentah } from "./klien.ts";
import {
  LAMA_KUNCI_DETIK,
  UMUR_REFRESH_TOKEN_HARI,
  hitungKedaluwarsaToken,
  kodeTokenHangus,
  kunciMasihDipegang,
  tokenMasihSegar,
} from "./otorisasi.ts";
import type { InfoToko, JawabanToken } from "./tipe.ts";

const TABEL = "marketplace_shops";
const PLATFORM = "shopee";

/** Kolom yang dibaca untuk keperluan token. TIDAK pernah dikirim ke peramban. */
const KOLOM_TOKEN =
  "id, platform, external_shop_id, shop_name, access_token, refresh_token, " +
  "access_token_expires_at, refresh_token_expires_at, refreshing_until, is_active";

/** Kolom yang BOLEH dilihat peramban — tanpa token. */
const KOLOM_LAYAR =
  "id, platform, external_shop_id, shop_name, region, is_active, " +
  "access_token_expires_at, refresh_token_expires_at, authorization_expires_at, " +
  "orders_synced_until, updated_at";

type BarisToken = {
  id: string;
  platform: string;
  external_shop_id: string;
  shop_name: string | null;
  access_token: string | null;
  refresh_token: string | null;
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  refreshing_until: string | null;
  is_active: boolean;
};

export type TokoUntukLayar = {
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
  orders_synced_until: string | null;
  updated_at: string;
};

export type TokenToko = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
};

/** Keadaan toko yang membuat token tidak bisa diberikan. */
export class GalatToko extends Error {
  readonly kode: "tidak_ditemukan" | "nonaktif" | "terkunci" | "tanpa_refresh_token" | "database";

  constructor(kode: GalatToko["kode"], pesan: string) {
    super(pesan);
    this.name = "GalatToko";
    this.kode = kode;
  }
}

const tidur = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function tokenDariJawaban(data: JawabanToken, requestId: string | null): TokenToko {
  if (!data.access_token || !data.refresh_token) {
    throw new GalatShopee(
      "tanpa_token",
      "Jawaban berhasil tetapi tidak memuat access_token/refresh_token.",
      requestId,
      null,
    );
  }
  const sekarangMs = Date.now();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessExpiresAt: hitungKedaluwarsaToken(data.expire_in, Math.floor(sekarangMs / 1000)),
    refreshExpiresAt: new Date(sekarangMs + UMUR_REFRESH_TOKEN_HARI * 86_400_000),
  };
}

/* -----------------------------------------------------------
   Otorisasi pertama: code -> token
   ----------------------------------------------------------- */

/**
 * Tukar `code` dari URL balik otorisasi dengan token.
 * code hanya berlaku 10 menit dan SEKALI pakai (dokumentasi).
 */
export async function tukarKode(code: string, shopId: string): Promise<TokenToko> {
  const kred = kredensialDariEnv();
  const { data, requestId } = await permintaanMentah<JawabanToken>({
    path: "/api/v2/auth/token/get",
    method: "POST",
    body: { code, shop_id: Number(shopId), partner_id: Number(kred.partnerId) },
  });
  return tokenDariJawaban(data, requestId);
}

/**
 * Simpan (atau timpa) toko beserta tokennya. Mengembalikan id baris.
 * Otorisasi ulang pada toko yang sudah ada menimpa tokennya dan
 * mengaktifkan kembali tokonya.
 */
export async function simpanTokoBaru(shopId: string, token: TokenToko): Promise<string> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from(TABEL)
    .upsert(
      {
        platform: PLATFORM,
        external_shop_id: shopId,
        access_token: token.accessToken,
        refresh_token: token.refreshToken,
        access_token_expires_at: token.accessExpiresAt.toISOString(),
        refresh_token_expires_at: token.refreshExpiresAt.toISOString(),
        refreshing_until: null,
        is_active: true,
      },
      { onConflict: "platform,external_shop_id" },
    )
    .select("id")
    .single();
  if (error || !data) throw new GalatToko("database", error?.message ?? "upsert tanpa baris");
  return data.id as string;
}

/** Nama, wilayah, dan kapan otorisasi habis — dari Shopee. */
export async function ambilInfoToko(accessToken: string, shopId: string): Promise<InfoToko> {
  const { data } = await permintaanMentah<InfoToko>({
    path: "/api/v2/shop/get_shop_info",
    shopId,
    accessToken,
  });
  return data;
}

export async function perbaruiProfilToko(id: string, info: InfoToko): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from(TABEL)
    .update({
      shop_name: info.shop_name ?? null,
      region: info.region ?? null,
      authorization_expires_at:
        typeof info.expire_time === "number" && info.expire_time > 0
          ? new Date(info.expire_time * 1000).toISOString()
          : null,
    })
    .eq("id", id);
  if (error) throw new GalatToko("database", error.message);
}

/* -----------------------------------------------------------
   Untuk halaman Pengaturan — tanpa token
   ----------------------------------------------------------- */

export async function daftarToko(): Promise<TokoUntukLayar[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from(TABEL)
    .select(KOLOM_LAYAR)
    .order("created_at", { ascending: true });
  if (error) throw new GalatToko("database", error.message);
  return (data ?? []) as unknown as TokoUntukLayar[];
}

/**
 * Semua toko SHOPEE aktif — untuk sinkronisasi (Fase 4). Tanpa token.
 *
 * Penyaring platform wajib sejak toko TikTok ikut tinggal di tabel
 * yang sama (26 Okt 2026): tanpa itu cron Shopee akan me-refresh token
 * TikTok ke server Shopee, dan galat error_auth-nya bisa menonaktifkan
 * toko TikTok yang sebenarnya sehat.
 */
export async function daftarTokoAktif(): Promise<TokoUntukLayar[]> {
  return (await daftarToko()).filter((t) => t.is_active && t.platform === PLATFORM);
}

/* -----------------------------------------------------------
   Token yang sah untuk dipakai — menyegarkan bila perlu
   ----------------------------------------------------------- */

async function bacaBaris(id: string): Promise<BarisToken> {
  const sb = getSupabaseAdmin();
  /* platform ikut disaring: id baris TikTok yang tersasar ke sini harus
     berakhir "tidak ditemukan", bukan di-refresh ke server Shopee. */
  const { data, error } = await sb
    .from(TABEL)
    .select(KOLOM_TOKEN)
    .eq("id", id)
    .eq("platform", PLATFORM)
    .maybeSingle();
  if (error) throw new GalatToko("database", error.message);
  if (!data) throw new GalatToko("tidak_ditemukan", `Toko ${id} tidak ada.`);
  return data as unknown as BarisToken;
}

/**
 * Coba memegang kunci penyegaran. true bila berhasil.
 *
 * Satu UPDATE bersyarat — atomik di PostgreSQL. Dua proses yang
 * mencoba bersamaan: tepat satu yang melihat baris berubah.
 */
async function klaimKunci(id: string, sekarangMs: number): Promise<boolean> {
  const sb = getSupabaseAdmin();
  const sekarangIso = new Date(sekarangMs).toISOString();
  const sampaiIso = new Date(sekarangMs + LAMA_KUNCI_DETIK * 1000).toISOString();
  const { data, error } = await sb
    .from(TABEL)
    .update({ refreshing_until: sampaiIso })
    .eq("id", id)
    .or(`refreshing_until.is.null,refreshing_until.lt.${sekarangIso}`)
    .select("id");
  if (error) throw new GalatToko("database", error.message);
  return (data?.length ?? 0) === 1;
}

async function lepasKunci(id: string): Promise<void> {
  const sb = getSupabaseAdmin();
  await sb.from(TABEL).update({ refreshing_until: null }).eq("id", id);
}

async function segarkan(baris: BarisToken): Promise<TokenToko> {
  if (!baris.refresh_token) {
    throw new GalatToko("tanpa_refresh_token", `Toko ${baris.external_shop_id} tidak punya refresh_token.`);
  }
  const kred = kredensialDariEnv();
  const sb = getSupabaseAdmin();

  let token: TokenToko;
  try {
    const { data, requestId } = await permintaanMentah<JawabanToken>({
      path: "/api/v2/auth/access_token/get",
      method: "POST",
      body: {
        refresh_token: baris.refresh_token,
        shop_id: Number(baris.external_shop_id),
        partner_id: Number(kred.partnerId),
      },
    });
    token = tokenDariJawaban(data, requestId);
  } catch (err) {
    if (err instanceof GalatShopee && kodeTokenHangus(err.kode)) {
      /* Tidak ada gunanya mencoba lagi. Tandai supaya terlihat di
         halaman Pengaturan, lalu lepaskan kuncinya. */
      await sb.from(TABEL).update({ is_active: false, refreshing_until: null }).eq("id", baris.id);
    } else {
      await lepasKunci(baris.id);
    }
    throw err;
  }

  /* KEDUA token ditimpa — refresh_token lama sudah hangus di Shopee. */
  const { error } = await sb
    .from(TABEL)
    .update({
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
      access_token_expires_at: token.accessExpiresAt.toISOString(),
      refresh_token_expires_at: token.refreshExpiresAt.toISOString(),
      refreshing_until: null,
      is_active: true,
    })
    .eq("id", baris.id);
  if (error) {
    /* Keadaan paling buruk yang bisa terjadi di berkas ini: Shopee
       sudah menerbitkan token baru, kita gagal menyimpannya. Kunci
       dilepas supaya percobaan berikutnya tidak menunggu 30 detik,
       dan galatnya menyebut keadaannya dengan jelas. */
    await lepasKunci(baris.id);
    throw new GalatToko(
      "database",
      `Token baru diterbitkan Shopee tetapi GAGAL disimpan (${error.message}). ` +
        "refresh_token lama sudah hangus; toko kemungkinan perlu diotorisasi ulang.",
    );
  }
  return token;
}

/**
 * Access token yang sah untuk toko ini, menyegarkan bila sisa umurnya
 * kurang dari MARGIN_SEGAR_MENIT.
 *
 * @param id id baris marketplace_shops (uuid), BUKAN shop_id Shopee.
 */
export async function tokenTokoValid(id: string): Promise<{ accessToken: string; shopId: string }> {
  const PERCOBAAN = 6;
  const JEDA_MS = 2_000;

  for (let ke = 0; ke < PERCOBAAN; ke++) {
    const baris = await bacaBaris(id);
    if (!baris.is_active) {
      throw new GalatToko("nonaktif", `Toko ${baris.shop_name ?? baris.external_shop_id} perlu diotorisasi ulang.`);
    }

    const sekarangMs = Date.now();
    if (baris.access_token && tokenMasihSegar(baris.access_token_expires_at, sekarangMs)) {
      return { accessToken: baris.access_token, shopId: baris.external_shop_id };
    }

    if (kunciMasihDipegang(baris.refreshing_until, sekarangMs)) {
      /* Proses lain sedang menyegarkan. Tunggu, lalu baca ulang —
         hasilnya akan ada di database, bukan di proses ini. */
      await tidur(JEDA_MS);
      continue;
    }

    if (await klaimKunci(id, sekarangMs)) {
      const token = await segarkan(baris);
      return { accessToken: token.accessToken, shopId: baris.external_shop_id };
    }

    /* Kalah berebut kunci dengan proses lain di antara dua baris di
       atas. Tunggu dan baca ulang seperti kasus sebelumnya. */
    await tidur(JEDA_MS);
  }

  throw new GalatToko(
    "terkunci",
    `Kunci penyegaran toko ${id} tidak kunjung lepas setelah ${(PERCOBAAN * JEDA_MS) / 1000} detik.`,
  );
}
