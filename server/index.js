/**
 * Sobre Proxy Server
 *
 * A thin Express server that proxies requests to Lumen OCR and Lumen AI Chat.
 * Files are processed in memory only — never written to disk (Req 9.2).
 */

import 'dotenv/config';
import express from 'express';
import { readRouter } from './routes/read.js';
import { askRouter } from './routes/ask.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

// Parse JSON bodies for /api/ask
app.use(express.json({ limit: '1mb' }));

// Routes
app.use('/api/read', readRouter);
app.use('/api/ask', askRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Global error handler — must have 4 params for Express to treat it as an error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[sobre-proxy] Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err?.message ?? 'Unknown error',
  });
});

app.listen(PORT, () => {
  console.log(`[sobre-proxy] Listening on http://localhost:${PORT}`);
});
