// 冒烟测试：6 个边狱干员上场，跑一场真战斗，dump 叠层状态
import { Battle } from '../../server/sim/Battle.js';
import { getDefaultSource, spawnsFromTemplate } from '../../server/sim/simdata.js';
import { getData } from '../../server/data.js';
import chessJson from '../../mods/limbus-company/data/chess.json' with { type: 'json' };

const data = getData();
const ds = getDefaultSource();
const tpl = ds.getWave('act1autochess_03');
const conv = spawnsFromTemplate(tpl, { mods: { hpMul: 1, atkMul: 1, speedMul: 1 } });

const IDS = Object.keys(chessJson).filter((k) => k.endsWith('_a') && k.includes('limbus')).slice(0, 6);
const units = IDS.map((id, i) => ({ uid: i + 1, kind: 'chess', chessId: id, skillIndex: 2, row: 9 - Math.floor(i / 6), col: 3 + (i % 6) }));

const b = new Battle({
  seed: 1, kind: 'normal', modeId: 'mode_multi_normal', round: 5,
  stageId: 'act1autochess_m03', timeLimit: 60, data,
  routes: conv.routes, spawns: conv.spawns,
  players: [{ playerId: 'P1', seat: 0, side: 'L', colOffset: 0, units }],
  content: 'full', fieldId: 'sim',
});
let t = 0;
while (t < 60) { b.step(1 / 30); t += 1 / 30; }
console.log(`t=${t.toFixed(1)}  击杀=${b.killed}/${b.total}  友方=${b.units.filter(u=>u.side==='ally').length}  敌方存活=${b.enemies.filter(e=>e.alive).length}`);
for (const u of b.units.filter((u) => u.side === 'ally')) {
  const mem = u.mem || {};
  const nums = Object.keys(mem).filter((k) => typeof mem[k] === 'number').map((k) => `${k}=${mem[k]}`);
  console.log(`  ammo=${u.skill&&u.skill.ammo} ${u.name} | skill=${u.skill ? (u.skill.id || u.skill.kind || 'yes') : 'NULL'} | ${nums.join(' ') || '(无叠层)'}`);
}
