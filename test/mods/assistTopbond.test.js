// Shop-assist mod (mods/assist-topbond): copy-weighted roll weighting, top active core bond selection, and the
// economy wiring that over-draws that bond's members when config.assist.topCoreBondShopBoost is set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameData } from '../../server/match/gamedata.js';
import { SharedPool } from '../../server/match/pool.js';
import { topCoreBondByLayers } from '../../server/match/bondsMeta.js';
import { createRng } from '../../server/sim/rng.js';
import { DATA, makeMatch, give, legalTileFor } from '../match/harness.js';

// data with the mod's config fragment merged (what `node tools/mod.mjs install assist-topbond` produces)
const DATA_ASSIST = { ...DATA, config: { ...DATA.config, assist: { topCoreBondShopBoost: 0.2 } } };
// data with the fragment explicitly absent (robust whether or not the mod is installed in the live tree)
const DATA_OFF = { ...DATA, config: (() => { const c = { ...DATA.config }; delete c.assist; return c; })() };

test('pool.roll weight: an entry drawn at copy-weight × weight(id); default/omitted weight is unchanged', () => {
  const gd = new GameData(DATA, 'mode_multi_normal');
  const pool = new SharedPool(gd);
  const target = gd.visibleChess.find((id) => gd.tierOf(id) === 1);
  // expected share at level 1 when `target` is weighted ×3 (fresh pool: left == cap)
  let tier1 = 0;
  for (const [, e] of pool.entries) if (e.tier === 1) tier1 += e.left;
  const lt = pool.left(target);
  const denom = tier1 - lt + 3 * lt;
  const expect = (3 * lt) / denom;

  const rng = createRng(777);
  const N = 20000;
  let hit = 0;
  for (let i = 0; i < N; i++) {
    const id = pool.roll(rng, { maxTier: 1, weight: (cid) => (cid === target ? 3 : 1) });
    if (id === target) hit++;
  }
  assert.ok(Math.abs(hit / N - expect) < 0.02, `weighted share ${hit / N} vs ${expect}`);

  // weight 0 drops an entry entirely; omitting weight keeps the raw copy-weighted roll
  for (let i = 0; i < 500; i++) {
    assert.notEqual(pool.roll(rng, { maxTier: 1, weight: (cid) => (cid === target ? 0 : 1) }), target);
  }
});

test('topCoreBondByLayers: active core bond with most layers; ties by identifier; add-ons and inactive ignored', () => {
  const gd = new GameData(DATA, 'mode_multi_normal');
  // kjerag (core, 50) beats yan (core, 10); preci (add-on, 999) ignored
  assert.equal(topCoreBondByLayers(gd, {
    yanShip: { active: true, layers: 10 },
    kjeragShip: { active: true, layers: 50 },
    preciShip: { active: true, layers: 999 },
  }), 'kjeragShip');
  // tie → lowest identifier (yan #1 < sargon #2)
  assert.equal(topCoreBondByLayers(gd, {
    yanShip: { active: true, layers: 20 },
    sargonShip: { active: true, layers: 20 },
  }), 'yanShip');
  // inactive core bonds are not eligible even with high layers
  assert.equal(topCoreBondByLayers(gd, {
    yanShip: { active: false, layers: 500 },
    kjeragShip: { active: true, layers: 3 },
  }), 'kjeragShip');
  // no active core bond → null (an active add-on does not count)
  assert.equal(topCoreBondByLayers(gd, { preciShip: { active: true, layers: 80 } }), null);
  assert.equal(topCoreBondByLayers(gd, {}), null);

  // the modded faction bonds ship isCore:true, so they count as 主盟约 too (炎国/罗德岛/边狱公司/Ave Mujica)
  for (const modBond of ['rhodesShip', 'limbusShip', 'aveMujicaShip']) {
    assert.equal(gd.bond(modBond)?.isCore, true, `${modBond} should be a core bond`);
    assert.equal(topCoreBondByLayers(gd, {
      yanShip: { active: true, layers: 30 },
      [modBond]: { active: true, layers: 120 },
    }), modBond, `${modBond} with more layers wins`);
  }
});

test('economy wiring: _shopWeight boosts the top core bond members only when the mod config is present', () => {
  // baseline (no config.assist): wiring is dormant, roll weight is unchanged
  const base = makeMatch({ mode: 'solo', seed: 5, data: DATA_OFF }).start();
  base.toPrep(1);
  assert.equal(base.ps('p_0')._shopWeight(), null, 'no bias without config.assist');
  base.m.dispose();

  // with the mod config and 3 distinct 炎 on board, 炎 (yanShip) is the active top core bond
  const h = makeMatch({ mode: 'solo', seed: 5, data: DATA_ASSIST }).start();
  h.toPrep(1);
  const ps = h.ps('p_0');
  const skip = new Set();
  for (const cid of ['chess_char_1_03_a', 'chess_char_2_04_a', 'chess_char_3_03_a']) {
    const at = legalTileFor(h.m, ps, cid, skip);
    assert.ok(at, `no legal tile for ${cid}`);
    skip.add(`${at[0]},${at[1]}`);
    give(h.m, ps, cid, 'board', at);
  }
  ps.layers.yanShip = 40;
  ps.recompute();
  assert.equal(ps.bonds.yanShip?.active, true, '炎 should be active with 3 distinct members');
  assert.equal(topCoreBondByLayers(ps.gd, ps.bonds), 'yanShip');

  const w = ps._shopWeight();
  assert.equal(typeof w, 'function');
  assert.equal(w('chess_char_1_03_a'), 1.2, '炎 member boosted ×1.2');
  assert.equal(w('chess_char_1_02_a'), 1, '谢拉格/坚守 member not boosted');
  h.m.dispose();
});
