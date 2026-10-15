// Browser E2E for 素材预加载 (public/js/ui/preload.js) in headless Chrome (puppeteer-core + system Chrome).
// Opt-in, like the other E2E files: it needs Chrome.
//
//   SP_E2E=1 node --test test/ui/preload.e2e.test.js
//   CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe" SP_E2E=1 node --test test/ui/preload.e2e.test.js
//
// What it pins down: the lobby entry exists and opens the panel; the three scopes are offered with the file count
// they would actually download (subset ordering); switching scope is reflected in aria-checked; a real run starts,
// reports progress and can be stopped without leaving the panel stuck. The full download (hundreds of MB) is never
// run to completion — only the loop around it is exercised.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);

describe('preload panel (browser)', { skip: !ENABLED }, () => {
  let server;
  let browser;
  let page;
  const errors = [];

  before(async () => {
    const { startServer } = await import('../../server/index.js');
    server = await startServer({ port: 0, quiet: true });
    const puppeteer = (await import('puppeteer-core')).default;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    // skip the title screen: a saved nickname + this tab's "entered" flag land straight in the lobby
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('sp.name', 'E2E博士');
      sessionStorage.setItem('sp.entered', '1');
    });
    await page.goto(`http://127.0.0.1:${server.port}/`, { waitUntil: 'domcontentloaded' });
  });

  after(async () => {
    try { await browser?.close(); } catch { /* already gone */ }
    try { await server?.close(); } catch { /* already gone */ }
  });

  test('the lobby button opens the panel and lists every scope with its real file count', async () => {
    await page.waitForSelector('.lobby-preload', { timeout: 20000 });
    await page.click('.lobby-preload');
    await page.waitForSelector('.modal__title', { timeout: 5000 });

    assert.equal(await page.$eval('.modal__title', (el) => el.textContent.trim()), '预加载素材');

    const scopes = await page.$$eval('.set-seg button', (els) => els.map((b) => b.textContent.trim()));
    assert.equal(scopes.length, 3, scopes.join(' | '));
    assert.match(scopes[0], /^全部素材 \(\d+\)$/, scopes[0]);
    assert.match(scopes[1], /^不含音频 \(\d+\)$/, scopes[1]);
    assert.match(scopes[2], /^仅干员与敌人 \(\d+\)$/, scopes[2]);

    // the counts come from the real manifest, and each scope is a strict subset of the one before it
    const n = (s) => Number(s.match(/\((\d+)\)/)[1]);
    assert.ok(n(scopes[0]) > 500, `the bundle has hundreds of files, got ${n(scopes[0])}`);
    assert.ok(n(scopes[0]) > n(scopes[1]), 'no-audio is smaller than everything');
    assert.ok(n(scopes[1]) > n(scopes[2]), 'units-only is the smallest');

    // the stale-art escape hatch is offered next to the explanation
    assert.match(await page.$eval('.modal__body', (el) => el.textContent), /清缓存重下/);

    assert.deepEqual(errors, [], 'no console or page errors while opening the panel');
  });

  test('switching scope is reflected in the radio group', async () => {
    await page.$$eval('.set-seg button', (els) => els[2].click());
    const checked = await page.$$eval('.set-seg button', (els) => els.map((b) => b.getAttribute('aria-checked')));
    assert.deepEqual(checked, ['false', 'false', 'true']);
  });

  test('a run starts, reports progress, and can be stopped without hanging the panel', async () => {
    await page.$$eval('.modal__actions button', (els) => {
      const start = els.find((b) => /开始下载/.test(b.textContent));
      if (start) start.click();
    });

    await page.waitForSelector('.pbar', { timeout: 10000 });
    // wait for the loop to actually account for files (fetch + drain)
    await page.waitForFunction(
      () => {
        const t = document.querySelector('.modal__body')?.textContent || '';
        const m = t.match(/(\d+)\s*\/\s*\d+\s*个/);
        return !!m && Number(m[1]) > 0;
      },
      { timeout: 30000 },
    );

    const stop = await page.$$eval('.modal__actions button', (els) => els.map((b) => b.textContent.trim()));
    assert.ok(stop.some((t) => /停止/.test(t)), `a running download offers 停止, got: ${stop.join(' | ')}`);

    await page.$$eval('.modal__actions button', (els) => {
      const b = els.find((x) => /停止/.test(x.textContent));
      if (b) b.click();
    });

    // stopping returns the actions to the idle set and says the partial download is kept
    await page.waitForFunction(
      () => [...document.querySelectorAll('.modal__actions button')].some((b) => /开始下载/.test(b.textContent)),
      { timeout: 10000 },
    );
    assert.match(await page.$eval('.modal__body', (el) => el.textContent), /已下载的会保留/);
  });

  test('the panel is closed, then the 组队 (room) screen offers the same button', async () => {
    await page.$$eval('.modal__actions button', (els) => {
      const b = els.find((x) => /关闭/.test(x.textContent));
      if (b) b.click();
    });
    await page.waitForFunction(() => !document.querySelector('.modal'), { timeout: 5000 });

    // create a co-op room from the lobby (the primary block button waits for the socket to come online)
    await page.waitForFunction(() => {
      const b = document.querySelector('.lobby-right .btn--block');
      return !!b && !b.disabled;
    }, { timeout: 20000 });
    await page.$$eval('.lobby-right .btn--block', (els) => els[0].click());

    await page.waitForSelector('.room-preload', { timeout: 10000 });
    assert.ok(await page.$('.room-bar__right .room-preload'), 'the preload button sits in the room bar next to 干员调配');

    // opening it from here works too
    await page.click('.room-preload');
    await page.waitForSelector('.modal__title', { timeout: 5000 });
    assert.equal(await page.$eval('.modal__title', (el) => el.textContent.trim()), '预加载素材');

    assert.deepEqual(errors, [], 'no console or page errors on the room screen either');
  });
});
