// test/mods/meursault.test.js — real-battle regression for the reworked 默尔索 (limbus) kit. Headline: S3 快刀乱麻 is a
// ONE-SHOT (kind:'instant') that consumes 【虎标弹】by how many enemies are in front — each bullet makes it strike one
// more cell (base single-target), capped at 3 bullets. Also checks 虎标弹 init, neural detonate→麻痹, 神经增伤.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const MEURSAULT = 'chess_char_4_limbus_meursault_a';
const defs = () => ({ enemies: { dummy: enemyRec({ key: 'dummy', hp: 600000, def: 0, res: 0, speed: 0 }) } });

// Stationary dummies stacked on the tile right in front (col 6) of a melee op at row 9 col 5 → all sit in its range,
// so "眼前目标" count is deterministic. (Flat route 0 = row 9; facing RIGHT the range is col 5 self + col 6 ahead.)
function field(nFront) {
  const enemies = [];
  for (let i = 0; i < nFront; i++) enemies.push({ key: 'dummy', time: 0, route: 0, pos: [9, 6] });
  const h = makeBattle({
    seed: 7, timeLimit: 120, autoFinish: false, captureNoisy: true,
    flags: { dpPerSec: 0, dpMax: 999, dpInit: 99 },
    defs: defs(),
    units: [{ chessId: MEURSAULT, row: 9, col: 5 }],   // default skill = S3
    enemies,
  });
  h.run(0.5);
  return { h, u: h.unit(MEURSAULT) };
}
const openS3 = (h, u) => {
  u.skill.gainSp(999, 'test');
  assert.ok(h.runUntil(() => u.skill.activations > 0, 20), 'S3 opened');
};

test('默尔索 虎标弹初始 12 发；S3 是一次性技（instant），开启后随该次攻击结束，非持续窗口', () => {
  const { h, u } = field(1);
  assert.equal(u.skill.id, 'skchr_meursault_3');
  assert.equal(u.skill.kind, 'instant', 'S3 是一次性技，而非 duration/ammo 窗口');
  assert.equal(u.mem.tigerBullets, 12, '入场持有 12 发【虎标弹】');
  const a0 = u.skill.activations;
  openS3(h, u);
  assert.ok(h.runUntil(() => u.skill.activations > a0 && !u.skill.active, 5), '开启后立即结束（一次性）');
  h.invariants();
});

for (const [nFront, expectExtra] of [[1, 0], [2, 1], [3, 2], [5, 3]]) {
  test(`默尔索 S3：眼前 ${nFront} 个目标 → 消耗 ${expectExtra} 发虎标弹、命中 ${1 + expectExtra} 格`, () => {
    const { h, u } = field(nFront);
    const foes = () => h.battle.enemies.filter((e) => e.alive);
    assert.equal(foes().length, nFront, `${nFront} 个眼前目标`);

    // 收集本次 S3 施法命中的物理技能目标（主目标 + 虎标弹额外格）
    const hitIds = new Set();
    h.battle.on('damaged', (ev) => {
      if (ev.source === u && ev.dmg && ev.dmg.isSkill && ev.dmg.type === 'phys') hitIds.add(ev.target.id);
    });
    const before = u.mem.tigerBullets;
    openS3(h, u);
    h.runUntil(() => !u.skill.active, 5);

    assert.equal(before - u.mem.tigerBullets, expectExtra, `消耗 ${expectExtra} 发虎标弹`);
    assert.equal(hitIds.size, 1 + expectExtra, `一次性命中 ${1 + expectExtra} 格目标`);
    h.invariants();
  });
}

test('默尔索 S3：命中引爆【神经损伤】为麻痹；对带神经的敌人伤害 +20%', () => {
  const { h, u } = field(1);
  const e = h.battle.enemies.find((x) => x.alive);

  // 捕获带神经增伤的那次攻击：目标已有神经时，物理技能 dmg.mul 含 ×1.2
  let sawNeuralAmp = false;
  h.battle.on('hit', (ev) => {
    if (ev.source === u && ev.dmg && ev.dmg.type === 'phys' && (ev.target.elem?.neural || 0) > 0 && ev.dmg.mul > 1.19) sawNeuralAmp = true;
  });

  openS3(h, u);
  h.runUntil(() => !u.skill.active, 5);
  assert.ok(h.hooksOf('elementBurst').some((c) => c.element === 'neural' || c.el === 'neural') || e.s.flags.palsy || e.buffs?.some((b) => b.status === 'palsy' || b.palsy),
    'S3 命中把【神经损伤】引爆为麻痹');

  // 再开一次（此时目标已带神经），应观察到神经增伤
  u.skill.gainSp(999, 'test');
  h.runUntil(() => u.skill.activations > 1, 10);
  h.runUntil(() => !u.skill.active, 5);
  assert.ok(sawNeuralAmp, '对带【神经损伤】的敌人物理伤害 +20%');
  h.invariants();
});
