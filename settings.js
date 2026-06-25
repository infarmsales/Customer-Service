/* ===========================================================
   Infarm CS — Halaman Pengaturan (interaktivitas)
   Pengaturan AI mengikuti claude.md. Disimpan di localStorage.
   =========================================================== */

const $ = (s) => document.querySelector(s);
const STORE_KEY = 'infarm_cs_settings';

// ---------- Kata kunci eskalasi (default dari claude.md) ----------
let escKeywords = ['refund', 'retur', 'pembatalan', 'barang rusak', 'tidak sampai', 'komplain', 'bicara CS'];

function renderChips() {
  $('#escChips').innerHTML = escKeywords.map((k, i) =>
    `<span class="chip-tag">${k}<button data-i="${i}">✕</button></span>`).join('');
  $('#escChips').querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => { escKeywords.splice(Number(b.dataset.i), 1); renderChips(); }));
}

// ---------- Simpan & muat ----------
function saveSettings() {
  const data = {
    aiEnabled: $('#aiEnabled').checked,
    aiModel: $('#aiModel').value,
    conf: $('#confRange').value,
    escKeywords,
  };
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (_) {}
}

function loadSettings() {
  let data = {};
  try { data = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (_) {}
  if (typeof data.aiEnabled === 'boolean') $('#aiEnabled').checked = data.aiEnabled;
  if (data.aiModel) $('#aiModel').value = data.aiModel;
  if (data.conf) { $('#confRange').value = data.conf; $('#confVal').textContent = data.conf + '%'; }
  if (Array.isArray(data.escKeywords) && data.escKeywords.length) escKeywords = data.escKeywords;
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
  loadSettings();
  renderChips();

  // Navigasi section
  document.querySelectorAll('.set-link').forEach((link) => {
    link.addEventListener('click', () => {
      document.querySelectorAll('.set-link').forEach((l) => l.classList.remove('active'));
      link.classList.add('active');
      document.querySelectorAll('.set-panel').forEach((p) => p.classList.remove('active'));
      $('#sec-' + link.dataset.sec).classList.add('active');
    });
  });

  // Slider keyakinan
  $('#confRange').addEventListener('input', (e) => $('#confVal').textContent = e.target.value + '%');

  // Tambah kata kunci eskalasi
  $('#escAdd').addEventListener('click', () => {
    const v = $('#escInput').value.trim();
    if (v) { escKeywords.push(v); $('#escInput').value = ''; renderChips(); }
  });
  $('#escInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#escAdd').click(); } });

  // Tombol simpan
  document.querySelectorAll('[data-save]').forEach((b) =>
    b.addEventListener('click', () => { saveSettings(); toast('Pengaturan tersimpan ✅'); }));
});
