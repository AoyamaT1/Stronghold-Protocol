// test/mods/heathcliff.test.js — real-battle regression for the reworked 希斯克利夫 (limbus) kit. Headline checks: the
// three skills take different shapes (S1 charges / S2 duration / S3 一次性 instant AoE, NOT all duration); 【棺】stacks
// grow atk and come from kills; 【狂猎】amps damage vs high-凋亡 targets; S3 is an AoE one-shot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const HC = 'chess_char_3_limbus_heathcliff_a';
const defs = () => ({ enemies: {
  dummy: enemyRec({ key: 'dummy', hp: 800000, def: 0, res: 0, speed: 0 }),
  weak: enemyRec({ key: 'weak', hp: 1, def: 0, res: 0, speed: 0 }),
} });

function field(skillIndex, { dummies = 1, weak = false } = {}) {
  const enemies = [];
  for (let i = 0; i < dummies; i++) enemies.push({ key: 'dummy', time: 0, route: 0, pos: [9, 6] });
  if (weak) enemies.push({ key: 'weak', time: 0, route: 0, pos: [9, 6] });
  const h = makeBattle({
    seed: 9, timeLimit: 120, autoFinish: false, captureNoisy: true,
    flags: { dpPerSec: 0, dpMax: 999, dpInit: 99 },
    defs: defs(),
    units: [skillIndex == null ? { chessId: HC, row: 9, col: 5 } : { chessId: HC, row: 9, col: 5, skillIndex }],
    enemies,
  });
  h.run(0.5);
  return { h, u: h.unit(HC) };
}
const open = (h, u) => { u.skill.gainSp(999, 'test'); assert.ok(h.runUntil(() => u.skill.activations > 0, 20), `${u.skill.id} opened`); };

test('希斯克利夫 技能三形态：S1 charges / S2 duration / S3 一次性 instant（不是全做持续性）', () => {
  assert.equal(field(0).u.skill.kind, 'charges', 'S1 斩首 = 充能一击');
  assert.equal(field(1).u.skill.kind, 'duration', 'S2 追悼游行 = 持续多目标姿态');
  const { u } = field(null);
  assert.equal(u.skill.id, 'skchr_heathcliff_3');
  assert.equal(u.skill.kind, 'instant', 'S3 镇魂曲 = 一次性 AoE 大招');
  assert.ok(u.buffs.some((b) => b.key === 'heathcliff:coffin'), '【棺】buff 已建立');
  assert.equal(u.mem.coffin, 0, '入场 0 层【棺】');
});

test('希斯克利夫【棺】：击杀 +2 层，每层 +12% 攻击力', () => {
  const { h, u } = field(0, { dummies: 0, weak: true });
  assert.ok(h.runUntil(() => u.mem.coffin >= 2, 20), '击杀敌人后获得【棺】');
  assert.equal(u.mem.coffin, 2, '击杀 +2 层');
  const cof = u.buffs.find((b) => b.key === 'heathcliff:coffin');
  assert.ok(cof && Math.abs(cof.mods.atkPct - 0.24) < 1e-9, '2 层【棺】= +24% 攻击力');
  h.invariants();
});

test('希斯克利夫【狂猎】：对凋亡损伤 ≥6 级的目标伤害显著提升（S1 命中走 dmg.mul）', () => {
  const { h, u } = field(0, { dummies: 1 });
  const e = h.battle.enemies.find((x) => x.alive);
  e.elem.apoptosis = 650;   // 6.5 级：触发狂猎(≥6)+S1(≥6/每3级)增伤
  let maxMul = 1;
  h.battle.on('hit', (ev) => { if (ev.source === u && ev.dmg && ev.dmg.type === 'phys' && (ev.target.elem?.apoptosis || 0) >= 600) maxMul = Math.max(maxMul, ev.dmg.mul); });
  open(h, u);
  h.run(3);
  assert.ok(maxMul >= 1.2, `高凋亡目标受到增伤（dmg.mul=${maxMul.toFixed(3)} ≥ 1.2）`);
  h.invariants();
});

test('希斯克利夫 S3「镇魂曲」：开启得 1 层【棺】；一次性对范围内多个敌人结算（AoE）', () => {
  const { h, u } = field(null, { dummies: 3 });
  assert.equal(h.battle.enemies.filter((e) => e.alive).length, 3);
  const skillHitIds = new Set();
  h.battle.on('damaged', (ev) => { if (ev.source === u && ev.dmg && ev.dmg.isSkill && ev.dmg.type === 'phys') skillHitIds.add(ev.target.id); });
  open(h, u);
  assert.equal(u.mem.coffin, 1, '技能开启使自身获得 1 层【棺】');
  h.runUntil(() => !u.skill.active, 5);
  assert.ok(skillHitIds.size >= 2, `一次性 AoE 命中多个敌人（命中 ${skillHitIds.size} 个）`);
  h.invariants();
});

test('希斯克利夫 S2「追悼游行」：持续期间攻击目标数 +1；攻击自削精神', () => {
  const { h, u } = field(1, { dummies: 1 });
  u.mem.limbusSanity = 20;
  open(h, u);
  const parade = u.buffs.find((b) => b.key === 'heathcliff:parade');
  assert.ok(parade && parade.mods.maxTargets >= 1, '攻击目标数 +1');
  assert.ok(h.runUntil(() => (u.mem.limbusSanity ?? 20) < 20, 6), '攻击后自削精神');
  h.invariants();
});
