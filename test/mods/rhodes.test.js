import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pluginDirs } from '../../tools/plugin.mjs';
import { createPluginRegistry } from '../../server/plugins/registry.js';
import { buildContentSet } from '../../server/plugins/contentSet.js';
import { setData, getData } from '../../server/data.js';
import { toDataSource } from '../../server/sim/simdata.js';
import { makeBattle, checkInvariants } from '../helpers/battleHarness.js';
import { readFileSync } from 'node:fs';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));

test('Rhodes plugin builds with kalts2 and integrates into rhodesShip covenant', async () => {
  const dirs = pluginDirs(process.cwd());
  const registry = createPluginRegistry(dirs);
  const set = buildContentSet({ registry, ids: ['rhodes'] });
  assert.ok(set.cs, 'content set should build successfully');

  // Verify chess records
  const chessA = set.data.chess['chess_x_rhodes_kalts2_a'];
  const chessB = set.data.chess['chess_x_rhodes_kalts2_b'];
  assert.ok(chessA, 'chess_x_rhodes_kalts2_a must exist in set.data.chess');
  assert.ok(chessB, 'chess_x_rhodes_kalts2_b must exist in set.data.chess');
  assert.equal(chessA.tier, 5);
  assert.deepEqual(chessA.bonds, ['rhodesShip', 'deputShip']);
  assert.equal(chessA.skills.length, 3, 'Must have all 3 skills');

  // Verify rhodesShip bond members
  const rhodesBond = set.data.bonds['rhodesShip'];
  assert.ok(rhodesBond, 'rhodesShip bond must exist');
  assert.ok(rhodesBond.members.includes('chess_x_rhodes_kalts2_a'), 'kalts2_a must be in rhodesShip members');

  // Test battle with kalts2
  const originalData = getData();
  try {
    setData(set.data);
    const ds = toDataSource(set.data);
    const h = makeBattle({
      data: ds,
      units: [
        { chessId: 'chess_x_rhodes_kalts2_a', row: 10, col: 5, skillIndex: 2 },
        { chessId: 'chess_x_rhodes_amiya3_a', row: 10, col: 6 }
      ]
    });
    h.step();
    const allies = h.allies();
    assert.ok(allies.length >= 2, `expected at least 2 allies, got ${allies.length}`);
    const kalts = allies.find(u => u.name === '凯尔希·思衡托');
    const amiya = allies.find(u => u.name === '阿米娅·医疗');
    assert.ok(kalts, 'kalts2 should exist in battle');
    assert.ok(amiya, 'amiya3 should exist in battle');
    assert.deepEqual(kalts.def.bonds, ['rhodesShip', 'deputShip']);
    assert.equal(kalts.s.flags.liftoff, true, 'kalts2 should have liftoff flag from T1');
    checkInvariants(h.b);
  } finally {
    setData(originalData);
  }
});

test('DIY operators kalts2 and wisdel in backups.json activate rhodesShip', () => {
  const backups = load('backups');
  assert.deepEqual(backups.diy.operators['char_1052_kalts2'].bonds, ['rhodesShip']);
  assert.deepEqual(backups.diy.operators['char_1035_wisdel'].bonds, ['rhodesShip']);
  assert.deepEqual(backups.diy.operators['char_1050_chen3'].bonds, ['yanShip']);
  assert.deepEqual(backups.diy.operators['char_2027_wang'].bonds, ['yanShip']);
});
