/* ===========================================================
   Tipe data — sepadan dengan supabase/schema.sql
   Dibuat pada Step 6b (mode demo, lihat MIGRATION.md Fase 3).

   ATURAN BERKAS INI:
   1. Tipe `*Row` = salinan persis satu tabel di schema.sql.
      Nama kolom, tipe, dan nilai boleh-null-nya tidak boleh
      menyimpang — begitu Supabase dinyalakan, baris yang
      kembali dari `supabase.from(...)` langsung cocok.
   2. Tipe `*Extra` = field yang dipakai UI lama tetapi BELUM
      ada di schema.sql. Sengaja dipisah supaya terlihat jelas
      apa yang masih perlu kolom/tabel baru atau API pesanan
      marketplace, bukan tersamar jadi seolah sudah ada di DB.
   =========================================================== */

/** Empat klasifikasi tindakan (claude.md). Sama dengan CHECK di schema.sql. */
export type ActionCode =
  | "AUTO_REPLY"
  | "ASK_INFORMATION"
  | "HANDOVER_TO_CS"
  | "CHECK_ORDER_SYSTEM";

export type Platform = "shopee" | "tiktok" | "lazada";

/** Satu pesan di dalam kolom `conversations.messages` (jsonb). */
export type ChatMessage = {
  /**
   * 'user' = pelanggan, 'assistant' = balasan AI, 'cs' = balasan
   * manusia.
   *
   * KENAPA 'cs' PERLU DIPISAH DARI 'assistant'
   *
   * Sampai 9 Sep 2026 balasan CS ditulis sebagai 'assistant', persis
   * sama dengan balasan AI. Akibatnya tidak ada satu pun cara
   * mengetahui apakah sebuah percakapan sudah disentuh manusia —
   * dan aturan "eskalasi ditutup saat CS membalas" mustahil
   * dijalankan, karena tidak ada yang tahu siapa yang barusan
   * membalas.
   *
   * Kolomnya jsonb tanpa CHECK, jadi nilai ketiga ini tidak butuh
   * migrasi. Baris lama tetap terbaca: balasan CS sebelum tanggal
   * itu akan selamanya tercatat sebagai 'assistant', dan memang
   * tidak ada cara memperbaikinya surut.
   */
  role: "user" | "assistant" | "cs";
  content: string;
  timestamp: string;
  /**
   * Foto atau berkas yang ikut dikirim pelanggan.
   *
   * KENAPA KEHADIRANNYA SAJA SUDAH CUKUP UNTUK MENGALIHKAN KE CS
   *
   * AI tidak pernah melihat isinya. `/api/chat` hanya mengirim teks
   * ke Claude; gambar tidak ikut sama sekali. Jadi menjawab pesan
   * berlampiran berarti menjawab sesuatu yang tidak pernah dilihat —
   * dan AI akan terdengar yakin tentang tanaman yang tidak pernah
   * ada di hadapannya.
   *
   * Karena itu lampiran diperlakukan sebagai pemicu handover di
   * Gerbang -0.5, sebelum gerbang mana pun yang bisa menjawab.
   * Bukan karena foto berbahaya, tetapi karena AI-nya buta
   * terhadapnya.
   *
   * Kolom `messages` bertipe jsonb tanpa CHECK, jadi bidang ini
   * tidak menuntut migrasi. Pesan lama yang tidak punya bidang ini
   * terbaca sebagai undefined — dan itu benar, memang tidak ada
   * lampirannya.
   */
  lampiran?: Lampiran[];
  /**
   * Id pesan di marketplace (TikTok: message id). Hanya ada pada
   * pesan hasil sinkronisasi; dipakai untuk menggabungkan hasil
   * sinkronisasi berulang tanpa menggandakan pesan. Opsional, jadi
   * pesan lama dan simulasi tetap sah tanpa migrasi.
   */
  idEksternal?: string;
};

/** Satu berkas yang menempel pada sebuah pesan. */
export type Lampiran = {
  /**
   * Alamat berkasnya.
   *
   * Untuk sekarang selalu URL dari marketplace, yang KEDALUWARSA.
   * Menyalinnya ke Supabase Storage adalah keputusan tersendiri dan
   * belum diambil — lihat catatan di /api/chat. Yang penting
   * disadari: URL yang mati membuat bukti klaim ikut hilang justru
   * saat dibutuhkan.
   */
  url: string;
  jenis: "gambar" | "video" | "berkas";
  /** Nama asli bila ada, untuk ditampilkan pada berkas non-gambar. */
  nama?: string;
};

/* ---------------- public.profiles ---------------- */
export type ProfileRow = {
  id: string;
  username: string;
  role: "cs" | "admin";
  created_at: string;
};

/* ---------------- public.conversations ---------------- */
export type ConversationRow = {
  id: string;
  platform: Platform | null;
  customer_id: string | null;
  order_id: string | null;
  messages: ChatMessage[];
  action: ActionCode | null;
  handover_summary: string | null;
  created_at: string;
  updated_at: string;
  customer_name: string | null;
  shop_name: string | null;
  unread: boolean;
  tracking_no: string | null;
  ai_suggestion: string | null;
  handover_detail: Record<string, string> | null;
  last_message_at: string;
  /**
   * Selama > now(), AI tidak boleh menjawab percakapan ini karena
   * sedang ditangani CS manusia. Diisi saat handover (+24 jam),
   * dimajukan setiap balasan CS. Null = tidak pernah dialihkan.
   *
   * Sengaja stempel waktu, bukan boolean: jeda berakhir sendiri
   * karena waktu berjalan, jadi tidak perlu penjadwal yang
   * mematikannya dan tidak ada keadaan yang bisa tersangkut menyala.
   * Lihat supabase/handover-jeda-ai.sql.
   */
  ai_paused_until: string | null;
  /**
   * Id percakapan di marketplace (migrasi 20261026150000). Terisi =
   * percakapan ini hasil sinkronisasi dari marketplace sungguhan, dan
   * balasan yang diketik di console BELUM terkirim ke sana.
   * Opsional: database yang belum menjalankan migrasi tidak punya
   * kolomnya sama sekali.
   */
  external_conversation_id?: string | null;
};

/**
 * Dipakai dashboard.html lama, belum ada di schema.sql.
 * `order_*` memang tidak seharusnya jadi kolom: sumbernya API
 * pesanan marketplace (Fase 3 roadmap), bukan tabel kita.
 */
export type ConversationExtra = {
  chat_count: number;
  product_query: string;
  order_status: string | null;
  order_courier: string | null;
};

export type Conversation = ConversationRow & ConversationExtra;

/* ---------------- public.escalations ---------------- */
export type EscalationRow = {
  id: string;
  conversation_id: string | null;
  reason: string | null;
  status: "open" | "resolved";
  assigned_to: string | null;
  created_at: string;
};

/* ---------------- public.settings ---------------- */
export type SettingsRow = {
  id: 1;
  ai_enabled: boolean;
  ai_model: string;
  confidence: number;
  escalation_keywords: string[];
  updated_at: string;
  updated_by: string | null;
};

/* ---------------- public.ai_flags ---------------- */
export type AiFlagRow = {
  id: string;
  code: string | null;
  customer_message: string;
  ai_answer: string;
  ai_action: ActionCode | null;
  correct_answer: string | null;
  category: "produk" | "kebijakan" | "dosis" | "harga" | "lainnya";
  reporter_id: string | null;
  reporter_name: string | null;
  note: string | null;
  status: "menunggu" | "disetujui" | "ditolak";
  reject_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

/* ===========================================================
   Di bawah ini BUKAN tabel Supabase.
   Sumber sebenarnya adalah API marketplace (pesanan, ulasan,
   broadcast) atau hasil agregasi (statistik). Selama mode demo
   isinya tetap dari seed; strukturnya dibuat menyerupai bentuk
   respons API supaya penggantinya nanti tidak mengubah UI.
   =========================================================== */

/** Ulasan produk — Shopee/TikTok Review API. */
export type Review = {
  order: string;
  buyer: string;
  prod: string;
  sku: string;
  emoji: string;
  rating: { all: number; produk: number; penjual: number; kirim: number };
  content: string;
  date: string;
  status: "wait" | "done";
};

/** Pengajuan pengembalian dana — Order/Return API. */
export type Refund = {
  order: string;
  buyer: string;
  prod: string;
  jenis: string;
  nominal: string;
  status: "dana" | "batal";
  pill: "refund" | "cancel";
  label: string;
};

/** Permintaan pembatalan — Order/Cancellation API. */
export type Cancel = {
  order: string;
  buyer: string;
  prod: string;
  alasan: string;
  nominal: string;
  status: "menunggu" | "proses" | "batal";
  /** Diisi saat CS menolak pembatalan ('Pesanan Dilanjutkan'). */
  note?: string | null;
};

/** Tugas broadcast per marketplace — Chat Broadcast API. */
export type BroadcastTask = {
  name: string;
  status: "done" | "sending" | "draft";
  plan: number;
  ok: number;
  fail: number;
  by: string;
  at: string;
};

/** Satu SKU dari products.json (katalog produk Infarm). */
export type Product = {
  sku: string;
  nama_produk: string;
  kategori: string;
  product_ids_shopee?: (string | number)[];
};
