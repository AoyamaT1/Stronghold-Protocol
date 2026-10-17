import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pluginDirs } from '../../tools/plugin.mjs';
import { createPluginRegistry } from '../../server/plugins/registry.js';
import { buildContentSet } from '../../server/plugins/contentSet.js';
import { setData, getData } from '../../server/data.js';
import { makeBattle, checkInvariants } from '../helpers/battleHarness.js';
import { toDataSource } from '../../server/sim/simdata.js';
import { compileDslMeta } from '../../server/match/dslMeta.js';

test('fgo-round-table operators can be deployed to battle harness and DSL relics compile', async () => {
  const dirs = pluginDirs(process.cwd());
  const registry = createPluginRegistry(dirs);
  const set = buildContentSet({ registry, ids: ['fgo-round-table'] });
  assert.ok(set.cs, 'content set should build successfully');

  // Verify relics DSL attached
  assert.ok(set.data.dsl && set.data.dsl['fgo-round-table'], 'dsl table should have fgo-round-table specs');
  const dslSpec = set.data.dsl['fgo-round-table'][0];
  const compiledMeta = compileDslMeta(dslSpec, { pluginId: 'fgo-round-table' });
  assert.ok(compiledMeta.onRoundStart, 'relics DSL should have onRoundStart hook');
  assert.ok(compiledMeta.onIncome, 'relics DSL should have onIncome hook');

  const originalData = getData();
  try {
    setData(set.data);
    const ds = toDataSource(set.data);
    const servants = [
      'gareth', 'bedivere', 'tristan', 'percival', 'baobhan',
      'gawain', 'barghest', 'mash', 'lancelot', 'mordred',
      'melusine', 'artoria', 'merlin', 'castoria', 'morgan'
    ];
    const units = servants.map((s, idx) => ({
      chessId: 'chess_x_fgo_round_table_' + s + '_a',
      row: 9 + Math.floor(idx / 5),
      col: 3 + (idx % 5)
    }));

    const h = makeBattle({
      data: ds,
      units
    });
    h.step();
    const allies = h.allies();
    assert.ok(allies.length >= 15, `expected at least 15 allies, got ${allies.length}`);

    const names = [
      '加雷斯', '贝德维尔', '崔斯坦', '珀西瓦尔', '芭万·希',
      '高文', '巴格斯特', '玛修', '兰斯洛特', '莫德雷德',
      '美露莘', '阿尔托莉雅', '梅林', '阿尔托莉雅·卡斯特', '摩根'
    ];
    for (const name of names) {
      const u = allies.find(x => x.name === name);
      assert.ok(u, `servant ${name} should exist in battle`);
    }
    checkInvariants(h.b);
  } finally {
    setData(originalData);
  }
});
