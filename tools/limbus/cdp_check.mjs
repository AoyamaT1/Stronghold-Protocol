// tools/limbus/cdp_check.mjs — drive headless Chrome over CDP to read a dev page's #out after it finishes.
// usage: node cdp_check.mjs <pageUrl> [titleDone=DONE] [timeoutMs=30000]
import { WebSocket } from 'ws';
import http from 'node:http';

const PAGE = process.argv[2];
const DONE = process.argv[3] || 'DONE';
const TIMEOUT = Number(process.argv[4]) || 30000;
const CDP = 'http://127.0.0.1:9222';

const getJSON = (url) => new Promise((res, rej) => {
  http.get(url, (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});

async function main() {
  // reuse the existing about:blank page target; we navigate it ourselves
  const targets = await getJSON(`${CDP}/json/list`);
  const t = targets.find((x) => x.type === 'page');
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pending = new Map();
  const send = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.on('message', (m) => { const o = JSON.parse(m); if (o.id && pending.has(o.id)) { pending.get(o.id)(o.result); pending.delete(o.id); } });
  await new Promise((r) => ws.on('open', r));
  await send('Runtime.enable', {});
  await send('Page.enable', {});
  await send('Page.navigate', { url: PAGE });
  const until = Date.now() + TIMEOUT;
  let out = '(timeout before DONE)';
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 500));
    const tt = await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
    const txt = await send('Runtime.evaluate', { expression: "document.getElementById('out')?document.getElementById('out').textContent:'(no #out)'", returnByValue: true });
    out = txt.result?.value ?? out;
    if (tt.result?.value === DONE) break;
  }
  console.log(out);
  ws.close();
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
