/* ===========================================================
   Infarm CS — Halaman Statistik (analisa CS & konversi)
   Data mock per rentang waktu. Klasifikasi mengikuti claude.md.
   =========================================================== */

const $ = (s) => document.querySelector(s);

// Warna 4 klasifikasi aksi (claude.md)
const ACTION_COLORS = {
  AUTO_REPLY: '#16a34a',
  ASK_INFORMATION: '#f59e0b',
  CHECK_ORDER_SYSTEM: '#3b82f6',
  HANDOVER_TO_CS: '#ef4444',
};

// ---------- Dataset per rentang ----------
const DATA = {
  today: {
    kpi: { sesi: '128', auto: '76,6%', resp: '1m 04d', ho: '5,5%', konv: '9,4%', rev: 'Rp 1,9 jt' },
    trend: { up: ['+12%','+1,2%','-9s','-0,8%','+2,1%','+0,4 jt'] },
    actions: { AUTO_REPLY: 98, ASK_INFORMATION: 16, CHECK_ORDER_SYSTEM: 7, HANDOVER_TO_CS: 7 },
    bars: [{ d: '08:00', ai: 14, ho: 1 },{ d: '10:00', ai: 22, ho: 2 },{ d: '12:00', ai: 26, ho: 1 },{ d: '14:00', ai: 19, ho: 1 },{ d: '16:00', ai: 11, ho: 1 },{ d: '18:00', ai: 6, ho: 1 }],
    funnel: [{ l: 'Chat Masuk', n: 128 },{ l: 'Konsultasi Produk', n: 86 },{ l: 'Minat / Keranjang', n: 41 },{ l: 'Checkout', n: 18 },{ l: 'Dibayar', n: 12 }],
  },
  '7d': {
    kpi: { sesi: '892', auto: '75,8%', resp: '1m 12d', ho: '4,9%', konv: '8,7%', rev: 'Rp 12,4 jt' },
    trend: { up: ['+14,2%','+2,1%','-11s','-1,4%','+1,8%','+2,3 jt'] },
    actions: { AUTO_REPLY: 676, ASK_INFORMATION: 118, CHECK_ORDER_SYSTEM: 54, HANDOVER_TO_CS: 44 },
    bars: [{ d: '06-18', ai: 88, ho: 6 },{ d: '06-19', ai: 102, ho: 5 },{ d: '06-20', ai: 121, ho: 7 },{ d: '06-21', ai: 79, ho: 4 },{ d: '06-22', ai: 134, ho: 8 },{ d: '06-23', ai: 118, ho: 9 },{ d: '06-24', ai: 96, ho: 5 }],
    funnel: [{ l: 'Chat Masuk', n: 892 },{ l: 'Konsultasi Produk', n: 604 },{ l: 'Minat / Keranjang', n: 287 },{ l: 'Checkout', n: 118 },{ l: 'Dibayar', n: 78 }],
  },
  '30d': {
    kpi: { sesi: '3.840', auto: '74,2%', resp: '1m 22d', ho: '5,8%', konv: '8,1%', rev: 'Rp 52,6 jt' },
    trend: { up: ['+9,6%','+0,8%','-6s','-0,5%','+1,1%','+6,8 jt'] },
    actions: { AUTO_REPLY: 2850, ASK_INFORMATION: 520, CHECK_ORDER_SYSTEM: 248, HANDOVER_TO_CS: 222 },
    bars: [{ d: 'Mgg 1', ai: 720, ho: 44 },{ d: 'Mgg 2', ai: 845, ho: 52 },{ d: 'Mgg 3', ai: 910, ho: 61 },{ d: 'Mgg 4', ai: 880, ho: 58 }],
    funnel: [{ l: 'Chat Masuk', n: 3840 },{ l: 'Konsultasi Produk', n: 2510 },{ l: 'Minat / Keranjang', n: 1180 },{ l: 'Checkout', n: 470 },{ l: 'Dibayar', n: 312 }],
  },
};

const HANDOVER_REASONS = [
  { l: 'Refund / retur / batal', v: 38 },
  { l: 'Barang rusak / tidak sampai', v: 27 },
  { l: 'Komplain / pelanggan marah', v: 14 },
  { l: 'Minta bicara CS manusia', v: 12 },
  { l: 'Info tidak ditemukan di KB', v: 9 },
];

const TOP_PRODUCTS = [
  { l: 'POC Buah Infarm', v: 142 },
  { l: 'Benih Cabai Keriting', v: 118 },
  { l: 'Paket Hidroponik 12 Lubang', v: 96 },
  { l: 'Pupuk Magnesium Sulfat', v: 74 },
  { l: 'Polybag 30x30', v: 61 },
];

const MARKETPLACES = [
  { name: 'Shopee', logo: 'shp', c: 'S', sesi: 512, auto: '77,1%', ho: '4,2%', konv: '9,1%', rev: 'Rp 7,8 jt' },
  { name: 'TikTok Shop', logo: 'tt', c: 'T', sesi: 268, auto: '73,9%', ho: '5,6%', konv: '8,3%', rev: 'Rp 3,4 jt' },
  { name: 'Lazada', logo: 'lz', c: 'L', sesi: 112, auto: '72,4%', ho: '6,1%', konv: '7,2%', rev: 'Rp 1,2 jt' },
];

// ---------- Render ----------
let range = '7d';

function renderKPI() {
  const d = DATA[range];
  $('#kpiSesi').textContent = d.kpi.sesi;
  $('#kpiAuto').textContent = d.kpi.auto;
  $('#kpiResp').textContent = d.kpi.resp;
  $('#kpiHo').textContent = d.kpi.ho;
  $('#kpiKonv').textContent = d.kpi.konv;
  $('#kpiRev').textContent = d.kpi.rev;
  const t = d.trend.up;
  $('#kpiSesiT').textContent = '▲ ' + t[0] + ' vs periode lalu';
  $('#kpiAutoT').textContent = '▲ ' + t[1];
  $('#kpiRespT').textContent = '▼ ' + t[2] + ' (lebih cepat)';
  $('#kpiHoT').textContent = '▼ ' + t[3] + ' (lebih sedikit)';
  $('#kpiKonvT').textContent = '▲ ' + t[4];
  $('#kpiRevT').textContent = '▲ ' + t[5];
}

function renderDonut() {
  const a = DATA[range].actions;
  const total = Object.values(a).reduce((x, y) => x + y, 0);
  const order = ['AUTO_REPLY', 'ASK_INFORMATION', 'CHECK_ORDER_SYSTEM', 'HANDOVER_TO_CS'];
  let acc = 0;
  const segs = order.map((k) => {
    const start = (acc / total) * 100;
    acc += a[k];
    const end = (acc / total) * 100;
    return `${ACTION_COLORS[k]} ${start}% ${end}%`;
  });
  $('#donut').style.background = `conic-gradient(${segs.join(',')})`;
  $('#donutCenter').textContent = total.toLocaleString('id-ID');

  $('#donutLegend').innerHTML = order.map((k) => {
    const pct = ((a[k] / total) * 100).toFixed(1).replace('.', ',');
    return `<li><span class="ld" style="background:${ACTION_COLORS[k]}"></span>
      <span class="lname">${k}</span><b>${a[k].toLocaleString('id-ID')}</b>
      <span class="lpct">${pct}%</span></li>`;
  }).join('');
}

function renderTrend() {
  const b = DATA[range].bars;
  const max = Math.max(...b.map((x) => x.ai));
  $('#trendBars').innerHTML = b.map((x) =>
    `<div class="bar-group">
      <div class="bar c1" style="height:${(x.ai / max * 100).toFixed(0)}%" title="AI selesai: ${x.ai}"></div>
      <div class="bar c2" style="height:${(x.ho / max * 100).toFixed(0)}%" title="Handover: ${x.ho}"></div>
    </div>`).join('');
  $('#trendAxis').innerHTML = b.map((x) => `<span>${x.d}</span>`).join('');
}

function renderFunnel() {
  const f = DATA[range].funnel;
  const top = f[0].n;
  $('#salesFunnel').innerHTML = f.map((s, i) => {
    const pct = ((s.n / top) * 100).toFixed(1).replace('.', ',');
    return `<div class="sf-step">
      <div class="sf-label">${s.l}</div>
      <div class="sf-num">${s.n.toLocaleString('id-ID')}</div>
      <div class="sf-pct">${i === 0 ? '100%' : pct + '% dari chat'}</div>
    </div>`;
  }).join('');
}

function renderHBars(el, data, alt = false) {
  const max = Math.max(...data.map((d) => d.v));
  el.innerHTML = data.map((d) =>
    `<div class="hbar-row">
      <span class="hbar-label">${d.l}</span>
      <div class="hbar-track"><div class="hbar-fill ${alt ? 'alt' : ''}" style="width:${(d.v / max * 100).toFixed(0)}%"></div></div>
      <span class="hbar-val">${d.v}</span>
    </div>`).join('');
}

function renderMarketplace() {
  $('#mpBody').innerHTML = MARKETPLACES.map((m) =>
    `<tr>
      <td><span class="mp-name"><span class="mp-logo ${m.logo}">${m.c}</span>${m.name}</span></td>
      <td>${m.sesi}</td><td>${m.auto}</td><td>${m.ho}</td><td>${m.konv}</td><td>${m.rev}</td>
    </tr>`).join('');
}

function renderAll() {
  renderKPI();
  renderDonut();
  renderTrend();
  renderFunnel();
  renderHBars($('#hoReasons'), HANDOVER_REASONS, true);
  renderHBars($('#topProducts'), TOP_PRODUCTS, false);
  renderMarketplace();
}

document.addEventListener('DOMContentLoaded', () => {
  renderAll();
  document.querySelectorAll('#rangeTabs .dt').forEach((t) => {
    t.addEventListener('click', () => {
      document.querySelectorAll('#rangeTabs .dt').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      range = t.dataset.range;
      renderAll();
    });
  });
});
