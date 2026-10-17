// mods/limbus-company/sim/stacks.js — 12 罪人的「自叠层 / 资源」实现。
//
// 沿用的是自带 kit 的写法（server/sim/content/kits/ops/*.js）：
//   * 叠层计数放在 unit.mem.<key>，用 battle.on(...) 加减；
//   * 增益用 battle.addBuff(unit, { key, mods, duration }) 上，层数变了就刷新；
//   * 弹药类资源（虎标弹 / 魔弹）**不在这里**，走引擎的 ammo 系统（技能 kind:'ammo'）。
//
// 术语（见 CORRECTION-技能与人格对照.md §一）：
//   沉沦→凋亡损伤  烧伤→灼燃损伤  流血→【流血】  神经损伤→【神经损伤】  破裂→脆弱  理智→【理智】
//   其余人格专属资源保留原名。

/** 方舟 buff mods 里用到的键（见 server/sim/buffs.js）：atkPct / aspd / dmgDealtMul / dmgTakenMul / spCostPct … */
const cap = (n) => Math.max(0, n);

/**
 * 每人一条声明。字段：
 *   key    叠层计数名（unit.mem[key]）
 *   cap    上限
 *   on     触发事件名（sim 真实事件：damaged / kill / hit / skillStart / skillEnd / elementHit …）
 *   gain   每次触发增加层数（数字或 (ctx)=>{...}）
 *   from   触发者判定：'self'（自己是 source/attacker）| 'selfTarget'（自己是 target）
 *   mods   层数 → buff mods（数字层数进）
 *   visible 是否在 UI 上显示这个 buff
 */
// 重构 2026-10-11：原来 12 罪人各挂一条独立命名的自叠层(紊乱/呼吸法/棺/狂信/深泪/黑焰…)，全都只给
// 攻击力%、互不相干——一盘散沙。现已统一成「个人轴=精神值 + 团队池=金枝共鸣」两件套（见 bonds.js）：
//   * 精神值 → 个人攻击力（正理智线 / 负理智人格爆发）
//   * 金枝共鸣   → 全队攻击/攻速 + 周期引爆敌人损伤（任意罪人精神推到极值即为全队充能）
// 所以这里的散装自叠层表清空；各罪人的招牌资源(呼吸法/充能/点穴等)作为"操纵精神/投放损伤"的手段留在各自 kit 里。
export const STACKS = {};

/** 从 kit 的注册键里取罪人名（chess_char_1_limbus_yisang_a → yisang）。 */
function sinnerOf(id) {
  const m = String(id).match(/limbus_([a-z]+)/);
  return m ? m[1] : null;
}

/**
 * 给一个 unit 装上声明式叠层。返回 false 表示这个人没有配置。
 * @param {object} battle
 * @param {object} unit
 * @param {string} id kit 的注册键
 */
export function installStacks(battle, unit, id) {
  const name = sinnerOf(id);
  const def = name && STACKS[name];
  if (!def || !unit || unit.kind !== 'op') return false;

  const key = `limbus:stack:${name}`;
  unit.mem = unit.mem || {};
  if (unit.mem[def.key] == null) unit.mem[def.key] = 0;

  const refresh = () => {
    const n = unit.mem[def.key];
    battle.addBuff(unit, {
      key,
      mods: n > 0 ? def.mods(n) : {},
      persist: true,
      allowDead: true,
      visible: !!def.visible,
      source: unit,
    });
    // ★主叠层手★：把层数转成全体【边狱公司】友方的团队增益（罗佳=稳定电池 / 鸿璐=叠满爆发）
    if (def.team) {
      const teamKey = `limbus:teamstack:${def.teamKey || name}`;
      const tmods = n > 0 ? def.team(n) : {};
      const allies = (battle.allies?.(unit.ownerId) || []).filter(
        (a) => a && a.alive && a.kind === 'op' && (a.def?.raw?.nationId === 'limbus' || a.def?.nationId === 'limbus') && a !== unit,
      );
      for (const a of allies) {
        battle.addBuff(a, { key: teamKey, mods: tmods, persist: true, visible: true, source: unit });
      }
    }
  };

  const add = (n) => {
    const before = unit.mem[def.key];
    unit.mem[def.key] = cap(Math.min(def.cap, before + n));
    if (unit.mem[def.key] !== before) {
      refresh();
      battle.fx?.('buff', { x: unit.x, y: unit.y, id: unit.id, kind: name });
    }
  };

  refresh();

  // 触发：只认「自己造成的」或「自己承受的」，避免被别人的事件刷
  battle.on(def.on, (c) => {
    if (!unit.alive) return;
    const mine = def.from === 'selfTarget'
      ? c.target === unit
      : (c.source === unit || c.attacker === unit || c.killer === unit || c.unit === unit);
    if (!mine) return;
    const g = typeof def.gain === 'function' ? def.gain(c) : def.gain;
    if (g > 0) add(g);
  }, { owner: unit });

  return true;
}
