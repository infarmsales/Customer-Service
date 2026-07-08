/* ===========================================================
   Infarm CS — Detail Flag Koreksi Jawaban AI
   Fungsi data (getFlag, updateFlag, dll) berasal dari flag-store.js
   =========================================================== */

const $ = (s) => document.querySelector(s);

function getFlagIdFromUrl() {
  return new URLSearchParams(location.search).get('id');
}

function renderRoleButtons() {
  document.querySelectorAll('.role-btn').forEach((b) => b.classList.toggle('active', b.dataset.role === getRole()));
  $('#roleHint').textContent = `Login sebagai: ${getCurrentUserName()}`;
}

function decisionSectionHtml(flag) {
  const st = FLAG_STATUS[flag.status];
  const admin = isAdmin();

  if (flag.status === 'menunggu') {
    if (admin) {
      return `
        <div class="flag-card" id="decisionCard">
          <h3>Keputusan Review</h3>
          <div class="decision-bar">
            <button class="btn-approve" id="btnApprove" type="button">✓ Setujui — Jadikan Draft Revisi KB</button>
            <button class="btn-reject" id="btnReject" type="button">✕ Tolak</button>
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

  // ditolak
  return `
    <div class="flag-card">
      <h3>Keputusan Review</h3>
      <p>Ditolak oleh <b>${flag.reviewedBy || '—'}</b> pada ${fmtDate(flag.reviewedAt)}.</p>
      ${flag.rejectReason
        ? `<div class="answer-box neutral"><span class="ab-label">Alasan Penolakan</span>${flag.rejectReason}</div>`
        : '<p style="color:var(--muted);font-size:0.86rem;">Tidak ada alasan penolakan yang dicatat.</p>'}
    </div>`;
}

function renderDetail() {
  const id = getFlagIdFromUrl();
  const flag = id ? getFlag(id) : null;
  const root = $('#flagDetailRoot');

  if (!flag) {
    root.innerHTML = `<div class="flag-card"><p>Flag dengan ID tersebut tidak ditemukan. <a href="flag-list.html">Kembali ke daftar flag</a>.</p></div>`;
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

    ${decisionSectionHtml(flag)}
  `;

  const approveBtn = $('#btnApprove');
  if (approveBtn) {
    approveBtn.addEventListener('click', () => {
      updateFlag(flag.id, {
        status: 'disetujui',
        reviewedAt: new Date().toISOString(),
        reviewedBy: `${getCurrentUserName()} (Admin)`,
      });
      toast('Flag disetujui — tersimpan sebagai draft revisi KB ✅');
      renderDetail();
    });
  }
  const rejectBtn = $('#btnReject');
  if (rejectBtn) rejectBtn.addEventListener('click', () => $('#rejectBox').classList.add('show'));

  const rejectCancel = $('#btnRejectCancel');
  if (rejectCancel) rejectCancel.addEventListener('click', () => $('#rejectBox').classList.remove('show'));

  const rejectConfirm = $('#btnRejectConfirm');
  if (rejectConfirm) {
    rejectConfirm.addEventListener('click', () => {
      updateFlag(flag.id, {
        status: 'ditolak',
        rejectReason: $('#rejectReasonInput').value.trim(),
        reviewedAt: new Date().toISOString(),
        reviewedBy: `${getCurrentUserName()} (Admin)`,
      });
      toast('Flag ditolak');
      renderDetail();
    });
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

document.addEventListener('DOMContentLoaded', () => {
  renderRoleButtons();
  renderDetail();

  document.querySelectorAll('.role-btn').forEach((b) => {
    b.addEventListener('click', () => { setRole(b.dataset.role); renderRoleButtons(); renderDetail(); });
  });
});
