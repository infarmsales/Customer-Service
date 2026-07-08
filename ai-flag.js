/* ===========================================================
   Infarm CS — Sub-halaman "Flag Koreksi Jawaban AI"
   Ditanam di dalam halaman AI Chatbot (ai.html) sebagai sub-tab,
   bukan halaman terpisah. Tampilan: Daftar ↔ Detail (tanpa pindah URL).
   Fungsi data (loadFlags, getFlag, updateFlag, dll) dari flag-store.js
   =========================================================== */

const $f = (s) => document.querySelector(s);

let flagStatusFilter = 'all';
let currentFlagId = null;

// ---------- Daftar Flag ----------
function flagScopedList() {
  const list = loadFlags();
  if (isAdmin()) return list;
  const me = getCurrentUserName().toLowerCase();
  return list.filter((f) => (f.reporterName || '').toLowerCase() === me);
}

function renderFlagCounts(list) {
  $f('#cAll').textContent = list.length;
  $f('#cMenunggu').textContent = list.filter((f) => f.status === 'menunggu').length;
  $f('#cDisetujui').textContent = list.filter((f) => f.status === 'disetujui').length;
  $f('#cDitolak').textContent = list.filter((f) => f.status === 'ditolak').length;
}

function renderFlagScopeNote() {
  const note = $f('#scopeNote');
  if (!note) return;
  if (isAdmin()) {
    note.innerHTML = '🛡️ <b>Peran Admin/Owner</b> — menampilkan seluruh flag dari semua CS. Buka detail untuk menyetujui atau menolak.';
  } else {
    note.innerHTML = `🧑‍💼 <b>Peran CS Agent</b> — menampilkan flag yang dilaporkan oleh <b>${getCurrentUserName()}</b> saja. Persetujuan hanya dapat dilakukan oleh Admin/Owner.`;
  }
}

function renderFlagRoleButtons() {
  document.querySelectorAll('#aitab-flag .role-btn').forEach((b) => b.classList.toggle('active', b.dataset.role === getRole()));
  const hint = $f('#roleHint');
  if (hint) hint.textContent = `Login sebagai: ${getCurrentUserName()}`;
}

function renderFlagTable() {
  const scoped = flagScopedList();
  renderFlagCounts(scoped);

  const rows = scoped.filter((f) => flagStatusFilter === 'all' || f.status === flagStatusFilter);
  const body = $f('#flagBody');
  if (!body) return;
  body.innerHTML = rows.map((f) => {
    const st = FLAG_STATUS[f.status];
    return `<tr>
      <td>${fmtDate(f.createdAt)}</td>
      <td class="msg-cell"><div class="primary">${f.customerMessage || '—'}</div></td>
      <td><span class="cat-pill">${FLAG_CATEGORIES[f.category] || 'Lainnya'}</span></td>
      <td>${f.reporterName || '—'}</td>
      <td><span class="pill ${st.cls}">${st.label}</span></td>
      <td><button class="act-link" data-open-flag="${f.id}" type="button">Lihat Detail</button></td>
    </tr>`;
  }).join('');

  $f('#flagEmpty').hidden = rows.length > 0;
  $f('#flagTotal').textContent = rows.length;

  body.querySelectorAll('[data-open-flag]').forEach((b) => {
    b.addEventListener('click', () => openFlagDetailView(b.dataset.openFlag));
  });
}

function renderFlagListAll() {
  renderFlagRoleButtons();
  renderFlagScopeNote();
  renderFlagTable();
  updateFlagBadge();
}

// ---------- Detail Flag ----------
function flagDecisionSectionHtml(flag) {
  const st = FLAG_STATUS[flag.status];
  const admin = isAdmin();

  if (flag.status === 'menunggu') {
    if (admin) {
      return `
        <div class="flag-card" id="decisionCard">
          <h3>Keputusan Review</h3>
          <div class="decision-bar">
            <button class="btn-approve" id="btnApproveFlag" type="button">✓ Setujui — Jadikan Draft Revisi KB</button>
            <button class="btn-reject" id="btnRejectFlag" type="button">✕ Tolak</button>
          </div>
          <div class="reject-reason-box" id="rejectBox">
            <label style="font-weight:600;font-size:0.84rem;color:var(--text-2);display:block;margin-bottom:6px;">Alasan Penolakan (opsional)</label>
            <textarea id="rejectReasonInput" rows="3" placeholder="mis. duplikat laporan, sudah diperbaiki sebelumnya, dsb."></textarea>
            <div class="rr-actions">
              <button class="btn-ghost" id="btnRejectCancel" type="button">Batal</button>
              <button class="btn-reject" id="btnRejectConfirm" type="button">Konfirmasi Tolak</button>
            </div>
          </div>
        </div>`;
    }
    return `<div class="flag-card"><h3>Keputusan Review</h3><div class="readonly-note">🔒 Hanya Admin/Owner yang dapat menyetujui atau menolak flag ini. Status saat ini: <b>${st.label}</b>.</div></div>`;
  }

  if (flag.status === 'disetujui') {
    return `
      <div class="flag-card">
        <h3>Keputusan Review</h3>
        <p>Disetujui oleh <b>${flag.reviewedBy || '—'}</b> pada ${fmtDate(flag.reviewedAt)}.</p>
        <div class="draft-kb-box">
          <div class="dk-title">📄 Draft Revisi Knowledge Base</div>
          <div><b>Kategori:</b> ${FLAG_CATEGORIES[flag.category]}</div>
          <div style="margin-top:6px">${flag.correctAnswer}</div>
          <div class="dk-note">Tersimpan sebagai draft revisi — <b>belum otomatis mengubah</b> file Knowledge Base asli (products.json / faq-cs.md / claude.md). Tim pengelola KB perlu menerapkannya secara manual.</div>
        </div>
      </div>`;
  }

  return `
    <div class="flag-card">
      <h3>Keputusan Review</h3>
      <p>Ditolak oleh <b>${flag.reviewedBy || '—'}</b> pada ${fmtDate(flag.reviewedAt)}.</p>
      ${flag.rejectReason
        ? `<div class="answer-box neutral"><span class="ab-label">Alasan Penolakan</span>${flag.rejectReason}</div>`
        : '<p style="color:var(--muted);font-size:0.86rem;">Tidak ada alasan penolakan yang dicatat.</p>'}
    </div>`;
}

function renderFlagDetail() {
  const flag = currentFlagId ? getFlag(currentFlagId) : null;
  const root = $f('#flagDetailRoot');
  if (!root) return;

  if (!flag) {
    root.innerHTML = `<div class="flag-card"><p>Flag tidak ditemukan.</p></div>`;
    return;
  }

  const st = FLAG_STATUS[flag.status];

  root.innerHTML = `
    <div class="flag-card">
      <div class="flag-id-row">
        <span class="flag-id">${flag.id}</span>
        <span class="pill ${st.cls}">${st.label}</span>
        <span class="cat-pill">${FLAG_CATEGORIES[flag.category]}</span>
      </div>
      <div class="flag-meta">Dilaporkan oleh <b>${flag.reporterName}</b> · ${fmtDate(flag.createdAt)}</div>
    </div>

    <div class="flag-card">
      <h3>Percakapan</h3>
      <div class="answer-box neutral"><span class="ab-label">Pesan Pelanggan</span>${flag.customerMessage || '—'}</div>
      <div class="answer-box wrong"><span class="ab-label">Jawaban AI yang Di-flag${flag.aiAction ? ' · ' + flag.aiAction : ''}</span>${flag.aiAnswer || '—'}</div>
      <div class="answer-box correct"><span class="ab-label">Jawaban yang Seharusnya</span>${flag.correctAnswer || '—'}</div>
    </div>

    <div class="flag-card">
      <h3>Info Laporan</h3>
      <div class="info-grid">
        <div class="info-item"><div class="i-label">Kategori</div><div class="i-value">${FLAG_CATEGORIES[flag.category]}</div></div>
        <div class="info-item"><div class="i-label">Nama CS Pelapor</div><div class="i-value">${flag.reporterName}</div></div>
        <div class="info-item"><div class="i-label">Tindakan AI Saat Itu</div><div class="i-value">${flag.aiAction || '—'}</div></div>
        <div class="info-item"><div class="i-label">Status</div><div class="i-value">${st.label}</div></div>
      </div>
      ${flag.note ? `<div class="answer-box neutral" style="margin-top:14px"><span class="ab-label">Catatan Tambahan</span>${flag.note}</div>` : ''}
    </div>

    <div class="flag-card">
      <h3>Log Waktu</h3>
      <div class="timeline">
        <div class="timeline-row"><span class="t-dot"></span><span class="t-label">Dibuat</span><span class="t-value">${fmtDate(flag.createdAt)} oleh ${flag.reporterName}</span></div>
        <div class="timeline-row"><span class="t-dot" style="background:${flag.reviewedAt ? 'var(--green)' : '#cbd5e1'}"></span><span class="t-label">Direview</span><span class="t-value">${flag.reviewedAt ? fmtDate(flag.reviewedAt) + ' oleh ' + flag.reviewedBy : 'Belum direview'}</span></div>
      </div>
    </div>

    ${flagDecisionSectionHtml(flag)}
  `;

  const approveBtn = $f('#btnApproveFlag');
  if (approveBtn) {
    approveBtn.addEventListener('click', () => {
      updateFlag(flag.id, {
        status: 'disetujui',
        reviewedAt: new Date().toISOString(),
        reviewedBy: `${getCurrentUserName()} (Admin)`,
      });
      toast('Flag disetujui — tersimpan sebagai draft revisi KB ✅');
      renderFlagDetail();
      renderFlagTable();
    });
  }
  const rejectBtn = $f('#btnRejectFlag');
  if (rejectBtn) rejectBtn.addEventListener('click', () => $f('#rejectBox').classList.add('show'));

  const rejectCancel = $f('#btnRejectCancel');
  if (rejectCancel) rejectCancel.addEventListener('click', () => $f('#rejectBox').classList.remove('show'));

  const rejectConfirm = $f('#btnRejectConfirm');
  if (rejectConfirm) {
    rejectConfirm.addEventListener('click', () => {
      updateFlag(flag.id, {
        status: 'ditolak',
        rejectReason: $f('#rejectReasonInput').value.trim(),
        reviewedAt: new Date().toISOString(),
        reviewedBy: `${getCurrentUserName()} (Admin)`,
      });
      toast('Flag ditolak');
      renderFlagDetail();
      renderFlagTable();
    });
  }
}

// ---------- Perpindahan tampilan Daftar ↔ Detail ----------
function openFlagDetailView(id) {
  currentFlagId = id;
  $f('#flagView-list').hidden = true;
  $f('#flagView-detail').hidden = false;
  renderFlagDetail();
}

function backToFlagList() {
  $f('#flagView-detail').hidden = true;
  $f('#flagView-list').hidden = false;
  currentFlagId = null;
  renderFlagTable();
}

// ---------- Wiring ----------
document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('flagBody')) return; // halaman tidak memuat sub-tab Flag

  renderFlagListAll();

  document.querySelectorAll('#aitab-flag .role-btn').forEach((b) => {
    b.addEventListener('click', () => {
      setRole(b.dataset.role);
      renderFlagRoleButtons();
      renderFlagScopeNote();
      renderFlagTable();
      if (!$f('#flagView-detail').hidden) renderFlagDetail();
    });
  });

  document.querySelectorAll('#statusTabs .chip').forEach((c) => {
    c.addEventListener('click', () => {
      document.querySelectorAll('#statusTabs .chip').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
      flagStatusFilter = c.dataset.status;
      renderFlagTable();
    });
  });

  $f('#flagBackToList').addEventListener('click', backToFlagList);
});
