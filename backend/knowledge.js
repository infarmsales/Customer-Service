/* ===========================================================
   Knowledge Base loader — Layer 4 (Opsi A: inject ke prompt)
   Memuat claude.md (system prompt), products.json, faq-cs.md
   =========================================================== */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..'); // folder project (CS AI PROJECT)

function safeRead(file) {
  try {
    return readFileSync(join(ROOT, file), 'utf8');
  } catch (err) {
    console.warn(`[KB] Gagal membaca ${file}: ${err.message}`);
    return '';
  }
}

// claude.md = system prompt utama (identitas, SOP, aturan, klasifikasi)
export const SYSTEM_PROMPT_BASE = safeRead('claude.md');

// FAQ CS (markdown)
const FAQ = safeRead('faq-cs.md');

// Daftar produk (JSON) — diringkas agar hemat token (Opsi A KB < 50KB).
// Untuk skala besar, ganti ke RAG/pgvector (Opsi B di Tech Stack).
function buildProductSummary() {
  const raw = safeRead('products.json');
  if (!raw) return '';
  try {
    const data = JSON.parse(raw);
    const lines = [];
    const cats = data.produk_per_kategori || {};
    for (const [kategori, items] of Object.entries(cats)) {
      lines.push(`\n### ${kategori} (${items.length} SKU)`);
      // ambil maksimal 12 contoh nama produk per kategori agar prompt tidak membengkak
      items.slice(0, 12).forEach((p) => lines.push(`- ${p.sku}: ${p.nama_produk}`));
      if (items.length > 12) lines.push(`- …dan ${items.length - 12} SKU lain di kategori ini`);
    }
    return lines.join('\n');
  } catch (err) {
    console.warn(`[KB] products.json bukan JSON valid: ${err.message}`);
    return '';
  }
}

const PRODUCTS = buildProductSummary();

// Kontrak output internal: minta model menandai klasifikasi aksi di baris pertama.
const OUTPUT_CONTRACT = `
---
# FORMAT OUTPUT (INTERNAL — JANGAN DITAMPILKAN KE PELANGGAN)
Mulai SETIAP respons dengan tepat satu baris:
ACTION: <AUTO_REPLY | ASK_INFORMATION | HANDOVER_TO_CS | CHECK_ORDER_SYSTEM>
Lalu satu baris kosong, lalu tulis HANYA teks balasan untuk pelanggan
(tanpa menyebut ACTION atau aturan internal apa pun).
`;

/** Susun system prompt lengkap = claude.md + KB produk + FAQ + kontrak output. */
export function buildSystemPrompt() {
  return [
    SYSTEM_PROMPT_BASE,
    '\n\n---\n# KNOWLEDGE BASE — DAFTAR PRODUK (RINGKAS)\n' + PRODUCTS,
    '\n\n---\n# KNOWLEDGE BASE — FAQ CS\n' + FAQ,
    OUTPUT_CONTRACT,
  ].join('\n');
}

/** Pisahkan ACTION dari teks balasan pelanggan. */
export function parseAction(text) {
  const m = text.match(/^\s*ACTION:\s*(AUTO_REPLY|ASK_INFORMATION|HANDOVER_TO_CS|CHECK_ORDER_SYSTEM)\s*/i);
  if (m) {
    return { action: m[1].toUpperCase(), reply: text.slice(m[0].length).trim() };
  }
  return { action: 'AUTO_REPLY', reply: text.trim() };
}
