import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pluginDirs } from '../../tools/plugin.mjs';
import { createPluginRegistry } from '../../server/plugins/registry.js';
import { buildContentSet } from '../../server/plugins/contentSet.js';
import { setData, getData } from '../../server/data.js';
import { makeBattle, checkInvariants } from '../helpers/battleHarness.js';
import { toDataSource } from '../../server/sim/simdata.js';

test('limbus-company operators can be deployed to battle harness', async () => {
  const dirs = pluginDirs(process.cwd());
  const registry = createPluginRegistry(dirs);
  const set = buildContentSet({ registry, ids: ['limbus-company'] });
  assert.ok(set.cs, 'content set should build successfully');

  const originalData = getData();
  try {
    setData(set.data);
    const ds = toDataSource(set.data);
    const sinners = ['yisang', 'sinclair', 'faust', 'ishmael', 'rodion', 'heathcliff', 'meursault', 'honglu', 'ryoshu', 'outis', 'donquixote', 'gregor'];
    const units = sinners.map((s, idx) => ({
      chessId: 'chess_x_limbus_company_' + s + '_a',
      row: 9 + Math.floor(idx / 6),
      col: 3 + (idx % 6)
    }));

    const h = makeBattle({
      data: ds,
      units
    });
    h.step();
    const allies = h.allies();
    assert.ok(allies.length >= 12, `expected at least 12 allies, got ${allies.length}`);

    const names = [
      '李箱', '辛克莱', '浮士德', '以实玛利', '罗佳', '希斯克利夫',
      '默尔索', '鸿璐', '良秀', '奥提斯', '堂吉诃德', '格里高尔'
    ];
    for (const name of names) {
      const u = allies.find(x => x.name === name);
      assert.ok(u, `sinner ${name} should exist in battle`);
    }
    checkInvariants(h.b);
  } finally {
    setData(originalData);
  }
});
