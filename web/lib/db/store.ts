"use client";

/* ===========================================================
   Store data console — satu sumber data bersama untuk semua
   halaman (mis. jumlah chat belum dibaca dipakai Rail dan
   halaman Chat sekaligus).

   Dibuat pada Step 6b sebagai store memori murni. Sejak Step 7
   store yang sama menjadi WRITE-THROUGH ke Supabase:

     - Kredensial belum diisi -> tetap seperti dulu, seluruh data
       dari lib/db/seed.ts dan hidup di memori satu tab.
     - Kredensial sudah diisi -> hydrateFromSupabase() mengganti
       isinya dengan baris asli, setiap perubahan dikirim ke
       database, dan Realtime menyegarkan bila admin lain ikut
       mengubah.

   KENAPA WRITE-THROUGH, BUKAN MODUL TANDINGAN
   Rencana awal di lib/db/index.ts adalah membuat lib/db/supabase.ts
   berisi fungsi bernama sama, lalu menukar baris re-export. Cara
   itu ditinggalkan: dua implementasi dari API yang sama pasti
   menyimpang diam-diam, dan setiap perbaikan harus ditulis dua
   kali. Sekarang hanya ada satu jalur, dengan satu percabangan
   di dalamnya.

   YANG TETAP DARI SEED WALAU SUPABASE MENYALA:
   reviews, refunds, cancels, dan broadcast. Keempatnya BUKAN
   tabel kita — sumber sebenarnya API pesanan & broadcast
   marketplace (Fase 3 roadmap). Menaruhnya di Supabase berarti
   menyalin data milik Shopee/TikTok yang bisa basi kapan saja.
   =========================================================== */

import { useCallback, useSyncExternalStore } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { hitungJedaSampai, JAM_JEDA } from "@/lib/handover";
import {
  DEMO_USER,
  SEED_AI_FLAGS,
  SEED_BROADCAST,
  SEED_CANCELS,
  SEED_CANCEL_COUNT,
  SEED_CONVERSATIONS,
  SEED_ESCALATIONS,
  SEED_REFUNDS,
  SEED_REVIEWS,
  SEED_SETTINGS,
} from "./seed";
import type {
  AiFlagRow,
  BroadcastTask,
  Cancel,
  ChatMessage,
  Conversation,
  ConversationExtra,
  ConversationRow,
  EscalationRow,
  Refund,
  Review,
  SettingsRow,
} from "./types";
import { belumTerjawab } from "../tunggakan";

type DbState = {
  conversations: Conversation[];
  escalations: EscalationRow[];
  settings: SettingsRow;
  aiFlags: AiFlagRow[];
  reviews: Review[];
  refunds: Refund[];
  cancels: Cancel[];
  cancelCount: typeof SEED_CANCEL_COUNT;
  broadcast: Record<string, BroadcastTask[]>;
};

/** Salinan dalam supaya seed tidak ikut berubah saat data diedit. */
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

let state: DbState = {
  conversations: clone(SEED_CONVERSATIONS),
  escalations: clone(SEED_ESCALATIONS),
  settings: clone(SEED_SETTINGS),
  aiFlags: clone(SEED_AI_FLAGS),
  reviews: clone(SEED_REVIEWS),
  refunds: clone(SEED_REFUNDS),
  cancels: clone(SEED_CANCELS),
  cancelCount: clone(SEED_CANCEL_COUNT),
  broadcast: clone(SEED_BROADCAST),
};

const listeners = new Set<() => void>();

function setState(patch: Partial<DbState>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Pembaca state. Selector harus mengembalikan nilai yang stabil
 * (referensi array/objek dari state, bukan hasil .map/.filter baru)
 * supaya useSyncExternalStore tidak merender tanpa henti.
 */
export function useDb<T>(selector: (s: DbState) => T): T {
  const get = useCallback(() => selector(state), [selector]);
  return useSyncExternalStore(subscribe, get, get);
}

/* ===========================================================
   Jembatan Supabase
   =========================================================== */

const PAKAI_SUPABASE = isSupabaseConfigured();

/**
 * Empat field yang dipakai UI lama tetapi tidak punya kolom di
 * schema.sql. Sengaja TIDAK dikarang isinya:
 *   chat_count  -> bisa dihitung dari panjang messages
 *   product_query -> tidak ada sumbernya; kosong = kotak input kosong
 *   order_status / order_courier -> milik API pesanan marketplace;
 *     Chat.tsx sudah punya cabang tampilan untuk nilai null.
 */
function lengkapi(r: ConversationRow): Conversation {
  const extra: ConversationExtra = {
    chat_count: Array.isArray(r.messages) ? r.messages.length : 0,
    product_query: "",
    order_status: null,
    order_courier: null,
  };
  return { ...r, ...extra };
}

/**
 * Kegagalan menulis tidak boleh lewat diam-diam: UI sudah terlanjur
 * memperlihatkan perubahan yang sebenarnya gagal tersimpan. Jadi
 * dicatat ke console, lalu state ditarik ulang dari database supaya
 * layar kembali menunjukkan keadaan yang sebenarnya.
 */
function gagalTulis(apa: string, pesan: string) {
  console.error(`[db] gagal menyimpan ${apa}: ${pesan}`);
  void hydrateFromSupabase();
}

/**
 * Periksa hasil satu penulisan.
 *
 * INI YANG PALING MUDAH TERLEWAT: aturan RLS yang menolak UPDATE
 * TIDAK mengembalikan error. PostgREST membalas "sukses" dengan nol
 * baris terpengaruh, karena dari sisi SQL memang tidak ada baris yang
 * boleh dilihat untuk diubah — bukan kesalahan, hanya tidak ada yang
 * cocok.
 *
 * Akibatnya, memeriksa `error` saja membuat layar berbohong: nilai
 * baru tampil seolah tersimpan, lalu diam-diam kembali ke nilai lama
 * saat halaman dimuat ulang. Persis yang dilaporkan pemilik proyek
 * pada 4 Sep 2026 untuk ambang keyakinan AI.
 *
 * Karena itu setiap penulisan memakai .select(), dan nol baris
 * diperlakukan sebagai kegagalan.
 */
function periksaTulis(
  apa: string,
  error: { message: string } | null,
  data: unknown[] | null,
) {
  if (error) {
    gagalTulis(apa, error.message);
    return;
  }
  if (!data || data.length === 0) {
    gagalTulis(
      apa,
      "database tidak mengubah baris apa pun. Umumnya aturan RLS menolak: " +
        "perubahan ini butuh peran 'admin' di tabel profiles. Bisa juga " +
        "barisnya memang tidak ada.",
    );
  }
}

let sedangHydrate: Promise<void> | null = null;

/**
 * Tarik seluruh data dari Supabase dan gantikan isi store.
 * Dipanggil AuthGuard setelah pengguna login, dan diulang tiap
 * kali Realtime memberi tahu ada perubahan.
 *
 * Aman dipanggil berkali-kali: pemanggilan yang tumpang tindih
 * ikut menunggu permintaan yang sedang berjalan.
 */
export function hydrateFromSupabase(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return Promise.resolve();
  if (sedangHydrate) return sedangHydrate;

  sedangHydrate = (async () => {
    const [conv, esc, set, flags] = await Promise.all([
      sb.from("conversations").select("*").order("last_message_at", { ascending: false }),
      sb.from("escalations").select("*").order("created_at", { ascending: false }),
      sb.from("settings").select("*").eq("id", 1).maybeSingle(),
      sb.from("ai_flags").select("*").order("created_at", { ascending: false }),
    ]);

    const patch: Partial<DbState> = {};

    // Tiap tabel diperlakukan sendiri-sendiri: satu tabel yang gagal
    // (mis. RLS menolak) tidak boleh mengosongkan tiga tabel lain.
    if (conv.error) console.error("[db] conversations:", conv.error.message);
    else patch.conversations = (conv.data as ConversationRow[]).map(lengkapi);

    if (esc.error) console.error("[db] escalations:", esc.error.message);
    else patch.escalations = esc.data as EscalationRow[];

    if (set.error) console.error("[db] settings:", set.error.message);
    else if (set.data) patch.settings = set.data as SettingsRow;

    if (flags.error) console.error("[db] ai_flags:", flags.error.message);
    else patch.aiFlags = flags.data as AiFlagRow[];

    if (Object.keys(patch).length) setState(patch);
  })().finally(() => {
    sedangHydrate = null;
  });

  return sedangHydrate;
}

/**
 * Dengarkan perubahan dari admin lain.
 *
 * Sengaja menarik ulang seluruh data, bukan menambal baris yang
 * berubah: payload Realtime tidak membawa hasil order/filter, dan
 * logika penambalan per-peristiwa adalah tempat lahirnya bug urutan
 * yang sulit ditelusuri. Tabelnya kecil, jadi menarik ulang murah.
 *
 * @returns fungsi untuk berhenti mendengarkan.
 */
export function subscribeRealtime(): () => void {
  const sb = getSupabase();
  if (!sb) return () => {};

  const ch = sb.channel("konsol-cs");
  for (const table of ["conversations", "escalations", "settings", "ai_flags"]) {
    ch.on("postgres_changes", { event: "*", schema: "public", table }, () => {
      void hydrateFromSupabase();
    });
  }
  ch.subscribe();

  return () => {
    void sb.removeChannel(ch);
  };
}

/* ===========================================================
   conversations
   =========================================================== */

export const selectConversations = (s: DbState) => s.conversations;
export const selectEscalations = (s: DbState) => s.escalations;

export function useConversations() {
  return useDb(selectConversations);
}

/** Jumlah percakapan belum dibaca — badge 💬 di rail. */
export function useUnreadCount() {
  return useDb(
    useCallback((s: DbState) => s.conversations.filter((c) => c.unread).length, []),
  );
}

/**
 * Jumlah percakapan yang menunggu balasan — dipakai peringatan di
 * penanda AI, sebelum jendela jam kerja ditutup.
 *
 * Berbeda dari useUnreadCount(). "Belum dibaca" berubah begitu
 * seseorang MEMBUKA percakapannya; yang dihitung di sini baru
 * berubah kalau benar-benar ada yang MEMBALAS. Chat yang dibuka,
 * dibaca, lalu ditinggalkan tetap terhitung di sini — dan justru
 * chat seperti itulah yang paling mudah tertinggal saat jam kerja
 * habis.
 */
export function useBelumTerjawabCount() {
  return useDb(
    useCallback((s: DbState) => s.conversations.filter((c) => belumTerjawab(c.messages)).length, []),
  );
}

/** Tandai percakapan sudah dibaca (dipanggil saat dibuka). */
export function markRead(id: string) {
  const next = state.conversations.map((c) =>
    c.id === id && c.unread ? { ...c, unread: false } : c,
  );
  if (!next.some((c, i) => c !== state.conversations[i])) return;
  setState({ conversations: next });

  if (!PAKAI_SUPABASE) return;
  void getSupabase()
    ?.from("conversations")
    .update({ unread: false })
    .eq("id", id)
    .select("id")
    .then(({ error, data }) => periksaTulis("status dibaca", error, data));
}

/**
 * Tambah balasan CS ke sebuah percakapan.
 *
 * role 'cs', BUKAN 'assistant'. Yang mengetik di sini selalu manusia
 * — tombol ✨ hanya mengisi kotak draf, dan CS masih harus menekan
 * kirim. Selama keduanya ditulis 'assistant', tidak ada cara
 * membedakan percakapan yang sudah disentuh orang dari yang belum,
 * dan itulah satu-satunya penanda yang dipakai untuk menutup
 * eskalasi. Lihat ChatMessage di lib/db/types.ts.
 */
export function appendMessage(id: string, content: string, idEksternal?: string) {
  const now = new Date().toISOString();
  /* idEksternal: id pesan dari marketplace bila balasannya sudah
     benar-benar terkirim ke sana (TikTok). Sinkronisasi berikutnya
     mengenali id ini dan tidak menambahkan pesan yang sama lagi. */
  const msg: ChatMessage = { role: "cs", content, timestamp: now, ...(idEksternal ? { idEksternal } : {}) };

  const target = state.conversations.find((c) => c.id === id);
  if (!target) return;
  const messages = [...target.messages, msg];

  /* --- Jeda AI dimajukan, tapi hanya bila percakapan ini memang
     pernah dialihkan ---------------------------------------------

     Syarat `ai_paused_until` tidak null itu inti aturannya. Tanpa
     syarat itu, CS yang membalas manual pertanyaan biasa — "dosis
     NPK berapa" — akan mematikan AI di percakapan itu selama 24 jam
     tanpa ada yang pernah meminta.

     Sebaliknya, setiap balasan CS pada percakapan yang SUDAH
     dialihkan memang harus memajukannya. Kasus refund yang alot
     bisa berjalan seharian; kalau jamnya dihitung kaku sejak
     handover, AI akan menyala tepat saat CS masih bolak-balik
     dengan orangnya.

     Pesan pelanggan sengaja tidak lewat sini sama sekali — kalau
     pelanggan bisa menahan AI hanya dengan mengetik, satu orang
     yang rajin menulis bisa mematikannya selamanya. */
  const jedaBaru = target.ai_paused_until ? hitungJedaSampai(JAM_JEDA) : null;

  /* --- Eskalasi ditutup oleh balasan pertama dari manusia --------

     Inilah alasan role 'cs' harus ada. Selama balasan CS dan
     balasan AI sama-sama tercatat 'assistant', tidak ada satu pun
     titik di kode ini yang tahu bahwa seorang manusia baru saja
     menangani kasusnya.

     Perhatikan yang TIDAK ikut berubah: `ai_paused_until` tetap
     berjalan walau eskalasinya sudah resolved. Keduanya sengaja
     dipisah — "selesai" itu urusan antrean dan statistik, "AI
     diam" itu urusan keselamatan. Menggabungkannya berarti AI
     menyala lagi begitu CS menulis "boleh minta nomor pesanannya
     kak?", dan menjawab sendiri saat pelanggan membalas "12345". */
  const adaTerbuka = state.escalations.some(
    (e) => e.conversation_id === id && e.status === "open",
  );

  setState({
    conversations: state.conversations.map((c) =>
      c.id === id
        ? {
            ...c,
            messages,
            chat_count: messages.length,
            updated_at: now,
            last_message_at: now,
            ai_paused_until: jedaBaru ?? c.ai_paused_until,
          }
        : c,
    ),
    ...(adaTerbuka
      ? {
          escalations: state.escalations.map((e) =>
            e.conversation_id === id && e.status === "open"
              ? { ...e, status: "resolved" as const }
              : e,
          ),
        }
      : {}),
  });

  if (!PAKAI_SUPABASE) return;
  const sb = getSupabase();
  if (!sb) return;

  void sb
    .from("conversations")
    // updated_at diisi trigger conversations_touch, jadi tidak dikirim.
    .update({
      messages,
      last_message_at: now,
      ...(jedaBaru ? { ai_paused_until: jedaBaru } : {}),
    })
    .eq("id", id)
    .select("id")
    .then(({ error, data }) => periksaTulis("balasan", error, data));

  if (!adaTerbuka) return;
  void sb
    .from("escalations")
    .update({ status: "resolved" })
    .eq("conversation_id", id)
    .eq("status", "open")
    .select("id")
    .then(({ error, data }) => periksaTulis("penutupan eskalasi", error, data));
}

/** Perbarui panel saran AI setelah /api/chat menjawab. */
export function setAiSuggestion(
  id: string,
  suggestion: string,
  action: Conversation["action"],
) {
  setState({
    conversations: state.conversations.map((c) =>
      c.id === id ? { ...c, ai_suggestion: suggestion, action } : c,
    ),
  });

  if (!PAKAI_SUPABASE) return;
  void getSupabase()
    ?.from("conversations")
    .update({ ai_suggestion: suggestion, action })
    .eq("id", id)
    .select("id")
    .then(({ error, data }) => periksaTulis("saran AI", error, data));
}

/* ===========================================================
   settings
   =========================================================== */

export const selectSettings = (s: DbState) => s.settings;

export function useSettings() {
  return useDb(selectSettings);
}

/**
 * Simpan pengaturan AI.
 * @param userId id profil yang menyimpan; null di mode demo.
 */
export function saveSettings(
  patch: Partial<Omit<SettingsRow, "id">>,
  userId: string | null = DEMO_USER.id,
) {
  setState({
    settings: {
      ...state.settings,
      ...patch,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    },
  });

  if (!PAKAI_SUPABASE) return;
  void getSupabase()
    ?.from("settings")
    .update({ ...patch, updated_by: userId })
    .eq("id", 1)
    .select("id")
    // RLS settings_write hanya mengizinkan peran 'admin'. Penolakannya
    // datang sebagai nol baris, BUKAN error — lihat periksaTulis().
    .then(({ error, data }) => periksaTulis("pengaturan", error, data));
}

/* ===========================================================
   ai_flags
   =========================================================== */

export const selectAiFlags = (s: DbState) => s.aiFlags;

export function useAiFlags() {
  return useDb(selectAiFlags);
}

/** Jumlah flag yang masih menunggu review — badge di sub-tab. */
export function usePendingFlagCount() {
  return useDb(
    useCallback(
      (s: DbState) => s.aiFlags.filter((f) => f.status === "menunggu").length,
      [],
    ),
  );
}

/**
 * Putuskan sebuah flag: setujui atau tolak.
 *
 * Hanya admin yang boleh — tombolnya disembunyikan untuk peran 'cs',
 * dan RLS ai_flags_review menolaknya di sisi database. Dua lapis,
 * karena menyembunyikan tombol saja bukan pengaman.
 *
 * @param reviewerId id profil yang memutuskan; null di mode demo.
 */
export function decideFlag(
  id: string,
  keputusan: "disetujui" | "ditolak",
  reviewerId: string | null,
  alasanTolak = "",
) {
  const now = new Date().toISOString();
  const patch = {
    status: keputusan,
    reject_reason: keputusan === "ditolak" ? alasanTolak.trim() || null : null,
    reviewed_at: now,
    reviewed_by: reviewerId,
  } as const;

  setState({
    aiFlags: state.aiFlags.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  });

  if (!PAKAI_SUPABASE) return;
  void getSupabase()
    ?.from("ai_flags")
    .update(patch)
    .eq("id", id)
    .select("id")
    .then(({ error, data }) => periksaTulis("keputusan flag", error, data));
}

/* ===========================================================
   Pesanan — ulasan, refund, pembatalan
   (bukan tabel Supabase; sumber akhirnya API marketplace)
   =========================================================== */

export const selectReviews = (s: DbState) => s.reviews;
export const selectRefunds = (s: DbState) => s.refunds;
export const selectCancels = (s: DbState) => s.cancels;
export const selectCancelCount = (s: DbState) => s.cancelCount;

export function useReviews() {
  return useDb(selectReviews);
}
export function useRefunds() {
  return useDb(selectRefunds);
}
export function useCancels() {
  return useDb(selectCancels);
}
export function useCancelCount() {
  return useDb(selectCancelCount);
}

/**
 * Putuskan permintaan pembatalan.
 * 'batal'  = setujui  -> pesanan dibatalkan
 * 'lanjut' = tolak    -> pesanan tetap dilanjutkan
 * Mengembalikan berapa baris yang benar-benar berubah, supaya
 * pemanggil bisa menyusun pesan toast seperti pesanan.js lama.
 *
 * Tetap lokal walau Supabase menyala: keputusan pembatalan harus
 * dikirim ke API pesanan marketplace, bukan ke tabel kita.
 */
export function decideCancels(orders: string[], decision: "batal" | "lanjut") {
  const target = new Set(orders);
  let changed = 0;
  const count = { ...state.cancelCount };

  const cancels = state.cancels.map((c) => {
    if (!target.has(c.order) || c.status !== "menunggu") return c;
    changed++;
    count.menunggu = Math.max(0, count.menunggu - 1);
    if (decision === "batal") {
      count.batal++;
      return { ...c, status: "batal" as const, note: null };
    }
    count.proses++;
    return { ...c, status: "proses" as const, note: "Pesanan Dilanjutkan" };
  });

  if (changed) setState({ cancels, cancelCount: count });
  return changed;
}

/* ===========================================================
   broadcast
   =========================================================== */

export const selectBroadcast = (s: DbState) => s.broadcast;

export function useBroadcast() {
  return useDb(selectBroadcast);
}

export function addBroadcastTask(marketplace: string, task: BroadcastTask) {
  setState({
    broadcast: {
      ...state.broadcast,
      [marketplace]: [task, ...(state.broadcast[marketplace] ?? [])],
    },
  });
}

/* ===========================================================
   Utilitas demo
   =========================================================== */

/**
 * Kembalikan seluruh data ke seed — tombol "Atur ulang data demo".
 * Tidak melakukan apa pun bila Supabase menyala: menimpa percakapan
 * asli dengan data contoh bukan "atur ulang", itu kehilangan data.
 */
export function resetDemoData() {
  if (PAKAI_SUPABASE) {
    console.warn("[db] Atur ulang data demo diabaikan — Supabase aktif.");
    return;
  }
  setState({
    conversations: clone(SEED_CONVERSATIONS),
    escalations: clone(SEED_ESCALATIONS),
    settings: clone(SEED_SETTINGS),
    aiFlags: clone(SEED_AI_FLAGS),
    reviews: clone(SEED_REVIEWS),
    refunds: clone(SEED_REFUNDS),
    cancels: clone(SEED_CANCELS),
    cancelCount: clone(SEED_CANCEL_COUNT),
    broadcast: clone(SEED_BROADCAST),
  });
}
