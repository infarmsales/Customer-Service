/* ===========================================================
   Quick Chat Widget — chat cepat ke pembeli dari halaman
   Pesanan (Penilaian / Pengembalian Dana / Dibatalkan) tanpa
   pindah ke halaman Chat utama (dashboard.html).
   =========================================================== */

const QC_THREADS = {}; // riwayat pesan per ID pesanan selama sesi ini (mock)
let qcActiveId = null;

function qcInitials(name) {
  const clean = (name || '?').replace(/[*]/g, '');
  const parts = clean.split(/[\s._]+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

function openQuickChat({ id, name, shop, context, initialMessage }) {
  qcActiveId = id;
  if (!QC_THREADS[id]) {
    QC_THREADS[id] = initialMessage ? [{ side: 'in', time: 'baru saja', text: initialMessage }] : [];
  }

  document.getElementById('qcAvatar').textContent = qcInitials(name);
  document.getElementById('qcName').textContent = name || 'Pelanggan';
  document.getElementById('qcShop').textContent = shop || '';
  document.getElementById('qcContext').textContent = context || '';

  const widget = document.getElementById('qcWidget');
  widget.hidden = false;
  widget.classList.remove('minimized');

  qcRenderStream();
  document.getElementById('qcInput').focus();
}

function qcRenderStream() {
  const stream = document.getElementById('qcStream');
  const msgs = QC_THREADS[qcActiveId] || [];
  stream.innerHTML = msgs.map((m) =>
    `<div class="qc-msg ${m.side}"><div class="qc-bubble">${m.text}</div><span class="qc-time">${m.time}</span></div>`
  ).join('') || '<div style="text-align:center;color:var(--muted);font-size:0.76rem;padding:20px 0">Belum ada pesan.</div>';
  stream.scrollTop = stream.scrollHeight;
}

function qcSend() {
  const input = document.getElementById('qcInput');
  const text = input.value.trim();
  if (!text || !qcActiveId) return;
  QC_THREADS[qcActiveId].push({ side: 'out', time: 'baru saja', text });
  input.value = '';
  document.getElementById('qcCount').textContent = '0/600';
  qcRenderStream();
}

function qcClose() {
  document.getElementById('qcWidget').hidden = true;
  qcActiveId = null;
}

function qcToggleMinimize() {
  document.getElementById('qcWidget').classList.toggle('minimized');
}

document.addEventListener('DOMContentLoaded', () => {
  const widget = document.getElementById('qcWidget');
  if (!widget) return; // halaman ini tidak memuat Quick Chat

  document.getElementById('qcHeader').addEventListener('click', (e) => {
    if (e.target.closest('.qc-icon')) return;
    qcToggleMinimize();
  });
  document.getElementById('qcCloseBtn').addEventListener('click', (e) => { e.stopPropagation(); qcClose(); });
  document.getElementById('qcMinBtn').addEventListener('click', (e) => { e.stopPropagation(); qcToggleMinimize(); });
  document.getElementById('qcSend').addEventListener('click', qcSend);

  document.getElementById('qcInput').addEventListener('input', (e) => {
    document.getElementById('qcCount').textContent = `${e.target.value.length}/600`;
  });
  document.getElementById('qcInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); qcSend(); }
  });
  document.getElementById('qcTranslate').addEventListener('click', () => {
    document.getElementById('qcInput').placeholder = 'Terjemahan otomatis akan aktif saat backend terhubung…';
  });
});
