// 素材预加载 (Asset preload): walk data/assets.json and fetch every asset URL so the browser's HTTP cache is
// already warm the next time the game needs it.
//
// Why this exists: on a cold cache the client pulls several MB of modules before the render engine can mount, and
// ui/fieldHost.js gives that import 12 s (LOAD_TIMEOUT_MS) before falling back to the simplified DOM view. Over a
// slow or intercontinental link the first match therefore degrades and a reload fixes it — this panel pays that
// cost once, on purpose, with a progress bar instead of a surprise.
//
// Nothing here is game state. A cancelled run is just a partly filled cache (the browser keeps whatever arrived),
// so the panel is always resumable. 「清缓存重下」 re-runs the same walk with cache:'reload' — the only way a page
// can make a browser drop an HTTP cache entry that is still fresh (server/index.js serves art with a 30-day
// max-age, so an update would otherwise be masked for a month).
//
// Global & imperative like ui/guide.js: `openPreload()` opens it from anywhere; <PreloadHost/> is mounted once by
// main.js; <PreloadButton/> is the standard trigger (settings modal).

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Modal, Button, MicroLabel, ProgressBar, Spinner } from './components.js';
import { createStore, useStore } from '../store.js';
import { data } from '../data.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** Asset roots the manifest points at (`public/css` and `public/js` are code, not assets, and are left alone). */
const ASSET_URL = /^\/(assets|fonts)\//;

/**
 * Code the first match cannot do without, and which data/assets.json does NOT list — module imports are not
 * assets. Warming only the art (as this panel used to) leaves the render engine cold, and its import is what
 * ui/fieldHost.js puts a timeout on: miss it and the whole match drops to the simplified DOM view.
 *
 * These are `import()`ed, so the browser resolves and fetches their entire transitive graph. `/js/render/app.js`
 * is the big one: PixiJS, pixi-spine and the whole render/ tree hang off it.
 */
export const ENGINE_ENTRY_MODULES = Object.freeze([
  '/js/render/app.js',
  '/js/battle/runner.js',
  '/js/battle/observe.js',
]);

/**
 * Vendor bundles that are pulled with a *dynamic* import somewhere in the engine, so importing the entries above
 * does not reach them — three.js in particular is loaded on demand by render/board3d/load.js and is the single
 * largest file in the bundle. Fetched rather than imported: nothing executes, and the HTTP cache is keyed by URL,
 * so the later import() is a cache hit.
 */
export const VENDOR_FILES = Object.freeze([
  '/vendor/pixi.min.js',
  '/vendor/pixi-spine.js',
  '/vendor/preact.module.js',
  '/vendor/htm.module.js',
  '/vendor/hooks.module.js',
  '/vendor/three.module.js',
  '/vendor/three.core.js',
]);

/** How many extra jobs every scope carries on top of its assets. */
export const CODE_JOB_COUNT = ENGINE_ENTRY_MODULES.length + VENDOR_FILES.length;

/**
 * Every asset URL in the manifest, deduplicated.
 *
 * A blind recursive walk on purpose: the manifest nests files in leaves (`chars[id].avatar`, `spine.skel`,
 * `spine.textures[]`, `audio.sfx.units[id].skills[n]`, `ui['group/key']` …) and grows new classes over time —
 * skins, for instance. Matching by URL shape instead of by key keeps this working without a schema update.
 * @param {any} manifest data/assets.json
 * @returns {string[]} site-relative URLs
 */
export function collectAssetUrls(manifest) {
  const out = new Set();
  const walk = (v) => {
    if (typeof v === 'string') {
      if (ASSET_URL.test(v) && !out.has(v)) out.add(v);
      return;
    }
    if (Array.isArray(v)) { for (const x of v) walk(x); return; }
    if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k]);
  };
  walk(manifest);
  return [...out];
}

/**
 * What a run covers. `keep` filters a URL; the panel shows every scope with its file count so the choice is
 * informed before anything is downloaded.
 * @type {{ id: string, name: string, micro: string, hint: string, keep: (url: string) => boolean }[]}
 */
export const PRELOAD_SCOPES = [
  {
    id: 'all', name: '全部素材', micro: 'EVERYTHING',
    hint: '最完整。音频是大头，会花最久。',
    keep: () => true,
  },
  {
    id: 'no-audio', name: '不含音频', micro: 'NO AUDIO',
    hint: '跳过 BGM 与音效。渲染引擎代码与模型照常预热，日常开局选这个就够。',
    keep: (u) => !u.startsWith('/assets/audio/'),
  },
  {
    id: 'units', name: '仅干员与敌人', micro: 'UNITS ONLY',
    hint: '只下模型与立绘，最快，但界面素材仍会在用时临时下载。',
    keep: (u) => /^\/assets\/(char|spine|skill|prof|token|enemy)\//.test(u),
  },
];

/**
 * Scope → file count for the manifest. Cached per manifest object: the panel re-renders twice a second while a run
 * is in progress and walking a few thousand URLs on every frame would be pure waste.
 * @param {any} manifest
 */
let counted = null;
export function scopeCounts(manifest) {
  if (!manifest) return null;
  if (counted && counted.manifest === manifest) return counted.counts;
  const urls = collectAssetUrls(manifest);
  // every scope also carries the engine-code jobs, which no scope filters out
  const counts = PRELOAD_SCOPES.map((sc) => ({ sc, n: urls.filter(sc.keep).length + CODE_JOB_COUNT }));
  counted = { manifest, counts };
  return counts;
}

/** Concurrent downloads. The browser caps itself at ~6 per origin anyway. */
const CONCURRENCY = 6;

/**
 * Does this page sit on an address that is thrown away when the server restarts?
 *
 * Cloudflare's *quick* tunnels hand out a new random hostname every start, and the HTTP cache is keyed by origin
 * (scheme + host + port) — so everything preloaded through one is unreachable the next session, for every player.
 * Preloading cannot fix that and no amount of it helps; only a stable address can. Saying so in the panel is the
 * least this screen can do, because the symptom (a full re-download every time) otherwise looks like a bug here.
 */
function ephemeralOrigin() {
  const host = String(globalThis.location?.hostname || '');
  return /\.trycloudflare\.com$/i.test(host) || /\.ngrok\.(io|free)$/i.test(host) || /\.loca\.lt$/i.test(host);
}

const EMPTY = Object.freeze({
  open: false, running: false, reload: false, scope: 'no-audio',
  done: 0, total: 0, bytes: 0, failed: 0, skipped: 0, startedAt: 0, elapsedMs: 0, error: null,
});

/**
 * Did this URL come from the HTTP cache rather than the network?
 *
 * The Performance API answers it exactly: a cache hit reports `transferSize: 0` (nothing crossed the wire), a real
 * download reports the bytes it moved.
 *
 * Asking *before* fetching would avoid the cache read, but the only way to question the HTTP cache directly is
 * `cache: 'only-if-cached'` — and Chrome logs an alarming `net::ERR_CACHE_MISS` console error on every miss.
 * Thousands of red lines to answer a question that can be answered for free afterwards is a bad trade.
 * @param {string} url
 */
function wasFromCache(url) {
  try {
    const entries = performance.getEntriesByName(url, 'resource');
    const e = entries[entries.length - 1];
    return !!e && e.transferSize === 0 && e.decodedBodySize > 0;
  } catch { return false; }
}

export const preloadStore = createStore({ ...EMPTY });

let controller = null;

/** Open the panel (kicks off the manifest load it needs for the counts). */
export function openPreload() {
  preloadStore.set({ ...preloadStore.get(), open: true, error: null });
  data.load('assets').catch(() => {});
}
export const closePreload = () => preloadStore.set({ ...preloadStore.get(), open: false });

/**
 * Stop the current run. Downloads already finished stay in the cache, so a stopped run is a valid partial state.
 * A run is stopped by setting `running: false`; runPreload() then returns without touching the store again.
 */
export function cancelPreload() {
  if (controller) { controller.abort(); controller = null; }
  const s = preloadStore.get();
  if (s.running) preloadStore.set({ ...s, running: false, elapsedMs: Date.now() - s.startedAt });
}

/**
 * Download every URL of a scope into the HTTP cache.
 * @param {{ scopeId?: string, reload?: boolean }} [opts] `reload` re-downloads through the cache (「清缓存重下」)
 */
export async function runPreload({ scopeId, reload } = {}) {
  if (preloadStore.get().running) return;
  const scope = PRELOAD_SCOPES.find((s) => s.id === (scopeId || preloadStore.get().scope)) || PRELOAD_SCOPES[0];

  preloadStore.set({ ...EMPTY, open: true, running: true, reload: !!reload, scope: scope.id, startedAt: Date.now() });

  let jobs;
  try {
    await data.load('assets');
    const manifest = data.get('assets');
    if (!manifest) throw new Error('素材清单未能加载 / manifest unavailable');
    jobs = [
      // engine code first: it is a few MB and it is the part whose import the field view times out on, so it is
      // the one that decides whether the first match renders properly
      ...ENGINE_ENTRY_MODULES.map((url) => ({ kind: 'import', url })),
      ...VENDOR_FILES.map((url) => ({ kind: 'fetch', url })),
      ...collectAssetUrls(manifest).filter(scope.keep).map((url) => ({ kind: 'fetch', url })),
    ];
  } catch (e) {
    preloadStore.set({ ...preloadStore.get(), running: false, error: String(e?.message || e) });
    return;
  }

  const startedAt = Date.now();
  preloadStore.set({ ...preloadStore.get(), total: jobs.length });

  controller = typeof AbortController === 'function' ? new AbortController() : null;
  const signal = controller ? controller.signal : undefined;
  let cursor = 0;

  const worker = async () => {
    while (cursor < jobs.length) {
      if (signal?.aborted || !preloadStore.get().running) return;
      const job = jobs[cursor++];
      try {
        let bytes = 0;
        let cached = false;
        if (job.kind === 'import') {
          // a dynamic import resolves the whole transitive graph, so one call warms the render tree
          await import(job.url);
        } else {
          // the body must be drained for the response to land in the cache
          const res = await fetch(job.url, { cache: reload ? 'reload' : 'default', signal });
          if (!res.ok) throw new Error(String(res.status));
          bytes = (await res.arrayBuffer()).byteLength;
          // 「清缓存重下」 exists to go past the cache, so its bytes are never reported as a free hit
          cached = !reload && wasFromCache(job.url);
        }
        const s = preloadStore.get();
        preloadStore.set(cached
          ? { ...s, done: s.done + 1, skipped: s.skipped + 1 }
          : { ...s, done: s.done + 1, bytes: s.bytes + bytes });
      } catch (e) {
        if (signal?.aborted) return;
        const s = preloadStore.get();
        // a 404 (a manifest entry whose file is gone) must not stop the run
        preloadStore.set({ ...s, done: s.done + 1, failed: s.failed + 1 });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));

  const s = preloadStore.get();
  const elapsedMs = Date.now() - startedAt;
  preloadStore.set({ ...s, running: false, elapsedMs: s.elapsedMs + elapsedMs });
  if (controller) controller = null;
}

const fmtBytes = (n) => {
  if (!Number.isFinite(n) || n <= 0) return '0 MB';
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
};

const fmtEta = (sec) => {
  if (!Number.isFinite(sec) || sec <= 0) return '—';
  if (sec < 60) return `${Math.ceil(sec)} 秒`;
  if (sec < 3600) return `${Math.ceil(sec / 60)} 分钟`;
  return `${(sec / 3600).toFixed(1)} 小时`;
};

/**
 * Live figures for the panel: throughput and the remaining-time estimate both come from what has actually
 * arrived, because the manifest carries no per-file sizes (only the run's own progress can be measured).
 * @param {typeof EMPTY} s
 */
export function preloadStats(s) {
  const elapsed = s.running ? Math.max(0, Date.now() - s.startedAt) : s.elapsedMs;
  const secs = elapsed / 1000;
  const rate = secs > 0 ? s.done / secs : 0;
  const remaining = Math.max(0, s.total - s.done);
  return {
    pct: s.total > 0 ? (s.done / s.total) * 100 : 0,
    bytesPerSec: secs > 0 ? s.bytes / secs : 0,
    etaSec: s.running && rate > 0 ? remaining / rate : Infinity,
    finished: !s.running && s.total > 0 && s.done >= s.total,
  };
}

/** The preload panel. Mounted once by main.js. */
export function PreloadHost() {
  const s = useStore((v) => v, Object.is, preloadStore);
  // re-render on a timer while running: throughput and the ETA are derived from the wall clock
  const [, tick] = useState(0);
  useEffect(() => {
    if (!s.running) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [s.running]);

  if (!s.open) return null;
  const manifest = data.get('assets');
  const stats = preloadStats(s);
  const scope = PRELOAD_SCOPES.find((x) => x.id === s.scope) || PRELOAD_SCOPES[0];
  const counts = scopeCounts(manifest);

  return html`<${Modal} open=${s.open} onClose=${closePreload} title="预加载素材" micro="PRELOAD ASSETS" width="7.4rem"
    actions=${s.running
      ? html`<${Button} variant="secondary" icon="close" onClick=${cancelPreload}>停止<//>`
      : html`<${Button} variant="secondary" icon="close" onClick=${closePreload}>关闭<//>
          <${Button} variant="primary" icon="check" onClick=${() => runPreload({ scopeId: s.scope })}
            disabled=${!manifest}>开始下载<//>`}>
    <div class="set-list">
      ${ephemeralOrigin() ? html`<p class="set-hint lo-warn">
        <b>⚠ 当前地址是临时隧道，重启就会变。</b><br />
        浏览器缓存<strong>按网址隔离</strong>，所以每次重启后<strong>这个面板里下的东西全部作废</strong>，你和每个朋友都要重下。
        预加载救不了这件事，只有固定地址能救——见 <code>docs/DEPLOY.md</code> 的 Tailscale / IPv6 两节。
      </p>` : null}

      <p class="set-hint">
        提前把素材和渲染引擎代码下进浏览器缓存，之后开局的首次加载就快了。<br />
        <span class="t-dim">渲染引擎代码（PixiJS / three.js / 渲染树）无论选哪个范围都会一并预热——首次进战场卡进「简化视图」就是它没加载完。</span><br />
        <span class="t-dim">已经在缓存里的会直接跳过，只下缺的。<b>缓存跟着网址走</b>：网址一变（换端口、换隧道地址、localhost ↔ 公网地址）就要重下。</span><br />
        下载中断也没关系——浏览器会保留已下完的部分，下次继续。
      </p>

      <div class="set-row">
        <span class="set-row__label">下载范围<${MicroLabel}>SCOPE<//></span>
        <div class="set-seg" role="radiogroup">
          ${PRELOAD_SCOPES.map((sc) => {
            const n = counts ? counts.find((c) => c.sc.id === sc.id).n : null;
            return html`<button key=${sc.id} type="button" role="radio" aria-checked=${s.scope === sc.id ? 'true' : 'false'}
              class=${s.scope === sc.id ? 'is-on' : ''} disabled=${s.running}
              onClick=${() => preloadStore.set({ ...s, scope: sc.id })}>${sc.name}${n != null ? ` (${n})` : ''}</button>`;
          })}
        </div>
      </div>
      <p class="set-hint">${scope.hint}</p>

      ${s.total > 0 ? html`<${ProgressBar} value=${s.done} max=${s.total} label="已下载文件" showValue=${true} />` : null}

      ${s.running || s.done > 0
        ? html`<div class="set-hint">
            <span>${s.done} / ${s.total} 个${s.skipped ? html`（其中 <b class="num">${s.skipped}</b> 个已在浏览器缓存里，直接跳过）` : null}</span>
            <span> · 本次下载 ${fmtBytes(s.bytes)}</span>
            ${s.running ? html`<span> · ${fmtBytes(stats.bytesPerSec)}/s · 剩余约 ${fmtEta(stats.etaSec)}</span>` : null}
            ${s.failed > 0 ? html`<span> · 失败 ${s.failed}</span>` : null}
          </div>`
        : null}

      ${s.running ? html`<div class="set-hint"><${Spinner} /> 下载中…可以关掉这个窗口，下载会在后台继续。</div>` : null}
      ${stats.finished && !s.running
        ? html`<p class="set-hint">✔ 完成。${s.failed > 0 ? `有 ${s.failed} 个文件下载失败（多半是清单里有已失效的条目，不影响游戏）。` : ''}</p>`
        : null}
      ${!s.running && s.done > 0 && !stats.finished
        ? html`<p class="set-hint">已停止。已下载的会保留，随时可以继续。</p>`
        : null}
      ${s.error ? html`<p class="set-hint">加载素材清单失败：${s.error}</p>` : null}

      <div class="set-row">
        <span class="set-row__label">画面出现旧素材<${MicroLabel}>STALE ART<//></span>
        <${Button} size="sm" variant="secondary" icon="rotate" disabled=${s.running || !manifest}
          onClick=${() => runPreload({ scopeId: s.scope, reload: true })}>清缓存重下<//>
      </div>
      <p class="set-hint">
        服务器把素材缓存 30 天，所以游戏更新后浏览器可能还在用旧文件 —— 点这个按钮绕过缓存重下一遍。
      </p>
    </div>
  <//>`;
}

/**
 * 「清缓存重下」: re-fetch everything of the current scope bypassing the cache. A browser offers no API to delete
 * individual cache entries, so `cache: 'reload'` (revalidate + refill) is the way to pick up rewritten art.
 */
export const PreloadButton = ({ class: cls, ...rest }) =>
  html`<${Button} variant="secondary" icon="refresh" class=${cx('set-preload', cls)} onClick=${openPreload} ...${rest}>
    预加载素材<//>`;
