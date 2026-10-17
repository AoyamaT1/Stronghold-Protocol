// mods/limbus-company/sim/bonds.js — Limbus Company covenant combat & prep logic (3/6 Tiers)
import * as S from '../../support/index.js';

const num = S.num;

export function install(battle) {
  if (!battle || !Array.isArray(battle.players)) return;

  for (const p of battle.players) {
    const pid = p.playerId;
    if (!S.bondActive(battle, pid, 'limbusShip')) continue;

    const bb = S.buffParams(S.bondRecord('limbusShip'), 'act1autochess_bond_eff_limbus') || {
      base_damage_scale: 1.08,
      damage_scale_per_stack: 0.004,
      max_damage_scale: 2.2,
      max_sanity: 45,
      atk_pct_max: 0.18,
      neg_persona_atk: 0.45,
      neg_penalty_atk: 0.25,
      damage_reduction: 0.15,
      init_sanity: 20,
      dante_invuln_sec: 3.0,
      dante_heal_ratio: 0.3,
      full_sanity_aspd: 30,
      full_sanity_sp_ratio: 0.7,
      resonance_cap: 15,
      resonance_atk: 0.03,
      resonance_aspd: 1.5,
      detonate_step: 5,
      detonate_ratio: 0.5,
      power_bond_char_cnt: 6
    };

    const members = S.bondMembers(battle, pid, 'limbusShip');
    if (!members.length) continue;

    const L = () => S.bondLayers(battle, pid, 'limbusShip');
    const bondTier = S.bondTier(battle, pid, 'limbusShip');
    const count = members.length;

    // 1. Damage dealt scaling with bond layers
    const applyDamageBuff = () => {
      const mult = Math.min(
        num(bb.max_damage_scale, 2.2),
        num(bb.base_damage_scale, 1.08) + num(bb.damage_scale_per_stack, 0.004) * L()
      );
      for (const u of members) {
        S.passiveBuff(battle, u, 'bond:limbus:dmg', { dmgDealtMul: mult });
      }
    };
    applyDamageBuff();

    battle.on('layerGain', (c) => {
      if (c.playerId === pid && c.bondId === 'limbusShip') {
        battle.after(0, applyDamageBuff);
      }
    });

    // 2. Sanity (理智值) System (3-piece effect)
    const initSanity = (bondTier >= 2 || count >= 6) ? num(bb.init_sanity, 20) : 0;
    for (const u of members) {
      u.mem = u.mem || {};
      u.mem.limbusSanity = initSanity;
      u.mem.danteClockUsed = false;
      // 负理智人格（辛克莱 / 罗佳）：精神为负反而增强；其余罪人精神为负是虚弱/紊乱
      const who = String(u.charId || u.def?.charId || u.defId || u.def?.id || '');
      u.mem.negSanityPersona = /limbus_(sinclair|rodion)\b/.test(who);
      updateSanityBuff(battle, u, bb, bondTier, count);
    }

    // ★主盟约叠层手★：把「叠【边狱公司】主盟约层数」集中到两名干员，解决散乱（层数 → applyDamageBuff 全体增伤）。
    //   罗佳 (t3) 稳定循环：每 3 次攻击 +1 层，每场上限 20。
    //   良秀 (t5) 强力爆发：每次开启技能 +5 层，每场上限 25。
    // 其余罪人不再叠主盟约层（各自的自叠层/理智是个人机制，保留），所以“谁在叠主盟约”一目了然。
    for (const u of members) {
      const who = String(u.charId || u.def?.charId || u.defId || u.def?.id || '');
      if (/limbus_rodion\b/.test(who)) {
        u.mem = u.mem || {};
        u.mem._limbusHits = 0;
        battle.on('damaged', (ev) => {
          if (ev.source !== u || !u.alive) return;
          u.mem._limbusHits = (u.mem._limbusHits || 0) + 1;
          if (u.mem._limbusHits % 3 === 0) {
            S.gainLayers?.(battle, { playerId: pid, bonds: ['limbusShip'], n: 1, source: u, reason: 'limbus:rodion', cap: 20, capKey: 'limbus:rodion' });
          }
        }, { owner: u });
      } else if (/limbus_ryoshu\b/.test(who)) {
        battle.on('skillStart', (ev) => {
          if ((ev.unit || ev.source) !== u || !u.alive) return;
          S.gainLayers?.(battle, { playerId: pid, bonds: ['limbusShip'], n: 5, source: u, reason: 'limbus:ryoshu', cap: 25, capKey: 'limbus:ryoshu' });
        }, { owner: u });
      }
    }

    // Gain Sanity on hit or kill
    battle.on('damaged', (ev) => {   // 模拟器没有 'damage'，只有 'damaged'
      const src = ev.source;
      if (!src || !members.includes(src)) return;
      if (src.mem && typeof src.mem.limbusSanity === 'number') {
        if (src.mem.limbusSanity < num(bb.max_sanity, 45)) {
          src.mem.limbusSanity = Math.min(num(bb.max_sanity, 45), src.mem.limbusSanity + 1);
          updateSanityBuff(battle, src, bb, bondTier, count);
        }
      }
    });

    battle.on('kill', (ev) => {
      const src = ev.killer;   // payload 是 { killer, victim }
      if (!src || !members.includes(src)) return;
      if (src.mem && typeof src.mem.limbusSanity === 'number') {
        if (src.mem.limbusSanity < num(bb.max_sanity, 45)) {
          src.mem.limbusSanity = Math.min(num(bb.max_sanity, 45), src.mem.limbusSanity + 3);
          updateSanityBuff(battle, src, bb, bondTier, count);
        }
      }
    });

    // 2b. 【金枝共鸣】(罪恶共鸣) — 全队共享引擎：任意罪人把精神推到极值(满 +45 或 跌破 0)就为全队充能，
    //     金枝共鸣越高全队攻击/攻速越强，并每满一档引爆敌人身上的四类损伤。把原来 12 条散装自叠层统一成这一条团队线。
    //     负理智人格(辛克莱/罗佳)跌破 0 时充能更多，是主充能手。
    // 道具联动：金枝 (Golden Bough) 与 LCB员工证
    let boughResCapBonus = 0;
    let boughInitResBonus = 0;
    const boughCarriers = [];
    for (const u of members) {
      const items = (u.items || []).map((it) => (typeof it === 'string' ? it : it?.id || ''));
      const hasBough = items.some((it) => it.includes('chess_item_6_limbus_bough'));
      const hasLcb = items.some((it) => it.includes('chess_item_2_limbus_lcb'));
      if (hasBough) {
        const isBoughGolden = items.some((it) => it.endsWith('chess_item_6_limbus_bough_b'));
        const extraSan = isBoughGolden ? 30 : 20;
        u.mem = u.mem || {};
        u.mem.limbusSanity = Math.min(45, (u.mem.limbusSanity ?? 0) + extraSan);
        updateSanityBuff(battle, u, bb, bondTier, count);
        boughCarriers.push(u);

        if (hasLcb) {
          boughResCapBonus += 5;
          boughInitResBonus += (isBoughGolden ? 5 : 3);
        }
      }
    }

    const RES_CAP = num(bb.resonance_cap, 15) + boughResCapBonus;
    const DETO_STEP = Math.max(1, num(bb.detonate_step, 5));
    battle._limbusRes = battle._limbusRes || {};
    const st = (battle._limbusRes[pid] = { n: boughInitResBonus, cap: RES_CAP });   // 暴露给快照(HUD 金枝共鸣条)与鸿璐的放大 kit
    let detoPaid = 0;
    const applyResonance = () => {
      const n = Math.min(RES_CAP, st.n);
      const mods = n > 0 ? { atkPct: n * num(bb.resonance_atk, 0.03), aspd: n * num(bb.resonance_aspd, 1.5) } : {};
      for (const u of members) {
        S.passiveBuff(battle, u, 'bond:limbus:resonance', mods);
        if (u.mem) { u.mem.limbusResonance = n; u.mem.limbusResonanceCap = RES_CAP; }   // 快照镜像 → HUD 全队金枝共鸣条
      }
    };
    const detonate = () => {
      const foes = (battle.enemies || []).filter((e) => e && e.alive && e.side === 'enemy');
      for (const e of foes) {
        const g = (e.elem?.neural || 0) + (e.elem?.burn || 0) + (e.elem?.apoptosis || 0) + (e.elem?.necrosis || 0);
        if (g > 0) { battle.dealDamage(members[0], e, { amount: g * num(bb.detonate_ratio, 0.5), type: 'real' }); battle.fx?.('camellia_deluge', { x: e.x, y: e.y }); }
      }
    };
    const chargeResonance = (by) => {
      if (!(by > 0)) return;
      st.n = Math.min(RES_CAP, st.n + by);
      applyResonance();
      while (st.n >= (detoPaid + 1) * DETO_STEP) { detoPaid++; detonate(); }
    };
    for (const u of boughCarriers) {
      battle.on('damaged', (ev) => {
        if (ev.source === u && u.alive) {
          chargeResonance(1);
        }
      }, { owner: u });
    }
    // 鸿璐「消耗金枝共鸣放一次大爆发」：清空全队金枝共鸣，并同步重置引爆档位与持续增益/HUD（返回被消耗掉的层数）
    st.spendAll = () => { const had = st.n; st.n = 0; detoPaid = 0; applyResonance(); return had; };
    st.applyResonance = applyResonance;
    applyResonance();
    battle.on('tick', () => {
      const maxS = num(bb.max_sanity, 45);
      for (const u of members) {
        if (!u || !u.alive || !u.mem) continue;
        const s = u.mem.limbusSanity ?? 0;
        if (s >= maxS) { if (!u.mem._resFull) { u.mem._resFull = true; chargeResonance(1); } } else u.mem._resFull = false;
        if (s < 0) { if (!u.mem._resNeg) { u.mem._resNeg = true; chargeResonance(u.mem.negSanityPersona ? 2 : 1); } } else u.mem._resNeg = false;
      }
    });

    // 3. 6-piece: Dante Rewind Clock + Golden Bough Resonance (元素效率) — 无视防御/法抗已按用户要求删除
    if (bondTier >= 2 || count >= 6) {
      // Golden Bough Resonance：只保留元素损伤效率，不再无视防御/法抗（去超模）
      for (const u of members) {
        battle.addBuff(u, {
          key: 'bond:limbus:goldenBough',
          mods: { epEfficiency: 0.5 },
          persist: true,
          allowDead: true
        });
      }

      // Dante Rewind Clock
      battle.on('fatal', (ev) => {   // 没有 beforeDie；致命一击走 'fatal'
        const u = ev.unit;
        if (!u || !members.includes(u)) return;
        if (u.mem && !u.mem.danteClockUsed) {
          u.mem.danteClockUsed = true;
          ev.prevented = true;   // fatal 用 prevented
          u.hp = Math.max(1, Math.floor(u.maxHp * num(bb.dante_heal_ratio, 0.3)));
          u.mem.limbusSanity = 0;
          updateSanityBuff(battle, u, bb, bondTier, count);
          battle.addBuff(u, {
            key: 'bond:limbus:danteInvuln',
            mods: { invulnerable: true },
            duration: num(bb.dante_invuln_sec, 3.0),
            visible: true
          });
          battle.fx?.('clock_rewind', { x: u.x, y: u.y, id: u.id });
        }
      });
    }
  }
}

function updateSanityBuff(battle, unit, bb, bondTier, count) {
  const sanity = unit.mem?.limbusSanity ?? 0;
  const maxSanity = num(bb.max_sanity, 45);
  const posRatio = Math.max(0, sanity) / maxSanity;   // 正理智程度 0..1
  const negRatio = Math.max(0, -sanity) / maxSanity;  // 负理智程度 0..1
  const isNegPersona = !!unit.mem?.negSanityPersona;

  const mods = {};
  // 正理智线（全体通用）：精神越高越稳越强（对应原作「硬币正面率」）
  mods.atkPct = posRatio * num(bb.atk_pct_max, 0.18);
  mods.dmgTakenMul = 1 - posRatio * num(bb.damage_reduction, 0.15);

  if (sanity < 0) {
    if (isNegPersona) {
      // 负理智人格（辛克莱 / 罗佳）：精神为负反而大幅增强——高风险玻璃大炮，靠但丁时钟兜底
      mods.atkPct += negRatio * num(bb.neg_persona_atk, 0.45);
      mods.aspd = (mods.aspd || 0) + negRatio * 30;
    } else {
      // 普通罪人：精神为负 = 虚弱/紊乱，轻度惩罚，激励维持高精神
      mods.atkPct -= negRatio * num(bb.neg_penalty_atk, 0.25);
      mods.dmgTakenMul *= 1 + negRatio * 0.15;
    }
  }

  // 6 人：满精神的稳健线额外收益（只给正理智，不再给负理智全体暴走）
  if (bondTier >= 2 || count >= 6) {
    if (sanity >= maxSanity) {
      mods.aspd = (mods.aspd || 0) + num(bb.full_sanity_aspd, 30);
      mods.spCostPct = -0.3;
    }
  }

  S.passiveBuff(battle, unit, 'bond:limbus:sanity', mods);
}

export function registerMeta(registry) {
  registry.bond?.('limbusShip', {
    onGain(ctx, layers) {
      ctx.addLayers?.('limbusShip', layers, { requireActive: true });
    }
  });
}
