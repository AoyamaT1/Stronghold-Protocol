// test/mods/honglu.test.js — reworked 鸿璐 (limbus): 呼吸法 ramps ATK (was dead code), attacks stack 脆弱(vuln),
// and S3 summons 卯兔 (token_limbus_jaro, Faust-skinned) which bursts once then vanishes. Smoke + mechanics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

test('鸿璐 (chess_char_4_limbus_honglu_a): 呼吸法 raises ATK, attacks stack 脆弱(vuln)', () => {
  const h = makeBattle({
    seed: 8, autoFinish: false, timeLimit: 60,
    defs: { enemies: { enemy_test: enemyRec({ key: 'enemy_test', hp: 1e9, def: 50, res: 10, speed: 0, atk: 0 }) } },
    units: [{ chessId: 'chess_char_4_limbus_honglu_a', row: 10, col: 4 }],
    enemies: [{ key: 'enemy_test', pos: [10, 6] }],
  });
  h.step();
  const hl = h.unit('chess_char_4_limbus_honglu_a');
  assert.ok(hl, '鸿璐 deployed');
  const skills = Object.keys(hl.kit?.skills ?? {});
  assert.ok(['skchr_honglu_1', 'skchr_honglu_2', 'skchr_honglu_3'].every((s) => skills.includes(s)),
    `authored skills present, got [${skills}]`);
  hl.skill.rule = 'NEVER';   // isolate ordinary attacks (no S3 auto-cast)
  const baseAtk = hl.base.atk;
  h.runUntil((b) => {
    const e = b.units.find((u) => u.side === 'enemy' && u.defId === 'enemy_test');
    return (hl.mem?.breath || 0) >= 2 && e && (e.mem?.honglVuln || 0) > 0;   // ≥2 层才有 +3%
  }, 25);
  const enemy = h.battle.units.find((u) => u.side === 'enemy' && u.defId === 'enemy_test');
  assert.ok((hl.mem?.breath || 0) >= 2, `呼吸法 stacks accrue (${hl.mem?.breath})`);
  assert.ok(hl.findBuff?.('buff:honglu:breath'), '呼吸法 is a live atkPct buff');
  assert.ok(hl.s.atk > baseAtk, `呼吸法 raised ATK (${hl.s.atk} > ${baseAtk})`);
  assert.ok(enemy && (enemy.mem?.honglVuln || 0) > 0, 'attacks stack 脆弱(vuln)');
  assert.ok(enemy && enemy.findBuff?.('debuff:honglu:vuln'), '脆弱 is a live dmgTaken debuff');
  assert.equal(h.battle.errors.length, 0, JSON.stringify(h.battle.errors[0]));
  h.invariants();
});

test('鸿璐 S3 全体黑兽: summons 卯兔 (token_limbus_jaro) which bursts once, then vanishes', () => {
  const h = makeBattle({
    seed: 3, autoFinish: false, timeLimit: 60,
    defs: { enemies: { enemy_test: enemyRec({ key: 'enemy_test', hp: 1e9, def: 0, res: 0, speed: 0, atk: 0 }) } },
    units: [{ chessId: 'chess_char_4_limbus_honglu_a', row: 10, col: 4 }],
    enemies: [{ key: 'enemy_test', pos: [10, 6] }],
  });
  h.step();
  const hl = h.unit('chess_char_4_limbus_honglu_a');
  const enemy = h.enemy('enemy_test');
  const hp0 = enemy.hp;
  const jaro = () => h.battle.units.find((u) => u.kind === 'token' && u.alive && u.deployed && (u.defId === 'token_limbus_jaro' || /jaro/.test(u.defId || '')));
  hl.skill.rule = 'NEVER';
  hl.skill.charges = hl.skill.maxCharges; hl.skill.sp = hl.skill.spCost;
  hl.skill.activate('test');
  // the summon appears within a step or two of the cast
  const appeared = h.runUntil(() => !!jaro(), 5);
  assert.ok(appeared, 'S3 summoned 卯兔');
  // it bursts (enemy takes damage from the summon) then is gone within ~2s
  h.runUntil(() => enemy.hp < hp0, 3);
  assert.ok(enemy.hp < hp0, '卯兔 (or 鸿璐) dealt its burst damage');
  const gone = h.runUntil(() => !jaro(), 4);
  assert.ok(gone, '卯兔 vanished after its one skill');
  assert.equal(h.battle.errors.length, 0, JSON.stringify(h.battle.errors[0]));
  h.invariants();
});
