const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const mongoose = require('mongoose');
const {MongoMemoryServer} = require('mongodb-memory-server-core');
const Model = require('../models/db');
const {createStore} = require('../lib/store');
const {migrateCreatedAt} = require('../scripts/migrate-created-at');
const DAY = 86400000;
const time = Date.UTC(2026,9,27);
const baseUrl = 'https://short.example';
function row(code,age,extras={}) {return {urlCode:code,ownerId:'alice',longUrl:`https://example.com/${code}`,shortUrl:`${baseUrl}/${code}`,createdAt:new Date(time-age*DAY),date:new Date(time-age*DAY).toISOString(),...extras};}

test('MongoDB retention and migration integration',async t=>{
  const mongo = await MongoMemoryServer.create({binary:{downloadDir:path.join(os.tmpdir(),'shortly-mongo-binaries')}});
  t.after(async()=>{await mongoose.disconnect();await mongo.stop();});
  await mongoose.connect(mongo.getUri(),{dbName:'shortly-tests'});
  await Model.init();
  const store = createStore({retentionDays:30,now:()=>time});
  await t.test('reads hide expired links and creating a replacement never deletes old records',async()=>{
    await Model.deleteMany({});
    await Model.create([row('old',31),row('boundary',30),row('live',1),row('other',1,{ownerId:'bob'})]);
    assert.equal(await store.find('old'),null);assert.equal(await store.find('boundary'),null);
    assert.equal((await store.find('live')).urlCode,'live');
    assert.deepEqual((await store.list('alice',baseUrl)).map(v=>v.urlCode),['live']);
    assert.equal(await Model.countDocuments({}),4);
    const replacement = await store.create('https://example.com/old',baseUrl,'alice');
    assert.notEqual(replacement.urlCode,'old');
    assert.equal(await Model.countDocuments({}),5);
    assert.equal((await store.create('https://example.com/old',baseUrl,'alice')).urlCode,replacement.urlCode);
    const disabled = createStore({retentionDays:0});
    assert.ok(await disabled.find('old'));assert.equal((await disabled.cleanup()).disabled,true);
    assert.equal(await Model.countDocuments({}),5);
  });
  await t.test('cleanup respects batch caps and resumes without deleting active links',async()=>{
    await Model.deleteMany({});
    await Model.create([0,1,2,3,4].map(i=>row(`expired${i}`,40+i)));
    await Model.create(row('active',1));
    assert.deepEqual(await store.cleanup({batchSize:2,maxBatches:1}),{deleted:2,batches:1,complete:false,disabled:false});
    assert.equal(await Model.countDocuments({}),4);
    const reports = await Promise.all([store.cleanup({batchSize:2}),store.cleanup({batchSize:2})]);
    assert.equal(reports.reduce((n,r)=>n+r.deleted,0),3);
    assert.deepEqual((await Model.find({}).lean()).map(v=>v.urlCode),['active']);
  });
  await t.test('cleanup checks its time budget before starting work',async()=>{
    await Model.deleteMany({});await Model.create(row('old',40));
    let tick=0;
    const timed = createStore({retentionDays:30,now:()=>time,clock:()=>{tick+=100;return tick;}});
    const report = await timed.cleanup({budgetMs:50});
    assert.equal(report.complete,false);assert.equal(report.deleted,0);assert.equal(await Model.countDocuments({}),1);
  });
  await t.test('migration is dry-run first, idempotent, and preserves malformed dates',async()=>{
    await Model.deleteMany({});
    const iso = row('legacy',40);delete iso.createdAt;
    const millis = {...iso,urlCode:'millis',date:String(time-40*DAY)};
    const invalid = {...iso,urlCode:'invalid',date:'not-a-date'};
    const existing = row('existing',1);
    await Model.collection.insertMany([iso,millis,invalid,existing]);
    assert.equal(await store.find('legacy'),null);
    assert.ok(await store.find('invalid'));
    assert.deepEqual((await store.list('alice',baseUrl)).map(v=>v.urlCode).sort(),['existing','invalid']);
    const dry = await migrateCreatedAt(Model.collection);
    assert.deepEqual(dry,{mode:'dry-run',scanned:3,valid:2,skipped:1,updated:0});
    assert.equal(await Model.countDocuments({createdAt:{$type:'date'}}),1);
    const applied = await migrateCreatedAt(Model.collection,{apply:true,batchSize:1});
    assert.equal(applied.updated,2);assert.equal(applied.skipped,1);
    assert.equal((await migrateCreatedAt(Model.collection,{apply:true})).updated,0);
    assert.equal((await Model.findOne({urlCode:'existing'}).lean()).createdAt.getTime(),existing.createdAt.getTime());
    const report = await store.cleanup();assert.equal(report.deleted,2);
    assert.deepEqual((await Model.find({}).lean()).map(v=>v.urlCode).sort(),['existing','invalid']);
  });
});
