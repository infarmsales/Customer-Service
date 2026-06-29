/* ===========================================================
   Infarm CS — Halaman Pesanan (interaktivitas)
   3 sub-halaman: Penilaian, Pengembalian Dana, Dibatalkan.
   Tindakan AI mengikuti klasifikasi claude.md.
   =========================================================== */

const $ = (s) => document.querySelector(s);

// ---------- Helper bintang ----------
function stars(n) {
  let h = '';
  for (let i = 1; i <= 5; i++) h += `<span class="${i <= n ? 'on' : ''}">★</span>`;
  return `<span class="stars">${h}</span>`;
}

// ---------- Data: Penilaian (ulasan produk Infarm) ----------
const REVIEWS = [
  {
    order: '2693131542572727', buyer: '*********939',
    prod: 'INFARM - Furadan 3GR Ukuran 1 Kg', sku: 'NT-FURADAN-1KG', emoji: '🧪',
    rating: { all: 2, produk: 2, penjual: 2, kirim: 2 },
    content: 'Kemudahan penggunaan: Aman untuk tanaman. Efektivitas: Bagus untuk berkebun.',
    date: '2026-06-14 12:41', status: 'wait',
  },
  {
    order: '2776474846239407', buyer: 'Ardy L',
    prod: 'INFARM - Pupuk Magnesium Sulfat 1 Kg', sku: 'NT-MAGNESIUM-1KG', emoji: '🌿',
    rating: { all: 1, produk: 1, penjual: 1, kirim: 1 },
    content: 'Barang original saya sudah coba dan sudah saya aplikasikan ke padi semoga bermanfaat. Kemudahan Penggunaan: Mudah dipakai.',
    date: '2026-06-13 09:18', status: 'wait',
  },
  {
    order: '2810455120098341', buyer: 'sari****ti',
    prod: 'INFARM - POC Buah 250 ml', sku: 'POC-BUAH-250', emoji: '🍅',
    rating: { all: 5, produk: 5, penjual: 5, kirim: 5 },
    content: 'Cabe saya jadi lebat banget, terima kasih Infarm! Pengiriman cepat dan packing rapi.',
    date: '2026-06-12 16:05', status: 'done',
  },
  {
    order: '2854120947712030', buyer: 'budi*****no',
    prod: 'INFARM - Benih Cabai Keriting Micha', sku: 'BCA-CMK-MICHA', emoji: '🌶️',
    rating: { all: 3, produk: 3, penjual: 4, kirim: 2 },
    content: 'Benih tumbuh sebagian, mungkin karena cuaca. Pelayanan penjual ramah.',
    date: '2026-06-11 10:42', status: 'wait',
  },
  {
    order: '2899741203355618', buyer: 'nadia***fh',
    prod: 'INFARM - Polybag 30x30 isi 30 pcs', sku: '30BAG-POLYH-3030', emoji: '🪴',
    rating: { all: 2, produk: 2, penjual: 3, kirim: 2 },
    content: 'Polybag agak tipis dari ekspektasi, tapi masih bisa dipakai.',
    date: '2026-06-10 14:20', status: 'wait',
  },
];

function renderReviews() {
  const star = document.querySelector('#starTabs .chip.active').dataset.star;
  const negOnly = $('#negOnly').checked;
  const rows = REVIEWS.filter((r) => {
    if (star !== 'all' && r.rating.all !== Number(star)) return false;
    if (negOnly && r.rating.all > 2) return false;
    return true;
  });

  const body = $('#reviewBody');
  body.innerHTML = '';
  rows.forEach((r) => {
    const neg = r.rating.all <= 2;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="order-no">${r.order}</div>
        <div class="prod-cell" style="margin-top:8px">
          <div class="prod-thumb">${r.emoji}</div>
          <div><div class="prod-name">${r.prod}</div><div class="prod-sku">SKU: ${r.sku}</div></div>
        </div>
      </td>
      <td>
        <div class="buyer" style="margin-bottom:8px">Nama Pembeli: <b>${r.buyer}</b></div>
        <div class="rating-list">
          <div class="rating-line"><span class="rating-label">Keseluruhan</span>${stars(r.rating.all)}</div>
          <div class="rating-line"><span class="rating-label">Produk</span>${stars(r.rating.produk)}</div>
          <div class="rating-line"><span class="rating-label">Pelayanan Penjual</span>${stars(r.rating.penjual)}</div>
          <div class="rating-line"><span class="rating-label">Pelayanan Jasa Kirim</span>${stars(r.rating.kirim)}</div>
        </div>
      </td>
      <td><div class="review-content">${r.content}<div class="review-date">${r.date}</div></div></td>
      <td><span class="buyer">Daerah: <b>Indonesia</b><br>Toko: <b>infarm</b></span></td>
      <td>—</td>
      <td><span class="pill ${r.status}">${r.status === 'done' ? 'Sudah Dibalas' : 'Menunggu Diproses'}</span></td>
      <td>
        <div class="act-links">
          <button class="act-link" data-reply="${neg ? 'neg' : 'pos'}">Pesan Balasan${neg ? ' (AI)' : ''}</button>
          <button class="act-link">Penandaan ▾</button>
        </div>
      </td>`;
    body.appendChild(tr);
  });

  $('#reviewEmpty').hidden = rows.length > 0;
  $('#reviewTotal').textContent = rows.length;

  body.querySelectorAll('[data-reply]').forEach((b) => {
    b.addEventListener('click', () => {
      if (b.dataset.reply === 'neg') {
        toast('Balasan empati AI disiapkan (HANDOVER_TO_CS bila perlu kompensasi)');
      } else {
        toast('Balasan terima kasih AI disiapkan');
      }
    });
  });
}

// ---------- Data: Pengembalian Dana (refund) ----------
const REFUNDS = [
  { order: '2901338475610284', prod: 'INFARM - Furadan 3GR 1 Kg', jenis: 'Barang Rusak / Bocor', nominal: 'Rp 78.000', status: 'dana', s: 'refund', label: 'Pengembalian Dana' },
  { order: '2912047781200934', prod: 'INFARM - Paket Hidroponik 12 Lubang', jenis: 'Barang Tidak Sampai', nominal: 'Rp 165.000', status: 'dana', s: 'refund', label: 'Pengembalian Dana' },
  { order: '2920551984773310', prod: 'INFARM - POC Buah 250 ml', jenis: 'Salah Kirim', nominal: 'Rp 32.000', status: 'batal', s: 'cancel', label: 'Sudah Dibatalkan' },
];

// ---------- Data: Pesanan Dibatalkan ----------
// status: menunggu (perlu keputusan CS) | proses | batal
const CANCELS = [
  { order: '2933110298471552', prod: 'INFARM - Benih Melon Sunmelo', alasan: 'Pembeli berubah pikiran', nominal: 'Rp 24.000', status: 'menunggu' },
  { order: '2940872215098633', prod: 'INFARM - Planter Bag 50 Liter', alasan: 'Salah pilih varian', nominal: 'Rp 45.000', status: 'menunggu' },
  { order: '2951200938471002', prod: 'INFARM - Sekop Taman Besi', alasan: 'Ingin ganti alamat kirim', nominal: 'Rp 19.000', status: 'menunggu' },
  { order: '2962887120554390', prod: 'INFARM - POC Buah 250 ml', alasan: 'Pengiriman terlalu lama', nominal: 'Rp 32.000', status: 'menunggu' },
  { order: '2974102938120017', prod: 'INFARM - Paket Hidroponik 12 Lubang', alasan: 'Pembeli minta batal', nominal: 'Rp 165.000', status: 'menunggu' },
  { order: '2988120394857201', prod: 'INFARM - Polybag 35x35 isi 30', alasan: 'Stok kosong di gudang', nominal: 'Rp 28.000', status: 'menunggu' },
  { order: '2901338475610284', prod: 'INFARM - Furadan 3GR 1 Kg', alasan: 'Sudah dikirim ulang', nominal: 'Rp 78.000', status: 'proses' },
  { order: '2911200948571123', prod: 'INFARM - Benih Cabai Micha', alasan: 'Pembeli berubah pikiran', nominal: 'Rp 16.000', status: 'batal' },
];

const CANCEL_STATUS = {
  menunggu: { s: 'wait',   label: 'Menunggu Diproses' },
  proses:   { s: 'done',   label: 'Sudah Diproses' },
  batal:    { s: 'cancel', label: 'Sudah Dibatalkan' },
};
// Hitungan chip (gaya dashboard); menunggu mengikuti data nyata.
const cancelCount = { all: 91, menunggu: 6, proses: 12, batal: 79 };
let cancelStatus = 'all';

function renderRefunds(status = 'all') {
  const rows = REFUNDS.filter((r) => status === 'all' || r.status === status);
  const body = $('#refundBody');
  body.innerHTML = rows.map((r) => `
    <tr>
      <td><span class="order-no">${r.order}</span></td>
      <td><div class="prod-name">${r.prod}</div></td>
      <td>${r.jenis}</td>
      <td>${r.nominal}</td>
      <td><span class="pill ${r.s}">${r.label}</span></td>
      <td><span class="tag tag-handover">HANDOVER_TO_CS</span></td>
      <td><button class="act-link">Detail</button></td>
    </tr>`).join('');
  $('#refundEmpty').hidden = rows.length > 0;
  $('#refundTotal').textContent = rows.length;
}

function renderCancels(status = cancelStatus) {
  cancelStatus = status;
  const rows = CANCELS.filter((r) => status === 'all' || r.status === status);
  const body = $('#cancelBody');
  body.innerHTML = rows.map((r) => {
    const pending = r.status === 'menunggu';
    const meta = CANCEL_STATUS[r.status];
    const label = r.note || meta.label;
    const cls = r.note ? 'cont' : meta.s;
    const check = pending ? `<input type="checkbox" class="row-check" data-order="${r.order}" />` : '';
    const actions = pending
      ? `<div class="row-actions">
           <button class="mini-approve" data-approve="${r.order}">✓ Setujui (Batalkan)</button>
           <button class="mini-reject" data-reject="${r.order}">✕ Tolak (Lanjutkan)</button>
         </div>`
      : `<button class="act-link">Detail</button>`;
    return `<tr>
      <td class="col-check">${check}</td>
      <td><span class="order-no">${r.order}</span></td>
      <td><div class="prod-name">${r.prod}</div></td>
      <td>${r.alasan}</td>
      <td>${r.nominal}</td>
      <td><span class="pill ${cls}">${label}</span></td>
      <td><span class="tag tag-order">CHECK_ORDER_SYSTEM</span></td>
      <td>${actions}</td>
    </tr>`;
  }).join('');
  $('#cancelEmpty').hidden = rows.length > 0;
  $('#cancelTotal').textContent = rows.length;

  // listener checkbox & aksi per-baris
  body.querySelectorAll('.row-check').forEach((c) => c.addEventListener('change', updateBulkCount));
  body.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', () => decide([b.dataset.approve], 'batal')));
  body.querySelectorAll('[data-reject]').forEach((b) => b.addEventListener('click', () => decide([b.dataset.reject], 'lanjut')));

  if ($('#cancelAll')) $('#cancelAll').checked = false;
  updateBulkCount();
}

// Hitung checkbox terpilih → update label & status tombol
function updateBulkCount() {
  const checked = document.querySelectorAll('#cancelBody .row-check:checked').length;
  if ($('#bulkCount')) $('#bulkCount').textContent = `${checked} dipilih`;
  if ($('#bulkApprove')) $('#bulkApprove').disabled = checked === 0;
  if ($('#bulkReject')) $('#bulkReject').disabled = checked === 0;
}

// Terapkan keputusan: 'batal' (setuju → dibatalkan) / 'lanjut' (tolak → dilanjutkan)
function decide(orders, decision) {
  let n = 0;
  orders.forEach((ordNo) => {
    const r = CANCELS.find((x) => x.order === ordNo && x.status === 'menunggu');
    if (!r) return;
    n++;
    cancelCount.menunggu = Math.max(0, cancelCount.menunggu - 1);
    if (decision === 'batal') { r.status = 'batal'; r.note = null; cancelCount.batal++; }
    else { r.status = 'proses'; r.note = 'Pesanan Dilanjutkan'; cancelCount.proses++; }
  });
  if (!n) return;
  updateCancelChips();
  renderCancels();
  toast(decision === 'batal'
    ? `${n} pesanan disetujui — dibatalkan`
    : `${n} pesanan ditolak — pesanan dilanjutkan`);
}

function updateCancelChips() {
  document.querySelectorAll('[data-group="cancel"] .chip').forEach((c) => {
    const k = c.dataset.status;
    const b = c.querySelector('b');
    if (b && cancelCount[k] != null) b.textContent = cancelCount[k];
  });
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
  renderReviews();
  renderRefunds();
  renderCancels();

  // Sub-tab switching
  document.querySelectorAll('.subtab[data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.subtab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      $('#panel-' + tab.dataset.tab).classList.add('active');
    });
  });

  // Filter bintang
  document.querySelectorAll('#starTabs .chip').forEach((c) => {
    c.addEventListener('click', () => {
      document.querySelectorAll('#starTabs .chip').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
      renderReviews();
    });
  });
  $('#negOnly').addEventListener('change', renderReviews);

  // Filter status refund
  document.querySelectorAll('[data-group="refund"] .chip').forEach((c) => {
    c.addEventListener('click', () => {
      document.querySelectorAll('[data-group="refund"] .chip').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
      renderRefunds(c.dataset.status);
    });
  });

  // Filter status cancel
  document.querySelectorAll('[data-group="cancel"] .chip').forEach((c) => {
    c.addEventListener('click', () => {
      document.querySelectorAll('[data-group="cancel"] .chip').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
      renderCancels(c.dataset.status);
    });
  });

  // Pilih semua (hanya baris pending yang punya checkbox)
  $('#cancelAll').addEventListener('change', (e) => {
    document.querySelectorAll('#cancelBody .row-check').forEach((c) => (c.checked = e.target.checked));
    updateBulkCount();
  });

  // Aksi massal: setuju (batalkan) / tolak (lanjutkan)
  function bulkDecide(decision) {
    const orders = [...document.querySelectorAll('#cancelBody .row-check:checked')].map((c) => c.dataset.order);
    if (!orders.length) { toast('Pilih pesanan dulu, Kak'); return; }
    decide(orders, decision);
  }
  $('#bulkApprove').addEventListener('click', () => bulkDecide('batal'));
  $('#bulkReject').addEventListener('click', () => bulkDecide('lanjut'));

  // Platform tabs (visual saja)
  document.querySelectorAll('.platform-tabs').forEach((grp) => {
    grp.querySelectorAll('.pt').forEach((p) => {
      p.addEventListener('click', () => {
        grp.querySelectorAll('.pt').forEach((x) => x.classList.remove('active'));
        p.classList.add('active');
      });
    });
  });

  // Tombol biru sinkronisasi
  document.querySelectorAll('.btn-blue').forEach((b) => b.addEventListener('click', () => toast('Sinkronisasi data dari marketplace…')));
  document.querySelectorAll('.btn-ghost.sm').forEach((b) => b.addEventListener('click', () => toast('Menyiapkan ekspor data…')));
});
