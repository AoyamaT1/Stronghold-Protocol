// tools/limbus/update_kits.js
import fs from 'node:fs';

const p = 'mods/limbus-company/sim/kits.js';
let code = fs.readFileSync(p, 'utf8');

// 1. Faust
const faustOld = code.match(/\/\/ 2\. Faust[\s\S]*?\/\/ 3\. Sinclair/)[0];
const faustNew = `// 2. Faust (浮士德 - 黑兽组·卯分支 / 卯兔)
const faustKit = (bb, chess, def) => {
  return {
    skills: {
      skchr_faust_1: {
        kind: 'charges',
        attack: {
          atkScale: num(bb.atk_scale, 1.9),
          onHit({ battle, unit, target }) {
            if (target && target.alive) {
              battle.applyStatus?.(target, 'sluggish', { duration: 1.5, source: unit });
              battle.addBuff(target, {
                key: 'debuff:faust:vuln',
                mods: { takenDmgPct: 0.2 },
                duration: 4.0
              });
            }
            if (unit.mem) {
              unit.mem.limbusSanity = Math.min(45, (unit.mem.limbusSanity || 0) + 10);
            }
            battle.fx?.('faust_mao_leap', { x: target ? target.x : unit.x, y: target ? target.y : unit.y });
          }
        }
      },
      skchr_faust_2: {
        kind: 'duration',
        duration: num(bb.duration, 20),
        mods: { atkPct: num(bb.atk_pct, 0.7), aspd: num(bb.aspd_buff, 50) },
        attack: {
          onHit({ battle, unit, target }) {
            const enemies = battle.enemies.filter(e => e.alive && e !== target);
            let bounced = 0;
            for (const e of enemies) {
              battle.dealDamage(unit, e, { amount: unit.s.atk * 1.2, type: 'magic' });
              battle.applyStatus?.(e, 'stun', { duration: 0.5, source: unit });
              bounced++;
              if (bounced >= 3) break;
            }
            battle.fx?.('faust_thunder_charge', { x: target ? target.x : unit.x, y: target ? target.y : unit.y });
          }
        }
      },
      skchr_faust_3: {
        kind: 'duration',
        duration: num(bb.duration, 18),
        onStart({ battle, unit }) {
          battle.fx?.('faust_mao_shadows', { x: unit.x, y: unit.y, r: 5 });
          const enemies = battle.enemies.filter(e => e.alive);
          for (const e of enemies) {
            battle.addBuff(e, {
              key: 'debuff:faust:shadow_suppress',
              mods: { atkPct: -0.3, moveSpeedFlat: -0.5 },
              duration: 18,
              visible: true
            });
          }
        },
        attack: {
          hits: 3,
          atkScale: 1.0,
          onHit({ battle, unit, target }) {
            if (target && target.alive) {
              battle.dealDamage(unit, target, { amount: unit.s.atk * 0.8, type: 'magic' });
            }
          }
        }
      }
    },
    talents: [
      {
        install(battle, unit) {
          battle.on('tick', () => {
            if (!unit || !unit.alive) return;
            const enemies = battle.enemies.filter(e => e.alive && Math.hypot(e.x - unit.x, e.y - unit.y) <= 3.5);
            for (const e of enemies) {
              if (!e.findBuff?.('debuff:faust:mao_aura')) {
                battle.addBuff(e, {
                  key: 'debuff:faust:mao_aura',
                  mods: { magicTakenPct: 0.18 },
                  duration: 1.0
                });
              }
            }
          }, { owner: unit });
        }
      },
      {
        install(battle, unit) {
          battle.on('beforeDamage', (ev) => {
            if (ev.target && ev.target.chess?.nationId === 'limbus' && ev.target.hp - ev.amount <= 0 && !unit.mem?.faustShadowUsed) {
              unit.mem = unit.mem || {};
              unit.mem.faustShadowUsed = true;
              ev.amount = 0;
              ev.target.hp = Math.floor(ev.target.s.maxHp * 0.2);
              battle.addBuff(ev.target, {
                key: 'buff:faust:shadow_invuln',
                mods: { takenDmgPct: -1.0 },
                duration: 2.0,
                visible: true
              });
              battle.fx?.('faust_shadow_rescue', { x: ev.target.x, y: ev.target.y });
            }
          }, { owner: unit });
        }
      }
    ]
  };
};

// 3. Sinclair`;
code = code.replace(faustOld, faustNew);

// 2. Rodion
const rodionOld = code.match(/\/\/ 4\. Rodion[\s\S]*?\/\/ 5\. Don Quixote/)[0];
const rodionNew = `// 4. Rodion (罗佳 - 脑叶E.G.O::泪水磨砺之剑 / 泪锋)
const rodionKit = (bb, chess, def) => {
  return {
    skills: {
      skchr_rodion_1: {
        kind: 'charges',
        attack: {
          atkScale: num(bb.atk_scale, 2.0),
          onHit({ battle, unit, target }) {
            if (target && target.alive) {
              const lostHp = unit.s.maxHp - unit.hp;
              const trueDmg = Math.floor(lostHp * 0.2);
              if (trueDmg > 0) {
                battle.dealDamage(unit, target, { amount: trueDmg, type: 'real' });
              }
              applyElementDmg(battle, unit, target, 'apoptosis', 80);
            }
            battle.fx?.('rodion_tear_slash', { x: target ? target.x : unit.x, y: target ? target.y : unit.y });
          }
        }
      },
      skchr_rodion_2: {
        kind: 'duration',
        duration: num(bb.duration, 20),
        mods: { atkPct: num(bb.atk_pct, 0.6), defPct: num(bb.def_pct, 0.7) },
        attack: {
          atkScale: 1.0,
          onHit({ battle, unit, target }) {
            if (target && target.alive) {
              battle.addBuff(target, {
                key: 'debuff:rodion:despair_vuln',
                mods: { takenDmgPct: 0.2 },
                duration: 3.0
              });
              applyElementDmg(battle, unit, target, 'apoptosis', 100);
            }
            battle.fx?.('rodion_despair_pierce', { x: target ? target.x : unit.x, y: target ? target.y : unit.y });
          }
        }
      },
      skchr_rodion_3: {
        kind: 'duration',
        duration: num(bb.duration, 25),
        mods: { atkPct: 1.0 },
        onStart({ battle, unit }) {
          unit.s.shield = Math.floor(unit.s.maxHp * num(bb.shield_pct, 0.8));
          battle.fx?.('rodion_knight_barrier', { x: unit.x, y: unit.y, r: 3 });
        },
        attack: {
          atkScale: 1.0,
          onHit({ battle, unit, target }) {
            const enemies = battle.enemies.filter(e => e.alive && Math.hypot(e.x - unit.x, e.y - unit.y) <= 2.5);
            for (const e of enemies) {
              battle.dealDamage(unit, e, { amount: unit.s.atk * 3.2, type: 'magic' });
              unit.hp = Math.min(unit.s.maxHp, unit.hp + unit.s.atk * 3.2 * 0.2);
            }
          }
        }
      }
    },
    talents: [
      {
        install(battle, unit) {
          battle.on('afterDamage', (ev) => {
            if (ev.target === unit && ev.source && ev.source.alive) {
              battle.dealDamage(unit, ev.source, { amount: Math.floor(unit.s.atk * 1.2), type: 'magic' });
              applyElementDmg(battle, unit, ev.source, 'apoptosis', 80);
              battle.fx?.('rodion_tear_counter', { x: ev.source.x, y: ev.source.y });
            }
          }, { owner: unit });
        }
      },
      {
        install(battle, unit) {
          battle.on('tick', () => {
            if (!unit || !unit.alive) return;
            const allies = battle.allies(unit.ownerId).filter(a => a && a.alive && a !== unit && Math.hypot(a.x - unit.x, a.y - unit.y) <= 2);
            for (const a of allies) {
              a.hp = Math.min(a.s.maxHp, a.hp + Math.floor(unit.s.atk * 0.25));
            }
          }, { owner: unit });
        }
      }
    ]
  };
};

// 5. Don Quixote`;
code = code.replace(rodionOld, rodionNew);

// 3. Ryoshu
const ryoshuOld = code.match(/\/\/ 8\. Ryōshū[\s\S]*?\/\/ 9\. Outis/)[0];
const ryoshuNew = `// 8. Ryōshū (良秀 - 小指子辈·蜘蛛巢之刃 / 小指良)
const ryoshuKit = (bb, chess, def) => {
  return {
    skills: {
      skchr_ryoshu_1: {
        kind: 'charges',
        attack: {
          atkScale: num(bb.atk_scale, 1.8),
          onHit({ battle, unit, target }) {
            if (target && target.alive) {
              target.mem = target.mem || {};
              target.mem.bleed = (target.mem.bleed || 0) + 3;
              battle.dealDamage(unit, target, { amount: unit.s.atk * 0.6, type: 'phys' });
            }
            if (unit.mem) {
              unit.mem.limbusSanity = Math.min(45, (unit.mem.limbusSanity || 0) + 5);
            }
            battle.fx?.('ryoshu_tiansha', { x: target ? target.x : unit.x, y: target ? target.y : unit.y });
          }
        }
      },
      skchr_ryoshu_2: {
        kind: 'duration',
        duration: 12,
        mods: { atkPct: num(bb.atk_pct, 0.9), aspd: num(bb.aspd_buff, 60) },
        attack: {
          hits: 3,
          atkScale: 1.0,
          onHit({ battle, unit, target }) {
            if (target && target.alive) {
              battle.dealDamage(unit, target, { amount: unit.s.atk * 0.3, type: 'phys' });
            }
          }
        }
      },
      skchr_ryoshu_3: {
        kind: 'instant',
        onCast({ battle, unit }) {
          const targets = battle.enemies.filter(e => e.alive && Math.hypot(e.x - unit.x, e.y - unit.y) <= 2.2);
          for (const t of targets) {
            for (let i = 0; i < 3; i++) {
              battle.after(i * 0.1, () => {
                if (t && t.alive) {
                  battle.dealDamage(unit, t, { amount: unit.s.atk * 2.2, type: 'real' });
                  battle.applyStatus?.(t, 'stun', { duration: 3.0, source: unit });
                  if (t.hp / t.s.maxHp < 0.3) {
                    battle.dealDamage(unit, t, { amount: t.hp + 9999, type: 'real' });
                  }
                }
              });
            }
          }
          battle.fx?.('ryoshu_echoshear', { x: unit.x, y: unit.y });
        }
      }
    },
    talents: [
      {
        install(battle, unit) {
          unit.mem = unit.mem || {};
          unit.mem.limbusSanity = 45;
          battle.on('beforeDamage', (ev) => {
            if (ev.source === unit && ev.target && (ev.target.mem?.bleed || 0) > 0) {
              ev.amount *= 1.25;
            }
          }, { owner: unit });
        }
      }
    ]
  };
};

// 9. Outis`;
code = code.replace(ryoshuOld, ryoshuNew);

// 4. Gregor
const gregorOld = code.match(/\/\/ 12\. Gregor[\s\S]*?export default/)[0];
const gregorNew = `// 12. Gregor (格里高尔 - 黎明事务所代表)
const gregorKit = (bb, chess, def) => {
  return {
    skills: {
      skchr_gregor_1: {
        kind: 'charges',
        attack: {
          atkScale: num(bb.atk_scale, 2.2),
          onHit({ battle, unit, target }) {
            if (target && target.alive) {
              applyElementDmg(battle, unit, target, 'burn', 150);
              battle.dealDamage(unit, target, { amount: unit.s.atk * 1.5, type: 'magic' });
            }
            battle.fx?.('gregor_dawn_light', { x: target ? target.x : unit.x, y: target ? target.y : unit.y });
          }
        }
      },
      skchr_gregor_2: {
        kind: 'duration',
        duration: 20,
        mods: { atkPct: num(bb.atk_pct, 0.8), defPct: num(bb.def_pct, 0.4) },
        attack: {
          onHit({ battle, unit, target }) {
            const targets = battle.enemies.filter(e => e.alive && Math.hypot(e.x - unit.x, e.y - unit.y) <= 1.8);
            for (const t of targets) {
              battle.dealDamage(unit, t, { amount: unit.s.atk * 0.8, type: 'phys' });
              applyElementDmg(battle, unit, t, 'burn', 100);
            }
          }
        }
      },
      skchr_gregor_3: {
        kind: 'instant',
        onCast({ battle, unit }) {
          const line = battle.enemies.filter(e => e.alive && Math.abs(e.y - unit.y) <= 1 && e.x >= unit.x && e.x <= unit.x + 4);
          for (const t of line) {
            battle.dealDamage(unit, t, { amount: unit.s.atk * 7.5, type: 'phys' });
            battle.dealDamage(unit, t, { amount: unit.s.atk * 3.5, type: 'magic' });
            applyElementDmg(battle, unit, t, 'burn', 300);
          }
          battle.fx?.('gregor_sunset_brand', { x: unit.x, y: unit.y });
        }
      }
    },
    talents: [
      {
        install(battle, unit) {
          battle.on('beforeDamage', (ev) => {
            if (ev.source === unit && ev.target) {
              ev.amount *= 1.3;
            }
          }, { owner: unit });
        }
      },
      {
        install(battle, unit) {
          battle.on('beforeDamage', (ev) => {
            if (ev.target === unit && unit.hp - ev.amount <= 0 && !unit.mem?.dawnRevived) {
              unit.mem = unit.mem || {};
              unit.mem.dawnRevived = true;
              ev.amount = 0;
              unit.hp = Math.floor(unit.s.maxHp * 0.5);
              battle.fx?.('gregor_dawn_fire_sea', { x: unit.x, y: unit.y, r: 3 });
            }
          }, { owner: unit });
        }
      }
    ]
  };
};

export default`;
code = code.replace(gregorOld, gregorNew);

fs.writeFileSync(p, code, 'utf8');
console.log('mods/limbus-company/sim/kits.js successfully updated with 4 new identities');
