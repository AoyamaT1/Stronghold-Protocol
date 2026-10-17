// mods/limbus-company/sim/kits.js — Skill kits for all 12 Limbus Company Sinners
import { installStacks } from './stacks.js';

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function applyElementDmg(battle, src, target, el, amount) {
  if (!target || !target.alive || !(amount > 0)) return;
  // 【灼燃】伤害提升：携带有效增伤窗口的来源（格里高尔技能给全体友方上的）其灼燃伤害放大
  if (el === 'burn' && src && src.mem && src.mem.burnBoostUntil > (battle.time || 0)) {
    amount *= (src.mem.burnBoostMul || 1);
  }
  battle.dealDamage(src, target, { amount, type: 'element', element: el });
}

// 1. Yi Sang (李箱 - 绽放E.G.O::山茶花)
const yisangKit = (bb, chess, def) => {
  const tb = (chess.trait && chess.trait.bb) || {};
  const addOsc = (unit, n) => { unit.mem = unit.mem || {}; unit.mem.oscillation = Math.min(10, (unit.mem.oscillation || 0) + n); };
  const lowestSanityAlly = (battle, unit) => {
    const list = (battle.allies?.(unit.ownerId) || []).filter(
      (a) => a && a.alive && (a.def?.raw?.nationId === 'limbus' || a.def?.nationId === 'limbus') && typeof a.mem?.limbusSanity === 'number' && !a.mem?.negSanityPersona);
    let low = null, min = Infinity;
    for (const a of list) if (a.mem.limbusSanity < min) { min = a.mem.limbusSanity; low = a; }
    return low;
  };
  // 凋亡铺核；detonate=true 且目标凋亡槽够高时，补一发填满 → 触发引擎的凋亡爆发
  const sink = (battle, unit, target, ep, detonate = false) => {
    if (!target || !target.alive || !(ep > 0)) return;
    applyElementDmg(battle, unit, target, 'apoptosis', ep);
    battle.fx?.('mote', { x: target.x, y: target.y, id: target.id, element: 'apoptosis' });
    if (detonate && (target.elem?.apoptosis || 0) >= num(tb.burst_gauge_req, 400)) {
      applyElementDmg(battle, unit, target, 'apoptosis', (target.gaugeMax || 1000));
      battle.fx?.('aoe', { x: target.x, y: target.y, id: target.id, element: 'apoptosis', r: num(bb.burst_radius, 1.5) });
    }
  };
  return {
    skills: {
      // 萌生花蕾（AUTO 充能）：攻击力↑、开启得3层神经损伤、命中额外叠凋亡
      skchr_yisang_1: {
        kind: 'charges',
        onStart({ unit }) { addOsc(unit, num(bb.osc_on_start, 3)); },
        attack: {
          atkScale: num(bb.atk_scale, 1.6),
          onHit({ battle, unit, target }) {
            sink(battle, unit, target, num(bb.ep_damage, 120));
            battle.fx?.('aoe', { x: target ? target.x : unit.x, y: target ? target.y : unit.y, element: 'apoptosis', r: 0.5 });
          }
        }
      },
      // 刹那花风：够6层→消耗6、攻击目标+2；不足→不消耗、改为得2层
      skchr_yisang_2: {
        kind: 'duration',
        duration: num(bb.duration, 15),
        onStart({ battle, unit }) {
          unit.mem = unit.mem || {};
          const need = num(bb.req_oscillation, 6);
          if ((unit.mem.oscillation || 0) >= need) {
            unit.mem.oscillation -= need;
            battle.addBuff(unit, { key: 'yisang:s2targets', duration: num(bb.duration, 15), mods: { maxTargets: num(bb.extra_targets, 2) }, refresh: 'replace', tags: ['skill'], visible: true });
          } else { addOsc(unit, num(bb.gain_if_short, 2)); }
          battle.fx?.('buff', { x: unit.x, y: unit.y, id: unit.id });
        },
        attack: {
          atkScale: num(bb.atk_scale_per_hit, 0.7),
          onHit({ battle, unit, target }) { sink(battle, unit, target, num(bb.ep_damage, 60)); }
        }
      },
      // 血染芬芳：攻击力↑、开启失20精神并得6神经损伤；命中大额凋亡并到阈值引爆；
      // 神经损伤≥10时额外造成本次伤害40%；技能期间在范围边缘循环显示凋亡色灯带
      skchr_yisang_3: {
        kind: 'duration',
        duration: num(bb.duration, 20),
        mods: { atkPct: num(bb.atk_bonus, 1.2) },
        onStart({ battle, unit }) {
          unit.mem = unit.mem || {};
          if (typeof unit.mem.limbusSanity === 'number') unit.mem.limbusSanity = Math.max(-45, unit.mem.limbusSanity - num(bb.sanity_loss, 20));
          addOsc(unit, 6);
          unit.mem._yiS3 = (unit.mem._yiS3 || 0) + 1;
          const token = unit.mem._yiS3, r = num(bb.range_r, 2.4);
          const band = () => {   // 范围边缘循环灯带：keyed 持续 zone，原地刷新、凋亡色脉动，技能结束即停
            if (!unit.alive || unit.mem._yiS3 !== token) return;
            battle.fx?.('zone', { id: unit.id, r, dur: 0.9, key: `yisang:s3:${unit.id}`, element: 'apoptosis' });
            battle.after?.(0.6, band);
          };
          band();
        },
        onEnd({ unit }) { if (unit.mem) unit.mem._yiS3 = (unit.mem._yiS3 || 0) + 1; },
        attack: {
          atkScale: 1.0,
          onHit({ battle, unit, target }) {
            sink(battle, unit, target, num(bb.dot_ep_damage, 150), true);
            if (target && target.alive && (unit.mem?.oscillation || 0) >= num(bb.osc_threshold, 10)) {
              battle.dealDamage(unit, target, { amount: unit.s.atk * num(bb.extra_dmg_ratio, 0.4), type: 'arts' });
            }
          }
        }
      }
    },
    talents: [
      {
        // 特性：平A造成法术伤害（引擎默认）→ 对目标叠凋亡 + 给精神值最低的边狱友方续精神
        // 盛放：同时命中≥2敌人 → 本次攻击伤害×1.3
        install(battle, unit) {
          battle.on('beforeAttack', (ctx) => {
            if (ctx.attacker !== unit) return;
            unit.mem = unit.mem || {};
            unit.mem._yiMulti = (ctx.targets?.length || 0) >= 2;
          }, { owner: unit });
          battle.on('hit', (ev) => {
            if (ev.source === unit && unit.mem?._yiMulti) ev.dmg.mul *= num(tb.bloom_mul, 1.3);
          }, { owner: unit });
          battle.on('damaged', (ev) => {
            if (ev.source !== unit || ev.type === 'element' || !unit.alive) return;
            sink(battle, unit, ev.target, num(tb.ep, 60));
            const low = lowestSanityAlly(battle, unit);
            if (low) { low.mem.limbusSanity = Math.min(45, low.mem.limbusSanity + num(tb.sanity_feed, 2)); battle.fx?.('spGift', { x: low.x, y: low.y, id: low.id }); }
          }, { owner: unit });
        }
      },
      {
        // 刺鼻春风：同时命中≥2敌人 → 使理智最低的 1 名友方攻击力+10%，持续10秒
        install(battle, unit) {
          battle.on('beforeAttack', (ctx) => {
            if (ctx.attacker !== unit || (ctx.targets?.length || 0) < 2) return;
            const low = lowestSanityAlly(battle, unit);
            if (low) battle.addBuff(low, { key: 'yisang:springAtk', duration: 10, mods: { atkPct: 0.10 }, refresh: 'replace', source: unit, visible: true });
          }, { owner: unit });
        }
      }
    ]
  };
};

// 2. Faust (浮士德 - 黑兽组·卯分支 / 卯兔)
// 2. Faust (浮士德 - W公司2级清扫人员)：【充能】电池/控场——攒充能，倾泻为束缚/脆弱/麻痹
const faustKit = (bb, chess, def) => {
  const sbb = (id) => (chess?.skills?.find((s) => s.skillId === id)?.bb) || {};   // 逐技能读各自 bb（kit 契约 §2）
  const t0 = (chess?.talents?.[0]?.bb) || {};
  const b1 = sbb('skchr_faust_1'), b2 = sbb('skchr_faust_2'), b3 = sbb('skchr_faust_3');
  const CAP = num(t0.cap, 10);
  const charge = (unit, n) => { unit.mem = unit.mem || {}; unit.mem.wcharge = Math.max(0, Math.min(CAP, (unit.mem.wcharge || 0) + n)); };
  return {
    skills: {
      // 能源循环：发电（使用 +2、命中 +2）
      skchr_faust_1: {
        kind: 'charges',
        onStart({ unit }) { charge(unit, num(b1.charge, 2)); },
        attack: {
          atkScale: num(b1.atk_scale, 2.0),
          onHit({ battle, unit, target }) {
            charge(unit, num(b1.charge, 2));
            battle.fx?.('faust_energy', { x: target ? target.x : unit.x, y: target ? target.y : unit.y, id: unit.id });
          }
        }
      },
      // 跃迁：发电（使用 +3、命中 +3）；命中若【充能】≥3，消耗 3 层使目标【束缚】
      skchr_faust_2: {
        kind: 'charges',
        onStart({ unit }) { charge(unit, num(b2.charge, 3)); },
        attack: {
          atkScale: num(b2.atk_scale, 2.4),
          onHit({ battle, unit, target }) {
            charge(unit, num(b2.charge, 3));
            const cost = num(b2.bind_cost, 3);
            if (target && target.alive && (unit.mem?.wcharge || 0) >= cost) {
              unit.mem.wcharge -= cost;
              battle.applyStatus?.(target, 'bind', { duration: num(b2.bind_dur, 2.5), source: unit });
              battle.fx?.('faust_leap', { x: target.x, y: target.y });
            }
          }
        }
      },
      // 过度充能：【充能】≥5 时本技能攻击力提升；命中消耗 5 层→【脆弱】+【麻痹】；可对空
      skchr_faust_3: {
        kind: 'charges',
        attack: {
          canHitFly: true,
          atkScale: num(b3.atk_scale, 2.6),
          dmgMul({ unit }) { return (unit.mem?.wcharge || 0) >= num(b3.overcharge_cost, 5) ? num(b3.overcharge_mul, 1.4) : 1; },
          onHit({ battle, unit, target }) {
            if (!target || !target.alive) return;
            const cost = num(b3.overcharge_cost, 5);
            if ((unit.mem?.wcharge || 0) >= cost) {
              unit.mem.wcharge -= cost;
              battle.addBuff(target, { key: 'debuff:faust:fragile', mods: { dmgTakenMul: 1 + num(b3.fragile, 0.2) }, duration: num(b3.fragile_dur, 4), visible: true, source: unit });
              battle.applyStatus?.(target, 'palsy', { value: num(b3.palsy, 2), duration: num(b3.palsy_dur, 8), source: unit });  // 麻痹：抵消若干次普攻（引爆=麻痹）
              battle.fx?.('faust_overcharge', { x: target.x, y: target.y, id: unit.id });
            }
          }
        }
      }
    },
    talents: [
      {
        // 充能回路：部署后立即获得 2 层【充能】
        install(battle, unit) {
          unit.mem = unit.mem || {};
          unit.mem.wcharge = Math.max(unit.mem.wcharge || 0, num(t0.init_charge, 2));
        }
      },
      {
        // W公司清扫协议：相邻【边狱公司】友方技力消耗 -1（实现见 installTraits 的 faust 分支）
        install() {}
      }
    ]
  };
};

// 3. Sinclair (辛克莱 - 握紧之钉)：强化一击 / 双段执行 / 三次净化；负精神、狂信与灼燃-流血联动
const sinclairKit = (bb, chess, def) => {
  const sbb = (id) => {
    if (chess?.skill?.skillId === id) return chess.skill.bb || bb;
    return (chess?.allSkills || chess?.skills || []).find((s) => s.skillId === id)?.bb || {};
  };
  const b1 = sbb('skchr_sinclair_1'), b2 = sbb('skchr_sinclair_2'), b3 = sbb('skchr_sinclair_3');
  const t0 = chess?.talents?.[0]?.bb || {}, t1 = chess?.talents?.[1]?.bb || {}, trb = chess?.trait?.bb || {};
  const FAN_PER = Math.max(1, num(t0.per, 15)), FAN_MAX = Math.max(0, num(t0.max, 3));
  const BLEED_MAX = Math.max(0, num(trb.bleed_max, 10));
  let lastSanity = null, lostSanity = 0, negative = false;
  let s1Hit = false, killsBeforeAttack = 0, s3Attack = false, killRushReady = false;

  const addFanatic = (battle, unit, amount) => {
    const old = unit.mem.fanatic || 0;
    const n = Math.max(0, Math.min(FAN_MAX, old + amount));
    if (n === old) return;
    unit.mem.fanatic = n;
    battle.addBuff(unit, { key: 'sinclair:fanatic', mods: { atkPct: num(t0.atk, 0.08) * n }, persist: true, allowDead: true, visible: true });
  };
  const syncSanity = (battle, unit) => {
    const sanity = num(unit.mem.limbusSanity, 0);
    if (lastSanity != null && sanity < lastSanity) {
      lostSanity += lastSanity - sanity;
      const gain = Math.floor(lostSanity / FAN_PER);
      lostSanity -= gain * FAN_PER;
      if (gain > 0) addFanatic(battle, unit, gain);
    }
    lastSanity = sanity;
    const neg = sanity < 0;
    if (neg === negative) return;
    negative = neg;
    if (neg) battle.addBuff(unit, { key: 'sinclair:fervor', mods: { aspd: num(t1.neg_aspd, 35) }, persist: true, allowDead: true, visible: true });
    else battle.removeBuff(unit, 'sinclair:fervor');
  };
  const loseSanity = (battle, unit, amount) => {
    syncSanity(battle, unit);
    unit.mem.limbusSanity = Math.max(-45, num(unit.mem.limbusSanity, 0) - Math.max(0, amount));
    syncSanity(battle, unit); // 只计实际损失；已经 -45 时不能凭空叠狂信
  };
  const rupture = (battle, unit, target, ctx) => {
    if (!(ctx.dealt > 0) || !target?.alive) return;
    const n = Math.min(BLEED_MAX, Math.max(0, num(target.mem?.bleed, 0)));
    if (n > 0) battle.dealDamage(unit, target, {
      amount: unit.s.atk * num(trb.bleed_ratio, 0.12) * n, type: 'phys', isSkill: !!ctx.isSkill,
      tags: ['sinclair:bleed', 'addition']
    });
  };

  return {
    trait: {
      allInRange: num(trb.all_in_range, 1) > 0, attack: 'melee', dmgType: 'phys', canHitFly: false,
      afterHit: rupture,
      afterAttack(battle, unit) {
        battle.removeBuff(unit, 'sinclair:killrush');
        // 本次所有目标结算完才发奖励；不会强化同一击的后续目标，也不重复叠加。
        killRushReady = unit.alive && s3Attack && unit.stats.kills > killsBeforeAttack;
        if (killRushReady) battle.fx?.('bloodBattle', { id: unit.id });
      }
    },
    skills: {
      // 攻击回复，强化下一击；临时 atkPct 由引擎在该次攻击后移除，不是持续姿态。
      skchr_sinclair_1: {
        id: 'skchr_sinclair_1', kind: 'charges', duration: 0,
        mods: { atkPct: num(b1.atk_pct, 0.6) },
        onStart({ battle, unit }) {
          s1Hit = false;
          loseSanity(battle, unit, num(b1.sanity, 7));
          battle.fx?.('ignite', { id: unit.id });
        },
        attack: {
          onEachHit({ battle, unit, target, dealt }) {
            if (!(dealt > 0)) return;
            s1Hit = true;
            applyElementDmg(battle, unit, target, 'burn', num(b1.burn, 120));
            battle.fx?.('scorchBurst', { x: target.x, y: target.y, id: target.id, r: 0.5 });
          }
        },
        onAttack({ battle, unit }) {
          if (s1Hit) addFanatic(battle, unit, num(b1.fanatic, 1)); // 群攻也只奖励一层
          s1Hit = false;
        }
      },
      // 一次双段斩；灼燃/流血按目标结算一次，而非复制一个持续增益窗口。
      skchr_sinclair_2: {
        id: 'skchr_sinclair_2', kind: 'instant', duration: 0,
        mods: { atkPct: num(b2.atk_pct, 0.9) },
        onStart({ battle, unit }) {
          loseSanity(battle, unit, num(b2.sanity, 10));
          battle.fx?.('sword', { id: unit.id });
        },
        attack: {
          hits: Math.max(1, Math.floor(num(b2.hits, 2))),
          onEachHit({ battle, unit, target, dealt }) {
            if (!(dealt > 0)) return;
            if (target.alive) {
              const old = num(target.mem.bleed, 0);
              target.mem.bleed = Math.max(old, Math.min(BLEED_MAX, old + num(b2.bleed, 1)));
              applyElementDmg(battle, unit, target, 'burn', num(b2.burn, 240));
            }
            battle.fx?.('slash', { x: target.x, y: target.y, id: target.id });
          }
        }
      },
      // 次数制：接下来三次攻击强化，耗尽即结束；空场/控制不吞攻击次数。
      skchr_sinclair_3: {
        id: 'skchr_sinclair_3', kind: 'ammo', ammo: Math.max(1, Math.floor(num(b3.attacks, 3))), duration: 0,
        mods: { atkPct: num(b3.atk_pct, 1.5) },
        onStart({ battle, unit }) {
          loseSanity(battle, unit, num(b3.sanity, 15));
          battle.fx?.('bloodBattle', { id: unit.id });
        },
        attack: {
          onEachHit({ battle, unit, target, dealt }) {
            if (!(dealt > 0)) return;
            const ignite = num(target.mem?.bleed, 0) >= num(b3.bleed_req, 5);
            applyElementDmg(battle, unit, target, 'burn', num(b3.burn, 360) + (ignite ? num(b3.bleed_bonus_burn, 840) : 0));
            battle.fx?.(ignite ? 'meltdown' : 'scorchBurst', { x: target.x, y: target.y, id: target.id, r: ignite ? 0.9 : 0.5 });
          }
        }
      }
    },
    install(battle, unit) {
      unit.mem.limbusSanity ??= 0;
      unit.mem.fanatic ??= 0;
      battle.addBuff(unit, { key: 'sinclair:selfdestruct', mods: { atkPct: num(t1.atk, 0.18) }, persist: true, allowDead: true });
      syncSanity(battle, unit);
      battle.on('tick', () => { if (unit.alive && unit.deployed) syncSanity(battle, unit); }, { owner: unit });
      battle.on('beforeAttack', (ev) => {
        if (ev.attacker !== unit || !unit.alive) return;
        syncSanity(battle, unit);
        battle.removeBuff(unit, 'sinclair:killrush');   // 上一击被中断时没消费掉的残留先清掉，避免永久 +20%
        killsBeforeAttack = unit.stats.kills;
        s3Attack = ev.isSkill && unit.skill?.id === 'skchr_sinclair_3';
        if (killRushReady) { killRushReady = false; battle.addBuff(unit, { key: 'sinclair:killrush', mods: { atkPct: num(b3.kill_atk, 0.2) } }); }
      }, { owner: unit });
      // 狂信只放大本技能物理伤害；走 DamageInfo.mul，防御之后结算，不污染普攻/元素槽。
      battle.on('hit', (ev) => {
        if (ev.source !== unit || !unit.alive || !unit.skill?.active || !(unit.mem.fanatic > 0)) return;
        if (!ev.dmg.isSkill || ev.dmg.type !== 'phys' || (!ev.dmg.isAttack && !ev.dmg.tags?.includes('sinclair:bleed'))) return;
        const bonus = unit.skill.id === 'skchr_sinclair_2' ? num(b2.fanatic_dmg, 0.1)
          : unit.skill.id === 'skchr_sinclair_3' ? num(b3.fanatic_dmg, 0.15) : 0;
        ev.dmg.mul *= 1 + bonus;
      }, { owner: unit });
      battle.on('death', (ev) => {
        if (ev.unit === unit) { killRushReady = false; s1Hit = false; s3Attack = false; }
      }, { owner: unit });
    }
  };
};

// 4. Rodion (罗佳 - 泪水磨砺之剑 / 泪锋)：负理智人格「玻璃大炮」+ 消耗精神给全队护盾。
//    深泪(S1攒·S2/S3耗)、泪锋(负精神→攻)、守护之剑(护盾事件→攻)、攻击附凋亡损伤。数值全读 bb（§5：仅本块自洽，不碰共享助手）。
const rodionKit = (bb, chess, def) => {
  const trb = (chess.trait && chess.trait.bb) || {};
  const tbb = (i) => (chess.talents && chess.talents[i] && chess.talents[i].bb) || {};
  const sbb = (id) => { const a = chess.allSkills || chess.skills || []; const s = a.find((x) => (x.skillId || x.id) === id); return (s && s.bb) || {}; };
  const g0 = tbb(0), g1 = tbb(1), s1 = sbb('skchr_rodion_1'), s2 = sbb('skchr_rodion_2'), s3 = sbb('skchr_rodion_3');
  const EP = num(g0.ep_per_level, 100), DEEP_CAP = num(s1.deep_cap, 20);
  const apoLv = (t) => Math.floor(((t && t.elem && t.elem.apoptosis) || 0) / 100);
  const deep = (u) => (u.mem && u.mem.deepTears) || 0;
  const addDeep = (u, n) => { u.mem = u.mem || {}; u.mem.deepTears = Math.max(0, Math.min(DEEP_CAP, (u.mem.deepTears || 0) + n)); };
  const loseSan = (u, n) => { if (u.mem && typeof u.mem.limbusSanity === 'number') u.mem.limbusSanity = Math.max(-45, u.mem.limbusSanity - n); };
  const setSig = (battle, unit, key, mods, sig) => { if (unit.mem[sig] === JSON.stringify(mods)) return; unit.mem[sig] = JSON.stringify(mods); battle.addBuff(unit, { key, mods, persist: true, allowDead: true, refresh: 'replace', source: unit }); };
  return {
    skills: {
      // 骑士的护佑：攻 +40%(目标凋亡≥6级再 +15%)，命中 +2 深泪（凋亡由守护之剑天赋每击附加）
      skchr_rodion_1: {
        kind: 'charges',
        attack: {
          atkScale: 1 + num(s1.atk_pct, 0.4),
          dmgMul(b, u, target) { return target && apoLv(target) >= num(s1.apo_thr, 6) ? 1 + num(s1.apo_extra, 0.15) : 1; },
          onHit({ battle, unit, target }) { addDeep(unit, num(s1.deep_gain, 2)); battle.fx?.('rodion_tear_slash', { x: target ? target.x : unit.x, y: target ? target.y : unit.y }); }
        }
      },
      // 以正义之力：攻 +80%，开技 −10 理智；深泪≥15 消 5 → 本技能伤害 +20%；命中附 2 级凋亡
      skchr_rodion_2: {
        kind: 'duration',
        duration: num(s2.duration, 20),
        mods: { atkPct: num(s2.atk_pct, 0.8) },
        onStart({ battle, unit }) {
          loseSan(unit, num(s2.sanity_cost, 10));
          if (deep(unit) >= num(s2.deep_req, 15)) { addDeep(unit, -num(s2.deep_cost, 5)); battle.addBuff(unit, { key: 'buff:rodion:s2dmg', mods: { dmgDealtMul: 1 + num(s2.deep_dmg, 0.2) }, duration: num(s2.duration, 20), refresh: 'replace', source: unit }); }
          battle.fx?.('rodion_despair_pierce', { x: unit.x, y: unit.y });
        },
        attack: { onHit({ battle, unit, target }) { if (target && target.alive) applyElementDmg(battle, unit, target, 'apoptosis', num(s2.apo_level, 2) * EP); } }
      },
      // 阿卡纳穿刺：攻 +120%，开技 −15 理智；深泪≥10 消耗至多 20（每层 +1.5% 伤害[≤30%]，每 5 层 +10% 攻[≤40%]）；命中附 3 级凋亡
      skchr_rodion_3: {
        kind: 'duration',
        duration: num(s3.duration, 20),
        mods: { atkPct: num(s3.atk_pct, 1.2) },
        onStart({ battle, unit }) {
          loseSan(unit, num(s3.sanity_cost, 15));
          const have = deep(unit);
          if (have >= num(s3.deep_req, 10)) {
            const used = Math.min(have, num(s3.deep_max, 20)); addDeep(unit, -used);
            const dmg = Math.min(num(s3.deep_dmg_cap, 0.3), used * num(s3.deep_dmg_per, 0.015));
            const atk = Math.min(num(s3.deep_atk_cap, 0.4), Math.floor(used / 5) * num(s3.deep_atk_per5, 0.1));
            battle.addBuff(unit, { key: 'buff:rodion:s3burst', mods: { dmgDealtMul: 1 + dmg, atkPct: atk }, duration: num(s3.duration, 20), refresh: 'replace', source: unit });
          }
          battle.fx?.('rodion_knight_barrier', { x: unit.x, y: unit.y, r: 2 });
        },
        attack: { onHit({ battle, unit, target }) { if (target && target.alive) applyElementDmg(battle, unit, target, 'apoptosis', num(s3.apo_level, 3) * EP); } }
      }
    },
    talents: [
      // 守护之剑：攻击附凋亡损伤（层数→攻 的刷新在 install 的 tick 里；层数由特性的护盾事件累加）
      { install(battle, unit) { battle.on('hit', (ev) => { if (ev.source === unit && ev.target && ev.target.alive) applyElementDmg(battle, unit, ev.target, 'apoptosis', EP); }, { owner: unit }); } },
      { install() {} }   // 泪锋：按负精神刷新（见 install）
    ],
    install(battle, unit) {
      unit.mem = unit.mem || {}; unit.mem.deepTears = unit.mem.deepTears || 0; unit.mem.guardSword = unit.mem.guardSword || 0;
      unit.mem._nextShield = num(trb.shield_interval, 6);   // 首次护盾在 shield_interval 秒后
      const allies = () => (battle.allies?.(unit.ownerId) || []).filter((a) => a && a.alive && a.def?.raw?.nationId === 'limbus');
      battle.on('tick', () => {
        if (!unit.alive || !unit.deployed) return;
        const now = battle.time || 0;
        // 特性：消耗精神为全体边狱生成护盾 + 攒守护之剑（扣精神顺带喂泪锋/负精神，与玻璃大炮身份自洽）
        if (now >= (unit.mem._nextShield || 0) && (unit.mem.limbusSanity ?? 0) > num(trb.shield_cost, 8)) {
          unit.mem._nextShield = now + num(trb.shield_interval, 6);
          loseSan(unit, num(trb.shield_cost, 8));
          const amt = Math.floor(unit.s.maxHp * num(trb.shield_pct, 0.25));
          for (const a of allies()) battle.addBuff(a, { key: 'buff:rodion:guardShield', shield: amt, duration: num(trb.shield_dur, 8), visible: true, refresh: 'replace', source: unit });
          unit.mem.guardSword = Math.min(num(g0.guard_cap, 10), unit.mem.guardSword + 1);
          battle.fx?.('rodion_knight_barrier', { x: unit.x, y: unit.y, r: 2 });
        }
        const sanity = unit.mem.limbusSanity ?? 0;
        if (unit.mem._lastSan != null && sanity < unit.mem._lastSan) unit.mem._rodLost = (unit.mem._rodLost || 0) + (unit.mem._lastSan - sanity);
        unit.mem._lastSan = sanity;
        setSig(battle, unit, 'buff:rodion:guard', { atkPct: Math.floor(unit.mem.guardSword / 2) * num(g0.atk_per_2, 0.05) }, '_sigGuard');
        // 泪锋：「自身每失去 15 点理智，获得 1 层」（累计精神损失），至多 max_stack 层
        const tears = Math.min(num(g1.max_stack, 3), Math.floor((unit.mem._rodLost || 0) / num(g1.sanity_per_stack, 15)));
        setSig(battle, unit, 'buff:rodion:tear', { atkPct: tears * num(g1.atk_per_stack, 0.08) }, '_sigTear');
        const red = sanity < 0 ? Math.min(num(trb.neg_reduction_max, 0.25), (-sanity / 45) * num(trb.neg_reduction_max, 0.25)) : 0;
        setSig(battle, unit, 'buff:rodion:negred', { dmgTakenMul: 1 - red }, '_sigRed');
      }, { owner: unit });
    }
  };
};

// 5. Don Quixote (唐吉诃德 - 拉曼恰管理者)
// 5. Don Quixote (堂吉诃德 - Cinq协会东部3科)：【呼吸法】自叠 + 【灼燃损伤】+ 【点穴】标记 + 降防；攻速越高越猛
const donquixoteKit = (bb, chess, def) => {
  const ACAP = () => num(bb.acupoint_cap, 5);                 // 【点穴】层上限
  const acup = (t) => (t && t.mem ? (t.mem.limbusAcupoint || 0) : 0);
  const addAcup = (t, n = 1) => { if (!t || !t.alive) return; t.mem = t.mem || {}; t.mem.limbusAcupoint = Math.min(ACAP(), (t.mem.limbusAcupoint || 0) + n); };
  const BREATH_CAP = 10, BREATH_ATK = () => num(bb.breath_atk, 0.04);   // 【呼吸法】每层 +4% 攻击，最多 10 层
  // 呼吸法（天赋1 的真正效果，之前是死数据）：自叠层 → 常驻刷新的攻击力加成
  const addBreath = (battle, u, n) => {
    u.mem = u.mem || {};
    u.mem.breath = Math.min(BREATH_CAP, (u.mem.breath || 0) + n);
    battle.addBuff(u, { key: 'buff:donq:breath', mods: { atkPct: u.mem.breath * BREATH_ATK() }, duration: 9999, refresh: 'replace', source: u, visible: true });
  };
  const burnLv = (t) => Math.floor((t && t.elem ? (t.elem.burn || 0) : 0) / 100);
  // 点穴 + 灼燃越重，降防越狠（点穴每层记 2、灼燃每级记 1，每点 -4%，封顶 -60%）
  const defShred = (battle, unit, t, dur) => {
    if (!t || !t.alive) return;
    const layers = acup(t) * 2 + burnLv(t);
    if (layers <= 0) return;
    battle.addBuff(t, { key: 'debuff:donq:defdown', mods: { defMul: Math.max(0.4, 1 - 0.04 * layers) }, duration: dur, refresh: 'replace', visible: true, source: unit });
  };
  return {
    skills: {
      // 发劲（AUTO 充能）：2 段物理，攻速高于目标额外 +15%；+3 呼吸法；命中叠灼燃（点穴由天赋统一上）
      skchr_donquixote_1: {
        kind: 'charges',
        onStart({ battle, unit }) { addBreath(battle, unit, 3); },
        attack: {
          hits: Math.max(1, Math.floor(num(bb.hits, 2))),
          atkScale: num(bb.atk_scale, 1.5),
          // 攻速高于目标 → +15%（动态倍率走 dmgMul；引擎的 atkScale 只接受数字）
          dmgMul: (b, u, t) => ((u.s?.aspd || 100) > (t?.s?.aspd || 100) ? 1.15 : 1),
          onHit({ battle, unit, target }) {
            if (target && target.alive) applyElementDmg(battle, unit, target, 'burn', num(bb.burn1, 120));
            battle.fx?.('strike', { x: target ? target.x : unit.x, y: target ? target.y : unit.y, id: unit.id });
          }
        }
      },
      // 翠炎拳（充能）：攻击力 +70%(bb atk_pct)；命中 +2 呼吸法、大量灼燃、额外 2% 目标最大生命伤害；
      //                按灼燃/点穴降防；自身短暂攻速 +30
      skchr_donquixote_2: {
        kind: 'charges',
        attack: {
          atkScale: 1 + num(bb.atk_pct, 0.7),
          onHit({ battle, unit, target }) {
            if (!target || !target.alive) return;
            addBreath(battle, unit, 2);
            applyElementDmg(battle, unit, target, 'burn', num(bb.burn2, 220));
            if (num(bb.maxhp_dmg) > 0) battle.dealDamage(unit, target, { amount: target.s.maxHp * num(bb.maxhp_dmg, 0.02), type: 'phys', tags: ['skill'] });
            defShred(battle, unit, target, 6);
            battle.addBuff(unit, { key: 'buff:donq:aspd', mods: { aspd: num(bb.aspd_buff, 30) }, duration: 6, refresh: 'replace', source: unit });
            battle.fx?.('scorchBurst', { x: target.x, y: target.y, id: unit.id });
          }
        }
      },
      // 请您赐教（充能·处决）：atk_scale 7.5；目标点穴越多(+15%/层,≤+45%)、自身呼吸法+目标灼燃越高(≤+50%)伤害越高；
      //                      命中灼燃 + 大幅降防 + 眩晕 stun_sec + lifesteal 吸血
      skchr_donquixote_3: {
        kind: 'charges',
        onStart({ battle, unit }) { addBreath(battle, unit, 5); },
        attack: {
          atkScale: num(bb.atk_scale, 7.5),
          // 点穴越多(+15%/层,≤+45%) + 自身呼吸法+目标灼燃越高(≤+50%) → 动态增伤走 dmgMul
          dmgMul: (b, u, t) => {
            const a = Math.min(3, (t && t.mem ? t.mem.limbusAcupoint || 0 : 0)) * 0.15;
            const extra = Math.min(0.5, ((u.mem?.breath || 0) + burnLv(t)) * 0.02);
            return (1 + a) * (1 + extra);
          },
          onHit({ battle, unit, target, dealt }) {
            if (!target || !target.alive) return;
            applyElementDmg(battle, unit, target, 'burn', num(bb.burn3, 200));
            if (acup(target) >= 1) defShred(battle, unit, target, 8);
            if (num(bb.stun_sec) > 0) battle.applyStatus?.(target, 'stun', { duration: num(bb.stun_sec, 5), source: unit });
            const ls = num(bb.lifesteal, 0.3);
            if (ls > 0 && dealt > 0 && unit.alive) battle.heal(unit, unit, dealt * ls, { self: true });
            battle.fx?.('meltdown', { x: target.x, y: target.y, id: unit.id });
          }
        }
      }
    },
    talents: [
      // 点穴 + 呼吸法底座 + 特性：普通攻击命中 → 1 层点穴 + 少量灼燃 + 1 层呼吸法；技能命中也经此上点穴
      { install(battle, unit) {
          addBreath(battle, unit, 0);   // 开场装好 0 层 buff 容器
          battle.on('damaged', (ev) => {
            if (ev.source !== unit || ev.type === 'element' || !ev.target || !ev.target.alive) return;
            addAcup(ev.target);
            if (ev.dmg?.isAttack && !ev.dmg?.isSkill) { applyElementDmg(battle, unit, ev.target, 'burn', num(bb.burn_atk, 40)); addBreath(battle, unit, 1); }
          }, { owner: unit });
        } },
      { install() {} }
    ]
  };
};

// 6. Meursault (默尔索 - 剑契头领)：决战者——【虎标弹】按眼前目标数倾泻，一次性多格斩击 + 神经引爆(麻痹)
const meursaultKit = (bb, chess, def) => {
  const sbb = (id) => {
    if (chess?.skill?.skillId === id) return chess.skill.bb || bb;
    return (chess?.allSkills || chess?.skills || []).find((s) => s.skillId === id)?.bb || {};
  };
  const b1 = sbb('skchr_meursault_1'), b2 = sbb('skchr_meursault_2'), b3 = sbb('skchr_meursault_3');
  const t0 = chess?.talents?.[0]?.bb || {}, t1 = chess?.talents?.[1]?.bb || {}, trb = chess?.trait?.bb || {};
  const EP = num(t1.ep_per_level, 100);   // 1 级【神经损伤】/【灼燃】≈ 100 点元素槽（满 1000=10 级→引爆）

  const bullets = (u) => (u.mem.tigerBullets || 0);
  const useBullets = (u, n) => { const g = Math.max(0, Math.min(n, bullets(u))); u.mem.tigerBullets -= g; return g; };
  const neural = (battle, u, t, lv) => applyElementDmg(battle, u, t, 'neural', lv * EP);
  const burn = (battle, u, t, lv) => applyElementDmg(battle, u, t, 'burn', lv * EP);
  // 引爆【神经损伤】→ 填满槽触发引擎的神经爆发（对敌人 = 麻痹 3 层，constants.js ELEMENT.neural.enemy）
  const detonate = (battle, u, t) => {
    if (t && t.alive && (t.elem?.neural || 0) > 0) {
      applyElementDmg(battle, u, t, 'neural', (t.gaugeMax || 1000));
      battle.fx?.('blast', { x: t.x, y: t.y, id: t.id, element: 'neural', r: 0.6 });
    }
  };
  // 眼前目标：攻击范围内的敌人 ∪ 自身阻挡的敌人（去重、仍存活）
  const frontEnemies = (battle, u) => {
    const list = (battle.enemiesInKeys?.(u.rangeKeys, u, u.profile) || []).slice();
    for (const e of u.blocking || []) if (e && e.alive && !list.includes(e)) list.push(e);
    return list.filter((e) => e && e.alive);
  };

  return {
    // 决战者特性：普通攻击（非技能）也叠 1 级【神经损伤】；对带神经的敌人增伤走 install 的 hit 钩子
    trait: {
      afterHit(battle, u, target, hctx) {
        if (!hctx || hctx.isSkill || !target || !target.alive || !(hctx.dealt > 0)) return;
        neural(battle, u, target, num(t1.neural, 1));
      },
    },
    skills: {
      // 二连斩-爆：攻击力+50%，命中叠神经+灼燃；若有【虎标弹】消 1 发 → 额外神经/灼燃（AUTO 周期强化普攻）
      skchr_meursault_1: {
        kind: 'charges',
        mods: { atkPct: num(b1.atk_pct, 0.5) },
        attack: {
          onEachHit({ battle, unit, target, dealt }) {
            if (!(dealt > 0) || !target.alive) return;
            neural(battle, unit, target, num(b1.neural, 1));
            burn(battle, unit, target, num(b1.burn, 1));
            if (useBullets(unit, 1)) { neural(battle, unit, target, num(b1.bullet_neural, 2)); burn(battle, unit, target, num(b1.bullet_burn, 2)); }
            battle.fx?.('slash', { x: target.x, y: target.y, id: target.id });
          },
        },
      },
      // __MS_REST__
      // 三连击-爆：一次性 3 段、攻击目标数 +1；每命中目标叠神经/灼燃并消 1 发虎标弹；神经≥3 级引爆
      skchr_meursault_2: {
        kind: 'instant',
        mods: { atkPct: num(b2.atk_pct, 1.0) },
        onStart({ battle, unit }) { battle.fx?.('reload', { x: unit.x, y: unit.y, id: unit.id }); },
        attack: {
          hits: num(b2.hits, 3),
          maxTargets: num(b2.extra_targets, 1),
          onEachHit({ battle, unit, target, dealt }) {
            if (!(dealt > 0) || !target.alive) return;
            neural(battle, unit, target, num(b2.neural, 2));
            burn(battle, unit, target, num(b2.burn, 2));
            useBullets(unit, 1);
            if ((target.elem?.neural || 0) >= num(b2.detonate_req, 3) * EP) detonate(battle, unit, target);
            battle.fx?.('strike', { x: target.x, y: target.y, id: target.id });
          },
        },
      },
      // 快刀乱麻（一次性斩击）：攻击力+160%；按眼前目标数消耗【虎标弹】，每消耗 1 发多打 1 格（原本单体），至多 3 发；该格附虎标弹 +50% 伤害
      skchr_meursault_3: {
        kind: 'instant',
        mods: { atkPct: num(b3.atk_pct, 1.6) },
        onStart({ battle, unit }) { battle.fx?.('swordStorm', { x: unit.x, y: unit.y, id: unit.id }); },
        attack: {
          onHit({ battle, unit, target }) {
            const rider = (t, extra) => {
              if (!t || !t.alive) return;
              if (extra) battle.dealDamage(unit, t, { amount: unit.s.atk * (1 + num(t0.dmg, 0.5)), type: 'phys', isSkill: true, tags: ['skill'] });
              neural(battle, unit, t, num(b3.neural, 3));
              burn(battle, unit, t, num(b3.burn, 3));
              detonate(battle, unit, t);
              battle.fx?.('slash', { x: t.x, y: t.y, id: t.id });
            };
            rider(target, false);   // 主目标：引擎已结算一击，这里补神经/灼燃并引爆
            const others = frontEnemies(battle, unit).filter((e) => e !== target);
            const n = Math.max(0, Math.min(num(b3.max_bullets, 3), others.length, bullets(unit)));
            useBullets(unit, n);
            for (let i = 0; i < n; i++) rider(others[i], true);   // 每多打一格 = 消 1 发虎标弹
          },
        },
      },
    },
    talents: [
      // 虎标弹：入场持有 12 发（资源池，供三技能按文案消耗）
      { install(battle, unit) { unit.mem = unit.mem || {}; unit.mem.tigerBullets = num(t0.bullets, 12); } },
      // 神经损伤爆发（麻痹）：攻击叠神经由 trait/各技能负责，满槽由引擎自动爆发为麻痹
      { install() {} },
    ],
    install(battle, unit) {
      unit.mem = unit.mem || {};
      if (unit.mem.tigerBullets == null) unit.mem.tigerBullets = num(t0.bullets, 12);
      // 对带【神经损伤】敌人增伤(+20%) + S3「灼燃与神经层数之和每 8 级 +10% 攻，≤+20%」：真实 `hit` 钩子，防御后乘 dmg.mul（只碰自身物理攻击/技能，不污染元素槽）
      battle.on('hit', (ev) => {
        if (ev.source !== unit || !unit.alive || !ev.dmg || ev.dmg.type !== 'phys') return;
        if (!ev.dmg.isAttack && !(ev.dmg.tags && ev.dmg.tags.includes('skill'))) return;
        const t = ev.target;
        let mul = 1;
        if ((t?.elem?.neural || 0) > 0) mul *= 1 + num(trb.neural_dmg, 0.2);
        if (unit.skill?.active && unit.skill.id === 'skchr_meursault_3') {
          const lv = ((t?.elem?.burn || 0) + (t?.elem?.neural || 0)) / EP;
          mul *= 1 + Math.min(num(b3.bone_cap, 0.2), Math.floor(lv / num(b3.bone_scale, 8)) * 0.1);
        }
        if (mul !== 1) ev.dmg.mul *= mul;
      }, { owner: unit });
    },
  };
};

// 7. Ishmael (以实玛利 - 裴廓德号船长)
// 7. Ishmael (以实玛利 - 裴廓德号鱼叉手)：远程(3格直线+对空)支援 DPS——【脆弱】全队增伤 + 友方光环/追击 + 鱼叉残血处决。数值全读 bb（§5 自洽）。
const ishmaelKit = (bb, chess, def) => {
  const trb = (chess.trait && chess.trait.bb) || {};
  const tbb = (i) => (chess.talents && chess.talents[i] && chess.talents[i].bb) || {};
  const sbb = (id) => { const a = chess.allSkills || chess.skills || []; const s = a.find((x) => (x.skillId || x.id) === id); return (s && s.bb) || {}; };
  const t0 = tbb(0), t1 = tbb(1), s1 = sbb('skchr_ishmael_1'), s2 = sbb('skchr_ishmael_2'), s3 = sbb('skchr_ishmael_3');
  const RANGE = num(t0.range, 2);
  const addBleed = (t, n) => { if (t && t.alive && n > 0) { t.mem = t.mem || {}; t.mem.bleed = (t.mem.bleed || 0) + n; } };
  const mates = (battle, unit) => (battle.allies?.(unit.ownerId) || []).filter((a) => a && a.alive && a !== unit && a.def?.raw?.nationId === 'limbus' && Math.hypot(a.x - unit.x, a.y - unit.y) <= RANGE);
  return {
    skills: {
      // 到我身边：攻 +50%、攻击目标数 +1；开场范围友方 def +15%；命中 +2 流血
      skchr_ishmael_1: {
        kind: 'charges',
        mods: { maxTargets: num(s1.extra_targets, 1) },
        onStart({ battle, unit }) {
          for (const a of mates(battle, unit)) battle.addBuff(a, { key: 'buff:ishmael:def', mods: { defPct: num(s1.ally_def, 0.15) }, duration: num(s1.ally_dur, 15), refresh: 'replace', visible: true, source: unit });
        },
        attack: {
          atkScale: 1 + num(s1.atk_pct, 0.5),
          onHit({ battle, unit, target }) { addBleed(target, num(s1.bleed, 2)); battle.fx?.('ishmael_harpoon', { x: target ? target.x : unit.x, y: target ? target.y : unit.y }); }
        }
      },
      // 追踪到底：攻 +90%；开场范围友方 atk +15%；命中 +2 流血(40% 概率再 +1 灼燃)，并(冷却内)令 1 名范围友方追加一次攻击
      skchr_ishmael_2: {
        kind: 'duration',
        duration: num(s2.duration, 20),
        mods: { atkPct: num(s2.atk_pct, 0.9) },
        onStart({ battle, unit }) {
          for (const a of mates(battle, unit)) battle.addBuff(a, { key: 'buff:ishmael:cmd', mods: { atkPct: num(s2.ally_atk, 0.15) }, duration: num(s2.duration, 20), refresh: 'replace', visible: true, source: unit });
        },
        attack: {
          onHit({ battle, unit, target }) {
            addBleed(target, num(s2.bleed, 2));
            if (target && target.alive && (battle.rng?.() ?? 1) < num(s2.burn_chance, 0.4)) applyElementDmg(battle, unit, target, 'burn', 100);
            const now = battle.time || 0;
            if (now >= (unit.mem._ishFollowCd || 0)) {
              const mate = mates(battle, unit)[0];
              if (mate) { unit.mem._ishFollowCd = now + num(s2.followup_cd, 1.2); battle.forceAttack?.(mate, null, { noAmmo: true }); }
            }
          }
        }
      },
      // 执着鱼叉：单体大招，攻 +160% + 残血/流血增伤(dmgMul 双封顶)；命中 +3 流血
      skchr_ishmael_3: {
        kind: 'charges',
        attack: {
          atkScale: 1 + num(s3.atk_pct, 1.6),
          dmgMul(b, u, t) {
            if (!t || !t.s) return 1;
            const miss = Math.min(num(s3.missing_cap, 0.3), Math.max(0, 1 - t.hp / Math.max(1, t.s.maxHp)) * 100 * num(s3.missing_per, 0.003));
            const bl = Math.min(num(s3.bleed_atk_cap, 0.2), Math.floor((t.mem?.bleed || 0) / 5) * num(s3.bleed_atk_per5, 0.1));
            return 1 + miss + bl;
          },
          onHit({ battle, unit, target }) { addBleed(target, num(s3.bleed, 3)); battle.fx?.('ishmael_whale_impale', { x: target ? target.x : unit.x, y: target ? target.y : unit.y }); }
        }
      }
    },
    talents: [
      { install() {} },   // 追踪到底：范围友方 atk/aspd 光环 + 命中铺流血（见 install）
      { install() {} }    // 全船之力：队伍规模 → 自身攻（见 install）
    ],
    install(battle, unit) {
      unit.mem = unit.mem || {};
      // 特性：攻击使目标【脆弱】；天赋①：命中铺 1 流血（type≠element 的自身命中）
      battle.on('damaged', (ev) => {
        if (ev.source !== unit || ev.type === 'element' || !unit.alive || !ev.target) return;
        battle.applyStatus?.(ev.target, 'fragile', { value: num(trb.vuln, 0.15), duration: num(trb.vuln_dur, 4), source: unit });
        addBleed(ev.target, 1);
      }, { owner: unit });
      // S3：击倒目标 → 理智最低的 ally_cnt 名边狱友方回理智
      battle.on('kill', (ev) => {
        if ((ev.killer || ev.source) !== unit || !unit.alive) return;
        const list = (battle.allies?.(unit.ownerId) || []).filter((a) => a && a.alive && a.def?.raw?.nationId === 'limbus' && typeof a.mem?.limbusSanity === 'number');
        list.sort((x, y) => x.mem.limbusSanity - y.mem.limbusSanity);
        for (const a of list.slice(0, num(s3.ally_cnt, 2))) a.mem.limbusSanity = Math.min(45, a.mem.limbusSanity + num(s3.ally_sanity, 10));
      }, { owner: unit });
      // 天赋①光环 + 天赋②全船之力：tick 刷新
      battle.on('tick', () => {
        if (!unit.alive) return;
        for (const a of mates(battle, unit)) battle.addBuff(a, { key: 'buff:ishmael:aura', mods: { atkPct: num(t0.ally_atk, 0.12), aspd: num(t0.ally_aspd, 15) }, duration: num(t0.aura_dur, 1.0), refresh: 'replace', source: unit });
        const n = (battle.allies?.(unit.ownerId) || []).filter((a) => a && a.alive && a !== unit && a.def?.raw?.nationId === 'limbus').length;
        const atk = n * num(t1.team_atk, 0.04);
        if (unit.mem._ishTeam !== atk) { unit.mem._ishTeam = atk; battle.addBuff(unit, { key: 'buff:ishmael:crew', mods: { atkPct: atk }, persist: true, allowDead: true, refresh: 'replace' }); }
      }, { owner: unit });
    }
  };
};

// 8. Ryōshū (良秀 - 小指子辈·蜘蛛巢之刃 / 小指良)
// 8. Ryōshū (良秀 - 小指子辈·蜘蛛巢之刃)：斩击近战——呼吸法(越叠越猛) + 流血/灼燃铺核；S3 直线定身大招。数值全读 bb（§5 自洽）。
const ryoshuKit = (bb, chess, def) => {
  const trb = (chess.trait && chess.trait.bb) || {};
  const tbb = (i) => (chess.talents && chess.talents[i] && chess.talents[i].bb) || {};
  const sbb = (id) => { const a = chess.allSkills || chess.skills || []; const s = a.find((x) => (x.skillId || x.id) === id); return (s && s.bb) || {}; };
  const g0 = tbb(0), g1 = tbb(1), s1 = sbb('skchr_ryoshu_1'), s2 = sbb('skchr_ryoshu_2'), s3 = sbb('skchr_ryoshu_3');
  const BREATH_CAP = num(g0.breath_cap, 10), BREATH_ATK = num(g0.breath_atk, 0.03);
  const burnLv = (t) => Math.floor(((t && t.elem && t.elem.burn) || 0) / 100);
  const bleedOf = (t) => (t && t.mem ? (t.mem.bleed || 0) : 0);
  const addBreath = (battle, unit, n) => {
    unit.mem = unit.mem || {};
    const v = Math.min(BREATH_CAP, (unit.mem.ryoBreath || 0) + n);
    if (v === (unit.mem.ryoBreath || 0)) return;
    unit.mem.ryoBreath = v;
    battle.addBuff(unit, { key: 'ryoshu:breath', mods: { atkPct: v * BREATH_ATK }, persist: true, allowDead: true, refresh: 'replace', visible: true });
  };
  const cuts = (battle, unit, target, bleed, burn) => {
    if (!target || !target.alive) return;
    if (bleed > 0) { target.mem = target.mem || {}; target.mem.bleed = (target.mem.bleed || 0) + bleed; }
    if (burn > 0) applyElementDmg(battle, unit, target, 'burn', burn * 100);
  };
  return {
    skills: {
      // 三连：攻击力 +50%；命中 +2 呼吸法、目标 +1 流血 +1 灼燃；自身回精神
      skchr_ryoshu_1: {
        kind: 'charges',
        attack: {
          atkScale: 1 + num(s1.atk_pct_s1, 0.5),
          onHit({ battle, unit, target }) {
            addBreath(battle, unit, num(s1.breath_gain, 2));
            cuts(battle, unit, target, num(s1.bleed, 1), num(s1.burn, 1));
            if (unit.mem && typeof unit.mem.limbusSanity === 'number') unit.mem.limbusSanity = Math.min(45, unit.mem.limbusSanity + num(s1.sanity_gain, 5));
            battle.fx?.('ryoshu_tiansha', { x: target ? target.x : unit.x, y: target ? target.y : unit.y });
          }
        }
      },
      // 三连-残：攻击力 +100% 且攻击目标数 +1；命中 +2 呼吸法、目标 +2 流血 +2 灼燃
      skchr_ryoshu_2: {
        kind: 'duration',
        duration: num(s2.duration, 12),
        mods: { atkPct: num(s2.atk_pct_s2, 1.0), maxTargets: num(s2.max_targets, 1) },
        attack: {
          onHit({ battle, unit, target }) {
            addBreath(battle, unit, num(s2.breath_gain, 2));
            cuts(battle, unit, target, num(s2.bleed, 2), num(s2.burn, 2));
          }
        }
      },
      // 空间斩：对前方直线 line_tiles 格内敌人定身 bind_sec 秒，预兆后结算一次大伤害（物理·无视部分防御）+流血+灼燃；自身大涨呼吸法
      skchr_ryoshu_3: {
        kind: 'instant',
        onCast({ battle, unit }) {
          const L = num(s3.line_tiles, 4), dir = unit.dir || 'RIGHT';
          const line = (battle.enemies || []).filter((e) => {
            if (!e || !e.alive || e.side !== 'enemy') return false;
            const dx = e.x - unit.x, dy = e.y - unit.y;
            if (dir === 'LEFT') return dx <= 0.1 && dx >= -L && Math.abs(dy) <= 0.6;
            if (dir === 'UP') return dy >= -0.1 && dy <= L && Math.abs(dx) <= 0.6;
            if (dir === 'DOWN') return dy <= 0.1 && dy >= -L && Math.abs(dx) <= 0.6;
            return dx >= -0.1 && dx <= L && Math.abs(dy) <= 0.6;   // 默认 RIGHT
          });
          addBreath(battle, unit, num(s3.breath_gain, 5));
          for (const t of line) battle.applyStatus?.(t, 'bind', { duration: num(s3.bind_sec, 1), source: unit });
          battle.fx?.('swordStorm', { x: unit.x, y: unit.y, dir });
          battle.after?.(num(s3.telegraph, 0.3), () => {
            unit.mem._ryoBurst = true;
            for (const t of line) {
              if (!t || !t.alive) continue;
              battle.dealDamage(unit, t, { amount: unit.s.atk * num(s3.s3_scale, 4.0), type: 'phys' });
              cuts(battle, unit, t, num(s3.s3_bleed, 3), num(s3.s3_burn, 3));
            }
            unit.mem._ryoBurst = false;
            battle.fx?.('ryoshu_echoshear', { x: unit.x, y: unit.y });
          });
        }
      }
    },
    talents: [
      { install() {} },   // 呼吸法：见 install（普攻 +1 呼吸法）
      { install() {} }    // 空间斩：见 install（普攻附流血+灼燃；按流血+灼燃层增伤）
    ],
    install(battle, unit) {
      unit.mem = unit.mem || {};
      if (typeof unit.mem.limbusSanity !== 'number') unit.mem.limbusSanity = 45;
      battle.addBuff(unit, { key: 'ryoshu:defignore', mods: { defIgnorePct: num(trb.def_ignore, 0.3) }, persist: true, allowDead: true, refresh: 'replace' });
      // 空间斩②：按目标(流血+灼燃级)之和每 6 级 +10% 伤害（真实 hit 钩子，mutable dmg）
      battle.on('hit', (ev) => {
        if (ev.source !== unit || !ev.dmg || ev.dmg.type === 'element') return;
        const sum = bleedOf(ev.target) + burnLv(ev.target);
        if (sum > 0) ev.dmg.mul *= 1 + Math.min(num(g1.mul_cap, 0.3), Math.floor(sum / 6) * 0.1);
      }, { owner: unit });
      // 普攻基线：呼吸法 +1、目标 +1 流血 +1 灼燃（技能攻击/ S3 爆发由技能自带，避免双重结算）
      battle.on('damaged', (ev) => {
        if (ev.source !== unit || ev.type === 'element' || !unit.alive) return;
        if ((unit.skill && unit.skill.active) || unit.mem._ryoBurst) return;
        addBreath(battle, unit, 1);
        cuts(battle, unit, ev.target, 1, 1);
      }, { owner: unit });
      // 特性：精神越高攻速越高（攻击力部分已由 bonds.js 正理智线给）
      battle.on('tick', () => {
        if (!unit.alive) return;
        const s = unit.mem.limbusSanity ?? 0;
        const aspd = s > 0 ? Math.round((s / 45) * num(trb.sanity_aspd_max, 30)) : 0;
        if (unit.mem._ryoAspd === aspd) return;
        unit.mem._ryoAspd = aspd;
        battle.addBuff(unit, { key: 'ryoshu:sanaspd', mods: { aspd }, persist: true, allowDead: true, refresh: 'replace' });
      }, { owner: unit });
    }
  };
};

// 9. Outis (奥提斯 - 魔弹射手)：SNIPER 远程低防优先；魔弹叠攻 + 黑焰放大灼燃 + 破防惠及全队；技能 charges/duration/ammo
const outisKit = (bb, chess, def) => {
  const sbb = (id) => {
    if (chess?.skill?.skillId === id) return chess.skill.bb || bb;
    return (chess?.allSkills || chess?.skills || []).find((s) => s.skillId === id)?.bb || {};
  };
  const b1 = sbb('skchr_outis_1'), b2 = sbb('skchr_outis_2'), b3 = sbb('skchr_outis_3');
  const MB_MAX = 7, MB_ATK = 0.08, BF_MAX = 10, BF_PER = 0.1;   // 魔弹≤7/每层+8%攻；黑焰≤10/每层+10%受灼燃
  const bullets = (u) => (u.mem?.magicBullets | 0);
  const setBullets = (battle, u, n) => {
    u.mem = u.mem || {};
    u.mem.magicBullets = Math.max(0, Math.min(MB_MAX, n | 0));
    battle.addBuff(u, { key: 'outis:bullets', mods: { atkPct: MB_ATK * u.mem.magicBullets }, persist: true, allowDead: true, refresh: 'replace', visible: true });
  };
  const gainBullet = (battle, u, n = 1) => setBullets(battle, u, bullets(u) + n);
  const blackflame = (t) => (t?.mem?.blackflame | 0);
  const addBlackflame = (t, n = 1) => { if (!t || !t.alive) return; t.mem = t.mem || {}; t.mem.blackflame = Math.max(0, Math.min(BF_MAX, (t.mem.blackflame | 0) + n)); };
  const burnAmped = (battle, u, t, base) => { if (t && t.alive && base > 0) applyElementDmg(battle, u, t, 'burn', base * (1 + BF_PER * blackflame(t))); };
  return {
    skills: {
      // S1 穿甲弹（充能一发）：无视部分防御，贯穿目标身后同排敌人
      skchr_outis_1: {
        kind: 'charges',
        mods: { defIgnorePct: num(b1.def_ignore, 0.4) },
        attack: {
          atkScale: num(b1.atk_scale, 2.6),
          onHit({ battle, unit, target }) {
            if (!target) return;
            const dir = Math.sign(target.x - unit.x) || ((unit.facing ?? 1) >= 0 ? 1 : -1);
            const pierce = battle.enemies.filter((e) => e.alive && e !== target
              && Math.abs(e.y - unit.y) < 0.6 && (dir >= 0 ? e.x >= target.x : e.x <= target.x));
            for (const e of pierce)
              battle.dealDamage(unit, e, { amount: unit.s.atk * num(b1.atk_scale, 2.6), type: 'phys', isSkill: true, tags: ['skill'], defIgnorePct: num(b1.def_ignore, 0.4) });
            battle.fx?.('quadShot', { x: unit.x, y: unit.y, id: target.id });
          },
        },
      },
      // S2 爓焰弹幕（持续窗口）：攻击力大增 + 弹跳 2 个额外目标，每次命中附重灼燃
      skchr_outis_2: {
        kind: 'duration', duration: num(b2.duration, 12),
        mods: { atkPct: num(b2.atk_pct, 1.0) },
        attack: {
          maxTargets: 1 + num(b2.bounce_count, 2),
          onEachHit({ battle, unit, target }) {
            burnAmped(battle, unit, target, num(b2.burn_bonus, 250));
            battle.fx?.('arrowRain', { x: target.x, y: target.y, id: target.id });
          },
        },
      },
      // S3 魔弹射击（弹匣 7 连射·默认技）：每发小 AoE + 黑焰灼燃，击杀返还一发，打空归零
      skchr_outis_3: {
        kind: 'ammo', ammo: num(b3.ammo, 7),
        attack: {
          atkScale: num(b3.atk_scale, 1.3),
          splashRadius: num(b3.aoe_radius, 1.5),
          onHit({ battle, unit, target }) { const t = target || unit; battle.fx?.('arrowRain', { x: t.x, y: t.y, id: t.id, r: num(b3.aoe_radius, 1.5) }); },
          onEachHit({ battle, unit, target }) { burnAmped(battle, unit, target, num(b3.burn, 120)); },
        },
        onStart({ battle, unit }) {
          if (unit.mem && typeof unit.mem.limbusSanity === 'number') unit.mem.limbusSanity = Math.max(-45, unit.mem.limbusSanity - num(b3.sanity_cost, 5));
          battle.fx?.('mark', { x: unit.x, y: unit.y, id: unit.id });
        },
      },
    },
    talents: [
      {
        // 天赋1【黑焰】+ 天赋2【魔弹】走真实钩子（取代旧死 afterDamage / 永久改 atk）
        install(battle, unit) {
          setBullets(battle, unit, 0);                                   // 入场建立魔弹 buff（0 层）
          battle.on('attack', (ev) => {                                  // 普攻装填 1 发魔弹（技能攻击不装填）
            if (ev.attacker === unit && !ev.isSkill && unit.alive) gainBullet(battle, unit, 1);
          }, { owner: unit });
          battle.on('damaged', (ev) => {                                 // 命中给目标 +1 黑焰（灼燃结算本身不再叠）
            if (ev.source === unit && ev.target && ev.target.alive && ev.dmg && ev.dmg.type !== 'element') addBlackflame(ev.target, 1);
          }, { owner: unit });
          battle.on('kill', (ev) => {                                    // S3 击杀返还一发（refund_kill）
            if ((ev.killer || ev.source) !== unit) return;
            const sk = unit.skill;
            if (sk && sk.active && sk.kind === 'ammo' && sk.id === 'skchr_outis_3') sk.addAmmo(num(b3.refund_kill, 1));
          }, { owner: unit });
        },
      },
    ],
  };
};

// 10. Heathcliff (希斯克利夫 - 狂猎魔王/无头骑士)：领主——【棺】层数增攻 + 凋亡【狂猎】；技能形态 charges/duration/instant
const heathcliffKit = (bb, chess, def) => {
  const sbb = (id) => {
    if (chess?.skill?.skillId === id) return chess.skill.bb || bb;
    return (chess?.allSkills || chess?.skills || []).find((s) => s.skillId === id)?.bb || {};
  };
  const b1 = sbb('skchr_heathcliff_1'), b2 = sbb('skchr_heathcliff_2'), b3 = sbb('skchr_heathcliff_3');
  const t0 = chess?.talents?.[0]?.bb || {}, t1 = chess?.talents?.[1]?.bb || {}, trb = chess?.trait?.bb || {};
  const EP = num(trb.ep_per_level, 100), COF_MAX = num(t0.max, 10);
  const coffin = (u) => (u.mem?.coffin || 0);
  const apoLv = (t) => Math.floor(((t?.elem?.apoptosis) || 0) / EP);
  const apo = (battle, u, t, lv) => applyElementDmg(battle, u, t, 'apoptosis', lv * EP);
  const addCoffin = (battle, u, n) => {
    u.mem = u.mem || {};
    u.mem.coffin = Math.max(0, Math.min(COF_MAX, (u.mem.coffin || 0) + n));
    battle.addBuff(u, { key: 'heathcliff:coffin', mods: { atkPct: num(t0.atk_per, 0.12) * u.mem.coffin }, persist: true, allowDead: true, refresh: 'replace', visible: u.mem.coffin > 0 });
  };
  return {
    // 领主：攻击范围/可对空来自数据；特性只加「普通攻击叠 1 级凋亡」（对高凋亡目标的狂猎增伤走 install 的 hit 钩子）
    trait: {
      afterHit(battle, u, target, hctx) {
        if (!hctx || hctx.isSkill || !target || !target.alive || !(hctx.dealt > 0)) return;
        apo(battle, u, target, num(t1.apo, 1));
      },
    },
    skills: {
      // 斩首：攻击力+60%，命中叠 2 级凋亡（高凋亡目标的额外增伤在 install 的 hit 钩子）
      skchr_heathcliff_1: {
        kind: 'charges',
        mods: { atkPct: num(b1.atk_pct, 0.6) },
        attack: {
          onEachHit({ battle, unit, target, dealt }) {
            if (!(dealt > 0) || !target.alive) return;
            apo(battle, unit, target, num(b1.apo, 2));
            battle.fx?.('slash', { x: target.x, y: target.y, id: target.id });
          },
        },
      },
      // __HC_REST__
      // 追悼游行：持续多目标姿态——攻击力+100%、攻击目标数+1（每 4 层【棺】再+1，至多+2）；命中叠 2 级凋亡；每次攻击后自削 10 精神
      skchr_heathcliff_2: {
        kind: 'duration',
        duration: num(b2.duration, 20),
        mods: { atkPct: num(b2.atk_pct, 1.0) },
        onStart({ battle, unit }) {
          const extra = num(b2.extra_targets, 1) + Math.min(num(b2.coffin_target_cap, 2), Math.floor(coffin(unit) / num(b2.coffin_per_target, 4)));
          battle.addBuff(unit, { key: 'heathcliff:parade', mods: { maxTargets: extra }, duration: num(b2.duration, 20), refresh: 'replace', visible: true });
          battle.fx?.('swordStorm', { x: unit.x, y: unit.y, id: unit.id });
        },
        attack: {
          onEachHit({ battle, unit, target, dealt }) {
            if (!(dealt > 0) || !target.alive) return;
            apo(battle, unit, target, num(b2.apo, 2));
            battle.fx?.('slash', { x: target.x, y: target.y, id: target.id });
          },
          onHit({ unit }) {
            if (typeof unit.mem?.limbusSanity === 'number') unit.mem.limbusSanity = Math.max(-45, unit.mem.limbusSanity - num(b2.sanity_cost, 10));
          },
        },
      },
      // 镇魂曲：一次性 AoE 大招——攻击力+180%；开启得 1 层【棺】；命中范围内敌人叠大量凋亡（击倒得 2 层【棺】由击杀钩子统一处理）
      skchr_heathcliff_3: {
        kind: 'instant',
        mods: { atkPct: num(b3.atk_pct, 1.8) },
        onStart({ battle, unit }) {
          addCoffin(battle, unit, num(b3.coffin_start, 1));
          battle.fx?.('swordStorm', { x: unit.x, y: unit.y, id: unit.id });
        },
        attack: {
          splashRadius: num(b3.splash_r, 2),
          onEachHit({ battle, unit, target, dealt }) {
            if (!(dealt > 0) || !target.alive) return;
            apo(battle, unit, target, num(b3.apo, 3) + num(b3.apo_extra, 4));
            battle.fx?.('aoe', { x: target.x, y: target.y, id: target.id, element: 'apoptosis', r: 0.6 });
          },
        },
      },
    },
    // __HC_TAIL__
    talents: [
      // 棺：击杀 +2 层、每层 +12% 攻（≤+120%）——层数与 buff 刷新见 install / addCoffin
      { install() {} },
      // 狂猎：普通攻击叠凋亡见 trait；对高凋亡目标增伤见 install 的 hit 钩子
      { install() {} },
    ],
    install(battle, unit) {
      unit.mem = unit.mem || {};
      addCoffin(battle, unit, 0);   // 初始 0 层，先把【棺】buff 建好
      // 击杀：棺 +2；攻击范围内【边狱公司】友方回技力（特性）——用 def.raw.nationId（units 无 .chess）
      battle.on('kill', (ev) => {
        if ((ev.killer || ev.source) !== unit || !unit.alive) return;
        addCoffin(battle, unit, num(t0.kill_gain, 2));
        const mates = (battle.allies?.(unit.ownerId) || []).filter((a) => a && a.alive && a !== unit && a.def?.raw?.nationId === 'limbus' && Math.hypot(a.x - unit.x, a.y - unit.y) <= num(trb.sp_radius, 2.5));
        for (const a of mates) a.skill?.gainSp?.(num(trb.sp_gain, 2), 'talent');
      }, { owner: unit });
      // 狂猎(≥6级+20%) + S1(≥6级+15%、每3级+5%≤10%) + S3(每3级+10%≤40%)：按目标凋亡等级增伤，走真实 hit 钩子（防御后乘 dmg.mul，只碰自身物理攻击/技能）
      battle.on('hit', (ev) => {
        if (ev.source !== unit || !unit.alive || !ev.dmg || ev.dmg.type !== 'phys') return;
        if (!ev.dmg.isAttack && !(ev.dmg.tags && ev.dmg.tags.includes('skill'))) return;
        const lv = apoLv(ev.target); let mul = 1;
        if (lv >= num(t1.req, 6)) mul *= 1 + num(t1.atk, 0.2);
        const sid = unit.skill?.active ? unit.skill.id : null;
        if (sid === 'skchr_heathcliff_1') {
          if (lv >= num(b1.apo6_req, 6)) mul *= 1 + num(b1.apo6_atk, 0.15);
          mul *= 1 + Math.min(num(b1.per3_cap, 0.1), Math.floor(lv / 3) * num(b1.per3_atk, 0.05));
        } else if (sid === 'skchr_heathcliff_3') {
          mul *= 1 + Math.min(num(b3.per3_cap, 0.4), Math.floor(lv / 3) * num(b3.per3_atk, 0.1));
        }
        if (mul !== 1) ev.dmg.mul *= mul;
      }, { owner: unit });
    },
  };
};

// 11. Hong Lu (鸿璐 - 鸿园的君主-红露)
const hongluKit = (bb, chess, def) => {
  const sbb = (id) => (chess?.skill?.skillId === id ? (chess.skill.bb || {}) : (chess?.skills || chess?.allSkills || []).find((s) => s.skillId === id)?.bb || {});
  const b1 = sbb('skchr_honglu_1'), b2 = sbb('skchr_honglu_2'), b3 = sbb('skchr_honglu_3');
  const trb = chess?.trait?.bb || {}, t0 = chess?.talents?.[0]?.bb || {}, t1 = chess?.talents?.[1]?.bb || {};
  const BREATH_CAP = Math.max(1, Math.floor(num(trb.breath_cap, 10))), BREATH_STEP = num(trb.breath_step, 0.03);   // 呼吸法：每 2 层 +3% 攻
  const VCAP = Math.max(1, Math.floor(num(t1.vuln_cap, 5))), VSTEP = num(t1.vuln_step, 0.1), REGAL = num(t1.regal_dmg, 0.35);
  const SPIRIT_THR = num(t0.spirit_thr, 30), BREATH_GAIN = Math.max(1, num(t0.breath_gain, 1));   // 精神≥阈值叠得更快（+1）
  const DIRV = { RIGHT: [0, 1], LEFT: [0, -1], UP: [-1, 0], DOWN: [1, 0] };
  const vulnStacks = (t) => (t && t.mem ? (t.mem.honglVuln || 0) : 0);
  const limbusAllies = (battle, u) => (battle.allies?.(u.ownerId) || []).filter((a) => a && a.alive && a.def?.raw?.nationId === 'limbus');
  // 君主的威仪（天赋2）：攻击叠脆弱 → 目标受到的伤害提升（每层 +VSTEP，≤VCAP 层）
  const addVuln = (battle, owner, t) => {
    if (!t || !t.alive) return;
    t.mem = t.mem || {};
    t.mem.honglVuln = Math.min(VCAP, (t.mem.honglVuln || 0) + 1);
    battle.addBuff(t, { key: 'debuff:honglu:vuln', mods: { dmgTakenMul: 1 + t.mem.honglVuln * VSTEP }, duration: 6, refresh: 'replace', source: owner, visible: true });
  };
  // 呼吸法（天赋1 + 特性）：自叠层 → 常驻刷新攻击力（每 2 层 +3%）；满层向全体边狱放一次攻/攻速爆发
  const addBreath = (battle, u, n) => {
    u.mem = u.mem || {};
    u.mem.breath = Math.min(BREATH_CAP, (u.mem.breath || 0) + n);
    battle.addBuff(u, { key: 'buff:honglu:breath', mods: { atkPct: Math.floor(u.mem.breath / 2) * BREATH_STEP }, duration: 9999, refresh: 'replace', source: u, visible: true });
    if (u.mem.breath >= BREATH_CAP && !u.mem.breathBurst) {
      u.mem.breathBurst = true;
      for (const a of limbusAllies(battle, u)) battle.addBuff(a, { key: 'buff:honglu:regal', mods: { atkPct: num(trb.burst_atk, 0.25), aspd: num(trb.burst_aspd, 20) }, duration: num(trb.burst_dur, 8), refresh: 'replace', source: u, visible: true });
      battle.fx?.('buff', { x: u.x, y: u.y, id: u.id });
    }
  };
  // 精神越高叠得越快：命中按精神决定 +BREATH_GAIN 或 +BREATH_GAIN+1
  const breathOnHit = (battle, u) => addBreath(battle, u, BREATH_GAIN + ((u.mem?.limbusSanity || 0) >= SPIRIT_THR ? 1 : 0));
  // 脆弱 + 呼吸法 每 per 级 → +10% 增伤（动态走 dmgMul；引擎 atkScale 只接受数字）
  const rampMul = (u, t, per, cap) => 1 + Math.min(cap, Math.floor((vulnStacks(t) + (u.mem?.breath || 0)) / per) * 0.1);
  // 卯兔（复用浮士德皮肤的 token_limbus_jaro）：登场即对目标与周围释放一次爆发，造成脆弱损伤，随后离场
  const jaroBurstKit = (owner) => ({
    trait: { noAttack: true },
    install(battle, mao) {
      battle.after(0.25, () => {
        if (!mao.alive) return;
        const foes = battle.enemies.filter((e) => e.alive);
        let tgt = null, best = Infinity;
        for (const e of foes) { const d = Math.hypot(e.x - owner.x, e.y - owner.y); if (d < best) { best = d; tgt = e; } }
        if (tgt) {
          for (const e of foes) if (Math.hypot(e.x - tgt.x, e.y - tgt.y) <= 1.3) {
            battle.dealDamage(mao, e, { amount: mao.s.atk * num(b3.jaro_scale, 3.5), type: 'phys', isSkill: true, tags: ['skill'] });
            addVuln(battle, owner, e); addVuln(battle, owner, e);   // 卯兔攻击造成脆弱损伤（+2 层）
          }
          battle.fx?.('scorchBurst', { x: tgt.x, y: tgt.y, id: mao.id });
        }
        battle.after(0.6, () => { if (mao.alive) battle.retreat(mao, { permanent: true, reason: 'expired' }); }, { owner: mao });
      }, { owner: mao });
    },
  });
  const summonJaro = (battle, unit) => {
    const inherit = num(b3.jaro_inherit, 0.6);
    const fv = DIRV[unit.dir] || [0, 1];
    const stats = { atk: Math.round(unit.s.atk * inherit), maxHp: Math.round(unit.s.maxHp * inherit) };
    for (const [dr, dc] of [fv, [0, 1], [0, -1], [-1, 0], [1, 0]]) {
      const mao = battle.spawnToken(unit, 'token_limbus_jaro', unit.tileR + dr, unit.tileC + dc, { stats, hp: stats.maxHp, duration: 1.5, anySource: true, kit: jaroBurstKit(unit) });
      if (mao) { battle.fx?.('summon', { x: mao.x, y: mao.y, id: mao.id }); return mao; }
    }
    return null;
  };
  return {
    skills: {
      // 我愿开辟前路（AUTO 充能）：攻击力 +60%；开场给 1 友方庇护；命中附凋亡 + 迟缓 + 2 呼吸；脆弱+呼吸 /6 → +10%
      skchr_honglu_1: {
        kind: 'charges',
        mods: { atkPct: num(b1.atk_pct, 0.6) },
        onStart({ battle, unit }) {
          const ally = limbusAllies(battle, unit).find((a) => a !== unit) || unit;
          battle.addBuff(ally, { key: 'buff:honglu:shelter', shield: Math.round(unit.s.atk * num(b1.shelter_scale, 1.0)), duration: 10, refresh: 'replace', source: unit, visible: true });
        },
        attack: {
          dmgMul: (b, u, t) => rampMul(u, t, 6, 0.5),
          onHit({ battle, unit, target }) {
            if (!target || !target.alive) return;
            addBreath(battle, unit, 1);
            applyElementDmg(battle, unit, target, 'apoptosis', num(b1.ep_damage, 220));
            if (num(b1.slow_dur, 1.5) > 0) battle.applyStatus?.(target, 'sluggish', { duration: num(b1.slow_dur, 1.5), source: unit });
            battle.fx?.('aoe', { x: target.x, y: target.y, element: 'apoptosis', id: unit.id });
          }
        }
      },
      // 污血绝志竟成（短持续·多目标）：攻击力 +100%、攻击目标 +1、法术易伤；命中附凋亡 + 2 呼吸；脆弱+呼吸 /6 → +10% ≤+20%
      skchr_honglu_2: {
        kind: 'duration',
        duration: num(b2.duration, 8),
        mods: { atkPct: num(b2.atk_pct, 1.0) },
        targeting: { maxTargets: 1 + Math.max(1, num(b2.extra_targets, 1)) },
        attack: {
          dmgMul: (b, u, t) => rampMul(u, t, 6, 0.2),
          onHit({ battle, unit, target }) {
            if (!target || !target.alive) return;
            addBreath(battle, unit, 1);
            battle.addBuff(target, { key: 'debuff:honglu:magicvuln', mods: { artsTakenMul: 1 + num(b2.magic_vuln, 0.4) }, duration: 5, refresh: 'replace', source: unit });
            applyElementDmg(battle, unit, target, 'apoptosis', num(b2.ep_damage, 120));
          }
        }
      },
      // 全体黑兽，回应于我（充能·召唤）：攻击力 +150%；+3 呼吸；召唤卯兔放一次爆发后消失；脆弱+呼吸 /4 → +10% ≤+30%
      skchr_honglu_3: {
        kind: 'charges',
        mods: { atkPct: num(b3.atk_pct, 1.5) },
        onStart({ battle, unit }) {
          addBreath(battle, unit, 3);
          summonJaro(battle, unit);
          battle.fx?.('buff', { x: unit.x, y: unit.y, id: unit.id });
        },
        attack: {
          dmgMul: (b, u, t) => rampMul(u, t, 4, 0.3),
          onHit({ battle, unit, target }) {
            if (target && target.alive) applyElementDmg(battle, unit, target, 'apoptosis', num(b3.ep_damage, 150));
          }
        }
      }
    },
    talents: [
      // 天赋1 呼吸法：攻击命中 → 叠呼吸法（精神越高越快）；部署时先刷一次底座
      { install(battle, unit) {
          addBreath(battle, unit, 0);
          battle.on('hit', (ev) => {
            if (ev.source !== unit || !ev.dmg || !ev.dmg.isAttack || !ev.target || !ev.target.alive) return;
            breathOnHit(battle, unit);
          }, { owner: unit });
        } },
      // 天赋2 君主的威仪：攻击 → 目标 +1 脆弱；目标脆弱满档时她这一击额外 +REGAL
      { install(battle, unit) {
          battle.on('hit', (ev) => {
            if (ev.source !== unit || !ev.dmg || !ev.dmg.isAttack || !ev.target || !ev.target.alive) return;
            if (vulnStacks(ev.target) >= VCAP) ev.dmg.mul = (ev.dmg.mul || 1) * (1 + REGAL);
            addVuln(battle, unit, ev.target);
          }, { owner: unit });
        } }
    ]
  };
};

// 12. Gregor (格里高尔 - 黎明事务所代表)
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
              battle.dealDamage(unit, target, { amount: unit.s.atk * 1.5, type: 'arts' });
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
        onStart({ battle, unit }) {
          const dir = unit.dir || 'RIGHT';
          const line = battle.enemies.filter(e => {
            if (!e || !e.alive || e.side !== 'enemy') return false;
            const dx = e.x - unit.x, dy = e.y - unit.y;
            if (dir === 'RIGHT') return dx >= 0 && dx <= 4 && Math.abs(dy) <= 1;
            if (dir === 'LEFT')  return dx <= 0 && dx >= -4 && Math.abs(dy) <= 1;
            if (dir === 'UP')    return dy >= 0 && dy <= 4 && Math.abs(dx) <= 1;
            if (dir === 'DOWN')  return dy <= 0 && dy >= -4 && Math.abs(dx) <= 1;
            return false;
          });
          for (const t of line) {
            battle.dealDamage(unit, t, { amount: unit.s.atk * 7.5, type: 'phys' });
            battle.dealDamage(unit, t, { amount: unit.s.atk * 3.5, type: 'arts' });
            applyElementDmg(battle, unit, t, 'burn', 300);
          }
          battle.fx?.('gregor_sunset_brand', { x: unit.x, y: unit.y, dir });
        }
      }
    },
    talents: [
      {
        install(battle, unit) {
          battle.on('hit', (ev) => {
            if (ev.source === unit && ev.target) {
              ev.dmg.mul *= 1.3;
            }
          }, { owner: unit });
        }
      },
      {
        install(battle, unit) {
          battle.on('fatal', (ev) => {
            if (ev.unit === unit && !unit.mem?.dawnRevived) {
              unit.mem = unit.mem || {};
              unit.mem.dawnRevived = true;
              ev.prevented = true;
              unit.hp = Math.floor(unit.s.maxHp * 0.5);
              battle.fx?.('gregor_dawn_fire_sea', { x: unit.x, y: unit.y, r: 3 });
            }
          }, { owner: unit });
        }
      }
    ]
  };
};

const _MOD_KITS = {
  // 1. Yi Sang
  chess_char_1_limbus_yisang_a: yisangKit,
  chess_char_1_limbus_yisang_b: yisangKit,
  char_limbus_yisang: yisangKit,

  // 2. Faust
  chess_char_2_limbus_faust_a: faustKit,
  chess_char_2_limbus_faust_b: faustKit,
  char_limbus_faust: faustKit,

  // 3. Sinclair
  chess_char_1_limbus_sinclair_a: sinclairKit,
  chess_char_1_limbus_sinclair_b: sinclairKit,
  char_limbus_sinclair: sinclairKit,

  // 4. Rodion
  chess_char_3_limbus_rodion_a: rodionKit,
  chess_char_3_limbus_rodion_b: rodionKit,
  char_limbus_rodion: rodionKit,

  // 5. Don Quixote
  chess_char_6_limbus_donquixote_a: donquixoteKit,
  chess_char_6_limbus_donquixote_b: donquixoteKit,
  char_limbus_donquixote: donquixoteKit,

  // 6. Meursault
  chess_char_4_limbus_meursault_a: meursaultKit,
  chess_char_4_limbus_meursault_b: meursaultKit,
  char_limbus_meursault: meursaultKit,

  // 7. Ishmael
  chess_char_2_limbus_ishmael_a: ishmaelKit,
  chess_char_2_limbus_ishmael_b: ishmaelKit,
  char_limbus_ishmael: ishmaelKit,

  // 8. Ryōshū
  chess_char_5_limbus_ryoshu_a: ryoshuKit,
  chess_char_5_limbus_ryoshu_b: ryoshuKit,
  char_limbus_ryoshu: ryoshuKit,

  // 9. Outis
  chess_char_5_limbus_outis_a: outisKit,
  chess_char_5_limbus_outis_b: outisKit,
  char_limbus_outis: outisKit,

  // 10. Heathcliff
  chess_char_3_limbus_heathcliff_a: heathcliffKit,
  chess_char_3_limbus_heathcliff_b: heathcliffKit,
  char_limbus_heathcliff: heathcliffKit,

  // 11. Hong Lu
  chess_char_4_limbus_honglu_a: hongluKit,
  chess_char_4_limbus_honglu_b: hongluKit,
  char_limbus_honglu: hongluKit,

  // 12. Gregor
  chess_char_6_limbus_gregor_a: gregorKit,
  chess_char_6_limbus_gregor_b: gregorKit,
  char_limbus_gregor: gregorKit
};

// ---------------------------------------------------------------------------------------------------------------
// ⚠️ 引擎取的是【单数】kit.skill（默认技能）：selectSkillSpec 在「选中默认技能」时直接 `return kit`，
//    再用 `players.js: u.kit.skill || null` 取技能。本文件原先只提供了 `skills` 映射（只在玩家选了
//    非默认技能时才被用），于是**默认技能完全没有任何效果** —— 叠层、元素损伤、伤害加成都不会生效。
//    这里统一给每个 kit 补上 skill = 默认技能（罪人默认 3 技能 <名>_3，没有则退回 _1 / 第一个）。
const _withDefaultSkill = (id) => (fn) => (bb, chess, def) => {
  const k = fn(bb, chess, def) || {};
  if (k.skills) {
    const keys = Object.keys(k.skills);
    const dflt = k.skills[keys.find((x) => /_3$/.test(x)) || keys.find((x) => /_1$/.test(x)) || keys[0]];
    if (dflt) { k.skill = dflt; k.skillSource = 'skills'; }
  }
  // 装上「自叠层 / 资源」（stacks.js）与「特质协同」（installTraits；弹药类走技能 kind:'ammo'）
  const own = typeof k.install === 'function' ? k.install : null;
  k.install = (battle, unit) => { if (own) own(battle, unit); installStacks(battle, unit, id); installTraits(battle, unit, id); };
  return k;
};

// 特质协同机制（相辅相成，服务于「铺→放大→引爆 + 精神经济」）。按 kit 注册键匹配罪人。
function installTraits(battle, unit, id) {
  if (!unit || unit.kind !== 'op') return;
  const name = (String(id).match(/limbus_([a-z]+)/) || [])[1];
  const selfSrc = (ev) => ev && ev.source === unit && unit.alive;
  const fragile = (t, mul, dur, key) => t && t.alive && battle.addBuff(t, { key, mods: { dmgTakenMul: mul }, duration: dur, visible: true, source: unit });

  if (name === 'ishmael') {
    // 脆弱放大：攻击使目标受到的伤害提升（惠及全队）
    battle.on('damaged', (ev) => { if (selfSrc(ev)) fragile(ev.target, 1.15, 4, 'debuff:ishmael:fragile'); }, { owner: unit });
  } else if (name === 'outis') {
    // 破防放大：攻击降低目标防御，全体边狱对其增伤
    battle.on('damaged', (ev) => {
      if (selfSrc(ev) && ev.target && ev.target.alive)
        battle.addBuff(ev.target, { key: 'debuff:outis:defdown', mods: { defMul: 0.7 }, duration: 4, visible: true, source: unit });
    }, { owner: unit });
  } else if (name === 'meursault') {
    // 对带【神经损伤】的敌人增伤（引爆由其技能负责）
    battle.on('hit', (ev) => { if (selfSrc(ev) && (ev.target?.elem?.neural ?? 0) > 0) ev.dmg.mul *= 1.2; }, { owner: unit });
  } else if (name === 'gregor') {
    // 特质：攻击附带【灼燃】；开启技能后，全体友方获得【灼燃】伤害提升（applyElementDmg 读 mem 窗口）
    battle.on('damaged', (ev) => {
      if (selfSrc(ev) && ev.target && ev.target.alive) {
        applyElementDmg(battle, unit, ev.target, 'burn', 80);
      }
    }, { owner: unit });
    battle.on('skillStart', (ev) => {
      if ((ev.unit || ev.source) !== unit || !unit.alive) return;
      const until = (battle.time || 0) + 15;
      const allies = (battle.allies?.(unit.ownerId) || []).filter((a) => a && a.alive && a.kind === 'op');
      for (const a of allies) { a.mem = a.mem || {}; a.mem.burnBoostUntil = until; a.mem.burnBoostMul = 1.3; }
      battle.fx?.('gregor_dawn_light', { x: unit.x, y: unit.y });
    }, { owner: unit });
  } else if (name === 'heathcliff') {
    // enabler：击败敌人使攻击范围内边狱友方回复技力
    battle.on('kill', (ev) => {
      if ((ev.killer || ev.source) !== unit || !unit.alive) return;
      const allies = (battle.allies?.(unit.ownerId) || []).filter(
        (a) => a && a.alive && a !== unit && (a.def?.raw?.nationId === 'limbus' || a.def?.nationId === 'limbus') && Math.hypot(a.x - unit.x, a.y - unit.y) <= 2.5);
      for (const a of allies) a.skill?.gainSp?.(2, 'talent');
    }, { owner: unit });
  } else if (name === 'faust') {
    // tempo：在场降低相邻边狱友方技力消耗（周期刷新 aura）
    battle.on('tick', () => {
      if (!unit.alive) return;
      const allies = (battle.allies?.(unit.ownerId) || []).filter(
        (a) => a && a.alive && a !== unit && (a.def?.raw?.nationId === 'limbus' || a.def?.nationId === 'limbus') && Math.hypot(a.x - unit.x, a.y - unit.y) <= 1.5);
      for (const a of allies) battle.addBuff(a, { key: 'buff:faust:tempo', mods: { spCostFlat: -1 }, duration: 1.2, visible: true, source: unit });
    }, { owner: unit });
  }
}

export default Object.fromEntries(
  Object.entries(_MOD_KITS).map(([id, fn]) => [id, _withDefaultSkill(id)(fn)]));
