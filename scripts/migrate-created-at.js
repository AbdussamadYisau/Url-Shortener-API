require('dotenv').config({quiet:true});
const mongoose = require('mongoose');
const Model = require('../models/db');
const {creationDate} = require('../lib/retention');

async function migrateCreatedAt(collection,{apply = false,batchSize = 500} = {}) {
  const report = {mode:apply ? 'apply' : 'dry-run',scanned:0,valid:0,skipped:0,updated:0};
  let operations = [];
  async function flush() {
    if (apply && operations.length) report.updated += (await collection.bulkWrite(operations,{ordered:false})).modifiedCount;
    operations = [];
  }
  const cursor = collection.find({createdAt:null},{projection:{_id:1,date:1}}).batchSize(batchSize);
  try {
    for await (const row of cursor) {
      report.scanned++;
      const createdAt = creationDate(row);
      if (!createdAt) { report.skipped++;continue; }
      report.valid++;
      if (apply) operations.push({updateOne:{filter:{_id:row._id,createdAt:null,date:row.date},update:{$set:{createdAt}}}});
      if (operations.length >= batchSize) await flush();
    }
    await flush();
    if (apply) await collection.createIndex({createdAt:1});
    return report;
  } finally { await cursor.close(); }
}
module.exports = {migrateCreatedAt};
if (require.main === module) {
  (async()=>{
    if (process.argv.slice(2).some(arg=>arg !== '--apply')) throw new Error('Usage: npm run migrate:created-at -- [--apply]');
    const uri = process.env.DB_CONNECTION || process.env.MONGODB_URI;
    if (!uri) throw new Error('Set MONGODB_URI or DB_CONNECTION for the database to migrate.');
    await mongoose.connect(uri,{serverSelectionTimeoutMS:10000,autoIndex:false});
    console.log(JSON.stringify(await migrateCreatedAt(Model.collection,{apply:process.argv.includes('--apply')})));
  })().catch(error=>{console.error('Migration failed:',error.message);process.exitCode=1;}).finally(()=>mongoose.disconnect());
}
