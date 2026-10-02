"use client";

/* ===========================================================
   Autentikasi (Step 7) — Supabase Auth, dengan jalan mundur
   otomatis ke mode demo.

   TIGA KEADAAN yang mungkin, dan semuanya harus jalan:

     1. Kredensial belum diisi  -> mode demo. Pengguna aktif
        dipaku ke DEMO_USER, tidak ada layar login. Persis
        seperti sebelum Step 7, supaya demo tidak rusak.
     2. Sudah diisi, belum login -> status "out". Console
        mengalihkan ke halaman depan.
     3. Sudah login              -> status "in" + profil dari
        tabel public.profiles (nama tampilan & peran).

   YANG PERLU DIPAHAMI SOAL KEAMANAN:
   Pengalihan halaman di sini adalah kenyamanan, BUKAN pengaman.
   Yang benar-benar menjaga data adalah RLS di Supabase — setiap
   kebijakan berbunyi `to authenticated`, jadi tanpa sesi yang sah
   query balik kosong walaupun seseorang memaksa membuka /beranda.
   Jangan pernah menaruh rahasia di komponen klien dengan alasan
   "halamannya kan sudah dijaga login".
   =========================================================== */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { DEMO_USER } from "@/lib/db";
import type { ProfileRow } from "@/lib/db";
import { diamTerlaluLama, sesiKedaluwarsa, type SebabKeluar } from "@/lib/sesi";

export type AuthStatus = "loading" | "in" | "out";

type AuthValue = {
  status: AuthStatus;
  /** Profil dari public.profiles; DEMO_USER selama mode demo. */
  profile: ProfileRow | null;
  /** true bila peran 'admin' — dipakai UI untuk menyembunyikan aksi. */
  isAdmin: boolean;
  /** true bila berjalan tanpa Supabase. */
  isDemo: boolean;
  /**
   * Terisi bila sesinya sah TETAPI profilnya tidak terbaca.
   *
   * Bukan sekadar catatan teknis: tanpa baris di public.profiles,
   * is_admin() bernilai false, sehingga setiap penyimpanan
   * Pengaturan dan setiap keputusan Flag Koreksi ditolak RLS —
   * diam-diam, sebagai "sukses, nol baris". Karena itu pesannya
   * ditampilkan di TopBar, bukan hanya dicatat di console.
   */
  profileError: string | null;
  /**
   * Identitas dari sesi Supabase Auth — BUKAN dari tabel profiles.
   *
   * Dipisah justru supaya keduanya bisa dibandingkan: id di sini
   * berasal dari JWT, id di profile berasal dari database. Kalau
   * sesinya sah tetapi profilnya kosong, id inilah yang perlu
   * dicari di tabel profiles.
   */
  authUser: { id: string; email: string | null } | null;
  /**
   * Terisi bila sesi diakhiri sendiri oleh pengaman SEC-018, bukan
   * oleh tombol keluar. Dibaca halaman login supaya layar yang
   * tiba-tiba kembali ke login tidak disangka console rusak —
   * keluhan yang paling mahal, karena pengaman yang bekerja
   * terlihat persis seperti kegagalan.
   */
  sebabKeluar: SebabKeluar | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const isDemo = !isSupabaseConfigured();

  const [status, setStatus] = useState<AuthStatus>(isDemo ? "in" : "loading");
  const [profile, setProfile] = useState<ProfileRow | null>(
    isDemo ? DEMO_USER : null,
  );
  const [profileError, setProfileError] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthValue["authUser"]>(null);
  const [sebabKeluar, setSebabKeluar] = useState<SebabKeluar | null>(null);

  /* Sentuhan terakhir di console. Ref, bukan state: nilainya berubah
     pada setiap klik dan setiap ketikan, dan menjadikannya state
     berarti merender ulang seluruh pohon komponen pada setiap huruf
     yang diketik CS. */
  /* null = belum pernah diisi. Sengaja BUKAN Date.now() di sini:
     memanggilnya saat render membuat nilainya bergantung pada kapan
     React kebetulan merender, dan eslint react-hooks/purity menolak
     itu. Sengaja juga bukan 0, karena 0 akan terbaca sebagai "diam
     sejak 1970" dan mengeluarkan orang seketika. */
  const terakhirAktif = useRef<number | null>(null);

  /**
   * Akhiri sesi karena pengaman, bukan karena tombol keluar.
   *
   * Dideklarasikan SEBELUM useEffect di bawah dengan sengaja: effect
   * itu menyebutnya di daftar dependensinya, dan daftar itu dibaca
   * saat render — bukan saat effect berjalan.
   */
  const paksaKeluar = useCallback(async (sebab: SebabKeluar) => {
    setSebabKeluar(sebab);
    await getSupabase()?.auth.signOut();
  }, []);

  useEffect(() => {
    if (isDemo) return;
    const sb = getSupabase();
    if (!sb) return;

    let batal = false;

    /* Ambil profil dari tabel, bukan dari metadata auth.users:
       peran ('cs' | 'admin') hanya ada di public.profiles dan
       itulah yang dipakai aturan RLS is_admin(). */
    const muatProfil = async (userId: string) => {
      /* maybeSingle(), bukan single(): single() memperlakukan "tidak
         ada baris" sebagai galat, dengan pesan PostgREST yang
         menyamarkan dua sebab yang sangat berbeda — barisnya memang
         belum ada, atau pembacaannya ditolak. Penanganannya berbeda,
         jadi dipisah di sini. */
      const { data, error } = await sb
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (batal) return;

      if (error) {
        const pesan = "Profil tidak terbaca: " + error.message;
        console.error("[auth]", pesan);
        setProfile(null);
        setProfileError(pesan);
      } else if (!data) {
        /* Sesi sah, tetapi tidak ada barisnya di public.profiles.
           Paling sering karena pengguna dibuat sebelum trigger
           handle_new_user terpasang, jadi triggernya tidak pernah
           jalan untuk akun ini. */
        const pesan =
          "Pembacaan berhasil tetapi tidak mengembalikan satu baris pun. " +
          "Dua sebab yang mungkin: barisnya memang belum ada untuk user " +
          "id di bawah, atau tabel profiles menyalakan RLS tanpa " +
          "kebijakan SELECT — tabel seperti itu mengembalikan nol baris " +
          "kepada siapa pun, tanpa galat.";
        console.error("[auth]", pesan, "user id:", userId);
        setProfile(null);
        setProfileError(pesan);
      } else {
        setProfile(data as ProfileRow);
        setProfileError(null);
      }
      setStatus("in");
    };

    /* SEC-018 — satu-satunya pintu masuk ke status "in".
       Ditaruh di sini, bukan hanya di getSession(), karena sesi juga
       bisa tiba lewat TOKEN_REFRESHED: tab yang dibiarkan terbuka
       semalaman menyegarkan tokennya sendiri berkali-kali, dan tanpa
       pemeriksaan di jalur itu umur sesi tidak pernah ditagih. */
    const terimaSesi = (session: {
      user: { id: string; email?: string | null; last_sign_in_at?: string };
    }) => {
      const masukTerakhir = session.user.last_sign_in_at;
      if (!masukTerakhir) {
        console.warn(
          "[auth] last_sign_in_at kosong — umur sesi tidak bisa dihitung, " +
            "sesi dibiarkan hidup. Lihat lib/sesi.ts.",
        );
      }
      if (sesiKedaluwarsa(masukTerakhir, new Date())) {
        void paksaKeluar("umur");
        return;
      }
      terakhirAktif.current = Date.now();
      setAuthUser({ id: session.user.id, email: session.user.email ?? null });
      void muatProfil(session.user.id);
    };

    sb.auth.getSession().then(({ data }) => {
      if (batal) return;
      if (data.session) terimaSesi(data.session);
      else setStatus("out");
    });

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      if (batal) return;
      if (session) {
        setSebabKeluar(null);
        terimaSesi(session);
      } else {
        setProfile(null);
        setProfileError(null);
        setAuthUser(null);
        setStatus("out");
      }
    });

    return () => {
      batal = true;
      sub.subscription.unsubscribe();
    };
  }, [isDemo, paksaKeluar]);

  /* -----------------------------------------------------------
     SEC-018 lapis kedua — console yang ditinggal menyala.

     Lapis pertama (umur sesi) tidak menangkap keadaan ini: tab
     masih terbuka, tokennya masih disegarkan, dan 12 jam belum
     tentu lewat. Yang menandainya hanya tidak adanya sentuhan.

     Jalan hanya saat benar-benar sudah masuk, supaya tidak ada
     pendengar peristiwa yang menggantung di halaman login.
     ----------------------------------------------------------- */
  useEffect(() => {
    if (isDemo || status !== "in") return;

    const tandai = () => {
      terakhirAktif.current = Date.now();
    };

    /* Sesi yang sudah ada sebelum effect ini terpasang (mis. setelah
       hot reload) belum punya penanda. Diisi sekarang, supaya
       denyut pertama tidak membaca null dan mengira belum ada
       sentuhan sama sekali. */
    if (terakhirAktif.current === null) tandai();

    const diamSekarang = () =>
      terakhirAktif.current !== null &&
      diamTerlaluLama(terakhirAktif.current, Date.now());

    /* pointerdown & keydown, BUKAN mousemove: kursor yang tersenggol
       meja atau digeser kucing bukan tanda ada orang yang bekerja,
       dan mousemove akan membuat penghitung ini praktis tidak pernah
       berbunyi. */
    const peristiwa = ["pointerdown", "keydown", "wheel"] as const;
    for (const p of peristiwa) window.addEventListener(p, tandai, { passive: true });

    /* Diperiksa tiap menit, bukan lewat setTimeout sekali pasang.
       Laptop yang ditutup menghentikan timer di banyak peramban,
       jadi timer tunggal bisa terbangun jauh terlambat; perbandingan
       jam dinding pada setiap denyut tidak bisa tertipu begitu. */
    const denyut = window.setInterval(() => {
      if (diamSekarang()) void paksaKeluar("diam");
    }, 60_000);

    /* Kembali ke tab sesudah laptop tidur: periksa segera, jangan
       tunggu denyut berikutnya. */
    const saatTerlihat = () => {
      if (document.visibilityState !== "visible") return;
      if (diamSekarang()) void paksaKeluar("diam");
    };
    document.addEventListener("visibilitychange", saatTerlihat);

    return () => {
      for (const p of peristiwa) window.removeEventListener(p, tandai);
      document.removeEventListener("visibilitychange", saatTerlihat);
      window.clearInterval(denyut);
    };
  }, [isDemo, status, paksaKeluar]);

  /** @returns pesan galat untuk ditampilkan, atau null bila berhasil. */
  const signIn = useCallback(async (email: string, password: string) => {
    const sb = getSupabase();
    if (!sb) return "Supabase belum dikonfigurasi.";
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (!error) return null;
    // Pesan bawaan Supabase berbahasa Inggris dan cukup teknis.
    if (error.message.includes("Invalid login credentials")) {
      return "Email atau kata sandi salah.";
    }
    if (error.message.includes("Email not confirmed")) {
      return "Email belum dikonfirmasi. Minta admin mencentang Auto Confirm.";
    }
    return error.message;
  }, []);

  const signOut = useCallback(async () => {
    await getSupabase()?.auth.signOut();
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      profile,
      isAdmin: profile?.role === "admin",
      isDemo,
      profileError,
      authUser,
      sebabKeluar,
      signIn,
      signOut,
    }),
    [
      status,
      profile,
      profileError,
      authUser,
      isDemo,
      sebabKeluar,
      signIn,
      signOut,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth harus dipakai di dalam <AuthProvider>");
  return v;
}
