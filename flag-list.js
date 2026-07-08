/* ===========================================================
   Infarm CS — Daftar Flag Koreksi Jawaban AI
   Fungsi data (loadFlags, dll) berasal dari flag-store.js
   =========================================================== */

const $ = (s) => document.querySelector(s);

let currentStatus = 'all';

function scopedFlags() {
  const list = loadFlags();
  if (isAdmin()) return list;
  // CS hanya melihat flag yang ia laporkan sendiri
  const me = getCurrentUserName().toLowerCase();
  return list.filter((f) => (f.reporterName || '').toLowerCase() === me);
}

function renderCounts(list) {
  $('#cAll').textContent = list.length;
  $('#cMenunggu').textContent = list.filter((f) => f.status === 'menunggu').length;
  $('#cDisetujui').textContent = list.filter((f) => f.status === 'disetujui').length;
  $('#cDitolak').textContent = list.filter((f) => f.status === 'ditolak').length;
}

function renderScopeNote() {
  const note = $('#scopeNote');
  if (isAdmin()) {
    note.innerHTML = '🛡️ <b>Peran Admin/Owner</b> — menampilkan seluruh flag dari semua CS. Anda dapat membuka detail untuk menyetujui atau menolak.';
  } else {
    note.innerHTML = `🧑‍💼 <b>Peran CS Agent</b> — menampilkan flag yang dilaporkan oleh <b>${getCurrentUserName()}</b> saja. Persetujuan hanya dapat dilakukan oleh Admin/Owner.`;
  }
}

function renderRoleButtons() {
  document.querySelectorAll('.role-btn').forEach((b) => b.classList.toggle('active', b.dataset.role === getRole()));
  $('#roleHint').textContent = `Login sebagai: ${getCurrentUserName()}`;
}

function renderTable() {
  const scoped = scopedFlags();
  renderCounts(scoped);

  const rows = scoped.filter((f) => currentStatus === 'all' || f.status === currentStatus);
  const body = $('#flagBody');
  body.innerHTML = rows.map((f) => {
    const st = FLAG_STATUS[f.status];
    return `<tr>
      <td>${fmtDate(f.createdAt)}</td>
      <td class="msg-cell"><div class="primary">${f.customerMessage || '—'}</div></td>
      <td><span class="cat-pill">${FLAG_CATEGORIES[f.category] || 'Lainnya'}</span></td>
      <td>${f.reporterName || '—'}</td>
      <td><span class="pill ${st.cls}">${st.label}</span></td>
      <td><a class="act-link" href="flag-detail.html?id=${encodeURIComponent(f.id)}">Lihat Detail</a></td>
    </tr>`;
  }).join('');

  $('#flagEmpty').hidden = rows.length > 0;
  $('#flagTotal').textContent = rows.length;
}

function renderAll() {
  renderRoleButtons();
  renderScopeNote();
  renderTable();
}

document.addEventListener('DOMContentLoaded', () => {
  renderAll();

  document.querySelectorAll('.role-btn').forEach((b) => {
    b.addEventListener('click', () => { setRole(b.dataset.role); renderAll(); });
  });

  document.querySelectorAll('#statusTabs .chip').forEach((c) => {
    c.addEventListener('click', () => {
      document.querySelectorAll('#statusTabs .chip').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
      currentStatus = c.dataset.status;
      renderTable();
    });
  });
});
