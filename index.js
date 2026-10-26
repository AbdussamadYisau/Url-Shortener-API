require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { createApp } = require('./app');
const { createStore } = require('./lib/store');
const { googleProvider } = require('./lib/auth');
const retentionDays = Number(process.env.LINK_RETENTION_DAYS || 0);
const sessionDays = Number(process.env.SESSION_MAX_AGE_DAYS || 7);
if (!Number.isInteger(sessionDays) || sessionDays < 1 || sessionDays > 90) throw new Error('SESSION_MAX_AGE_DAYS must be between 1 and 90.');
const baseUrl = (process.env.BASE_URL || process.env.host || `http://localhost:${process.env.PORT || 8080}`).replace(/\/$/,'');
const google = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? googleProvider({clientId:process.env.GOOGLE_CLIENT_ID,clientSecret:process.env.GOOGLE_CLIENT_SECRET,baseUrl}) : null;
const memory = process.env.STORAGE === 'memory';
const port = process.env.PORT || 8080;
let connection;
async function ready() {
  if (memory) {
    if (process.env.NODE_ENV === 'production') throw new Error('Production requires MongoDB storage.');
    return;
  }
  const uri = process.env.DB_CONNECTION || process.env.MONGODB_URI;
  if (!uri) throw new Error('Set DB_CONNECTION or use STORAGE=memory for local development.');
  connection ||= mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 }).catch(error => { connection = null; throw error; });
  await connection;
}
const app = createApp({ store: createStore({ memory,retentionDays }), memory, google,retentionDays,sessionDays, baseUrl, trustProxy: process.env.TRUST_PROXY === '1' ? 1 : false });
const handler = async (req, res) => {
  try { await ready(); app(req, res); }
  catch (error) { console.error(error.message); res.statusCode = 503; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'Storage unavailable. Please try again later.' })); }
};
module.exports = handler;
if (require.main === module) ready().then(() => {
  if (memory) console.warn('Temporary storage: links disappear when the server restarts.');
  app.listen(port, () => console.log(`URL Shortener ready at http://localhost:${port}`));
}).catch(error => { console.error(error.message); process.exitCode = 1; });
