const { randomBytes } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const Model = require('../models/db');
const {retentionPolicy} = require('./retention');

function createStore({memory = false, retentionDays = 0, now = () => Date.now(), clock = () => performance.now(), model = Model} = {}) {
  const policy = retentionPolicy(retentionDays,now);
  const records = new Map();
  const serialize = (row,baseUrl) => ({longUrl:row.longUrl,urlCode:row.urlCode,shortUrl:`${baseUrl}/${row.urlCode}`,date:row.date,expiresAt:policy.expiresAt(row)});
  return {
    async cleanup({batchSize = 500, maxBatches = 20, budgetMs = 5000} = {}) {
      if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000 || !Number.isInteger(maxBatches) || maxBatches < 1 || maxBatches > 100 || !Number.isInteger(budgetMs) || budgetMs < 1 || budgetMs > 20000) throw new Error('Invalid cleanup limits');
      const started = clock();
      const report = {deleted:0,batches:0,complete:true,disabled:!retentionDays};
      if (!retentionDays) return report;
      const cutoff = policy.cutoff(); // One consistent boundary per run.
      const remaining = () => Math.max(1,Math.floor(budgetMs-(clock()-started)));
      try {
        while (report.batches < maxBatches && clock()-started < budgetMs) {
          const rows = memory
            ? [...records.values()].filter(row=>row.createdAt <= cutoff).slice(0,batchSize)
            : await model.find({createdAt:{$lte:cutoff}}).sort({createdAt:1}).select({_id:1}).limit(batchSize).maxTimeMS(remaining()).lean();
          if (!rows.length) return report;
          if (clock()-started >= budgetMs) break;
          if (memory) { for (const row of rows) {records.delete(row.urlCode);report.deleted++;} }
          else {
            // Recheck age in case a record changed after selection; safe for overlapping cron runs.
            const result = await model.deleteMany({_id:{$in:rows.map(row=>row._id)},createdAt:{$lte:cutoff}},{maxTimeMS:remaining()});
            report.deleted += result.deletedCount;
          }
          report.batches++;
          if (rows.length < batchSize) return report;
        }
        report.complete = false; // Work may remain; the next cron invocation resumes it.
        return report;
      } catch(error) {
        console.error(JSON.stringify({event:'link_cleanup_failed',...report,code:error.code || 'unknown'}));
        throw error;
      }
    },
    async create(longUrl,baseUrl,ownerId) {
      if (!ownerId) throw new Error('Owner required');
      const existing = memory
        ? [...records.values()].find(row=>row.longUrl === longUrl && row.ownerId === ownerId && !policy.expired(row))
        : await model.findOne({longUrl,ownerId,...policy.activeFilter()}).sort({createdAt:-1}).lean();
      if (existing && !policy.expired(existing)) return serialize(existing,baseUrl);
      for (let attempt=0;attempt<5;attempt++) {
        const urlCode = randomBytes(6).toString('base64url');
        const row = {longUrl,urlCode,shortUrl:`${baseUrl}/${urlCode}`,ownerId,date:new Date(now()).toISOString(),createdAt:new Date(now())};
        if (memory) {if(records.has(urlCode)) continue;records.set(urlCode,row);return serialize(row,baseUrl);}
        try {return serialize((await model.create(row)).toObject(),baseUrl);} catch(error) {if(error.code !== 11000) throw error;}
      }
      throw new Error('Could not allocate a unique short code');
    },
    async list(ownerId,baseUrl) {
      if (!ownerId) throw new Error('Owner required');
      const rows = memory
        ? [...records.values()].filter(row=>row.ownerId === ownerId && !policy.expired(row)).sort((a,b)=>+b.createdAt-+a.createdAt).slice(0,100)
        : await model.find({ownerId,...policy.activeFilter()}).sort({createdAt:-1}).limit(100).lean();
      return rows.filter(row=>!policy.expired(row)).map(row=>serialize(row,baseUrl));
    },
    async find(code) {
      const row = memory ? records.get(code) : await model.findOne({urlCode:code,...policy.activeFilter()}).lean();
      return row && !policy.expired(row) ? row : null;
    },
  };
}
module.exports = {createStore};
