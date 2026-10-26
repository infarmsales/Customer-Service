import "server-only";

/* ===========================================================
   Klien TikTok Shop Open API — satu-satunya jalur HTTP ke TikTok.

   HANYA DI SERVER. Membaca TIKTOK_APP_SECRET dari env.

   DUA JENIS PERMINTAAN

     permintaanTiktok()  Open API toko (open-api.tiktokglobalshop.com).
                         Bertanda tangan; access_token di HEADER
                         x-tts-access-token (wajib untuk versi 202309+),
                         BUKAN di query string.
     mintaToken()        token/get & token/refresh (auth.tiktok-shops.com).
                         Tanpa tanda tangan, tetapi app_secret ikut di
                         query string — karena itu URL-nya tidak boleh
                         dicetak di mana pun.

   Amplop jawabannya sama: { code, message, request_id, data }.
   code = 0 berarti berhasil; selain itu galat, walau HTTP 200.

   YANG TIDAK PERNAH DILAKUKAN BERKAS INI

   Mencetak URL, app_secret, access_token, atau sign ke log maupun ke
   pesan galat. Galat hanya membawa kode TikTok, pesannya, request_id,
   dan status HTTP.
   =========================================================== */

import { HOST_API, HOST_AUTH, queryBertanda, susunUrl, type Kredensial } from "./tandaTangan.ts";

export class GalatTiktok extends Error {
  /** `code` dari TikTok sebagai teks, atau kode buatan: jaringan, bukan_json, http_<n>. */
  readonly kode: string;
  readonly pesan: string;
  readonly requestId: string | null;
  readonly http: number | null;

  constructor(kode: string, pesan: string, requestId: string | null, http: number | null) {
    super(pesan ? `${kode} — ${pesan}` : kode);
    this.name = "GalatTiktok";
    this.kode = kode;
    this.pesan = pesan;
    this.requestId = requestId;
    this.http = http;
  }
}

export class GalatKonfigurasiTiktok extends Error {
  readonly kurang: readonly string[];
  constructor(kurang: readonly string[]) {
    super(`Belum disetel: ${kurang.join(", ")}`);
    this.name = "GalatKonfigurasiTiktok";
    this.kurang = kurang;
  }
}

type Amplop<T> = {
  code?: number;
  message?: string;
  request_id?: string;
  data?: T;
};

export type Pengait = {
  fetchImpl?: typeof fetch;
  kredensial?: Kredensial;
  sekarang?: () => number;
};

function bacaEnv(nama: string): string {
  return (process.env[nama] ?? "").trim();
}

export function kredensialDariEnv(): Kredensial {
  const appKey = bacaEnv("TIKTOK_APP_KEY");
  const appSecret = bacaEnv("TIKTOK_APP_SECRET");
  const kurang: string[] = [];
  if (!appKey) kurang.push("TIKTOK_APP_KEY");
  if (!appSecret) kurang.push("TIKTOK_APP_SECRET");
  if (kurang.length > 0) throw new GalatKonfigurasiTiktok(kurang);
  return { appKey, appSecret };
}

async function kirim<T>(
  url: URL,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<{ data: T; requestId: string | null; http: number }> {
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, cache: "no-store" });
  } catch (err) {
    /* Pesan fetch tidak memuat URL — aman diteruskan. */
    throw new GalatTiktok("jaringan", (err as Error).message, null, null);
  }

  const teks = await res.text();
  let amplop: Amplop<T>;
  try {
    amplop = JSON.parse(teks) as Amplop<T>;
  } catch {
    throw new GalatTiktok("bukan_json", teks.slice(0, 160), null, res.status);
  }

  const requestId = amplop.request_id ?? null;
  /* code yang hilang dianggap galat, bukan sukses: amplop tanpa code
     hampir pasti bukan jawaban API yang kita kira. */
  if (amplop.code !== 0) {
    const kode = typeof amplop.code === "number" ? String(amplop.code) : `http_${res.status}`;
    throw new GalatTiktok(kode, amplop.message ?? "", requestId, res.status);
  }
  if (!res.ok) {
    throw new GalatTiktok(`http_${res.status}`, amplop.message ?? "", requestId, res.status);
  }
  return { data: (amplop.data ?? {}) as T, requestId, http: res.status };
}

export type PermintaanToko = {
  /** Mis. "/customer_service/202309/conversations". */
  path: string;
  method?: "GET" | "POST";
  accessToken: string;
  /** Wajib untuk hampir semua API toko; kosongkan untuk /authorization/202309/shops. */
  shopCipher?: string;
  query?: Record<string, string | number | boolean>;
  body?: unknown;
};

/** Panggil Open API toko. Mengembalikan `data` dari amplop. */
export async function permintaanTiktok<T>(
  p: PermintaanToko,
  pengait: Pengait = {},
): Promise<{ data: T; requestId: string | null; http: number }> {
  const kred = pengait.kredensial ?? kredensialDariEnv();
  const fetchImpl = pengait.fetchImpl ?? fetch;

  const khas: Record<string, string | number> = {};
  if (p.shopCipher) khas.shop_cipher = p.shopCipher;
  for (const [k, v] of Object.entries(p.query ?? {})) khas[k] = typeof v === "boolean" ? String(v) : v;

  /* Badan diserialisasi SEKALI dan string yang sama dipakai untuk sign
     maupun dikirim — dua JSON.stringify bisa saja berbeda urutan. */
  const badan = p.body !== undefined ? JSON.stringify(p.body) : undefined;
  const query = queryBertanda(kred, p.path, khas, badan, pengait.sekarang?.());

  return kirim<T>(
    susunUrl(HOST_API, p.path, query),
    {
      method: p.method ?? "GET",
      headers: {
        "content-type": "application/json",
        "x-tts-access-token": p.accessToken,
      },
      body: badan,
    },
    fetchImpl,
  );
}

/**
 * token/get atau token/refresh di server otorisasi.
 * Tidak bertanda tangan; app_key & app_secret ditambahkan sendiri.
 */
export async function mintaToken<T>(
  path: "/api/v2/token/get" | "/api/v2/token/refresh",
  param: Record<string, string>,
  pengait: Pengait = {},
): Promise<{ data: T; requestId: string | null; http: number }> {
  const kred = pengait.kredensial ?? kredensialDariEnv();
  const query = { app_key: kred.appKey, app_secret: kred.appSecret, ...param };
  return kirim<T>(susunUrl(HOST_AUTH, path, query), { method: "GET" }, pengait.fetchImpl ?? fetch);
}
