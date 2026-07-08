/* ===========================================================
   Infarm CS — Halaman AI Chatbot
   Terhubung ke Claude API via backend (/api/chat).
   Jika backend mati → pakai klasifikasi mock lokal.
   Klasifikasi & gaya jawaban mengikuti claude.md.
   =========================================================== */

const $ = (s) => document.querySelector(s);

const ACTION_CLS = {
  AUTO_REPLY: 'tag-auto',
  ASK_INFORMATION: 'tag-ask',
  HANDOVER_TO_CS: 'tag-handover',
  CHECK_ORDER_SYSTEM: 'tag-order',
};

// ---------- Cek status backend ----------
async function checkBackend() {
  const el = $('#backendStatus');
  try {
    const r = await fetch('/api/health');
    if (!r.ok) throw new Error();
    const d = await r.json();
    if (d.claudeConfigured) {
      el.textContent = 'Claude aktif ✅';
      el.style.color = '#15803d';
    } else {
      el.textContent = 'backend hidup, API key belum diset ⚠️';
      el.style.color = '#d97706';
    }
  } catch {
    el.textContent = 'backend belum jalan — mode contoh';
    el.style.color = '#64748b';
  }
}

// ---------- Klasifikasi mock (fallback offline) ----------
function mockClassify(msg) {
  const m = msg.toLowerCase();
  if (/(refund|retur|kembali(kan)?|batal|rusak|bocor|pecah|tidak sampai|belum sampai|salah kirim|komplain|kecewa|marah)/.test(m)) {
    return {
      action: 'HANDOVER_TO_CS',
      reply: 'Maaf atas kendalanya, Kak 🙏 Karena ini berkaitan dengan kondisi pesanan, kasusnya perlu diperiksa langsung oleh tim CS kami. Saya bantu teruskan beserta ringkasan informasinya ya, Kak.',
    };
  }
  if (/(resi|status|pengiriman|nomor pesanan|dikirim|sampai mana|tracking|pembayaran)/.test(m)) {
    return {
      action: 'CHECK_ORDER_SYSTEM',
      reply: 'Saya cek dulu status pesanannya ya, Kak. Sebentar… (sistem akan mengambil data resi/pembayaran sebelum membalas).',
    };
  }
  if (/(kuning|layu|menguning|hama|gejala|kenapa|busuk|mati|jamur|bercak|daun)/.test(m)) {
    return {
      action: 'ASK_INFORMATION',
      reply: 'Boleh kirim foto tanamannya, Kak? Yang keseluruhan dan bagian bawah daunnya sekalian. Sekalian info produk & dosis terakhir yang dipakai serta frekuensi penyiraman, supaya penyebabnya bisa diperiksa lebih tepat.',
    };
  }
  if (/(dosis|takaran|berapa ml|cara pakai|cara penggunaan|cocok|untuk tanaman)/.test(m)) {
    return {
      action: 'AUTO_REPLY',
      reply: 'Bisa, Kak. Untuk POC Buah Infarm, dosis resminya 2 ml per 1 liter air, diberikan seminggu sekali saat tanaman memasuki fase berbunga atau berbuah. Hindari menambah dosis agar tanaman tidak kelebihan nutrisi ya, Kak.',
    };
  }
  return {
    action: 'AUTO_REPLY',
    reply: 'Halo, Kak 😊 Boleh dijelaskan sedikit lebih detail kebutuhannya? Supaya minfarm bisa bantu jawab dengan tepat ya, Kak.',
  };
}

// ---------- Tampilkan hasil ----------
function showResult({ action, reply, meta }) {
  $('#placeholder').hidden = true;
  $('#output').hidden = false;
  const tag = $('#outTag');
  tag.textContent = action;
  tag.className = 'tag ' + (ACTION_CLS[action] || 'tag-auto');
  $('#outMeta').textContent = meta || '';
  $('#outReply').textContent = reply;
}

// ---------- Minta balasan AI ----------
async function askAI() {
  const msg = $('#custMsg').value.trim();
  if (!msg) { toast('Tulis pesan pelanggan dulu, Kak'); return; }
  if (!$('#aiOn').checked) { toast('Aktifkan dulu Rekomendasi Balasan AI'); return; }

  $('#askBtn').disabled = true;
  $('#askBtn').textContent = 'Memproses…';

  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, history: [] }),
    });
    if (!r.ok) throw new Error('backend');
    const d = await r.json();
    showResult({
      action: d.action,
      reply: d.reply,
      meta: `Claude · ${d.model || ''}${d.usage ? ' · ' + d.usage.output_tokens + ' token' : ''}`,
    });
    toast('Balasan dari Claude siap ✨');
  } catch {
    const d = mockClassify(msg);
    showResult({ ...d, meta: 'mode contoh (backend offline)' });
    toast('Backend belum aktif — pakai klasifikasi contoh');
  } finally {
    $('#askBtn').disabled = false;
    $('#askBtn').textContent = 'Minta Balasan AI ✨';
  }
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

// ---------- Flag Koreksi Jawaban AI ----------
// Fungsi loadFlags/addFlag/pendingFlagCount/getCurrentUserName berasal dari flag-store.js
function updateFlagBadge() {
  const badge = $('#flagPendingBadge');
  if (!badge) return;
  const n = pendingFlagCount();
  badge.hidden = n === 0;
  badge.textContent = n;
}

function openFlagModal() {
  $('#flagCustMsg').value = $('#custMsg').value.trim();
  $('#flagAiAnswer').value = $('#outReply').textContent.trim();
  $('#flagCorrect').value = '';
  $('#flagCategory').value = 'produk';
  $('#flagReporter').value = getCurrentUserName();
  $('#flagNote').value = '';
  $('#flagModal').hidden = false;
  $('#flagCorrect').focus();
}
function closeFlagModal() { $('#flagModal').hidden = true; }

function submitFlag(e) {
  e.preventDefault();
  const correctAnswer = $('#flagCorrect').value.trim();
  const reporterName = $('#flagReporter').value.trim();
  if (!correctAnswer) { toast('Isi dulu jawaban yang seharusnya, Kak'); return; }
  if (!reporterName) { toast('Isi dulu nama CS pelapor, Kak'); return; }

  addFlag({
    customerMessage: $('#flagCustMsg').value.trim(),
    aiAnswer: $('#flagAiAnswer').value.trim(),
    aiAction: $('#outTag').textContent.trim(),
    correctAnswer,
    category: $('#flagCategory').value,
    reporterName,
    note: $('#flagNote').value.trim(),
  });

  closeFlagModal();
  updateFlagBadge();
  if (typeof renderFlagListAll === 'function') renderFlagListAll(); // segarkan sub-tab Flag Koreksi
  toast('Flag koreksi terkirim — menunggu review Admin/Owner ✅');
}

// ---------- Sub-tab: AI Chatbot ↔ Flag Koreksi ----------
function switchAiTab(name) {
  document.querySelectorAll('.ai-tab').forEach((t) => t.classList.toggle('active', t.dataset.aitab === name));
  $('#aitab-chatbot').hidden = name !== 'chatbot';
  $('#aitab-flag').hidden = name !== 'flag';
  if (name === 'flag' && typeof backToFlagList === 'function') backToFlagList();
}

// ---------- Wiring ----------
document.addEventListener('DOMContentLoaded', () => {
  checkBackend();
  updateFlagBadge();

  // Sub-tab AI Chatbot / Flag Koreksi
  document.querySelectorAll('.ai-tab').forEach((t) => {
    t.addEventListener('click', () => switchAiTab(t.dataset.aitab));
  });
  switchAiTab('chatbot');

  $('#askBtn').addEventListener('click', askAI);

  // Flag Koreksi Jawaban AI
  $('#flagBtn').addEventListener('click', openFlagModal);
  $('#flagModalClose').addEventListener('click', closeFlagModal);
  $('#flagCancel').addEventListener('click', closeFlagModal);
  $('#flagModal').addEventListener('click', (e) => { if (e.target.id === 'flagModal') closeFlagModal(); });
  $('#flagForm').addEventListener('submit', submitFlag);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFlagModal(); });

  document.querySelectorAll('.sample').forEach((b) => {
    b.addEventListener('click', () => { $('#custMsg').value = b.textContent; $('#custMsg').focus(); });
  });

  $('#copyReply').addEventListener('click', () => {
    navigator.clipboard?.writeText($('#outReply').textContent);
    toast('Balasan disalin');
  });

  $('#aiOn').addEventListener('change', (e) => {
    toast(e.target.checked ? 'Rekomendasi Balasan AI aktif' : 'Rekomendasi Balasan AI dimatikan');
  });

  // Ctrl/Cmd + Enter untuk kirim
  $('#custMsg').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') askAI();
  });
});
