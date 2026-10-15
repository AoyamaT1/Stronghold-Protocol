// mods/ave-mujica/sim/kits.js — Skill kits for all Ave Mujica operators and skills
//
// 丰川祥子 (chess_char_6_21_a, char_4182_oblvns, 领主) implements the Plan-B port of the reference mod:
//   S1 新月的苏醒  — 8 drifting arts notes, per-note scales from the bb (65% → 4%), 0.1 s apart, ±angle fan;
//                    2 charges, auto-releases once at full charge (kit tick hook, official skill text).
//   S2 满月的舞会  — timbre switch: 钢琴 (ATK+60%, piercing PHYS notes, fast) / 风琴 (ASPD+80, arts notes, slow).
//                    Mod-side the stance is a 20 s duration window (officially permanent until switched) so the
//                    engine re-cast cycle can flip it; Fever doubles the per-attack note (二连击).
//   S3 残月的余响  — 25 s, range +1 (official 3-21 grid not available in 0.1.0 data); every attack fires 2 piano
//                    PHYS notes homing on the highest-RES enemy and 2 organ ARTS notes homing on the highest-DEF
//                    enemy (official desc: 「分别追踪法术抗性和防御力最高的敌人」); fever undying lives in fever.js.
//   Talent 1 颂乐音符 — continuous notes (notes.js) + per-note pierce stacks.
//   Talent 2 毋畏遗忘 — fever charge (+3/dmg, fever.js) + +12 ASPD aura inside her range (base value on 0.1.0).
import { installFever, feverActive } from './fever.js';
import { installNotes, setPierceConfig, applyAura, fireNote, NOTE_SPEED, PIANO_SPEED, ORGAN_SPEED } from './notes.js';

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

const S1_SCALES_FALLBACK = [0.65, 0.6, 0.49, 0.38, 0.27, 0.22, 0.11, 0.04];

/** Highest-RES / highest-DEF living enemy on the field (S3 cross tracking). */
const extremeEnemy = (battle, stat) => {
  let best = null;
  for (const e of battle.enemies) {
    if (!e.alive || e.hidden) continue;
    if (!best || (e.s?.[stat] || 0) > (best.s?.[stat] || 0)) best = e;
  }
  return best;
};

export default {
  // =========================================================================
  // 1. 祐天寺若麦 (Amoris, Tier 2) — 撼地者
  // =========================================================================
  chess_char_2_20_a: (bb, chess, def) => ({
    skills: {
      // S1: 如焰般热烈
      skchr_amoris_1: {
        kind: 'duration',
        duration: num(bb.duration, 15),
        mods: { atkPct: num(bb.atk, 0.6) },
        attack: {
          hits: 3,
          atkScale: num(bb['attack@atk_scale_heavy'], 2.0),
          splashRadius: 1.5,
          splashScale: 1.0
        },
        onStart({ battle, unit }) {
          battle.fx('explode', { x: unit.x, y: unit.y, id: unit.id, r: 1.5 });
        },
        onAttack({ battle, unit, target }) {
          if (target && target.alive) {
            battle.applyStatus?.(target, 'sluggish', { duration: 1.5, source: unit });
          }
        }
      },
      // S2: 如麦般生长
      skchr_amoris_2: {
        kind: 'duration',
        duration: num(bb.duration, 24),
        targeting: { rangeExtend: 1 },
        attack: {
          hits: 8,
          atkScale: num(bb['attack@atk_scale_heavy'], 2.4),
          splashRadius: 2.0,
          splashScale: 1.0
        },
        onStart({ battle, unit }) {
          battle.fx('sunBurst', { x: unit.x, y: unit.y, id: unit.id, r: 2 });
        },
        onAttack({ battle, unit, target }) {
          if (target && target.alive) {
            battle.applyStatus?.(target, 'sluggish', { duration: 2.0, source: unit });
          }
        }
      }
    },
    // Default fallback
    skill: {
      kind: 'duration',
      duration: num(bb.duration, 15),
      mods: { atkPct: num(bb.atk, 0.6) },
      onAttack({ battle, unit, target }) {
        if (target && target.alive) {
          battle.applyStatus?.(target, 'sluggish', { duration: 1.5, source: unit });
        }
      }
    }
  }),

  // =========================================================================
  // 2. 八幡海铃 (Timoris, Tier 3) — 伏击客
  // =========================================================================
  chess_char_3_22_a: (bb, chess, def) => ({
    skills: {
      // S1: 颤栗之弦
      skchr_tmoris_1: {
        kind: 'instant',
        charges: 2,
        attack: {
          hits: num(bb.times, 3),
          atkScale: num(bb.atk_scale, 1.8),
          dmgType: 'arts'
        },
        onStart({ battle, unit }) {
          battle.fx('burst', { x: unit.x, y: unit.y, id: unit.id });
        },
        onHit({ battle, unit, target }) {
          if (target && target.alive) {
            battle.applyStatus?.(target, 'sluggish', { duration: 2.0, source: unit });
          }
        }
      },
      // S2: 无存之所
      skchr_tmoris_2: {
        kind: 'duration',
        duration: num(bb.duration, 15),
        onStart({ battle, unit }) {
          battle.fx('sonic', { x: unit.x, y: unit.y, id: unit.id, r: 2 });
          // Fear all enemies in range
          for (const e of battle.enemies) {
            if (e.alive && battle.inRange?.(unit, e)) {
              battle.applyStatus?.(e, 'fear', { duration: 1.5, source: unit });
            }
          }
        },
        onTick({ battle, unit }) {
          for (const e of battle.enemies) {
            if (e.alive && battle.inRange?.(unit, e)) {
              battle.dealDamage?.(unit, e, {
                amount: (unit.s?.atk || 500) * num(bb['attack@atk_scale'], 1.0),
                type: 'arts',
                tags: ['skill:tmoris:dot']
              });
              battle.applyStatus?.(e, 'sluggish', { duration: 1.0, source: unit });
            }
          }
        }
      }
    },
    skill: {
      kind: 'instant',
      attack: {
        hits: num(bb.times, 3),
        atkScale: num(bb.atk_scale, 1.8),
        dmgType: 'arts'
      },
      onHit({ battle, unit, target }) {
        if (target && target.alive) {
          battle.applyStatus?.(target, 'sluggish', { duration: 2.0, source: unit });
        }
      }
    },
    trait: {
      install(battle, unit) {
        unit.s.physDodge = (unit.s.physDodge || 0) + 0.5;
        unit.s.artsDodge = (unit.s.artsDodge || 0) + 0.5;
      }
    }
  }),

  // =========================================================================
  // 3. 若叶睦 (Mortis, Tier 4) — 傀儡师
  // =========================================================================
  chess_char_4_27_a: (bb, chess, def) => ({
    skills: {
      // S1: 多首野兽
      skchr_mortis_1: {
        kind: 'duration',
        duration: num(bb.duration, 15),
        mods: {
          defPct: num(bb.def, 0.9),
          blockCnt: num(bb.block_cnt, 1),
          taunt: 1
        },
        onStart({ battle, unit }) {
          battle.fx('shield', { x: unit.x, y: unit.y, id: unit.id });
        },
        onDamaged({ battle, unit, source, amount }) {
          if (source && source.alive && source.side !== unit.side) {
            const reflect = num(bb.reflect, 0.5) * (unit.s?.atk || 800);
            battle.fx('thorns', { x: source.x, y: source.y, id: unit.id, target: source.id });
            battle.dealDamage?.(unit, source, {
              amount: reflect,
              type: 'arts',
              tags: ['reflect', 'skill:mortis']
            });
          }
        }
      },
      // S2: 破坏与滋养
      skchr_mortis_2: {
        kind: 'duration',
        duration: num(bb.duration, 15),
        targeting: { rangeExtend: 1 },
        attack: {
          hits: 3,
          atkScale: num(bb['attack@atk_scale'], 1.5),
          dmgType: 'arts'
        },
        onStart({ battle, unit }) {
          battle.fx('burst', { x: unit.x, y: unit.y, id: unit.id });
        },
        onAttack({ battle, unit }) {
          // Self-recoil
          if (unit.alive && !unit.trait?.doll) {
            battle.dealDamage?.(unit, unit, {
              amount: 50,
              type: 'arts',
              tags: ['skill:mortis:recoil']
            });
          }
        }
      }
    },
    skill: {
      kind: 'duration',
      duration: num(bb.duration, 15),
      mods: {
        defPct: num(bb.def, 0.9),
        blockCnt: num(bb.block_cnt, 1)
      }
    }
  }),

  // =========================================================================
  // 4. 三角初华 (Dolris, Tier 5) — 吟游者
  // =========================================================================
  chess_char_5_24_a: (bb, chess, def) => ({
    skills: {
      // S1: 我思念的
      skchr_dolris_1: {
        kind: 'duration',
        duration: num(bb.duration, 30),
        targeting: { rangeExtend: 1 },
        heal: true,
        onStart({ battle, unit }) {
          battle.fx('blessing', { x: unit.x, y: unit.y, id: unit.id, r: 2 });
          unit._dolrisInspire = 0.70;
        },
        onEnd({ battle, unit }) {
          unit._dolrisInspire = 0;
        }
      },
      // S2: 我悲悯的
      skchr_dolris_2: {
        kind: 'duration',
        duration: num(bb.duration, 12),
        onStart({ battle, unit }) {
          battle.fx('sermon', { x: unit.x, y: unit.y, id: unit.id, r: 1.5 });
          unit._dolrisInspire = 0.75;
        },
        onEnd({ battle, unit }) {
          unit._dolrisInspire = 0;
        },
        onTick({ battle, unit }) {
          // Deal arts damage to random enemy & heal ally
          const enemies = battle.enemies.filter(e => e.alive);
          if (enemies.length) {
            const target = enemies[Math.floor(battle.rng() * enemies.length)];
            battle.dealDamage?.(unit, target, {
              amount: (unit.s?.atk || 400) * num(bb['attack@atk_scale'], 1.7),
              type: 'arts',
              tags: ['skill:dolris:s2']
            });
          }
          const injured = battle.allyUnits.filter(a => a.alive && a.side === unit.side && a.hp < a.maxHp);
          if (injured.length) {
            const ally = injured[0];
            battle.heal?.(unit, ally, { amount: (unit.s?.atk || 400) * 0.7 });
          }
        }
      }
    },
    skill: {
      kind: 'duration',
      duration: num(bb.duration, 30),
      heal: true,
      onStart({ battle, unit }) {
        unit._dolrisInspire = 0.70;
      },
      onEnd({ battle, unit }) {
        unit._dolrisInspire = 0;
      }
    },
    talents: [
      {
        install(battle, unit) {
          battle.on('tick', () => {
            if (!unit.alive) return;
            const boost = (unit.s?.atk || 350) * (unit._dolrisInspire || 0.12);
            for (const ally of battle.allyUnits) {
              if (ally && ally.alive && ally !== unit && ally.side === unit.side) {
                if (ally.hp < ally.maxHp) {
                  battle.heal?.(unit, ally, { amount: boost * 0.2 });
                }
              }
            }
          });
        }
      }
    ]
  }),

  // =========================================================================
  // 5. 丰川祥子 (Oblivionis, Tier 6) — 领主 (Plan-B port)
  // =========================================================================
  chess_char_6_21_a: (bb, chess, def) => {
    // S3 残月的余响 (also the default skill): duration/pool values come from the def (25 s / 47 / 28).
    const s3 = {
      id: 'skchr_oblvns_3',
      kind: 'duration',
      targeting: { rangeExtend: 1 }, // official skill range 3-21; +1 all around on 0.1.0
      onStart({ battle, unit }) {
        battle.fx('sonic', { x: unit.x, y: unit.y, id: unit.id, r: 2 });
      },
      onAttack({ battle, unit }) {
        const scale = num(bb['attack@atk_scale'], 1.55);
        // 钢琴 ×2 物理 → 追踪法术抗性最高; 风琴 ×2 法术 → 追踪防御力最高 (official desc)
        const resTop = extremeEnemy(battle, 'res');
        const defTop = extremeEnemy(battle, 'def');
        for (let i = 0; i < 2; i++) {
          fireNote(battle, unit, { scale, type: 'phys', mode: 'homing', target: resTop, speed: PIANO_SPEED });
          fireNote(battle, unit, { scale, type: 'arts', mode: 'homing', target: defTop, speed: ORGAN_SPEED });
        }
      }
    };

    return {
      skills: {
        // S1 新月的苏醒: 8 drifting arts notes, per-note bb scales, 0.1 s apart, ±angle fan; spCost/initSp/charges
        // from the def (4/0) + spec.charges 2 (data key is maxChargeTime, which the runtime does not read).
        skchr_oblvns_1: {
          id: 'skchr_oblvns_1',
          kind: 'instant',
          charges: 2,
          onStart({ battle, unit }) {
            battle.fx('burst', { x: unit.x, y: unit.y, id: unit.id });
            const scales = S1_SCALES_FALLBACK.map((d, i) => {
              const v = bb[i === 0 ? 'atk_scale' : `atk_scale_${i + 1}`];
              return typeof v === 'number' && Number.isFinite(v) ? v : d;
            });
            const angle = num(bb.angle, 15);
            scales.forEach((scale, i) => battle.after(i * 0.1, () => {
              if (unit.alive && unit.deployed) {
                fireNote(battle, unit, {
                  scale,
                  type: 'arts',
                  mode: 'drift',
                  angleDeg: (battle.rng() * 2 - 1) * angle,
                  speed: NOTE_SPEED
                });
              }
            }, { owner: unit }));
          }
        },
        // S2 满月的舞会: timbre switch. Stance = 20 s window (mod-side; officially permanent until switched) with
        // the bb stat as a stance buff, and a note of the current timbre fired per attack (Fever: ×2 二连击).
        skchr_oblvns_2: {
          id: 'skchr_oblvns_2',
          kind: 'duration',
          duration: 20,
          onStart({ battle, unit }) {
            unit._oblvnsOrgan = !unit._oblvnsOrgan;
            battle.fx(unit._oblvnsOrgan ? 'overclock' : 'buff', { x: unit.x, y: unit.y, id: unit.id });
            battle.removeBuff(unit, 'mujica:sakikoS2');
            battle.addBuff(unit, unit._oblvnsOrgan
              ? { key: 'mujica:sakikoS2', mods: { aspd: num(bb['attack@attack_speed'], 80) }, duration: 20, refresh: 'replace', tags: ['mujica'] }
              : { key: 'mujica:sakikoS2', mods: { atkPct: num(bb['attack@atk'], 0.6) }, duration: 20, refresh: 'replace', tags: ['mujica'] });
          },
          onEnd({ battle, unit }) {
            battle.removeBuff(unit, 'mujica:sakikoS2');
          },
          onAttack({ battle, unit, targets }) {
            const organ = !!unit._oblvnsOrgan;
            const twice = feverActive(battle, unit.ownerId) ? 2 : 1;
            for (let i = 0; i < twice; i++) {
              fireNote(battle, unit, organ
                ? { scale: 1.0, type: 'arts', mode: 'homing', target: targets?.[0], speed: ORGAN_SPEED, visual: 'note' }
                : { scale: 1.0, type: 'phys', mode: 'homing', target: targets?.[0], speed: PIANO_SPEED, passby: true, visual: 'note' });
            }
          }
        },
        skchr_oblvns_3: s3
      },
      skill: s3,
      talents: [
        {
          // Talent 1 颂乐音符 (notes + pierce stacks) + Talent 2 毋畏遗忘 (fever + ASPD aura) + S1 full-charge release.
          install(battle, unit) {
            installNotes(battle);
            installFever(battle);
            setPierceConfig(battle, unit);
            battle.on('tick', () => {
              if (!unit.alive || !unit.deployed) return;
              applyAura(battle, unit, 12); // base value; max-potential +16 lands with the 0.2.2 baseline
              const sk = unit.skill;
              // 「充能至最大层数时自动释放一次」 — direct activate, engine索敌不参与
              if (sk && sk.id === 'skchr_oblvns_1' && !sk.active && !sk.pending &&
                  sk.charges >= sk.maxCharges && unit.canAct && !unit.s.flags.silence) {
                sk.activate('fullCharge');
              }
            });
          }
        }
      ]
    };
  }
};
