const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {createApp} = require('../app');
const {createStore} = require('../lib/store');
const {createAuthStore} = require('../lib/auth');
const baseUrl = 'https://short.example';
async function setup(t, options = {}) {
  let time = Date.now(); const now = () => time;
  const retentionDays = options.retentionDays || 0;
  const store = createStore({memory:true,retentionDays,now});
  const authStore = createAuthStore({memory:true,now});
  const google = {
    async start() {return {url:'https://accounts.google.com/o/oauth2/v2/auth',verifier:'verifier',nonce:'nonce'};},
    async finish(code,pending) {assert.equal(pending.verifier,'verifier');if(code === 'bad') throw new Error('bad token');return {id:code,email:`${code}@example.com`,name:code};},
  };
  const app = createApp({store,authStore,google,memory:true,trustProxy:1,baseUrl,retentionDays,cronSecret:'test-cron-secret',...options});
  const server = app.listen(0,'127.0.0.1');await new Promise(resolve => server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  // node:http preserves explicit Host headers for canonical-domain regression tests.
  const request = (path,opts={}) => new Promise((resolve,reject) => {
    const req = http.request(`${origin}${path}`,{method:opts.method || 'GET',headers:{host:'short.example','x-forwarded-proto':'https',...opts.headers}},res => {
      const chunks = [];
      res.on('data',chunk => chunks.push(chunk));
      res.on('end',() => {
        const headers = new Headers();
        for(let i=0;i<res.rawHeaders.length;i+=2) headers.append(res.rawHeaders[i],res.rawHeaders[i+1]);
        resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers}));
      });
    });
    req.on('error',reject);req.end(opts.body);
  });
  async function login(id) {
    const start = await request('/api/auth/google');
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const oauthCookie = start.headers.get('set-cookie').split(';')[0];
    const response = await request(`/api/auth/google/callback?state=${state}&code=${id}`,{headers:{cookie:oauthCookie}});
    assert.equal(response.status,302);
    const cookies = response.headers.getSetCookie();
    const session = cookies.find(value=>value.startsWith('__Host-shortly_session='));
    assert.ok(session);assert.match(session,/HttpOnly/);assert.match(session,/Secure/);assert.match(session,/SameSite=Lax/);
    return session.split(';')[0];
  }
  const post = (cookie,longUrl,extra={}) => request('/api/url/shorten',{method:'POST',headers:{origin:baseUrl,cookie,'Content-Type':'application/json',...extra},body:JSON.stringify({longUrl})});
  return {request,post,login,store,authStore,advance:ms=>{time+=ms;}};
}
test('private accounts, duplicate isolation, URL validation, logout and CSRF',async t=>{
  const {request,post,login} = await setup(t);
  assert.equal((await request('/')).status,200);
  assert.match(await (await request('/')).text(),/id="root"/);
  assert.equal((await request('/style.css')).status,200);
  assert.equal((await request('/api/links')).status,401);
  assert.equal((await post('','https://example.com')).status,401);
  const alice = await login('alice'), bob = await login('bob');
  for (const value of ['javascript:alert(1)','ftp://example.com','https://user:password@example.com','bad',null,{}]) assert.equal((await post(alice,value)).status,400);
  const a = await (await post(alice,'https://example.com/path')).json();
  const b = await (await post(bob,'https://example.com/path')).json();
  assert.match(a.urlCode,/^[\w-]{8}$/);assert.notEqual(a.urlCode,b.urlCode);
  assert.equal((await (await post(alice,a.longUrl)).json()).urlCode,a.urlCode);
  for (const [cookie,expected,other] of [[alice,a,b],[bob,b,a]]) {
    const response = await request('/api/links',{headers:{cookie}});
    assert.equal(response.headers.get('cache-control'),'no-store');
    const {links} = await response.json();assert.equal(links.length,1);assert.equal(links[0].urlCode,expected.urlCode);assert.ok(!JSON.stringify(links).includes(other.urlCode));assert.equal(links[0].ownerId,undefined);
  }
  const redirect = await request(`/${a.urlCode}`);assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),a.longUrl);
  assert.equal((await request('/missing')).status,404);
  assert.equal((await post(alice,a.longUrl,{origin:'https://evil.example'})).status,403);
  assert.equal((await request('/api/url/shorten',{method:'POST',headers:{cookie:alice,origin:baseUrl,'Content-Type':'application/json'},body:'{'})).status,400);
  assert.equal((await request('/api/auth/logout',{method:'POST',headers:{cookie:alice,origin:baseUrl}})).status,200);
  assert.equal((await request('/api/links',{headers:{cookie:alice}})).status,401);
  assert.equal((await request('/api/links',{headers:{cookie:bob}})).status,200);
});
test('OAuth state mismatch, replay and provider errors are rejected',async t=>{
  const {request} = await setup(t);
  assert.equal((await request('/api/auth/google/callback?state=wrong&code=alice')).status,400);
  const start = await request('/api/auth/google');const state = new URL(start.headers.get('location')).searchParams.get('state');const cookie = start.headers.get('set-cookie').split(';')[0];
  assert.equal((await request(`/api/auth/google/callback?state=wrong&code=alice`,{headers:{cookie}})).status,400);
  const callback = `/api/auth/google/callback?state=${state}&code=bad`;
  assert.equal((await request(callback,{headers:{cookie}})).headers.get('location'),'/?auth=failed');
  assert.equal((await request(callback.replace('code=bad','code=alice'),{headers:{cookie}})).headers.get('location'),'/?auth=failed');
});
test('expiry prevents redirects and cleanup deletes expired records',async t=>{
  const {request,post,login,advance,store} = await setup(t,{retentionDays:2});
  const alice = await login('alice');const row = await (await post(alice,'https://example.com')).json();
  assert.ok(row.expiresAt);advance(2*86400000);
  assert.equal((await request(`/${row.urlCode}`)).status,404);
  assert.equal((await request('/api/cron/cleanup')).status,401);
  const response = await request('/api/cron/cleanup',{headers:{authorization:'Bearer test-cron-secret'}});
  assert.deepEqual(await response.json(),{deleted:1});assert.equal(await store.find(row.urlCode),null);
  const fresh = await (await post(alice,'https://example.com')).json();assert.notEqual(row.urlCode,fresh.urlCode);
});
test('disabled retention preserves links, sessions expire, configuration is validated',async t=>{
  const {request,post,login,advance,store} = await setup(t);
  const session = await login('alice');const row = await (await post(session,'https://example.com')).json();assert.equal(row.expiresAt,null);
  advance(8*86400000);assert.equal((await request('/api/links',{headers:{cookie:session}})).status,401);assert.equal((await request(`/${row.urlCode}`)).status,302);assert.equal(await store.cleanup(),0);
  for(const retentionDays of [-1,NaN,1.5,36501]) assert.throws(()=>createStore({memory:true,retentionDays}));
});
test('creation is rate limited for signed-in users',async t=>{
  const {post,login} = await setup(t);const session = await login('alice');let response;
  for(let i=0;i<31;i++) response = await post(session,'https://example.com');
  assert.equal(response.status,429);
});
test('unconfigured Google sign-in fails closed',async t=>{
  const {request} = await setup(t,{google:null});
  assert.equal((await request('/api/auth/google')).status,503);
  assert.equal((await (await request('/api/auth/me')).json()).googleEnabled,false);
});

test('OAuth starts on the configured origin before setting state cookies',async t=>{
  const {request} = await setup(t);
  for (const headers of [
    {host:'old.vercel.app'},
    {host:'attacker.example','x-forwarded-host':'short.example'},
    {host:'short.example','x-forwarded-proto':'http'},
    {host:'short.example:8080'},
  ]) {
    const response = await request('/api/auth/google?next=https://attacker.example',{headers});
    assert.equal(response.status,302);
    assert.equal(response.headers.get('location'),'https://short.example/api/auth/google');
    assert.equal(response.headers.get('set-cookie'),null);
  }
  const response = await request('/api/auth/google');
  assert.equal(new URL(response.headers.get('location')).hostname,'accounts.google.com');
  assert.ok(response.headers.get('set-cookie').startsWith('__Host-shortly_oauth='));
});
