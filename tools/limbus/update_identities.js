// tools/limbus/update_identities.js
import fs from 'node:fs';

const p = 'tools/limbus/generate_all_sinners.mjs';
let code = fs.readFileSync(p, 'utf8');

// Replace Faust
const faustOld = code.match(/\/\/ 1\. Faust[\s\S]*?\/\/ 2\. Rodion/)[0];
const faustNew = `// 1. Faust
  {
    tier: 1,
    sinner: 'faust',
    name: '浮士德',
    appellation: 'Faust',
    skinName: '黑兽组·卯分支',
    profession: 'SUPPORT',
    subProfessionId: 'underminer',
    subProfessionName: '削弱者',
    subProfIcon: 'sub_underminer_icon',
    position: 'RANGED',
    bonds: ['limbusShip', 'arcaneShip'],
    dmgType: 'magic',
    attackKind: 'ranged',
    projectile: 'magic',
    canHitFly: true,
    rangeGrid: [
      [1, 0], [1, 1], [1, 2],
      [0, 0], [0, 1], [0, 2], [0, 3],
      [-1, 0], [-1, 1], [-1, 2]
    ],
    statsBase: {
      maxHp: 1120, atk: 340, def: 80, res: 20, cost: 10, blockCnt: 1,
      bat: 1.6, aspd: 100, respawnTime: 70, spRecovery: 1, hpRecoveryPerSec: 0,
      moveSpeed: 1, tauntLevel: 0, massLevel: 0, deployLimit: 1, deckStack: 0
    },
    statsGolden: {
      maxHp: 2450, atk: 680, def: 180, res: 25, cost: 10, blockCnt: 1,
      bat: 1.6, aspd: 110, respawnTime: 70, spRecovery: 1, hpRecoveryPerSec: 0,
      moveSpeed: 1, tauntLevel: 0, massLevel: 0, deployLimit: 1, deckStack: 0
    },
    trait: {
      desc: '攻击造成法术伤害',
      descRaw: '攻击造成<@ba.kw>法术伤害</>'
    },
    talents: [
      {
        talentId: 'talent_limbus_faust_1',
        name: '卯跃迅影',
        desc: '攻击速度+30；攻击范围内的敌人移动速度降低25%，受到的法术伤害提升18%',
        descRaw: '攻击速度<@ba.vup>+30</>；攻击范围内的敌人移动速度降低<@ba.vdown>25%</>，受到的法术伤害提升<@ba.vup>18%</>',
        bb: { aspd: 30, slow: 0.25, magic_vuln: 0.18 }
      },
      {
        talentId: 'talent_limbus_faust_2',
        name: '卯兔灵动',
        desc: '友方【边狱公司】干员受到致命伤害时，为其施加卯兔假影，令其隐匿无敌2秒并回复20%最大生命值',
        descRaw: '友方【边狱公司】干员受到致命伤害时，为其施加【卯兔假影】，令其隐匿无敌<@ba.vup>2</>秒并回复<@ba.vup>20%</>最大生命值',
        bb: { invuln_sec: 2.0, heal_pct: 0.2 }
      }
    ],
    skills: [
      {
        name: '卯跃突袭',
        desc: '下一次攻击闪烁至敌人身侧快速突刺，造成190%法术伤害并使目标附带2层停顿与脆弱，自身回复10点理智',
        descRaw: '下一次攻击闪烁至敌人身侧快速突刺，造成<@ba.vup>190%</>法术伤害并使目标附带<@ba.vup>2</>层【停顿】与【脆弱】，自身回复<@ba.vup>10</>点理智',
        skillType: 'AUTO',
        spType: 'INCREASE_WHEN_ATTACK',
        spCost: 3,
        initSp: 0,
        bb: { atk_scale: 1.9, vuln: 0.2, sanity_gain: 10 }
      },
      {
        name: '奔雷破阵',
        desc: '攻击力+70%，攻击速度+50，普通攻击变为弹射雷矢，在最多4名敌人之间穿梭，每次弹射造成相当于攻击力120%法术伤害并附带麻痹',
        descRaw: '攻击力<@ba.vup>+70%</>，攻击速度<@ba.vup>+50</>，普通攻击变为弹射雷矢，在最多4名敌人之间穿梭，每次弹射造成相当于攻击力<@ba.vup>120%</>法术伤害并附带麻痹',
        skillType: 'MANUAL',
        spType: 'INCREASE_WITH_TIME',
        spCost: 28,
        initSp: 12,
        duration: 20,
        bb: { atk_pct: 0.7, aspd_buff: 50, bounce_count: 4, bounce_scale: 1.2 }
      },
      {
        name: '黑兽断罪·卯影千重',
        desc: '释放卯分支终极黑兽秘术：全场敌人攻击力降低30%、移动速度降低50%，浮士德每次攻击引导卯影围攻，持续18秒',
        descRaw: '释放卯分支终极黑兽秘术：全场敌人攻击力降低<@ba.vdown>30%</>、移动速度降低<@ba.vdown>50%</>，浮士德每次攻击引导卯影围攻，持续<@ba.vup>18</>秒',
        skillType: 'MANUAL',
        spType: 'INCREASE_WITH_TIME',
        spCost: 35,
        initSp: 20,
        duration: 18,
        bb: { enemy_atk_down: 0.3, enemy_slow: 0.5, shadow_hits: 3 }
      }
    ]
  },

  // 2. Rodion`;
code = code.replace(faustOld, faustNew);

// Replace Rodion
const rodionOld = code.match(/\/\/ 2\. Rodion[\s\S]*?\/\/ 3\. Don Quixote/)[0];
const rodionNew = `// 2. Rodion
  {
    tier: 2,
    sinner: 'rodion',
    name: '罗佳',
    appellation: 'Rodion',
    skinName: '脑叶E.G.O::泪水磨砺之剑',
    profession: 'TANK',
    subProfessionId: 'shotprotector',
    subProfessionName: '哨戒铁卫',
    subProfIcon: 'sub_shotprotector_icon',
    position: 'MELEE',
    bonds: ['limbusShip', 'steadShip'],
    dmgType: 'magic',
    attackKind: 'melee',
    projectile: 'magic',
    canHitFly: false,
    rangeGrid: [[0, 0], [0, 1]],
    statsBase: {
      maxHp: 2280, atk: 430, def: 460, res: 15, cost: 18, blockCnt: 3,
      bat: 1.2, aspd: 100, respawnTime: 70, spRecovery: 1, hpRecoveryPerSec: 0,
      moveSpeed: 1, tauntLevel: 0, massLevel: 0, deployLimit: 1, deckStack: 0
    },
    statsGolden: {
      maxHp: 4500, atk: 780, def: 860, res: 20, cost: 18, blockCnt: 3,
      bat: 1.2, aspd: 105, respawnTime: 70, spRecovery: 1, hpRecoveryPerSec: 0,
      moveSpeed: 1, tauntLevel: 0, massLevel: 0, deployLimit: 1, deckStack: 0
    },
    trait: {
      desc: '能够阻挡3名敌人，可进行远程法术反击',
      descRaw: '能够阻挡<@ba.vup>3</>名敌人，可进行远程法术反击'
    },
    talents: [
      {
        talentId: 'talent_limbus_rodion_1',
        name: '浸泪悲愿',
        desc: '受到攻击时有50%概率对攻击者释放泪光反震，造成相当于自身攻击力120%法术伤害并附带凋亡损伤',
        descRaw: '受到攻击时有<@ba.vup>50%</>概率对攻击者释放泪光反震，造成相当于自身攻击力<@ba.vup>120%</>法术伤害并附带凋亡损伤',
        bb: { counter_prob: 0.5, counter_scale: 1.2, ep_damage: 80 }
      },
      {
        talentId: 'talent_limbus_rodion_2',
        name: '绝望庇护',
        desc: '阻挡敌人时，周围4格内的友方干员受到的物理与法术伤害降低15%，每秒回复自身攻击力25%生命值',
        descRaw: '阻挡敌人时，周围4格内的友方干员受到的物理与法术伤害降低<@ba.vdown>15%</>，每秒回复自身攻击力<@ba.vup>25%</>生命值',
        bb: { aura_reduc: 0.15, aura_heal: 0.25 }
      }
    ],
    skills: [
      {
        name: '泪之锋刃',
        desc: '下一次攻击造成200%法术伤害，消耗自身积攒的悲伤之泪，额外造成等同于已损失生命值20%真实伤害',
        descRaw: '下一次攻击造成<@ba.vup>200%</>法术伤害，消耗自身积攒的悲伤之泪，额外造成等同于已损失生命值<@ba.vup>20%</>真实伤害',
        skillType: 'AUTO',
        spType: 'INCREASE_WHEN_ATTACK',
        spCost: 3,
        initSp: 0,
        bb: { atk_scale: 2.0, loss_hp_true: 0.2 }
      },
      {
        name: '绝望穿刺',
        desc: '攻击力+60%，防御力+70%，阻挡数+1，普通攻击变为前方两格贯穿刺击，每次命中附带脆弱与100点凋亡损伤，持续20秒',
        descRaw: '攻击力<@ba.vup>+60%</>，防御力<@ba.vup>+70%</>，阻挡数<@ba.vup>+1</>，普通攻击变为前方两格贯穿刺击，每次命中附带脆弱与<@ba.vup>100</>点凋亡损伤，持续<@ba.vup>20</>秒',
        skillType: 'MANUAL',
        spType: 'INCREASE_WITH_TIME',
        spCost: 25,
        initSp: 10,
        duration: 20,
        bb: { atk_pct: 0.6, def_pct: 0.7, block_add: 1, ep_damage: 100 }
      },
      {
        name: '绝望守护·浸泪悲鸣',
        desc: '自身获得相当于最大生命值80%法术护盾，嘲讽全场敌人，普通攻击造成320%法术伤害并吸取20%生命值，护盾破碎时造成600%法术爆发伤害',
        descRaw: '自身获得相当于最大生命值<@ba.vup>80%</>法术护盾，嘲讽全场敌人，普通攻击造成<@ba.vup>320%</>法术伤害并吸取<@ba.vup>20%</>生命值，护盾破碎时造成<@ba.vup>600%</>法术爆发伤害',
        skillType: 'MANUAL',
        spType: 'INCREASE_WITH_TIME',
        spCost: 35,
        initSp: 18,
        duration: 25,
        bb: { shield_pct: 0.8, atk_scale: 3.2, lifesteal: 0.2, shatter_scale: 6.0 }
      }
    ]
  },

  // 3. Don Quixote`;
code = code.replace(rodionOld, rodionNew);

// Replace Ryoshu
const ryoshuOld = code.match(/\/\/ 6\. Ryoshu[\s\S]*?\/\/ 7\. Outis/)[0];
const ryoshuNew = `// 6. Ryoshu
  {
    tier: 4,
    sinner: 'ryoshu',
    name: '良秀',
    appellation: 'Ryōshū',
    skinName: '小指子辈·蜘蛛巢之刃',
    profession: 'SPECIAL',
    subProfessionId: 'executor',
    subProfessionName: '处决者',
    subProfIcon: 'sub_executor_icon',
    position: 'MELEE',
    bonds: ['limbusShip', 'swiftShip'],
    dmgType: 'phys',
    attackKind: 'melee',
    projectile: 'melee',
    canHitFly: false,
    rangeGrid: [[0, 0], [0, 1]],
    statsBase: {
      maxHp: 1980, atk: 710, def: 320, res: 10, cost: 9, blockCnt: 1,
      bat: 0.93, aspd: 100, respawnTime: 18, spRecovery: 1, hpRecoveryPerSec: 0,
      moveSpeed: 1, tauntLevel: 0, massLevel: 0, deployLimit: 1, deckStack: 0
    },
    statsGolden: {
      maxHp: 3450, atk: 1320, def: 510, res: 15, cost: 9, blockCnt: 1,
      bat: 0.93, aspd: 110, respawnTime: 18, spRecovery: 1, hpRecoveryPerSec: 0,
      moveSpeed: 1, tauntLevel: 0, massLevel: 0, deployLimit: 1, deckStack: 0
    },
    trait: {
      desc: '大幅度缩短再部署时间',
      descRaw: '大幅度缩短再部署时间'
    },
    talents: [
      {
        talentId: 'talent_limbus_ryoshu_1',
        name: '蛛丝引线',
        desc: '每次攻击对目标施加流血与脆弱；对处于流血状态的敌人造成伤害提升25%',
        descRaw: '每次攻击对目标施加【流血】与【脆弱】；对处于流血状态的敌人造成伤害提升<@ba.vup>25%</>',
        bb: { bleed_stack: 2, vuln_dmg: 0.25 }
      },
      {
        talentId: 'talent_limbus_ryoshu_2',
        name: '天杀心印',
        desc: '部署时立即隐匿并获得满额45点理智，首次攻击必定暴击且造成200%真实伤害',
        descRaw: '部署时立即隐匿并获得满额<@ba.vup>45</>点理智，首次攻击必定暴击且造成<@ba.vup>200%</>真实伤害',
        bb: { init_sanity: 45, true_strike: 2.0 }
      }
    ],
    skills: [
      {
        name: '天杀',
        desc: '下一次攻击造成180%物理伤害，对目标施加3层流血与1层振荡，自身获得5点理智',
        descRaw: '下一次攻击造成<@ba.vup>180%</>物理伤害，对目标施加<@ba.vup>3</>层流血与<@ba.vup>1</>层振荡，自身获得<@ba.vup>5</>点理智',
        skillType: 'AUTO',
        spType: 'INCREASE_WHEN_ATTACK',
        spCost: 3,
        initSp: 0,
        bb: { atk_scale: 1.8, bleed: 3, osc: 1, sanity: 5 }
      },
      {
        name: '天杀·连',
        desc: '部署后攻击力+90%，攻击速度+60，普通攻击变为3连击，每次斩击使目标流血层数+2，持续12秒',
        descRaw: '部署后攻击力<@ba.vup>+90%</>，攻击速度<@ba.vup>+60</>，普通攻击变为3连击，每次斩击使目标流血层数<@ba.vup>+2</>，持续<@ba.vup>12</>秒',
        skillType: 'PASSIVE',
        spType: 'INCREASE_WITH_TIME',
        spCost: 0,
        initSp: 0,
        duration: 12,
        bb: { atk_pct: 0.9, aspd_buff: 60, hits: 3, bleed_add: 2 }
      },
      {
        name: '三连·残',
        desc: '部署后立即对周围一圈敌人发动极速回旋三连斩，每次造成220%真实伤害并附带3秒眩晕；若目标生命值低于30%，则直接斩杀目标',
        descRaw: '部署后立即对周围一圈敌人发动极速回旋三连斩，每次造成<@ba.vup>220%</>真实伤害并附带<@ba.vup>3</>秒眩晕；若目标生命值低于<@ba.vdown>30%</>，则直接斩杀目标',
        skillType: 'PASSIVE',
        spType: 'INCREASE_WITH_TIME',
        spCost: 0,
        initSp: 0,
        duration: 0,
        bb: { atk_scale: 2.2, hits: 3, stun_sec: 3, execute_hp: 0.3 }
      }
    ]
  },

  // 7. Outis`;
code = code.replace(ryoshuOld, ryoshuNew);

// Replace Gregor
const gregorOld = code.match(/\/\/ 10\. Gregor[\s\S]*?function buildSkillEntry/)[0];
const gregorNew = `// 10. Gregor
  {
    tier: 5,
    sinner: 'gregor',
    name: '格里高尔',
    appellation: 'Gregor',
    skinName: '黎明事务所代表',
    profession: 'WARRIOR',
    subProfessionId: 'fearless',
    subProfessionName: '无畏者',
    subProfIcon: 'sub_fearless_icon',
    position: 'MELEE',
    bonds: ['limbusShip', 'indomShip'],
    dmgType: 'phys',
    attackKind: 'melee',
    projectile: 'melee',
    canHitFly: false,
    rangeGrid: [[0, 0], [0, 1]],
    statsBase: {
      maxHp: 4350, atk: 1150, def: 520, res: 10, cost: 20, blockCnt: 1,
      bat: 1.5, aspd: 100, respawnTime: 70, spRecovery: 1, hpRecoveryPerSec: 0,
      moveSpeed: 1, tauntLevel: 0, massLevel: 0, deployLimit: 1, deckStack: 0
    },
    statsGolden: {
      maxHp: 7800, atk: 2100, def: 850, res: 20, cost: 20, blockCnt: 1,
      bat: 1.5, aspd: 110, respawnTime: 70, spRecovery: 1, hpRecoveryPerSec: 0,
      moveSpeed: 1, tauntLevel: 0, massLevel: 0, deployLimit: 1, deckStack: 0
    },
    trait: {
      desc: '能够阻挡1名敌人，具有极高的生命值与攻击力',
      descRaw: '能够阻挡<@ba.vup>1</>名敌人，具有极高的生命值与攻击力'
    },
    talents: [
      {
        talentId: 'talent_limbus_gregor_1',
        name: '晓之火',
        desc: '攻击造成物理伤害并附带灼燃损伤；目标每持有1层灼燃，格里高尔攻击力提升3%，最多提升30%',
        descRaw: '攻击造成物理伤害并附带灼燃损伤；目标每持有1层灼燃，格里高尔攻击力提升<@ba.vup>3%</>，最多提升<@ba.vup>30%</>',
        bb: { burn_atk_pct: 0.03, burn_atk_max: 0.3 }
      },
      {
        talentId: 'talent_limbus_gregor_2',
        name: '黎明守护',
        desc: '濒死时不会立即退场，立即燃尽残火恢复50%生命值，并在周围地面生成黎明火海，对敌人造成每秒相当于攻击力80%法术伤害，持续8秒',
        descRaw: '濒死时不会立即退场，立即燃尽残火恢复<@ba.vup>50%</>生命值，并在周围地面生成【黎明火海】，对敌人造成每秒相当于攻击力<@ba.vup>80%</>法术伤害，持续<@ba.vup>8</>秒',
        bb: { revive_hp: 0.5, fire_dot: 0.8, fire_dur: 8.0 }
      }
    ],
    skills: [
      {
        name: '黎明之闪光',
        desc: '下一次攻击横扫前方两格，造成220%物理伤害并附带150点灼燃损伤，引爆目标的灼燃状态造成二次法术爆炸',
        descRaw: '下一次攻击横扫前方两格，造成<@ba.vup>220%</>物理伤害并附带<@ba.vup>150</>点灼燃损伤，引爆目标的灼燃状态造成二次法术爆炸',
        skillType: 'AUTO',
        spType: 'INCREASE_WHEN_ATTACK',
        spCost: 3,
        initSp: 0,
        bb: { atk_scale: 2.2, burn_damage: 150, burst_scale: 1.5 }
      },
      {
        name: '炽热重击',
        desc: '攻击力+80%，防御力+40%，阻挡数+1，攻击变为群攻并附带灼热烈焰，每次命中使目标受到的物理和法术伤害提升20%，持续20秒',
        descRaw: '攻击力<@ba.vup>+80%</>，防御力<@ba.vup>+40%</>，阻挡数<@ba.vup>+1</>，攻击变为群攻并附带灼热烈焰，每次命中使目标受到的物理和法术伤害提升<@ba.vup>20%</>，持续<@ba.vup>20</>秒',
        skillType: 'MANUAL',
        spType: 'INCREASE_WITH_TIME',
        spCost: 28,
        initSp: 12,
        duration: 20,
        bb: { atk_pct: 0.8, def_pct: 0.4, block_add: 1, vuln: 0.2 }
      },
      {
        name: '拂晓烙印·落日断绝',
        desc: '汇聚全部黎明之火，对前方直线4格内所有敌人造成750%毁灭性混合伤害，若目标处于灼燃爆发状态则伤害提升至1100%，并在路径上留下持续燃烧的烈焰火径',
        descRaw: '汇聚全部黎明之火，对前方直线4格内所有敌人造成<@ba.vup>750%</>毁灭性混合伤害，若目标处于灼燃爆发状态则伤害提升至<@ba.vup>1100%</>，并在路径上留下持续燃烧的烈焰火径',
        skillType: 'MANUAL',
        spType: 'INCREASE_WITH_TIME',
        spCost: 40,
        initSp: 25,
        duration: 0,
        bb: { atk_scale: 7.5, burst_scale: 11.0, trail_dur: 10 }
      }
    ]
  }
];

function buildSkillEntry`;
code = code.replace(gregorOld, gregorNew);

fs.writeFileSync(p, code, 'utf8');
console.log('generate_all_sinners.mjs successfully updated with 4 new identities');
