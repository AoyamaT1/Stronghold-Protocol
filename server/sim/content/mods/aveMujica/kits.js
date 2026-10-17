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

function withPluginAliases(skills) {
  if (!skills) return skills;
  const out = { ...skills };
  for (const [k, v] of Object.entries(skills)) {
    if (k.startsWith('skchr_')) {
      out[`skx_ave_mujica_${k.slice(6)}`] = v;
    }
  }
  return out;
}

const KITS = {
  // =========================================================================
  // 1. 祐天寺若麦 (Amoris, Tier 2) — 撼地者
  // =========================================================================
  chess_char_2_20_a: (bb, chess, def) => ({
    skills: {
      // S1: 如焰般热烈 (三连击：首击 138% + 溅射，后两次 20%)
      skchr_amoris_1: {
        kind: 'duration',
        duration: num(bb.duration, 15),
        mods: { atkPct: num(bb.atk, 0.6) },
        attack: {
          hits: 3,
          atkScale: num(bb['attack@atk_scale_heavy'], 1.38),
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
      // S2: 如麦般生长 (八连击：第一、五次 107%，其余 10%)
      skchr_amoris_2: {
        kind: 'duration',
        duration: num(bb.duration, 24),
        targeting: { rangeExtend: 1 },
        attack: {
          hits: 8,
          atkScale: num(bb['attack@atk_scale_heavy'], 1.07),
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
    },
    talents: [
      {
        install(battle, unit) {
          // 节奏共振：攻击被阻挡的敌人时攻击力+15%
          battle.on('hit', (c) => {
            if (c.source === unit && c.target && c.target.blockedBy) {
              c.dmg.mul *= (1 + num(bb.atk, 0.15));
            }
          }, { owner: unit });
        }
      }
    ]
  }),

  // =========================================================================
  // 2. 八幡海铃 (Timoris, Tier 3) — 伏击客
  // =========================================================================
  chess_char_3_22_a: (bb, chess, def) => ({
    skills: {
      // S1: 颤栗之弦 (5连击法术伤害，每击 61%)
      skchr_tmoris_1: {
        kind: 'instant',
        charges: 2,
        attack: {
          hits: num(bb.times, 5),
          atkScale: num(bb.atk_scale, 0.61),
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
      // S2: 无存之所 (恐惧1.5s，每秒对范围内敌人造成78%法术伤害)
      skchr_tmoris_2: {
        kind: 'duration',
        duration: num(bb.duration, 15),
        onStart({ battle, unit }) {
          battle.fx('sonic', { x: unit.x, y: unit.y, id: unit.id, r: 2 });
          unit.mem._tmorisS2Dt = 0;
          // Fear all enemies in range
          for (const e of battle.enemies) {
            if (e.alive && battle.inRange?.(unit, e)) {
              battle.applyStatus?.(e, 'fear', { duration: num(bb.fear, 1.5), source: unit });
            }
          }
        },
        onTick({ battle, unit, dt }) {
          unit.mem._tmorisS2Dt = (unit.mem._tmorisS2Dt || 0) + (dt || 0.033);
          const iv = num(bb['attack@interval'], 1.0);
          if (unit.mem._tmorisS2Dt >= iv) {
            unit.mem._tmorisS2Dt -= iv;
            const scale = num(bb['attack@atk_scale'], 0.78);
            for (const e of battle.enemies) {
              if (e.alive && battle.inRange?.(unit, e)) {
                battle.dealDamage?.(unit, e, {
                  amount: (unit.s?.atk || 680) * scale,
                  type: 'arts',
                  tags: ['skill:tmoris:dot']
                });
                battle.applyStatus?.(e, 'sluggish', { duration: 1.0, source: unit });
              }
            }
          }
        }
      }
    },
    skill: {
      kind: 'instant',
      attack: {
        hits: num(bb.times, 5),
        atkScale: num(bb.atk_scale, 0.61),
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
    },
    talents: [
      {
        install(battle, unit) {
          // 精准雇佣：自身获得15%的物理闪避
          unit.s.physDodge = (unit.s.physDodge || 0) + num(bb.dodge, 0.15);
        }
      }
    ],
    install(battle, unit) {
      // 其他Ave Mujica成员开启技能时，额外释放一次 S1
      battle.on('skillStart', (c) => {
        if (c.unit !== unit && c.unit?.side === unit.side && (c.unit?.def?.raw?.nationId === 'aveMujica' || c.unit?.bonds?.includes('aveMujicaShip'))) {
          if (unit.alive && unit.deployed && unit.canAct) {
            const sk = unit.skill;
            if (sk && (sk.id === 'skchr_tmoris_1' || sk.id === 'skx_ave_mujica_tmoris_1') && !sk.active) {
              sk.activate('allySkill');
            }
          }
        }
      }, { owner: unit });
    }
  }),

  // =========================================================================
  // 3. 若叶睦 (Mortis, Tier 4) — 傀儡师
  // =========================================================================
  chess_char_4_27_a: (bb, chess, def) => ({
    skills: {
      // S1: 多首野兽 (防御力+65%，阻挡数+2，嘲讽)
      skchr_mortis_1: {
        kind: 'duration',
        duration: num(bb.duration, 14),
        mods: {
          defPct: num(bb.def, 0.65),
          blockCnt: num(bb.block_cnt, 2),
          taunt: num(bb.taunt_level, 1)
        },
        onStart({ battle, unit }) {
          battle.fx('shield', { x: unit.x, y: unit.y, id: unit.id });
        }
      },
      // S2: 破坏与滋养 (攻击范围扩大，三连发，每发75%法伤，自伤20点)
      skchr_mortis_2: {
        kind: 'duration',
        duration: num(bb.duration, 15),
        targeting: { rangeExtend: 1 },
        attack: {
          hits: 3,
          atkScale: num(bb['attack@atk_scale'], 0.75),
          dmgType: 'arts'
        },
        onStart({ battle, unit }) {
          battle.fx('burst', { x: unit.x, y: unit.y, id: unit.id });
        },
        onAttack({ battle, unit }) {
          // Self-recoil 20 arts damage
          if (unit.alive && !unit.trait?.doll) {
            battle.dealDamage?.(unit, unit, {
              amount: num(bb.value, 20),
              type: 'arts',
              tags: ['skill:mortis:recoil']
            });
          }
        }
      }
    },
    skill: {
      kind: 'duration',
      duration: num(bb.duration, 14),
      mods: {
        defPct: num(bb.def, 0.65),
        blockCnt: num(bb.block_cnt, 2),
        taunt: num(bb.taunt_level, 1)
      },
      onStart({ battle, unit }) {
        battle.fx('shield', { x: unit.x, y: unit.y, id: unit.id });
      }
    },
    talents: [
      {
        install(battle, unit) {
          // 另一个“她”：替身作战期间攻击力+15%
          battle.on('hit', (c) => {
            if (c.source === unit && unit.trait?.doll) {
              c.dmg.mul *= (1 + num(bb.atk, 0.15));
            }
          }, { owner: unit });
        }
      }
    ]
  }),

  // =========================================================================
  // 4. 三角初华 (Dolris, Tier 5) — 吟游者
  // =========================================================================
  chess_char_5_24_a: (bb, chess, def) => ({
    skills: {
      // S1: 我思念的 (攻击范围扩大，鼓舞30%攻防，受击治疗64/65)
      skchr_dolris_1: {
        kind: 'duration',
        duration: num(bb.duration, 30),
        targeting: { rangeExtend: 1 },
        heal: true,
        onStart({ battle, unit }) {
          battle.fx('blessing', { x: unit.x, y: unit.y, id: unit.id, r: 2 });
          unit._dolrisInspireAtk = num(bb['attack@atk'], 0.3);
          unit._dolrisInspireDef = num(bb['attack@def'], 0.3);
        },
        onEnd({ battle, unit }) {
          unit._dolrisInspireAtk = 0;
          unit._dolrisInspireDef = 0;
        }
      },
      // S2: 我悲悯的 (特性停疗，每0.3秒70%法伤+15%治疗，鼓舞80%攻)
      skchr_dolris_2: {
        kind: 'duration',
        duration: num(bb.duration, 12),
        onStart({ battle, unit }) {
          battle.fx('sermon', { x: unit.x, y: unit.y, id: unit.id, r: 1.5 });
          unit._dolrisInspireAtk = num(bb['attack@atk'], 0.8);
          unit._dolrisInspireDef = 0;
          unit.mem._dolrisS2Acc = 0;
        },
        onEnd({ battle, unit }) {
          unit._dolrisInspireAtk = 0;
          unit._dolrisInspireDef = 0;
        },
        onTick({ battle, unit, dt }) {
          unit.mem._dolrisS2Acc = (unit.mem._dolrisS2Acc || 0) + (dt || 0.033);
          const iv = Math.max(0.1, num(bb.interval, 0.3));
          while (unit.mem._dolrisS2Acc >= iv) {
            unit.mem._dolrisS2Acc -= iv;
            const inRange = battle.enemies.filter(e => e.alive && battle.inRange?.(unit, e));
            if (inRange.length) {
              const target = inRange[Math.floor(battle.rng() * inRange.length)];
              battle.dealDamage?.(unit, target, {
                amount: (unit.s?.atk || 290) * num(bb['attack@atk_scale'], 0.7),
                type: 'arts',
                tags: ['skill:dolris:s2']
              });
            }
            const alliesInRange = battle.allyUnits.filter(a => a.alive && a.side === unit.side && battle.inRange?.(unit, a));
            if (alliesInRange.length) {
              const injured = alliesInRange.filter(a => a.hp < a.maxHp);
              const target = injured.length ? injured[0] : alliesInRange[0];
              battle.heal?.(unit, target, (unit.s?.atk || 290) * num(bb['attack@heal_scale'], 0.15));
            }
          }
        }
      }
    },
    skill: {
      kind: 'duration',
      duration: num(bb.duration, 30),
      targeting: { rangeExtend: 1 },
      heal: true,
      onStart({ battle, unit }) {
        battle.fx('blessing', { x: unit.x, y: unit.y, id: unit.id, r: 2 });
        unit._dolrisInspireAtk = num(bb['attack@atk'], 0.3);
        unit._dolrisInspireDef = num(bb['attack@def'], 0.3);
      },
      onEnd({ battle, unit }) {
        unit._dolrisInspireAtk = 0;
        unit._dolrisInspireDef = 0;
      }
    },
    talents: [
      {
        install(battle, unit) {
          // Trait (10% ATK/s heal) + Inspire aura (1s interval)
          battle.every(1.0, () => {
            if (!unit.alive || !unit.deployed) return;
            const isS2 = unit.skill?.active && (unit.skill?.id === 'skchr_dolris_2' || unit.skill?.id === 'skx_ave_mujica_dolris_2');
            const atkInspire = (unit.s?.atk || 290) * (unit._dolrisInspireAtk || 0);
            const defInspire = (unit.s?.def || 220) * (unit._dolrisInspireDef || 0);
            const traitHeal = isS2 ? 0 : (unit.s?.atk || 290) * 0.10;

            for (const ally of battle.allyUnits) {
              if (!ally || !ally.alive || ally === unit || ally.side !== unit.side) continue;
              if (!battle.inRange?.(unit, ally)) continue;

              // Inspire buff
              if (atkInspire > 0 || defInspire > 0) {
                battle.addBuff(ally, {
                  key: `dolris:inspire:${unit.id}`,
                  duration: 1.2,
                  refresh: 'replace',
                  source: unit,
                  mods: { atkFlat: atkInspire, defFlat: defInspire }
                });
              }
              // Trait heal (continuous 10% ATK/s)
              if (traitHeal > 0 && ally.hp < ally.maxHp) {
                battle.heal?.(unit, ally, traitHeal);
              }
              // Talent: physical damage reduction 10%
              battle.addBuff(ally, {
                key: `dolris:talent:${unit.id}`,
                duration: 1.2,
                refresh: 'replace',
                source: unit,
                mods: { physTakenMul: 0.9 }
              });
            }
          }, { owner: unit });

          // S1 on damaged: heal 64/65 HP
          battle.on('damaged', (c) => {
            if (!unit.alive || !unit.skill?.active) return;
            const skId = unit.skill?.id;
            if (skId !== 'skchr_dolris_1' && skId !== 'skx_ave_mujica_dolris_1') return;
            const t = c.target;
            if (t && t.alive && t.side === unit.side && battle.inRange?.(unit, t)) {
              const healVal = num(bb['attack@heal_value_s1'], 65);
              battle.heal?.(unit, t, healVal);
            }
          }, { owner: unit });
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
              if (sk && (sk.id === 'skchr_oblvns_1' || sk.id === 'skx_ave_mujica_oblvns_1') && !sk.active && !sk.pending &&
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

export default Object.fromEntries(
  Object.entries(KITS).map(([k, fn]) => [
    k,
    (bb, chess, def) => {
      const res = fn(bb, chess, def);
      if (res && res.skills) res.skills = withPluginAliases(res.skills);
      return res;
    }
  ])
);

