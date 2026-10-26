const { randomBytes } = require('node:crypto');
const Model = require('../models/db');

function createStore({ memory = false } = {}) {
  const records = new Map();
  return {
    async create(longUrl, baseUrl) {
      const existing = memory ? [...records.values()].find(row => row.longUrl === longUrl) : await Model.findOne({ longUrl }).lean();
      if (existing) return { ...existing, shortUrl: `${baseUrl}/${existing.urlCode}` };
      for (let attempt = 0; attempt < 5; attempt++) {
        const urlCode = randomBytes(6).toString('base64url');
        const row = { longUrl, urlCode, shortUrl: `${baseUrl}/${urlCode}`, date: new Date().toISOString() };
        if (memory) {
          if (records.has(urlCode)) continue;
          records.set(urlCode, row);
          return row;
        }
        try { return (await Model.create(row)).toObject(); }
        catch (error) { if (error.code !== 11000) throw error; }
      }
      throw new Error('Could not allocate a unique short code');
    },
    async find(code) { return memory ? records.get(code) : Model.findOne({ urlCode: code }).lean(); },
  };
}
module.exports = { createStore };
