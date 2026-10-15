// test/mods/sinclair.test.js — real-battle regression for the reworked 辛克莱 (limbus) kit. The point of the rework:
// the three skills take THREE DIFFERENT shapes (charges / instant / ammo), none of them a plain duration buff window.
// Also checks the kit's own systems: 狂信 from lost 精神值, 精神值<0 → 攻速+35, 灼燃+流血, and the S3 kill rush.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const SINCLAIR = 'chess_char_1_limbus_sinclair_a';
const defs = () => ({ enemies: {
  enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 400000, def: 0, res: 0, speed: 0.9 }),
  enemy_weak: enemyRec({ key: 'enemy_weak', hp: 1, def: 0, res: 0, speed: 0.9 }),
} });

// Flat route 0 runs along row 9 (right→left). A melee operator on that row BLOCKS the walkers (blockCnt 2 for _a), so
// they sit adjacent and stay targetable — stable range/targeting without depending on exact tile math. The dummy has
// huge HP (absorbs every hit); the weak one dies on the first hit (drives the S3 kill-rush).
function field(skillIndex, { weak = false } = {}) {
  const enemies = [{ key: 'enemy_dummy', time: 0, route: 0 }];
  if (weak) enemies.push({ key: 'enemy_weak', time: 0.1, route: 0 });
  const h = makeBattle({
    seed: 21, timeLimit: 120, autoFinish: false, captureNoisy: true,
    flags: { dpPerSec: 0, dpMax: 999, dpInit: 99 },
    defs: defs(),
    units: [skillIndex == null ? { chessId: SINCLAIR, row: 9, col: 5 } : { chessId: SINCLAIR, row: 9, col: 5, skillIndex }],
    enemies,
  });
  h.run(0.5);                       // start the battle & deploy BEFORE touching SP (skill.reset runs at start)
  return { h, u: h.unit(SINCLAIR) };
}
const open = (h, u) => {            // fill SP and run until the skill opens (the walker must first reach & be blocked)
  assert.ok(h.runUntil(() => u.blocking.length > 0, 30), 'a walker reached & was blocked (in melee range)');
  u.skill.gainSp(999, 'test');
  assert.ok(h.runUntil(() => u.skill.active || u.skill.activations > 0, 20), `${u.skill.id} opened`);
};

test('辛克莱 S1（迫不得已的审判）= 充能一击：命中后立刻结束，不是持续增益窗口', () => {
  const { h, u } = field(0);
  assert.equal(u.skill.id, 'skchr_sinclair_1');
  assert.equal(u.skill.kind, 'charges', 'S1 是充能(下一击)技，而非 duration');

  u.mem.limbusSanity = 20;
  const s0 = u.mem.limbusSanity;
  const a0 = u.skill.activations;
  open(h, u);
  assert.ok(h.runUntil(() => u.skill.activations > a0 && !u.skill.active, 5), 'S1 开启后随该次攻击立即结束（无持续窗口）');
  assert.ok(u.mem.limbusSanity < s0, '开启消耗精神值');

  const e = h.enemy('enemy_dummy');
  assert.ok((e.elem.burn || 0) > 0, '命中施加灼燃损伤');

  // 自我毁灭：常驻 +18% 攻击（随时在场）
  assert.ok(u.buffs.some((b) => b.key === 'sinclair:selfdestruct' && Math.abs(b.mods.atkPct - 0.18) < 1e-9), '常驻 +18% 攻击');
  // 反复开启把精神压到负 → 攻速+35、狂信达上限(3 层 = +24%)
  h.run(20);
  assert.ok(u.mem.limbusSanity < 0, '持续自削后精神值转负');
  assert.ok(u.buffs.some((b) => b.key === 'sinclair:fervor' && Math.abs(b.mods.aspd - 35) < 1e-9), '精神值<0 → 攻速 +35');
  assert.equal(u.mem.fanatic, 3, '累计失去精神值叠满 3 层【狂信】');
  assert.ok(u.buffs.some((b) => b.key === 'sinclair:fanatic' && Math.abs(b.mods.atkPct - 0.24) < 1e-9), '3 层狂信 = +24% 攻击');
  h.invariants();
});

test('辛克莱 S2（黑白不分的执行）= 一次性双段斩：2 段伤害、附灼燃与流血、带狂信本技能 +10%', () => {
  const { h, u } = field(1);
  assert.equal(u.skill.id, 'skchr_sinclair_2');
  assert.equal(u.skill.kind, 'instant', 'S2 是一次性技，而非 duration');

  u.mem.limbusSanity = -20;         // 已失去 20 点 → tick 结算出 1 层狂信
  assert.ok(h.runUntil(() => u.mem.fanatic >= 1, 3), '失精神驱动狂信');

  const n0 = h.hooksOf('hit').length;
  const a0 = u.skill.activations;
  open(h, u);
  assert.ok(h.runUntil(() => u.skill.activations > a0, 5), 'S2 开启');
  assert.ok(h.runUntil(() => !u.skill.active, 5), 'S2 攻击后结束（非持续窗口）');

  const hits = h.hooksOf('hit').slice(n0).filter((x) => x.source === u && x.dmg && x.dmg.isAttack && x.dmg.isSkill);
  assert.equal(hits.length, 2, 'S2 单次攻击打出 2 段');
  assert.ok(hits.every((x) => x.dmg.mul > 1.09 && x.dmg.mul < 1.11), '带【狂信】本技能物理伤害 ×1.10');
  const e = h.enemy('enemy_dummy');
  assert.equal(e.mem.bleed, 1, '命中附加 1 层【流血】（同一目标只结算一次）');
  assert.ok((e.elem.burn || 0) > 0, '命中施加灼燃损伤');
  h.invariants();
});

test('辛克莱 S3（自我毁灭的净化）= 次数技：恰好 3 次强化攻击后结束；击倒后下一击 +20%', () => {
  const { h, u } = field(null);   // 默认技能 = S3
  assert.equal(u.skill.id, 'skchr_sinclair_3');
  assert.equal(u.skill.kind, 'ammo', 'S3 是次数(3 击)技，而非 duration 窗口');

  // 监视每次攻击开始时是否带着击倒奖励
  const sawKillRush = [];
  h.battle.on('beforeAttack', (ev) => { if (ev.attacker === u) sawKillRush.push(u.buffs.some((b) => b.key === 'sinclair:killrush')); });

  const used0 = h.hooksOf('ammoUsed').filter((x) => x.unit === u).length;
  open(h, u);
  assert.equal(u.skill.ammoMax, 3, '3 次强化攻击');
  // S3 激活后，在近战范围内放一只 1 血敌人：它会被 S3 攻击击倒 → 触发击倒奖励
  h.spawn('enemy_weak', { route: 0, pos: [9, 6] });
  assert.ok(h.runUntil(() => !u.skill.active, 40), '三次攻击用尽后结束（by ammo）');
  assert.ok(h.hooksOf('skillEnd').some((c) => c.unit === u && c.reason === 'ammo'), '结束原因为弹药耗尽');
  assert.equal(h.hooksOf('ammoUsed').filter((x) => x.unit === u).length - used0, 3, '恰好消耗 3 次攻击');

  // 击倒奖励只作用于一次后续攻击，且不会被永久保留
  assert.ok(sawKillRush.some((x) => x === true), '击倒 enemy_weak 后，某次攻击带上了 +20% killrush');
  h.run(6);
  assert.ok(!u.buffs.some((b) => b.key === 'sinclair:killrush'), 'killrush 不是常驻（已被消费/清除）');
  h.invariants();
});
