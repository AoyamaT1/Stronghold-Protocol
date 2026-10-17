import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import aveMujicaKits from '../../server/sim/content/mods/aveMujica/kits.js';

test('Ave Mujica: Amoris skills and talent (attack blocked enemy +15%)', () => {
  const kitBuilder = aveMujicaKits.chess_char_2_20_a;
  assert.ok(kitBuilder, 'Amoris kit builder exists');
  const kit = kitBuilder({ atk: 0.15 }, { chessId: 'chess_char_2_20_a' }, {});
  assert.ok(kit.skills.skchr_amoris_1, 'S1 exists');
  assert.ok(kit.skills.skx_ave_mujica_amoris_1, 'S1 plugin alias exists');
  assert.ok(kit.skills.skchr_amoris_2, 'S2 exists');
  assert.ok(kit.skills.skx_ave_mujica_amoris_2, 'S2 plugin alias exists');
  assert.equal(kit.skills.skchr_amoris_1.attack.hits, 3);
  assert.equal(kit.skills.skchr_amoris_2.attack.hits, 8);
  assert.ok(kit.talents && kit.talents.length > 0, 'Amoris talent exists');
});

test('Ave Mujica: Timoris S1 5 hits and S2 interval dot', () => {
  const kitBuilder = aveMujicaKits.chess_char_3_22_a;
  assert.ok(kitBuilder, 'Timoris kit builder exists');
  const kit = kitBuilder({ 'attack@interval': 1, 'attack@atk_scale': 0.78, times: 5, atk_scale: 0.61 }, { chessId: 'chess_char_3_22_a' }, {});
  assert.ok(kit.skills.skchr_tmoris_1, 'S1 exists');
  assert.ok(kit.skills.skx_ave_mujica_tmoris_1, 'S1 alias exists');
  assert.equal(kit.skills.skchr_tmoris_1.attack.hits, 5);
  assert.equal(kit.skills.skchr_tmoris_1.attack.atkScale, 0.61);
  assert.ok(kit.skills.skchr_tmoris_2, 'S2 exists');
  assert.ok(kit.talents && kit.talents.length > 0, 'Timoris talent exists');
});

test('Ave Mujica: Mortis S1, S2 recoil, and doll talent', () => {
  const kitBuilder = aveMujicaKits.chess_char_4_27_a;
  assert.ok(kitBuilder, 'Mortis kit builder exists');
  const kit = kitBuilder({ def: 0.65, block_cnt: 2, taunt_level: 1, 'attack@atk_scale': 0.75, value: 20 }, { chessId: 'chess_char_4_27_a' }, {});
  assert.ok(kit.skills.skchr_mortis_1, 'S1 exists');
  assert.ok(kit.skills.skx_ave_mujica_mortis_1, 'S1 alias exists');
  assert.equal(kit.skills.skchr_mortis_1.mods.defPct, 0.65);
  assert.equal(kit.skills.skchr_mortis_1.mods.blockCnt, 2);
  assert.ok(kit.skills.skchr_mortis_2, 'S2 exists');
  assert.equal(kit.skills.skchr_mortis_2.attack.hits, 3);
  assert.ok(kit.talents && kit.talents.length > 0, 'Mortis talent exists');
});

test('Ave Mujica: Dolris inspire, 0.3s S2 interval, and trait/talent', () => {
  const kitBuilder = aveMujicaKits.chess_char_5_24_a;
  assert.ok(kitBuilder, 'Dolris kit builder exists');
  const kit = kitBuilder({ 'attack@atk': 0.8, interval: 0.3, 'attack@atk_scale': 0.7, 'attack@heal_scale': 0.15 }, { chessId: 'chess_char_5_24_a' }, {});
  assert.ok(kit.skills.skchr_dolris_1, 'S1 exists');
  assert.ok(kit.skills.skx_ave_mujica_dolris_1, 'S1 alias exists');
  assert.ok(kit.skills.skchr_dolris_2, 'S2 exists');
  assert.ok(kit.skills.skx_ave_mujica_dolris_2, 'S2 alias exists');
  assert.ok(kit.talents && kit.talents.length > 0, 'Dolris talent exists');
});
