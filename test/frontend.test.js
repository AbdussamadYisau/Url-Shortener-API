const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {transformSync} = require('esbuild');
const {JSDOM} = require('jsdom');

// Compile the actual JSX for component tests; the production entry mounts it separately.
require.extensions['.jsx'] = (module, filename) => module._compile(transformSync(readFileSync(filename,'utf8'),{loader:'jsx',jsx:'automatic',format:'cjs'}).code,filename);

test('focus refresh preserves draft/result, errors preserve the form, account changes clear it',async t=>{
  const dom = new JSDOM('<div id="root"></div>',{url:'http://localhost:8080'});
  global.window = dom.window;global.document = dom.window.document;global.location = dom.window.location;global.localStorage = dom.window.localStorage;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react');const {act} = React;const {createRoot} = require('react-dom/client');const App = require('../frontend/App.jsx').default;
  const root = createRoot(document.getElementById('root'));
  let user = {id:'alice',email:'alice@example.com'};
  let fail = false;
  let deferMe;
  const originalFetch = global.fetch;
  const row = {urlCode:'abc12345',shortUrl:'http://localhost:8080/abc12345',longUrl:'https://example.com/draft',date:new Date().toISOString()};
  global.fetch = async (path,options) => {
    if(path === '/api/auth/me') {
      if(fail) throw new Error('Offline');
      if(deferMe) await deferMe;
      return {ok:true,json:async()=>({user,googleEnabled:true,retentionDays:0})};
    }
    if(path === '/api/links') return {ok:true,json:async()=>({links:[]})};
    if(path === '/api/health') return {ok:true,json:async()=>({storage:'mongodb'})};
    if(path === '/api/url/shorten') {
      assert.equal(JSON.parse(options.body).longUrl,row.longUrl);
      return {ok:true,status:200,json:async()=>row};
    }
    throw new Error(`Unexpected request: ${path}`);
  };
  t.after(async()=>{await act(async()=>root.unmount());global.fetch=originalFetch;dom.window.close();});
  await act(async()=>root.render(React.createElement(App)));
  const input = document.getElementById('long-url');
  await act(async()=>{
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,row.longUrl);
    input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  });
  let resolveMe;
  deferMe = new Promise(resolve=>{resolveMe=resolve;});
  await act(async()=>window.dispatchEvent(new dom.window.Event('focus')));
  assert.equal(document.getElementById('long-url'),input,'refresh must not unmount the form while pending');
  assert.equal(input.value,row.longUrl);
  await act(async()=>{resolveMe();});deferMe=null;
  assert.equal(document.getElementById('long-url'),input);
  await act(async()=>document.getElementById('shorten-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(document.getElementById('result-link').textContent,row.shortUrl);
  await act(async()=>window.dispatchEvent(new dom.window.Event('focus')));
  assert.equal(document.getElementById('result-link').textContent,row.shortUrl);
  assert.equal(input.value,row.longUrl);
  fail=true;
  await act(async()=>window.dispatchEvent(new dom.window.Event('focus')));
  assert.equal(document.getElementById('long-url'),input);
  assert.ok(document.querySelector('[role="alert"]'));
  fail=false;user={id:'bob',email:'bob@example.com'};
  await act(async()=>window.dispatchEvent(new dom.window.Event('focus')));
  assert.equal(document.getElementById('long-url').value,'');
  assert.equal(document.getElementById('result-link'),null);
  assert.notEqual(document.getElementById('long-url'),input);
  user=null;
  await act(async()=>window.dispatchEvent(new dom.window.Event('focus')));
  assert.equal(document.getElementById('shorten-form'),null);
  assert.match(document.body.textContent,/Continue with Google/);
});
