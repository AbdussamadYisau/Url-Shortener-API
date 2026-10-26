require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { createApp } = require('./app');
const { createStore } = require('./lib/store');
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
const app = createApp({ store: createStore({ memory }), memory, baseUrl: process.env.BASE_URL || process.env.host || `http://localhost:${port}`, trustProxy: process.env.TRUST_PROXY === '1' ? 1 : false });
const handler = async (req, res) => {
  try { await ready(); app(req, res); }
  catch (error) { console.error(error.message); res.statusCode = 503; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'Storage unavailable. Please try again later.' })); }
};
module.exports = handler;
if (require.main === module) ready().then(() => {
  if (memory) console.warn('Temporary storage: links disappear when the server restarts.');
  app.listen(port, () => console.log(`URL Shortener ready at http://localhost:${port}`));
}).catch(error => { console.error(error.message); process.exitCode = 1; });
