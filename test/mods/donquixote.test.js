// test/mods/donquixote.test.js — reworked 堂吉诃德 (limbus) kit: 呼吸法 ramps ATK (the dead talent now lives),
// attacks apply 灼燃(burn) + 点穴(acupoint), and the kit reads her real bb (no invented atk_scale). Smoke + mechanics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

test('堂吉诃德 (chess_char_6_limbus_donquixote_a): 呼吸法 raises ATK, attacks stack 灼燃 + 点穴', () => {
  const h = makeBattle({
    seed: 9, autoFinish: false, timeLimit: 60,
    defs: { enemies: { enemy_test: enemyRec({ key: 'enemy_test', hp: 1e9, def: 50, res: 0, speed: 0, atk: 0 }) } },
    units: [{ chessId: 'chess_char_6_limbus_donquixote_a', row: 10, col: 4 }],
    enemies: [{ key: 'enemy_test', pos: [10, 5] }],
  });
  h.step();
  const don = h.unit('chess_char_6_limbus_donquixote_a');
  assert.ok(don, '堂吉诃德 deployed');
  const skills = Object.keys(don.kit?.skills ?? {});
  assert.ok(['skchr_donquixote_1', 'skchr_donquixote_2', 'skchr_donquixote_3'].every((s) => skills.includes(s)),
    `authored skills present, got [${skills}]`);

  const baseAtk = don.base.atk;
  h.runUntil((b) => {
    const e = b.units.find((u) => u.side === 'enemy' && u.defId === 'enemy_test');
    return (don.mem?.breath || 0) > 0 && e && (e.elem?.burn || 0) > 0;
  }, 20);

  const enemy = h.battle.units.find((u) => u.side === 'enemy' && u.defId === 'enemy_test');
  // 呼吸法: the self stack exists AND it actually raised ATK (the fix — before, breath was tracked but gave nothing)
  assert.ok((don.mem?.breath || 0) > 0, `呼吸法 stacks accrue (${don.mem?.breath})`);
  assert.ok(don.findBuff?.('buff:donq:breath'), '呼吸法 is a live atkPct buff');
  assert.ok(don.s.atk > baseAtk, `呼吸法 raised ATK (${don.s.atk} > ${baseAtk})`);
  // 灼燃(burn) + 点穴(acupoint) applied by her attacks
  assert.ok(enemy && (enemy.elem?.burn || 0) > 0, 'attacks stack 灼燃损伤(burn gauge)');
  assert.ok(enemy && (enemy.mem?.limbusAcupoint || 0) > 0, 'attacks stack 点穴');

  assert.equal(h.battle.errors.length, 0, JSON.stringify(h.battle.errors[0]));
  h.invariants();
});

// S3 请您赐教 is her executioner: it reads bb.atk_scale (7.5, not the old invented 2.6), stuns, and lifesteals.
test('堂吉诃德 S3 请您赐教: large atk_scale, stun + lifesteal on hit', () => {
  const h = makeBattle({
    seed: 4, autoFinish: false, timeLimit: 60,
    defs: { enemies: { enemy_test: enemyRec({ key: 'enemy_test', hp: 1e9, def: 0, res: 0, speed: 0, atk: 0 }) } },
    units: [{ chessId: 'chess_char_6_limbus_donquixote_a', row: 10, col: 4 }],
    enemies: [{ key: 'enemy_test', pos: [10, 5] }],
  });
  h.step();
  const don = h.unit('chess_char_6_limbus_donquixote_a');
  const enemy = h.enemy('enemy_test');
  // hurt her a little so the lifesteal is observable, then force S3
  don.hp = Math.floor(don.s.maxHp * 0.5);
  const hpBefore = don.hp;
  don.skill.rule = 'NEVER';
  // drive to S3 cast: give it SP and let it fire on her next attack
  don.skill.charges = don.skill.maxCharges; don.skill.sp = don.skill.spCost;
  don.skill.activate('test');
  h.runUntil(() => enemy.s.flags.stun === true || !enemy.alive, 10);
  assert.equal(enemy.s.flags.stun, true, 'S3 stuns the target (bb.stun_sec)');
  assert.ok(don.hp > hpBefore, `S3 lifesteals (${don.hp} > ${hpBefore})`);
  assert.equal(h.battle.errors.length, 0, JSON.stringify(h.battle.errors[0]));
  h.invariants();
});
