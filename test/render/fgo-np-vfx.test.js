// test/render/fgo-np-vfx.test.js — 验证 FGO 宝具特效强化（单位燃点光效、连环枪影、痛哭幻奏风刃与武器专属编舞）
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi } from './fakepixi.js';

let FakePixi, installFgoFx;

before(async () => {
  FakePixi = installFakePixi().PIXI ?? globalThis.PIXI;
  ({ installFgoFx } = await import('../../public/js/mods/fgo-fx-rig-audio.js'));
});

function createMockFxHarness() {
  const tickers = new Set();
  const screenLayer = new FakePixi.Container();
  const groundFx = new FakePixi.Container();
  const fxAdd = new FakePixi.Container();

  const particleCalls = [];
  const ringCalls = [];
  const burstCalls = [];

  const mockFx = {
    particle: (tex, x, y, opts) => {
      particleCalls.push({ tex, x, y, opts });
      return { sp: new FakePixi.Container() };
    },
    ring: (x, y, z, r0, r1, tint, dur) => {
      ringCalls.push({ x, y, z, r0, r1, tint, dur });
    },
    burst: (x, y, s, count, col, opts) => {
      burstCalls.push({ x, y, s, count, col, opts });
    }
  };

  const views = new Map();
  views.set('unit_tristan', {
    x: 2.0, y: 3.0, z: 0, facing: 1,
    body: { position: { x: 0, y: 0 } }
  });
  views.set('unit_percival', {
    x: 4.0, y: 3.0, z: 0, facing: 1,
    body: { position: { x: 0, y: 0 } }
  });
  views.set('enemy_boss', {
    x: 7.0, y: 3.0, z: 0, facing: -1,
    body: { position: { x: 0, y: 0 } }
  });

  const cam = () => ({
    project: (x, y, z) => ({ x: x * 100, y: y * 100 - z * 40, s: 64 })
  });

  const fgoFx = installFgoFx({
    P: FakePixi,
    layer: screenLayer,
    screenSize: () => ({ width: 1280, height: 720 }),
    ticker: { add: (f) => tickers.add(f), remove: (f) => tickers.delete(f) },
    isPaused: () => false,
    audio: null,
    fx: mockFx,
    views,
    cam,
    layers: { groundFx, fxAdd, screen: screenLayer }
  });

  return {
    fgoFx,
    screenLayer,
    groundFx,
    fxAdd,
    particleCalls,
    ringCalls,
    burstCalls,
    views,
    step: (n = 1) => {
      for (let i = 0; i < n; i++) {
        for (const f of [...tickers]) f();
      }
    }
  };
}

describe('FGO 宝具特效与单位点燃系统', () => {
  test('单位开宝具时触发燃点特效（光柱、升华烈焰流、核心星芒、地面圣法阵）', () => {
    const h = createMockFxHarness();
    h.fgoFx.handle('artoriaExcalibur', 2.0, 3.0, { id: 'unit_tristan' });

    // 1. 地面法阵添加到了 groundFx
    assert.ok(h.groundFx.children.length >= 1, '地面圣法阵应被创建并加入 groundFx 层');

    // 2. 地面冲击光环
    assert.ok(h.ringCalls.length >= 2, '应至少触发地面金光环与角色色光环');

    // 3. 冲天光柱
    const pillars = h.particleCalls.filter((p) => p.tex === 'pillar');
    assert.ok(pillars.length >= 2, '应至少生成外层主题色与内层白炽两道冲天光柱');

    // 4. 烈焰升腾升华粒子
    const fireEmbers = h.particleCalls.filter((p) => p.opts?.vy < -100);
    assert.ok(fireEmbers.length >= 10, `应生成高速升腾的烈焰粒子流（当前 ${fireEmbers.length} 个）`);

    // 5. 胸口核心星芒
    const flares = h.particleCalls.filter((p) => p.tex === 'flare');
    assert.ok(flares.length >= 2, '胸口应爆发核心星芒光晕');
  });

  test('崔斯坦 S3 痛哭幻奏：触发音波震荡与 7 连真空弦刃斩击', async () => {
    const h = createMockFxHarness();
    h.fgoFx.handle('tristanS3', 2.0, 3.0, {
      id: 'unit_tristan',
      target: 'enemy_boss',
      targets: ['enemy_boss'],
      tx: 7.0,
      ty: 3.0
    });

    // 初始拨弦音波扩散
    const initialShocks = h.particleCalls.filter((p) => p.tex === 'shock');
    assert.ok(initialShocks.length >= 1, '拨弦初始应扩散音波震荡环');

    // 推进时间让 7 段风刃与斩击触发
    for (let t = 0; t < 15; t++) {
      h.step(1);
      await new Promise((r) => setTimeout(r, 15));
    }

    // 检查飞行真空弦刃
    const blades = h.particleCalls.filter((p) => p.tex === 'streak' && p.opts?.tint === 0xd2fbf0);
    assert.ok(blades.length >= 3, `应发射多道高速真空风刃（当前 ${blades.length} 道）`);

    // 检查受击交错斩痕
    const slashes = h.particleCalls.filter((p) => p.tex === 'slash');
    assert.ok(slashes.length >= 2, `目标身上应留下交错斩击裂痕（当前 ${slashes.length} 道）`);
  });

  test('珀西瓦尔 S3 光耀的命运之枪：生成密集连环枪影与终结贯穿光暴', async () => {
    const h = createMockFxHarness();
    h.fgoFx.handle('percivalS3', 4.0, 3.0, {
      id: 'unit_percival',
      target: 'enemy_boss',
      targets: ['enemy_boss'],
      r: 2.0
    });

    // 推进时间让连环枪影逐段刺出
    for (let t = 0; t < 15; t++) {
      h.step(1);
      await new Promise((r) => setTimeout(r, 15));
    }

    // 连环枪影
    const spearShadows = h.particleCalls.filter((p) => (p.tex === 'streak' || p.tex === 'tracer') && p.opts?.vx > 300);
    assert.ok(spearShadows.length >= 8, `应刺出多段高速连环枪影（当前 ${spearShadows.length} 段）`);

    // 枪尖破空星芒
    const sparks = h.particleCalls.filter((p) => p.tex === 'spark');
    assert.ok(sparks.length >= 4, '枪尖应闪耀破空星芒');
  });

  test('高文/莫德雷德/兰斯洛特/妖崔专属技能触发武器编舞特效', () => {
    const h = createMockFxHarness();
    h.fgoFx.handle('gawainS3', 4.0, 3.0, { id: 'unit_percival' });
    h.fgoFx.handle('mordredS3', 4.0, 3.0, { id: 'unit_percival' });
    h.fgoFx.handle('lancelotS3', 4.0, 3.0, { id: 'unit_percival', target: 'enemy_boss' });
    h.fgoFx.handle('baobhanS3', 4.0, 3.0, { id: 'unit_percival', target: 'enemy_boss' });

    // 日轮烈焰/赤雷/湖光重斩
    assert.ok(h.ringCalls.length >= 4, '各宝具应触发特色冲击环');
    assert.ok(h.burstCalls.length >= 4, '各宝具应触发特色粒子爆发');
  });

  test('巴格斯特黑犬/高文日轮领域/卡斯特誓约之星/摩根魔枪等改动技能特效触发验证', () => {
    const h = createMockFxHarness();

    // 1. 巴格斯特黑犬暴食
    h.fgoFx.handle('barghestS3', 4.0, 3.0, { id: 'unit_percival' });
    const dogTracers = h.particleCalls.filter((p) => p.tex === 'tracer' && p.opts?.tint === 0xff7a33);
    assert.ok(dogTracers.length >= 4, '巴格斯特 S3 应触发黑犬狂猎暗炎');

    // 2. 高文日轮领域
    h.fgoFx.handle('gawainS2', 4.0, 3.0, { id: 'unit_percival' });
    const sunGlows = h.particleCalls.filter((p) => p.tex === 'glow' && p.opts?.tint === 0xffb142);
    assert.ok(sunGlows.length >= 1, '高文 S2 应生成日轮领域微光');

    // 3. 卡斯特誓约之星
    h.fgoFx.handle('castoriaS3', 4.0, 3.0, { id: 'unit_percival' });
    const castoriaSparks = h.particleCalls.filter((p) => p.tex === 'spark' && p.opts?.tint === 0xffe066);
    assert.ok(castoriaSparks.length >= 4, '卡斯特 S3 应生成希望星芒流');

    // 4. 摩根伦戈米尼亚德魔枪
    h.fgoFx.handle('morganS3', 4.0, 3.0, { id: 'unit_percival' });
    const morganBolts = h.particleCalls.filter((p) => p.tex === 'bolt' && p.opts?.tint === 0x00d2d3);
    assert.ok(morganBolts.length >= 3, '摩根 S3 应生成青蓝祸患雷霆');

    // 5. 梅林理想乡花瓣
    h.fgoFx.handle('merlinAvalon', 4.0, 3.0, { id: 'unit_percival' });
    const petals = h.particleCalls.filter((p) => p.tex === 'flare' && (p.opts?.tint === 0xfda7df || p.opts?.tint === 0xffffff));
    assert.ok(petals.length >= 4, '梅林 S3 应生成阿瓦隆花瓣雨');

    // 6. 贝德维尔银之臂
    h.fgoFx.handle('bedivereS3', 4.0, 3.0, { id: 'unit_percival', target: 'enemy_boss' });
    const bediFlares = h.particleCalls.filter((p) => p.tex === 'flare' && p.opts?.tint === 0x80ffdb);
    assert.ok(bediFlares.length >= 1, '贝德维尔 S3 应生成银臂炽光');

    // 7. 加雷斯狂狼怒意
    h.fgoFx.handle('garethS3', 4.0, 3.0, { id: 'unit_percival', target: 'enemy_boss' });
    const wolfShocks = h.particleCalls.filter((p) => p.tex === 'shock' && p.opts?.tint === 0xff5a4a);
    assert.ok(wolfShocks.length >= 1, '加雷斯 S3 应生成狂狼怒意震波');

    // 8. 玛修理想之城与人理之剑
    h.fgoFx.handle('mashS3Form1', 4.0, 3.0, { id: 'unit_percival' });
    const mashShields = h.particleCalls.filter((p) => p.tex === 'shield' && p.opts?.tint === 0xf8efba);
    assert.ok(mashShields.length >= 1, '玛修 S3 Form 1 应展开遥远的理想之城壁垒');

    h.fgoFx.handle('mashS3Form2', 4.0, 3.0, { id: 'unit_percival' });
    const mashSwords = h.particleCalls.filter((p) => p.tex === 'pillar' && p.opts?.tint === 0x74b9ff);
    assert.ok(mashSwords.length >= 1, '玛修 S3 Form 2 应发射人理之剑光柱');
  });
});
