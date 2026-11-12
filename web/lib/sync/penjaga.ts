import "server-only";

/* ===========================================================
   Penjaga rute /api/sync/* — siapa yang boleh memicu sinkronisasi.

   Dua pintu, dan keduanya sah:

     cron    header "Authorization: Bearer <CRON_SECRET>". Dibandingkan
             dengan timingSafeEqual supaya panjang dan isi rahasianya
             tidak bisa ditebak dari perbedaan waktu jawaban.
     admin   sesi login yang profilnya berperan admin — untuk tombol
             "Sinkronkan" di Pengaturan. Diperiksa lewat
             tabel profiles, bukan dari klaim di JWT.

   CRON_SECRET yang kosong TIDAK membuat pintu cron terbuka; ia
   menutupnya. Rahasia kosong yang "cocok" dengan header kosong
   adalah bug klasik yang sengaja dicegah di sini.
   =========================================================== */

import { timingSafeEqual } from "node:crypto";
import { isSupabaseConfigured } from "../supabase/client.ts";
import { getSupabaseSebagai, tokenDariHeader } from "../supabase/server.ts";

export type Pemicu = { lewat: "cron" } | { lewat: "admin"; userId: string };

function samaAman(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * @returns siapa pemicunya, atau null bila tidak berhak.
 */
export async function periksaPemicu(req: Request): Promise<Pemicu | null> {
  const token = tokenDariHeader(req);
  if (!token) return null;

  const rahasia = (process.env.CRON_SECRET ?? "").trim();
  if (rahasia && samaAman(token, rahasia)) return { lewat: "cron" };

  /* Bukan rahasia cron — mungkin token sesi Supabase milik admin. */
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabaseSebagai(token);
  if (!sb) return null;
  const { data: sesi, error } = await sb.auth.getUser();
  if (error || !sesi.user) return null;

  const { data: profil } = await sb
    .from("profiles")
    .select("role")
    .eq("id", sesi.user.id)
    .maybeSingle();
  if (profil?.role !== "admin") return null;

  return { lewat: "admin", userId: sesi.user.id };
}
