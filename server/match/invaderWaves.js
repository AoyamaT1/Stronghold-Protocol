// server/match/invaderWaves.js — Asymmetric PvP / Dungeon Master wave customization.
// Allows the Invader player to customize enemy picks, route strategies, tactical buffs, and reinforcements
// based on official level/round progress data.

import { roundPick, scaleFor, isFlyKey, classOf, gateOf } from './waves.js';

const ACLOON = 'enemy_9012_acloon';

/**
 * Calculates Command Point (CP) cost for an enemy based on rank and combat rating (attrPower).
 */
export function calculateEnemyCost(e) {
  if (!e) return 2;
  if (e.rank === 'BOSS') return 15;
  const ap = e.attrPower || 3000;
  if (e.rank === 'ELITE') {
    if (ap >= 25000) return 7;
    if (ap >= 15000) return 6;
    return 5;
  }
  // NORMAL
  if (ap >= 6000) return 4;
  if (ap >= 3500) return 3;
  return 2;
}

/**
 * Base CP budget for round r: 10 + r * 4.
 */
export function getInvaderBudget(round) {
  const r = Math.max(1, Number(round) || 1);
  return 10 + r * 4;
}

/** Tactical modifiers available to the invader. */
export const INVADER_TACTICS = Object.freeze([
  { id: 'rush', name: '急速突袭', desc: '全军移动速度 +20%', cost: 6, effect: { speedMul: 1.2 } },
  { id: 'pierce', name: '破甲强攻', desc: '全军攻击力 +15%', cost: 8, effect: { atkMul: 1.15 } },
  { id: 'fortify', name: '钢铁装甲', desc: '全军生命值 +20%', cost: 8, effect: { hpMul: 1.2 } },
]);

/**
 * Extracts all officially available enemies for this round based on factions, schedule, and firstHalf rules.
 * @param {import('./gamedata.js').GameData} gd
 * @param {string[]|object} factions
 * @param {number} round
 */
export function getAvailableEnemiesForRound(gd, factions, round) {
  const r = Math.max(1, Number(round) || 1);
  const gen = gd.factions.generation || {};
  const firstHalfMax = Number.isInteger(gen.firstHalfMaxRound) ? gen.firstHalfMaxRound : 7;
  const isFirstHalf = r <= firstHalfMax;

  // Find round scheduled type
  const basePick = roundPick(gd, () => 0, factions, r);
  const scheduledType = basePick ? basePick.type : 'SPECIAL';

  const enemyKeys = new Set();

  // 1. Template slot defaults
  const ts = gd.factions.templateSlots || {};
  for (const k of Object.values(ts)) {
    if (k && k !== ACLOON && gd.enemy(k) && !gd.inactiveEnemies.has(k)) {
      enemyKeys.add(k);
    }
  }

  // 2. Faction entries for scheduled type and SPECIAL matching half
  const entries = gd.factions.entries ? Object.values(gd.factions.entries) : [];
  for (const e of entries) {
    if (!e || typeof e.key !== 'string') continue;
    if (gd.inactiveEnemies.has(e.key)) continue;
    if (!!e.firstHalf === isFirstHalf) {
      if (e.type === scheduledType || e.type === 'SPECIAL') {
        enemyKeys.add(e.key);
        // Add attached normal and elite
        if (Array.isArray(e.N)) {
          for (const item of e.N) {
            const k = typeof item === 'string' ? item : item?.key;
            if (k && k !== ACLOON && gd.enemy(k) && !gd.inactiveEnemies.has(k)) enemyKeys.add(k);
          }
        }
        if (Array.isArray(e.E)) {
          for (const item of e.E) {
            const k = typeof item === 'string' ? item : item?.key;
            if (k && k !== ACLOON && gd.enemy(k) && !gd.inactiveEnemies.has(k)) enemyKeys.add(k);
          }
        }
      }
    }
  }

  // Build enemy details list
  const enemies = [];
  for (const key of enemyKeys) {
    const e = gd.enemy(key);
    if (!e) continue;
    const isFly = isFlyKey(gd, key);
    const cost = calculateEnemyCost(e);
    enemies.push({
      key,
      name: e.name || key,
      rank: e.rank || 'NORMAL',
      isFly,
      cost,
      attrPower: e.attrPower || 0,
      desc: e.desc || '',
      iconId: e.iconId || key,
      stats: {
        maxHp: e.stats?.maxHp || 0,
        atk: e.stats?.atk || 0,
        def: e.stats?.def || 0,
        res: e.stats?.res || 0,
        moveSpeed: e.stats?.moveSpeed || 1,
      },
    });
  }

  // Sort by cost ascending, then rank
  enemies.sort((a, b) => a.cost - b.cost || (a.rank === 'ELITE' ? 1 : -1));

  return {
    round: r,
    scheduledType,
    isFirstHalf,
    budget: getInvaderBudget(r),
    enemies,
    tactics: INVADER_TACTICS,
    defaultPick: basePick ? {
      normal: basePick.normal,
      elite: basePick.elite,
      special: basePick.key,
    } : null,
  };
}

/**
 * Builds the customized Battle wave according to the Invader's plan.
 * Falls back safely to default wave generation if plan is null or incomplete.
 *
 * @param {import('./gamedata.js').GameData} gd
 * @param {Function} rng
 * @param {string[]|object} factions
 * @param {number} round
 * @param {object|null} invaderPlan
 */
export function buildInvaderCustomWave(gd, rng, factions, round, invaderPlan) {
  const rc = gd.roundCfg(round);
  const templateId = rc && typeof rc.template === 'string' ? rc.template : null;
  const tpl = templateId ? gd.wave(templateId) : null;
  const timeLimit = gd.combatTimeLimit(round);

  if (!tpl) {
    return {
      templateId, spawns: [], routes: [], extraRoutes: [], timeLimit,
      overrides: {}, pick: null, entries: { ground: null, fly: null }, actions: [],
    };
  }

  const basePick = roundPick(gd, rng, factions, round);
  const budget = getInvaderBudget(round);

  // If no plan provided, use base template wave
  if (!invaderPlan || typeof invaderPlan !== 'object') {
    return null; // Signals caller to use buildNormalWave
  }

  // Merge pick overrides
  const pick = {
    ...basePick,
    normal: (typeof invaderPlan.normalKey === 'string' && gd.enemy(invaderPlan.normalKey))
      ? invaderPlan.normalKey : basePick?.normal,
    elite: (typeof invaderPlan.eliteKey === 'string' && gd.enemy(invaderPlan.eliteKey))
      ? invaderPlan.eliteKey : basePick?.elite,
    key: (typeof invaderPlan.specialKey === 'string' && gd.enemy(invaderPlan.specialKey))
      ? invaderPlan.specialKey : basePick?.key,
  };

  const scale = scaleFor(gd, round);
  const routes = Array.isArray(tpl.routes) ? tpl.routes : [];
  const spawns = [];
  const actions = [];
  const list = Array.isArray(tpl.spawns) ? tpl.spawns : [];

  // Tactic multiplier
  let atkMul = scale.atkMul;
  let speedMul = scale.speedMul;
  let hpMul = scale.hpMul;

  let tacticCost = 0;
  if (invaderPlan.tacticId) {
    const t = INVADER_TACTICS.find((x) => x.id === invaderPlan.tacticId);
    if (t && t.cost <= budget) {
      tacticCost = t.cost;
      if (t.effect.atkMul) atkMul *= t.effect.atkMul;
      if (t.effect.speedMul) speedMul *= t.effect.speedMul;
      if (t.effect.hpMul) hpMul *= t.effect.hpMul;
    }
  }

  const routeStrategy = invaderPlan.routeStrategy || 'balanced';

  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (!s || (s.action && String(s.action).toUpperCase() !== 'SPAWN')) continue;
    const key0 = s.key ?? s.enemyKey;
    if (typeof key0 !== 'string' || key0 === ACLOON) continue;

    const n = Math.max(1, Math.min(50, Number.isInteger(s.count) ? s.count : 1));
    const interval = Math.max(0, Number(s.interval) || 0);
    const time = Math.max(0, Number(s.time) || 0);
    let routeIndex = Number.isInteger(s.routeIndex) ? s.routeIndex : 0;

    // Apply route strategy bias if multiple routes exist
    if (routes.length > 1) {
      if (routeStrategy === 'upper_focus' && (i % 3 !== 0)) {
        routeIndex = 1;
      } else if (routeStrategy === 'lower_focus' && (i % 3 !== 0)) {
        routeIndex = 0;
      }
    }

    let key = key0;
    let count = n;
    let step = interval;

    // Placeholder replacement with invader's pick
    const ts = gd.factions.templateSlots || {};
    if (key0 === ts.N || key0 === 'N') key = pick.normal || key0;
    else if (key0 === ts.E || key0 === 'E') key = pick.elite || key0;
    else if (key0 === ts.S || key0 === 'S') key = pick.key || key0;
    else if (key0 === ts.NF || key0 === 'NF') key = pick.normal || key0;
    else if (key0 === ts.EF || key0 === 'EF') key = pick.elite || key0;
    else if (key0 === ts.SF || key0 === 'SF') key = pick.key || key0;

    if (!gd.enemy(key)) continue;

    const slot = s.slot || classOf(gd, key);
    const route = routes[routeIndex];
    const start = route && Array.isArray(route.start) ? route.start.slice(0, 2) : null;

    const spec = {
      time,
      enemyKey: key,
      routeIndex,
      count,
      interval: count > 1 ? step : 0,
      mods: { hpMul, atkMul, speedMul, slot },
      actionIndex: i,
      preview: {
        gate: gateOf(start, false),
        start,
        fly: isFlyKey(gd, key),
        elite: !!(gd.enemy(key)?.rank && gd.enemy(key)?.rank !== 'NORMAL'),
        boss: false,
      },
    };

    spawns.push(spec);
    actions.push({
      index: i,
      key,
      tplKey: key0,
      slot,
      time,
      count,
      tplCount: n,
      window: count * step,
      routeIndex,
      valid: true,
      server: true,
    });
  }

  // Handle tactical custom reinforcements
  let currentCost = tacticCost;
  if (Array.isArray(invaderPlan.reinforcements)) {
    for (const r of invaderPlan.reinforcements) {
      if (!r || !r.enemyKey || !gd.enemy(r.enemyKey)) continue;
      const enemy = gd.enemy(r.enemyKey);
      const unitCost = calculateEnemyCost(enemy);
      const count = Math.max(1, Math.min(5, Number.isInteger(r.count) ? r.count : 1));
      const totalSquadCost = unitCost * count;

      if (currentCost + totalSquadCost > budget) {
        continue; // Exceeds budget
      }
      currentCost += totalSquadCost;

      const rIndex = Number.isInteger(r.routeIndex) && r.routeIndex >= 0 && r.routeIndex < routes.length
        ? r.routeIndex : 0;
      const rTime = Math.max(1, Math.min(timeLimit - 10, Number(r.time) || 15));
      const rRoute = routes[rIndex];
      const rStart = rRoute && Array.isArray(rRoute.start) ? rRoute.start.slice(0, 2) : null;
      const rSlot = classOf(gd, r.enemyKey);

      spawns.push({
        time: rTime,
        enemyKey: r.enemyKey,
        routeIndex: rIndex,
        count,
        interval: count > 1 ? 1.5 : 0,
        mods: { hpMul, atkMul, speedMul, slot: rSlot },
        actionIndex: spawns.length,
        preview: {
          gate: gateOf(rStart, false),
          start: rStart,
          fly: isFlyKey(gd, r.enemyKey),
          elite: enemy.rank !== 'NORMAL',
          boss: false,
        },
        tag: 'reinforcement',
      });
    }
  }

  // Sort spawns chronologically by spawn time
  spawns.sort((a, b) => a.time - b.time);

  return {
    templateId,
    spawns,
    routes,
    extraRoutes: Array.isArray(tpl.extraRoutes) ? tpl.extraRoutes : [],
    timeLimit,
    overrides: tpl.overrides && typeof tpl.overrides === 'object' ? tpl.overrides : {},
    pick,
    entries: { ground: null, fly: null },
    actions,
    invaderPlan: {
      ...invaderPlan,
      costSpent: currentCost,
      budget,
    },
  };
}
