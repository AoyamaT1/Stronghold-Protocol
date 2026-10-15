// mods/ave-mujica/sim/bonds.js — Ave Mujica covenant combat & prep logic
import * as S from '../../support/index.js';
import { installFever } from './fever.js';

const num = S.num;

export function install(battle) {
  // Real Fever system (毋畏遗忘): meter +3 per member damage, ≥50% + skill activation → 20 s team fever.
  // Replaces the homemade "fever buff" that used to live here.
  installFever(battle);

  if (!battle || !Array.isArray(battle.players)) return;
  for (const p of battle.players) {
    const pid = p.playerId;
    if (!S.bondActive(battle, pid, 'aveMujicaShip')) continue;
    const bb = S.buffParams(S.bondRecord('aveMujicaShip'), 'act1autochess_bond_eff_ave_mujica') || {
      base_damage_scale: 1.20,
      damage_scale_per_stack: 0.01,
      sp_cost_ratio: 0.5,
      power_bond_char_cnt: 5
    };

    const members = S.bondMembers(battle, pid, 'aveMujicaShip');
    if (!members.length) continue;

    const L = () => S.bondLayers(battle, pid, 'aveMujicaShip');

    // 3-piece effect: damage dealt multiplier = (base_damage_scale + per_stack * L)
    const applyDamageBuff = () => {
      const mult = num(bb.base_damage_scale, 1.20) + num(bb.damage_scale_per_stack, 0.01) * L();
      for (const u of members) {
        S.passiveBuff(battle, u, 'bond:aveMujica:dmg', { dmgDealtMul: mult });
      }
    };
    applyDamageBuff();

    // Re-apply if layers change
    battle.on('layerGain', (c) => {
      if (c.playerId === pid && c.bondId === 'aveMujicaShip') {
        battle.after(0, applyDamageBuff);
      }
    });

    // 5-piece effect: SP cost halved (the fever-time burst itself is the real Fever system now).
    const bondTier = S.bondTier(battle, pid, 'aveMujicaShip');
    const is5Piece = bondTier >= 2 || members.length >= 5;

    if (is5Piece) {
      for (const u of members) {
        if (u.skill) u.skill.spCostMul = (u.skill.spCostMul ?? 1) * num(bb.sp_cost_ratio, 0.5);
      }
    }

    // Note: 若叶睦 (Mortis: act1autochess_gar_event_selfdead), 丰川祥子 (Oblivionis: act1autochess_gar_event_useskill),
    // and 三角初华 (Dolris: act1autochess_gar_event_allykillenemy) are automatically dispatched by the engine's garrisons/battle.js.
  }
}

export function registerMeta(registry) {
  // Register garrison handler for SERVER_ONCE_GOLD_AND_BOND (Timoris trait)
  registry.garrison?.('SERVER_ONCE_GOLD_AND_BOND', {
    run(ctx) {
      const { bb, bbStr, where } = ctx.source;
      if (bbStr?.conditionkey === 'character_target_inboard' && where !== 'board') return;
      if (bb?.gold) ctx.addPendingFunds?.(num(bb.gold));
      if (bb?.count && bbStr?.bond) {
        ctx.addLayers?.(bbStr.bond, num(bb.count), { requireActive: true });
      }
    }
  });

  registry.bond?.('aveMujicaShip', {
    onRoundStart(ctx) {
      // 八幡海铃 (Timoris) Garrison effect fallback
      const board = ctx.board ? ctx.board().filter((p) => p && p.kind === 'chess') : [];
      const tmoris = board.find((p) => p && (p.id?.includes('tmoris') || p.charId === 'char_4186_tmoris'));
      if (tmoris && !ctx._tmorisGarrisonHandled) {
        const isGolden = ctx.gd?.isGolden?.(tmoris.id) || /_b$/.test(tmoris.id);
        const gold = isGolden ? 2 : 1;
        const layers = isGolden ? 4 : 2;
        ctx.addPendingFunds?.(gold);
        ctx.addLayers?.('aveMujicaShip', layers, { requireActive: true });
      }
    }
  });
}
