const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const path = require('node:path');

function httpUrl(value) {
  if (typeof value !== 'string' || value.length > 8192) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

function createApp({ store, baseUrl = 'http://localhost:8080', memory = false, trustProxy = false }) {
  if (!httpUrl(baseUrl)) throw new Error('BASE_URL must be an absolute HTTP(S) URL');
  const app = express();
  app.set('trust proxy', trustProxy);
  app.disable('x-powered-by');
  app.use(helmet({ strictTransportSecurity: process.env.NODE_ENV === 'production' ? undefined : false, contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': process.env.NODE_ENV === 'production' ? [] : null } } }));
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/health', (req, res) => res.json({ status: 'ok', storage: memory ? 'temporary' : 'mongodb' }));
  app.post('/api/url/shorten', rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many links. Please try again in a minute.' } }), async (req, res) => {
    const longUrl = httpUrl(req.body?.longUrl);
    if (!longUrl) return res.status(400).json({ error: 'Enter a valid http:// or https:// URL without embedded credentials.' });
    const result = await store.create(longUrl, baseUrl.replace(/\/$/, ''));
    res.json(result);
  });
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('/:code', async (req, res) => {
    if (!/^[\w-]{1,64}$/.test(req.params.code)) return res.status(404).json({ error: 'Link not found.' });
    const row = await store.find(req.params.code);
    if (!row || !httpUrl(row.longUrl)) return res.status(404).json({ error: 'Link not found.' });
    res.set('Cache-Control', 'no-store').redirect(302, row.longUrl);
  });
  app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use((error, req, res, next) => {
    const status = error.status === 400 ? 400 : error.status === 413 ? 413 : 500;
    if (status === 500) console.error(error.message);
    res.status(status).json({ error: status === 400 ? 'Invalid JSON request.' : status === 413 ? 'Request too large.' : 'Unable to process your request. Please try again.' });
  });
  return app;
}
module.exports = { createApp, httpUrl };
