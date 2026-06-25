/* ===========================================================
   Infarm CS — Badge jumlah chat belum dibaca (ikon 💬 di rail)
   Sekarang memakai angka dummy. Nanti tinggal hubungkan ke
   jumlah chat REAL via backend (GET /api/unread).
   =========================================================== */
(function () {
  // Jumlah chat belum dibaca (dummy). Selaras dgn data di dashboard.js.
  const DUMMY_UNREAD = 2;

  // Ambil jumlah belum dibaca. Saat backend siap, endpoint ini
  // mengembalikan { unread: <angka real> }. Bila gagal → pakai dummy.
  async function getUnread() {
    try {
      const r = await fetch('/api/unread');
      if (r.ok) {
        const d = await r.json();
        if (typeof d.unread === 'number') return d.unread;
      }
    } catch (_) { /* backend belum jalan → pakai dummy */ }
    return DUMMY_UNREAD;
  }

  // Format: 0 → sembunyikan, >99 → "99+", selain itu angka apa adanya.
  function fmt(n) { return n > 99 ? '99+' : String(n); }

  // Dipakai juga oleh dashboard.js untuk update live saat chat dibaca.
  window.updateRailBadge = function (n) {
    document.querySelectorAll('.rail-badge').forEach((b) => {
      if (!n || n <= 0) { b.style.display = 'none'; }
      else { b.style.display = ''; b.textContent = fmt(n); }
    });
  };

  document.addEventListener('DOMContentLoaded', async () => {
    // Halaman dashboard mengelola badge-nya sendiri secara live.
    if (window.INFARM_DASHBOARD) return;
    window.updateRailBadge(await getUnread());
  });
})();
