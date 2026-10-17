// mods/fgo-round-table/sim/items.js — 6 FGO Round Table equipment pairs (12 total items)
//
// Compliant with PRTS & Stronghold Protocol direct乘算 / item standards.
// 1. chess_item_1_fgo_sqshard_a/b (圣晶石碎片): grants roundTable layers on battle start
// 2. chess_item_2_fgo_crestshield_a/b (圆桌纹章盾): DEF/RES buff; combo with 变形同构体 grants 【圆桌】
// 3. chess_item_3_fgo_silverarmor_a/b (卡美洛白银甲): HP buff, resist; golden grants 15% phys/arts dmg cut
// 4. chess_item_4_fgo_belt_a/b (柏希雷克腰带): Initial SP +10/+18; sets sunlight tiles around carrier
// 5. chess_item_5_fgo_staff_a/b (选定之杖): ATK +30%/+50%, SP regen +0.25/+0.4/s; Castoria/Morgan first skill restores 5 SP to all
// 6. chess_item_6_fgo_avalon_a/b (遥远的理想乡): Max HP +50%/+80%, 4%/7% regen/s; Round Table fatal lock 5s + 50% heal; combo with silverarmor +1 SP/s

import * as S from '../../support/index.js';
import { weaknessRetype } from '../../items/battle.js';

const num = S.num;

/** Check if unit carries an item whose id starts with or matches prefix */
function hasItemPrefix(unit, prefix) {
  const items = S.itemsOf(unit);
  return items.some((id) => id.includes(prefix));
}

export function install(battle) {
  if (!battle || !Array.isArray(battle.allyUnits)) return;

  for (const u of battle.allyUnits) {
    if (u.kind !== 'op') continue;
    const items = S.itemsOf(u);
    if (!items.length) continue;

    for (const itemId of items) {
      const isGolden = itemId.endsWith('_b');

      // 1. 圣晶石碎片
      if (itemId.includes('fgo_sqshard')) {
        const layers = isGolden ? 6 : 3;
        S.gainLayers(battle, { playerId: u.ownerId, bonds: 'roundTable', n: layers, source: u, reason: 'item:fgo_sqshard' });
      }

      // 2. 圆桌纹章盾
      if (itemId.includes('fgo_crestshield')) {
        const defPct = isGolden ? 0.35 : 0.20;
        const resFlat = isGolden ? 25 : 15;
        S.passiveBuff(battle, u, `item:${itemId}:stat`, { defPct, resFlat });

        // 原版联动: 与变形同构体 (chess_item_6_06_e or chess_item_6_06) 一同携带时获得【圆桌】身份
        if (hasItemPrefix(u, 'chess_item_6_06')) {
          u.def = u.def || {};
          u.def.bonds = u.def.bonds || [];
          if (!u.def.bonds.includes('roundTable')) {
            u.def.bonds.push('roundTable');
          }
        }
      }

      // 3. 卡美洛白银甲
      if (itemId.includes('fgo_silverarmor')) {
        const hpPct = isGolden ? 0.50 : 0.30;
        const mods = { hpPct };
        if (isGolden) {
          mods.dmgTakenMul = 0.85; // 受到物理/法术伤害 -15%
        }
        S.passiveBuff(battle, u, `item:${itemId}:stat`, mods);
        // 获得常驻抵抗
        battle.addBuff(u, {
          key: 'status:resist',
          status: 'resist',
          duration: Infinity,
          visible: true,
          allowDead: true,
          refresh: 'replace'
        });
      }

      // 4. 柏希雷克腰带
      if (itemId.includes('fgo_belt')) {
        const initSp = isGolden ? 18 : 10;
        if (u.skill) {
          if (typeof u.skill.gainSp === 'function') u.skill.gainSp(initSp, 'belt');
          else u.skill.sp = Math.min(u.skill.spCost ?? 100, (u.skill.sp || 0) + initSp);
        }
        // 赋予自身及周围【阳光照射】
        const sunlightBuff = () => {
          for (const a of battle.allyUnits) {
            if (a.kind !== 'op') continue;
            const dist = Math.max(Math.abs(a.x - u.x), Math.abs(a.y - u.y));
            if (dist <= (isGolden ? 1.5 : 1.05)) {
              const isRoundTable = S.isMember(battle, a, 'roundTable');
              const isFlame = S.isMember(battle, a, 'yanShip');
              if (isRoundTable || isFlame) {
                const atkBonus = isGolden ? 0.30 : 0.15;
                S.passiveBuff(battle, a, 'item:fgo_belt:sunlight', { atkPct: atkBonus });
              }
            }
          }
        };
        sunlightBuff();
        battle.after?.(0.5, sunlightBuff);
      }

      // 5. 选定之杖
      if (itemId.includes('fgo_staff')) {
        const atkPct = isGolden ? 0.50 : 0.30;
        const spFlat = isGolden ? 0.40 : 0.25;
        S.passiveBuff(battle, u, `item:${itemId}:stat`, { atkPct, spRecoveryFlat: spFlat });

        // 携带者为阿尔托莉雅·卡斯特或摩根
        const isQueen = u.charId === 'char_fgo_castoria' || u.charId === 'char_fgo_morgan'
          || (u.def && (u.def.charId === 'char_fgo_castoria' || u.def.charId === 'char_fgo_morgan'));
        if (isQueen) {
          let triggered = false;
          battle.on('skillStart', (c) => {
            if (c.unit === u && !triggered) {
              triggered = true;
              for (const ally of battle.allyUnits) {
                if (ally.kind === 'op' && ally.skill) {
                  if (typeof ally.skill.gainSp === 'function') ally.skill.gainSp(5, 'staff');
                  else ally.skill.sp = Math.min(ally.skill.spCost ?? 100, (ally.skill.sp || 0) + 5);
                }
              }
              battle.fx?.('staffSpBurst', { x: u.x, y: u.y, id: u.id });
            }
          }, { owner: u });
        }
      }

      // 6. 遥远的理想乡（阿瓦隆）
      if (itemId.includes('fgo_avalon')) {
        const hpPct = isGolden ? 0.80 : 0.50;
        const regenRate = isGolden ? 0.07 : 0.04;
        const hasSilverArmor = hasItemPrefix(u, 'fgo_silverarmor');
        const mods = { hpPct };
        if (hasSilverArmor) {
          mods.spRecoveryFlat = 1.0; // 每秒额外回复 1 点技力
        }
        S.passiveBuff(battle, u, `item:${itemId}:stat`, mods);

        // 每秒回复最大生命值百分比
        const regenTimer = battle.every?.(1.0, () => {
          if (u.alive && u.hp < (u.s?.maxHp ?? 1)) {
            const healAmount = (u.s?.maxHp ?? 0) * regenRate;
            battle.heal?.(u, u, healAmount, { self: true, silent: true, regen: true });
          }
        });
        if (regenTimer && u.scope) u.scope.onDispose?.(() => regenTimer.cancel?.());

        // 若携带者为【圆桌】干员，受致命伤害时 5 秒锁血并回 50% HP (限 1 次)
        if (S.isMember(battle, u, 'roundTable')) {
          let avalonLockUsed = false;
          battle.on('fatal', (c) => {
            if (c.unit !== u || c.prevented || avalonLockUsed) return;
            avalonLockUsed = true;
            c.prevented = true;
            u.hp = Math.max(1, Math.floor((u.s?.maxHp ?? 1000) * 0.50));
            // 5 秒星之内海无敌锁血
            battle.addBuff(u, {
              key: 'item:avalon:undying',
              duration: 5.0,
              flags: { undying: true },
              visible: true,
              allowDead: true
            });
            battle.fx?.('avalonProtect', { x: u.x, y: u.y, id: u.id, duration: 5.0 });
          }, { owner: u, priority: -90 });
        }
      }
    }
  }
}
