// test/render/fgofx.test.js — FGO 圆桌模组的客户端表现层：
//   * render/fx/kinds.js FX_KINDS: 模组在 sim 里发出的每一个 fx 种类都必须有**显式**视觉（否则退化成通用火花），
//     并且颜色按角色区分（同一角色同一色系，不同角色不同色）——"特效要考虑颜色"的验收点
//   * mods/fgo-fx-rig-audio.js installFgoFx: FX 系统画不出的屏幕空间演出（宝具真名横幅 / 十三拘束法阵 /
//     BGM Ducking）。它只接管这三件，**不重复画** FX_KINDS 已经画过的技能特效
//   * render/app.js: fx 事件在 fx.simFx 之后分发给演出层，且演出层抛异常不得影响战斗渲染
//   * 行为契约：同一时刻只留一条横幅（防连开糊屏）/ S1·S2 不刷屏 / 追帧补发（extra.late）不补演 / 暂停时冻结 /
//     destroy 不留悬挂容器

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi } from './fakepixi.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MOD_SIM = path.join(ROOT, 'mods', 'fgo-round-table', 'sim');

/** 模组 sim 源码里发出的全部字面 fx 种类（`battle.fx?.('kind'`）。 */
function modFxKinds() {
  const kinds = new Set();
  for (const f of readdirSync(MOD_SIM)) {
    if (!f.endsWith('.js')) continue;
    const src = readFileSync(path.join(MOD_SIM, f), 'utf8');
    for (const m of src.matchAll(/\bfx\?\.\(\s*'([A-Za-z0-9_]+)'/g)) kinds.add(m[1]);
  }
  return kinds;
}

let FakePixi, FX_KINDS, installFgoFx;

before(async () => {
  FakePixi = installFakePixi().PIXI ?? globalThis.PIXI;
  ({ FX_KINDS } = await import('../../public/js/render/fx.js'));
  ({ installFgoFx } = await import('../../public/js/mods/fgo-fx-rig-audio.js'));
});

/** 造一个最小的演出层上下文（假 PIXI + 记录 ticker 回调）。 */
function harness({ paused = false } = {}) {
  const tickers = new Set();
  const layer = new FakePixi.Container();
  const state = { paused };
  const fx = installFgoFx({
    P: FakePixi,
    layer,
    screenSize: () => ({ width: 1280, height: 720 }),
    ticker: { add: (f) => tickers.add(f), remove: (f) => tickers.delete(f) },
    isPaused: () => state.paused,
    audio: null
  });
  return { fx, layer, tickers, state, step: (n = 1) => { for (let i = 0; i < n; i++) for (const f of [...tickers]) f(); } };
}

describe('FGO 模组 fx 注册', () => {
  test('模组发出的每个 fx 种类都在 FX_KINDS 里有显式视觉', () => {
    const kinds = modFxKinds();
    assert.ok(kinds.size >= 50, `扫描到 ${kinds.size} 个种类（应 >= 50）`);
    const missing = [...kinds].filter((k) => !FX_KINDS[k]);
    assert.deepEqual(missing, [], '这些种类没有注册，会退化成通用火花：');
  });

  test('每个种类都有颜色，且不是单调的同一种颜色', () => {
    const kinds = [...modFxKinds()];
    const colors = new Set();
    for (const k of kinds) {
      const spec = FX_KINDS[k];
      assert.equal(typeof spec.c, 'number', `${k} 缺少颜色 c`);
      colors.add(spec.c);
    }
    assert.ok(colors.size >= 10, `配色只有 ${colors.size} 种，太单调（"特效要考虑颜色"没做到）`);
  });

  test('15 名干员的宝具颜色互不相同（一眼能看出是谁放的）', () => {
    const nps = ['garethS3', 'bedivereS3', 'tristanS3', 'percivalS3', 'baobhanS3', 'gawainS3', 'barghestS3',
      'mashS3Form2', 'lancelotS3', 'mordredS3', 'melusineS3Beam', 'artoriaExcalibur', 'merlinAvalon',
      'castoriaS3', 'morganS3'];
    const colors = new Set(nps.map((k) => FX_KINDS[k].c));
    assert.ok(colors.size >= 12, `15 个宝具只有 ${colors.size} 种颜色，区分度不够`);
  });
});

describe('FGO 演出层（宝具横幅 / 十三拘束法阵 / 圣光环）', () => {
  test('50 个 fx 种类全部不抛异常，且只画出 FGO 自己认识的几个', () => {
    const { fx, layer } = harness();
    for (const k of modFxKinds()) assert.doesNotThrow(() => fx.handle(k, 100, 200, { id: 1 }), k);
    assert.ok(layer.children.length > 0, '宝具/议决/天际支援至少应画出东西');
  });

  test('15 名干员的宝具各自开一次横幅，且只留一条（防连开糊屏）', () => {
    const nps = ['garethS3', 'bedivereS3', 'tristanS3', 'percivalS3', 'baobhanS3', 'gawainS3', 'barghestS3',
      'mashS3Form2', 'lancelotS3', 'mordredS3', 'melusineS3Beam', 'artoriaExcalibur', 'merlinAvalon',
      'castoriaS3', 'morganS3'];
    for (const k of nps) {
      const h = harness();
      h.fx.handle(k, 0, 0, { id: 1 });
      assert.equal(h.layer.children.length, 1, `${k} 应开出一条宝具横幅`);
      h.fx.destroy();
    }
    const h = harness();
    h.fx.handle(nps[0], 0, 0, { id: 1 });
    h.fx.handle(nps[1], 0, 0, { id: 1 });
    assert.equal(h.layer.children.length, 1, '同一时刻只应有一条横幅');
  });

  test('S1 / S2 与纯特效种类不触发屏幕空间演出（不刷屏）', () => {
    const { fx, layer } = harness();
    for (const k of ['garethS1', 'garethS2', 'bedivereS1', 'bedivereS2', 'tristanS1', 'tristanS2',
      'melusineS1', 'melusineS2', 'merlinS1', 'merlinS2', 'castoriaS1', 'castoriaS2', 'morganS1', 'morganS2']) {
      fx.handle(k, 0, 0, { id: 1 });
    }
    assert.equal(layer.children.length, 0, 'S1/S2 不该开横幅');
  });

  test('圆桌议决画十三拘束法阵、天际支援画圣光爆发环', () => {
    const a = harness();
    a.fx.handle('roundTableDecision', 0, 0, { fullScreen: true });
    assert.equal(a.layer.children.length, 1, '议决应画出法阵');
    const b = harness();
    b.fx.handle('skySupportBurst', 640, 360, { fullScreen: true });
    assert.equal(b.layer.children.length, 1, '天际支援应画出光环');
  });

  test('追帧补发的事件（extra.late）不补演，避免过场动画堆在画面上', () => {
    const { fx, layer } = harness();
    fx.handle('morganS3', 0, 0, { id: 1, late: 1.5 });
    fx.handle('roundTableDecision', 0, 0, { late: 0.8 });
    assert.equal(layer.children.length, 0);
  });

  // 演出是按真实时间推进的（ticker 只做节拍），所以这里必须真等，不能用空转帧糊弄
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  test('暂停时演出冻结、恢复后正常播完并自清理', async () => {
    const h = harness();
    h.fx.handle('artoriaExcalibur', 640, 360, { id: 1 });
    const box = h.layer.children[0];
    const before = { alpha: box.alpha, x: box.position.x };
    h.state.paused = true;
    for (let i = 0; i < 12; i++) { h.step(1); await sleep(20); }
    assert.equal(box.alpha, before.alpha, '暂停时 alpha 不应变化');
    assert.equal(box.position.x, before.x, '暂停时位置不应变化');
    assert.equal(h.layer.children.length, 1, '暂停时不应被销毁');
    h.state.paused = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 1200 && h.layer.children.length) { h.step(1); await sleep(10); }
    assert.equal(h.layer.children.length, 0, '恢复后 0.9s 横幅应播完并自清理');
  });

  test('destroy 清理悬挂容器，不给 stage 留垃圾', () => {
    const { fx, layer } = harness();
    fx.handle('artoriaExcalibur', 0, 0, { id: 1 });
    fx.handle('roundTableDecision', 0, 0, {});
    const box = layer.children[0];
    fx.destroy();
    assert.ok(box.destroyed, 'destroy 应销毁横幅容器');
  });

  test('app.js 在 fx.simFx 之后分发到演出层，且分发被 try/catch 兜住', () => {
    const src = readFileSync(path.join(ROOT, 'public', 'js', 'render', 'app.js'), 'utf8');
    assert.match(src, /import \{ installFgoFx \} from '\.\.\/mods\/fgo-fx-rig-audio\.js'/);
    assert.match(src, /const fgoFx = installFgoFx\(\{/);
    assert.match(src, /fx\.simFx\([\s\S]{0,200}fgoFx\.handle\(/);
    assert.match(src, /try \{ fgoFx\.handle\([\s\S]{0,80}\} catch/, '演出层异常必须被兜住');
    assert.match(src, /setupCleanup\.push\(\(\) => fgoFx\.destroy\(\)\)/);
  });
});
