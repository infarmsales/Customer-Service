"use client";

/* ===========================================================
   Halaman Pengaturan — port dari settings.html + settings.js.
   Step 8 (bagian UI; pemindahan ke tabel Supabase menyusul).

   Perubahan penting dibanding settings.js:
   - Pengaturan AI tidak lagi disimpan ke localStorage per
     browser, melainkan ke store bersama (lib/db/store.ts)
     yang bentuknya sudah sama dengan tabel `settings`
     (satu baris, id = 1) di supabase/schema.sql.
     Begitu Supabase menyala, saveSettings() cukup diganti
     menjadi `update settings ... where id = 1` — halaman ini
     tidak perlu diubah.
   - Kolom yang dipetakan: ai_enabled, ai_model, confidence,
     escalation_keywords. Kolom lain di halaman ini (gaya
     bahasa, notifikasi, keamanan) memang belum ada di skema
     dan ditandai sebagai "belum disimpan" supaya jujur.
   =========================================================== */

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import TokoTerhubung from "@/components/settings/TokoTerhubung";
import { DemoNotice, GhostButton } from "@/components/ui/Bits";
import { actionTagClass } from "@/components/ai/actionTag";
import { saveSettings, useSettings } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import Link from "next/link";
import { inisial } from "@/lib/format";

type SectionId =
  | "profil"
  | "ai"
  | "kb"
  | "handover"
  | "integrasi"
  | "notif"
  | "keamanan";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "profil", label: "👤 Profil Akun" },
  { id: "ai", label: "🤖 AI Customer Service" },
  { id: "kb", label: "📚 Knowledge Base" },
  { id: "handover", label: "🙋 Handover & Eskalasi" },
  { id: "integrasi", label: "🛍️ Integrasi Marketplace" },
  { id: "notif", label: "🔔 Notifikasi" },
  { id: "keamanan", label: "🔒 Keamanan" },
];

/* ---------------- Potongan form ---------------- */

function SetCard({
  children,
  info = false,
}: {
  children: React.ReactNode;
  info?: boolean;
}) {
  return (
    <div
      className={`mb-4 rounded-2xl border p-5 px-5.5 shadow-[0_8px_24px_rgb(15_23_42/0.04)] max-mini:p-4 ${
        info ? "border-[#fde68a] bg-[#fffbeb]" : "border-line bg-white"
      }`}
    >
      {children}
    </div>
  );
}

function CardSubtitle({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 text-[0.95rem] font-bold">{children}</div>;
}

function Field({
  label,
  children,
  hint,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-1.5">
      <label className="mb-1.75 block text-[0.84rem] font-semibold text-text-2">
        {label}
      </label>
      {children}
      {hint && <div className="mt-2 text-[0.78rem] leading-relaxed text-muted">{hint}</div>}
    </div>
  );
}

const inputCls =
  "w-full rounded-[10px] border border-line bg-green-soft px-3 py-2.5 text-[0.9rem] focus:bg-white focus:outline-2 focus:outline-green";

function RowToggle({
  title,
  sub,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  sub?: string;
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line-soft py-3.5 first:border-t-0">
      <div>
        <div className="font-semibold">{title}</div>
        {sub && <div className="mt-0.75 text-[0.8rem] leading-snug text-muted">{sub}</div>}
      </div>
      {/* Switch — sepadan dengan .switch/.slider di settings.css */}
      <label className="relative inline-block h-6 w-11 shrink-0">
        <input
          type="checkbox"
          className="peer h-0 w-0 opacity-0"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.checked)}
        />
        <span className="absolute inset-0 cursor-pointer rounded-3xl bg-[#cbd5e1] transition peer-checked:bg-green peer-disabled:cursor-not-allowed peer-disabled:opacity-60 before:absolute before:top-[3px] before:left-[3px] before:h-4.5 before:w-4.5 before:rounded-full before:bg-white before:transition before:content-[''] peer-checked:before:translate-x-5" />
      </label>
    </div>
  );
}

function PanelHead({ title, desc }: { title: string; desc: React.ReactNode }) {
  return (
    <>
      <h2 className="m-0 mb-1 text-[1.4rem] font-bold">{title}</h2>
      <p className="mt-0 mb-5 text-[0.88rem] leading-relaxed text-muted">{desc}</p>
    </>
  );
}

function SaveBar({
  label,
  onSave,
  extra,
}: {
  label: string;
  onSave: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="mt-2 flex items-center gap-3 max-mini:flex-col max-mini:items-stretch">
      <button
        type="button"
        onClick={onSave}
        className="cursor-pointer rounded-xl border-none bg-green px-6 py-3 font-bold text-white transition hover:bg-green-hover"
      >
        {label}
      </button>
      {extra}
    </div>
  );
}

/** Penanda untuk kontrol yang belum punya kolom di schema.sql. */
function BelumTersimpan() {
  return (
    <span
      className="ml-2 rounded-md bg-[#fef3c7] px-1.5 py-px text-[0.62rem] font-bold text-[#92400e]"
      title="Belum ada kolomnya di supabase/schema.sql — nilainya tidak ikut tersimpan"
    >
      belum tersimpan
    </span>
  );
}

/* ---------------- Panel: Profil ---------------- */

function PanelProfil({ onSave }: { onSave: () => void }) {
  return (
    <div className="max-w-[760px]">
      <PanelHead
        title="Profil Akun"
        desc="Informasi akun yang dipakai untuk masuk ke console."
      />
      <SetCard>
        <div className="mb-5 flex items-center gap-4 max-mini:flex-col max-mini:items-start">
          <span className="grid h-15 w-15 place-items-center rounded-full bg-green text-[1.3rem] font-extrabold text-white">
            {inisial("Infarm.sales")}
          </span>
          <div>
            <div className="text-[1.1rem] font-extrabold">Infarm.sales</div>
            <div className="mt-0.75 text-[0.85rem] text-muted">
              Admin Customer Service · Infarm.ID
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 max-tablet:grid-cols-1">
          <Field label={<>Nama Pengguna <BelumTersimpan /></>}>
            <input className={inputCls} defaultValue="Infarm.sales" />
          </Field>
          <Field label={<>Email <BelumTersimpan /></>}>
            <input className={inputCls} type="email" defaultValue="infarmcorp@gmail.com" />
          </Field>
          <Field label={<>Bahasa <BelumTersimpan /></>}>
            <select className={inputCls} defaultValue="Indonesia">
              <option>Indonesia</option>
              <option>English</option>
            </select>
          </Field>
          <Field label={<>Zona Waktu <BelumTersimpan /></>}>
            <select className={inputCls} defaultValue="WIB (UTC+7)">
              <option>WIB (UTC+7)</option>
              <option>WITA (UTC+8)</option>
              <option>WIT (UTC+9)</option>
            </select>
          </Field>
        </div>
      </SetCard>
      <SaveBar label="Simpan Perubahan" onSave={onSave} />
    </div>
  );
}

/* ---------------- Panel: AI ---------------- */

const AI_ACTIONS = [
  { code: "AUTO_REPLY", desc: "Jawaban tersedia jelas di Knowledge Base", opts: ["Kirim otomatis", "Tinjau CS dulu"] },
  { code: "ASK_INFORMATION", desc: "Minta info tambahan (maks 3 pertanyaan)", opts: ["Kirim otomatis", "Tinjau CS dulu"] },
  { code: "CHECK_ORDER_SYSTEM", desc: "Cek data pesanan sebelum menjawab", opts: ["Cek sistem lalu kirim", "Tinjau CS dulu"] },
  { code: "HANDOVER_TO_CS", desc: "Refund, komplain, sengketa, dll", opts: ["Selalu alihkan ke CS 🔒"], locked: true },
];

function PanelAi() {
  const { profile } = useAuth();
  const settings = useSettings();
  const toast = useToast();

  /* Salinan lokal supaya slider terasa responsif; baru ditulis ke
     store saat tombol Simpan ditekan (perilaku sama settings.js).
     Nilai awal diambil sekali — panel ini dipasang ulang lewat
     prop `key` di pemanggilnya setiap kali baris settings berubah,
     jadi tidak perlu menyalin state lewat effect. */
  const [enabled, setEnabled] = useState(settings.ai_enabled);
  const [model, setModel] = useState(settings.ai_model);
  const [conf, setConf] = useState(settings.confidence);

  return (
    <div className="max-w-[760px]">
      <PanelHead
        title="AI Customer Service"
        desc={
          <>
            Perilaku AI mengikuti aturan di{" "}
            <b className="text-green-dark">claude.md</b>. Atur bagaimana AI membalas,
            kapan otomatis, dan kapan dialihkan ke CS manusia.
          </>
        }
      />

      <SetCard>
        <RowToggle
          title="Aktifkan Balasan Otomatis AI"
          sub="Bila mati, semua pesan menunggu balasan CS manusia."
          checked={enabled}
          onChange={setEnabled}
        />
        <div className="pt-4">
          <Field label="Model Claude">
            <select
              className={inputCls}
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="claude-sonnet-4-6">
                claude-sonnet-4-6 (default, sesuai Tech Stack)
              </option>
              <option value="claude-opus-4-8">claude-opus-4-8 (paling pintar)</option>
              <option value="claude-haiku-4-5">
                claude-haiku-4-5 (paling murah/cepat)
              </option>
            </select>
          </Field>

          <Field
            label={
              <>
                Ambang Keyakinan Minimum untuk Auto-Reply: <b>{conf}%</b>
              </>
            }
            hint='Di bawah ambang ini, AI tidak menjawab otomatis dan dialihkan ke CS (sesuai prinsip "lebih baik jujur dan alihkan" di claude.md).'
          >
            <input
              type="range"
              min={50}
              max={100}
              value={conf}
              onChange={(e) => setConf(Number(e.target.value))}
              className="w-full accent-green"
            />
          </Field>
        </div>
      </SetCard>

      <SetCard>
        <CardSubtitle>Perilaku per Klasifikasi Aksi</CardSubtitle>
        {AI_ACTIONS.map((a) => (
          <div
            key={a.code}
            className="grid grid-cols-[150px_1fr_180px] items-center gap-3 border-t border-line-soft py-3 first:border-t-0 max-tablet:grid-cols-1 max-tablet:gap-1.5"
          >
            <span
              className={`rounded-md px-1.75 py-0.75 text-center text-[0.62rem] font-extrabold ${actionTagClass(a.code)}`}
            >
              {a.code}
            </span>
            <span className="text-[0.84rem] text-text-2">{a.desc}</span>
            <select
              disabled={a.locked}
              className="rounded-[9px] border border-line bg-green-soft px-2.5 py-2 text-[0.82rem] disabled:bg-[#f1f5f9] disabled:text-muted"
            >
              {a.opts.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
        ))}
        <p className="mt-3 mb-0 text-[0.76rem] text-muted">
          Pilihan per klasifikasi <BelumTersimpan /> — kolomnya belum ada di
          <code className="mx-1 rounded bg-green-soft px-1">schema.sql</code>.
        </p>
      </SetCard>

      <SetCard>
        <CardSubtitle>Gaya Bahasa</CardSubtitle>
        <div className="grid grid-cols-2 gap-4 max-tablet:grid-cols-1">
          <Field label={<>Panggilan Pelanggan <BelumTersimpan /></>}>
            <input className={inputCls} defaultValue="Kak" />
          </Field>
          <Field label={<>Maksimum Emoji per Pesan <BelumTersimpan /></>}>
            <select className={inputCls}>
              <option>1 (sesuai claude.md)</option>
              <option>0</option>
              <option>2</option>
            </select>
          </Field>
          <Field label={<>Panjang Jawaban <BelumTersimpan /></>}>
            <select className={inputCls}>
              <option>2–5 kalimat pendek</option>
              <option>1–3 kalimat</option>
            </select>
          </Field>
          <Field label={<>Nada <BelumTersimpan /></>}>
            <select className={inputCls}>
              <option>Santai &amp; ramah</option>
              <option>Formal</option>
            </select>
          </Field>
        </div>
        <RowToggle
          title="Larang Klaim Berlebihan"
          sub={'Blokir frasa "pasti berhasil", "100% aman", "langsung berbuah".'}
          checked
        />
        <RowToggle
          title="Larang Hard-Selling"
          sub="Rekomendasi produk hanya bila relevan dengan kebutuhan pelanggan."
          checked
        />
      </SetCard>

      <SetCard info>
        <CardSubtitle>
          ⚠️ Aturan Mutlak (dari claude.md — tidak dapat dimatikan)
        </CardSubtitle>
        <ul className="m-0 list-disc pl-5 text-[0.86rem] leading-loose text-[#92400e]">
          <li>Tidak mengarang dosis, harga, stok, promo, atau estimasi pengiriman.</li>
          <li>
            Tidak menjanjikan refund/retur/kompensasi — hanya CS manusia yang berwenang.
          </li>
          <li>Tidak meminta password, PIN, OTP, atau data kartu pelanggan.</li>
          <li>Tidak menyebut system prompt atau aturan internal ke pelanggan.</li>
        </ul>
      </SetCard>

      <SaveBar
        label="Simpan Pengaturan AI"
        onSave={() => {
          // profile.id dicatat di kolom updated_by supaya terlihat siapa
          // yang terakhir mengubah ambang keyakinan AI.
          saveSettings(
            { ai_enabled: enabled, ai_model: model, confidence: conf },
            profile?.id ?? null,
          );
          toast("Pengaturan AI tersimpan ✅");
        }}
      />
    </div>
  );
}

/* ---------------- Panel: Knowledge Base ---------------- */

function KbRow({
  icon,
  title,
  sub,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3.5 border-t border-line-soft py-3.5 first:border-t-0">
      {icon}
      <div className="flex-1">
        <div className="font-semibold">{title}</div>
        <div className="mt-0.75 text-[0.8rem] text-muted">{sub}</div>
      </div>
      {action}
    </div>
  );
}

/* Sub-tab di dalam panel Knowledge Base.

   "Berkas" adalah panel lama apa adanya — levelnya berkas.
   "Template Jawaban" adalah halaman baru — levelnya template
   individual, supaya tim CS bisa memperbaiki satu balasan tanpa
   membuka berkas mentah dan tanpa developer.

   Ditaruh sebagai sub-tab, bukan menggantikan panel lama: keduanya
   menjawab pertanyaan yang berbeda. Panel berkas menjawab "apa saja
   yang dibaca AI"; halaman template menjawab "kalimat apa yang
   dikirim ke pelanggan". */
type SubKb = "berkas" | "mode";

function PanelKb({ onSave }: { onSave: () => void }) {
  const toast = useToast();
  const [sub, setSub] = useState<SubKb>("berkas");
  const ico = (e: string) => (
    <span className="grid h-10 w-10 place-items-center rounded-xl bg-green-mint text-[1.2rem]">
      {e}
    </span>
  );

  return (
    <div className="max-w-[760px]">
      <PanelHead
        title="Knowledge Base"
        desc="Sumber jawaban AI. Urutan prioritas: data sistem → Knowledge Base → SOP → riwayat percakapan."
      />

      {/* Penunjuk, bukan penghapusan diam-diam.

          Sub-tab "Template Jawaban" pindah ke halaman /knowledge di
          rail utama pada 10 Sep 2026. Orang yang sudah hafal jalan
          lamanya akan datang ke sini lebih dulu — membiarkannya
          menghilang tanpa keterangan berarti mereka menyimpulkan
          fiturnya dihapus. */}
      <div className="mt-4 rounded-2xl border border-green/40 bg-green-mint px-4 py-3">
        <div className="text-[0.88rem] font-bold text-green-dark">
          📚 Template Jawaban kini punya halamannya sendiri
        </div>
        <p className="mt-1 mb-2 text-[0.82rem] leading-relaxed text-text-2">
          Pindah ke rail utama supaya tim CS bisa menjangkaunya dengan satu klik —
          menulis contoh pertanyaan adalah pekerjaan harian, bukan pengaturan.
        </p>
        <Link
          href="/knowledge"
          className="inline-block rounded-xl bg-green px-4 py-2 text-[0.84rem] font-bold text-white no-underline transition hover:bg-green-hover"
        >
          Buka Knowledge Base →
        </Link>
      </div>

      <div className="mt-4 mb-4 flex items-center gap-2 border-b border-line">
        {(
          [
            ["berkas", "Berkas"],
            ["mode", "Mode KB"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSub(key)}
            className={[
              "-mb-px cursor-pointer border-0 border-b-2 bg-transparent px-4 py-2.5 font-semibold",
              sub === key
                ? "border-green text-green-dark"
                : "border-transparent text-muted",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>


      {sub === "berkas" && (
        <>
      <SetCard>
        <KbRow
          icon={ico("📦")}
          title="products.json"
          sub="373 SKU produk Infarm · diperbarui 2026-06-20"
          action={<GhostButton onClick={() => toast("Pengelola KB belum tersedia")}>Kelola</GhostButton>}
        />
        <KbRow
          icon={ico("❓")}
          title="4 berkas FAQ kategori"
          sub="152 balasan baku CS · dipecah 2 Sep: interaksi, cara-pakai, produk, umum"
          action={<GhostButton onClick={() => toast("Pengelola KB belum tersedia")}>Kelola</GhostButton>}
        />
        <KbRow
          icon={ico("📄")}
          title="claude.md + sop.md"
          sub="System prompt, SOP, tema warna · dimuat lib/knowledge.ts"
          action={<GhostButton onClick={() => toast("Pratinjau KB belum tersedia")}>Lihat</GhostButton>}
        />
      </SetCard>

        </>
      )}

      {sub === "mode" && (
      <SetCard>
        <CardSubtitle>Mode Knowledge Base</CardSubtitle>
        <label className="flex cursor-pointer items-center gap-2 py-2.5 text-[0.9rem]">
          <input type="radio" name="kbmode" defaultChecked className="accent-green" />
          <b>Opsi A — Inject ke prompt</b>
          <span className="text-[0.8rem] text-muted">
            cocok untuk KB &lt; 50KB (saat ini aktif)
          </span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 py-2.5 text-[0.9rem]">
          <input type="radio" name="kbmode" className="accent-green" />
          <b>Opsi B — RAG (Supabase pgvector)</b>
          <span className="text-[0.8rem] text-muted">untuk KB besar / skala</span>
        </label>
      </SetCard>
      )}

      {/* Syaratnya dulu `sub !== "template"` — penjaga agar tombol
          Simpan tidak muncul di bawah pengelola template, yang
          menyimpan sendiri per baris. Sub-tab itu sudah pindah ke
          /knowledge, jadi penjaganya tidak punya kasus lagi. */}
      <SaveBar label="Simpan" onSave={onSave} />
    </div>
  );
}

/* ---------------- Panel: Handover ---------------- */

function PanelHandover() {
  const { profile } = useAuth();
  const settings = useSettings();
  const toast = useToast();
  /* Sama seperti PanelAi: nilai awal dari store, disinkronkan
     ulang lewat prop `key` saat baris settings berubah. */
  const [keywords, setKeywords] = useState<string[]>(settings.escalation_keywords);
  const [draft, setDraft] = useState("");

  const tambah = () => {
    const v = draft.trim();
    if (!v) return;
    if (keywords.includes(v)) {
      toast("Kata kunci itu sudah ada");
      return;
    }
    setKeywords([...keywords, v]);
    setDraft("");
  };

  return (
    <div className="max-w-[760px]">
      <PanelHead
        title="Handover & Eskalasi"
        desc={
          <>
            Saat AI memutuskan <b className="text-green-dark">HANDOVER_TO_CS</b>, sistem
            mengirim notifikasi + ringkasan ke tim CS manusia.
          </>
        }
      />

      <SetCard>
        <Field label={<>Kanal Notifikasi <BelumTersimpan /></>}>
          <select className={inputCls}>
            <option>Telegram Bot (gratis)</option>
            <option>WhatsApp Business API</option>
            <option>Slack Webhook</option>
          </select>
        </Field>
        <Field label={<>Token / Webhook URL <BelumTersimpan /></>}>
          <input
            className={inputCls}
            placeholder="contoh: https://api.telegram.org/bot<token>/…"
          />
        </Field>
        <RowToggle
          title="Sertakan Ringkasan Handover Otomatis"
          sub="Format ringkasan internal sesuai claude.md (nomor pesanan, kategori, inti masalah, urgensi)."
          checked
        />
      </SetCard>

      <SetCard>
        <CardSubtitle>Kata Kunci Pemicu Eskalasi</CardSubtitle>
        <div className="mb-3.5 flex flex-wrap gap-2">
          {keywords.map((k, i) => (
            <span
              key={k}
              className="inline-flex items-center gap-1.5 rounded-3xl bg-green-mint px-3 py-1.5 text-[0.82rem] font-semibold text-green-dark"
            >
              {k}
              <button
                type="button"
                aria-label={`Hapus ${k}`}
                onClick={() => setKeywords(keywords.filter((_, j) => j !== i))}
                className="cursor-pointer border-none bg-transparent font-bold text-green-dark"
              >
                ✕
              </button>
            </span>
          ))}
          {keywords.length === 0 && (
            <span className="text-[0.82rem] text-muted">Belum ada kata kunci.</span>
          )}
        </div>
        <div className="flex max-w-[360px] gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                tambah();
              }
            }}
            placeholder="tambah kata kunci…"
            className="flex-1 rounded-[10px] border border-line bg-green-soft px-3 py-2.25"
          />
          <GhostButton onClick={tambah}>Tambah</GhostButton>
        </div>
      </SetCard>

      <SaveBar
        label="Simpan"
        onSave={() => {
          saveSettings({ escalation_keywords: keywords }, profile?.id ?? null);
          toast("Kata kunci eskalasi tersimpan ✅");
        }}
      />
    </div>
  );
}

/* ---------------- Panel: Integrasi ---------------- */

const TOKO = [
  { logo: "bg-shp", char: "S", nama: "infarmofficialshop", sub: "Shopee · terhubung", aktif: true },
  { logo: "bg-tt", char: "T", nama: "Infarm Official", sub: "TikTok Shop · terhubung", aktif: true },
  { logo: "bg-lz", char: "L", nama: "Infarm Surabaya", sub: "Lazada · token kedaluwarsa", aktif: false },
];

function PanelIntegrasi() {
  const toast = useToast();
  return (
    <div className="max-w-[760px]">
      <PanelHead
        title="Integrasi Marketplace"
        desc="Toko yang terhubung untuk menerima chat & data pesanan."
      />
      <TokoTerhubung />
      <SetCard>
        {TOKO.map((t) => (
          <KbRow
            key={t.nama}
            icon={
              <span
                className={`grid h-9 w-9 place-items-center rounded-[10px] font-extrabold text-white ${t.logo}`}
              >
                {t.char}
              </span>
            }
            title={t.nama}
            sub={t.sub}
            action={
              <span
                className={`text-[0.82rem] font-bold ${t.aktif ? "text-green-dark" : "text-[#d97706]"}`}
              >
                ● {t.aktif ? "Aktif" : "Perlu re-auth"}
              </span>
            }
          />
        ))}
      </SetCard>
      <SaveBar
        label="＋ Integrasikan Toko Baru"
        onSave={() => toast("Modal integrasi toko ada di halaman Chat")}
      />
    </div>
  );
}

/* ---------------- Panel: Notifikasi ---------------- */

function PanelNotif({ onSave }: { onSave: () => void }) {
  return (
    <div className="max-w-[760px]">
      <PanelHead title="Notifikasi" desc="Atur kapan kamu ingin diberi tahu." />
      <SetCard>
        <RowToggle title="Chat Baru Masuk" checked />
        <RowToggle title="Eskalasi Handover ke CS" checked />
        <RowToggle title="Penilaian Negatif (≤2 bintang)" checked />
        <RowToggle title="Ringkasan Harian via Email" checked={false} />
      </SetCard>
      <SaveBar label="Simpan" onSave={onSave} />
    </div>
  );
}

/* ---------------- Panel: Keamanan ---------------- */

function PanelKeamanan({ onSave }: { onSave: () => void }) {
  const toast = useToast();
  return (
    <div className="max-w-[760px]">
      <PanelHead title="Keamanan" desc="Lindungi akun console kamu." />
      <SetCard>
        <Field label="Password Lama">
          <input className={inputCls} type="password" placeholder="••••••••" />
        </Field>
        <Field label="Password Baru">
          <input className={inputCls} type="password" placeholder="••••••••" />
        </Field>
        <Field label="Konfirmasi Password Baru">
          <input className={inputCls} type="password" placeholder="••••••••" />
        </Field>
        <RowToggle
          title="Verifikasi Dua Langkah (2FA)"
          sub="Tambahan keamanan saat login."
          checked={false}
        />
      </SetCard>
      <p className="-mt-2 mb-3 text-[0.78rem] text-muted">
        Ganti password baru berfungsi setelah Supabase Auth aktif (Step 7). Sekarang
        login masih hardcode di halaman masuk.
      </p>
      <SaveBar
        label="Perbarui Password"
        onSave={onSave}
        extra={
          <button
            type="button"
            onClick={() => toast("Butuh Supabase Auth (Step 7)")}
            className="cursor-pointer rounded-xl border border-[#fecaca] bg-white px-5 py-3 font-bold text-[#b91c1c] transition hover:bg-[#fee2e2]"
          >
            Keluar dari Semua Perangkat
          </button>
        }
      />
    </div>
  );
}

/* ---------------- Halaman ---------------- */

export default function Settings() {
  const [section, setSection] = useState<SectionId>("profil");
  const settings = useSettings();
  const toast = useToast();

  /* /shopee/callback mengembalikan ke /settings?shopee=ok|gagal.
     Pesannya ada di bagian Integrasi, jadi bagian itulah yang dibuka.
     Dibaca di effect, bukan saat render, supaya HTML dari server dan
     dari klien tetap sama (keduanya mulai dari "profil"). */
  useEffect(() => {
    /* Di dalam IIFE async, bukan langsung di badan effect — pola yang
       sama dengan pengambilan data di ContohPertanyaan.tsx, dan yang
       diterima eslint react-hooks/set-state-in-effect. */
    void (async () => {
      try {
        /* ?bagian=integrasi — dari tombol "Integrasikan Toko Baru" di Chat. */
        const q = new URLSearchParams(window.location.search);
        if (q.has("shopee") || q.get("bagian") === "integrasi") setSection("integrasi");
      } catch {
        /* tanpa window — biarkan */
      }
    })();
  }, []);

  const belumTersimpan = () =>
    toast("Bagian ini belum punya kolom di schema.sql — belum ikut tersimpan");

  return (
    /* h-full supaya kolom sub-nav putih memenuhi tinggi layar
       seperti .settings { flex:1 } di settings.css lama. */
    <div className="flex h-full min-h-0 bg-page max-tablet:h-auto max-tablet:flex-col">
      {/* Sub-nav kiri; di ≤980px jadi bilah yang bisa digeser */}
      <aside className="w-62 shrink-0 overflow-y-auto border-r border-line bg-white p-4 px-3 max-tablet:flex max-tablet:w-full max-tablet:gap-1.5 max-tablet:overflow-x-auto max-tablet:border-r-0 max-tablet:border-b max-tablet:p-2.5 max-tablet:px-3">
        <div className="px-3 pt-1.5 pb-3.5 text-[1.05rem] font-extrabold max-tablet:hidden">
          Pengaturan
        </div>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            aria-current={section === s.id ? "true" : undefined}
            className={[
              "mb-0.5 block w-full cursor-pointer rounded-xl border-none px-3.5 py-2.75 text-left text-[0.9rem] font-semibold transition",
              "max-tablet:mb-0 max-tablet:w-auto max-tablet:shrink-0 max-tablet:whitespace-nowrap",
              section === s.id
                ? "bg-green-mint text-green-dark"
                : "bg-transparent text-text-2 hover:bg-green-soft",
            ].join(" ")}
          >
            {s.label}
          </button>
        ))}
      </aside>

      <section className="flex-1 overflow-y-auto p-6 px-7 pb-10 max-mini:p-4 max-mini:px-3.5 max-mini:pb-8">
        <div className="mb-5 max-w-[760px]">
          <DemoNotice detail="Hanya bagian AI & kata kunci eskalasi yang benar-benar tersimpan (tabel settings)." />
        </div>

        {section === "profil" && <PanelProfil onSave={belumTersimpan} />}
        {section === "ai" && <PanelAi key={settings.updated_at} />}
        {section === "kb" && <PanelKb onSave={belumTersimpan} />}
        {section === "handover" && <PanelHandover key={settings.updated_at} />}
        {section === "integrasi" && <PanelIntegrasi />}
        {section === "notif" && <PanelNotif onSave={belumTersimpan} />}
        {section === "keamanan" && <PanelKeamanan onSave={belumTersimpan} />}
      </section>
    </div>
  );
}
