// test/mods/limbusGarrisons.test.js — the 5 reworked 边狱公司 garrison 特质 (PR: 默尔索/奥提斯/良秀/唐吉诃德/格里高尔).
// In-battle traits drive the real battle (manual event emits isolate each handler's layer gain); the two prep traits
// drive the meta handlers through a stub ctx (the shared garrisons_meta harness is unrelated-pre-existing broken).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle } from '../helpers/battleHarness.js';
import * as S from '../../server/sim/content/support/index.js';
import { frontOf } from '../../server/sim/dir.js';
import { absoluteRangeKeys } from '../../server/sim/targeting.js';
import { COLS } from '../../server/sim/constants.js';
import { HANDLERS } from '../../server/sim/content/garrisons/meta.js';

import { pluginDirs } from '../../tools/plugin.mjs';
import { createPluginRegistry } from '../../server/plugins/registry.js';
import { buildContentSet } from '../../server/plugins/contentSet.js';
import { toDataSource } from '../../server/sim/simdata.js';

const dirs = pluginDirs(process.cwd());
const registry = createPluginRegistry(dirs);
const set = buildContentSet({ registry, ids: ['limbus-company'] });

const ALIASES = {
  chess_char_5_limbus_ryoshu_a: 'chess_x_limbus_company_ryoshu_a',
  chess_char_1_limbus_yisang_a: 'chess_x_limbus_company_yisang_a',
  chess_char_1_limbus_sinclair_a: 'chess_x_limbus_company_sinclair_a',
  chess_char_6_limbus_donquixote_a: 'chess_x_limbus_company_donquixote_a',
  chess_char_5_limbus_outis_a: 'chess_x_limbus_company_outis_a',
  chess_char_6_limbus_gregor_a: 'chess_x_limbus_company_gregor_a',
  chess_char_4_limbus_meursault_a: 'chess_x_limbus_company_meursault_a',
};
const ds = toDataSource(set.data);

const L = (h) => S.bondLayers(h.b, 'p1', 'limbusShip');
const charOf = (u) => String(u.def?.raw?.charId || u.def?.charId || '');
const find = (h, name) => h.allies().find((u) => charOf(u).includes(name));
const enemy = () => ({ side: 'enemy', kind: 'enemy', alive: false });

function field(units) {
  const mapped = units.map(u => ({
    ...u,
    chessId: ALIASES[u.chessId] || u.chessId
  }));
  const h = makeBattle({ data: ds, units: mapped, bonds: { limbusShip: { count: units.length, active: true, tier: 2, layers: 0 } } });
  h.b.start();
  return h;
}

test('良秀 garrison: 仅「使用技能击杀」才给自身已激活盟约 +3', () => {
  const h = field([
    { chessId: 'chess_char_5_limbus_ryoshu_a', row: 10, col: 3, dir: 'RIGHT' },
    { chessId: 'chess_char_1_limbus_yisang_a', row: 10, col: 4, dir: 'RIGHT' },
    { chessId: 'chess_char_1_limbus_sinclair_a', row: 11, col: 4, dir: 'RIGHT' },
  ]);
  const ry = find(h, 'ryoshu');
  const before = L(h);
  h.b.emit('kill', { killer: ry, victim: enemy() });      // 无技能窗口 → 不计
  assert.equal(L(h), before, '非技能击杀不加层');
  h.b.emit('skillStart', { unit: ry });
  const mid = L(h);                                        // 开技含 bonds.js 良秀叠层，另算
  h.b.emit('kill', { killer: ry, victim: enemy() });
  assert.equal(L(h) - mid, 3, '技能击杀 +3（bond_self）');
});

test('唐吉诃德 garrison: 任意边狱干员技能击杀 → 边狱 +1', () => {
  const h = field([
    { chessId: 'chess_char_6_limbus_donquixote_a', row: 10, col: 3, dir: 'RIGHT' },
    { chessId: 'chess_char_1_limbus_yisang_a', row: 10, col: 4, dir: 'RIGHT' },
    { chessId: 'chess_char_1_limbus_sinclair_a', row: 11, col: 4, dir: 'RIGHT' },
  ]);
  const ys = find(h, 'yisang');
  const before = L(h);
  h.b.emit('kill', { killer: ys, victim: enemy() });       // 非技能 → 不计
  assert.equal(L(h), before, '非技能击杀不加层');
  h.b.emit('skillStart', { unit: ys });
  const mid = L(h);                                         // 李箱非叠层手，开技不加盟约层
  h.b.emit('kill', { killer: ys, victim: enemy() });
  assert.equal(L(h) - mid, 1, '队友技能击杀 → 边狱 +1');
});

test('奥提斯 garrison: 身前一格干员开技 → 最高激活盟约 +2', () => {
  const h = field([
    { chessId: 'chess_char_5_limbus_outis_a', row: 10, col: 3, dir: 'RIGHT' },
    { chessId: 'chess_char_1_limbus_yisang_a', row: 10, col: 4, dir: 'RIGHT' },
    { chessId: 'chess_char_1_limbus_sinclair_a', row: 11, col: 4, dir: 'RIGHT' },
  ]);
  const outis = find(h, 'outis');
  const ys = find(h, 'yisang');
  const [fr, fc] = frontOf(outis.tileR, outis.tileC, outis.dir);
  ys.tileR = fr; ys.tileC = fc;                            // 放到奥提斯身前一格
  const before = L(h);
  h.b.emit('skillStart', { unit: ys });
  assert.equal(L(h) - before, 2, '身前干员开技 → +2');
});

test('默尔索 garrison 处理器: 召唤 ≤4 阶同盟约干员，每回合一次', () => {
  const calls = [];
  const counters = {};
  const ctx = {
    source: { bb: { count: 1, max_tier: 4 }, bbStr: { bond: 'limbusShip', once_per_round: '1' } },
    round: 1,
    incCounter(k) { counters[k] = (counters[k] || 0) + 1; return counters[k]; },
    shopLevel() { return 6; },
    rollChess({ bond, maxTier }) { calls.push(['roll', bond, maxTier]); return 'chess_summoned'; },
    grantChess(id) { calls.push(['grant', id]); },
  };
  HANDLERS.SERVER_SUMMON_BOND_CHESS.run(ctx);
  HANDLERS.SERVER_SUMMON_BOND_CHESS.run(ctx);              // 同回合第二次 → 被挡
  assert.deepEqual(calls, [['roll', 'limbusShip', 4], ['grant', 'chess_summoned']], '只召唤一次、≤4阶、同盟约');
  ctx.round = 2;                                            // 新回合可再召唤
  HANDLERS.SERVER_SUMMON_BOND_CHESS.run(ctx);
  assert.equal(calls.filter((c) => c[0] === 'grant').length, 2, '新回合再召唤一次');
});

test('格里高尔 garrison 处理器: 攻击范围内每名其他干员 → 边狱 +3', () => {
  const grid = [[0, 0], [0, 1]];
  const me = { uid: 1, id: 'chess_char_6_limbus_gregor_a', kind: 'chess', area: 'board', row: 10, col: 4, dir: 'RIGHT' };
  const keys = absoluteRangeKeys(grid, me.row, me.col, me.dir, 0);
  const otherKey = keys.find((k) => k !== me.row * COLS + me.col);
  const ally = { uid: 2, kind: 'chess', area: 'board', row: Math.floor(otherKey / COLS), col: otherKey % COLS };
  const added = [];
  const ctx = {
    source: { piece: me, bb: { count: 3 }, bbStr: { bond_id: 'limbusShip' }, garrison: { desc: '…+3（无需激活盟约）' } },
    piece: (uid) => (uid === me.uid ? me : null),
    board: () => [me, ally],
    chessRecord: (id) => (id === me.id ? { rangeGrid: grid } : null),
    addLayers: (bond, n, opts) => { added.push([bond, n, opts.requireActive]); return n; },
  };
  HANDLERS.SERVER_ADD_BOND_BY_RANGE_UNITS.run(ctx);
  assert.deepEqual(added, [['limbusShip', 3, false]], '范围内 1 名干员 → +3，无需激活');
});
