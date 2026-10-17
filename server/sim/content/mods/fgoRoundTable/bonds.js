// mods/fgo-round-table/sim/bonds.js — FGO Round Table covenant combat & prep logic
import * as S from '../../support/index.js';
import { weaknessRetype } from '../../items/battle.js';
import { install as installItems } from './items.js';

const num = S.num;

export function install(battle) {
  // 1. Install FGO equipment items
  installItems(battle);

  if (!battle || !Array.isArray(battle.players)) return;

  for (const p of battle.players) {
    const pid = p.playerId;
    if (!S.bondActive(battle, pid, 'roundTable')) continue;

    const members = S.bondMembers(battle, pid, 'roundTable');
    if (!members.length) continue;

    const tier = S.bondTier(battle, pid, 'roundTable');
    const L = () => S.bondLayers(battle, pid, 'roundTable');

    // -------------------------------------------------------------------------
    // 3-Piece: 四重拘束解放·圆桌集结
    // -------------------------------------------------------------------------
    // ATK +(20 + 0.8 * layers)%, DEF +(16 + 0.5 * layers)%
    const applyStatsBuff = () => {
      const curLayers = L();
      const atkPct = 0.20 + 0.008 * curLayers;
      const defPct = 0.16 + 0.005 * curLayers;
      for (const u of members) {
        S.passiveBuff(battle, u, 'bond:roundTable:stats', { atkPct, defPct });
      }
    };
    applyStatsBuff();

    battle.on('layerGain', (c) => {
      if (c.playerId === pid && c.bondId === 'roundTable') {
        battle.after?.(0, applyStatsBuff);
      }
    });

    // 【誓约共鸣】：任意【圆桌】干员开启技能时
    // 1) 全队回 3 点技力（每名干员每 5 秒至多 1 次）
    // 2) 首次开启技能时增加 2 层【圆桌】层数
    let skillCastCount = 0;
    battle.on('skillStart', ({ unit: u }) => {
      if (!u || !S.isMember(battle, u, 'roundTable')) return;

      skillCastCount++;
      const now = battle.time || 0;

      // 回复技力
      for (const m of members) {
        if (!m.skill) continue;
        m.mem = m.mem || {};
        const lastTime = m.mem._lastResonanceTime ?? -999;
        if (now - lastTime >= 5.0) {
          m.mem._lastResonanceTime = now;
          if (typeof m.skill.gainSp === 'function') {
            m.skill.gainSp(3, 'resonance');
          } else {
            m.skill.sp = Math.min(m.skill.spCost ?? 100, (m.skill.sp || 0) + 3);
          }
          battle.fx?.('resonanceSp', { x: m.x, y: m.y, id: m.id });
        }
      }

      // 首次开启技能叠加 2 层盟约
      u.mem = u.mem || {};
      if (!u.mem._roundTableFirstCast) {
        u.mem._roundTableFirstCast = true;
        S.gainLayers(battle, { playerId: pid, bonds: 'roundTable', n: 2, source: u, reason: 'bond:roundTable' });
      }

      // 检查【圆桌议决】触发
      checkRoundTableDecision();
    });

    // -------------------------------------------------------------------------
    // 6-Piece: 八重拘束解放·白垩城塞
    // -------------------------------------------------------------------------
    const is6Piece = tier >= 2 || members.length >= 6;
    if (is6Piece) {
      for (const u of members) {
        // 获得 1 层护盾 (allowDead: true ensures it exists before step)
        battle.addBuff(u, {
          key: 'bond:roundTable:shield',
          shieldHits: 1,
          visible: true,
          allowDead: true,
          refresh: 'replace'
        });
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
    }

    // 【圆桌议决】状态管理
    const store = S.battleStore(battle, 'roundTable');
    const checkRoundTableDecision = () => {
      if (battle._roundTableDecisionActive) return;
      const is9Piece = tier >= 3 || members.length >= 9;
      if (is9Piece || (is6Piece && (skillCastCount >= 6 || L() >= 120))) {
        battle._roundTableDecisionActive = true;
        store.decisionActive = true;
        battle.fx?.('roundTableDecision', { fullScreen: true });
      }
    };

    // 伤害转化为弱点伤害
    battle.on('hit', (c) => {
      if (battle._roundTableDecisionActive && c.source && S.isMember(battle, c.source, 'roundTable')) {
        weaknessRetype(c.dmg, c.source, c.target);
      }
    }, 5);

    // -------------------------------------------------------------------------
    // 9-Piece: 十三拘束全解放·星之内海
    // -------------------------------------------------------------------------
    const is9Piece = tier >= 3 || members.length >= 9;
    if (is9Piece) {
      // 开局直接激活【圆桌议决】
      battle._roundTableDecisionActive = true;
      store.decisionActive = true;

      for (const u of members) {
        // 初始技力 +20
        if (u.skill) {
          if (typeof u.skill.gainSp === 'function') {
            u.skill.gainSp(20, 'roundTable_t9');
          } else {
            u.skill.sp = Math.min(u.skill.spCost ?? 100, (u.skill.sp || 0) + 20);
          }
        }
        // 技能消耗 -25%
        if (u.skill) {
          u.skill.spCostMul = (u.skill.spCostMul ?? 1) * 0.75;
        }
      }

      // 【星之吐息与止境之枪】：每 22 秒触发一次天际支援
      battle.every?.(22.0, () => {
        // 全场我方恢复 25% 最大生命并补充 1 层护盾
        for (const a of battle.allyUnits) {
          if (!a.alive) continue;
          const heal = (a.s?.maxHp ?? 0) * 0.25;
          battle.heal?.(null, a, heal, { silent: false });
          battle.addBuff(a, {
            key: 'bond:roundTable:skyShield',
            shieldHits: 1,
            visible: true,
            refresh: 'replace'
          });
        }

        // 计算所有存活圆桌干员总攻击力
        let totalAtk = 0;
        for (const m of members) {
          if (m.alive) totalAtk += (m.s?.atk ?? 0);
        }

        // 对全场所有敌人造成 100% 总攻击力真实伤害并晕眩 2.5 秒
        for (const e of battle.enemies) {
          if (!e.alive || e.hidden) continue;
          battle.dealDamage?.(null, e, {
            amount: totalAtk,
            type: 'true',
            canDodge: false,
            tags: ['bond', 'sky_support']
          });
          if (e.alive) {
            battle.applyStatus?.(e, 'stun', { duration: 2.5, source: null });
          }
        }

        battle.fx?.('skySupportBurst', { fullScreen: true });
      });
    }

    // 初始检查议决状态
    checkRoundTableDecision();
  }
}

export function registerMeta(registry) {
  registry.bond?.('roundTable', {
    onRoundStart(ctx) {
      // 检查 25 层军备里程碑补给
      const curLayers = typeof ctx.layers === 'function' ? ctx.layers('roundTable') : (ctx.getLayers?.('roundTable') || 0);
      const lastMilestone = typeof ctx.counter === 'function' ? ctx.counter('roundTable_lastMilestone') : (ctx.getMeta?.('roundTable_lastMilestone') || 0);
      const nextMilestone = Math.floor(curLayers / 25) * 25;

      if (nextMilestone > lastMilestone) {
        if (typeof ctx.setCounter === 'function') ctx.setCounter('roundTable_lastMilestone', nextMilestone);
        else ctx.setMeta?.('roundTable_lastMilestone', nextMilestone);
        const candidates = [
          'chess_item_1_fgo_sqshard_a',
          'chess_item_2_fgo_crestshield_a',
          'chess_item_3_fgo_silverarmor_a'
        ];
        const rng = typeof ctx.rng === 'function' ? ctx.rng() : ((nextMilestone / 25) % candidates.length) / candidates.length;
        const pick = candidates[Math.floor(rng * candidates.length) % candidates.length];
        if (typeof ctx.grantItem === 'function') ctx.grantItem(pick);
        else ctx.addItem?.(pick);
      }
    }
  });
}
