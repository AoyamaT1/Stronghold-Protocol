// test/mods/limbusIshmael.test.js — 重做后的以实玛利(Ishmael)：远程支援——攻击使敌【脆弱】+铺【流血】、友方光环/全船之力、鱼叉残血增伤。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { KITS } from '../../server/sim/content/index.js';

const charOf = (u) => String(u.def?.raw?.charId || u.def?.charId || '');
const find = (h, name) => h.allies().find((u) => charOf(u).includes(name));

function field(enemies = []) {
  const h = makeBattle({
    defs: { enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e9, def: 0, res: 0, speed: 0, atk: 0 }) } },
    units: [
      { chessId: 'chess_char_2_limbus_ishmael_a', row: 10, col: 3, dir: 'RIGHT' },
      { chessId: 'chess_char_1_limbus_yisang_a', row: 10, col: 4, dir: 'RIGHT' },
      { chessId: 'chess_char_1_limbus_sinclair_a', row: 11, col: 3, dir: 'RIGHT' },
    ],
    enemies,
    bonds: { limbusShip: { count: 3, active: true, tier: 1, layers: 0 } },
  });
  h.b.start();
  return h;
}

test('以实玛利 kit 已注册', () => {
  assert.equal(typeof KITS.char_limbus_ishmael, 'function');
});

test('特性：攻击使目标【脆弱】并铺【流血】', () => {
  const h = field([{ key: 'enemy_dummy', pos: [10, 5] }]);  // 她的 3 格直线射程内
  h.run(4);
  const dummy = h.enemies()[0];
  assert.ok(dummy.findBuff('fragile') || dummy.s.dmgTakenMul > 1, '目标被【脆弱】(dmgTakenMul>1)');
  assert.ok((dummy.mem?.bleed || 0) >= 1, `目标获得【流血】，实得 ${dummy.mem?.bleed || 0}`);
});

test('天赋：范围友方 atk/aspd 光环 + 全船之力按队伍规模涨攻', () => {
  const h = field();
  const ro = find(h, 'ishmael');
  const ys = find(h, 'yisang');
  h.run(1);
  const aura = ys.findBuff('buff:ishmael:aura');
  assert.ok(aura && aura.mods.atkPct >= 0.12 - 1e-9, '范围友方获得追踪到底光环(+12%攻)');
  const crew = ro.findBuff('buff:ishmael:crew');
  assert.ok(crew && crew.mods.atkPct >= 0.08 - 1e-9, `全船之力：2 名其他边狱 → +8%攻，实得 ${crew && crew.mods && crew.mods.atkPct}`);
});

test('S2：命中触发范围友方追加攻击（走冷却）', () => {
  const h = field([{ key: 'enemy_dummy', pos: [10, 5] }]);
  const ro = find(h, 'ishmael');
  h.run(0.1);
  const target = h.enemies()[0];
  ro.mem._ishFollowCd = 0;
  ro.kit.skills.skchr_ishmael_2.attack.onHit({ battle: h.b, unit: ro, target });
  assert.ok((ro.mem._ishFollowCd || 0) > 0, 'S2 命中后进入友方追击冷却（追击分支已执行）');
});

test('S3 执着鱼叉：残血+流血目标伤害更高（dmgMul）；不再把全队理智设满', () => {
  const h = field();
  const ro = find(h, 'ishmael');
  const dm = ro.kit.skills.skchr_ishmael_3.attack.dmgMul;
  const full = dm(h.b, ro, { hp: 1000, s: { maxHp: 1000 }, mem: { bleed: 0 } });
  const low = dm(h.b, ro, { hp: 100, s: { maxHp: 1000 }, mem: { bleed: 10 } });
  assert.equal(full, 1, '满血无流血目标 dmgMul=1');
  assert.ok(low > full && low <= 1.5 + 1e-9, `残血+流血目标 dmgMul 更高且封顶(≤1.5)，实得 ${low}`);
  // 良秀/旧版曾把全队理智设满——现在 S3 不碰 limbusSanity（只在击杀钩子里给最低 2 人回理智）
  const san0 = find(h, 'sinclair').mem.limbusSanity;
  ro.kit.skills.skchr_ishmael_3.attack.onHit({ battle: h.b, unit: ro, target: { alive: true, mem: {} } });
  assert.equal(find(h, 'sinclair').mem.limbusSanity, san0, 'S3 命中不改他人理智');
});
