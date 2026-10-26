import "server-only";

/* ===========================================================
   Token toko TikTok — tukar kode, simpan, segarkan dengan kunci.

   HANYA DI SERVER. Satu-satunya tempat yang menyentuh access_token /
   refresh_token baris TikTok di marketplace_shops (tanpa policy RLS,
   jadi semuanya lewat service_role).

   BEDA DENGAN SHOPEE (lib/shopee/token.ts)

   - Kode otorisasi berlaku 30 menit, sekali pakai.
   - access_token berlaku 7 hari; *_expire_in adalah EPOCH, bukan durasi.
   - Token milik PENJUAL, bukan toko. Satu otorisasi bisa mencakup
     beberapa toko (Get Authorized Shops); semuanya memakai token yang
     sama dan dibedakan oleh shop_cipher. Karena itu satu kali refresh
     menimpa token SEMUA baris yang memakai refresh_token yang sama.
   - Dokumentasi di zip tidak menyebut apakah refresh_token sekali
     pakai. Kunci refreshing_until tetap dipasang — kalau ternyata
     sekali pakai, dua proses yang menyegarkan bersamaan akan saling
     menghanguskan, persis kasus Shopee.
   - Dokumentasi juga tidak memberi kode galat untuk "refresh_token
     sudah mati". Maka toko TIDAK pernah dinonaktifkan otomatis karena
     galat refresh; yang dipakai hanya refresh_token_expires_at.

   YANG TIDAK PERNAH DILAKUKAN BERKAS INI

   Mencetak token ke log atau mengembalikannya ke peramban.
   =========================================================== */

import { getSupabaseAdmin } from "../supabase/admin.ts";
import { tokenMasihSegar, kunciMasihDipegang, LAMA_KUNCI_DETIK } from "../shopee/otorisasi.ts";
import { epochKeTanggal, tokoSah, type TokoLengkap } from "./aturan.ts";
import { GalatTiktok, mintaToken, permintaanTiktok } from "./klien.ts";
import type { DaftarTokoTerotorisasi, JawabanToken } from "./tipe.ts";

const TABEL = "marketplace_shops";
const PLATFORM = "tiktok";

/** Dipakai bila refresh_token_expire_in tidak terbaca: anggap 30 hari. */
const CADANGAN_REFRESH_DETIK = 30 * 86_400;

export type TokenPenjual = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  sellerName: string | null;
  region: string | null;
  grantedScopes: string[];
};

export class GalatTokoTiktok extends Error {
  readonly kode: "tidak_ditemukan" | "nonaktif" | "terkunci" | "tanpa_toko" | "kedaluwarsa" | "database";
  constructor(kode: GalatTokoTiktok["kode"], pesan: string) {
    super(pesan);
    this.name = "GalatTokoTiktok";
    this.kode = kode;
  }
}

const tidur = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function tokenDari(data: JawabanToken, requestId: string | null): TokenPenjual {
  if (!data.access_token || !data.refresh_token) {
    throw new GalatTiktok("tanpa_token", "Jawaban berhasil tetapi tidak memuat token.", requestId, null);
  }
  const sekarang = Math.floor(Date.now() / 1000);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessExpiresAt: epochKeTanggal(data.access_token_expire_in, sekarang),
    refreshExpiresAt: epochKeTanggal(data.refresh_token_expire_in, sekarang, CADANGAN_REFRESH_DETIK),
    sellerName: data.seller_name ?? null,
    region: data.seller_base_region ?? null,
    grantedScopes: Array.isArray(data.granted_scopes) ? data.granted_scopes : [],
  };
}

/* -----------------------------------------------------------
   Otorisasi pertama
   ----------------------------------------------------------- */

/** auth_code -> token. grant_type HARUS "authorized_code" (bukan ejaan OAuth baku). */
export async function tukarKode(authCode: string): Promise<TokenPenjual> {
  const { data, requestId } = await mintaToken<JawabanToken>("/api/v2/token/get", {
    auth_code: authCode,
    grant_type: "authorized_code",
  });
  return tokenDari(data, requestId);
}

/** Toko yang dicakup token ini, beserta shop_cipher-nya. */
export async function ambilTokoTerotorisasi(accessToken: string): Promise<TokoLengkap[]> {
  const { data } = await permintaanTiktok<DaftarTokoTerotorisasi>({
    path: "/authorization/202309/shops",
    accessToken,
  });
  return tokoSah(data.shops);
}

/** Simpan atau timpa setiap toko. Mengembalikan jumlah baris. */
export async function simpanToko(token: TokenPenjual, toko: readonly TokoLengkap[]): Promise<number> {
  if (toko.length === 0) {
    throw new GalatTokoTiktok(
      "tanpa_toko",
      "Otorisasi berhasil, tetapi Get Authorized Shops tidak mengembalikan toko yang punya id dan cipher.",
    );
  }
  const sb = getSupabaseAdmin();
  const { error } = await sb.from(TABEL).upsert(
    toko.map((t) => ({
      platform: PLATFORM,
      external_shop_id: t.id,
      shop_cipher: t.cipher,
      shop_name: t.name ?? token.sellerName,
      region: t.region ?? token.region,
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
      access_token_expires_at: token.accessExpiresAt.toISOString(),
      refresh_token_expires_at: token.refreshExpiresAt.toISOString(),
      authorization_expires_at: token.refreshExpiresAt.toISOString(),
      refreshing_until: null,
      is_active: true,
    })),
    { onConflict: "platform,external_shop_id" },
  );
  if (error) throw new GalatTokoTiktok("database", error.message);
  return toko.length;
}

/* -----------------------------------------------------------
   Token yang sah untuk dipakai
   ----------------------------------------------------------- */

type Baris = {
  id: string;
  external_shop_id: string;
  shop_name: string | null;
  shop_cipher: string | null;
  access_token: string | null;
  refresh_token: string | null;
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  refreshing_until: string | null;
  is_active: boolean;
};

const KOLOM =
  "id, external_shop_id, shop_name, shop_cipher, access_token, refresh_token, " +
  "access_token_expires_at, refresh_token_expires_at, refreshing_until, is_active";

/** Toko TikTok untuk layar — tanpa token. */
export type TokoTiktokLayar = { id: string; external_shop_id: string; shop_name: string | null; is_active: boolean };

export async function daftarTokoTiktok(): Promise<TokoTiktokLayar[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from(TABEL)
    .select("id, external_shop_id, shop_name, is_active")
    .eq("platform", PLATFORM)
    .order("created_at", { ascending: true });
  if (error) throw new GalatTokoTiktok("database", error.message);
  return (data ?? []) as TokoTiktokLayar[];
}

async function bacaBaris(id: string): Promise<Baris> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from(TABEL).select(KOLOM).eq("id", id).eq("platform", PLATFORM).maybeSingle();
  if (error) throw new GalatTokoTiktok("database", error.message);
  if (!data) throw new GalatTokoTiktok("tidak_ditemukan", `Toko TikTok ${id} tidak ada.`);
  return data as unknown as Baris;
}

async function klaimKunci(id: string, sekarangMs: number): Promise<boolean> {
  const sb = getSupabaseAdmin();
  const sekarangIso = new Date(sekarangMs).toISOString();
  const { data, error } = await sb
    .from(TABEL)
    .update({ refreshing_until: new Date(sekarangMs + LAMA_KUNCI_DETIK * 1000).toISOString() })
    .eq("id", id)
    .or(`refreshing_until.is.null,refreshing_until.lt.${sekarangIso}`)
    .select("id");
  if (error) throw new GalatTokoTiktok("database", error.message);
  return (data?.length ?? 0) === 1;
}

async function segarkan(baris: Baris): Promise<string> {
  const sb = getSupabaseAdmin();
  let token: TokenPenjual;
  try {
    const { data, requestId } = await mintaToken<JawabanToken>("/api/v2/token/refresh", {
      refresh_token: baris.refresh_token ?? "",
      grant_type: "refresh_token",
    });
    token = tokenDari(data, requestId);
  } catch (err) {
    await sb.from(TABEL).update({ refreshing_until: null }).eq("id", baris.id);
    throw err;
  }

  /* Semua baris yang memakai refresh_token lama ikut ditimpa: token
     TikTok milik penjual, bukan milik satu toko. */
  const { error } = await sb
    .from(TABEL)
    .update({
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
      access_token_expires_at: token.accessExpiresAt.toISOString(),
      refresh_token_expires_at: token.refreshExpiresAt.toISOString(),
      refreshing_until: null,
    })
    .eq("platform", PLATFORM)
    .eq("refresh_token", baris.refresh_token ?? "");
  if (error) {
    await sb.from(TABEL).update({ refreshing_until: null }).eq("id", baris.id);
    throw new GalatTokoTiktok(
      "database",
      `Token baru diterbitkan TikTok tetapi GAGAL disimpan (${error.message}). Toko mungkin perlu diotorisasi ulang.`,
    );
  }
  return token.accessToken;
}

/**
 * Access token + shop_cipher yang sah untuk satu toko, menyegarkan
 * bila sisa umurnya tinggal sedikit.
 *
 * @param id id baris marketplace_shops (uuid).
 */
export async function tokenTokoValid(id: string): Promise<{ accessToken: string; shopCipher: string; namaToko: string }> {
  for (let ke = 0; ke < 6; ke++) {
    const b = await bacaBaris(id);
    const nama = b.shop_name ?? b.external_shop_id;
    if (!b.is_active) throw new GalatTokoTiktok("nonaktif", `Toko ${nama} nonaktif.`);
    if (!b.shop_cipher) throw new GalatTokoTiktok("tanpa_toko", `Toko ${nama} belum punya shop_cipher; otorisasi ulang.`);

    const sekarangMs = Date.now();
    if (b.refresh_token_expires_at && Date.parse(b.refresh_token_expires_at) <= sekarangMs) {
      throw new GalatTokoTiktok("kedaluwarsa", `Otorisasi toko ${nama} sudah habis; otorisasi ulang dari Partner Center.`);
    }
    if (b.access_token && tokenMasihSegar(b.access_token_expires_at, sekarangMs)) {
      return { accessToken: b.access_token, shopCipher: b.shop_cipher, namaToko: nama };
    }
    if (!kunciMasihDipegang(b.refreshing_until, sekarangMs) && (await klaimKunci(id, sekarangMs))) {
      return { accessToken: await segarkan(b), shopCipher: b.shop_cipher, namaToko: nama };
    }
    await tidur(2_000);
  }
  throw new GalatTokoTiktok("terkunci", `Kunci penyegaran toko ${id} tidak kunjung lepas.`);
}
