function icon(name) {
  const paths = {'arrow': 'M7 17 17 7M7 7h10v10', 'down': 'M12 4v16m-6-6 6 6 6-6', 'copy': 'M9 9h11v11H9zM15 9V4H4v11h5', 'check': 'm5 12 4 4L19 6', 'circle': 'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0M12 8v8m-4-4h8', 'spark': 'm12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z'};
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({class: 'icon', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false'})) svg.setAttribute(key, value);
  const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', paths[name]); svg.append(path); return svg;
}
function buttonLabel(button, label, name) { button.replaceChildren(document.createTextNode(label + ' '), icon(name)); }
const key = 'shortly.links.v1';
const form = document.querySelector('#shorten-form');
const message = document.querySelector('#message');
const submit = document.querySelector('#submit');
let links = [];
function safeUrl(value) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } }
try { const saved = JSON.parse(localStorage.getItem(key) || '[]'); if (Array.isArray(saved)) links = saved.filter(row => row && safeUrl(row.shortUrl) && safeUrl(row.longUrl)).slice(0, 20); } catch {}
function save() { try { localStorage.setItem(key, JSON.stringify(links)); } catch { message.textContent = 'Link created. Browser storage is unavailable, so history will not persist.'; } }
async function copy(value, button) {
  try { await navigator.clipboard.writeText(value); buttonLabel(button, 'Copied', 'check'); setTimeout(() => { buttonLabel(button, 'Copy link', 'copy'); }, 2000); }
  catch { message.textContent = 'Clipboard unavailable. Select the short link and copy it manually.'; }
}
function render() {
  const history = document.querySelector('#history'); history.replaceChildren();
  document.querySelector('#empty').hidden = links.length > 0;
  document.querySelector('#clear').hidden = links.length === 0;
  document.querySelector('#count').textContent = links.length;
  for (const row of links) {
    const item = document.createElement('div'); item.className = 'history-row';
    const badge = document.createElement('span'); badge.className = 'link-icon'; badge.append(icon('arrow'));
    const details = document.createElement('div'); details.className = 'link-details';
    const anchor = document.createElement('a'); anchor.href = row.shortUrl; anchor.textContent = row.shortUrl.replace(/^https?:\/\//, ''); anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
    const original = document.createElement('p'); original.textContent = row.longUrl; original.title = row.longUrl;
    details.append(anchor, original);
    const date = document.createElement('span'); date.className = 'link-date'; const parsed = new Date(row.date); date.textContent = Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const button = document.createElement('button'); button.type = 'button'; button.className = 'copy'; buttonLabel(button, 'Copy link', 'copy'); button.setAttribute('aria-label', `Copy ${row.shortUrl}`); button.addEventListener('click', () => copy(row.shortUrl, button));
    item.append(badge, details, date, button); history.append(item);
  }
}
form.addEventListener('submit', async event => {
  event.preventDefault(); submit.disabled = true; submit.textContent = 'Shortening…'; message.className = ''; message.textContent = 'Making your link a little smaller…'; document.querySelector('#result').hidden = true;
  try {
    const response = await fetch('/api/url/shorten', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ longUrl: form.elements.longUrl.value.trim() }), signal: AbortSignal.timeout(15000) });
    const row = await response.json();
    if (!response.ok) throw new Error(row.error || 'Unable to shorten this link. Please try again.');
    if (!safeUrl(row.shortUrl) || !safeUrl(row.longUrl)) throw new Error('The server returned an invalid link.');
    const anchor = document.querySelector('#result-link'); anchor.href = row.shortUrl; anchor.textContent = row.shortUrl;
    const button = document.querySelector('#copy-result'); buttonLabel(button, 'Copy link', 'copy'); button.onclick = () => copy(row.shortUrl, button);
    document.querySelector('#result').hidden = false; message.textContent = 'Your link is ready to share.';
    links = [row, ...links.filter(item => item.urlCode !== row.urlCode)].slice(0, 20); save(); render();
  } catch (error) { message.className = 'error'; message.textContent = error.name === 'TimeoutError' ? 'The request timed out. Please try again.' : error instanceof TypeError ? 'Cannot reach the server. Check your connection and try again.' : error.message; }
  finally { submit.disabled = false; buttonLabel(submit, 'Shorten link', 'arrow'); }
});
document.querySelector('#clear').addEventListener('click', () => { links = []; save(); render(); });
fetch('/api/health').then(response => response.json()).then(data => { document.querySelector('#storage-note').hidden = data.storage !== 'temporary'; }).catch(() => {});
render();

const styleButtons = [...document.querySelectorAll('[data-style]')];
function setStyle(style) {
  if (!styleButtons.some(button => button.dataset.style === style)) style = 'midnight';
  document.documentElement.dataset.style = style;
  for (const button of styleButtons) button.setAttribute('aria-pressed', String(button.dataset.style === style));
  try { localStorage.setItem('shortly.style', style); } catch {}
}
for (const button of styleButtons) button.addEventListener('click', () => setStyle(button.dataset.style));
try { setStyle(localStorage.getItem('shortly.style') || 'midnight'); } catch { setStyle('midnight'); }
