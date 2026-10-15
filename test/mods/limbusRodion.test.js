// test/mods/limbusRodion.test.js — 重做后的罗佳(Rodion)：深泪/泪锋/守护之剑/消耗精神→队友护盾，且不再有旧的治疗光环·自吸血·大护盾。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle } from '../helpers/battleHarness.js';
import { KITS } from '../../server/sim/content/index.js';

const charOf = (u) => String(u.def?.raw?.charId || u.def?.charId || '');
const find = (h, name) => h.allies().find((u) => charOf(u).includes(name));

function field() {
  const h = makeBattle({
    units: [
      { chessId: 'chess_char_3_limbus_rodion_a', row: 10, col: 3, dir: 'RIGHT' },
      { chessId: 'chess_char_1_limbus_yisang_a', row: 10, col: 4, dir: 'RIGHT' },
      { chessId: 'chess_char_1_limbus_sinclair_a', row: 11, col: 4, dir: 'RIGHT' },
    ],
    bonds: { limbusShip: { count: 3, active: true, tier: 1, layers: 0 } },
  });
  h.b.start();
  return h;
}

test('罗佳 kit 已注册', () => {
  assert.equal(typeof KITS.char_limbus_rodion, 'function', 'char_limbus_rodion kit registered');
});

test('罗佳 S1 命中累加【深泪】（无旧的按已失生命真伤）', () => {
  const h = field();
  const ro = find(h, 'rodion');
  const s1 = ro.kit.skills.skchr_rodion_1;
  ro.mem.deepTears = 0;
  s1.attack.onHit({ battle: h.b, unit: ro, target: null });
  s1.attack.onHit({ battle: h.b, unit: ro, target: null });
  assert.equal(ro.mem.deepTears, 4, 'S1 两次命中 → 深泪 4');
});

test('罗佳 特性 tick：精神充裕时消耗精神给队友护盾+攒守护之剑', () => {
  const h = field();
  const ro = find(h, 'rodion');
  const ys = find(h, 'yisang');
  ro.mem.limbusSanity = 45;     // 精神充裕 → 可消耗生成护盾（需 > shield_cost 8）
  h.run(7);                     // 跨过 shield_interval(6s)
  assert.ok((ro.mem.guardSword || 0) >= 1, `守护之剑≥1，实得 ${ro.mem.guardSword || 0}`);
  const sh = ys.findBuff('buff:rodion:guardShield');
  assert.ok(sh && sh.shield > 0, '队友（李箱）获得罗佳护盾');
});

test('罗佳 特性 tick：泪锋随累计失智涨攻；负精神给自身减伤', () => {
  const h = field();
  const ro = find(h, 'rodion');
  ro.mem.limbusSanity = -30;    // 深负精神
  ro.mem._rodLost = 30;         // 累计失去 30 → 泪锋 2 层
  h.run(1);                     // 跑几帧让 tick 刷新 buff
  const tear = ro.findBuff('buff:rodion:tear');
  assert.ok(tear && tear.mods.atkPct >= 0.16 - 1e-9, `泪锋≥2层(+16%攻)，实得 ${tear && tear.mods && tear.mods.atkPct}`);
  const red = ro.findBuff('buff:rodion:negred');
  assert.ok(red && red.mods.dmgTakenMul < 1, '负精神 → 自身减伤');
});

test('罗佳 S3 消耗深泪换增伤且封顶；不自吸血（旧 kit 的自回复已删）', () => {
  const h = field();
  const ro = find(h, 'rodion');
  ro.mem.deepTears = 20;
  const hp0 = ro.hp;
  ro.kit.skills.skchr_rodion_3.onStart({ battle: h.b, unit: ro });
  const burst = ro.findBuff('buff:rodion:s3burst');
  assert.ok(burst, 'S3 挂上爆发 buff');
  assert.ok(burst.mods.dmgDealtMul <= 1.3 + 1e-9, `S3 增伤封顶 ≤+30%，实得 ${burst.mods.dmgDealtMul}`);
  assert.ok(burst.mods.atkPct <= 0.4 + 1e-9, `S3 增攻封顶 ≤+40%，实得 ${burst.mods.atkPct}`);
  assert.ok((ro.mem.deepTears || 0) <= 0, 'S3 消耗全部深泪');
  assert.equal(ro.hp, hp0, 'S3 不再自吸血');
});
