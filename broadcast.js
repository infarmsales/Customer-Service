/* ===========================================================
   Infarm CS — Pesan Broadcast
   3 marketplace (Lazada/Shopee/TikTok), tiap halaman data sendiri.
   Form Tambah Tugas + bantu tulis pesan ala claude.md.
   =========================================================== */

const $ = (s) => document.querySelector(s);

// ---------- Data tugas broadcast per marketplace ----------
const TASKS = {
  shopee: [
    { name: 'tanpa ringbrinjal', status: 'done',  plan: 16,  ok: 0,   fail: 16, by: 'Infarm.sales', at: '2026-03-16 13:46' },
    { name: 'akar',              status: 'done',  plan: 9,   ok: 0,   fail: 9,  by: 'Infarm.sales', at: '2026-03-16 11:18' },
    { name: 'Voucher chat',      status: 'done',  plan: 121, ok: 121, fail: 0,  by: 'Infarm.sales', at: '2026-02-26 13:45' },
    { name: 'voucher chat',      status: 'done',  plan: 35,  ok: 2,   fail: 33, by: 'CSINFARM2',     at: '2026-02-25 10:02' },
  ],
  lazada: [
    { name: 'promo benih cabai', status: 'sending', plan: 48, ok: 30, fail: 0, by: 'Infarm.sales', at: '2026-06-22 09:10' },
    { name: 'reminder keranjang', status: 'done',   plan: 60, ok: 57, fail: 3, by: 'Infarm.sales', at: '2026-06-18 15:30' },
  ],
  tiktok: [
    { name: 'flash sale pupuk',  status: 'done',  plan: 90, ok: 88, fail: 2, by: 'CSINFARM2',     at: '2026-06-20 19:45' },
    { name: 'follow up melon',   status: 'draft', plan: 0,  ok: 0,  fail: 0, by: 'Infarm.sales', at: '2026-06-24 08:05' },
  ],
};

const MP_LABEL = { shopee: 'Shopee', lazada: 'Lazada', tiktok: 'TikTok' };
let currentMp = 'shopee';

const STATUS_LABEL = { done: 'Selesai', sending: 'Sedang Dikirim', draft: 'Draf' };

function renderList() {
  const rows = TASKS[currentMp];
  const body = $('#bcBody');
  body.innerHTML = rows.map((t) => `
    <tr>
      <td><span class="task-name">${t.name}</span></td>
      <td><span class="dot-status ${t.status}">${STATUS_LABEL[t.status]}</span></td>
      <td>${t.plan}</td>
      <td><span class="${t.ok > 0 ? 'num-ok' : ''}">${t.ok}</span></td>
      <td><span class="${t.fail > 0 ? 'num-fail' : ''}">${t.fail}</span></td>
      <td><div class="creator">${t.by}</div><div class="creator-time">${t.at}</div></td>
      <td><div class="act-links"><button class="act-link">Rincian</button><button class="act-link">Salin</button></div></td>
    </tr>`).join('');
  $('#bcEmpty').hidden = rows.length > 0;
  $('#bcTotal').textContent = rows.length;
  $('#formMp').textContent = MP_LABEL[currentMp];
}

// ---------- View switch ----------
function showForm() {
  $('#viewList').hidden = true;
  $('#viewForm').hidden = false;
  $('#formMp').textContent = MP_LABEL[currentMp];
}
function showList() {
  $('#viewForm').hidden = true;
  $('#viewList').hidden = false;
}

// ---------- Bantu tulis pesan (ala claude.md) ----------
const AI_TEMPLATES = [
  'Halo, Kak 😊 Terima kasih sudah mampir ke toko Infarm. Lagi cari kebutuhan berkebun apa, Kak? minfarm bantu pilihkan yang paling cocok ya 🌱',
  'Hai, Kak! Kalau lagi mulai berkebun di rumah, benih & media tanam Infarm bisa jadi pilihan. Ada yang ingin ditanyakan dulu sebelum pesan, Kak? 🙏',
  'Halo, Kak 🌿 Pesanan sebelumnya semoga tumbuh subur ya. Kalau butuh nutrisi lanjutan atau bibit baru, minfarm siap bantu rekomendasikan yang sesuai kebutuhan Kakak.',
];
let aiIdx = 0;

// ---------- Lampiran produk/voucher ----------
const attached = [];
function renderAttached() {
  $('#attached').innerHTML = attached.map((a, i) =>
    `<span class="att-item">${a.icon} ${a.label}<button data-i="${i}">✕</button></span>`).join('');
  $('#attached').querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => { attached.splice(Number(b.dataset.i), 1); renderAttached(); }));
}

// ---------- Toast ----------
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

// ---------- Wiring ----------
document.addEventListener('DOMContentLoaded', () => {
  renderList();

  // Tab marketplace (tiap halaman sendiri)
  document.querySelectorAll('.bc-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.bc-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentMp = tab.dataset.mp;
      showList();
      renderList();
    });
  });

  // Tambah tugas → form
  $('#addBtn').addEventListener('click', showForm);
  $('#backLink').addEventListener('click', showList);
  $('#cancelTask').addEventListener('click', () => { showList(); toast('Tugas dibatalkan'); });

  // Counter nama & pesan
  $('#taskName').addEventListener('input', (e) => $('#nameCount').textContent = `${e.target.value.length} / 50`);
  $('#msgText').addEventListener('input', (e) => $('#msgCount').textContent = `${e.target.value.length} / 500`);

  // Bantu tulis AI
  $('#aiFill').addEventListener('click', () => {
    const text = AI_TEMPLATES[aiIdx % AI_TEMPLATES.length];
    aiIdx++;
    $('#msgText').value = text;
    $('#msgCount').textContent = `${text.length} / 500`;
    toast('Draf pesan AI dibuat (gaya claude.md)');
  });

  // Pilih produk / voucher
  $('#pickProduct').addEventListener('click', () => {
    attached.push({ icon: '🏷️', label: 'POC Buah Infarm 250 ml' });
    renderAttached();
    toast('Kartu produk ditambahkan');
  });
  $('#pickVoucher').addEventListener('click', () => {
    attached.push({ icon: '🎟️', label: 'Voucher Belanja Rp 10.000' });
    renderAttached();
    toast('Voucher ditambahkan');
  });

  // Kirim / Simpan
  function submitTask(statusLabel, status) {
    const name = $('#taskName').value.trim();
    const msg = $('#msgText').value.trim();
    if (!name) { toast('Isi Nama tugas dulu, Kak'); return; }
    if (!msg) { toast('Isi konten pesan dulu, Kak'); return; }
    TASKS[currentMp].unshift({
      name, status,
      plan: status === 'draft' ? 0 : 50,
      ok: 0, fail: 0,
      by: 'Infarm.sales', at: '2026-06-25 08:24',
    });
    // reset form
    $('#taskName').value = ''; $('#msgText').value = '';
    $('#nameCount').textContent = '0 / 50'; $('#msgCount').textContent = '0 / 500';
    attached.length = 0; renderAttached();
    showList(); renderList();
    toast(statusLabel);
  }
  $('#sendTask').addEventListener('click', () => submitTask('Tugas broadcast dikirim ✅', 'sending'));
  $('#saveTask').addEventListener('click', () => submitTask('Tugas disimpan sebagai draf', 'draft'));
});
