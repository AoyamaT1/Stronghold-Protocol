import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pluginDirs } from '../../tools/plugin.mjs';
import { createPluginRegistry } from '../../server/plugins/registry.js';
import { buildContentSet } from '../../server/plugins/contentSet.js';
import { setData, getData } from '../../server/data.js';
import { makeBattle, checkInvariants } from '../helpers/battleHarness.js';
import { toDataSource } from '../../server/sim/simdata.js';

test('ave-mujica operators can be deployed to battle harness', async () => {
  const dirs = pluginDirs(process.cwd());
  const registry = createPluginRegistry(dirs);
  const set = buildContentSet({ registry, ids: ['ave-mujica'] });
  assert.ok(set.cs, 'content set should build successfully');

  const originalData = getData();
  try {
    setData(set.data);
    const ds = toDataSource(set.data);
    const h = makeBattle({
      data: ds,
      units: [
        { chessId: 'chess_x_ave_mujica_amoris_a', row: 10, col: 4 },
        { chessId: 'chess_x_ave_mujica_tmoris_a', row: 10, col: 5 },
        { chessId: 'chess_x_ave_mujica_mortis_a', row: 10, col: 6 },
        { chessId: 'chess_x_ave_mujica_dolris_a', row: 10, col: 7 },
        { chessId: 'chess_x_ave_mujica_oblvns_a', row: 10, col: 8 },
      ]
    });
    h.step();
    const allies = h.allies();
    assert.ok(allies.length >= 5, `expected at least 5 allies, got ${allies.length}`);
    const amoris = allies.find(u => u.name === '祐天寺若麦');
    const tmoris = allies.find(u => u.name === '八幡海铃');
    const mortis = allies.find(u => u.name === '若叶睦');
    const dolris = allies.find(u => u.name === '三角初华');
    const oblvns = allies.find(u => u.name === '丰川祥子');
    assert.ok(amoris, 'amoris should exist in battle');
    assert.ok(tmoris, 'tmoris should exist in battle');
    assert.ok(mortis, 'mortis should exist in battle');
    assert.ok(dolris, 'dolris should exist in battle');
    assert.ok(oblvns, 'oblvns should exist in battle');
    checkInvariants(h.b);
  } finally {
    setData(originalData);
  }
});
