const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../app');
const { createStore } = require('../lib/store');

test('frontend, API validation, duplicate URLs, redirects and errors', async t => {
  const app = createApp({ store: createStore({ memory: true }), memory: true, baseUrl: 'https://short.example' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = body => fetch(`${origin}/api/url/shorten`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const home = await fetch(origin); assert.equal(home.status, 200); assert.match(await home.text(), /id="root"/);
  assert.equal((await fetch(`${origin}/style.css`)).status, 200);
  assert.equal((await (await fetch(`${origin}/api/health`)).json()).storage, 'temporary');
  for (const longUrl of ['javascript:alert(1)', 'ftp://example.com', 'https://user:password@example.com', 'bad', null, { bad: true }]) assert.equal((await post({ longUrl })).status, 400);
  const row = await (await post({ longUrl: 'https://example.com/path?hello=world' })).json();
  assert.match(row.urlCode, /^[\w-]{8}$/); assert.equal(row.shortUrl, `https://short.example/${row.urlCode}`);
  const duplicate = await (await post({ longUrl: row.longUrl })).json(); assert.equal(duplicate.urlCode, row.urlCode);
  const redirect = await fetch(`${origin}/${row.urlCode}`, { redirect: 'manual' }); assert.equal(redirect.status, 302); assert.equal(redirect.headers.get('location'), row.longUrl);
  assert.equal((await fetch(`${origin}/missing`)).status, 404);
  assert.equal((await fetch(`${origin}/api/url/shorten`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
});
test('creation is rate limited', async t => {
  const app = createApp({ store: createStore({ memory: true }), baseUrl: 'https://short.example' });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  let response;
  for (let i = 0; i < 31; i++) response = await fetch(`http://127.0.0.1:${server.address().port}/api/url/shorten`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ longUrl: 'https://example.com' }) });
  assert.equal(response.status, 429); assert.match((await response.json()).error, /Too many/);
});
