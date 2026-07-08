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
  resetSegmentPanel();
}
function showList() {
  $('#viewForm').hidden = true;
  $('#viewList').hidden = false;
}

// ---------- Bantu tulis pesan (ala claude.md) ----------
const GENERIC_TEMPLATES = [
  'Halo, Kak 😊 Terima kasih sudah mampir ke toko Infarm. Lagi cari kebutuhan berkebun apa, Kak? minfarm bantu pilihkan yang paling cocok ya 🌱',
  'Hai, Kak! Kalau lagi mulai berkebun di rumah, benih & media tanam Infarm bisa jadi pilihan. Ada yang ingin ditanyakan dulu sebelum pesan, Kak? 🙏',
  'Halo, Kak 🌿 Pesanan sebelumnya semoga tumbuh subur ya. Kalau butuh nutrisi lanjutan atau bibit baru, minfarm siap bantu rekomendasikan yang sesuai kebutuhan Kakak.',
];
const BELUM_ORDER_TEMPLATES = [
  'Halo, Kak 👋 Kenalin, Infarm — perlengkapan berkebun & tanaman rumahan. Kalau lagi cari benih, pupuk, atau alat kebun, boleh mampir dulu ke toko kami ya, Kak 🌱',
  'Hai, Kak! Baru mulai hobi berkebun di rumah? Infarm siapin benih sayur & pupuk organik yang cocok buat pemula. Ada yang mau ditanyakan dulu, Kak?',
];
let aiIdx = 0;

// ---------- Segmentasi Pelanggan (AI) ----------
let selectedSegmentProduct = null;

function currentPenerima() {
  const el = document.querySelector('input[name="penerima"]:checked');
  return el ? el.value : 'penandaan';
}
function currentSegmen() {
  const el = document.querySelector('input[name="segmen"]:checked');
  return el ? el.value : 'sudah_order';
}

// Angka contoh yang konsisten per produk (bukan acak setiap render).
// Diganti data transaksi nyata setelah integrasi API pesanan marketplace.
function hashCount(str, min, max) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return min + (h % (max - min + 1));
}

function updateSegmentUI() {
  const seg = currentSegmen();
  document.querySelectorAll('.segment-card').forEach((card) => card.classList.toggle('active', card.dataset.seg === seg));
  $('#segmentProductPicker').hidden = seg !== 'sudah_order_produk';
}

function renderSegProducts(query) {
  const matches = searchProducts(query, 15);
  $('#segProdList').innerHTML = matches.map((p) => {
    const count = hashCount(p.sku, 8, 95);
    return `<div class="prod-card" data-sku="${p.sku}" style="cursor:pointer">
      <div class="pc-thumb">🌱</div>
      <div class="pc-body">
        <div class="pc-name">${p.nama_produk}</div>
        <div class="pc-meta"><span class="pc-sku">${p.sku}</span><span>${p.kategori || ''}</span><span>± ${count} pembeli</span></div>
      </div>
    </div>`;
  }).join('') || '<div class="prod-note">Produk tidak ditemukan. Coba kata kunci lain.</div>';
  $('#segProdContext').innerHTML = `Menampilkan <b>${matches.length}</b> hasil · ${catalogStatusText()}`;

  $('#segProdList').querySelectorAll('.prod-card[data-sku]').forEach((card) => {
    card.addEventListener('click', () => {
      const p = PRODUCTS.find((x) => x.sku === card.dataset.sku);
      if (p) selectSegProduct(p);
    });
  });
}

function selectSegProduct(p) {
  selectedSegmentProduct = p;
  const count = hashCount(p.sku, 8, 95);
  const box = $('#segProdSelected');
  box.hidden = false;
  box.innerHTML = `🎯 Produk terpilih: <b>${p.nama_produk}</b> (± ${count} pembeli) <button type="button" id="clearSegProduct">Ganti</button>`;
  $('#countProduk').textContent = `± ${count} pembeli`;
  $('#clearSegProduct').addEventListener('click', clearSegProduct);
}

function clearSegProduct() {
  selectedSegmentProduct = null;
  $('#segProdSelected').hidden = true;
  $('#countProduk').textContent = 'pilih produk';
}

function resetSegmentPanel() {
  $('#segmentPanel').hidden = true;
  document.querySelector('input[name="penerima"][value="penandaan"]').checked = true;
  const defSeg = document.querySelector('input[name="segmen"][value="sudah_order"]');
  if (defSeg) defSeg.checked = true;
  clearSegProduct();
  updateSegmentUI();
}

// Susun draf pesan AI sesuai penerima/segmen yang sedang dipilih (gaya claude.md)
function buildAiMessage() {
  if (currentPenerima() !== 'segmentasi') {
    return GENERIC_TEMPLATES[aiIdx++ % GENERIC_TEMPLATES.length];
  }
  const seg = currentSegmen();
  if (seg === 'belum_order') {
    return BELUM_ORDER_TEMPLATES[aiIdx++ % BELUM_ORDER_TEMPLATES.length];
  }
  if (seg === 'sudah_order_produk' && selectedSegmentProduct) {
    const nama = selectedSegmentProduct.nama_produk.replace(/^INFARM - /, '');
    return `Halo, Kak 😊 Terima kasih sudah pernah beli ${nama} di toko kami. Kalau stok di rumah mulai menipis atau ingin restock, minfarm siap bantu ya, Kak 🌿`;
  }
  return GENERIC_TEMPLATES[aiIdx++ % GENERIC_TEMPLATES.length];
}

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

  // Bantu tulis AI — menyesuaikan segmen penerima yang sedang dipilih
  $('#aiFill').addEventListener('click', () => {
    const text = buildAiMessage();
    $('#msgText').value = text;
    $('#msgCount').textContent = `${text.length} / 500`;
    toast('Draf pesan AI dibuat (gaya claude.md)');
  });

  // Segmentasi Pelanggan (AI)
  document.querySelectorAll('input[name="penerima"]').forEach((r) => {
    r.addEventListener('change', () => {
      $('#segmentPanel').hidden = currentPenerima() !== 'segmentasi';
    });
  });
  document.querySelectorAll('input[name="segmen"]').forEach((r) => {
    r.addEventListener('change', updateSegmentUI);
  });
  $('#segProdSearch').addEventListener('input', (e) => renderSegProducts(e.target.value));
  loadProducts().then(() => renderSegProducts(''));

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
    resetSegmentPanel();
    showList(); renderList();
    toast(statusLabel);
  }
  $('#sendTask').addEventListener('click', () => submitTask('Tugas broadcast dikirim ✅', 'sending'));
  $('#saveTask').addEventListener('click', () => submitTask('Tugas disimpan sebagai draf', 'draft'));
});
