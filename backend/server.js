/* ===========================================================
   Infarm CS — AI Engine (Layer 3, Tech Stack claude.md)
   Express + Claude API (Anthropic). Memuat claude.md sebagai
   system prompt, mengklasifikasikan aksi, dan membalas pelanggan.
   =========================================================== */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildSystemPrompt, parseAction } from './knowledge.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const PORT = process.env.PORT || 3000;
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = Number(process.env.MAX_TOKENS || 600);

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Sajikan frontend statis (index.html, dashboard.html, dll) dari folder project
app.use(express.static(ROOT));

// Inisialisasi Claude. API key diambil dari .env (ANTHROPIC_API_KEY)
const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

// System prompt disusun sekali saat start (Opsi A: inject KB)
const SYSTEM_PROMPT = buildSystemPrompt();

// ---------- Health check ----------
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    model: MODEL,
    claudeConfigured: Boolean(client),
    systemPromptChars: SYSTEM_PROMPT.length,
  });
});

// ---------- Endpoint utama: balas chat pelanggan ----------
// body: { message: string, history?: [{role:'user'|'assistant', content:string}] }
app.post('/api/chat', async (req, res) => {
  const { message, history = [] } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Field "message" wajib diisi.' });
  }

  if (!client) {
    return res.status(503).json({
      error: 'ANTHROPIC_API_KEY belum diset. Salin .env.example ke .env dan isi API key.',
    });
  }

  try {
    const messages = [
      ...history.filter((m) => m && m.role && m.content),
      { role: 'user', content: message },
    ];

    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages,
    });

    const raw = resp.content?.map((b) => (b.type === 'text' ? b.text : '')).join('') || '';
    const { action, reply } = parseAction(raw);

    res.json({
      action,                 // AUTO_REPLY | ASK_INFORMATION | HANDOVER_TO_CS | CHECK_ORDER_SYSTEM
      reply,                  // teks balasan untuk pelanggan
      model: MODEL,
      usage: resp.usage,      // jumlah token (untuk estimasi biaya)
    });
  } catch (err) {
    console.error('[chat] error:', err);
    res.status(500).json({ error: 'Gagal memproses ke Claude API.', detail: err.message });
  }
});

// ---------- Placeholder webhook marketplace (Layer 2) ----------
// Nantinya: validasi HMAC-SHA256 lalu teruskan ke /api/chat atau CHECK_ORDER_SYSTEM.
app.post('/api/webhook/:platform', (req, res) => {
  console.log(`[webhook] pesan masuk dari ${req.params.platform}`);
  // TODO: verifikasi signature + routing sesuai claude.md
  res.json({ received: true, platform: req.params.platform });
});

app.listen(PORT, () => {
  console.log(`\n🌱 Infarm CS backend berjalan di http://localhost:${PORT}`);
  console.log(`   Frontend  : http://localhost:${PORT}/index.html`);
  console.log(`   Dashboard : http://localhost:${PORT}/dashboard.html`);
  console.log(`   Model     : ${MODEL}`);
  console.log(`   Claude    : ${client ? 'siap ✅' : 'BELUM dikonfigurasi ⚠️  (set ANTHROPIC_API_KEY di .env)'}\n`);
});
