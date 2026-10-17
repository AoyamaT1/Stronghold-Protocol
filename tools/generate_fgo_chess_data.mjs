// tools/build_fgo_compliant_data.mjs — Generates fully compliant chess.json and garrisons.json for FGO Round Table Mod
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOD_DATA_DIR = path.join(ROOT, 'mods', 'fgo-round-table', 'data');

const RANGE_MELEE_1 = [[0, 0]];
const RANGE_MELEE_2 = [[0, 0], [0, 1]];
const RANGE_SNIPER_3X3 = [
  [-1, 1], [-1, 2], [-1, 3],
  [0, 0], [0, 1], [0, 2], [0, 3],
  [1, 1], [1, 2], [1, 3]
];
const RANGE_CASTER_3X3 = [
  [-1, 0], [-1, 1], [-1, 2],
  [0, 0], [0, 1], [0, 2], [0, 3],
  [1, 0], [1, 1], [1, 2]
];
// 群愈师（ringhealer）的射程，与 data/chess.json 里原版医疗一致
const RANGE_MEDIC_3X4 = [
  [-1, -1], [-1, 0], [-1, 1], [-1, 2],
  [0, -1], [0, 0], [0, 1], [0, 2],
  [1, -1], [1, 0], [1, 1], [1, 2],
];
// 吟游者（bard）的射程，取自原版 SUPPORT/bard「魔王」
const RANGE_BARD = [
  [2, 0], [1, -1], [1, 0], [1, 1], [0, -2], [0, -1], [0, 0], [0, 1], [0, 2],
  [-1, -1], [-1, 0], [-1, 1], [-2, 0],
];
// 巡空者（skywalker）的射程，取自原版 SPECIAL/skywalker「蒂比」（前方三格）
const RANGE_SKYWALKER = [[0, 0], [0, 1], [0, 2]];

const OPS = [
  {
    id: "gareth",
    name: "加雷斯",
    appellation: "Gareth",
    tier: 1,
    rarity: 4,
    profession: "PIONEER",
    subProfessionId: "pioneer",
    subProfessionName: "尖兵",
    position: "MELEE",
    bonds: ["roundTable", "indomShip", "steadShip"],
    dmgType: "phys",
    attackKind: "melee",
    projectile: null,
    canHitFly: false,
    rangeGrid: RANGE_MELEE_2,
    baseStats: { maxHp: 1650, atk: 420, def: 280, res: 0, cost: 10, blockCnt: 2, bat: 1.05, aspd: 100, respawnTime: 70 },
    eliteStats: { maxHp: 2450, atk: 520, def: 410, res: 0, cost: 10, blockCnt: 2, bat: 1.05, aspd: 100, respawnTime: 70 },
    trait: {
      desc: "阻挡两个敌人",
      descRaw: "阻挡两个敌人",
      bb: { blockCnt: 2 }
    },
    talent: {
      name: "狼之怒",
      desc: "生命值低于 50% 时防御力 +30% 且获得 15% 物理闪避",
      descRaw: "生命值低于 50% 时防御力 <@ba.vup>+30%</> 且获得 <@ba.vup>15%</> 物理闪避",
      bb: { hp_threshold: 0.5, def_pct: 0.3, dodge: 0.15 }
    },
    skills: [
      {
        id: "skchr_fgo_gareth_1",
        name: "美掌加雷斯",
        desc: "下次攻击造成 190% 物理伤害，并使自身攻击力 +15%，持续 8 秒，最多叠加 3 层",
        spType: "INCREASE_WHEN_TAKEDAMAGE",
        spCost: 4,
        initSp: 0,
        skillType: "AUTO",
        durationType: "NONE",
        duration: 0,
        bb: { atk_scale: 1.9, atk_buff: 0.15, buff_dur: 8, max_stacks: 3 }
      },
      {
        id: "skchr_fgo_gareth_2",
        name: "变身戒指",
        desc: "持续 8 秒，更容易受到攻击，防御力 +70%，获得 1 层物理护盾，受击时额外回复 1 点技力",
        spType: "INCREASE_WITH_TIME",
        spCost: 18,
        initSp: 8,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 8,
        bb: { def_pct: 0.7, shield_layers: 1, hit_sp: 1, taunt_level: 1 }
      },
      {
        id: "skchr_fgo_gareth_3",
        name: "狂暴少女狼",
        desc: "获得 1 次持续 6 秒的致命伤锁血【狼不眠】，立即对前方一格目标发动 5 段连续枪刺，每段造成 110% 物理伤害（无视闪避）并使目标防御力 -20%，持续 6 秒",
        spType: "INCREASE_WITH_TIME",
        spCost: 22,
        initSp: 10,
        skillType: "AUTO",
        durationType: "NONE",
        duration: 0,
        bb: { undying_sec: 6, hits: 5, atk_scale: 1.1, def_reduction: -0.2, debuff_dur: 6 }
      }
    ]
  },
  {
    id: "bedivere",
    name: "贝德维尔",
    appellation: "Bedivere",
    tier: 2,
    rarity: 5,
    // 用户 2026-10-17：近卫 7 个太多。他三个技能里两个是纯支援（S1 回友方技力、S2 全场加防+清异常），
    // 改「辅助/吟游者」。吟游者按明日方舟原设**不普通攻击**（attackKind 'none' + 职业自带的 noAttack），
    // 普攻时机用来持续恢复范围内友军生命 —— 代价是他彻底不能普攻，但技能照常（S3 仍打 480%）。
    profession: "SUPPORT",
    subProfessionId: "bard",
    subProfessionName: "吟游者",
    position: "RANGED",
    bonds: ["roundTable", "deputShip", "preciShip"],
    dmgType: "heal",
    attackKind: "none",
    projectile: null,
    canHitFly: false,
    rangeGrid: RANGE_BARD,
    baseStats: { maxHp: 2200, atk: 580, def: 230, res: 0, cost: 16, blockCnt: 1, bat: 1.5, aspd: 100, respawnTime: 70 },
    eliteStats: { maxHp: 2800, atk: 710, def: 350, res: 0, cost: 16, blockCnt: 1, bat: 1.5, aspd: 100, respawnTime: 70 },
    trait: {
      desc: "不攻击，持续恢复范围内所有友军生命（每秒相当于自身攻击力10%的生命），自身不受鼓舞影响",
      descRaw: "不攻击，持续恢复范围内所有友军生命（每秒相当于自身攻击力<@ba.vup>10%</>的生命），自身不受鼓舞影响",
      bb: {}
    },
    talent: {
      name: "执著之心",
      desc: "技能未开启时，攻击力 +15%；受到致死伤害时保留 1 点生命值并无敌 2 秒（每场战斗 1 次）",
      descRaw: "技能未开启时，攻击力 <@ba.vup>+15%</>；受到致死伤害时保留 1 点生命值并无敌 2 秒（每场战斗 1 次）",
      bb: { idle_atk_pct: 0.15, undying_sec: 2 }
    },
    skills: [
      {
        id: "skchr_fgo_bedivere_1",
        name: "沉着冷静",
        desc: "立即回复周围 4 格随机 1 名友方 4 点技力，自身攻击力 +55% 并获得抵抗，持续 8 秒",
        spType: "INCREASE_WITH_TIME",
        spCost: 14,
        initSp: 10,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 8,
        bb: { sp_grant: 4, atk_pct: 0.55, buffres: 1 }
      },
      {
        id: "skchr_fgo_bedivere_2",
        name: "守护的誓约",
        desc: "持续 10 秒，周围 8 格所有我方干员防御力 +35%、法术抗性 +15，并清除 1 个异常状态",
        spType: "INCREASE_WITH_TIME",
        spCost: 22,
        initSp: 12,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 10,
        bb: { def_pct: 0.35, res_add: 15, cleanse_count: 1 }
      },
      {
        id: "skchr_fgo_bedivere_3",
        name: "紧握其剑，银之臂",
        desc: "对目标打出银臂重拳造成 480% 物理伤害；蓄力状态伤害提升至 720% 且无视 40% 防御力，同时使已激活【圆桌】层数 +2",
        spType: "INCREASE_WITH_TIME",
        spCost: 24,
        initSp: 15,
        skillType: "AUTO",
        durationType: "NONE",
        duration: 0,
        bb: { atk_scale: 4.8, charge_atk_scale: 7.2, def_ignore: 0.4, round_table_layer: 2, charged: 1 }
      }
    ]
  },
  {
    id: "tristan",
    name: "崔斯坦",
    appellation: "Tristan",
    tier: 2,
    rarity: 5,
    profession: "SNIPER",
    subProfessionId: "fastshot",
    subProfessionName: "神射手",
    position: "RANGED",
    bonds: ["roundTable", "preciShip", "swiftShip"],
    dmgType: "phys",
    attackKind: "ranged",
    projectile: "arrow",
    canHitFly: true,
    rangeGrid: RANGE_SNIPER_3X3,
    baseStats: { maxHp: 1450, atk: 540, def: 160, res: 0, cost: 13, blockCnt: 1, bat: 1.6, aspd: 100, respawnTime: 70 },
    eliteStats: { maxHp: 2150, atk: 720, def: 240, res: 0, cost: 13, blockCnt: 1, bat: 1.6, aspd: 100, respawnTime: 70 },
    trait: {
      desc: "优先攻击空中单位",
      descRaw: "优先攻击空中单位",
      bb: {}
    },
    talent: {
      name: "悲痛之琴",
      desc: "攻击使目标移动速度 -25%，持续 2 秒；对处于移动减速状态的敌人造成的伤害提升 20%",
      descRaw: "攻击使目标移动速度 <@ba.vup>-25%</>，持续 2 秒；对处于移动减速状态的敌人造成的伤害提升 <@ba.vup>20%</>",
      bb: { slow_pct: 0.25, bonus_dmg: 0.2 }
    },
    skills: [
      {
        id: "skchr_fgo_tristan_1",
        name: "绝音的哀歌",
        desc: "解除自身周围 8 格友方的眩晕与沉默，回复相当于 120% 攻击力的生命值，并获得 40% 物理与法术闪避，持续 6 秒",
        spType: "INCREASE_WITH_TIME",
        spCost: 16,
        initSp: 10,
        skillType: "AUTO",
        durationType: "NONE",
        duration: 0,
        bb: { heal_scale: 1.2, dodge_rate: 0.4, buff_dur: 6 }
      },
      {
        id: "skchr_fgo_tristan_2",
        name: "骑士王的挽歌",
        desc: "对生命值最高的敌人发射 3 连弦音，每箭造成 160% 物理伤害并施加 6 秒沉默，目标攻击力 -20%",
        spType: "INCREASE_WITH_TIME",
        spCost: 20,
        initSp: 12,
        skillType: "AUTO",
        durationType: "NONE",
        duration: 0,
        bb: { hits: 3, atk_scale: 1.6, silence_dur: 6, atk_debuff: -0.2 }
      },
      {
        id: "skchr_fgo_tristan_3",
        name: "痛哭的幻奏",
        desc: "锁定场上最大生命值最高的敌方首领或精英，发射 7 道真空音波弦，每道造成 105% 物理伤害（无视闪避与 30% 防御力），并施加 25% 物理脆弱，持续 5 秒",
        spType: "INCREASE_WITH_TIME",
        spCost: 26,
        initSp: 16,
        skillType: "AUTO",
        durationType: "NONE",
        duration: 0,
        bb: { hits: 7, atk_scale: 1.05, def_ignore: 0.3, fragile: 0.25, debuff_dur: 5 }
      }
    ]
  },
  {
    id: "percival",
    name: "珀西瓦尔",
    appellation: "Percival",
    tier: 3,
    rarity: 5,
    // 用户 2026-10-16 决定：把他从「重装/守护者」改成「医疗/群愈师」——
    // 15 人里近卫占了 7 个，而 1~3 阶完全没有能持续奶的干员（唯一的医疗梅林是 6 阶）。
    // 他本来就是三个技能全带治疗、专救最低生命友方，改医疗最自然，而且 3 阶拿得到。
    profession: "MEDIC",
    subProfessionId: "ringhealer",
    subProfessionName: "群愈师",
    position: "RANGED",
    bonds: ["roundTable", "steadShip", "miraShip"],
    dmgType: "heal",
    attackKind: "heal",
    projectile: null,
    canHitFly: false,
    rangeGrid: RANGE_MEDIC_3X4,
    baseStats: { maxHp: 2350, atk: 490, def: 380, res: 10, cost: 19, blockCnt: 1, bat: 1.2, aspd: 100, respawnTime: 70 },
    eliteStats: { maxHp: 2850, atk: 680, def: 520, res: 15, cost: 19, blockCnt: 1, bat: 1.2, aspd: 100, respawnTime: 70 },
    trait: {
      desc: "同时恢复三个友方单位的生命",
      descRaw: "同时恢复三个友方单位的生命",
      bb: {}
    },
    talent: {
      name: "巡礼之护",
      desc: "受到攻击时，有 30% 概率回复自身 4% 最大生命",
      descRaw: "受到攻击时，有 30% 概率回复自身 <@ba.vup>4%</> 最大生命",
      bb: { heal_prob: 0.3, heal_ratio: 0.04 }
    },
    skills: [
      {
        id: "skchr_fgo_percival_1",
        name: "圣枪守护",
        desc: "生命值低于 50% 时立即触发，为周围 8 格生命最低友方回复 220% 攻击力的生命值，且自身防御力 +50%，持续 6 秒",
        spType: "INCREASE_WHEN_TAKEDAMAGE",
        spCost: 15,
        initSp: 0,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 6,
        bb: { heal_scale: 2.2, def_pct: 0.5, duration: 6 }
      },
      {
        id: "skchr_fgo_percival_2",
        name: "骑士的礼节",
        desc: "持续 10 秒，防御力 +85%，阻挡数 +1，每次阻挡敌人时使自身与受保护友方获得 1 层护盾并持续回复生命",
        spType: "INCREASE_WITH_TIME",
        spCost: 20,
        initSp: 10,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 10,
        bb: { def_pct: 0.85, block_add: 1, shield_layers: 1, heal_scale: 2.0 }
      },
      {
        id: "skchr_fgo_percival_3",
        name: "光芒耀眼，圣枪之辉",
        desc: "向前方 3x3 范围突刺圣枪，造成 4 段共 400% 法术伤害（对巨型或魔生生物提升至 600%），治疗周围 8 格友方 260% 攻击力生命",
        spType: "INCREASE_WITH_TIME",
        spCost: 28,
        initSp: 14,
        skillType: "AUTO",
        durationType: "NONE",
        duration: 0,
        bb: { hits: 4, atk_scale: 1.0, beast_atk_scale: 1.5, heal_scale: 2.6 }
      }
    ]
  },
  {
    id: "baobhan",
    name: "芭万·希",
    appellation: "Baobhan Sith",
    tier: 3,
    rarity: 5,
    profession: "CASTER",
    subProfessionId: "witch",
    subProfessionName: "巫役",
    position: "RANGED",
    bonds: ["roundTable", "arcaneShip", "swiftShip"],
    dmgType: "arts",
    attackKind: "ranged",
    projectile: "bolt",
    canHitFly: true,
    rangeGrid: RANGE_CASTER_3X3,
    baseStats: { maxHp: 1550, atk: 520, def: 180, res: 15, cost: 16, blockCnt: 1, bat: 1.4, aspd: 100, respawnTime: 70 },
    eliteStats: { maxHp: 2280, atk: 750, def: 270, res: 20, cost: 16, blockCnt: 1, bat: 1.4, aspd: 100, respawnTime: 70 },
    trait: {
      desc: "攻击造成法术伤害",
      descRaw: "攻击造成法术伤害",
      bb: {}
    },
    talent: {
      name: "鲜血恩赐",
      desc: "对处于凋亡损伤状态的敌人造成的法术伤害提升 25%，且攻击时恢复造成伤害 20% 的生命",
      descRaw: "对处于凋亡损伤状态的敌人造成的法术伤害提升 <@ba.vup>25%</>，且攻击时恢复造成伤害 <@ba.vup>20%</> 的生命",
      bb: { bonus_dmg: 0.25, lifesteal: 0.2 }
    },
    skills: [
      {
        id: "skchr_fgo_baobhan_1",
        name: "痛苦汲取",
        desc: "对目标造成 260% 法术伤害并造成 250 点凋亡损伤，回复等量造成的生命值并偷取 4 点技力",
        spType: "INCREASE_WITH_TIME",
        spCost: 15,
        initSp: 8,
        skillType: "AUTO",
        durationType: "NONE",
        duration: 0,
        bb: { atk_scale: 2.6, necrosis: 250, sp_drain: 4 }
      },
      {
        id: "skchr_fgo_baobhan_2",
        name: "受虐狂热",
        desc: "使周围 8 格敌人全部沉默 6 秒并减速 50%，友方单位承受 150 点纯粹伤害但攻速 +25、闪避 +35%，持续 8 秒",
        spType: "INCREASE_WITH_TIME",
        spCost: 24,
        initSp: 12,
        skillType: "AUTO",
        durationType: "NONE",
        duration: 0,
        bb: { silence_dur: 6, slow_pct: 0.5, ally_hp_cost: 150, aspd_buff: 25, dodge_buff: 0.35, dur: 8 }
      },
      {
        id: "skchr_fgo_baobhan_3",
        name: "绝叫之血池",
        desc: "对目标进行 6 段咒杀穿刺，总计造成 540% 法术伤害（目标带异常时提升至 756%），附带 600 点凋亡损伤，击倒目标全队回 3 技力",
        spType: "INCREASE_WITH_TIME",
        spCost: 30,
        initSp: 18,
        skillType: "AUTO",
        durationType: "NONE",
        duration: 0,
        bb: { hits: 6, atk_scale: 0.9, debuff_mult: 1.4, necrosis: 600, sp_grant_on_kill: 3 }
      }
    ]
  },
  {
    id: "gawain",
    name: "高文",
    appellation: "Gawain",
    tier: 4,
    rarity: 5,
    profession: "WARRIOR",
    subProfessionId: "centurion",
    subProfessionName: "强攻手",
    position: "MELEE",
    bonds: ["roundTable", "indomShip", "raidShip"],
    dmgType: "phys",
    attackKind: "melee",
    projectile: null,
    canHitFly: false,
    rangeGrid: RANGE_MELEE_2,
    baseStats: { maxHp: 2200, atk: 640, def: 320, res: 0, cost: 21, blockCnt: 2, bat: 1.25, aspd: 100, respawnTime: 70 },
    eliteStats: { maxHp: 2800, atk: 720, def: 440, res: 0, cost: 21, blockCnt: 2, bat: 1.4, aspd: 100, respawnTime: 70 },
    trait: {
      desc: "同时攻击阻挡的所有敌人",
      descRaw: "同时攻击阻挡的所有敌人",
      bb: { blockCnt: 2 }
    },
    talent: {
      name: "圣者的数字",
      desc: "战斗开始前 20 秒，攻击力 +25%，受到伤害降低 20%",
      descRaw: "战斗开始前 20 秒，攻击力 <@ba.vup>+25%</>，受到伤害降低 <@ba.vup>20%</>",
      bb: { atk_pct: 0.25, dmg_res: 0.2, dur: 20 }
    },
    skills: [
      {
        id: "skchr_fgo_gawain_1",
        name: "圣剑强化",
        desc: "持续 12 秒，攻击力 +60%，普通攻击附带 25% 攻击力的灼燃损伤，阻挡数 +1",
        spType: "INCREASE_WITH_TIME",
        spCost: 18,
        initSp: 10,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 12,
        bb: { atk_pct: 0.6, burn_scale: 0.25, block_add: 1 }
      },
      {
        id: "skchr_fgo_gawain_2",
        name: "日轮照耀",
        desc: "全场我方干员攻击力 +25%，地块转为阳光照射，高文自身获得 1 次致命伤抵挡并充能 6 点技力",
        spType: "INCREASE_WITH_TIME",
        spCost: 26,
        initSp: 14,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 15,
        bb: { team_atk_pct: 0.25, undying: 1, sp_charge: 6, duration: 15 }
      },
      {
        id: "skchr_fgo_gawain_3",
        name: "转轮胜利之剑",
        desc: "斩出日轮光弧对前方 3x4 区域造成 420% 物理伤害 + 500 点灼燃 + 4 秒沉默，普攻打 3 人且暴击率 +40%，持续 12 秒",
        spType: "INCREASE_WITH_TIME",
        spCost: 32,
        initSp: 18,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 12,
        bb: { init_atk_scale: 4.2, burn: 500, silence_dur: 4, targets: 3, crit_rate: 0.4, atk_pct: 0.8 }
      }
    ]
  },
  {
    id: "barghest",
    name: "巴格斯特",
    appellation: "Barghest",
    tier: 4,
    rarity: 5,
    profession: "WARRIOR",
    subProfessionId: "musha",
    subProfessionName: "武者",
    position: "MELEE",
    bonds: ["roundTable", "steadShip", "indomShip"],
    dmgType: "phys",
    attackKind: "melee",
    projectile: null,
    canHitFly: false,
    rangeGrid: RANGE_MELEE_1,
    baseStats: { maxHp: 2600, atk: 620, def: 360, res: 0, cost: 24, blockCnt: 2, bat: 1.25, aspd: 100, respawnTime: 70 },
    eliteStats: { maxHp: 2850, atk: 690, def: 540, res: 0, cost: 24, blockCnt: 2, bat: 1.35, aspd: 100, respawnTime: 70 },
    trait: {
      desc: "无法被友方角色治疗，攻击敌人时回复自身生命",
      descRaw: "无法被友方角色治疗，攻击敌人时回复自身生命",
      bb: { self_heal: 1 }
    },
    talent: {
      name: "食欲旺盛",
      desc: "普攻吸血 5%；击倒敌人时最大生命值 +5%（最多叠加 6 层），并立即回复 15% 最大生命",
      descRaw: "普攻吸血 5%；击倒敌人时最大生命值 <@ba.vup>+5%</>（最多叠加 6 层），并立即回复 15% 最大生命",
      bb: { lifesteal: 0.05, hp_per_kill: 0.05, max_stacks: 6, heal_on_kill: 0.15 }
    },
    skills: [
      {
        id: "skchr_fgo_barghest_1",
        name: "强壮捕食",
        desc: "持续 8 秒，攻击力 +50%，攻击时吸取伤害 8% 的生命值，防御力 +40%",
        spType: "INCREASE_WHEN_ATTACK",
        spCost: 12,
        initSp: 0,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 8,
        bb: { atk_pct: 0.5, lifesteal: 0.08, def_pct: 0.4 }
      },
      {
        id: "skchr_fgo_barghest_2",
        name: "野性咆哮",
        desc: "持续 10 秒，防御力 +80%，周围 8 格地带进入烈火灼烧状态，处于其中的敌人每秒受到 120% 法伤与 30% 减速",
        spType: "INCREASE_WITH_TIME",
        spCost: 22,
        initSp: 12,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 10,
        bb: { def_pct: 0.8, dps_scale: 1.2, slow_pct: 0.3, dur: 10 }
      },
      {
        id: "skchr_fgo_barghest_3",
        name: "黑犬暴食",
        desc: "化为黑犬向前扑击 3 段造成 580% 物理重创，击杀任意敌人回复 8 技力并永久增加 5% 最大生命值",
        spType: "INCREASE_WITH_TIME",
        spCost: 28,
        initSp: 15,
        skillType: "AUTO",
        durationType: "NONE",
        duration: 0,
        bb: { hits: 3, atk_scale: 1.93, kill_sp: 8, perm_hp_pct: 0.05 }
      }
    ]
  },
  {
    id: "mash",
    name: "玛修",
    appellation: "Mash",
    tier: 4,
    rarity: 5,
    profession: "TANK",
    subProfessionId: "protector",
    subProfessionName: "铁卫",
    position: "MELEE",
    bonds: ["roundTable", "steadShip", "maniShip"],
    dmgType: "phys",
    attackKind: "melee",
    projectile: null,
    canHitFly: false,
    rangeGrid: RANGE_MELEE_1,
    baseStats: { maxHp: 2400, atk: 450, def: 420, res: 10, cost: 18, blockCnt: 3, bat: 1.2, aspd: 100, respawnTime: 70 },
    eliteStats: { maxHp: 2850, atk: 580, def: 550, res: 15, cost: 18, blockCnt: 3, bat: 1.2, aspd: 100, respawnTime: 70 },
    trait: {
      desc: "阻挡三个敌人",
      descRaw: "阻挡三个敌人",
      bb: { blockCnt: 3 }
    },
    talent: {
      name: "决意之盾",
      desc: "自身阻挡敌人时受到伤害降低 25%；身后一格的友方单位受到的伤害降低 15%",
      descRaw: "自身阻挡敌人时受到伤害降低 <@ba.vup>25%</>；身后一格的友方单位受到的伤害降低 <@ba.vup>15%</>",
      bb: { block_res: 0.25, protect_res: 0.15 }
    },
    skills: [
      {
        id: "skchr_fgo_mash_1",
        name: "现在的脆弱雪花之壁",
        desc: "持续 12 秒，自身阻挡数 +1 并强制嘲讽全场，使周围 8 格所有友方干员防御力 +40%、受到的所有伤害固定减免 250 点",
        spType: "INCREASE_WITH_TIME",
        spCost: 18,
        initSp: 10,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 12,
        bb: { def_pct: 0.4, flat_dmg_reduction: 250, block_add: 1, taunt_level: 2 }
      },
      {
        id: "skchr_fgo_mash_2",
        name: "奋起之盾",
        desc: "立即为自身充能 15 点技力并获得 1 次绝对无敌（持续 5 秒），使周围 8 格所有友方干员攻速 +30，持续 8 秒",
        spType: "INCREASE_WITH_TIME",
        spCost: 24,
        initSp: 12,
        skillType: "AUTO",
        durationType: "NONE",
        duration: 0,
        bb: { sp_charge: 15, invulnerable_sec: 5, aspd_buff: 30, buff_dur: 8 }
      },
      {
        id: "skchr_fgo_mash_3",
        name: "已然遥远的理想之城",
        desc: "首次开启：全队获得 1 层对肃正防御护盾与 +25% 攻击力；再次开启：发射人理之剑造成 750% 真实伤害（精英或领袖伤害提升至 1125%）",
        spType: "INCREASE_WITH_TIME",
        spCost: 32,
        initSp: 20,
        skillType: "AUTO",
        durationType: "NONE",
        duration: 0,
        bb: { trueshield_layers: 1, team_atk_pct: 0.25, atk_scale: 7.5, boss_atk_scale: 11.25 }
      }
    ]
  },
  {
    id: "lancelot",
    name: "兰斯洛特",
    appellation: "Lancelot",
    tier: 5,
    rarity: 6,
    profession: "WARRIOR",
    subProfessionId: "swordmaster",
    subProfessionName: "剑豪",
    position: "MELEE",
    bonds: ["roundTable", "arcaneShip", "swiftShip"],
    dmgType: "phys",
    attackKind: "melee",
    projectile: null,
    canHitFly: false,
    rangeGrid: RANGE_MELEE_2,
    baseStats: { maxHp: 2750, atk: 710, def: 350, res: 0, cost: 23, blockCnt: 2, bat: 1.3, aspd: 100, respawnTime: 70 },
    eliteStats: { maxHp: 3850, atk: 820, def: 500, res: 0, cost: 23, blockCnt: 2, bat: 1.3, aspd: 100, respawnTime: 70 },
    trait: {
      desc: "通常攻击造成物理伤害，技能开启期间攻击阻挡的所有敌人",
      descRaw: "通常攻击造成物理伤害，技能开启期间攻击阻挡的所有敌人",
      bb: { blockCnt: 2 }
    },
    talent: {
      name: "精灵的加护",
      desc: "攻击速度 +25，暴击率 +20%，攻击时有 25% 概率获得 1 点额外技力",
      descRaw: "攻击速度 <@ba.vup>+25</>，暴击率 <@ba.vup>+20%</>，攻击时有 25% 概率获得 1 点额外技力",
      bb: { aspd: 25, crit_rate: 0.2, sp_prob: 0.25 }
    },
    skills: [
      {
        id: "skchr_fgo_lancelot_1",
        name: "湖之骑士",
        desc: "下次攻击造成 2 段各 165% 物理伤害并暴击，若击败敌人额外回复 3 点技力并获得 25 暴击率，持续 6 秒",
        spType: "INCREASE_WHEN_ATTACK",
        spCost: 3,
        initSp: 0,
        skillType: "AUTO",
        durationType: "NONE",
        duration: 0,
        bb: { hits: 2, atk_scale: 1.65, kill_sp: 3, crit_rate: 0.25, buff_dur: 6 }
      },
      {
        id: "skchr_fgo_lancelot_2",
        name: "无穷的武练",
        desc: "持续 15 秒，攻击速度 +40，暴击率 +60%，暴击伤害提升至 175%；若携带任意装备，加成效果翻倍",
        spType: "INCREASE_WITH_TIME",
        spCost: 20,
        initSp: 10,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 15,
        bb: { aspd: 40, crit_rate: 0.6, crit_dmg: 1.75, equip_double: 1 }
      },
      {
        id: "skchr_fgo_lancelot_3",
        name: "缚锁全断·过重湖光",
        desc: "解放湖光真名对目标造成 550% 无视防御的法术斩击，普攻变为 2 连击附带 15% 法术创伤，持续 10 秒",
        spType: "INCREASE_WITH_TIME",
        spCost: 28,
        initSp: 15,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 10,
        bb: { atk_scale: 5.5, def_ignore: 1.0, hits: 2, extra_arts: 0.15, duration: 10 }
      }
    ]
  },
  {
    id: "mordred",
    name: "莫德雷德",
    appellation: "Mordred",
    tier: 5,
    rarity: 6,
    // 用户 2026-10-17：近卫过多。她的 S2「隐藏不贞的头盔」是防御力 +120%、法抗 +25、受击反弹 120% 法伤 ——
    // 这是坦克技不是近卫技，改「重装/守护者」（阻挡数按原版守护者「古米」提到 3）。
    profession: "TANK",
    subProfessionId: "guardian",
    subProfessionName: "守护者",
    position: "MELEE",
    bonds: ["roundTable", "raidShip", "soloShip"],
    dmgType: "phys",
    attackKind: "melee",
    projectile: null,
    canHitFly: false,
    rangeGrid: RANGE_MELEE_2,
    baseStats: { maxHp: 2850, atk: 740, def: 360, res: 0, cost: 24, blockCnt: 3, bat: 1.3, aspd: 100, respawnTime: 70 },
    eliteStats: { maxHp: 3950, atk: 825, def: 510, res: 0, cost: 24, blockCnt: 3, bat: 1.3, aspd: 100, respawnTime: 70 },
    trait: {
      desc: "技能可以治疗友方单位",
      descRaw: "技能可以治疗友方单位",
      bb: {}
    },
    talent: {
      name: "叛逆之雷",
      desc: "受到伤害时有 25% 概率触发赤雷反击，对来源造成 80% 攻击力的法术反伤",
      descRaw: "受到伤害时有 25% 概率触发赤雷反击，对来源造成 <@ba.vup>80%</> 攻击力的法术反伤",
      bb: { counter_prob: 0.25, counter_scale: 0.8 }
    },
    skills: [
      {
        id: "skchr_fgo_mordred_1",
        name: "魔力放出",
        desc: "持续 10 秒，攻击力 +65%，每次攻击造成 165% 物理伤害并使目标短暂晕眩 1 秒",
        spType: "INCREASE_WITH_TIME",
        spCost: 18,
        initSp: 10,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 10,
        bb: { atk_pct: 0.65, atk_scale: 1.65, stun_sec: 1 }
      },
      {
        id: "skchr_fgo_mordred_2",
        name: "隐藏不贞的头盔",
        desc: "解除自身所有负面状态，立即回复 8 点技力，持续 10 秒防御力 +120%、法抗 +25，受击时反弹 120% 赤雷法伤",
        spType: "INCREASE_WITH_TIME",
        spCost: 22,
        initSp: 14,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 10,
        bb: { cleanse: 1, sp_charge: 8, def_pct: 1.2, res_add: 25, reflect_arts: 1.2 }
      },
      {
        id: "skchr_fgo_mordred_3",
        name: "对吾高洁之父的叛逆",
        desc: "拆为 5 段独立 Hit，造成 680%（蓄力 920%）物理 AoE，对首领或精英无视 40% 防御力，击杀敌人回复 3 点技力",
        spType: "INCREASE_WITH_TIME",
        spCost: 32,
        initSp: 20,
        skillType: "AUTO",
        durationType: "NONE",
        duration: 0,
        bb: { hits: 5, atk_scale: 1.36, charge_atk_scale: 1.84, boss_def_ignore: 0.4, kill_sp: 3, charged: 1 }
      }
    ]
  },
  {
    id: "melusine",
    name: "美露莘",
    appellation: "Melusine",
    tier: 5,
    rarity: 6,
    // 用户 2026-10-17：近卫过多。她的 S3 就是「阿尔比恩龙骸化，永久进入【驭空】起飞状态」——
    // 改「特种/巡空者」最贴（原版蒂比：canHitFly + 起飞后拦截飞行敌人）。保留 arts（巡空者不强制物理）。
    profession: "SPECIAL",
    subProfessionId: "skywalker",
    subProfessionName: "巡空者",
    position: "MELEE",
    bonds: ["roundTable", "raidShip", "preciShip"],
    dmgType: "arts",
    attackKind: "melee",
    projectile: null,
    canHitFly: true,
    rangeGrid: RANGE_SKYWALKER,
    baseStats: { maxHp: 2400, atk: 520, def: 360, res: 15, cost: 21, blockCnt: 2, bat: 1.0, aspd: 100, respawnTime: 70 },
    eliteStats: { maxHp: 3250, atk: 635, def: 500, res: 20, cost: 21, blockCnt: 2, bat: 1.0, aspd: 100, respawnTime: 70 },
    trait: {
      desc: "起飞后能够阻挡2个飞行敌人",
      descRaw: "起飞后能够阻挡 2 个飞行敌人",
      bb: {}
    },
    talent: {
      name: "龙之心",
      desc: "初始技力 +15；开启技能后获得 25 攻击速度与 20% 物理闪避持续 10 秒",
      descRaw: "初始技力 <@ba.vup>+15</>；开启技能后获得 <@ba.vup>25</> 攻击速度与 <@ba.vup>20%</> 物理闪避持续 10 秒",
      bb: { init_sp: 15, aspd: 25, dodge: 0.2 }
    },
    skills: [
      {
        id: "skchr_fgo_melusine_1",
        name: "无垢之湖光",
        desc: "对单体发动 5 段零距离切割，总计造成 380% 法术伤害，自身技力回复速度 +40%，目标受到伤害增加 15%，持续 6 秒",
        spType: "INCREASE_WITH_TIME",
        spCost: 15,
        initSp: 8,
        skillType: "AUTO",
        durationType: "NONE",
        duration: 0,
        bb: { hits: 5, atk_scale: 0.76, sp_rec: 0.4, vuln: 0.15, debuff_dur: 6 }
      },
      {
        id: "skchr_fgo_melusine_2",
        name: "银之脉动",
        desc: "生命上限 +35%，攻击力 +70%，攻速 +45，暴击率 +50%，暴伤提升至 160%，并使【圆桌】【精准】层数 +4，持续 14 秒",
        spType: "INCREASE_WITH_TIME",
        spCost: 26,
        initSp: 15,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 14,
        bb: { hp_pct: 0.35, atk_pct: 0.7, aspd: 45, crit_rate: 0.5, crit_dmg: 1.6, add_layers: 4 }
      },
      {
        id: "skchr_fgo_melusine_3",
        name: "无人知晓之无垢鼓动",
        desc: "首次开启：阿尔比恩龙骸化，永久进入【驭空】起飞状态；后续开启：5 段彩虹激光，总计 720% 法伤 + 450 灼燃",
        spType: "INCREASE_WITH_TIME",
        spCost: 32,
        initSp: 22,
        skillType: "AUTO",
        durationType: "NONE",
        duration: 0,
        bb: { transform: 1, hits: 5, atk_scale: 1.44, burn: 450 }
      }
    ]
  },
  {
    id: "artoria",
    name: "阿尔托莉雅",
    appellation: "Artoria",
    tier: 6,
    rarity: 6,
    profession: "WARRIOR",
    subProfessionId: "lord",
    subProfessionName: "领主",
    position: "MELEE",
    bonds: ["roundTable", "skillfulShip", "deputShip"],
    dmgType: "phys",
    attackKind: "melee",
    projectile: null,
    canHitFly: false,
    rangeGrid: RANGE_MELEE_2,
    baseStats: { maxHp: 2300, atk: 750, def: 350, res: 10, cost: 22, blockCnt: 2, bat: 1.3, aspd: 100, respawnTime: 70 },
    eliteStats: { maxHp: 2680, atk: 800, def: 440, res: 15, cost: 22, blockCnt: 2, bat: 1.3, aspd: 100, respawnTime: 70 },
    trait: {
      desc: "可以进行远程攻击，但此时攻击力降低至 80%",
      descRaw: "可以进行远程攻击，但此时攻击力降低至 80%",
      bb: { blockCnt: 2 }
    },
    talent: {
      name: "龙之炉心",
      desc: "自身与周围 8 格友方【圆桌】干员攻击力 +12%，每 3 秒回复 1 点技力",
      descRaw: "自身与周围 8 格友方【圆桌】干员攻击力 <@ba.vup>+12%</>，每 3 秒回复 1 点技力",
      bb: { aura_atk_pct: 0.12, aura_sp: 1 }
    },
    skills: [
      {
        id: "skchr_fgo_artoria_1",
        name: "领导力",
        desc: "全场我方干员攻击力 +25%（圆桌干员提升至 +45%），阿尔托莉雅自身攻击力 +80% 且普攻回复 1 技力，持续 15 秒",
        spType: "INCREASE_WITH_TIME",
        spCost: 20,
        initSp: 12,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 15,
        bb: { team_atk: 0.25, round_table_team_atk: 0.45, self_atk: 0.8, attack_sp: 1 }
      },
      {
        id: "skchr_fgo_artoria_2",
        name: "风王结界",
        desc: "持续 12 秒，攻击力 +140%，攻击转化为弱点伤害，开启立即充能 8 点技力",
        spType: "INCREASE_WITH_TIME",
        spCost: 24,
        initSp: 15,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 12,
        bb: { atk_pct: 1.4, weakness_dmg: 1, sp_charge: 8 }
      },
      {
        id: "skchr_fgo_artoria_3",
        name: "誓约胜利之剑",
        desc: "拆为 6 段独立 Hit，造成 820%（蓄力 1150%）全屏直线弱点伤害，并返还 12（蓄力 18）点技力，持续 12 秒普攻可同时攻击 3 个目标",
        spType: "INCREASE_WITH_TIME",
        spCost: 35,
        initSp: 22,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 12,
        bb: { hits: 6, atk_scale: 1.366, charge_atk_scale: 1.916, sp_refund: 12, charge_refund: 18, targets: 3, charged: 1 }
      }
    ]
  },
  {
    id: "merlin",
    name: "梅林",
    appellation: "Merlin",
    tier: 6,
    rarity: 6,
    profession: "MEDIC",
    subProfessionId: "bard",
    subProfessionName: "吟游者",
    position: "RANGED",
    bonds: ["roundTable", "visiShip", "miraShip"],
    dmgType: "arts",
    attackKind: "ranged",
    projectile: "orb",
    canHitFly: true,
    rangeGrid: RANGE_CASTER_3X3,
    baseStats: { maxHp: 1650, atk: 560, def: 180, res: 20, cost: 15, blockCnt: 1, bat: 1.6, aspd: 100, respawnTime: 70 },
    eliteStats: { maxHp: 2450, atk: 980, def: 280, res: 25, cost: 15, blockCnt: 1, bat: 1.6, aspd: 100, respawnTime: 70 },
    trait: {
      desc: "不攻击，持续恢复范围内所有友方生命",
      descRaw: "不攻击，持续恢复范围内所有友方生命",
      bb: {}
    },
    talent: {
      name: "梦幻领导力",
      desc: "入场时全场所有友方干员获得 10 点技力与 1 层护盾",
      descRaw: "入场时全场所有友方干员获得 <@ba.vup>10</> 点技力与 <@ba.vup>1</> 层护盾",
      bb: { grant_sp: 10, shield_layers: 1 }
    },
    skills: [
      {
        id: "skchr_fgo_merlin_1",
        name: "梦幻领导力",
        desc: "全场所有友方回复 6 点技力，自身鼓舞攻击力最高的友方，使其攻击力提升梅林攻击力的 30%，持续 12 秒",
        spType: "INCREASE_WITH_TIME",
        spCost: 20,
        initSp: 12,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 12,
        bb: { sp_grant: 6, inspire_ratio: 0.3, dur: 12 }
      },
      {
        id: "skchr_fgo_merlin_2",
        name: "幻术·英雄塑造",
        desc: "为周围 8 格所有友方干员提供 1 层物理/法术抵挡护盾；使范围内攻击力最高的友方干员生命上限 +50%、攻击力 +60%、暴击伤害提升至 160%，持续 12 秒",
        spType: "INCREASE_WITH_TIME",
        spCost: 28,
        initSp: 18,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 12,
        bb: { shield_layers: 1, buff_hp: 0.5, buff_atk: 0.6, crit_dmg: 1.6, dur: 12 }
      },
      {
        id: "skchr_fgo_merlin_3",
        name: "永久闭锁的乌托邦",
        desc: "展开理想乡结界 18 秒，全场所有友方干员每 0.5 秒回复梅林 35% 攻击力生命值并回复 0.6 点技力",
        spType: "INCREASE_WITH_TIME",
        spCost: 35,
        initSp: 22,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 18,
        bb: { regen_pct: 0.35, sp_per_tick: 0.6, tick_rate: 0.5, dur: 18 }
      }
    ]
  },
  {
    id: "castoria",
    name: "阿尔托莉雅·卡斯特",
    appellation: "Castoria",
    tier: 6,
    rarity: 6,
    profession: "SUPPORT",          // 引擎认的八职业 ID 是 SUPPORT；写 SUPPORTER 会让职业图标/职业名整条取不到
    subProfessionId: "blessing",
    subProfessionName: "护佑者",
    position: "RANGED",
    bonds: ["roundTable", "arcaneShip", "deputShip"],
    dmgType: "arts",
    attackKind: "ranged",
    projectile: "bolt",
    canHitFly: true,
    rangeGrid: RANGE_CASTER_3X3,
    baseStats: { maxHp: 1750, atk: 580, def: 210, res: 20, cost: 16, blockCnt: 1, bat: 1.5, aspd: 100, respawnTime: 70 },
    eliteStats: { maxHp: 2550, atk: 880, def: 320, res: 25, cost: 16, blockCnt: 1, bat: 1.5, aspd: 100, respawnTime: 70 },
    trait: {
      desc: "攻击造成法术伤害，技能开启时改为治疗友方单位",
      descRaw: "攻击造成法术伤害，技能开启时改为治疗友方单位",
      bb: {}
    },
    talent: {
      name: "湖之加护",
      desc: "生命值低于 50% 的友方干员受到卡斯特治疗时，获得 1 层护盾与 15% 减伤",
      descRaw: "生命值低于 50% 的友方干员受到卡斯特治疗时，获得 <@ba.vup>1</> 层护盾与 <@ba.vup>15%</> 减伤",
      bb: { shield_layers: 1, dmg_res: 0.15 }
    },
    skills: [
      {
        id: "skchr_fgo_castoria_1",
        name: "希望的领袖",
        desc: "全场我方干员攻击力 +20%、充能 8 点技力，自身回复 10 点技力",
        spType: "INCREASE_WITH_TIME",
        spCost: 18,
        initSp: 10,
        skillType: "AUTO",
        durationType: "NONE",
        duration: 0,
        bb: { team_atk: 0.2, sp_team: 8, self_sp: 10 }
      },
      {
        id: "skchr_fgo_castoria_2",
        name: "阿瓦隆的加护",
        desc: "为周围 8 格友方赋予 1 层无敌护盾，法术抗性 +20，技力自然回复速度 +50%，持续 10 秒",
        spType: "INCREASE_WITH_TIME",
        spCost: 24,
        initSp: 14,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 10,
        bb: { shield_layers: 1, res_add: 20, sp_rec: 0.5, dur: 10 }
      },
      {
        id: "skchr_fgo_castoria_3",
        name: "怀抱为你而存的希望",
        desc: "全队清除所有异常状态并获得 2（蓄力 3）层【对肃正防御】护盾，攻击力 +45%，持续 15 秒",
        spType: "INCREASE_WITH_TIME",
        spCost: 35,
        initSp: 22,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 15,
        bb: { cleanse: 1, trueshield_layers: 2, charge_layers: 3, atk_pct: 0.45, dur: 15, charged: 1 }
      }
    ]
  },
  {
    id: "morgan",
    name: "摩根",
    appellation: "Morgan",
    tier: 6,
    rarity: 6,
    profession: "CASTER",
    subProfessionId: "phalanx",
    subProfessionName: "阵法术士",
    position: "RANGED",
    bonds: ["roundTable", "arcaneShip", "visiShip"],
    dmgType: "arts",
    attackKind: "ranged",
    projectile: "bolt",
    canHitFly: true,
    rangeGrid: RANGE_CASTER_3X3,
    baseStats: { maxHp: 1950, atk: 780, def: 260, res: 20, cost: 32, blockCnt: 1, bat: 2.3, aspd: 100, respawnTime: 70 },
    eliteStats: { maxHp: 2650, atk: 1100, def: 380, res: 25, cost: 32, blockCnt: 1, bat: 2.3, aspd: 100, respawnTime: 70 },
    trait: {
      desc: "通常不攻击且防御力和法术抗性提升，技能开启时造成超远距离群体法术攻击",
      descRaw: "通常不攻击且防御力和法术抗性提升，技能开启时造成超远距离群体法术攻击",
      bb: {}
    },
    talent: {
      name: "冬之女王",
      desc: "全场敌人移动速度 -15%，受到法术伤害提升 15%；自身每击倒一名敌人回复 3 点技力",
      descRaw: "全场敌人移动速度 <@ba.vup>-15%</>，受到法术伤害提升 <@ba.vup>15%</>；自身每击倒一名敌人回复 <@ba.vup>3</> 点技力",
      bb: { slow_pct: 0.15, arts_fragile: 0.15, kill_sp: 3 }
    },
    skills: [
      {
        id: "skchr_fgo_morgan_1",
        name: "渴爱的魅力",
        desc: "全场友方攻击力 +20%，敌方防御力 -15%，持续 12 秒；自身充能 6 点技力",
        spType: "INCREASE_WITH_TIME",
        spCost: 18,
        initSp: 10,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 12,
        bb: { team_atk: 0.2, enemy_def_down: -0.15, sp_charge: 6, dur: 12 }
      },
      {
        id: "skchr_fgo_morgan_2",
        name: "天性的湖光",
        desc: "持续 14 秒，攻击力 +75%，攻速 +30，获得 1 次致命伤抵挡；普攻对目标附加 300 点凋亡损伤与 40% 减速",
        spType: "INCREASE_WITH_TIME",
        spCost: 26,
        initSp: 16,
        skillType: "AUTO",
        durationType: "DURATION",
        duration: 14,
        bb: { atk_pct: 0.75, aspd: 30, undying: 1, necrosis: 300, slow_pct: 0.4, dur: 14 }
      },
      {
        id: "skchr_fgo_morgan_3",
        name: "业已无法抵达的理想乡",
        desc: "前方 4x5 范围 6 段黑枪轰炸，总计 720%（蓄力 1080%）群法伤害，全场友方回 8 技力与【蓄力就绪】",
        spType: "INCREASE_WITH_TIME",
        spCost: 36,
        initSp: 22,
        skillType: "AUTO",
        durationType: "NONE",
        duration: 0,
        bb: { hits: 6, atk_scale: 1.2, charge_atk_scale: 1.8, sp_grant: 8, charged: 1 }
      }
    ]
  }
];

const chessJson = {};
const garrisonsJson = {};

for (const op of OPS) {
  const charId = `char_fgo_${op.id}`;
  const baseChessId = `chess_fgo_${op.tier}_${op.id}_a`;
  const goldenChessId = `chess_fgo_${op.tier}_${op.id}_b`;

  const mappedSkills = op.skills.map((s, idx) => ({
    skillId: s.id,
    iconId: s.id,
    name: s.name,
    level: 7,
    desc: s.desc,
    descRaw: s.desc,
    skillType: "MANUAL",
    durationType: s.durationType,
    duration: s.duration,
    spType: s.spType,
    spCost: s.spCost,
    initSp: s.initSp,
    maxChargeTime: 1,
    increment: 1,
    bb: s.bb,
    bbStr: {},
    rangeId: null,
    rangeGrid: null,
    prefabId: s.id,
    trigger: { rule: "DEFAULT", rawRule: "DEFAULT", params: {} },
    index: idx,
    isDefault: idx === 2
  }));

  const talentObj = {
    index: 0,
    name: op.talent.name,
    desc: op.talent.desc,
    descRaw: op.talent.descRaw,
    bb: op.talent.bb,
    bbStr: {},
    rangeGrid: null,
    tokenKey: null,
    hidden: false,
    fromModule: false
  };

  const traitObj = {
    desc: op.trait.desc,
    descRaw: op.trait.descRaw,
    bb: op.trait.bb,
    bbStr: {},
    rangeGrid: null
  };

  chessJson[baseChessId] = {
    chessId: baseChessId,
    baseId: baseChessId,
    goldenId: goldenChessId,
    isGolden: false,
    tier: op.tier,
    identifier: 800 + op.tier * 10 + OPS.indexOf(op),
    isHidden: false,
    isDiy: false,
    visible: true,
    chessType: "PRESET",
    shopSortId: op.tier * 10 + OPS.indexOf(op),
    charId,
    name: op.name,
    appellation: op.appellation,
    rarity: op.rarity,
    profession: op.profession,
    subProfessionId: op.subProfessionId,
    subProfessionName: op.subProfessionName,
    position: op.position,
    nationId: "roundTable",
    bonds: op.bonds,
    garrisonIds: [`garrison_fgo_${op.id}_a`],
    price: ({ 1: 2, 2: 3, 3: 3, 4: 3, 5: 4, 6: 4 })[op.tier] ?? 3,
    sellPrice: 1,
    upgradeNum: 3,
    upgradeChessId: goldenChessId,
    status: { phase: 1, level: 1, skillLevel: 4, equipLevel: 0 },
    stats: op.baseStats,
    immunities: null,
    rangeGrid: op.rangeGrid,
    dmgType: op.dmgType,
    attackKind: op.attackKind,
    projectile: op.projectile,
    canHitFly: op.canHitFly,
    targetPriority: null,
    trait: traitObj,
    skill: { ...mappedSkills[2], index: 2, isDefault: true },
    skills: mappedSkills,
    allSkills: mappedSkills,
    talents: [talentObj],
    tokens: [],
    module: null,
    assets: {
      avatar: charId,
      portrait: charId
    }
  };

  chessJson[goldenChessId] = {
    ...chessJson[baseChessId],
    chessId: goldenChessId,
    isGolden: true,
    garrisonIds: [`garrison_fgo_${op.id}_b`],
    upgradeNum: 0,
    upgradeChessId: null,
    status: { phase: 2, level: 60, skillLevel: 7, equipLevel: 0 },
    stats: op.eliteStats,
    assets: {
      avatar: `${charId}_2`,
      portrait: `${charId}_2`
    }
  };

  // Garrison traits: SERVER_ADD_BOND with count 2 (_a) and 4 (_b)
  const bondListStr = op.bonds.join(',');
  garrisonsJson[`garrison_fgo_${op.id}_a`] = {
    garrisonId: `garrison_fgo_${op.id}_a`,
    eventType: "SERVER_GAIN",
    eventTypeDesc: "单次叠加",
    eventTypeIcon: "icon_bond",
    effectType: "SERVER_ADD_BOND",
    effectKey: "SERVER_ADD_BOND",
    battleRuneKey: null,
    charLevel: 0,
    bb: { count: 2 },
    bbStr: { bond: bondListStr },
    desc: `<获得时>【圆桌】及自身所属盟约层数 +2（无需激活盟约）`,
    descRaw: `<获得时>【圆桌】及自身所属盟约层数 <@ba.vup>+2</>（无需激活盟约）`,
    owners: [baseChessId]
  };

  garrisonsJson[`garrison_fgo_${op.id}_b`] = {
    garrisonId: `garrison_fgo_${op.id}_b`,
    eventType: "SERVER_GAIN",
    eventTypeDesc: "单次叠加",
    eventTypeIcon: "icon_bond",
    effectType: "SERVER_ADD_BOND",
    effectKey: "SERVER_ADD_BOND",
    battleRuneKey: null,
    charLevel: 0,
    bb: { count: 4 },
    bbStr: { bond: bondListStr },
    desc: `<获得时>【圆桌】及自身所属盟约层数 +4（无需激活盟约）`,
    descRaw: `<获得时>【圆桌】及自身所属盟约层数 <@ba.vup>+4</>（无需激活盟约）`,
    owners: [goldenChessId]
  };
}

fs.writeFileSync(path.join(MOD_DATA_DIR, 'chess.json'), JSON.stringify(chessJson, null, 2), 'utf8');
fs.writeFileSync(path.join(MOD_DATA_DIR, 'garrisons.json'), JSON.stringify(garrisonsJson, null, 2), 'utf8');

console.log('[build-compliant-data] Successfully wrote compliant chess.json and garrisons.json to mods/fgo-round-table/data/');
