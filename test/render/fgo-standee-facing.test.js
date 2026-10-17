// test/render/fgo-standee-facing.test.js — 圆桌从者的立绘（standee）随攻击转向目标。
//
// 引擎通则（units.js onAttack，research 09 §1.2）：干员保持部署方向，只有敌人会转向目标 —— 官方的干员靠 Spine
// 的 Front/Back 模型 + 镜像表达朝向，攻击时不转身。圆桌从者没有 Spine，只有一张立绘，镜像就是它们唯一的朝向
// 线索，所以 standee 在攻击时朝目标镜像一次（部署方向决定首帧，之后跟着打谁转）。
//
// 守卫是 `this.isStandee`：data/assets.json 里只有这 15 个 char_fgo_* 带 standee 字段（原版 0 个），所以原版
// 干员的行为一字未动 —— 这条也一并断言，防止将来有人给原版加 standee 时悄悄改掉全场的攻击朝向。

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';

let fake, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const settle = () => new Promise((r) => setImmediate(r));
const cam = () => presetCamera('prep', { width: 1280, height: 720 });
const img = { width: 393, height: 336 };

/** Asset store stub: an FGO servant resolves a standee figure, a vanilla operator does not. */
function store({ standee = true } = {}) {
  return {
    picture: (id) => (id ? `/pic/${id}.png` : null),
    standee: (id) => (standee && id && String(id).startsWith('char_fgo_') ? `/assets/char/standee/${id}.png` : null),
    imageNow: () => null,
    image: () => Promise.resolve(img),
    spineEntry: () => null,
    spine: null,
  };
}

async function view(info, assets = store()) {
  const ctx = fakeViewCtx(fake.P, { assets, cam: cam });
  const v = new UnitView(ctx, { id: 1, side: 'ally', kind: 'chess', tier: 1, x: 5, y: 12, maxHp: 1000, ...info }, {});
  await settle(); await settle();
  return v;
}

const sx = (v) => v.fallback.scale.x;

describe('圆桌立绘（standee）的攻击朝向', () => {
  test('把立绘镜像向左侧的目标', async () => {
    const v = await view({ defId: 'char_fgo_gareth', avatar: 'char_fgo_gareth', dir: 'RIGHT' });
    v.update(1 / 60, cam(), 0);
    assert.equal(v.isStandee, true, '前提：立绘已加载（否则整条断言测的是菱形兜底）');
    assert.ok(sx(v) > 0, '部署朝右：不镜像');

    v.onAttack({ x: v.x - 2, y: v.y }, 1, 'arrow');
    v.update(1 / 60, cam(), 0.1);
    assert.equal(v.visFacing, -1, '转向左侧目标');
    assert.ok(sx(v) < 0, '立绘镜像到左边');
  });

  test('把立绘镜像回右侧的目标（转向是双向的）', async () => {
    const v = await view({ defId: 'char_fgo_mordred', avatar: 'char_fgo_mordred', dir: 'LEFT' });
    v.update(1 / 60, cam(), 0);
    assert.ok(sx(v) < 0, '部署朝左：先镜像');

    v.onAttack({ x: v.x + 2, y: v.y }, 1, 'arrow');
    v.update(1 / 60, cam(), 0.1);
    assert.equal(v.visFacing, 1, '转向右侧目标');
    assert.ok(sx(v) > 0, '立绘翻回右边');
  });

  test('没有攻击时保持部署方向（部署朝左仍然镜像）', async () => {
    const v = await view({ defId: 'char_fgo_artoria', avatar: 'char_fgo_artoria', dir: 'LEFT' });
    for (let i = 0; i < 5; i++) v.update(1 / 60, cam(), i / 60);
    assert.equal(v.visFacing, -1);
    assert.ok(sx(v) < 0);
  });

  test('setDir 重新部署时夺回朝向（部署方向优先于上一次攻击）', async () => {
    const v = await view({ defId: 'char_fgo_morgan', avatar: 'char_fgo_morgan', dir: 'RIGHT' });
    v.update(1 / 60, cam(), 0);
    v.onAttack({ x: v.x - 2, y: v.y }, 1, 'arrow');
    v.update(1 / 60, cam(), 0.1);
    assert.equal(v.visFacing, -1, '先转向左边');

    v.setDir('RIGHT');
    v.update(1 / 60, cam(), 0.2);
    assert.equal(v.visFacing, 1, '重新部署朝右：夺回');
    assert.ok(sx(v) > 0);
  });

  test('同一水平线上的目标不改朝向（|dx| 太小，避免抖动）', async () => {
    const v = await view({ defId: 'char_fgo_gawain', avatar: 'char_fgo_gawain', dir: 'RIGHT' });
    v.update(1 / 60, cam(), 0);
    v.onAttack({ x: v.x + 0.05, y: v.y }, 1, 'arrow');
    v.update(1 / 60, cam(), 0.1);
    assert.equal(v.visFacing, 1, 'dx 在阈值内：保持原朝向');
  });
});

describe('原版干员（无 spine 也无 standee 的对照）', () => {
  test('原版干员仍然保持部署方向，不随攻击转向', async () => {
    const v = await view({ defId: 'char_003_kalts', avatar: 'char_003_kalts', dir: 'RIGHT' }, store({ standee: false }));
    v.update(1 / 60, cam(), 0);
    assert.equal(v.isStandee, false, '前提：原版不走立绘分支');

    v.onAttack({ x: v.x - 2, y: v.y }, 1, 'arrow');
    v.update(1 / 60, cam(), 0.1);
    assert.equal(v.visFacing, 1, '干员保持部署方向（research 09 §1.2）');
  });
});
