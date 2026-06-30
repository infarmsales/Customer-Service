/* ===========================================================
   Infarm CS — Dashboard interaktivitas
   Data percakapan + klasifikasi aksi mengikuti claude.md
   (AUTO_REPLY / ASK_INFORMATION / HANDOVER_TO_CS / CHECK_ORDER_SYSTEM)
   =========================================================== */

// --- Peta klasifikasi → tampilan label ---
const ACTIONS = {
  AUTO_REPLY:         { tag: 'AUTO',  cls: 'tag-auto',     conf: 'Sumber: Knowledge Base · keyakinan tinggi' },
  ASK_INFORMATION:    { tag: 'TANYA', cls: 'tag-ask',      conf: 'Butuh info tambahan sebelum menjawab' },
  HANDOVER_TO_CS:     { tag: 'CS',    cls: 'tag-handover', conf: 'Perlu ditangani CS manusia' },
  CHECK_ORDER_SYSTEM: { tag: 'ORDER', cls: 'tag-order',    conf: 'Perlu cek data sistem pesanan' },
};

// --- Data percakapan (mock; nantinya dari API backend) ---
const CONVERSATIONS = [
  {
    id: 'diky', name: 'dikymarzuki', initials: 'DM', time: '14:06', unread: false,
    shop: 'infarmofficialshop · Shopee', chatCount: 61,
    snippet: 'Halo kak, apa ada yang bisa mimin bantu?',
    action: 'AUTO_REPLY',
    messages: [
      { side: 'in', time: '06/24 14:06', html: 'Halo kak, untuk pesanan yang sudah dibayar:<br>- Checkout sebelum pukul 10:00 dikirim di hari yang sama.<br>- Checkout setelah pukul 10:00 dikirim di hari kerja selanjutnya.<br><br>Harap ditunggu balasan minfarm ya 🙏' },
      { side: 'out', time: '06/24 14:06', html: 'Halo kak, apa ada yang bisa mimin bantu? 😊🙏' },
    ],
    suggestion: 'Bisa, Kak. Untuk POC Buah Infarm, dosis resminya 2 ml per 1 liter air, diberikan seminggu sekali saat tanaman memasuki fase berbunga atau berbuah. Hindari menambah dosis agar tanaman tidak kelebihan nutrisi ya, Kak.',
    handover: { Platform: 'Shopee', Kategori: 'Konsultasi Produk', 'Inti Masalah': 'Tanya dosis POC Buah', Urgensi: 'Normal' },
    prodQuery: 'POC Buah', orderNo: '584590031216740091', resi: 'JX1234567890',
  },
  {
    id: 'rahma', name: 'rahmawati_id', initials: 'RW', time: '14:02', unread: false,
    shop: 'infarmofficialshop · Shopee', chatCount: 12,
    snippet: 'Dosis POC Buah buat tomat berapa ya kak?',
    action: 'AUTO_REPLY',
    messages: [
      { side: 'out', time: '06/24 14:01', html: 'Halo Kak, ada yang bisa minfarm bantu? 😊' },
      { side: 'in', time: '06/24 14:02', html: 'Dosis POC Buah buat tomat berapa ya kak?' },
    ],
    suggestion: 'Untuk tomat, POC Buah Infarm dipakai 2 ml per 1 liter air ya, Kak, disiram seminggu sekali saat fase berbunga dan berbuah. Jangan dilebihkan dosisnya supaya tanaman tidak kelebihan nutrisi.',
    handover: { Platform: 'Shopee', Kategori: 'Konsultasi Produk', 'Inti Masalah': 'Dosis POC Buah untuk tomat', Urgensi: 'Normal' },
    prodQuery: 'tomat', orderNo: '240611AB12', resi: 'JNE998877',
  },
  {
    id: 'budi', name: 'budi.santoso', initials: 'BS', time: '13:58', unread: true,
    shop: 'infarm · Shopee', chatCount: 4,
    snippet: 'Paket saya belum sampai padahal sudah 7 hari…',
    action: 'HANDOVER_TO_CS',
    messages: [
      { side: 'in', time: '06/24 13:57', html: 'Min, paket saya belum sampai padahal sudah 7 hari 😡' },
      { side: 'in', time: '06/24 13:58', html: 'No pesanan 240617XXXX. Tolong dicek dong' },
    ],
    suggestion: 'Maaf atas kendalanya, Kak 🙏 Karena ini berkaitan dengan pesanan yang belum diterima, kasusnya perlu diperiksa langsung oleh tim CS kami. Saya bantu teruskan beserta ringkasan informasinya ya, Kak.',
    handover: { Platform: 'Shopee', Kategori: 'Komplain Pengiriman', 'Inti Masalah': 'Paket belum sampai > 7 hari', Urgensi: 'Tinggi' },
    order: { id: '240617XXXX', status: 'Dalam pengiriman', courier: 'belum update 2 hari' },
    prodQuery: 'Furadan', orderNo: '240617XXXX', resi: 'JNT112233445',
  },
  {
    id: 'nadia', name: 'nadia.afifah', initials: 'NA', time: '13:51', unread: true,
    shop: 'Infarm Official · TikTok Shop', chatCount: 8,
    snippet: 'Daun cabai saya menguning, kenapa ya?',
    action: 'ASK_INFORMATION',
    messages: [
      { side: 'in', time: '06/24 13:51', html: 'Kak daun cabai saya menguning, kenapa ya? Apa harus beli pupuk?' },
    ],
    suggestion: 'Boleh kirim foto tanamannya, Kak? Yang keseluruhan dan bagian bawah daunnya sekalian. Sekalian info juga produk serta dosis yang terakhir dipakai dan frekuensi penyiramannya, supaya penyebab daun menguning bisa diperiksa lebih tepat.',
    handover: { Platform: 'TikTok Shop', Kategori: 'Konsultasi Tanaman', 'Inti Masalah': 'Daun cabai menguning, data belum lengkap', Urgensi: 'Normal' },
    prodQuery: 'cabai', orderNo: '240609TT88', resi: 'SPX556677',
  },
  {
    id: 'yoga', name: 'yoga.pratama', initials: 'YP', time: '13:40', unread: false,
    shop: 'Infarm Jakarta · TikTok Shop', chatCount: 3,
    snippet: 'Resi pesanan saya sudah update belum kak?',
    action: 'CHECK_ORDER_SYSTEM',
    messages: [
      { side: 'in', time: '06/24 13:40', html: 'Kak resi pesanan saya sudah update belum ya? Order 240620YYYY' },
    ],
    suggestion: 'Saya cek dulu status pesanannya ya, Kak. Sebentar… (sistem akan mengambil data resi untuk order 240620YYYY sebelum membalas).',
    handover: { Platform: 'TikTok Shop', Kategori: 'Status Pesanan', 'Inti Masalah': 'Minta update resi', Urgensi: 'Normal' },
    order: { id: '240620YYYY', status: 'Menunggu data sistem', courier: '—' },
    prodQuery: 'melon', orderNo: '240620YYYY', resi: 'JNE220620X',
  },
  {
    id: 'sari', name: 'sari.lestari', initials: 'SL', time: '13:22', unread: false,
    shop: 'infarmofficialshop · Shopee', chatCount: 19,
    snippet: 'Benih melon ini cocok ditanam di pot gak?',
    action: 'AUTO_REPLY',
    messages: [
      { side: 'in', time: '06/24 13:22', html: 'Benih melon ini cocok ditanam di pot gak kak?' },
    ],
    suggestion: 'Cocok, Kak. Benih melon Infarm bisa ditanam di pot/planter bag ukuran minimal 25–40 liter supaya akarnya leluasa, ditempatkan di lokasi yang kena sinar matahari penuh. Pastikan media tanamnya subur dan drainase lancar ya, Kak.',
    handover: { Platform: 'Shopee', Kategori: 'Konsultasi Produk', 'Inti Masalah': 'Tanya tanam melon di pot', Urgensi: 'Normal' },
    prodQuery: 'melon', orderNo: '240605SP01', resi: 'SPX889900',
  },
];

// ===================== Pencarian top bar (scope + massal) =====================
const SCOPE_LABEL = {
  nama: 'nama pembeli', pesanan: 'nomor pesanan', resi: 'nomor resi',
  chat: 'isi chat', produk: 'nama produk',
};
let searchField = 'nama';   // dari dropdown #searchScope
let searchSingle = '';      // ketik biasa
let searchTerms = [];       // hasil pencarian massal

function fieldValue(c, field) {
  switch (field) {
    case 'pesanan': return c.orderNo || '';
    case 'resi': return c.resi || '';
    case 'chat': return c.messages.map((m) => m.html).join(' ') + ' ' + c.snippet;
    case 'produk': return c.prodQuery || '';
    default: return c.name || '';
  }
}

// ===================== Katalog produk (products.json) =====================
// Sample bawaan dipakai bila products.json tidak bisa dimuat (mis. dibuka via file://).
// Saat dijalankan lewat backend (localhost:3000), katalog penuh 373 SKU akan dimuat.
const PRODUCT_FALLBACK = [
  { sku: 'POC-BUAH-250', nama_produk: 'INFARM - POC Buah 250 ml Pupuk Organik Cair untuk Fase Berbunga & Berbuah', kategori: 'Nutrisi Tanaman', product_ids_shopee: ['—'] },
  { sku: 'NT-FURADAN-1KG', nama_produk: 'INFARM - Furadan 3GR Ukuran 1 Kg Insektisida & Nematisida', kategori: 'Pestisida', product_ids_shopee: ['—'] },
  { sku: 'NT-MAGNESIUM-1KG', nama_produk: 'INFARM - Pupuk Magnesium Sulfat 1 Kg (MgSO4) Garam Inggris', kategori: 'Nutrisi Tanaman', product_ids_shopee: ['—'] },
  { sku: 'BCA-CMK-MICHA', nama_produk: 'INFARM - Benih Cabai Keriting Micha Hibrida Bibit Cabe Pedas', kategori: 'Benih', product_ids_shopee: ['42423482548'] },
  { sku: 'BCA-CMB-BONCHA', nama_produk: 'INFARM - Benih Cabai Merah Besar Boncha Bibit Cabe Premium', kategori: 'Benih', product_ids_shopee: ['42209555488'] },
  { sku: 'BCA-TMT-BIGMATO', nama_produk: 'INFARM - Benih Tomat Big Mato Hibrida Bibit Tomat Besar', kategori: 'Benih', product_ids_shopee: ['43430183907'] },
  { sku: 'BCA-MLN-SUNMELO', nama_produk: 'INFARM - Benih Buah Melon Sunmelo Hibrida Bibit Melon Premium', kategori: 'Benih', product_ids_shopee: ['41380201898'] },
  { sku: 'PKT-HIDRO-12LT', nama_produk: 'INFARM - Paket Hidroponik Lengkap 12 Lubang Free Benih AB Mix Rockwool', kategori: 'Hidroponik', product_ids_shopee: ['23126882937'] },
  { sku: '30BAG-POLYH-3535', nama_produk: 'INFARM - Polybag Premium Ukuran 35x35 isi 30 Pcs Tebal Tidak Mudah Sobek', kategori: 'Pot & Polybag', product_ids_shopee: ['20312574687'] },
  { sku: 'BAG-PLANTER', nama_produk: 'INFARM - Planter Bag 25 35 50 75 Liter Pot Tanaman Kain Tebal Premium', kategori: 'Pot & Polybag', product_ids_shopee: ['25188238958'] },
];

let PRODUCTS = [];
let productsLoaded = false;

async function loadProducts() {
  try {
    const r = await fetch('products.json');
    if (!r.ok) throw new Error('not ok');
    const data = await r.json();
    const flat = [];
    const cats = data.produk_per_kategori || {};
    for (const [kategori, items] of Object.entries(cats)) {
      items.forEach((p) => flat.push({ ...p, kategori }));
    }
    PRODUCTS = flat;
    productsLoaded = true;
  } catch (_) {
    PRODUCTS = PRODUCT_FALLBACK; // fallback offline
    productsLoaded = false;
  }
}

function renderProducts(query) {
  const q = (query || '').trim().toLowerCase();
  const matches = PRODUCTS.filter((p) =>
    !q || p.nama_produk.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
  ).slice(0, 20);

  $('#prodList').innerHTML = matches.map((p) => {
    const sid = (p.product_ids_shopee && p.product_ids_shopee[0]) ? String(p.product_ids_shopee[0]).replace('.0', '') : '—';
    return `<div class="prod-card">
      <div class="pc-thumb">🌱</div>
      <div class="pc-body">
        <div class="pc-name">${p.nama_produk}</div>
        <div class="pc-meta"><span class="pc-sku">${p.sku}</span><span>${p.kategori || ''}</span><span>Shopee ID: ${sid}</span></div>
      </div>
    </div>`;
  }).join('') || '<div class="prod-note">Produk tidak ditemukan. Coba kata kunci lain.</div>';

  const total = productsLoaded ? `${PRODUCTS.length} SKU termuat dari products.json` :
    `Mode contoh (${PRODUCTS.length} SKU). Katalog penuh termuat saat dibuka via backend (localhost:3000).`;
  $('#prodContext').innerHTML = `Menampilkan <b>${matches.length}</b> hasil · ${total}`;
}

// ===================== Helper render =====================
const $ = (sel) => document.querySelector(sel);
let activeId = CONVERSATIONS[0].id;

function renderConvList(filter = 'all', search = '') {
  const list = $('#convList');
  const q = search.trim().toLowerCase();
  list.innerHTML = '';
  CONVERSATIONS
    .filter((c) => {
      if (filter === 'unread' && !c.unread) return false;
      if (filter === 'cs' && c.action !== 'HANDOVER_TO_CS') return false;
      if (q && !(c.name.toLowerCase().includes(q) || c.snippet.toLowerCase().includes(q))) return false;
      // Pencarian top bar (berdasarkan field terpilih)
      if (searchTerms.length) {
        const v = fieldValue(c, searchField).toLowerCase();
        if (!searchTerms.some((t) => v.includes(t))) return false;
      } else if (searchSingle) {
        if (!fieldValue(c, searchField).toLowerCase().includes(searchSingle)) return false;
      }
      return true;
    })
    .forEach((c) => {
      const a = ACTIONS[c.action];
      const li = document.createElement('li');
      li.className = 'conv-item' + (c.id === activeId ? ' active' : '') + (c.unread ? ' unread' : '');
      li.dataset.id = c.id;
      li.innerHTML = `
        <span class="avatar">${c.initials}</span>
        <div class="conv-body">
          <div class="conv-row"><span class="conv-name">${c.name}</span><span class="conv-time">${c.time}</span></div>
          <div class="conv-row"><span class="conv-snippet">${c.snippet}</span><span class="tag ${a.cls}">${a.tag}</span></div>
        </div>`;
      li.addEventListener('click', () => selectConversation(c.id));
      list.appendChild(li);
    });
}

function selectConversation(id) {
  const c = CONVERSATIONS.find((x) => x.id === id);
  if (!c) return;
  activeId = id;
  c.unread = false;

  // Header
  $('#chatAvatar').textContent = c.initials;
  $('#chatCust').textContent = c.name;
  $('#chatMeta').textContent = c.shop;
  $('#chatCount').textContent = c.chatCount;

  // Stream
  const stream = $('#chatStream');
  stream.innerHTML = '<div class="day-divider"><span>24 Juni 2026</span></div>';
  c.messages.forEach((m) => {
    const div = document.createElement('div');
    div.className = 'msg ' + m.side;
    div.innerHTML = `<div class="bubble">${m.html}</div><span class="msg-time">${m.time}</span>`;
    stream.appendChild(div);
  });
  stream.scrollTop = stream.scrollHeight;

  // AI assist
  const a = ACTIONS[c.action];
  const aiTag = $('#aiTag');
  aiTag.textContent = c.action;
  aiTag.className = 'tag ' + a.cls;
  $('#aiConf').textContent = a.conf;
  $('#aiSuggestion').textContent = c.suggestion;

  // Info panel
  $('#infoAvatar').textContent = c.initials;
  $('#infoName').textContent = c.name;
  $('#infoSub').innerHTML = c.shop.split(' · ')[0] + ' <span class="flag">ID</span>';

  // Pesanan
  const infoOrder = $('#infoOrder');
  if (c.order) {
    infoOrder.innerHTML = `
      <div style="align-self:stretch;border:1px solid var(--border);border-radius:14px;padding:14px;text-align:left">
        <div style="font-weight:700;margin-bottom:8px">Pesanan #${c.order.id}</div>
        <div style="display:flex;justify-content:space-between;font-size:.82rem;padding:4px 0"><span style="color:var(--muted)">Status</span><b>${c.order.status}</b></div>
        <div style="display:flex;justify-content:space-between;font-size:.82rem;padding:4px 0"><span style="color:var(--muted)">Kurir</span><b>${c.order.courier}</b></div>
      </div>`;
  } else {
    infoOrder.innerHTML = '<div class="empty-ill">📦</div><p>Tidak Ada Pesanan dalam 1 Bulan Terakhir</p>';
  }

  // Ringkasan handover
  const hl = $('#handoverList');
  hl.innerHTML = '';
  Object.entries(c.handover).forEach(([k, v]) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${k}</span><b>${v}</b>`;
    hl.appendChild(li);
  });
  const liAct = document.createElement('li');
  liAct.innerHTML = `<span>Tindakan AI</span><b class="tag ${a.cls}">${c.action}</b>`;
  hl.appendChild(liAct);

  renderConvList(currentFilter, $('#convSearch').value);
  updateChatBadge();

  // Rincian Produk: tampilkan produk relevan dengan konteks chat ini
  const ps = $('#prodSearch');
  if (ps) { ps.value = c.prodQuery || ''; renderProducts(c.prodQuery || ''); }
}

// Perbarui badge ikon 💬 = jumlah percakapan belum dibaca.
// (window.updateRailBadge disediakan oleh rail.js)
function updateChatBadge() {
  const unread = CONVERSATIONS.filter((c) => c.unread).length;
  if (window.updateRailBadge) window.updateRailBadge(unread);
}

// ===================== Composer =====================
function setComposer(text, focus = false) {
  const input = $('#composerInput');
  input.value = text;
  updateCharCount();
  if (focus) { input.focus(); input.setSelectionRange(text.length, text.length); }
}
function updateCharCount() {
  const input = $('#composerInput');
  $('#charCount').textContent = `${input.value.length}/600`;
}

// ===================== Koneksi backend Claude API =====================
// Memanggil POST /api/chat (server.js). Jika backend mati → pakai saran mock.
async function askClaude() {
  const c = CONVERSATIONS.find((x) => x.id === activeId);
  // ambil pesan masuk terakhir dari pelanggan sebagai input
  const lastIn = [...c.messages].reverse().find((m) => m.side === 'in');
  const message = (lastIn ? lastIn.html : c.snippet).replace(/<[^>]+>/g, ' ').trim();

  toast('Meminta saran ke Claude…');
  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: [] }),
    });
    if (!resp.ok) throw new Error('backend ' + resp.status);
    const data = await resp.json();

    // perbarui panel AI Assist dengan hasil nyata dari Claude
    const a = ACTIONS[data.action] || ACTIONS.AUTO_REPLY;
    const aiTag = $('#aiTag');
    aiTag.textContent = data.action;
    aiTag.className = 'tag ' + a.cls;
    $('#aiConf').textContent = a.conf + (data.usage ? ` · ${data.usage.output_tokens} token` : '');
    $('#aiSuggestion').textContent = data.reply;
    setComposer(data.reply, true);
    toast('Saran dari Claude siap ✨');
  } catch (err) {
    // Fallback: backend belum jalan → gunakan saran contoh
    setComposer($('#aiSuggestion').textContent, true);
    toast('Backend belum aktif — pakai saran contoh');
  }
}

// ===================== Toast =====================
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

// ===================== Modal Integrasi Toko =====================
const WEBHOOKS = {
  'Shopee': 'https://cs.infarm.id/api/webhook/shopee',
  'TikTok Shop': 'https://cs.infarm.id/api/webhook/tiktok',
  'Lazada': 'https://cs.infarm.id/api/webhook/lazada',
};
function openModal() {
  $('#integrateModal').hidden = false;
  $('#integrateForm').hidden = false;
  $('#modalSuccess').hidden = true;
  $('#integrateForm').reset();
  $('#webhookUrl').value = WEBHOOKS['Shopee'];
}
function closeModal() { $('#integrateModal').hidden = true; }

// ===================== Wiring =====================
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  await loadProducts();
  renderConvList();
  selectConversation(activeId);

  // Tab panel kanan: Pesanan / Rincian Produk / Voucher
  document.querySelectorAll('.info-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.info-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.info-pane').forEach((p) => (p.hidden = true));
      $('#pane-' + tab.dataset.itab).hidden = false;
    });
  });

  // Pencarian produk (katalog products.json)
  $('#prodSearch').addEventListener('input', (e) => renderProducts(e.target.value));

  // Tabs filter
  document.querySelectorAll('.conv-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.conv-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      renderConvList(currentFilter, $('#convSearch').value);
    });
  });

  // Search percakapan (panel)
  $('#convSearch').addEventListener('input', (e) => renderConvList(currentFilter, e.target.value));

  // ===== Pencarian top bar: scope + ketik + double-click (massal) =====
  const topSearch = $('#topSearch');
  const scopeSel = $('#searchScope');

  function applyTop() {
    searchSingle = topSearch.value.trim().toLowerCase();
    searchTerms = [];
    renderConvList(currentFilter, $('#convSearch').value);
  }

  scopeSel.addEventListener('change', () => {
    searchField = scopeSel.value;
    searchTerms = [];
    const isMassal = searchField === 'pesanan' || searchField === 'resi';
    topSearch.placeholder = isMassal
      ? `Cari ${SCOPE_LABEL[searchField]} — klik 2× untuk pencarian massal…`
      : `Cari ${SCOPE_LABEL[searchField]}…`;
    applyTop();
  });

  topSearch.addEventListener('input', applyTop);

  // Double-click → buka pencarian massal (hanya untuk Nomor Pesanan / Resi)
  topSearch.addEventListener('dblclick', () => {
    if (searchField === 'pesanan' || searchField === 'resi') openMassModal();
  });

  // ===== Modal pencarian massal =====
  function openMassModal() {
    const isPesanan = searchField === 'pesanan';
    $('#massTitle').textContent = isPesanan
      ? 'Pencarian Massal — Nomor Pesanan'
      : 'Pencarian Massal — Nomor Resi';
    $('#massDesc').textContent = `Tempel beberapa ${isPesanan ? 'nomor pesanan' : 'nomor resi'} — satu per baris atau dipisah koma — untuk mencari banyak sekaligus (maks. 50).`;
    $('#massInput').value = '';
    $('#massModal').hidden = false;
    $('#massInput').focus();
  }
  function closeMassModal() { $('#massModal').hidden = true; }

  function doMassSearch() {
    const raw = $('#massInput').value.split(/[\n,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const terms = [...new Set(raw)].slice(0, 50);
    if (!terms.length) { toast('Tempel minimal satu nomor dulu, Kak'); return; }
    searchTerms = terms;
    searchSingle = '';
    // reset filter tab supaya hasil massal tampil semua
    currentFilter = 'all';
    document.querySelectorAll('.conv-tab').forEach((t) => t.classList.toggle('active', t.dataset.filter === 'all'));
    renderConvList('all', '');
    const found = CONVERSATIONS.filter((c) => {
      const v = fieldValue(c, searchField).toLowerCase();
      return terms.some((t) => v.includes(t));
    }).length;
    topSearch.value = `${terms.length} ${searchField === 'pesanan' ? 'no. pesanan' : 'resi'} dicari`;
    closeMassModal();
    toast(`Ditemukan ${found} percakapan dari ${terms.length} nomor`);
  }

  $('#massSearch').addEventListener('click', doMassSearch);
  $('#massClose').addEventListener('click', closeMassModal);
  $('#massCancel').addEventListener('click', closeMassModal);
  $('#massModal').addEventListener('click', (e) => { if (e.target.id === 'massModal') closeMassModal(); });

  // Klik toko → set active
  document.querySelectorAll('.shop-item').forEach((s) => {
    s.addEventListener('click', () => {
      document.querySelectorAll('.shop-item').forEach((x) => x.classList.remove('active'));
      s.classList.add('active');
    });
  });

  // AI Assist
  $('#aiUse').addEventListener('click', () => {
    setComposer($('#aiSuggestion').textContent);
    toast('Balasan AI dimasukkan ke kotak ketik');
  });
  $('#aiEdit').addEventListener('click', () => {
    setComposer($('#aiSuggestion').textContent, true);
    toast('Silakan edit balasan sebelum dikirim');
  });
  $('#aiHo').addEventListener('click', () => {
    toast('Percakapan dialihkan ke CS manusia + ringkasan terkirim');
  });
  $('#aiRegen').addEventListener('click', askClaude);

  // Composer
  $('#composerInput').addEventListener('input', updateCharCount);
  $('#sendBtn').addEventListener('click', () => {
    const input = $('#composerInput');
    const text = input.value.trim();
    if (!text) { toast('Tulis pesan dulu, Kak'); return; }
    const c = CONVERSATIONS.find((x) => x.id === activeId);
    c.messages.push({ side: 'out', time: '06/24 14:08', html: text.replace(/\n/g, '<br>') });
    selectConversation(activeId);
    setComposer('');
    toast('Pesan terkirim');
  });
  // Enter untuk kirim, Shift+Enter baris baru
  $('#composerInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#sendBtn').click(); }
  });

  // Modal open/close
  document.querySelectorAll('[data-open-modal]').forEach((b) => b.addEventListener('click', openModal));
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalCancel').addEventListener('click', closeModal);
  $('#integrateModal').addEventListener('click', (e) => { if (e.target.id === 'integrateModal') closeModal(); });

  // Ganti webhook saat platform berubah
  document.querySelectorAll('input[name="platform"]').forEach((r) => {
    r.addEventListener('change', () => { $('#webhookUrl').value = WEBHOOKS[r.value]; });
  });

  // Salin webhook
  $('#copyWebhook').addEventListener('click', () => {
    const url = $('#webhookUrl').value;
    navigator.clipboard?.writeText(url);
    toast('Webhook URL disalin');
  });

  // Submit integrasi
  $('#integrateForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const platform = data.get('platform');
    const shopName = data.get('shopName');
    $('#integrateForm').hidden = true;
    $('#successText').textContent = `Toko "${shopName}" (${platform}) berhasil dihubungkan!`;
    $('#modalSuccess').hidden = false;

    // Tambahkan ke daftar toko
    const logoCls = platform === 'Shopee' ? 'shp' : platform === 'TikTok Shop' ? 'tt' : 'lz';
    const logoChar = platform === 'Shopee' ? 'S' : platform === 'TikTok Shop' ? 'T' : 'L';
    const li = document.createElement('li');
    li.className = 'shop-item';
    li.innerHTML = `<span class="shop-logo ${logoCls}">${logoChar}</span><span class="shop-name">${shopName}</span><span class="status online"></span>`;
    li.addEventListener('click', () => {
      document.querySelectorAll('.shop-item').forEach((x) => x.classList.remove('active'));
      li.classList.add('active');
    });
    document.querySelector('.shop-list').appendChild(li);
  });
  $('#successClose').addEventListener('click', () => { closeModal(); toast('Toko baru ditambahkan ke daftar'); });

  // ESC tutup modal
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeMassModal(); } });
});
