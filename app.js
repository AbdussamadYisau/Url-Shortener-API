const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const path = require('node:path');
const { cookie, createAuthStore } = require('./lib/auth');

function httpUrl(value) {
  if (typeof value !== 'string' || value.length > 8192) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

function createApp({ store, baseUrl = 'http://localhost:8080', memory = false, trustProxy = false, authStore = createAuthStore({memory}), google = null, sessionDays = 7, retentionDays = 0, cronSecret = process.env.CRON_SECRET }) {
  if (!httpUrl(baseUrl)) throw new Error('BASE_URL must be an absolute HTTP(S) URL');
  baseUrl = baseUrl.replace(/\/$/,'');
  if (new URL(baseUrl).origin !== baseUrl) throw new Error('BASE_URL must be an origin without a path or query.');
  if (process.env.NODE_ENV === 'production' && !baseUrl.startsWith('https://')) throw new Error('Production BASE_URL requires HTTPS.');
  const app = express();
  app.set('trust proxy', trustProxy);
  app.disable('x-powered-by');
  app.use(helmet({ strictTransportSecurity: process.env.NODE_ENV === 'production' ? undefined : false, contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': process.env.NODE_ENV === 'production' ? [] : null } } }));
  app.use(express.json({ limit: '16kb' }));
  const origin = new URL(baseUrl).origin;
  const secure = origin.startsWith('https:');
  const sessionName = secure ? '__Host-shortly_session' : 'shortly_session';
  const stateName = secure ? '__Host-shortly_oauth' : 'shortly_oauth';
  const options = {httpOnly:true,secure,sameSite:'lax',path:'/'};
  app.use('/api', (req,res,next) => {
    res.set('Cache-Control','no-store');
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.get('origin') !== origin) return res.status(403).json({error:'Request origin is not allowed.'});
    next();
  });
  const requireUser = async (req,res,next) => {
    req.user = await authStore.get(cookie(req,sessionName),'session');
    if (!req.user) return res.status(401).json({error:'Sign in with Google to continue.'});
    next();
  };
  app.get('/api/auth/me', async (req,res) => res.json({user:await authStore.get(cookie(req,sessionName),'session'),googleEnabled:!!google,retentionDays}));
  app.get('/api/auth/google', rateLimit({windowMs:60000,limit:15}), async (req,res) => {
    // Start OAuth on the same origin that receives the callback cookie.
    const canonical = new URL(baseUrl);
    if (req.get('host')?.toLowerCase() !== canonical.host || req.protocol !== canonical.protocol.slice(0,-1)) {
      return res.redirect(302, `${baseUrl}/api/auth/google`);
    }
    if (!google) return res.status(503).json({error:'Google sign-in is not configured yet.'});
    const pending = await google.start('');
    const token = await authStore.put('oauth',{verifier:pending.verifier,nonce:pending.nonce},600000);
    const url = new URL(pending.url); url.searchParams.set('state',token);
    res.cookie(stateName,token,{...options,maxAge:600000});
    res.redirect(url.href);
  });
  app.get('/api/auth/google/callback', async (req,res) => {
    const state = cookie(req,stateName);
    res.clearCookie(stateName,options);
    if (!google || !state || req.query.state !== state) return res.status(400).json({error:'Sign-in expired or invalid. Please try again.'});
    const pending = await authStore.get(state,'oauth',true);
    if (!pending || typeof req.query.code !== 'string') return res.redirect('/?auth=failed');
    try {
      const user = await google.finish(req.query.code,pending);
      await authStore.remove(cookie(req,sessionName));
      const token = await authStore.put('session',user,sessionDays*86400000);
      res.cookie(sessionName,token,{...options,maxAge:sessionDays*86400000});
      return res.redirect('/');
    } catch { return res.redirect('/?auth=failed'); }
  });
  app.post('/api/auth/logout', async (req,res) => {await authStore.remove(cookie(req,sessionName));res.clearCookie(sessionName,options);res.json({ok:true});});
  app.get('/api/links',requireUser,async (req,res) => res.json({links:await store.list(req.user.id,baseUrl.replace(/\/$/,''))}));
  app.get('/api/cron/cleanup', async (req,res) => {
    if (!cronSecret || req.get('authorization') !== `Bearer ${cronSecret}`) return res.status(401).json({error:'Unauthorized'});
    const report = await store.cleanup();
    console.info(JSON.stringify({event:'link_cleanup',...report}));
    res.json(report);
  });
  app.get('/api/health' , (req, res) => res.json({ status: 'ok', storage: memory ? 'temporary' : 'mongodb' }));
  app.post('/api/url/shorten', requireUser, rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many links. Please try again in a minute.' } }), async (req, res) => {
    const longUrl = httpUrl(req.body?.longUrl);
    if (!longUrl) return res.status(400).json({ error: 'Enter a valid http:// or https:// URL without embedded credentials.' });
    const result = await store.create(longUrl, baseUrl.replace(/\/$/, ''),req.user.id);
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
