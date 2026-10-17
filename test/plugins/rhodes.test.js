import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pluginDirs } from '../../tools/plugin.mjs';
import { createPluginRegistry } from '../../server/plugins/registry.js';
import { buildContentSet } from '../../server/plugins/contentSet.js';
import { setData, getData } from '../../server/data.js';
import { makeBattle, checkInvariants } from '../helpers/battleHarness.js';
import { toDataSource } from '../../server/sim/simdata.js';

test('rhodes operators can be deployed to battle harness', async () => {
  const dirs = pluginDirs(process.cwd());
  const registry = createPluginRegistry(dirs);
  const set = buildContentSet({ registry, ids: ['rhodes'] });
  assert.ok(set.cs, 'content set should build successfully');

  const originalData = getData();
  try {
    setData(set.data);
    const ds = toDataSource(set.data);
    const h = makeBattle({
      data: ds,
      units: [
        { chessId: 'chess_x_rhodes_ascln_a', row: 10, col: 4 },
        { chessId: 'chess_x_rhodes_closur_a', row: 10, col: 5 },
        { chessId: 'chess_x_rhodes_logos_a', row: 10, col: 6 },
        { chessId: 'chess_x_rhodes_monstr_a', row: 10, col: 7 },
        { chessId: 'chess_x_rhodes_savage_a', row: 10, col: 8 },
        { chessId: 'chess_x_rhodes_amiya3_a', row: 10, col: 9 },
      ]
    });
    h.step();
    const allies = h.allies();
    assert.ok(allies.length >= 6, `expected at least 6 allies, got ${allies.length}`);
    const ascln = allies.find(u => u.name === '阿斯卡纶');
    const closur = allies.find(u => u.name === '可露希尔');
    const logos = allies.find(u => u.name === '逻各斯');
    const monstr = allies.find(u => u.name === 'Mon3tr');
    const savage = allies.find(u => u.name === '暴行');
    const amiya3 = allies.find(u => u.name === '阿米娅·医疗');
    assert.ok(ascln, 'ascln should exist in battle');
    assert.ok(closur, 'closur should exist in battle');
    assert.ok(logos, 'logos should exist in battle');
    assert.ok(monstr, 'monstr should exist in battle');
    assert.ok(savage, 'savage should exist in battle');
    assert.ok(amiya3, 'amiya3 should exist in battle');
    checkInvariants(h.b);
  } finally {
    setData(originalData);
  }
});
