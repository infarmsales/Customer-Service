"use client";

/* ===========================================================
   Formulir masuk (Step 7).

   Dua wajah, ditentukan sendiri oleh keadaan:
     - Supabase belum dikonfigurasi -> tidak ada formulir, hanya
       tombol "Buka Console" seperti sebelumnya. Demo tetap jalan.
     - Sudah dikonfigurasi          -> email + kata sandi.

   Login hardcode dari index.html lama sengaja tidak dipindahkan
   ke sini dalam bentuk apa pun.
   =========================================================== */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { pesanKeluar } from "@/lib/sesi";

export default function LoginForm() {
  const { status, isDemo, signIn, sebabKeluar } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [sandi, setSandi] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [kirim, setKirim] = useState(false);

  /* Sudah punya sesi (mis. membuka /  setelah login) -> langsung masuk. */
  useEffect(() => {
    if (!isDemo && status === "in") router.replace("/beranda");
  }, [isDemo, status, router]);

  if (isDemo) {
    return (
      <>
        <p className="mt-0 mb-8 max-w-xl leading-relaxed text-text-2">
          Console berjalan dalam <b>mode demo</b> — datanya contoh dan hidup di
          memori peramban. Untuk menyalakan login dan database sungguhan, isi{" "}
          <code className="rounded bg-green-soft px-1.5 py-0.5 text-[0.9em]">
            NEXT_PUBLIC_SUPABASE_URL
          </code>{" "}
          dan{" "}
          <code className="rounded bg-green-soft px-1.5 py-0.5 text-[0.9em]">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>{" "}
          di <code className="text-[0.9em]">web/.env.local</code>, lalu jalankan
          ulang server. Panduannya ada di{" "}
          <code className="text-[0.9em]">supabase/README.md</code>.
        </p>
        <Link
          href="/beranda"
          className="inline-block rounded-2xl bg-green px-6 py-4 font-bold text-white no-underline transition hover:bg-green-hover"
        >
          Buka Console →
        </Link>
      </>
    );
  }

  const masuk = async (e: React.FormEvent) => {
    e.preventDefault();
    setGalat(null);
    setKirim(true);
    const pesan = await signIn(email.trim(), sandi);
    setKirim(false);
    if (pesan) setGalat(pesan);
    else router.replace("/beranda");
  };

  return (
    <form onSubmit={masuk} className="max-w-md">
      <p className="mt-0 mb-7 leading-relaxed text-text-2">
        Masuk memakai akun yang dibuatkan admin di Supabase.
      </p>

      <label className="mb-1.5 block font-semibold text-text-2" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="nama@infarm.co.id"
        className="mb-5 w-full rounded-xl border border-line bg-green-soft px-3.5 py-3 outline-none focus:bg-white"
      />

      <label className="mb-1.5 block font-semibold text-text-2" htmlFor="sandi">
        Kata sandi
      </label>
      <input
        id="sandi"
        type="password"
        required
        autoComplete="current-password"
        value={sandi}
        onChange={(e) => setSandi(e.target.value)}
        className="mb-5 w-full rounded-xl border border-line bg-green-soft px-3.5 py-3 outline-none focus:bg-white"
      />

      {galat && (
        <p
          role="alert"
          className="mt-0 mb-5 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3.5 py-2.5 text-[0.88rem] text-[#b91c1c]"
        >
          {galat}
        </p>
      )}

      {/* Sesi yang diakhiri pengaman SEC-018. Warnanya sengaja bukan
          merah: ini bukan kesalahan pengguna dan bukan kegagalan
          sistem, melainkan pengaman yang bekerja. Tanpa kalimat ini,
          layar login yang muncul tiba-tiba akan dilaporkan sebagai
          "console-nya rusak". */}
      {!galat && sebabKeluar && (
        <p
          role="status"
          className="mt-0 mb-5 rounded-xl border border-line bg-green-soft px-3.5 py-2.5 text-[0.88rem] text-secondary"
        >
          {pesanKeluar(sebabKeluar)}
        </p>
      )}

      <button
        type="submit"
        disabled={kirim || status === "loading"}
        className="w-full cursor-pointer rounded-2xl border-none bg-green px-6 py-4 font-bold text-white transition hover:bg-green-hover disabled:cursor-wait disabled:opacity-60"
      >
        {kirim ? "Memeriksa…" : "Masuk"}
      </button>

      <p className="mt-6 mb-0 text-[0.82rem] leading-relaxed text-muted">
        Lupa kata sandi atau belum punya akun? Hubungi admin — akun CS dibuat
        lewat Supabase → Authentication → Users.
      </p>
    </form>
  );
}
