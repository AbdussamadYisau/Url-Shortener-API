const { randomBytes } = require('node:crypto');
const Model = require('../models/db');
function createStore({ memory = false, retentionDays = 0, now = () => Date.now() } = {}) {
  if (!Number.isInteger(retentionDays) || retentionDays < 0 || retentionDays > 36500) throw new Error('LINK_RETENTION_DAYS must be an integer between 0 and 36500.');
  const records = new Map();
  const expired = row => retentionDays > 0 && new Date(row.createdAt || row.date).getTime() <= now()-retentionDays*86400000;
  const cutoffQuery = () => ({$expr:{$lte:[{$convert:{input:{$ifNull:['$createdAt','$date']},to:'date',onError:new Date(8640000000000000),onNull:new Date(8640000000000000)}},new Date(now()-retentionDays*86400000)]}});
  const serialize = (row,baseUrl) => ({longUrl:row.longUrl,urlCode:row.urlCode,shortUrl:`${baseUrl}/${row.urlCode}`,date:row.date,expiresAt:retentionDays ? new Date(new Date(row.createdAt || row.date).getTime()+retentionDays*86400000).toISOString() : null});
  return {
    async cleanup() {
      if (!retentionDays) return 0;
      if (!memory) return (await Model.deleteMany(cutoffQuery())).deletedCount;
      let deleted = 0; for (const [key,row] of records) if (expired(row)) {records.delete(key);deleted++;} return deleted;
    },
    async create(longUrl,baseUrl,ownerId) {
      if (!ownerId) throw new Error('Owner required');
      await this.cleanup();
      const existing = memory ? [...records.values()].find(row=>row.longUrl === longUrl && row.ownerId === ownerId) : await Model.findOne({longUrl,ownerId}).lean();
      if (existing) return serialize(existing,baseUrl);
      for (let attempt=0;attempt<5;attempt++) {
        const urlCode = randomBytes(6).toString('base64url');
        const row = {longUrl,urlCode,shortUrl:`${baseUrl}/${urlCode}`,ownerId,date:new Date(now()).toISOString(),createdAt:new Date(now())};
        if (memory) {if(records.has(urlCode)) continue;records.set(urlCode,row);return serialize(row,baseUrl);}
        try {return serialize((await Model.create(row)).toObject(),baseUrl);} catch(error) {if(error.code !== 11000) throw error;}
      }
      throw new Error('Could not allocate a unique short code');
    },
    async list(ownerId,baseUrl) {
      await this.cleanup();
      const rows = memory ? [...records.values()].filter(row=>row.ownerId === ownerId).sort((a,b)=>+b.createdAt-+a.createdAt).slice(0,100) : await Model.find({ownerId}).sort({createdAt:-1}).limit(100).lean();
      return rows.map(row=>serialize(row,baseUrl));
    },
    async find(code) { const row = memory ? records.get(code) : await Model.findOne({urlCode:code}).lean();return row && !expired(row) ? row : null; },
  };
}
module.exports = {createStore};
