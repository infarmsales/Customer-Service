"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { actionTagClass } from "./actionTag";
import CostMeter, {
  EMPTY_SESSION,
  type LastResult,
  type SessionTotals,
} from "./CostMeter";
import { computeCost, type Usage } from "@/lib/pricing";
import { BATAS_BALASAN, ukurBalasan } from "@/lib/limits";
import FlagKoreksi from "./FlagKoreksi";
import UjiGemini from "./UjiGemini";
import { usePendingFlagCount } from "@/lib/db";

/* ===========================================================
   Halaman AI Chatbot — port sub-tab "Coba Balasan AI" di ai.html,
   ditambah dua hal yang tidak ada di versi lama:
   1. Pengukur token & biaya per balasan.
   2. Saklar lapisan template, supaya biaya dengan dan tanpa
      lapisan itu bisa dibandingkan langsung dalam satu demo.

   Beda penting dari ai.js lama: TIDAK ADA mockClassify. Versi lama
   diam-diam mengarang balasan contoh saat backend mati, lengkap
   dengan label ACTION. Untuk demo yang tujuannya mengukur token,
   jawaban palsu berbiaya nol bisa terbaca seolah hasil Claude.
   =========================================================== */

/** Dua kelompok contoh: yang dicegat template, dan yang perlu AI. */
const SAMPLES: { pesan: string; catatan: string }[] = [
  { pesan: "Halo kak", catatan: "template" },
  { pesan: "Cara pakai POC gimana ya kak?", catatan: "template" },
  { pesan: "Harga produk ini berapa ya?", catatan: "template" },
  { pesan: "Paket saya rusak pas sampai", catatan: "template" },
  { pesan: "Daun cabai saya menguning kenapa ya?", catatan: "perlu AI" },
  { pesan: "POC Buah cocok nggak buat anggrek?", catatan: "perlu AI" },
  { pesan: "Paket saya sudah 7 hari belum sampai, saya mau refund", catatan: "perlu AI" },
];

const STATS = [
  { ico: "📈", pct: "15%", label: "Tingkatkan Tingkat Konversi Pesanan" },
  { ico: "💬", pct: "75%", label: "Tingkat Resolusi Konsultasi Pra Jual & Purna Jual" },
  { ico: "🧑‍🌾", pct: "30%", label: "Menghemat Tenaga Kerja CS" },
];

type Health = {
  ok: boolean;
  model: string;
  claudeConfigured: boolean;
  systemPromptChars: number;
  kbFiles: Record<string, number>;
  missingKbFiles: string[];
  templates?: { rules: number; templates: number };
  aiTerkunci?: boolean;
};

type ChatResponse = {
  action: string;
  reply: string;
  model: string | null;
  usage: Usage | null;
  source?: "ai" | "template" | "satpam" | "pengenal" | "tanpa-claude";
  kategori?: string;
  templateCode?: string;
  panjang?: { panjang: number; lewat: boolean; mepet: boolean; sisa: number };
  templateWhy?: string;
  /** Gerbang 2. Ada walau balasannya berakhir di Claude: embedding
      pertanyaan tetap ditagih Voyage meski tidak menemukan kecocokan. */
  voyage?: { token: number; usd: number };
  skor?: number;
  /* Hanya terisi saat source === "tanpa-claude": isi permintaan yang
     tidak jadi dikirim ke Sonnet. */
  berkas?: string[];
  faqKarakter?: number;
  /* Keputusan Gerbang 2. Ada pada setiap jawaban yang melewatinya,
     termasuk yang berakhir di Claude — itulah justru kasus yang
     paling perlu dibedakan. */
  pengenal?: {
    jenis: "yakin" | "ragu" | "lewat";
    kandidat?: { code: string; contoh: string; skor: number }[];
    alasan?: string;
    ambang: { yakin: number; ragu: number; margin: number };
    margin?: number | null;
    pesaing?: string | null;
    mode: string;
    dipakai: boolean;
  } | null;
};

/* ===========================================================
   Panel Gerbang 2.

   Menjawab satu pertanyaan yang sebelumnya hanya bisa dijawab
   dengan membaca log dev server: pertanyaan ini dibantu Voyage
   atau tidak?

   Tiga keadaan sengaja dibedakan tegas, karena tindak lanjutnya
   berlawanan:
     yakin + bayangan -> Voyage SUDAH benar, ambangnya yang menahan
     ragu             -> kandidatnya ada tapi kurang yakin
     lewat            -> Voyage tidak menemukan apa pun
   Yang pertama berarti ambang boleh diturunkan; yang ketiga berarti
   contoh pertanyaannya yang kurang. Menyamakan keduanya membuat
   penyetelan berjalan ke arah yang salah.
   =========================================================== */
function PanelPengenal({ p }: { p: NonNullable<ChatResponse["pengenal"]> }) {
  const nada =
    p.jenis === "lewat"
      ? { bg: "bg-[#f1f5f9]", garis: "border-line", teks: "text-muted" }
      : p.dipakai
        ? { bg: "bg-green-mint", garis: "border-green", teks: "text-green-dark" }
        : { bg: "bg-[#fdf3d8]", garis: "border-[#f0c36d]", teks: "text-[#8a5a00]" };

  const judul =
    p.jenis === "lewat"
      ? "🧭 Gerbang 2 — tidak menemukan kecocokan"
      : p.dipakai
        ? "🧭 Gerbang 2 — balasan ini dari Voyage"
        : p.jenis === "yakin"
          ? "🧭 Gerbang 2 — cocok, TETAPI ditahan mode bayangan"
          : "🧭 Gerbang 2 — zona ragu, diteruskan";

  return (
    <div className={`mt-3 rounded-xl border ${nada.garis} ${nada.bg} p-3`}>
      <div className={`mb-1 text-[0.82rem] font-bold ${nada.teks}`}>{judul}</div>

      {p.jenis === "lewat" ? (
        <p className="m-0 text-[0.84rem] text-text-2">{p.alasan}</p>
      ) : (
        <>
          <ul className="m-0 list-none space-y-0.5 p-0 text-[0.84rem]">
            {(p.kandidat ?? []).map((k, i) => (
              <li key={k.code + i} className="flex items-baseline gap-2">
                <span
                  className={`font-mono tabular-nums ${
                    k.skor >= p.ambang.yakin ? "font-bold text-green-dark" : "text-muted"
                  }`}
                >
                  {k.skor.toFixed(3)}
                </span>
                <b>[{k.code}]</b>
                <span className="min-w-0 truncate text-muted">
                  mirip &ldquo;{k.contoh}&rdquo;
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 mb-0 text-[0.78rem] text-muted">
            Syarat: skor ≥ {p.ambang.yakin} DAN margin ≥ {p.ambang.margin}
            {typeof p.margin === "number" && (
              <>
                {" "}— margin sekarang {p.margin.toFixed(3)}
                {p.pesaing && <> terhadap [{p.pesaing}]</>}
              </>
            )}
            {/* margin null = tidak ada template LAIN di sepuluh tetangga
                terdekat. Ditulis apa adanya, bukan sebagai angka besar:
                sebelum 9 Sep 2026 keadaan ini ditampilkan sebagai
                "margin 0.811" — meyakinkan, dan tidak berarti apa-apa. */}
            {p.margin === null && (
              <> — tidak ada template lain di 10 tetangga terdekat</>
            )}{" "}
            · mode {p.mode}
            {!p.dipakai && p.jenis === "yakin" && (
              <>
                {" "}
                — set <code>PENGENAL_MODE=aktif</code> agar balasan ini benar-benar
                dikirim
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}

export default function AiChatbot() {
  const toast = useToast();

  const [tab, setTab] = useState<"chatbot" | "flag">("chatbot");
  const flagMenunggu = usePendingFlagCount();
  const [health, setHealth] = useState<Health | null>(null);
  const [healthFailed, setHealthFailed] = useState(false);

  const [aiOn, setAiOn] = useState(true);
  const [useTemplates, setUseTemplates] = useState(true);
  /* Bawaannya HIDUP supaya perilaku halaman ini tidak berubah diam-diam
     bagi yang tidak tahu saklarnya ada. Yang ingin menguji tanpa biaya
     mematikannya secara sadar. */
  const [useClaude, setUseClaude] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const [result, setResult] = useState<ChatResponse | null>(null);
  const [last, setLast] = useState<LastResult>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionTotals>(EMPTY_SESSION);

  // ---------- Status backend (port checkBackend di ai.js) ----------
  useEffect(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("health"))))
      .then((d: Health) => setHealth(d))
      .catch(() => setHealthFailed(true));
  }, []);

  // ---------- Minta balasan ----------
  const askAI = useCallback(async () => {
    const msg = message.trim();
    if (!msg) {
      toast("Tulis pesan pelanggan dulu, Kak");
      return;
    }
    if (!aiOn) {
      toast("Aktifkan dulu Rekomendasi Balasan AI");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // history sengaja kosong: tiap pengujian berdiri sendiri supaya
        // angka token bisa dibandingkan antar percobaan.
        body: JSON.stringify({ message: msg, history: [], useTemplates, useClaude }),
      });
      const data = await r.json();

      if (!r.ok) {
        setResult(null);
        setLast(null);
        setError(data?.error ?? `Permintaan gagal (HTTP ${r.status}).`);
        toast("Gagal meminta balasan");
        return;
      }

      const ok = data as ChatResponse;
      setResult(ok);

      if (ok.source === "tanpa-claude") {
        setLast({
          source: "tanpa-claude",
          kategori: ok.kategori ?? "?",
          berkas: ok.berkas ?? [],
          faqKarakter: ok.faqKarakter ?? 0,
        });
        setSession((s) => ({
          ...s,
          messages: s.messages + 1,
          voyageToken: s.voyageToken + (ok.voyage?.token ?? 0),
          voyageUsd: s.voyageUsd + (ok.voyage?.usd ?? 0),
          voyageCalls: s.voyageCalls + (ok.voyage?.token ? 1 : 0),
        }));
        toast("Dilempar ke Claude — panggilan dibatalkan, saldo aman");
      } else if (ok.source === "template") {
        setLast({ source: "template", code: ok.templateCode ?? "?" });
        setSession((s) => ({
          ...s,
          messages: s.messages + 1,
          templateMessages: s.templateMessages + 1,
          voyageToken: s.voyageToken + (ok.voyage?.token ?? 0),
          voyageUsd: s.voyageUsd + (ok.voyage?.usd ?? 0),
          voyageCalls: s.voyageCalls + (ok.voyage?.token ? 1 : 0),
        }));
        toast(`Dijawab template [${ok.templateCode}] — Rp 0 ⚡`);
      } else {
        const cost = computeCost(ok.model ?? "", ok.usage ?? {});
        setLast({ source: "ai", cost, model: ok.model ?? "?" });
        setSession((s) => ({
          messages: s.messages + 1,
          aiMessages: s.aiMessages + 1,
          templateMessages: s.templateMessages,
          usd: s.usd + cost.usd,
          usdWithoutCache: s.usdWithoutCache + cost.usdWithoutCache,
          voyageToken: s.voyageToken + (ok.voyage?.token ?? 0),
          voyageUsd: s.voyageUsd + (ok.voyage?.usd ?? 0),
          voyageCalls: s.voyageCalls + (ok.voyage?.token ? 1 : 0),
        }));
        toast("Balasan dari Claude siap ✨");
      }
    } catch (e) {
      setResult(null);
      setLast(null);
      setError("Tidak bisa menghubungi /api/chat: " + (e as Error).message);
      toast("Gagal menghubungi server");
    } finally {
      setBusy(false);
    }
  }, [aiOn, message, toast, useTemplates, useClaude]);

  // ---------- Status ringkas di kanan atas ----------
  let statusText = "memeriksa…";
  let statusClass = "text-muted";
  if (healthFailed) {
    statusText = "server tidak merespons";
    statusClass = "text-[#b91c1c]";
  } else if (health) {
    if (health.aiTerkunci) {
      // Saklar pengaman saldo. Ditampilkan lebih dulu daripada status
      // API key: kalau terkunci, konfigurasi kuncinya tidak relevan.
      statusText = "AI dikunci 🔒";
      statusClass = "text-[#b91c1c]";
    } else if (health.claudeConfigured) {
      statusText = "Claude aktif ✅";
      statusClass = "text-green-dark";
    } else {
      statusText = "API key belum diset ⚠️";
      statusClass = "text-[#d97706]";
    }
  }

  return (
    <div className="p-5 max-mini:p-3">
      {/* ---------- Sub-tab ---------- */}
      <div className="mb-4 flex items-center gap-2 border-b border-line">
        {(
          [
            ["chatbot", "AI Chatbot"],
            ["flag", "Flag Koreksi"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={[
              "-mb-px cursor-pointer border-0 border-b-2 bg-transparent px-4 py-2.5 font-semibold",
              tab === key
                ? "border-green text-green-dark"
                : "border-transparent text-muted",
            ].join(" ")}
          >
            {label}
            {/* Badge hanya di sub-tab Flag, dan hanya bila ada yang
                menunggu — angka 0 yang selalu tampil akan diabaikan
                orang, sama seperti pita peringatan yang tidak pernah
                berubah. */}
            {key === "flag" && flagMenunggu > 0 && (
              <span className="ml-1.5 rounded-lg bg-[#ef4444] px-1.5 py-px text-[0.62rem] font-bold text-white align-middle">
                {flagMenunggu}
              </span>
            )}
          </button>
        ))}
        <span className={`ml-auto pr-1 text-xs font-semibold ${statusClass}`}>
          {statusText}
        </span>
      </div>

      {tab === "flag" ? (
        <FlagKoreksi />
      ) : (
        <>
          {/* ---------- Kartu statistik ---------- */}
          <div className="mb-4 grid grid-cols-3 gap-3 max-tablet:grid-cols-1">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-line bg-white px-4.5 py-5 text-center"
              >
                <div className="text-2xl">{s.ico}</div>
                <div className="my-1 text-2xl font-extrabold text-green">{s.pct}</div>
                <div className="text-[0.86rem] text-text-2">{s.label}</div>
              </div>
            ))}
          </div>

          {/* ---------- Judul ---------- */}
          <div className="mb-4 rounded-2xl bg-green-soft px-6 py-5">
            <h1 className="m-0 text-2xl font-bold">Layanan Pelanggan AI Cerdas</h1>
            <p className="mt-2 mb-0 text-text-2">
              Ditenagai <b>Claude</b> dengan system prompt <b>claude.md</b> —
              menjawab akurat, jujur, dan tahu kapan harus dialihkan ke CS
              manusia.
            </p>
            {health && (
              <p className="mt-3 mb-0 text-[0.86rem] text-muted">
                Knowledge base: {Object.keys(health.kbFiles).length} berkas ·{" "}
                <span className="font-mono">
                  {health.systemPromptChars.toLocaleString("id-ID")}
                </span>{" "}
                karakter system prompt
                {health.templates && (
                  <>
                    {" "}
                    · lapisan template: {health.templates.templates} balasan baku,{" "}
                    {health.templates.rules} aturan pencocokan
                  </>
                )}
                {health.missingKbFiles.length > 0 && (
                  <span className="text-[#b91c1c]">
                    {" "}
                    · gagal dibaca: {health.missingKbFiles.join(", ")}
                  </span>
                )}
              </p>
            )}
          </div>

          {/* ---------- Coba Balasan AI + pengukur ---------- */}
          <div className="grid grid-cols-[1.4fr_1fr] gap-4 max-tablet:grid-cols-1">
            <section className="rounded-2xl border border-line bg-white p-5">
              <div className="mb-3">
                <h2 className="m-0 text-lg font-bold">🤖 Coba Balasan AI</h2>
                <p className="mt-1 mb-0 text-[0.9rem] text-muted">
                  Ketik pesan pelanggan → dicocokkan dulu ke template baku;
                  kalau tidak tertangani, baru diteruskan ke Claude.
                </p>
              </div>

              <div className="mb-3 flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-[0.9rem] font-semibold text-text-2">
                  <input
                    type="checkbox"
                    checked={aiOn}
                    onChange={(e) => {
                      setAiOn(e.target.checked);
                      toast(
                        e.target.checked
                          ? "Rekomendasi Balasan AI aktif"
                          : "Rekomendasi Balasan AI dimatikan",
                      );
                    }}
                  />
                  Rekomendasi Balasan AI
                </label>

                <label className="flex items-center gap-2 text-[0.9rem] font-semibold text-text-2">
                  <input
                    type="checkbox"
                    checked={useTemplates}
                    onChange={(e) => {
                      setUseTemplates(e.target.checked);
                      toast(
                        e.target.checked
                          ? "Lapisan template aktif — pertanyaan baku tidak dikirim ke Claude"
                          : "Lapisan template dimatikan — semua pertanyaan dikirim ke Claude",
                      );
                    }}
                  />
                  Lapisan template
                  <span className="text-xs font-normal text-muted">
                    (matikan untuk membandingkan biaya)
                  </span>
                </label>

                {/* Saklar ini kebalikan dari "Lapisan template": yang itu
                    membuat lebih banyak pesan sampai ke Claude, yang ini
                    memastikan tidak ada satu pun yang sampai. */}
                <label className="flex items-center gap-2 text-[0.9rem] font-semibold text-text-2">
                  <input
                    type="checkbox"
                    checked={useClaude}
                    onChange={(e) => {
                      setUseClaude(e.target.checked);
                      toast(
                        e.target.checked
                          ? "Claude aktif — pertanyaan tak tertangkap gerbang akan dibayar"
                          : "Claude dimatikan — saldo tidak akan terpotong",
                      );
                    }}
                  />
                  Panggil Claude
                  <span className="text-xs font-normal text-muted">
                    {useClaude ? "(berbayar)" : "(saldo aman)"}
                  </span>
                </label>
              </div>

              <textarea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") askAI();
                }}
                placeholder="Contoh: Dosis POC Buah buat tomat berapa ya kak?"
                className="w-full resize-y rounded-xl border border-line bg-green-soft p-3 outline-none focus:border-green"
              />

              <div className="my-2.5 flex flex-wrap gap-2">
                {SAMPLES.map((s) => (
                  <button
                    key={s.pesan}
                    type="button"
                    onClick={() => setMessage(s.pesan)}
                    title={
                      s.catatan === "template"
                        ? "Contoh yang seharusnya dicegat template (Rp 0)"
                        : "Contoh yang memang perlu Claude"
                    }
                    className={[
                      "cursor-pointer rounded-lg border px-2.5 py-1.5 text-left text-xs",
                      s.catatan === "template"
                        ? "border-green/40 bg-green-mint text-green-dark"
                        : "border-line bg-white text-text-2",
                    ].join(" ")}
                  >
                    {s.catatan === "template" ? "⚡ " : "🤖 "}
                    {s.pesan}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={askAI}
                disabled={busy}
                className="w-full cursor-pointer rounded-xl border-none bg-green px-6 py-3 font-bold text-white transition hover:bg-green-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "Memproses…" : "Minta Balasan AI ✨"}
              </button>
              <p className="mt-2 mb-0 text-center text-xs text-muted">
                Ctrl/Cmd + Enter untuk mengirim
              </p>

              {/* --- Galat --- */}
              {error && (
                <div className="mt-4 rounded-xl bg-[#fee2e2] px-4 py-3 text-[0.9rem] text-[#b91c1c]">
                  <b>Gagal.</b> {error}
                </div>
              )}

              {/* --- Hasil --- */}
              {result && !error && (
                <div className="mt-4 rounded-xl border border-line bg-green-soft p-4">
                  {/* Gerbang 2 menemukan jawabannya, tetapi mode bayangan
                      menahannya. Keadaan ini perlu dinamai sendiri.

                      Sebelumnya layar hanya menampilkan HANDOVER_TO_CS dan
                      "DILEMPAR KE CLAUDE · dibatalkan" — dua lencana yang
                      keduanya benar secara teknis dan bersama-sama
                      menyesatkan: tidak ada yang dialihkan ke CS, dan yang
                      paling penting justru tidak disebut sama sekali, yaitu
                      bahwa jawabannya SUDAH ketemu. Pemilik proyek membaca
                      layar ini dua kali dan menyimpulkan Gerbang 2 gagal. */}
                  {(() => {
                    const ditahanBayangan =
                      result.source === "tanpa-claude" &&
                      result.pengenal?.jenis === "yakin" &&
                      !result.pengenal.dipakai;

                    return (
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="text-[0.86rem] text-text-2">Tindakan:</span>

                        {/* Untuk "tanpa-claude" tidak ada tindakan yang
                            benar-benar diputuskan — permintaannya dihentikan
                            sebelum ada yang memutuskan apa pun. Menampilkan
                            HANDOVER_TO_CS di situ mengarang keputusan. */}
                        {result.source !== "tanpa-claude" && (
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[0.6rem] font-extrabold ${actionTagClass(
                              result.action,
                            )}`}
                          >
                            {result.action}
                          </span>
                        )}

                        {result.source === "template" ? (
                          <span className="rounded-md bg-green-mint px-1.5 py-0.5 text-[0.6rem] font-extrabold text-green-dark">
                            ⚡ TEMPLATE [{result.templateCode}] · Rp 0
                          </span>
                        ) : ditahanBayangan ? (
                          <span className="rounded-md bg-green-mint px-1.5 py-0.5 text-[0.6rem] font-extrabold text-green-dark">
                            🧭 GERBANG 2 COCOK · ditahan mode bayangan
                          </span>
                        ) : result.source === "tanpa-claude" ? (
                          <span className="rounded-md bg-[#fdf3d8] px-1.5 py-0.5 text-[0.6rem] font-extrabold text-[#8a5a00]">
                            ⏭️ DILEMPAR KE CLAUDE · dibatalkan
                          </span>
                        ) : (
                          <span className="text-xs text-muted">
                            🤖 Claude · {result.model}
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {/* Tanpa cabang ini kotaknya tampil kosong dengan label
                      "Claude · null", seolah balasannya gagal. Padahal
                      tidak ada yang gagal — panggilannya memang sengaja
                      tidak dilakukan. */}
                  {result.pengenal && <PanelPengenal p={result.pengenal} />}

                  {result.source === "tanpa-claude" ? (
                    result.pengenal?.jenis === "yakin" &&
                    !result.pengenal.dipakai ? (
                      /* Kalimat lama berbunyi "lolos dari Gerbang 0, 1, dan 2"
                         apa pun keadaannya — dan itu SALAH persis pada kasus
                         ini: Gerbang 2 tidak dilewati, ia menangkap pesannya
                         lalu ditahan mode bayangan. Keliru menyebut gerbang
                         mana yang bekerja membuat orang memperbaiki bagian
                         yang tidak rusak. */
                      <p className="m-0 text-[0.9rem] text-text-2">
                        <b>Gerbang 2 sudah menemukan jawabannya</b> —{" "}
                        <b>[{result.pengenal.kandidat?.[0]?.code}]</b>. Yang
                        menahannya bukan skor, melainkan{" "}
                        <b>mode bayangan</b>: gerbang ini sengaja menghitung
                        tanpa pernah membalas, sampai ada yang mempercayainya.
                        Isi <code>PENGENAL_MODE=aktif</code> di{" "}
                        <code>web/.env.local</code> lalu jalankan ulang server
                        untuk melihatnya benar-benar menjawab.
                      </p>
                    ) : (
                      <p className="m-0 text-[0.9rem] text-text-2">
                        Tidak ada balasan karena Claude tidak dipanggil. Pesan
                        ini tidak tertangkap Gerbang 0, 1, maupun 2, jadi pada
                        keadaan normal akan diteruskan ke Sonnet bersama{" "}
                        <b>{result.berkas?.length ?? 0} berkas FAQ</b> kategori{" "}
                        <b>{result.kategori}</b>.
                      </p>
                    )
                  ) : (
                    <div className="whitespace-pre-wrap">{result.reply}</div>
                  )}

                  {/* Batas 600 karakter diminta tim CS (4 Sep 2026).
                      Ditampilkan, bukan dipaksakan dengan memangkas:
                      balasan berisi dosis yang terpotong di tengah jauh
                      lebih berbahaya daripada balasan yang kepanjangan. */}
                  {result.source !== "tanpa-claude" &&
                  (() => {
                    const u = result.panjang ?? ukurBalasan(result.reply);
                    return (
                      <p
                        className={[
                          "mt-2 mb-0 text-xs",
                          u.lewat
                            ? "font-semibold text-[#b91c1c]"
                            : u.mepet
                              ? "text-[#92400e]"
                              : "text-muted",
                        ].join(" ")}
                      >
                        {u.panjang} / {BATAS_BALASAN} karakter
                        {u.lewat && ` — lewat ${-u.sisa}, minta AI meringkas`}
                        {u.mepet && " — sudah mepet batas"}
                      </p>
                    );
                  })()}

                  {result.templateWhy && (
                    <p className="mt-3 mb-0 rounded-lg bg-white px-3 py-2 text-xs text-muted">
                      <b>Kenapa aman tanpa AI:</b> {result.templateWhy}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(result.reply);
                      toast("Balasan disalin");
                    }}
                    className="mt-3 cursor-pointer border-none bg-transparent p-0 text-[0.86rem] font-semibold text-green underline"
                  >
                    Salin balasan
                  </button>
                </div>
              )}

              {!result && !error && (
                <div className="mt-4 rounded-xl border border-dashed border-line py-8 text-center text-muted">
                  <div className="text-3xl">💬</div>
                  <p className="mt-2 mb-0">Balasan akan muncul di sini.</p>
                </div>
              )}
            </section>

            <CostMeter
              last={last}
              session={session}
              onReset={() => {
                setSession(EMPTY_SESSION);
                toast("Hitungan sesi dinolkan");
              }}
            />
          </div>

          {/* Gemini — meja uji pembanding. Panggilannya lewat
              /api/uji-gemini, terpisah dari /api/chat, jadi chat
              pelanggan tetap Claude apa pun yang dicoba di sini. */}
          <div className="mt-4">
            <UjiGemini
              judul="🧪 Uji Gemini (pembanding)"
              contoh={SAMPLES.filter((s) => s.catatan === "perlu AI").map((s) => s.pesan)}
            />
          </div>
        </>
      )}
    </div>
  );
}
