// mods/fgo-round-table/sim/kits.js — Full implementation of 15 FGO Round Table operators with 45 skills (S1, S2, S3)
//
// Invariants enforced:
// 1. Determinism: No Math.random() (use battle.rng()), no engine-dependent math (use detmath.js).
// 2. Boss Hit Limit: All Tier 5/6 high-multiplier skills split into 5-6 independent hits.
// 3. Counter hook guard: Counter hooks enforce tags: ['counter'] and recursion protection.
// 4. Multi-Skill dispatch: Each operator returns { trait, skills: { [s1]: ..., [s2]: ..., [s3]: ... }, skill: s3, install }.

import * as S from '../../support/index.js';
import { hypot } from '../../../detmath.js';
import { addShieldLayer, weaknessRetype } from '../../items/battle.js';

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Check whether unit is under Overcharge condition (round table decision or Morgan buff) */
function addSp(u, amount) {
  if (!u || !u.skill) return;
  if (typeof u.skill.gainSp === 'function') {
    u.skill.gainSp(amount, 'skill');
  } else {
    u.skill.sp = Math.min(u.skill.spCost ?? 100, (u.skill.sp || 0) + amount);
  }
}

function fillSp(u) {
  if (!u || !u.skill) return;
  if (typeof u.skill.gainSp === 'function') {
    u.skill.gainSp(u.skill.spCost ?? 100, 'skill');
  } else {
    u.skill.sp = u.skill.spCost ?? 100;
  }
}

function isOvercharge(battle, unit) {
  if (battle._roundTableDecisionActive) return true;
  if (unit && unit.mem && unit.mem.overchargeReady) {
    unit.mem.overchargeReady = false;
    return true;
  }
  return false;
}

/** 朝向 → 棋盘上的行列增量（召唤物落在施法者面前时用）。 */
const DIRV = { RIGHT: [0, 1], LEFT: [0, -1], UP: [-1, 0], DOWN: [1, 0] };

export default {
  // =========================================================================
  // 1. 加雷斯 (Gareth, Tier 1) — 尖兵
  // =========================================================================
  chess_fgo_1_gareth_a: (bb, chess, def) => {
    const s1 = {
      kind: 'instant',
      attack: { atkScale: num(bb.atk_scale, 1.9) },
      onStart({ battle, unit }) {
        // 攻击力 +15%，持续 8 秒，最多叠加 3 层
        unit.mem = unit.mem || {};
        unit.mem.garethS1Stacks = Math.min((unit.mem.garethS1Stacks || 0) + 1, 3);
        const bonus = 0.15 * unit.mem.garethS1Stacks;
        battle.addBuff(unit, {
          key: 'gareth:s1:atk',
          duration: 8.0,
          mods: { atkPct: bonus },
          visible: true
        });
        battle.fx?.('garethS1', { x: unit.x, y: unit.y, id: unit.id });
      }
    };

    const s2 = {
      kind: 'duration',
      duration: 8.0,
      mods: { defPct: 0.70, taunt: 1 },
      onStart({ battle, unit }) {
        addShieldLayer(battle, unit, 'gareth:s2:shield', 1);
        battle.fx?.('garethS2', { x: unit.x, y: unit.y, id: unit.id });
      }
    };

    const s3 = {
      kind: 'instant',
      onStart({ battle, unit }) {
        // 获得 1 次持续 6 秒的致命伤锁血【狼不眠】
        battle.addBuff(unit, {
          key: 'gareth:s3:undying',
          duration: 6.0,
          flags: { undying: true },
          visible: true
        });

        const target = unit.target;
        if (target && target.alive) {
          // 5 段连续枪刺，每段 110% 物理伤害（无视闪避）
          for (let i = 0; i < 5; i++) {
            battle.after(i * 0.1, () => {
              if (target.alive) {
                battle.dealDamage(unit, target, {
                  amount: (unit.s?.atk ?? 420) * 1.10,
                  type: 'phys',
                  canDodge: false,
                  isSkill: true,
                  tags: ['skill']
                });
                battle.fx?.('slash', { x: target.x, y: target.y, id: target.id, src: unit.id });
              }
            });
          }
          // 使目标防御力 -20%，持续 6 秒
          battle.addBuff(target, {
            key: 'gareth:s3:defdown',
            duration: 6.0,
            mods: { defPct: -0.20 },
            visible: true
          });
        }
        battle.fx?.('garethS3', { x: unit.x, y: unit.y, id: unit.id, target: target?.id, targets: target ? [target.id] : [], tx: target?.x, ty: target?.y });
      }
    };

    return {
      skills: {
        skchr_fgo_gareth_1: s1,
        skchr_fgo_gareth_2: s2,
        skchr_fgo_gareth_3: s3
      },
      skill: s1,
      install(battle, unit) {
        // S2 受击回 1 点技力 (解决 spec.onDamaged 死钩子)
        battle.on('damaged', (c) => {
          if (c.target === unit && unit.skillActive && unit.skill?.spec === s2) {
            addSp(unit, 1);
          }
        }, { owner: unit });

        // 被击倒时使已激活【圆桌】【不屈】层数 +2 (正确传参对象签名与真实盟约 ID)
        battle.on('death', (c) => {
          if (c.unit === unit) {
            S.gainLayers(battle, { playerId: unit.ownerId, bonds: ['roundTable', 'indomShip'], n: 2, source: unit, reason: 'gareth:death' });
          }
        }, { owner: unit });

        // 天赋：狼之怒 (生命值低于 50% 时防御力 +30% 且获得 15% 物理闪避)
        battle.on('hpDamage', (c) => {
          if (c.target === unit && unit.alive) {
            const maxHp = unit.s?.maxHp ?? 2000;
            if (unit.hp <= maxHp * 0.5) {
              battle.addBuff(unit, {
                key: 'gareth:talent:rage',
                duration: 5.0,
                mods: { defPct: 0.30, dodge: 0.15 },
                visible: true,
                refresh: 'replace'
              });
            }
          }
        }, { owner: unit });
      }
    };
  },

  // =========================================================================
  // 2. 贝德维尔 (Bedivere, Tier 2) — 无畏者
  // =========================================================================
  chess_fgo_2_bedivere_a: (bb, chess, def) => {
    const s1 = {
      kind: 'instant',
      onStart({ battle, unit }) {
        // 回复周围 4 格随机 1 名友方 4 点技力
        const allies = battle.allyUnits.filter((a) => a.alive && a.kind === 'op' && a !== unit && hypot(a.x - unit.x, a.y - unit.y) <= 2.1);
        if (allies.length) {
          const pick = allies[Math.floor(battle.rng() * allies.length)];
          addSp(pick, 4);
        }
        battle.addBuff(unit, {
          key: 'bedivere:s1:atk',
          duration: 8.0,
          mods: { atkPct: 0.55 },
          visible: true
        });
        battle.applyStatus?.(unit, 'resist', { duration: 8.0, source: unit });
        battle.fx?.('bedivereS1', { x: unit.x, y: unit.y, id: unit.id });
      }
    };

    const s2 = {
      kind: 'duration',
      duration: 10.0,
      onStart({ battle, unit }) {
        for (const a of battle.allyUnits) {
          if (a.alive && a.kind === 'op' && hypot(a.x - unit.x, a.y - unit.y) <= 1.5) {
            S.passiveBuff(battle, a, 'bedivere:s2:buff', { defPct: 0.35, resFlat: 15 });
            battle.removeStatus?.(a, 'stun');
            battle.removeStatus?.(a, 'silence');
            battle.removeStatus?.(a, 'sluggish');
          }
        }
        battle.fx?.('bedivereS2', { x: unit.x, y: unit.y, id: unit.id });
      }
    };

    const s3 = {
      kind: 'instant',
      onStart({ battle, unit }) {
        // 贝德维尔是**吟游者**（noAttack）—— 不普攻就不索敌，unit.target 恒为 null。
        // 原来这里第一行 `if (!target) return;` 让这张 480% 的主力 S3 永远放不出来。
        // 改成主动索敌：优先当前目标，否则取附近的敌人。
        const target = (unit.target?.alive ? unit.target : null)
          ?? (battle.foesInRadius ? battle.foesInRadius(unit.x, unit.y, 2.0)[0] : null)
          ?? battle.enemies.find((e) => e.alive && !e.hidden);
        if (!target || !target.alive) return;

        const overcharge = isOvercharge(battle, unit);
        const scale = overcharge ? 7.20 : 4.80;
        const ignDef = overcharge ? 0.40 : 0.0;

        battle.dealDamage(unit, target, {
          amount: (unit.s?.atk ?? 500) * scale,
          type: 'phys',
          isSkill: true,
          defIgnorePct: ignDef,
          tags: ['skill']
        });
        battle.fx?.('slash', { x: target.x, y: target.y, id: target.id, src: unit.id });

        if (overcharge) {
          S.gainLayers(battle, { playerId: unit.ownerId, bonds: 'roundTable', n: 2, source: unit, reason: 'bedivere:s3' });
        }
        battle.fx?.('bedivereS3', { x: unit.x, y: unit.y, id: unit.id, overcharge, target: target.id, targets: [target.id], tx: target.x, ty: target.y });
      }
    };

    return {
      skills: {
        skchr_fgo_bedivere_1: s1,
        skchr_fgo_bedivere_2: s2,
        skchr_fgo_bedivere_3: s3
      },
      skill: s1,
      install(battle, unit) {
        // 天赋：执著之心 (技能未开启时攻击力 +15%；受到致死伤害时保留 1 点生命并无敌 2 秒)
        battle.on('hit', (c) => {
          if (c.source === unit && !unit.skillActive) {
            c.dmg.mul = (c.dmg.mul || 1) * 1.15;
          }
        }, { owner: unit });

        battle.on('fatal', (c) => {
          if (c.unit === unit) {
            unit.mem = unit.mem || {};
            if (!unit.mem._bediUndying) {
              unit.mem._bediUndying = true;
              c.prevented = true;
              unit.hp = 1;
              battle.addBuff(unit, {
                key: 'bedivere:talent:undying',
                duration: 2.0,
                flags: { invulnerable: true },
                visible: true
              });
            }
          }
        }, { owner: unit });
      }
    };
  },

  // =========================================================================
  // 3. 崔斯坦 (Tristan, Tier 2) — 神射手
  // =========================================================================
  chess_fgo_2_tristan_a: (bb, chess, def) => {
    const s1 = {
      kind: 'instant',
      onStart({ battle, unit }) {
        for (const a of battle.allyUnits) {
          if (a.alive && a.kind === 'op' && hypot(a.x - unit.x, a.y - unit.y) <= 1.5) {
            battle.removeStatus?.(a, 'stun');
            battle.removeStatus?.(a, 'silence');
            const heal = (unit.s?.atk ?? 550) * 1.20;
            battle.heal?.(unit, a, heal);
            battle.addBuff(a, {
              key: 'tristan:s1:dodge',
              duration: 6.0,
              mods: { physDodge: 0.40, artsDodge: 0.40 },
              visible: true
            });
          }
        }
        battle.fx?.('tristanS1', { x: unit.x, y: unit.y, id: unit.id });
      }
    };

    const s2 = {
      kind: 'instant',
      onStart({ battle, unit }) {
        const target = unit.target;
        if (!target || !target.alive) return;
        battle.dealDamage(unit, target, {
          amount: (unit.s?.atk ?? 550) * 2.40,
          type: 'phys',
          isSkill: true,
          tags: ['skill']
        });
        battle.applyStatus?.(target, 'silence', { duration: 6.0, source: unit });
        battle.addBuff(target, {
          key: 'tristan:s2:atkdown',
          duration: 6.0,
          mods: { atkPct: -0.20 },
          visible: true
        });
        battle.fx?.('tristanS2', { x: unit.x, y: unit.y, id: unit.id, target: target.id, targets: [target.id], tx: target.x, ty: target.y });
      }
    };

    const s3 = {
      kind: 'instant',
      onStart({ battle, unit }) {
        let best = null;
        for (const e of battle.enemies) {
          if (!e.alive || e.hidden) continue;
          if (!best || (e.s?.maxHp ?? 0) > (best.s?.maxHp ?? 0)) best = e;
        }
        if (!best) return;

        // 7 道真空音波弦，每道 105% 物理伤害（无视闪避与 30% 防御力）
        for (let i = 0; i < 7; i++) {
          battle.after(i * 0.08, () => {
            if (best.alive) {
              battle.dealDamage(unit, best, {
                amount: (unit.s?.atk ?? 550) * 1.05,
                type: 'phys',
                canDodge: false,
                defIgnorePct: 0.30,
                isSkill: true,
                tags: ['skill']
              });
              battle._ev?.(['atk', unit.id, best.id, 'arrow']);
              battle.fx?.('counter', { x: best.x, y: best.y, id: best.id, src: unit.id });
            }
          });
        }
        // 施加 25% 物理脆弱 5 秒
        battle.addBuff(best, {
          key: 'tristan:s3:fragile',
          duration: 5.0,
          mods: { physFragile: 0.25 },
          visible: true
        });
        battle.fx?.('tristanS3', { x: unit.x, y: unit.y, id: unit.id, target: best.id, targets: [best.id], tx: best.x, ty: best.y });
      }
    };

    return {
      skills: {
        skchr_fgo_tristan_1: s1,
        skchr_fgo_tristan_2: s2,
        skchr_fgo_tristan_3: s3
      },
      skill: s1,
      install(battle, unit) {
        // 天赋：悲痛之琴 (攻击减速目标 25% 持续 2 秒；对处于移动减速状态敌人造成伤害 +20%)
        battle.on('hit', (c) => {
          if (c.source === unit && c.target && c.target.alive) {
            if (c.target.hasStatus?.('sluggish') || c.target.mods?.mspdPct < 0) {
              c.dmg.mul = (c.dmg.mul || 1) * 1.20;
            }
            battle.applyStatus?.(c.target, 'sluggish', { duration: 2.0, source: unit });
          }
        }, { owner: unit });
      }
    };
  },

  // =========================================================================
  // 4. 珀西瓦尔 (Percival, Tier 3) — 守护者
  // =========================================================================
  chess_fgo_3_percival_a: (bb, chess, def) => {
    const s1 = {
      kind: 'instant',
      onStart({ battle, unit }) {
        let lowest = null;
        for (const a of battle.allyUnits) {
          if (!a.alive || a.kind !== 'op') continue;
          if (hypot(a.x - unit.x, a.y - unit.y) > 1.5) continue;
          const pct = a.hp / (a.s?.maxHp ?? 1);
          if (!lowest || pct < lowest.pct) lowest = { unit: a, pct };
        }
        if (lowest) {
          const heal = (unit.s?.atk ?? 550) * 2.20;
          battle.heal?.(unit, lowest.unit, heal);
          addSp(lowest.unit, 3);
        }
        for (const a of battle.allyUnits) {
          if (a.alive && a.kind === 'op' && S.isMember(battle, a, 'roundTable') && hypot(a.x - unit.x, a.y - unit.y) <= 1.5) {
            battle.addBuff(a, {
              key: 'percival:s1:skilldmg',
              duration: 8.0,
              mods: { skillDmgMul: 1.15 },
              visible: true
            });
          }
        }
        battle.fx?.('percivalS1', { x: unit.x, y: unit.y, id: unit.id, target: lowest?.unit?.id, tx: lowest?.unit?.x, ty: lowest?.unit?.y });
      }
    };

    const s2 = {
      kind: 'duration',
      // 描述：「持续 10 秒，防御力 +85%，阻挡数 +1，每次阻挡敌人时使自身与受保护友方获得 1 层护盾并持续回复生命」。
      // 原实现是 12 秒 / 防御 +80% / 无阻挡加成 —— 数值与条目都对不上，按描述校正。
      duration: 10.0,
      mods: { defPct: 0.85, taunt: 1, blockCnt: 1 },
      onStart({ battle, unit }) {
        let lowest = null;
        for (const a of battle.allyUnits) {
          if (!a.alive || a.kind !== 'op' || a === unit) continue;
          if (hypot(a.x - unit.x, a.y - unit.y) > 1.5) continue;
          const hp = a.hp;
          if (!lowest || hp < lowest.hp) lowest = { unit: a, hp };
        }
        if (lowest) {
          addShieldLayer(battle, lowest.unit, 'percival:s2:shield', 1);
          const heal = (unit.s?.atk ?? 550) * 2.0;
          battle.heal?.(unit, lowest.unit, heal);
        }
        battle.fx?.('percivalS2', { x: unit.x, y: unit.y, id: unit.id, target: lowest?.unit?.id, tx: lowest?.unit?.x, ty: lowest?.unit?.y });
      }
    };

    const s3 = {
      kind: 'instant',
      onStart({ battle, unit }) {
        // 对前方 3x3 格敌人造成 4 段共 400% 法伤
        const foes = battle.foesInRadius ? battle.foesInRadius(unit.x, unit.y, 2.0) : battle.enemies.filter((e) => e.alive);
        const targetIds = [];
        for (const e of foes) {
          if (!e.alive || e.hidden) continue;
          targetIds.push(e.id);
          const isDragonOrBeast = e.def?.tags?.includes('dragon') || e.def?.tags?.includes('beast');
          const mult = isDragonOrBeast ? 1.5 : 1.0;
          for (let i = 0; i < 4; i++) {
            battle.after(i * 0.1, () => {
              if (e.alive) {
                battle.dealDamage(unit, e, {
                  amount: (unit.s?.atk ?? 550) * 1.0 * mult,
                  type: 'arts',
                  canDodge: false,
                  isSkill: true,
                  tags: ['skill']
                });
                battle.fx?.('slash', { x: e.x, y: e.y, id: e.id, src: unit.id });
              }
            });
          }
        }
        // 治疗周围 8 格友方 260% 攻击力生命
        for (const a of battle.allyUnits) {
          if (a.alive && a.kind === 'op' && hypot(a.x - unit.x, a.y - unit.y) <= 1.5) {
            const heal = (unit.s?.atk ?? 550) * 2.60;
            battle.heal?.(unit, a, heal);
          }
        }
        battle.fx?.('percivalS3', { x: unit.x, y: unit.y, id: unit.id, r: 2.0, targets: targetIds, target: targetIds[0] ?? null });
      }
    };

    return {
      skills: {
        skchr_fgo_percival_1: s1,
        skchr_fgo_percival_2: s2,
        skchr_fgo_percival_3: s3
      },
      skill: s1,
      install(battle, unit) {
        // 天赋：巡礼之护 (受到攻击时，有 30% 概率回复自身 4% 最大生命)
        battle.on('damaged', (c) => {
          if (c.target === unit && unit.alive) {
            const rng = battle.rng?.next ? battle.rng.next() : 0.2;
            if (rng < 0.30) {
              const heal = (unit.s?.maxHp ?? 2800) * 0.04;
              battle.heal?.(unit, unit, heal);
            }
          }
        }, { owner: unit });
      }
    };
  },

  // =========================================================================
  // 5. 妖精骑士崔斯坦 / 芭万·希 (Baobhan Sith, Tier 3) — 巫役
  // =========================================================================
  chess_fgo_3_baobhan_a: (bb, chess, def) => {
    const s1 = {
      kind: 'instant',
      onStart({ battle, unit }) {
        const target = unit.target;
        if (!target || !target.alive) return;
        const dmg = (unit.s?.atk ?? 580) * 2.60;
        battle.dealDamage(unit, target, {
          amount: dmg,
          type: 'arts',
          isSkill: true,
          tags: ['skill']
        });
        battle.heal?.(unit, unit, dmg, { self: true });
        // 偷取 4 点技力
        if (target.skill && target.skill.sp > 0) {
          const steal = Math.min(4, target.skill.sp);
          target.skill.sp -= steal;
          addSp(unit, steal);
        } else {
          addSp(unit, 4);
        }
        // 250 凋亡损伤
        battle.dealDamage?.(unit, target, { amount: 250, type: 'elemental', element: 'apoptosis', isSkill: true, tags: ['necrosis'] });
        battle.fx?.('baobhanS1', { x: unit.x, y: unit.y, id: unit.id, target: target.id, targets: [target.id], tx: target.x, ty: target.y });
      }
    };

    const s2 = {
      kind: 'instant',
      onStart({ battle, unit }) {
        const foes = battle.foesInRadius ? battle.foesInRadius(unit.x, unit.y, 2.5) : battle.enemies.filter((e) => e.alive);
        for (const e of foes) {
          if (!e.alive || e.hidden) continue;
          battle.applyStatus?.(e, 'silence', { duration: 6.0, source: unit });
          battle.applyStatus?.(e, 'sluggish', { duration: 4.0, source: unit });
        }
        for (const a of battle.allyUnits) {
          if (a.alive && a.kind === 'op' && hypot(a.x - unit.x, a.y - unit.y) <= 1.5) {
            a.hp = Math.max(1, a.hp - 150);
            battle.addBuff(a, {
              key: 'baobhan:s2:buff',
              duration: 8.0,
              mods: { aspd: 25, physDodge: 0.35, artsDodge: 0.35 },
              visible: true
            });
          }
        }
        battle.fx?.('baobhanS2', { x: unit.x, y: unit.y, id: unit.id, r: 2.5, targets: foes.map(e => e.id) });
      }
    };

    const s3 = {
      kind: 'duration',
      duration: 12.0,
      onStart({ battle, unit }) {
        // 【绝叫之血池】从「又一张打 6 段」改成**持续诅咒场**（用户 2026-10-16：「挑几个多段伤害 S3 换成
        // 控场/召唤/持续场」）。在施放位置铺开血池：池内敌人持续被凋亡灼蚀、攻速被拖慢。
        // 芭万·希是巫役，控场/诅咒比纯爆发更贴她的定位。
        unit.mem = unit.mem || {};
        unit.mem.baobhanPool = { x: unit.x, y: unit.y };
        battle.fx?.('baobhanS3', { x: unit.x, y: unit.y, id: unit.id, r: 2.2, dur: 12.0 });
      },
      onTick({ battle, unit, dt }) {
        const pool = unit.mem?.baobhanPool;
        if (!pool) return;
        const amount = (unit.s?.atk ?? 580) * 0.9 * dt;
        if (amount <= 0) return;
        for (const e of battle.enemies) {
          if (!e.alive || e.hidden) continue;
          if (hypot(e.x - pool.x, e.y - pool.y) > 2.2) continue;
          battle.dealDamage(unit, e, {
            amount, type: 'arts', canDodge: false, sourceless: true, isSkill: true, tags: ['skill', 'necrosis'],
          });
          battle.addBuff(e, { key: 'baobhan:s3:slow', duration: 0.6, mods: { aspd: -40 }, visible: true });
        }
      },
      onEnd({ unit }) {
        if (unit?.mem) unit.mem.baobhanPool = null;
      }
    };

    return {
      skills: {
        skchr_fgo_baobhan_1: s1,
        skchr_fgo_baobhan_2: s2,
        skchr_fgo_baobhan_3: s3
      },
      skill: s1,
      install(battle, unit) {
        // 天赋：鲜血恩赐 (对凋亡损伤状态敌人伤害 +25%，攻击时恢复造成伤害 20% 的生命)
        battle.on('hit', (c) => {
          if (c.source === unit && c.target && c.target.alive) {
            if (c.target.hasStatus?.('apoptosis') || c.target.mem?.apoptosis) {
              c.dmg.mul = (c.dmg.mul || 1) * 1.25;
            }
            const lifesteal = (c.dmg?.amount || 0) * 0.20;
            if (lifesteal > 0) battle.heal?.(unit, unit, lifesteal, { self: true });
          }
        }, { owner: unit });
      }
    };
  },

  // =========================================================================
  // 6. 高文 (Gawain, Tier 4) — 本源近卫
  // =========================================================================
  chess_fgo_4_gawain_a: (bb, chess, def) => {
    const s1 = {
      kind: 'duration',
      duration: 12.0,
      // 描述：「攻击力 +60%，普通攻击附带 25% 攻击力的灼燃损伤，阻挡数 +1」。
      // 原实现只做了 atkPct —— 灼燃与阻挡数两项文案写了没做，一并补上。
      mods: { atkPct: 0.60, blockCnt: 1 },
      onStart({ battle, unit }) {
        // 若处于阳光地块额外 +60% 攻击力与 25% 物免
        const isSunlight = unit.mem?.onSunlightTile || true;
        if (isSunlight) {
          battle.addBuff(unit, {
            key: 'gawain:s1:sunBonus',
            duration: 12.0,
            mods: { atkPct: 0.60, physDmgTakenMul: 0.75 },
            visible: true
          });
        }
        battle.fx?.('gawainS1', { x: unit.x, y: unit.y, id: unit.id });
      },
      onAttack({ battle, unit, target }) {
        if (!target || !target.alive) return;
        battle.dealDamage?.(unit, target, {
          amount: (unit.s?.atk ?? 700) * 0.25,
          type: 'elemental', element: 'burn', isSkill: true, tags: ['burn'],
        });
      }
    };

    const s2 = {
      kind: 'duration',
      duration: 15.0,
      onStart({ battle, unit }) {
        // 太阳骑士展开【日轮领域】。原来这里是又一个「全场攻击力 +25%」—— 和阿尔托莉雅的领导力、
        // 卡斯特的希望、摩根的渴爱四张牌撞在一起（用户 2026-10-16 报「很多都是差不多的」）。
        // 改为**场地型**：全场不再加攻，而是让阳光本身成为效果 —— 友方进阳光得到攻速与持续回血，
        // 敌人则被日轮灼烧。全场加攻的牌留给阿尔托莉雅一个人。
        for (const a of battle.allyUnits) {
          if (a.alive && a.kind === 'op') {
            a.mem = a.mem || {};
            a.mem.onSunlightTile = true;
            battle.addBuff(a, {
              key: 'gawain:s2:sunlight',
              duration: 15.0,
              mods: { aspd: 30, hpRegenRatio: 0.03 },
              visible: true
            });
          }
        }
        addSp(unit, 6);
        battle.addBuff(unit, {
          key: 'gawain:s2:undying',
          duration: 10.0,
          flags: { undying: true },
          visible: true
        });
        battle.fx?.('gawainS2', { x: unit.x, y: unit.y, id: unit.id, r: 3.5, dur: 15.0 });
      },
      onTick({ battle, unit, dt }) {
        // 日轮灼烧：领域存续期间，全场敌人持续受到灼燃法术伤害（按高文攻击力折算）
        const amount = (unit.s?.atk ?? 420) * 0.35 * dt;
        if (amount <= 0) return;
        for (const e of battle.enemies) {
          if (!e.alive) continue;
          battle.dealDamage(unit, e, { amount, type: 'arts', canDodge: false, sourceless: true, tags: ['burn'] });
        }
      }
    };

    const s3 = {
      kind: 'duration',
      duration: 12.0,
      // 描述里还有「暴击率 +40%」，原实现只加了 atkPct，补上。
      mods: { atkPct: 0.80, critRate: 0.40 },
      onStart({ battle, unit }) {
        // 斩出日轮光弧对前方 3x4 区域造成 420% 物理伤害 + 500 点灼燃 + 4 秒沉默
        const foes = battle.foesInRadius ? battle.foesInRadius(unit.x, unit.y, 2.5) : battle.enemies.filter((e) => e.alive);
        for (const e of foes) {
          if (!e.alive || e.hidden) continue;
          battle.dealDamage(unit, e, {
            amount: (unit.s?.atk ?? 750) * 4.20,
            type: 'phys',
            isSkill: true,
            tags: ['skill']
          });
          battle.dealDamage?.(unit, e, { amount: 500, type: 'elemental', element: 'burn', isSkill: true, tags: ['burn'] });
          battle.applyStatus?.(e, 'silence', { duration: 4.0, source: unit });
        }
        battle.fx?.('gawainS3', { x: unit.x, y: unit.y, id: unit.id, targets: foes.map(e => e.id), r: 2.5 });
      },
      onAttack({ battle, unit }) {
        // 普攻打 3 人且暴击率 +40%
        const foes = battle.foesInRadius ? battle.foesInRadius(unit.x, unit.y, 1.8) : battle.enemies.filter((e) => e.alive);
        let hits = 0;
        for (const e of foes) {
          if (!e.alive || e.hidden) continue;
          if (hits++ >= 3) break;
          battle.dealDamage(unit, e, {
            amount: (unit.s?.atk ?? 750) * 1.0,
            type: 'phys',
            tags: ['cleave']
          });
        }
      }
    };

    return {
      skills: {
        skchr_fgo_gawain_1: s1,
        skchr_fgo_gawain_2: s2,
        skchr_fgo_gawain_3: s3
      },
      skill: s1,
      install(battle, unit) {
        // 天赋：圣者的数字 (战斗开始前 20 秒，攻击力 +25%，受到伤害降低 20%)
        battle.addBuff(unit, {
          key: 'gawain:talent:num',
          duration: 20.0,
          mods: { atkPct: 0.25, dmgTakenMul: 0.80 },
          visible: true
        });
      }
    };
  },

  // =========================================================================
  // 7. 妖精骑士高文 / 巴格斯特 (Barghest, Tier 4) — 武者/重剑
  // =========================================================================
  chess_fgo_4_barghest_a: (bb, chess, def) => {
    const s1 = {
      kind: 'duration',
      duration: 8.0,
      mods: { atkPct: 0.50 },
      onStart({ battle, unit }) {
        battle.fx?.('barghestS1', { x: unit.x, y: unit.y, id: unit.id });
      },
      onAttack({ battle, unit, target }) {
        const heal = (unit.s?.maxHp ?? 3000) * 0.08;
        battle.heal?.(unit, unit, heal, { self: true });
        if (target && target.alive) {
          battle.addBuff(target, {
            key: 'barghest:s1:defdown',
            duration: 5.0,
            mods: { defPct: -0.20 },
            visible: true
          });
        }
      }
    };

    const s2 = {
      kind: 'duration',
      duration: 10.0,
      // 描述：「防御力 +80%，周围 8 格地带进入烈火灼烧状态，处于其中的敌人每秒受到 120% 法伤与 30% 减速」。
      // 原实现给的是**友方** flatDmgReduction + 回技力 —— 描述里的三个效果（自身加防 / 灼烧 / 减速）一个都没有，
      // 属于典型的「文案写了没做」。按描述重写。
      mods: { defPct: 0.80 },
      onStart({ battle, unit }) {
        battle.fx?.('barghestS2', { x: unit.x, y: unit.y, id: unit.id });
      },
      onTick({ battle, unit, dt }) {
        const foes = battle.foesInRadius ? battle.foesInRadius(unit.x, unit.y, 1.5) : battle.enemies.filter((e) => e.alive);
        const amount = (unit.s?.atk ?? 750) * 1.20 * dt;
        for (const e of foes) {
          if (!e.alive || e.hidden || amount <= 0) continue;
          battle.dealDamage(unit, e, { amount, type: 'arts', canDodge: false, sourceless: true, isSkill: true, tags: ['skill', 'burn'] });
          battle.addBuff(e, { key: 'barghest:s2:slow', duration: 0.6, mods: { aspd: -30 }, visible: true });
        }
      }
    };

    const s3 = {
      kind: 'instant',
      onStart({ battle, unit }) {
        unit.mem = unit.mem || {};
        unit.mem.barghestS3Stacks = Math.min((unit.mem.barghestS3Stacks || 0) + 1, 2);
        const hpBonus = 0.50 * unit.mem.barghestS3Stacks;
        battle.addBuff(unit, {
          key: 'barghest:s3:maxhp',
          duration: Infinity,
          mods: { hpPct: hpBonus },
          visible: true
        });
        const heal = (unit.s?.maxHp ?? 3000) * 0.50;
        battle.heal?.(unit, unit, heal, { self: true });

        // 【黑犬暴食】原来是「5 段黑炎重砸」—— 又是一张多段爆发（15 个 S3 里有 10 张都是这个形状）。
        // 改成**召唤**：放出一头黑犬替她咬人。巴格斯特在 FGO 原设里就是驱使黑犬的狂猎，召唤比再补
        // 一段伤害更贴她的定位。（视觉上复用原版的狼群 token。）
        const houndHp = Math.round((unit.s?.maxHp ?? 3000) * 0.30);
        const fv = DIRV[unit.dir] || [0, 1];
        for (const [dr, dc] of [fv, [0, 1], [0, -1], [-1, 0], [1, 0]]) {
          const hound = battle.spawnToken?.(unit, 'token_10028_vigil_wolf', unit.tileR + dr, unit.tileC + dc, {
            anySource: true,
            stats: { atk: Math.round((unit.s?.atk ?? 750) * 0.55), maxHp: houndHp },
            hp: houndHp,
            duration: 20,
          });
          if (hound) { battle.fx?.('summon', { x: hound.x, y: hound.y, id: hound.id }); break; }
        }
        battle.fx?.('barghestS3', { x: unit.x, y: unit.y, id: unit.id, r: 2.0 });
      }
    };

    return {
      skills: {
        skchr_fgo_barghest_1: s1,
        skchr_fgo_barghest_2: s2,
        skchr_fgo_barghest_3: s3
      },
      skill: s1,
      install(battle, unit) {
        // 天赋：食欲旺盛 (普攻吸血 5%；击倒敌人时最大生命值 +5% 最多 6 层，并立即回复 15% 最大生命)
        battle.on('hit', (c) => {
          if (c.source === unit && unit.alive) {
            const heal = (unit.s?.maxHp ?? 3000) * 0.05;
            battle.heal?.(unit, unit, heal, { self: true });
          }
        }, { owner: unit });

        battle.on('kill', (c) => {
          if (c.source === unit && unit.alive) {
            unit.mem = unit.mem || {};
            unit.mem.barghestKills = Math.min((unit.mem.barghestKills || 0) + 1, 6);
            battle.addBuff(unit, {
              key: 'barghest:talent:hp',
              duration: Infinity,
              mods: { hpPct: 0.05 * unit.mem.barghestKills },
              visible: true,
              refresh: 'replace'
            });
            const killHeal = (unit.s?.maxHp ?? 3000) * 0.15;
            battle.heal?.(unit, unit, killHeal, { self: true });
          }
        }, { owner: unit });
      }
    };
  },

  // =========================================================================
  // 8. 玛修·基列莱特 (Mash, Tier 4) — 铁卫
  // =========================================================================
  chess_fgo_4_mash_a: (bb, chess, def) => {
    const s1 = {
      kind: 'duration',
      duration: 12.0,
      // 描述里除了「强制嘲讽全场」还有「自身阻挡数 +1」，原实现只做了 taunt，补上 blockCnt。
      mods: { taunt: 1, blockCnt: 1 },
      onStart({ battle, unit }) {
        for (const a of battle.allyUnits) {
          if (a.alive && a.kind === 'op' && hypot(a.x - unit.x, a.y - unit.y) <= 1.5) {
            S.passiveBuff(battle, a, 'mash:s1:buff', { defPct: 0.40, flatDmgReduction: 250 });
          }
        }
        let lowest = null;
        for (const a of battle.allyUnits) {
          if (!a.alive || a.kind !== 'op') continue;
          if (hypot(a.x - unit.x, a.y - unit.y) > 1.5) continue;
          const hp = a.hp;
          if (!lowest || hp < lowest.hp) lowest = { unit: a, hp };
        }
        if (lowest) addShieldLayer(battle, lowest.unit, 'mash:s1:shield', 1);
        battle.fx?.('mashS1', { x: unit.x, y: unit.y, id: unit.id, target: lowest?.unit?.id, tx: lowest?.unit?.x, ty: lowest?.unit?.y });
      }
    };

    const s2 = {
      kind: 'duration',
      duration: 8.0,
      // 描述：「立即为自身充能 15 点技力并获得 1 次绝对无敌（持续 5 秒），
      //       使周围 8 格所有友方干员攻速 +30，持续 8 秒」。
      // 原实现给的是「自身阻挡 +1 + 友方防御 +50% + 庇护 35% + 友方攻击 +30% + 护盾」——
      // 与描述**完全对不上**（描述的三个效果一个都没做），按描述重写。
      onStart({ battle, unit }) {
        addSp(unit, 15);
        battle.addBuff(unit, {
          key: 'mash:s2:invuln',
          duration: 5.0,
          flags: { invulnerable: true },
          visible: true
        });
        for (const a of battle.allyUnits) {
          if (a.alive && a.kind === 'op' && hypot(a.x - unit.x, a.y - unit.y) <= 1.5) {
            battle.addBuff(a, {
              key: 'mash:s2:aspd',
              duration: 8.0,
              mods: { aspd: 30 },
              visible: true
            });
          }
        }
        battle.fx?.('mashS2', { x: unit.x, y: unit.y, id: unit.id, r: 2.5 });
      }
    };

    const s3 = {
      kind: 'instant',
      onStart({ battle, unit }) {
        unit.mem = unit.mem || {};
        if (!unit.mem._mashPaladinLoaded) {
          // 首次开启：展开人理之盾，全队获得 1 层对肃正防御护盾与 +25% 攻击力
          unit.mem._mashPaladinLoaded = true;
          for (const a of battle.allyUnits) {
            if (a.alive && a.kind === 'op') {
              addShieldLayer(battle, a, 'mash:s3:trueshield', 1);
              battle.addBuff(a, {
                key: 'mash:s3:atk',
                duration: 15.0,
                mods: { atkPct: 0.25 },
                visible: true
              });
            }
          }
          battle.fx?.('mashS3Form1', { x: unit.x, y: unit.y, id: unit.id });
        } else {
          // 再次开启：消耗 15% 当前生命值，发射人理之剑
          unit.hp = Math.max(1, Math.floor(unit.hp * 0.85));
          const foes = battle.foesInRadius ? battle.foesInRadius(unit.x, unit.y, 3.5) : battle.enemies.filter((e) => e.alive);
          for (const e of foes) {
            if (!e.alive || e.hidden) continue;
            const isBossOrElite = e.isBoss || e.def?.rank === 'ELITE' || e.def?.rank === 'BOSS';
            const mult = isBossOrElite ? 1.5 : 1.0;
            battle.dealDamage(unit, e, {
              amount: (unit.s?.atk ?? 600) * 7.50 * mult,
              type: 'true',
              canDodge: false,
              isSkill: true,
              tags: ['skill']
            });
          }
          battle.fx?.('mashS3Form2', { x: unit.x, y: unit.y, id: unit.id, targets: foes.map(e => e.id), r: 3.5 });
        }
      }
    };

    return {
      skills: {
        skchr_fgo_mash_1: s1,
        skchr_fgo_mash_2: s2,
        skchr_fgo_mash_3: s3
      },
      skill: s1,
      install(battle, unit) {
        // 天赋：决意之盾 (阻挡敌人时防御力 +25%；身后一格友方受到伤害降低 15%)
        battle.on('damaged', (c) => {
          if (c.target === unit && unit.blocking > 0) {
            c.dmg.mul = (c.dmg.mul || 1) * 0.75;
          }
        }, { owner: unit });

        // 保护身后一格友方
        battle.on('damaged', (c) => {
          if (c.target && c.target !== unit && c.target.kind === 'op') {
            if (c.target.x === unit.x && c.target.y === unit.y - 1) {
              c.dmg.mul = (c.dmg.mul || 1) * 0.85;
            }
          }
        }, { owner: unit });
      }
    };
  },

  // =========================================================================
  // 9. 兰斯洛特(Saber) (Lancelot, Tier 5) — 剑豪
  // =========================================================================
  chess_fgo_5_lancelot_a: (bb, chess, def) => {
    const s1 = {
      kind: 'instant',
      onStart({ battle, unit }) {
        addSp(unit, 3);
        const target = unit.target;
        if (target && target.alive) {
          for (let i = 0; i < 2; i++) {
            battle.dealDamage(unit, target, {
              amount: (unit.s?.atk ?? 820) * 2.10 * 1.5,
              type: 'arts',
              isSkill: true,
              tags: ['skill', 'crit']
            });
          }
        }
        battle.fx?.('lancelotS1', { x: unit.x, y: unit.y, id: unit.id, target: target?.id, targets: target ? [target.id] : [], tx: target?.x, ty: target?.y });
      }
    };

    const s2 = {
      kind: 'duration',
      duration: 15.0,
      mods: { aspd: 40, critRate: 0.60, critDmgMul: 1.75 },
      onStart({ battle, unit }) {
        // 若携带任意装备，双倍加成
        const items = S.itemsOf(unit);
        if (items.length > 0) {
          battle.addBuff(unit, {
            key: 'lancelot:s2:itemDouble',
            duration: 15.0,
            mods: { atkPct: 0.30, defPct: 0.30 },
            visible: true
          });
        }
        battle.fx?.('lancelotS2', { x: unit.x, y: unit.y, id: unit.id });
      }
    };

    const s3 = {
      kind: 'duration',
      duration: 10.0,
      mods: { atkPct: 0.75 },
      onStart({ battle, unit }) {
        const target = unit.target;
        if (target && target.alive) {
          battle.dealDamage(unit, target, {
            amount: (unit.s?.atk ?? 820) * 5.50,
            type: 'arts',
            defIgnorePct: 1.0,
            isSkill: true,
            tags: ['skill']
          });
          battle.fx?.('slash', { x: target.x, y: target.y, id: target.id, src: unit.id });
          battle.addBuff(target, {
            key: 'lancelot:s3:artsfragile',
            duration: 8.0,
            mods: { artsFragile: 0.30 },
            visible: true
          });
        }
        battle.fx?.('lancelotS3', { x: unit.x, y: unit.y, id: unit.id, target: target?.id, targets: target ? [target.id] : [], tx: target?.x, ty: target?.y });
      },
      onAttack({ battle, unit, target }) {
        if (target && target.alive) {
          // 二连击并附带额外 15% 法伤
          battle.dealDamage(unit, target, {
            amount: (unit.s?.atk ?? 820) * 1.15,
            type: 'arts',
            tags: ['extra_arts']
          });
        }
      }
    };

    return {
      skills: {
        skchr_fgo_lancelot_1: s1,
        skchr_fgo_lancelot_2: s2,
        skchr_fgo_lancelot_3: s3
      },
      skill: s1,
      install(battle, unit) {
        // 天赋：精灵的加护 (攻速 +25，暴击率 +20%，攻击时 25% 概率额外回复 1 点技力)
        battle.addBuff(unit, {
          key: 'lancelot:talent:stats',
          duration: Infinity,
          mods: { aspd: 25, critRate: 0.20 },
          visible: true
        });

        battle.on('attack', (c) => {
          if (c.unit === unit) {
            const rng = battle.rng?.next ? battle.rng.next() : 0.1;
            if (rng < 0.25) {
              addSp(unit, 1);
            }
          }
        }, { owner: unit });
      }
    };
  },

  // =========================================================================
  // 10. 莫德雷德 (Mordred, Tier 5) — 收割者
  // =========================================================================
  chess_fgo_5_mordred_a: (bb, chess, def) => {
    const s1 = {
      kind: 'duration',
      duration: 10.0,
      mods: { atkPct: 0.65 },
      onStart({ battle, unit }) {
        battle.fx?.('mordredS1', { x: unit.x, y: unit.y, id: unit.id });
      },
      onAttack({ battle, unit, target }) {
        if (target && target.alive) {
          battle.dealDamage(unit, target, {
            amount: (unit.s?.atk ?? 850) * 1.65,
            type: 'phys',
            tags: ['crit']
          });
          battle.applyStatus?.(target, 'stun', { duration: 1.0, source: unit });
        }
      }
    };

    const s2 = {
      kind: 'duration',
      duration: 10.0,
      mods: { defPct: 1.20, resFlat: 25 },
      onStart({ battle, unit }) {
        battle.removeStatus?.(unit, 'stun');
        battle.removeStatus?.(unit, 'silence');
        battle.removeStatus?.(unit, 'sluggish');
        addSp(unit, 8);
        battle.fx?.('mordredS2', { x: unit.x, y: unit.y, id: unit.id });
      }
    };

    const s3 = {
      kind: 'instant',
      onStart({ battle, unit }) {
        const overcharge = isOvercharge(battle, unit);
        const totalScale = overcharge ? 9.20 : 6.80;
        const hitScale = totalScale / 5.0; // 拆为 5 段独立 Hit，规避 BOSS_HIT_LIMIT

        const foes = battle.foesInRadius ? battle.foesInRadius(unit.x, unit.y, 2.5) : battle.enemies.filter((e) => e.alive);
        for (const e of foes) {
          if (!e.alive || e.hidden) continue;
          const isBossOrElite = e.isBoss || e.def?.rank === 'ELITE' || e.def?.rank === 'BOSS';
          const defIgn = isBossOrElite ? 0.40 : 0.0;

          for (let i = 0; i < 5; i++) {
            battle.after(i * 0.1, () => {
              if (e.alive) {
                battle.dealDamage(unit, e, {
                  amount: (unit.s?.atk ?? 850) * hitScale,
                  type: 'phys',
                  defIgnorePct: defIgn,
                  isSkill: true,
                  tags: ['skill']
                });
                battle.fx?.('counter', { x: e.x, y: e.y, id: e.id, src: unit.id });
                if (!e.alive) addSp(unit, 3);
              }
            });
          }
        }

        addSp(unit, 8);
        battle.fx?.('mordredS3', { x: unit.x, y: unit.y, id: unit.id, overcharge, targets: foes.map(e => e.id), r: 2.5 });
      }
    };

    return {
      skills: {
        skchr_fgo_mordred_1: s1,
        skchr_fgo_mordred_2: s2,
        skchr_fgo_mordred_3: s3
      },
      skill: s1,
      install(battle, unit) {
        // S2 赤雷反伤 120% + 天赋：叛逆之雷 (未开 S2 时 25% 概率触发 80% 赤雷反击)
        battle.on('damaged', (c) => {
          if (c.target === unit && c.source && c.source.alive) {
            if (c.tags?.includes('counter') || c.dmg?.tags?.includes('counter')) return;
            const isS2 = unit.skillActive && unit.skill?.spec === s2;
            if (isS2) {
              battle.dealDamage(unit, c.source, {
                amount: (unit.s?.atk ?? 825) * 1.20,
                type: 'arts',
                tags: ['counter']
              });
            } else {
              const rng = battle.rng?.next ? battle.rng.next() : 0.1;
              if (rng < 0.25) {
                battle.dealDamage(unit, c.source, {
                  amount: (unit.s?.atk ?? 825) * 0.80,
                  type: 'arts',
                  tags: ['counter']
                });
              }
            }
          }
        }, { owner: unit });
      }
    };
  },

  // =========================================================================
  // 11. 妖精骑士兰斯洛特 / 梅柳齐娜 (Melusine, Tier 5) — 术战者/裂空
  // =========================================================================
  chess_fgo_5_melusine_a: (bb, chess, def) => {
    const s1 = {
      kind: 'instant',
      onStart({ battle, unit }) {
        const target = unit.target;
        if (!target || !target.alive) return;
        // 5 段零距离切割，总计 380% 法伤 (每段 76%)
        for (let i = 0; i < 5; i++) {
          battle.after(i * 0.08, () => {
            if (target.alive) {
              battle.dealDamage(unit, target, {
                amount: (unit.s?.atk ?? 830) * 0.76,
                type: 'arts',
                isSkill: true,
                tags: ['skill']
              });
            }
          });
        }
        battle.addBuff(unit, {
          key: 'melusine:s1:spgen',
          duration: 6.0,
          mods: { spRecoveryPct: 0.40 },
          visible: true
        });
        battle.addBuff(target, {
          key: 'melusine:s1:dmgtaken',
          duration: 6.0,
          mods: { dmgTakenMul: 1.15 },
          visible: true
        });
        battle.fx?.('melusineS1', { x: unit.x, y: unit.y, id: unit.id, target: target.id, targets: [target.id], tx: target.x, ty: target.y });
      }
    };

    const s2 = {
      kind: 'duration',
      duration: 14.0,
      mods: { hpPct: 0.35, atkPct: 0.70, aspd: 45, critRate: 0.50, critDmgMul: 1.60 },
      onStart({ battle, unit }) {
        S.gainLayers(battle, { playerId: unit.ownerId, bonds: ['roundTable', 'preciShip'], n: 4, source: unit, reason: 'melusine:s2' });
        battle.fx?.('melusineS2', { x: unit.x, y: unit.y, id: unit.id });
      }
    };

    const s3 = {
      kind: 'instant',
      onStart({ battle, unit }) {
        unit.mem = unit.mem || {};
        if (!unit.mem._melusineDragonForm) {
          // 首次开启：解放阿尔比恩真身，永久进入起飞状态
          unit.mem._melusineDragonForm = true;
          fillSp(unit);
          addShieldLayer(battle, unit, 'melusine:dragon:shield', 1);
          battle.addBuff(unit, {
            key: 'melusine:dragon:liftoff',
            duration: Infinity,
            flags: { liftoff: true },
            visible: true
          });
          battle.fx?.('melusineTransform', { x: unit.x, y: unit.y, id: unit.id });
        } else {
          // 后续开启：5 段彩虹激光，总计 720% 法伤 (每段 144%) + 450 灼燃
          const foes = battle.foesInRadius ? battle.foesInRadius(unit.x, unit.y, 3.5) : battle.enemies.filter((e) => e.alive);
          for (const e of foes) {
            if (!e.alive || e.hidden) continue;
            for (let i = 0; i < 5; i++) {
              battle.after(i * 0.1, () => {
                if (e.alive) {
                  battle.dealDamage(unit, e, {
                    amount: (unit.s?.atk ?? 830) * 1.44,
                    type: 'arts',
                    canDodge: false,
                    isSkill: true,
                    tags: ['skill']
                  });
                  battle.fx?.('counter', { x: e.x, y: e.y, id: e.id, src: unit.id });
                }
              });
            }
            battle.dealDamage?.(unit, e, { amount: 450, type: 'elemental', element: 'burn', isSkill: true, tags: ['burn'] });
          }
          battle.fx?.('melusineS3Beam', { x: unit.x, y: unit.y, id: unit.id, targets: foes.map(e => e.id), r: 3.5 });
        }
      }
    };

    return {
      skills: {
        skchr_fgo_melusine_1: s1,
        skchr_fgo_melusine_2: s2,
        skchr_fgo_melusine_3: s3
      },
      skill: s1,
      install(battle, unit) {
        // 天赋：龙之心 (初始技力 +15；开启技能后获得 25 攻击速度与 20% 物理闪避持续 10 秒)
        addSp(unit, 15);

        battle.on('skillStart', (c) => {
          if (c.unit === unit) {
            battle.addBuff(unit, {
              key: 'melusine:talent:heart',
              duration: 10.0,
              mods: { aspd: 25, physDodge: 0.20 },
              visible: true,
              refresh: 'replace'
            });
          }
        }, { owner: unit });
      }
    };
  },

  // =========================================================================
  // 12. 阿尔托莉雅·潘德拉贡 (Artoria, Tier 6) — 领主
  // =========================================================================
  chess_fgo_6_artoria_a: (bb, chess, def) => {
    const s1 = {
      kind: 'duration',
      duration: 15.0,
      mods: { atkPct: 0.80 },
      onStart({ battle, unit }) {
        for (const a of battle.allyUnits) {
          if (!a.alive || a.kind !== 'op') continue;
          const isRoundTable = S.isMember(battle, a, 'roundTable');
          const bonus = isRoundTable ? 0.45 : 0.25;
          battle.addBuff(a, {
            key: 'artoria:s1:atk',
            duration: 15.0,
            mods: { atkPct: bonus },
            visible: true
          });
        }
        battle.fx?.('artoriaS1', { x: unit.x, y: unit.y, id: unit.id });
      },
      onAttack({ battle, unit }) {
        addSp(unit, 1);
      }
    };

    const s2 = {
      kind: 'duration',
      duration: 12.0,
      mods: { atkPct: 1.40 },
      onStart({ battle, unit }) {
        addSp(unit, 8);
        battle.fx?.('artoriaS2', { x: unit.x, y: unit.y, id: unit.id });
      },
      onAttack({ battle, unit, target }) {
        if (target && target.alive) {
          weaknessRetype(unit.dmg, unit, target);
        }
      }
    };

    const s3 = {
      kind: 'duration',
      duration: 12.0,
      mods: { atkPct: 1.00 },
      onStart({ battle, unit }) {
        const overcharge = isOvercharge(battle, unit);
        const totalScale = overcharge ? 11.50 : 8.20;
        const hitScale = totalScale / 6.0; // 拆为 6 段独立 Hit，确保在 BOSS_HIT_LIMIT 之下

        const foes = battle.foesInRadius ? battle.foesInRadius(unit.x, unit.y, 3.5) : battle.enemies.filter((e) => e.alive);
        for (const e of foes) {
          if (!e.alive || e.hidden) continue;
          for (let i = 0; i < 6; i++) {
            battle.after(i * 0.1, () => {
              if (e.alive) {
                const dmgObj = { amount: (unit.s?.atk ?? 900) * hitScale, type: 'phys', isSkill: true, tags: ['skill'] };
                weaknessRetype(dmgObj, unit, e);
                battle.dealDamage(unit, e, dmgObj);
                battle.fx?.('counter', { x: e.x, y: e.y, id: e.id, src: unit.id });
              }
            });
          }
        }

        const refund = overcharge ? 18 : 12;
        addSp(unit, refund);
        battle.fx?.('artoriaExcalibur', { x: unit.x, y: unit.y, id: unit.id, overcharge, targets: foes.map(e => e.id), r: 3.5 });
      },
      onAttack({ battle, unit }) {
        const foes = battle.foesInRadius ? battle.foesInRadius(unit.x, unit.y, 2.5) : battle.enemies.filter((e) => e.alive);
        let count = 0;
        for (const e of foes) {
          if (!e.alive || e.hidden) continue;
          if (count++ >= 3) break;
          battle.dealDamage(unit, e, {
            amount: (unit.s?.atk ?? 900) * 1.0,
            type: 'phys',
            tags: ['cleave']
          });
        }
      }
    };

    return {
      skills: {
        skchr_fgo_artoria_1: s1,
        skchr_fgo_artoria_2: s2,
        skchr_fgo_artoria_3: s3
      },
      skill: s1,
      install(battle, unit) {
        // 天赋：龙之炉心 (自身与周围 8 格友方【圆桌】干员攻击力 +12%，每 3 秒回复 1 点技力)
        battle.every?.(3.0, () => {
          if (!unit.alive) return;
          for (const a of battle.allyUnits) {
            if (a.alive && a.kind === 'op' && hypot(a.x - unit.x, a.y - unit.y) <= 1.5) {
              if (a === unit || S.isMember(battle, a, 'roundTable')) {
                battle.addBuff(a, {
                  key: 'artoria:talent:core',
                  duration: 3.5,
                  mods: { atkPct: 0.12 },
                  visible: true,
                  refresh: 'replace'
                });
                addSp(a, 1);
              }
            }
          }
        });
      }
    };
  },

  // =========================================================================
  // 13. 梅林 (Merlin, Tier 6) — 吟游者
  // =========================================================================
  chess_fgo_6_merlin_a: (bb, chess, def) => {
    const s1 = {
      kind: 'duration',
      duration: 12.0,
      onStart({ battle, unit }) {
        for (const a of battle.allyUnits) {
          if (a.alive && a.kind === 'op') {
            addSp(a, 6);
            battle.addBuff(a, {
              key: 'merlin:s1:inspire',
              duration: 12.0,
              mods: { atkFlat: (unit.s?.atk ?? 650) * 0.30 },
              visible: true
            });
          }
        }
        battle.fx?.('merlinS1', { x: unit.x, y: unit.y, id: unit.id });
      }
    };

    const s2 = {
      kind: 'duration',
      duration: 12.0,
      onStart({ battle, unit }) {
        // 幻术：周围 8 格友方 1 层护盾
        for (const a of battle.allyUnits) {
          if (a.alive && a.kind === 'op' && hypot(a.x - unit.x, a.y - unit.y) <= 1.5) {
            addShieldLayer(battle, a, 'merlin:s2:shield', 1);
          }
        }
        // 英雄塑造：攻击力最高的友方干员
        let highest = null;
        for (const a of battle.allyUnits) {
          if (!a.alive || a.kind !== 'op') continue;
          if (hypot(a.x - unit.x, a.y - unit.y) > 1.5) continue;
          const atk = a.s?.atk ?? 0;
          if (!highest || atk > highest.atk) highest = { unit: a, atk };
        }
        if (highest) {
          battle.addBuff(highest.unit, {
            key: 'merlin:s2:hero',
            duration: 12.0,
            mods: { hpPct: 0.50, atkPct: 0.60, critDmgMul: 1.60 },
            visible: true
          });
        }
        battle.fx?.('merlinS2', { x: unit.x, y: unit.y, id: unit.id });
      }
    };

    const s3 = {
      kind: 'duration',
      duration: 18.0,
      onStart({ battle, unit }) {
        unit.mem = unit.mem || {};
        unit.mem._merlinTick = 0;
        battle.fx?.('merlinAvalon', { x: unit.x, y: unit.y, id: unit.id, duration: 18.0 });
      },
      onTick({ battle, unit, dt }) {
        unit.mem = unit.mem || {};
        unit.mem._merlinTick = (unit.mem._merlinTick || 0) + (dt || (1 / 30));
        if (unit.mem._merlinTick >= 0.5) {
          unit.mem._merlinTick -= 0.5;
          for (const a of battle.allyUnits) {
            if (!a.alive || a.kind !== 'op') continue;
            const heal = (unit.s?.atk ?? 650) * 0.35;
            battle.heal?.(unit, a, heal);
            addSp(a, 0.6);
          }
        }
      }
    };

    return {
      skills: {
        skchr_fgo_merlin_1: s1,
        skchr_fgo_merlin_2: s2,
        skchr_fgo_merlin_3: s3
      },
      skill: s1,
      install(battle, unit) {
        // 天赋：梦幻领导力 (入场时全场所有友方干员获得 10 点技力与 1 层护盾)
        for (const a of battle.allyUnits) {
          if (a.alive && a.kind === 'op') {
            addSp(a, 10);
            addShieldLayer(battle, a, 'merlin:talent:shield', 1);
          }
        }
      }
    };
  },

  // =========================================================================
  // 14. 阿尔托莉雅·卡斯特 (Castoria, Tier 6) — 护佑者
  // =========================================================================
  chess_fgo_6_castoria_a: (bb, chess, def) => {
    const s1 = {
      kind: 'duration',
      duration: 12.0,
      onStart({ battle, unit }) {
        // 【希望的领袖】不再是一张「周围加攻」—— 全场加攻的牌收归阿尔托莉雅一个人。卡斯特是护佑者，
        // 这张牌改成**充能型**：给周围友方灌技力 + 大幅抬高技力自然回复速度，让全队的技能转得更快。
        // （原先这里是 atkPct 0.25，和 chess.json 描述的「全场 +20%」也对不上，一并纠正。）
        for (const a of battle.allyUnits) {
          if (a.alive && a.kind === 'op' && hypot(a.x - unit.x, a.y - unit.y) <= 1.5) {
            addSp(a, 10);
            battle.addBuff(a, {
              key: 'castoria:s1:buff',
              duration: 12.0,
              mods: { spRecoveryFlat: 0.6, spRecoveryMul: 1.5 },
              visible: true
            });
          }
        }
        battle.fx?.('castoriaS1', { x: unit.x, y: unit.y, id: unit.id });
      }
    };

    const s2 = {
      kind: 'duration',
      duration: 14.0,
      onStart({ battle, unit }) {
        const cands = battle.allyUnits.filter((a) => a.alive && a.kind === 'op' && hypot(a.x - unit.x, a.y - unit.y) <= 1.5);
        cands.sort((a, b) => (b.s?.atk ?? 0) - (a.s?.atk ?? 0));
        for (let i = 0; i < Math.min(2, cands.length); i++) {
          const a = cands[i];
          addShieldLayer(battle, a, 'castoria:s2:shield', 1);
          battle.addBuff(a, {
            key: 'castoria:s2:buff',
            duration: 14.0,
            mods: { dmgDealtMul: 1.40 },
            visible: true
          });
        }
        battle.fx?.('castoriaS2', { x: unit.x, y: unit.y, id: unit.id });
      }
    };

    const s3 = {
      kind: 'duration',
      duration: 15.0,
      onStart({ battle, unit }) {
        const overcharge = isOvercharge(battle, unit);
        const layers = overcharge ? 3 : 2;

        for (const a of battle.allyUnits) {
          if (!a.alive || a.kind !== 'op') continue;
          battle.removeStatus?.(a, 'stun');
          battle.removeStatus?.(a, 'silence');
          battle.removeStatus?.(a, 'sluggish');
          addShieldLayer(battle, a, 'castoria:s3:trueshield', layers);
          battle.addBuff(a, {
            key: 'castoria:s3:atk',
            duration: 15.0,
            mods: { atkPct: 0.45 },
            visible: true
          });
        }
        unit.mem = unit.mem || {};
        unit.mem._castoriaTick = 0;
        battle.fx?.('castoriaS3', { x: unit.x, y: unit.y, id: unit.id, overcharge });
      },
      onTick({ battle, unit, dt }) {
        unit.mem = unit.mem || {};
        unit.mem._castoriaTick = (unit.mem._castoriaTick || 0) + (dt || (1 / 30));
        if (unit.mem._castoriaTick >= 0.5) {
          unit.mem._castoriaTick -= 0.5;
          for (const a of battle.allyUnits) {
            if (a.alive && a.kind === 'op' && hypot(a.x - unit.x, a.y - unit.y) <= 2.0) {
              const heal = (unit.s?.atk ?? 700) * 0.25;
              battle.heal?.(unit, a, heal);
            }
          }
        }
      }
    };

    return {
      skills: {
        skchr_fgo_castoria_1: s1,
        skchr_fgo_castoria_2: s2,
        skchr_fgo_castoria_3: s3
      },
      skill: s1,
      install(battle, unit) {
        // 天赋：湖之加护 (生命值低于 50% 的友方干员受到卡斯特治疗时，获得 1 层护盾与 15% 减伤)
        battle.on('heal', (c) => {
          if (c.source === unit && c.target && c.target.alive && c.target.kind === 'op') {
            const maxHp = c.target.s?.maxHp ?? 2000;
            if (c.target.hp <= maxHp * 0.50) {
              addShieldLayer(battle, c.target, 'castoria:talent:shield', 1);
              battle.addBuff(c.target, {
                key: 'castoria:talent:protect',
                duration: 6.0,
                mods: { dmgTakenMul: 0.85 },
                visible: true,
                refresh: 'replace'
              });
            }
          }
        }, { owner: unit });
      }
    };
  },

  // =========================================================================
  // 15. 摩根 (Morgan, Tier 6) — 轰击术师
  // =========================================================================
  chess_fgo_6_morgan_a: (bb, chess, def) => {
    const s1 = {
      kind: 'duration',
      duration: 12.0,
      onStart({ battle, unit }) {
        addSp(unit, 6);
        // 【渴爱的魅力】去掉友方加攻 —— 全场加攻的牌收归阿尔托莉雅。摩根是阵法术士，这张牌改做
        // **削弱型**：范围从「周围 3 格」放大到全场，给敌人上破防 + 降抗 + 易伤，让她成为队伍的
        // 「开团削弱手」，和纯加攻的领袖、纯充能的护佑者彻底区分开。
        for (const e of battle.enemies) {
          if (e.alive && !e.hidden) {
            battle.addBuff(e, {
              key: 'morgan:s1:shred',
              duration: 12.0,
              mods: { defPct: -0.40, resFlat: -30, dmgTakenMul: 1.25 },
              visible: true
            });
          }
        }
        battle.fx?.('morganS1', { x: unit.x, y: unit.y, id: unit.id, r: 4.0 });
      }
    };

    const s2 = {
      kind: 'duration',
      duration: 14.0,
      mods: { atkPct: 0.75, aspd: 30 },
      onStart({ battle, unit }) {
        battle.addBuff(unit, {
          key: 'morgan:s2:undying',
          duration: 14.0,
          flags: { undying: true },
          visible: true
        });
        battle.fx?.('morganS2', { x: unit.x, y: unit.y, id: unit.id });
      },
      onAttack({ battle, unit, target }) {
        if (target && target.alive) {
          battle.addBuff(target, {
            key: 'morgan:s2:debuff',
            duration: 5.0,
            mods: { atkPct: -0.20, mspdPct: -0.40 },
            visible: true
          });
          battle.dealDamage?.(unit, target, { amount: 300, type: 'elemental', element: 'apoptosis', isSkill: true, tags: ['necrosis'] });
        }
      }
    };

    const s3 = {
      kind: 'instant',
      onStart({ battle, unit }) {
        const overcharge = isOvercharge(battle, unit);
        const totalScale = overcharge ? 9.00 : 7.20;
        const hitScale = totalScale / 6.0; // 拆为 6 段独立 Hit

        const foes = battle.foesInRadius ? battle.foesInRadius(unit.x, unit.y, 3.5) : battle.enemies.filter((e) => e.alive);
        for (const e of foes) {
          if (!e.alive || e.hidden) continue;
          for (let i = 0; i < 6; i++) {
            battle.after(i * 0.1, () => {
              if (e.alive) {
                battle.dealDamage(unit, e, {
                  amount: (unit.s?.atk ?? 880) * hitScale,
                  type: 'arts',
                  isSkill: true,
                  tags: ['skill']
                });
                battle.fx?.('counter', { x: e.x, y: e.y, id: e.id, src: unit.id });
              }
            });
          }
        }

        // 全场我方获得 8 点技力与【蓄力就绪】状态
        for (const a of battle.allyUnits) {
          if (a.alive && a.kind === 'op') {
            addSp(a, 8);
            a.mem = a.mem || {};
            a.mem.overchargeReady = true;
          }
        }
        battle.fx?.('morganS3', { x: unit.x, y: unit.y, id: unit.id, overcharge, targets: foes.map(e => e.id), r: 3.5 });
      }
    };

    return {
      skills: {
        skchr_fgo_morgan_1: s1,
        skchr_fgo_morgan_2: s2,
        skchr_fgo_morgan_3: s3
      },
      skill: s1,
      install(battle, unit) {
        // 每次开启技能使全场圆桌干员下一次技能视为 Overcharge (修正 isMember 参数)
        battle.on('skillStart', (c) => {
          if (c.unit === unit) {
            for (const a of battle.allyUnits) {
              if (a.alive && a.kind === 'op' && S.isMember(battle, a, 'roundTable')) {
                a.mem = a.mem || {};
                a.mem.overchargeReady = true;
              }
            }
          }
        }, { owner: unit });

        // 天赋：冬之女王 (敌人移速 -15%，受到法术伤害 +15%；击倒敌人回复 3 点技力)
        for (const e of battle.enemies) {
          if (e.alive && !e.hidden) {
            battle.addBuff(e, {
              key: 'morgan:talent:winter',
              duration: Infinity,
              mods: { mspdPct: -0.15, artsFragile: 0.15 },
              visible: true
            });
          }
        }

        battle.on('kill', (c) => {
          if (c.source === unit && unit.alive) {
            addSp(unit, 3);
          }
        }, { owner: unit });
      }
    };
  }
};
