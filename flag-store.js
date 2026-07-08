/* ===========================================================
   Infarm CS — Flag Koreksi Jawaban AI (data store bersama)
   Dipakai oleh: ai.js, ai-flag.js (sub-tab "Flag Koreksi" di ai.html)
   Penyimpanan: localStorage (sementara). Saat migrasi ke
   Supabase (lihat MIGRATION.md), ganti loadFlags/saveFlags/
   addFlag/updateFlag dengan query Supabase — nama fungsi &
   bentuk data dibuat agar penggantiannya minim perubahan.
   =========================================================== */

const FLAG_KEY = 'infarm_cs_flags';
const ROLE_KEY = 'infarm_cs_role';
const USER_KEY = 'infarm_cs_user';

const FLAG_CATEGORIES = {
  produk: 'Produk',
  kebijakan: 'Kebijakan',
  dosis: 'Dosis',
  harga: 'Harga',
  lainnya: 'Lainnya',
};

const FLAG_STATUS = {
  menunggu: { label: 'Menunggu Review', cls: 'wait' },
  disetujui: { label: 'Disetujui', cls: 'done' },
  ditolak: { label: 'Ditolak', cls: 'cancel' },
};

// ---------- Seed data (contoh, hanya dipakai saat penyimpanan masih kosong) ----------
function seedFlags() {
  const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  };
  return [
    {
      id: 'FLG-0001',
      customerMessage: 'Dosis POC Buah buat durian gimana ya kak?',
      aiAnswer: 'Untuk durian, POC Buah bisa dipakai 5 ml per liter air setiap hari.',
      aiAction: 'AUTO_REPLY',
      correctAnswer: 'Dosis POC Buah untuk tanaman buah termasuk durian tetap 2 ml per 1 liter air, seminggu sekali saat fase berbunga/berbuah — bukan 5 ml setiap hari.',
      category: 'dosis',
      reporterName: 'CSINFARM2',
      note: 'AI menaikkan dosis tanpa dasar dari Knowledge Base, berisiko overdosis pada tanaman.',
      status: 'menunggu',
      rejectReason: '',
      createdAt: daysAgo(1),
      reviewedAt: null,
      reviewedBy: null,
    },
    {
      id: 'FLG-0002',
      customerMessage: 'Kalau saya retur barang, ongkirnya ditanggung Infarm gak?',
      aiAnswer: 'Iya kak, ongkir retur ditanggung penuh oleh Infarm.',
      aiAction: 'AUTO_REPLY',
      correctAnswer: 'AI tidak boleh menjawab soal kebijakan retur/ongkir secara pasti — ini wajib HANDOVER_TO_CS karena berkaitan dengan kompensasi.',
      category: 'kebijakan',
      reporterName: 'Infarm.sales',
      note: '',
      status: 'disetujui',
      rejectReason: '',
      createdAt: daysAgo(3),
      reviewedAt: daysAgo(2),
      reviewedBy: 'Infarm.sales (Admin)',
    },
    {
      id: 'FLG-0003',
      customerMessage: 'Harga Furadan 1 kg berapa kak?',
      aiAnswer: 'Harga Furadan 1 Kg sekitar Rp 25.000, Kak.',
      aiAction: 'AUTO_REPLY',
      correctAnswer: 'AI tidak memiliki data harga real-time dan tidak boleh menyebut harga tanpa data sistem — seharusnya arahkan pelanggan ke halaman produk marketplace.',
      category: 'harga',
      reporterName: 'CSINFARM2',
      note: 'Harga pada jawaban AI tidak sesuai harga toko saat ini.',
      status: 'ditolak',
      rejectReason: 'Sudah diperbaiki lewat laporan sebelumnya, ini laporan duplikat.',
      createdAt: daysAgo(5),
      reviewedAt: daysAgo(4),
      reviewedBy: 'Infarm.sales (Admin)',
    },
  ];
}

// ---------- CRUD ----------
function loadFlags() {
  try {
    const raw = localStorage.getItem(FLAG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) { /* localStorage tidak tersedia */ }
  const seed = seedFlags();
  saveFlags(seed);
  return seed;
}

function saveFlags(list) {
  try { localStorage.setItem(FLAG_KEY, JSON.stringify(list)); } catch (_) {}
}

function addFlag(data) {
  const list = loadFlags();
  const flag = {
    id: 'FLG-' + Date.now().toString().slice(-6),
    aiAction: '',
    note: '',
    status: 'menunggu',
    rejectReason: '',
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    reviewedBy: null,
    ...data,
  };
  list.unshift(flag);
  saveFlags(list);
  return flag;
}

function updateFlag(id, patch) {
  const list = loadFlags();
  const idx = list.findIndex((f) => f.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch };
  saveFlags(list);
  return list[idx];
}

function getFlag(id) {
  return loadFlags().find((f) => f.id === id) || null;
}

function pendingFlagCount() {
  return loadFlags().filter((f) => f.status === 'menunggu').length;
}

// ---------- Role & sesi pengguna ----------
// Demo role switcher — akan diganti Supabase Auth (lihat MIGRATION.md).
function getRole() {
  return localStorage.getItem(ROLE_KEY) || 'cs';
}
function setRole(role) {
  try { localStorage.setItem(ROLE_KEY, role); } catch (_) {}
}
function isAdmin() {
  return getRole() === 'admin';
}
function getCurrentUserName() {
  try {
    const u = JSON.parse(localStorage.getItem(USER_KEY) || '{}');
    return u.username || 'Infarm.sales';
  } catch (_) { return 'Infarm.sales'; }
}

// ---------- Format tanggal Indonesia ----------
function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch (_) { return iso; }
}
