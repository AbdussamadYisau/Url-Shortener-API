import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Layout from './Layout';

const historyKey = 'shortly.links.v1';
const paths = { arrow: 'M7 17 17 7M7 7h10v10', copy: 'M9 9h11v11H9zM15 9V4H4v11h5', check: 'm5 12 4 4L19 6' };
function Icon({name = 'arrow'}) { return <svg className="icon inline-block size-[1.15em] shrink-0 align-[-0.18em]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]}/></svg>; }
function safeUrl(value) { try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; } }
function readHistory() {
  try { const saved = JSON.parse(localStorage.getItem(historyKey) || '[]'); return Array.isArray(saved) ? saved.filter(row => row && safeUrl(row.shortUrl) && safeUrl(row.longUrl)).slice(0,20) : []; } catch { return []; }
}
function CopyButton({url, setNotice}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false),2000); }
    catch { setNotice({text:'Clipboard unavailable. Select the short link and copy it manually.', error:true}); }
  }
  return <button className="inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-md border border-[#49516b] bg-[#242c3f] px-3.5 py-2.5 text-[11px] text-[#c3b9ff]" type="button" aria-label={copied ? 'Copied' : `Copy ${url}`} onClick={copy}>{copied ? 'Copied' : 'Copy link'} <Icon name={copied ? 'check' : 'copy'}/></button>;
}
function Shortener({onCreated, setNotice, notice}) {
  const [longUrl, setLongUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [temporary, setTemporary] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', {signal:controller.signal}).then(res => res.json()).then(data => setTemporary(data.storage === 'temporary')).catch(() => {});
    return () => controller.abort();
  }, []);
  async function shorten(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setResult(null); setNotice({text:'Making your link a little smaller…'});
    try {
      const response = await fetch('/api/url/shorten', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({longUrl:longUrl.trim()}), signal:AbortSignal.timeout(15000)});
      const row = await response.json();
      if (!response.ok) throw new Error(row.error || 'Unable to shorten this link. Please try again.');
      if (!safeUrl(row.shortUrl) || !safeUrl(row.longUrl)) throw new Error('The server returned an invalid link.');
      setResult(row); setNotice({text:'Your link is ready to share.'}); onCreated(row);
    } catch(error) { setNotice({error:true,text:error.name === 'TimeoutError' ? 'The request timed out. Please try again.' : error instanceof TypeError ? 'Cannot reach the server. Check your connection and try again.' : error.message}); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-line bg-[#191f2d] px-[18px] py-[23px] min-[751px]:px-8 min-[751px]:py-[30px] shadow-[0_12px_50px_#0003]" aria-labelledby="form-title">
    <div className="flex items-center justify-between gap-[15px] [&>h2]:mb-[25px] [&>h2]:text-base min-[751px]:[&>h2]:text-lg [&>h2]:tracking-[-0.4px] [&>span]:hidden min-[751px]:[&>span]:block [&>span]:mb-[25px] [&>span]:font-mono [&>span]:text-[9px] [&>span]:tracking-[1px] [&>span]:text-[#9a9f94]"><h2 id="form-title">Give your link a little less length.</h2><span>01 / SHORTEN</span></div>
    <form id="shorten-form" onSubmit={shorten}><label htmlFor="long-url">Your long URL</label><div className="flex flex-wrap min-[751px]:flex-nowrap items-center gap-[5px] min-[751px]:gap-3 rounded-[9px] border border-[#3b465b] bg-[#101621] p-1.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent [&>span]:ml-3 [&>span]:inline-flex [&>span]:items-center [&>span]:text-[22px] [&>span]:text-[#89927d]"><span aria-hidden="true"><Icon/></span><input id="long-url" name="longUrl" type="url" placeholder="https://example.com/your-very-long-link" required maxLength={8192} autoComplete="url" aria-describedby="message" value={longUrl} onChange={event => setLongUrl(event.target.value)}/><button id="submit" className="inline-flex w-full min-[751px]:w-auto items-center justify-center gap-2.5 rounded-md border-0 bg-accent px-[22px] py-4 text-xs font-semibold text-[#141324]" type="submit" disabled={busy}>{busy ? 'Shortening…' : <>Shorten link <Icon/></>}</button></div></form>
    <p id="message" role="status" aria-live="polite" className={`mt-[13px] text-[11px] ${notice.error ? 'text-[#ffa898]' : 'text-muted'}`}>{notice.text}</p>
    {result && <div id="result" className="mt-5 flex flex-col min-[751px]:flex-row items-start min-[751px]:items-center justify-between gap-[15px] rounded-lg border border-[#49405f] bg-[#242139] p-[18px]"><div><span className="mb-2 block text-[8px] tracking-[1.4px] text-accent">YOUR LINK, SIMPLIFIED</span><a id="result-link" className="text-base text-accent wrap-anywhere" href={result.shortUrl} target="_blank" rel="noopener noreferrer">{result.shortUrl}</a></div><CopyButton key={result.shortUrl} url={result.shortUrl} setNotice={setNotice}/></div>}
    {temporary && <p id="storage-note" className="mt-[11px] text-[11px] text-[#b9ae83]">Local preview mode · Links are temporary and disappear when the server restarts.</p>}
  </section>;
}
function RecentLinks({links,onClear,setNotice}) {
  return <section className="my-[35px] min-[751px]:my-[45px] [&_.eyebrow]:text-[8px] [&_.eyebrow]:text-[#a8b3c7]" aria-labelledby="recent-title"><div className="flex items-center justify-between"><div><p className="flex items-center gap-2 text-[10px] font-bold tracking-[1.8px] [&>span]:size-1.5 [&>span]:rounded-full [&>span]:bg-accent">YOUR LITTLE COLLECTION</p><h2 id="recent-title">Recent links<span id="count" className="ml-2.5 rounded-full bg-[#29273d] px-2 py-[5px] align-middle text-[10px] text-[#c3b9ff]">{links.length}</span></h2></div>{links.length > 0 && <button id="clear" className="border-0 bg-transparent text-[11px] text-muted underline" type="button" onClick={onClear}>Clear history</button>}</div>
    <div id="history">{links.map(row => { const date = new Date(row.date); return <div className="flex items-center gap-2.5 min-[751px]:gap-[15px] border-b border-line py-5" key={row.shortUrl}><span className="hidden min-[751px]:inline-flex items-center justify-center rounded-[9px] bg-[#29273d] px-[13px] py-2.5 text-[#c3b9ff]"><Icon/></span><div className="min-w-0 flex-1 [&>a]:text-[13px] [&>a]:font-semibold [&>a]:text-accent [&>a]:no-underline [&>a]:wrap-anywhere [&>p]:mt-[7px] [&>p]:truncate [&>p]:text-[11px] [&>p]:text-muted"><a href={row.shortUrl} target="_blank" rel="noopener noreferrer">{row.shortUrl.replace(/^https?:\/\//,'')}</a><p title={row.longUrl}>{row.longUrl}</p></div><span className="hidden min-[751px]:block text-[10px] text-muted">{Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span><CopyButton url={row.shortUrl} setNotice={setNotice}/></div>; })}</div>
    {links.length === 0 && <div id="empty" className="mt-[5px] rounded-xl border border-dashed border-line px-[15px] py-[35px] text-center [&>span]:inline-flex [&>span]:items-center [&>span]:justify-center [&>span]:rounded-xl [&>span]:bg-[#29273d] [&>span]:px-[13px] [&>span]:py-2 [&>span]:text-2xl [&>span]:text-[#c3b9ff] [&>p]:text-[10px] [&>p]:text-[#8a9082]"><span><Icon/></span><h3>A fresh start for your links.</h3><p>Your shortened links will appear here, saved on this browser.</p></div>}
    <p className="mt-[15px] text-[10px] text-[#8a9082]">Your history stays in this browser. Clearing it doesn’t delete your short links.</p></section>;
}
function App() {
  const [links,setLinks] = useState(readHistory);
  const [notice,setNotice] = useState({text:'Paste a link. Make it short. Pass it on.'});
  function persist(next) { setLinks(next); try { localStorage.setItem(historyKey,JSON.stringify(next)); } catch { setNotice({text:'Browser storage is unavailable, so history will not persist.'}); } }
  function onCreated(row) { persist([row,...links.filter(item => item.urlCode !== row.urlCode)].slice(0,20)); }
  return <Layout><Shortener onCreated={onCreated} setNotice={setNotice} notice={notice}/><RecentLinks links={links} onClear={() => persist([])} setNotice={setNotice}/></Layout>;
}
createRoot(document.getElementById('root')).render(<App/>);
