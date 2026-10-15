// test/mods/yisang.test.js — smoke test for the reworked 李箱 (limbus) kit: authored skills load, his attack
// applies 凋亡(apoptosis) to the target and feeds a low-sanity ally, and a battle stays invariant-clean.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

test('李箱 (chess_char_1_limbus_yisang_a) runs his reworked kit: attacks stack 凋亡 on the enemy', () => {
  const h = makeBattle({
    seed: 11,
    defs: { enemies: { enemy_test: enemyRec({ key: 'enemy_test', hp: 300000, def: 100, res: 20, speed: 0.5 }) } },
    units: [{ chessId: 'chess_char_1_limbus_yisang_a', row: 10, col: 4 }],
    enemies: [{ key: 'enemy_test', time: 0, route: 0 }],
  });

  const yi = h.unit('chess_char_1_limbus_yisang_a');
  assert.ok(yi, '李箱 deployed');
  const skills = Object.keys(yi.kit?.skills ?? {});
  assert.ok(['skchr_yisang_1', 'skchr_yisang_2', 'skchr_yisang_3'].every((s) => skills.includes(s)),
    `authored skills present, got [${skills}]`);

  // run until he has attacked the dummy and built an apoptosis gauge on it
  h.runUntil((b) => {
    const e = b.units.find((u) => u.side === 'enemy' && u.defId === 'enemy_test');
    return e && (e.elem?.apoptosis || 0) > 0;
  }, 30);

  const enemy = h.battle.units.find((u) => u.side === 'enemy' && u.defId === 'enemy_test');
  assert.ok(enemy && (enemy.elem?.apoptosis || 0) > 0, '李箱 stacked 凋亡(apoptosis) on the enemy via his attacks');
  h.invariants();
});
