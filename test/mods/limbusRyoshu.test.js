// test/mods/limbusRyoshu.test.js — 重做后的良秀(Ryōshū)：呼吸法/流血+灼燃铺核、空间斩按层增伤、S3 直线定身大招（取代旧圆形群攻）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { KITS } from '../../server/sim/content/index.js';

const charOf = (u) => String(u.def?.raw?.charId || u.def?.charId || '');
const find = (h, name) => h.allies().find((u) => charOf(u).includes(name));

function field(enemies) {
  const h = makeBattle({
    defs: { enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e9, def: 0, res: 0, speed: 0, atk: 0 }) } },
    units: [
      { chessId: 'chess_char_5_limbus_ryoshu_a', row: 10, col: 3, dir: 'RIGHT' },
      { chessId: 'chess_char_1_limbus_yisang_a', row: 11, col: 3, dir: 'RIGHT' },
      { chessId: 'chess_char_1_limbus_sinclair_a', row: 11, col: 4, dir: 'RIGHT' },
    ],
    enemies,
    bonds: { limbusShip: { count: 3, active: true, tier: 1, layers: 0 } },
  });
  h.b.start();
  return h;
}

test('良秀 kit 已注册', () => {
  assert.equal(typeof KITS.char_limbus_ryoshu, 'function');
});

test('良秀 普攻基线：呼吸法涨攻 + 目标附【流血】与灼燃', () => {
  const h = field([{ key: 'enemy_dummy', pos: [10, 4] }]);  // 身前相邻，良秀会普攻它
  const ro = find(h, 'ryoshu');
  h.run(4);
  const dummy = h.enemies()[0];
  assert.ok((ro.mem.ryoBreath || 0) >= 1, `呼吸法≥1，实得 ${ro.mem.ryoBreath || 0}`);
  assert.ok(ro.findBuff('ryoshu:breath'), '呼吸法 atkPct buff 存在');
  assert.ok((dummy.mem?.bleed || 0) >= 1, `目标【流血】≥1，实得 ${dummy.mem?.bleed || 0}`);
  assert.ok((dummy.elem?.burn || 0) > 0, '目标灼燃损伤 > 0');
  assert.ok(ro.findBuff('ryoshu:defignore'), '特性：无视部分防御 buff 存在');
});

test('良秀 S3 空间斩：前方直线定身1秒 + 一次大伤害；直线外不受影响（非圆形群攻）', () => {
  const h = field([
    { key: 'enemy_dummy', pos: [10, 5] },  // 身前直线内
    { key: 'enemy_dummy', pos: [8, 5] },   // 偏离直线（不同排）
  ]);
  const ro = find(h, 'ryoshu');
  h.run(0.1);   // 让 pos 敌人落位
  const inLine = h.enemies().find((e) => Math.abs(e.y - 10) < 0.6);
  const offLine = h.enemies().find((e) => Math.abs(e.y - 10) >= 0.6);
  const hpInBefore = inLine.hp, hpOffBefore = offLine.hp;
  ro.kit.skills.skchr_ryoshu_3.onCast({ battle: h.b, unit: ro });
  // 定身立即生效
  assert.ok(inLine.findBuff('bind') || inLine.s.flags.bind, '直线内敌人被【定身】');
  assert.ok(!(offLine.findBuff('bind') || offLine.s.flags.bind), '直线外敌人不被定身');
  h.run(0.6);  // 跨过预兆(0.3s)，结算大伤害
  assert.ok(inLine.hp < hpInBefore, '直线内敌人受到大伤害');
  assert.equal(offLine.hp, hpOffBefore, '直线外敌人毫发无损（证明非圆形群攻）');
});
