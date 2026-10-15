// ui/preload.js — the pure helpers behind the 素材预加载 panel. The panel itself needs a browser, but the URL
// walk, the scope filters and the throughput/ETA maths are plain functions (and the walk is what new asset
// classes such as skins depend on, so it is worth pinning down).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectAssetUrls, PRELOAD_SCOPES, preloadStats, scopeCounts,
  CODE_JOB_COUNT, ENGINE_ENTRY_MODULES, VENDOR_FILES,
} from '../../public/js/ui/preload.js';

/** Shaped like data/assets.json: file leaves nested arbitrarily deep, plus non-URL strings that must be ignored. */
const MANIFEST = {
  version: 1,
  hash: 'abc123',
  stats: { files: 5, bytes: 1000, chars: 1 },
  chars: {
    char_1: {
      avatar: '/assets/char/avatar/char_1.png',
      portrait: '/assets/char/portrait/char_1_1.png',
      spine: {
        front: {
          skel: '/assets/spine/op/char_1/front/char_1.skel',
          atlas: '/assets/spine/op/char_1/front/char_1.atlas',
          textures: ['/assets/spine/op/char_1/front/char_1.png'],
        },
      },
    },
  },
  enemies: { enemy_1: { icon: '/assets/enemy/icon/enemy_1.png', spineAliasOf: 'enemy_0' } },
  ui: { 'hud/icon_hp': '/assets/ui/hud/icon_hp.png' },
  skillsById: { skchr_1_1: 'skchr_1' },
  audio: {
    bgm: { lobby: '/assets/audio/bgm/lobby.mp3' },
    sfx: { battle: { deploy: '/assets/audio/sfx/deploy.mp3' }, units: { char_1: { attack: '/assets/audio/sfx/atk.mp3' } } },
  },
  fonts: { css: '/fonts/fonts.css', faces: { Bender: { woff2: '/fonts/bender.woff2' } } },
};

const urlsOf = (manifest) => collectAssetUrls(manifest);
const keepOf = (id, urls) => urls.filter(PRELOAD_SCOPES.find((s) => s.id === id).keep);

describe('preload: collectAssetUrls', () => {
  test('walks nested leaves and arrays, keeping only the asset roots', () => {
    const urls = urlsOf(MANIFEST);
    for (const u of [
      '/assets/char/avatar/char_1.png',
      '/assets/char/portrait/char_1_1.png',
      '/assets/spine/op/char_1/front/char_1.skel',
      '/assets/spine/op/char_1/front/char_1.atlas',
      '/assets/spine/op/char_1/front/char_1.png',
      '/assets/enemy/icon/enemy_1.png',
      '/assets/ui/hud/icon_hp.png',
      '/assets/audio/bgm/lobby.mp3',
      '/assets/audio/sfx/deploy.mp3',
      '/assets/audio/sfx/atk.mp3',
      '/fonts/fonts.css',
      '/fonts/bender.woff2',
    ]) assert.ok(urls.includes(u), `missing ${u}`);
  });

  test('ids and version strings are not mistaken for assets', () => {
    const urls = urlsOf(MANIFEST);
    for (const junk of ['skchr_1', 'enemy_0', 'abc123', 'enemy_1']) assert.ok(!urls.includes(junk), `kept ${junk}`);
  });

  test('deduplicates, and survives nulls / numbers / undefined', () => {
    const m = { a: '/assets/x.png', b: '/assets/x.png', c: [null, 1, { d: '/assets/x.png' }], e: undefined, f: 7 };
    assert.deepEqual(urlsOf(m), ['/assets/x.png']);
    assert.deepEqual(urlsOf(null), []);
    assert.deepEqual(urlsOf({}), []);
  });

  test('a new nested asset class is picked up without a schema change (skins)', () => {
    const m = { chars: { c1: { skins: { 'char_1@winter#1': { spine: { front: { skel: '/assets/spine/op/c1/winter/front/w.skel' } } } } } } };
    assert.deepEqual(urlsOf(m), ['/assets/spine/op/c1/winter/front/w.skel']);
  });
});

describe('preload: scopes', () => {
  const urls = urlsOf(MANIFEST);

  test('the scope ids and their order are stable', () => {
    assert.deepEqual(PRELOAD_SCOPES.map((s) => s.id), ['all', 'no-audio', 'units']);
  });

  test('every scope is a subset of "all"', () => {
    for (const sc of PRELOAD_SCOPES) {
      for (const u of urls.filter(sc.keep)) assert.ok(PRELOAD_SCOPES[0].keep(u), `${sc.id} kept ${u}`);
    }
  });

  test('no-audio drops exactly the audio tree', () => {
    const kept = keepOf('no-audio', urls);
    assert.ok(!kept.some((u) => u.startsWith('/assets/audio/')));
    assert.equal(kept.length, urls.length - 3, 'the three audio files are the only ones dropped');
  });

  test('units keeps models, portraits and icons, but not UI or audio or fonts', () => {
    const kept = keepOf('units', urls);
    assert.ok(kept.includes('/assets/spine/op/char_1/front/char_1.skel'));
    assert.ok(kept.includes('/assets/char/avatar/char_1.png'));
    assert.ok(kept.includes('/assets/enemy/icon/enemy_1.png'));
    assert.ok(!kept.includes('/assets/ui/hud/icon_hp.png'));
    assert.ok(!kept.includes('/fonts/fonts.css'));
    assert.ok(!kept.some((u) => u.startsWith('/assets/audio/')));
  });
});

describe('preload: the engine code is covered too', () => {
  test('the render engine entry and the dynamically-imported vendor bundles are both listed', () => {
    assert.ok(ENGINE_ENTRY_MODULES.includes('/js/render/app.js'), 'pulling the render tree hangs off this entry');
    // three.js is imported on demand by render/board3d/load.js, so importing the entries above never reaches it,
    // and it is the largest single file in the bundle
    assert.ok(VENDOR_FILES.includes('/vendor/three.module.js'));
    assert.ok(VENDOR_FILES.includes('/vendor/three.core.js'));
    assert.ok(VENDOR_FILES.includes('/vendor/pixi.min.js'));
    assert.equal(CODE_JOB_COUNT, ENGINE_ENTRY_MODULES.length + VENDOR_FILES.length);
  });

  test('nothing is listed twice, and none of it duplicates what the manifest already covers', () => {
    const all = [...ENGINE_ENTRY_MODULES, ...VENDOR_FILES];
    assert.equal(new Set(all).size, all.length, 'no duplicates');
    for (const u of all) assert.ok(!/^\/(assets|fonts)\//.test(u), `${u} is a manifest asset and must not be listed here`);
  });
});

describe('preload: scopeCounts', () => {
  test('counts every scope (assets + the engine-code jobs), and reuses the result per manifest object', () => {
    const a = scopeCounts(MANIFEST);
    assert.deepEqual(a.map((c) => c.sc.id), ['all', 'no-audio', 'units']);
    // every scope carries the code jobs, so the numbers are assets + CODE_JOB_COUNT
    assert.equal(a[0].n, urlsOf(MANIFEST).length + CODE_JOB_COUNT);
    assert.equal(a.find((c) => c.sc.id === 'no-audio').n, urlsOf(MANIFEST).length - 3 + CODE_JOB_COUNT);
    assert.equal(a.find((c) => c.sc.id === 'units').n, keepOf('units', urlsOf(MANIFEST)).length + CODE_JOB_COUNT);
    // the panel re-renders twice a second while running: the same object must not be walked again
    assert.equal(scopeCounts(MANIFEST), a, 'same manifest object → same cached result');
    assert.notEqual(scopeCounts({ ...MANIFEST }), a, 'a different object is counted again');
  });

  test('no manifest yet → null (the panel shows no counts)', () => {
    assert.equal(scopeCounts(null), null);
  });
});

describe('preload: preloadStats', () => {
  const base = { running: false, done: 0, total: 0, bytes: 0, startedAt: 0, elapsedMs: 0 };

  test('half way through, over 10 s, gives throughput and a remaining-time estimate in files/s', () => {
    const s = { ...base, running: true, startedAt: Date.now() - 10000, done: 50, total: 100, bytes: 10 * 1048576 };
    const st = preloadStats(s);
    assert.equal(Math.round(st.pct), 50);
    assert.ok(Math.abs(st.bytesPerSec - 1048576) < 1048576 * 0.15, `about 1 MB/s, got ${st.bytesPerSec}`);
    assert.ok(st.etaSec > 8 && st.etaSec < 12, `50 files to go at ~5 files/s, got ${st.etaSec}`);
    assert.equal(st.finished, false);
  });

  test('a finished run reports its measured elapsed time, and a stopped one promises no ETA', () => {
    const done = { ...base, done: 100, total: 100, bytes: 5 * 1048576, elapsedMs: 20000 };
    assert.equal(Math.round(preloadStats(done).bytesPerSec), Math.round((5 * 1048576) / 20));
    assert.equal(preloadStats(done).etaSec, Infinity, 'not running → nothing left to estimate');
  });

  test('finished only once every file has been accounted for', () => {
    assert.equal(preloadStats({ ...base, done: 100, total: 100 }).finished, true);
    assert.equal(preloadStats({ ...base, done: 99, total: 100 }).finished, false, 'a stopped run is not finished');
    assert.equal(preloadStats({ ...base, done: 0, total: 0 }).finished, false, 'nothing to do is not "finished"');
  });

  test('no div-by-zero before the first byte', () => {
    const st = preloadStats({ ...base, running: true, done: 0, total: 10, startedAt: Date.now() });
    assert.equal(st.bytesPerSec, 0);
    assert.equal(st.etaSec, Infinity);
  });
});
