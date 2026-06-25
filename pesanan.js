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
const CANCELS = [
  { order: '2933110298471552', prod: 'INFARM - Benih Melon Sunmelo', alasan: 'Pembeli berubah pikiran', nominal: 'Rp 24.000', status: 'proses', s: 'done', label: 'Sudah Diproses' },
  { order: '2940872215098633', prod: 'INFARM - Planter Bag 50 Liter', alasan: 'Stok kosong', nominal: 'Rp 45.000', status: 'proses', s: 'done', label: 'Sudah Diproses' },
  { order: '2951200938471002', prod: 'INFARM - Sekop Taman Besi', alasan: 'Resi tidak diinput', nominal: 'Rp 19.000', status: 'batal', s: 'cancel', label: 'Sudah Dibatalkan' },
];

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

function renderCancels(status = 'all') {
  const rows = CANCELS.filter((r) => status === 'all' || r.status === status);
  const body = $('#cancelBody');
  body.innerHTML = rows.map((r) => `
    <tr>
      <td><span class="order-no">${r.order}</span></td>
      <td><div class="prod-name">${r.prod}</div></td>
      <td>${r.alasan}</td>
      <td>${r.nominal}</td>
      <td><span class="pill ${r.s}">${r.label}</span></td>
      <td><span class="tag tag-order">CHECK_ORDER_SYSTEM</span></td>
      <td><button class="act-link">Detail</button></td>
    </tr>`).join('');
  $('#cancelEmpty').hidden = rows.length > 0;
  $('#cancelTotal').textContent = rows.length;
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
