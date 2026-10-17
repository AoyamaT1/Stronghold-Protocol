// server/sim/content/bonds.js — the 23 official bonds (盟约) plus the mod covenants, battle side + prep side
// (DESIGN §7, research 02).
//
// Entry point imported by content/index.js. The work is split into submodules that each export
// install(battle) / registerMeta(registry):
//   bonds/core.js    8 core bonds  炎 萨尔贡 维多利亚 谢拉格 拉特兰 阿戈尔 叙拉古 卡西米尔
//   bonds/addon.js   15 add-on bonds 精准 迅捷 灵巧 奥术 坚守 助力 远见 奇迹 投资人 突袭 不屈 调和 协防干员 独行 绝技
//   mods/rhodes/bonds.js       罗德岛 (rhodesShip): 6-member barrier on overheal + its detonation
//   mods/aveMujica/bonds.js    Ave Mujica (aveMujicaShip): per-layer damage, halved SP cost, Fever, Timoris prep
//   mods/limbusCompany/bonds.js  边狱公司 (limbusShip): sanity ladder, per-layer damage, 6-member tiers
//   mods/fgoRoundTable/bonds.js  圆桌 (roundTable): atk/def per layer, resonance, the 9-member sky + its items
// plus support/meta.js (shared prep→battle `contentInfo`). Parts are loaded with guarded dynamic imports and run in
// isolation: one failing part never disables the others (the first error is re-thrown afterwards so
// content/index.js records it in battle.errors / the server log).
// Membership (own bonds, 变形同构体 grants, 调和 enjoying active core bonds) lives in support/index.js.
//
// The mod covenants are the layer a 0.3.0 content plugin cannot carry: plugins add operators/garrisons/effects, but
// `bonds` is a closed record map (shared/plugins/patch.js RECORD_MAPS) — no plugin can add a covenant, so the
// records live in data/bonds.json + data/effects.json and the behavior here. The operators (plugins/*) point their
// `chess.bonds` at these ids; a room's content-set expander fills the member lists. Scripts that rebuild the data:
// scratch/restore-covenants.mjs, scratch/restore-covenant-links.mjs. See docs/模组迁移交接.md and AGENT-COORD.md §3.

async function load(path) {
  try {
    return await import(path);
  } catch (e) {
    console.error(`[content] failed to load ${path}: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`);
    return {};
  }
}

const [core, addon, supportMeta, rhodes, aveMujica, limbus, fgo] = await Promise.all([
  load('./bonds/core.js'),
  load('./bonds/addon.js'),
  load('./support/meta.js'),
  load('./mods/rhodes/bonds.js'),
  load('./mods/aveMujica/bonds.js'),
  load('./mods/limbusCompany/bonds.js'),
  load('./mods/fgoRoundTable/bonds.js'),
]);
const PARTS = Object.freeze([
  ['bonds/core', core],
  ['bonds/addon', addon],
  ['mods/rhodes', rhodes],
  ['mods/aveMujica', aveMujica],
  ['mods/limbusCompany', limbus],
  ['mods/fgoRoundTable', fgo],
]);

function runAll(fnName, arg, pre = null) {
  let first = null;
  if (pre) { try { pre(arg); } catch (e) { first = first ?? e; } }
  for (const [name, mod] of PARTS) {
    if (typeof mod[fnName] !== 'function') continue;
    try { mod[fnName](arg); } catch (e) {
      if (!first) { first = e; try { e.message = `${name}.${fnName}: ${e.message}`; } catch { /* frozen */ } }
    }
  }
  if (first) throw first;
}

export function install(battle) { runAll('install', battle); }

export function registerMeta(registry) {
  runAll('registerMeta', registry, typeof supportMeta.registerSupportMeta === 'function' ? supportMeta.registerSupportMeta : null);
}
