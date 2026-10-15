// tools/limbus/generate_all_sinners.mjs
import fs from 'node:fs';
import path from 'node:path';

const CHESS_PATH = 'mods/limbus-company/data/chess.json';
const GARRISONS_PATH = 'mods/limbus-company/data/garrisons.json';
const SKINS_PATH = 'mods/limbus-company/data/skins.json';
const BONDS_PATH = 'mods/limbus-company/data/bonds.json';
const MOD_PATH = 'mods/limbus-company/mod.json';

const SINNER_DEFS = [
  // 1. Faust
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

  // 2. Rodion
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

  // 3. Don Quixote
  {
    tier: 3,
    sinner: 'donquixote',
    name: '唐吉诃德',
    appellation: 'Don Quixote',
    skinName: '拉曼恰管理者',
    profession: 'PIONEER',
    subProfessionId: 'charger',
    subProfessionName: '冲锋手',
    subProfIcon: 'sub_charger_icon',
    position: 'MELEE',
    bonds: ['limbusShip', 'raidShip'],
    dmgType: 'phys',
    attackKind: 'melee',
    projectile: 'melee',
    canHitFly: false,
    rangeGrid: [[0, 0], [0, 1]],
    statsBase: {
      maxHp: 2150, atk: 620, def: 340, res: 0, cost: 11, blockCnt: 1,
      bat: 1.0, aspd: 100, respawnTime: 70, spRecovery: 1, hpRecoveryPerSec: 0,
      moveSpeed: 1.2, tauntLevel: 0, massLevel: 0, deployLimit: 1, deckStack: 0
    },
    statsGolden: {
      maxHp: 3980, atk: 1180, def: 560, res: 0, cost: 11, blockCnt: 1,
      bat: 1.0, aspd: 110, respawnTime: 70, spRecovery: 1, hpRecoveryPerSec: 0,
      moveSpeed: 1.2, tauntLevel: 0, massLevel: 0, deployLimit: 1, deckStack: 0
    },
    trait: {
      desc: '击败敌人获得1点部署费用，撤退时返还初始部署费用',
      descRaw: '击败敌人获得<@ba.vup>1</>点部署费用，撤退时返还初始部署费用'
    },
    talents: [
      {
        talentId: 'talent_limbus_donquixote_1',
        name: '正义冲锋',
        desc: '每次攻击命中敌人回复相当于造成伤害15%的生命；若自身理智大于30点，攻击速度+25',
        descRaw: '每次攻击命中敌人回复相当于造成伤害<@ba.vup>15%</>的生命；若自身理智大于30点，攻击速度<@ba.vup>+25</>',
        bb: { lifesteal: 0.15, aspd_buff: 25 }
      },
      {
        talentId: 'talent_limbus_donquixote_2',
        name: '血宴渴望',
        desc: '击败敌人时自身获得10点理智并提升5%攻击力，最多叠加6层',
        descRaw: '击败敌人时自身获得<@ba.vup>10</>点理智并提升<@ba.vup>5%</>攻击力，最多叠加6层',
        bb: { sanity_on_kill: 10, atk_stack: 0.05, max_stack: 6 }
      }
    ],
    skills: [
      {
        name: '游侠突刺',
        desc: '下一次攻击以极高速度连刺2次，每次造成150%物理伤害，若击败敌人额外获得1点部署费用与5点理智',
        descRaw: '下一次攻击以极高速度连刺2次，每次造成<@ba.vup>150%</>物理伤害，若击败敌人额外获得<@ba.vup>1</>点部署费用与<@ba.vup>5</>点理智',
        skillType: 'AUTO',
        spType: 'INCREASE_WHEN_ATTACK',
        spCost: 3,
        initSp: 0,
        bb: { atk_scale: 1.5, hits: 2, kill_cost: 1, kill_sanity: 5 }
      },
      {
        name: '血色华尔兹',
        desc: '攻击范围向前延伸1格，攻击力+70%，攻击速度+30，攻击造成物理与法术混合伤害，每次命中造成相当于目标最大生命2%的创伤伤害',
        descRaw: '攻击范围向前延伸1格，攻击力<@ba.vup>+70%</>，攻击速度<@ba.vup>+30</>，攻击造成物理与法术混合伤害，每次命中造成相当于目标最大生命<@ba.vup>2%</>的创伤伤害',
        skillType: 'MANUAL',
        spType: 'INCREASE_WITH_TIME',
        spCost: 25,
        initSp: 10,
        duration: 18,
        bb: { atk_pct: 0.7, aspd_buff: 30, maxhp_dmg: 0.02 }
      },
      {
        name: '拉曼恰大巡游·梦幻狂想',
        desc: '化身管理者向前方3格突进并折返，对路径上所有敌人造成750%物理伤害，附带5秒眩晕；开启期间无敌且吸取造成伤害30%的生命值',
        descRaw: '化身管理者向前方3格突进并折返，对路径上所有敌人造成<@ba.vup>750%</>物理伤害，附带<@ba.vup>5</>秒眩晕；开启期间无敌且吸取造成伤害<@ba.vup>30%</>的生命值',
        skillType: 'MANUAL',
        spType: 'INCREASE_WITH_TIME',
        spCost: 35,
        initSp: 20,
        duration: 0,
        bb: { atk_scale: 7.5, stun_sec: 5, lifesteal: 0.3 }
      }
    ]
  },

  // 4. Meursault
  {
    tier: 3,
    sinner: 'meursault',
    name: '默尔索',
    appellation: 'Meursault',
    skinName: '剑契头领',
    profession: 'TANK',
    subProfessionId: 'unyield',
    subProfessionName: '决战者',
    subProfIcon: 'sub_unyield_icon',
    position: 'MELEE',
    bonds: ['limbusShip', 'indomShip'],
    dmgType: 'phys',
    attackKind: 'melee',
    projectile: 'melee',
    canHitFly: false,
    rangeGrid: [[0, 0], [0, 1]],
    statsBase: {
      maxHp: 3450, atk: 690, def: 620, res: 15, cost: 26, blockCnt: 1,
      bat: 1.5, aspd: 100, respawnTime: 70, spRecovery: 1, hpRecoveryPerSec: 0,
      moveSpeed: 1, tauntLevel: 0, massLevel: 0, deployLimit: 1, deckStack: 0
    },
    statsGolden: {
      maxHp: 6200, atk: 1250, def: 980, res: 20, cost: 26, blockCnt: 1,
      bat: 1.5, aspd: 105, respawnTime: 70, spRecovery: 1, hpRecoveryPerSec: 0,
      moveSpeed: 1, tauntLevel: 0, massLevel: 0, deployLimit: 1, deckStack: 0
    },
    trait: {
      desc: '只有阻挡敌人时才能够回复技力',
      descRaw: '只有阻挡敌人时才能够回复技力'
    },
    talents: [
      {
        talentId: 'talent_limbus_meursault_1',
        name: '剑契本领',
        desc: '自身暴击率提升25%；受到致命伤害时保留1点生命值，对攻击者立刻发动反击，使其受到相当于默尔索攻击力300%的真实伤害',
        descRaw: '自身暴击率提升<@ba.vup>25%</>；受到致命伤害时保留1点生命值，对攻击者立刻发动反击，使其受到相当于默尔索攻击力<@ba.vup>300%</>的真实伤害',
        bb: { crit_rate: 0.25, counter_scale: 3.0 }
      },
      {
        talentId: 'talent_limbus_meursault_2',
        name: '骨断心法',
        desc: '受到攻击时自身防御力提升2%，最多叠加15层',
        descRaw: '受到攻击时自身防御力提升<@ba.vup>2%</>，最多叠加15层',
        bb: { def_stack: 0.02, max_stack: 15 }
      }
    ],
    skills: [
      {
        name: '画龙点睛',
        desc: '下一次攻击造成220%物理伤害，必定暴击，若自身理智满值则无视目标30%防御力',
        descRaw: '下一次攻击造成<@ba.vup>220%</>物理伤害，必定暴击，若自身理智满值则无视目标<@ba.vup>30%</>防御力',
        skillType: 'AUTO',
        spType: 'INCREASE_WHEN_ATTACK',
        spCost: 3,
        initSp: 0,
        bb: { atk_scale: 2.2, def_ignore: 0.3 }
      },
      {
        name: '残忍刺斩',
        desc: '攻击力+80%，防御力+40%，攻击间隔缩短，每次命中使自身会心层数+2，受到的物理伤害减免25%',
        descRaw: '攻击力<@ba.vup>+80%</>，防御力<@ba.vup>+40%</>，攻击间隔缩短，每次命中使自身会心层数<@ba.vup>+2</>，受到的物理伤害减免<@ba.vup>25%</>',
        skillType: 'MANUAL',
        spType: 'INCREASE_WHEN_ATTACK',
        spCost: 20,
        initSp: 8,
        duration: 20,
        bb: { atk_pct: 0.8, def_pct: 0.4, bat_reduc: 0.3, dmg_reduc: 0.25 }
      },
      {
        name: '肉斩骨断',
        desc: '主动承受敌方所有攻击，受到的伤害降低60%；受到攻击时积蓄怒意，技能结束或受到致命伤害时释放骨断，对前方扇形范围内所有敌人造成800%物理伤害并必定暴击，击杀敌人回复全额生命',
        descRaw: '主动承受敌方所有攻击，受到的伤害降低<@ba.vdown>60%</>；受到攻击时积蓄怒意，技能结束或受到致命伤害时释放【骨断】，对前方扇形范围内所有敌人造成<@ba.vup>800%</>物理伤害并必定暴击，击杀敌人回复全额生命',
        skillType: 'MANUAL',
        spType: 'INCREASE_WHEN_ATTACK',
        spCost: 25,
        initSp: 10,
        duration: 15,
        bb: { dmg_reduc: 0.6, bone_scale: 8.0 }
      }
    ]
  },

  // 5. Ishmael
  {
    tier: 3,
    sinner: 'ishmael',
    name: '以实玛利',
    appellation: 'Ishmael',
    skinName: '裴廓德号船长',
    profession: 'WARRIOR',
    subProfessionId: 'instructor',
    subProfessionName: '教官',
    subProfIcon: 'sub_instructor_icon',
    position: 'MELEE',
    bonds: ['limbusShip', 'skillfulShip'],
    dmgType: 'phys',
    attackKind: 'melee',
    projectile: 'melee',
    canHitFly: false,
    rangeGrid: [[0, 0], [0, 1], [0, 2]],
    statsBase: {
      maxHp: 2450, atk: 610, def: 370, res: 0, cost: 16, blockCnt: 2,
      bat: 1.05, aspd: 100, respawnTime: 70, spRecovery: 1, hpRecoveryPerSec: 0,
      moveSpeed: 1, tauntLevel: 0, massLevel: 0, deployLimit: 1, deckStack: 0
    },
    statsGolden: {
      maxHp: 4380, atk: 1120, def: 620, res: 0, cost: 16, blockCnt: 2,
      bat: 1.05, aspd: 110, respawnTime: 70, spRecovery: 1, hpRecoveryPerSec: 0,
      moveSpeed: 1, tauntLevel: 0, massLevel: 0, deployLimit: 1, deckStack: 0
    },
    trait: {
      desc: '可以攻击到较远距离的敌人，无法阻挡的敌人受到攻击时受到额外伤害',
      descRaw: '可以攻击到较远距离的敌人，无法阻挡的敌人受到攻击时受到额外伤害'
    },
    talents: [
      {
        talentId: 'talent_limbus_ishmael_1',
        name: '追猎号令',
        desc: '攻击范围内的友方干员攻击力+12%、攻击速度+15；当以实玛利攻击敌人时，标记该目标为猎物，友方对其伤害提升20%',
        descRaw: '攻击范围内的友方干员攻击力<@ba.vup>+12%</>、攻击速度<@ba.vup>+15</>；当以实玛利攻击敌人时，标记该目标为【猎物】，友方对其伤害提升<@ba.vup>20%</>',
        bb: { ally_atk: 0.12, ally_aspd: 15, prey_bonus: 0.2 }
      },
      {
        talentId: 'talent_limbus_ishmael_2',
        name: '裴廓德之誓',
        desc: '场上每有一名友方【边狱公司】干员，自身暴击率提升4%',
        descRaw: '场上每有一名友方【边狱公司】干员，自身暴击率提升<@ba.vup>4%</>',
        bb: { crit_per_limbus: 0.04 }
      }
    ],
    skills: [
      {
        name: '执念投枪',
        desc: '下一次攻击投掷捕鲸叉，造成200%物理伤害并将目标拉向自身，使友方对其攻击附加5层流血',
        descRaw: '下一次攻击投掷捕鲸叉，造成<@ba.vup>200%</>物理伤害并将目标拉向自身，使友方对其攻击附加<@ba.vup>5</>层流血',
        skillType: 'AUTO',
        spType: 'INCREASE_WHEN_ATTACK',
        spCost: 3,
        initSp: 0,
        bb: { atk_scale: 2.0, bleed_stack: 5 }
      },
      {
        name: '全员突击令',
        desc: '攻击力+60%，使周围8格内所有近战友方干员立刻获得35点理智并攻击速度+40，以实玛利每次攻击会引导周围1名友方协同攻击',
        descRaw: '攻击力<@ba.vup>+60%</>，使周围8格内所有近战友方干员立刻获得<@ba.vup>35</>点理智并攻击速度<@ba.vup>+40</>，以实玛利每次攻击会引导周围1名友方协同攻击',
        skillType: 'MANUAL',
        spType: 'INCREASE_WITH_TIME',
        spCost: 28,
        initSp: 14,
        duration: 20,
        bb: { atk_pct: 0.6, ally_sanity: 35, ally_aspd: 40 }
      },
      {
        name: '盲目追猎·刺穿巨鲸',
        desc: '对猎物发动毁灭性贯穿突刺，造成600%物理伤害，若目标处于流血或凋亡损伤状态则伤害提升至900%；击杀目标后全场友方干员回复25点技力与满额理智',
        descRaw: '对【猎物】发动毁灭性贯穿突刺，造成<@ba.vup>600%</>物理伤害，若目标处于流血或凋亡损伤状态则伤害提升至<@ba.vup>900%</>；击杀目标后全场友方干员回复<@ba.vup>25</>点技力与满额理智',
        skillType: 'MANUAL',
        spType: 'INCREASE_WITH_TIME',
        spCost: 35,
        initSp: 18,
        duration: 0,
        bb: { atk_scale: 6.0, cond_scale: 9.0, sp_refund: 25 }
      }
    ]
  },

  // 6. Ryoshu
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

  // 7. Outis
  {
    tier: 4,
    sinner: 'outis',
    name: '奥提斯',
    appellation: 'Outis',
    skinName: '魔弹射手',
    profession: 'SNIPER',
    subProfessionId: 'longrange',
    subProfessionName: '神射手',
    subProfIcon: 'sub_longrange_icon',
    position: 'RANGED',
    bonds: ['limbusShip', 'preciShip'],
    dmgType: 'phys',
    attackKind: 'ranged',
    projectile: 'arrow',
    canHitFly: true,
    rangeGrid: [
      [1, 1], [1, 2], [1, 3],
      [0, 0], [0, 1], [0, 2], [0, 3],
      [-1, 1], [-1, 2], [-1, 3]
    ],
    statsBase: {
      maxHp: 1550, atk: 980, def: 140, res: 0, cost: 20, blockCnt: 1,
      bat: 2.7, aspd: 100, respawnTime: 70, spRecovery: 1, hpRecoveryPerSec: 0,
      moveSpeed: 1, tauntLevel: 0, massLevel: 0, deployLimit: 1, deckStack: 0
    },
    statsGolden: {
      maxHp: 2750, atk: 1820, def: 220, res: 0, cost: 20, blockCnt: 1,
      bat: 2.7, aspd: 105, respawnTime: 70, spRecovery: 1, hpRecoveryPerSec: 0,
      moveSpeed: 1, tauntLevel: 0, massLevel: 0, deployLimit: 1, deckStack: 0
    },
    trait: {
      desc: '优先攻击防御力最低的敌方单位',
      descRaw: '优先攻击防御力最低的敌方单位'
    },
    talents: [
      {
        talentId: 'talent_limbus_outis_1',
        name: '契约魔弹',
        desc: '攻击命中时使目标附带灼燃损伤；每次击倒敌人或造成过量伤害时获得1颗魔弹，上限7颗，每颗魔弹使自身攻击力提升8%',
        descRaw: '攻击命中时使目标附带灼燃损伤；每次击倒敌人或造成过量伤害时获得<@ba.vup>1</>颗【魔弹】，上限7颗，每颗魔弹使自身攻击力提升<@ba.vup>8%</>',
        bb: { burn_dmg: 100, max_bullets: 7, atk_per_bullet: 0.08 }
      },
      {
        talentId: 'talent_limbus_outis_2',
        name: '绝对命令',
        desc: '自身造成伤害时无视目标20%的防御力与法术抗性',
        descRaw: '自身造成伤害时无视目标<@ba.vup>20%</>的防御力与法术抗性',
        bb: { pierce_ratio: 0.2 }
      }
    ],
    skills: [
      {
        name: '狙击弹·贯穿',
        desc: '消耗1颗魔弹，下一次攻击射程无限且对直线上所有敌人造成260%物理伤害，无视目标40%防御力',
        descRaw: '消耗1颗魔弹，下一次攻击射程无限且对直线上所有敌人造成<@ba.vup>260%</>物理伤害，无视目标<@ba.vup>40%</>防御力',
        skillType: 'AUTO',
        spType: 'INCREASE_WHEN_ATTACK',
        spCost: 3,
        initSp: 0,
        bb: { atk_scale: 2.6, def_ignore: 0.4 }
      },
      {
        name: '第七契约弹',
        desc: '立刻装填至7颗魔弹，攻击力+100%，攻击附带法术与灼燃爆发，每颗弹丸会弹跳穿透至下一个敌人',
        descRaw: '立刻装填至<@ba.vup>7</>颗魔弹，攻击力<@ba.vup>+100%</>，攻击附带法术与灼燃爆发，每颗弹丸会弹跳穿透至下一个敌人',
        skillType: 'MANUAL',
        spType: 'INCREASE_WITH_TIME',
        spCost: 30,
        initSp: 15,
        duration: 20,
        bb: { atk_pct: 1.0, bounce_count: 2, burn_bonus: 250 }
      },
      {
        name: '黑焰终幕·全弹发射',
        desc: '锁定全图范围内生命值最高的敌方目标发射终极魔弹，对目标及其周围3格造成900%混合伤害并引爆全场灼燃损伤，若击杀目标则返还全额技力',
        descRaw: '锁定全图范围内生命值最高的敌方目标发射终极魔弹，对目标及其周围3格造成<@ba.vup>900%</>混合伤害并引爆全场灼燃损伤，若击杀目标则返还全额技力',
        skillType: 'MANUAL',
        spType: 'INCREASE_WITH_TIME',
        spCost: 40,
        initSp: 25,
        duration: 0,
        bb: { atk_scale: 9.0, aoe_radius: 3, refund_kill: 1 }
      }
    ]
  },

  // 8. Heathcliff
  {
    tier: 4,
    sinner: 'heathcliff',
    name: '希斯克利夫',
    appellation: 'Heathcliff',
    skinName: '狂猎魔王',
    profession: 'WARRIOR',
    subProfessionId: 'lord',
    subProfessionName: '领主',
    subProfIcon: 'sub_lord_icon',
    position: 'MELEE',
    bonds: ['limbusShip', 'raidShip'],
    dmgType: 'phys',
    attackKind: 'melee',
    projectile: 'melee',
    canHitFly: true,
    rangeGrid: [
      [1, 1], [1, 2],
      [0, 0], [0, 1], [0, 2],
      [-1, 1], [-1, 2]
    ],
    statsBase: {
      maxHp: 2780, atk: 750, def: 430, res: 10, cost: 19, blockCnt: 2,
      bat: 1.3, aspd: 100, respawnTime: 70, spRecovery: 1, hpRecoveryPerSec: 0,
      moveSpeed: 1, tauntLevel: 0, massLevel: 0, deployLimit: 1, deckStack: 0
    },
    statsGolden: {
      maxHp: 4950, atk: 1380, def: 680, res: 15, cost: 19, blockCnt: 2,
      bat: 1.3, aspd: 110, respawnTime: 70, spRecovery: 1, hpRecoveryPerSec: 0,
      moveSpeed: 1, tauntLevel: 0, massLevel: 0, deployLimit: 1, deckStack: 0
    },
    trait: {
      desc: '可以进行远程攻击，但此时攻击力降低至80%',
      descRaw: '可以进行远程攻击，但此时攻击力降低至<@ba.vdown>80%</>'
    },
    talents: [
      {
        talentId: 'talent_limbus_heathcliff_1',
        name: '呼啸山庄狂猎',
        desc: '攻击造成物理伤害并附带凋亡损伤；击倒敌人时召唤一匹死灵战马杜拉汉在目标位置冲撞，造成相当于自身攻击力150%的法术伤害',
        descRaw: '攻击造成物理伤害并附带凋亡损伤；击倒敌人时召唤一匹死灵战马【杜拉汉】在目标位置冲撞，造成相当于自身攻击力<@ba.vup>150%</>的法术伤害',
        bb: { ep_damage: 80, charge_atk: 1.5 }
      },
      {
        talentId: 'talent_limbus_heathcliff_2',
        name: '不灭怨念',
        desc: '生命值低于40%时，攻击速度+40，受到伤害降低25%',
        descRaw: '生命值低于40%时，攻击速度<@ba.vup>+40</>，受到伤害降低<@ba.vdown>25%</>',
        bb: { lowhp_aspd: 40, lowhp_reduc: 0.25 }
      }
    ],
    skills: [
      {
        name: '怨恨沉沦重击',
        desc: '下一次攻击造成240%物理伤害，对目标附带3层凋亡损伤，并使自身获得10点理智',
        descRaw: '下一次攻击造成<@ba.vup>240%</>物理伤害，对目标附带<@ba.vup>3</>层凋亡损伤，并使自身获得<@ba.vup>10</>点理智',
        skillType: 'AUTO',
        spType: 'INCREASE_WHEN_ATTACK',
        spCost: 3,
        initSp: 0,
        bb: { atk_scale: 2.4, ep_damage: 180, sanity_gain: 10 }
      },
      {
        name: '杜拉汉驰骋冲锋',
        desc: '跨上杜拉汉战马，攻击范围扩大，攻击力+80%，攻击变为群体攻击且远程攻击不再降低伤害，每次攻击使目标受到额外法术伤害',
        descRaw: '跨上杜拉汉战马，攻击范围扩大，攻击力<@ba.vup>+80%</>，攻击变为群体攻击且远程攻击不再降低伤害，每次攻击使目标受到额外法术伤害',
        skillType: 'MANUAL',
        spType: 'INCREASE_WITH_TIME',
        spCost: 28,
        initSp: 12,
        duration: 20,
        bb: { atk_pct: 0.8, extra_magic: 0.4 }
      },
      {
        name: '狂猎降临·挽歌哀嚎',
        desc: '自身理智瞬间转换为狂猎能量，攻击力+150%，防御力+50%，攻击速度+40，攻击阻挡的所有敌人并挥出大范围黑色剑气，造成超大范围物理与法术混伤',
        descRaw: '自身理智瞬间转换为狂猎能量，攻击力<@ba.vup>+150%</>，防御力<@ba.vup>+50%</>，攻击速度<@ba.vup>+40</>，攻击阻挡的所有敌人并挥出大范围黑色剑气，造成超大范围物理与法术混伤',
        skillType: 'MANUAL',
        spType: 'INCREASE_WITH_TIME',
        spCost: 38,
        initSp: 20,
        duration: 25,
        bb: { atk_pct: 1.5, def_pct: 0.5, aspd_buff: 40, aoe_scale: 1.2 }
      }
    ]
  },

  // 9. Hong Lu
  {
    tier: 5,
    sinner: 'honglu',
    name: '鸿璐',
    appellation: 'Hong Lu',
    skinName: '鸿园的君主-红露',
    profession: 'CASTER',
    subProfessionId: 'mystic',
    subProfessionName: '秘术师',
    subProfIcon: 'sub_mystic_icon',
    position: 'RANGED',
    bonds: ['limbusShip', 'arcaneShip'],
    dmgType: 'magic',
    attackKind: 'ranged',
    projectile: 'magic',
    canHitFly: true,
    rangeGrid: [
      [1, 1], [1, 2], [1, 3],
      [0, 0], [0, 1], [0, 2], [0, 3],
      [-1, 1], [-1, 2], [-1, 3]
    ],
    statsBase: {
      maxHp: 1950, atk: 1250, def: 140, res: 25, cost: 22, blockCnt: 1,
      bat: 3.0, aspd: 100, respawnTime: 70, spRecovery: 1, hpRecoveryPerSec: 0,
      moveSpeed: 1, tauntLevel: 0, massLevel: 0, deployLimit: 1, deckStack: 0
    },
    statsGolden: {
      maxHp: 3450, atk: 2250, def: 240, res: 30, cost: 22, blockCnt: 1,
      bat: 3.0, aspd: 110, respawnTime: 70, spRecovery: 1, hpRecoveryPerSec: 0,
      moveSpeed: 1, tauntLevel: 0, massLevel: 0, deployLimit: 1, deckStack: 0
    },
    trait: {
      desc: '攻击造成法术伤害；找不到攻击目标时可以将攻击能量储存起来之后一齐发射（最多3次）',
      descRaw: '攻击造成<@ba.kw>法术伤害</>；找不到攻击目标时可以将攻击能量储存起来之后一齐发射（最多3次）'
    },
    talents: [
      {
        talentId: 'talent_limbus_honglu_1',
        name: '红楼幻梦',
        desc: '普通攻击蓄力满3层时，额外造成相当于目标法术抗性50%的无视法抗伤害；全场友方【边狱公司】干员获得15%法术穿透',
        descRaw: '普通攻击蓄力满3层时，额外造成相当于目标法术抗性<@ba.vup>50%</>的无视法抗伤害；全场友方【边狱公司】干员获得<@ba.vup>15%</>法术穿透',
        bb: { res_pierce: 0.5, ally_pierce: 0.15 }
      },
      {
        talentId: 'talent_limbus_honglu_2',
        name: '君主威仪',
        desc: '自身理智达到满值时，法术伤害提升35%',
        descRaw: '自身理智达到满值时，法术伤害提升<@ba.vup>35%</>',
        bb: { full_sanity_dmg: 0.35 }
      }
    ],
    skills: [
      {
        name: '玉壶映月',
        desc: '消耗所有蓄力，发射出贯穿性翠玉宝珠，对直线上所有敌人造成350%法术伤害并附带3层凋亡损伤与停顿',
        descRaw: '消耗所有蓄力，发射出贯穿性翠玉宝珠，对直线上所有敌人造成<@ba.vup>350%</>法术伤害并附带<@ba.vup>3</>层凋亡损伤与停顿',
        skillType: 'AUTO',
        spType: 'INCREASE_WHEN_ATTACK',
        spCost: 4,
        initSp: 0,
        bb: { atk_scale: 3.5, ep_damage: 220, slow_dur: 1.5 }
      },
      {
        name: '君临鸿园·锦绣消融',
        desc: '攻击范围扩大至全屏，攻击力+90%，蓄力上限提升至5层，每次攻击使目标受到的法术伤害提升40%，持续20秒',
        descRaw: '攻击范围扩大至全屏，攻击力<@ba.vup>+90%</>，蓄力上限提升至5层，每次攻击使目标受到的法术伤害提升<@ba.vup>40%</>，持续<@ba.vup>20</>秒',
        skillType: 'MANUAL',
        spType: 'INCREASE_WITH_TIME',
        spCost: 35,
        initSp: 18,
        duration: 20,
        bb: { atk_pct: 0.9, charge_max: 5, magic_vuln: 0.4 }
      },
      {
        name: '红楼千红一哭·万艳同悲',
        desc: '召唤鸿园消融结界，全场所有敌人每秒受到鸿璐攻击力100%的真实伤害与凋亡损伤，持续12秒；结界结束时释放万千玉碎，对全场所有敌人造成1200%的毁灭性法术核弹伤害',
        descRaw: '召唤鸿园消融结界，全场所有敌人每秒受到鸿璐攻击力<@ba.vup>100%</>的真实伤害与凋亡损伤，持续<@ba.vup>12</>秒；结界结束时释放万千玉碎，对全场所有敌人造成<@ba.vup>1200%</>的毁灭性法术核弹伤害',
        skillType: 'MANUAL',
        spType: 'INCREASE_WITH_TIME',
        spCost: 45,
        initSp: 25,
        duration: 12,
        bb: { dot_atk: 1.0, dot_ep: 150, finale_scale: 12.0 }
      }
    ]
  },

  // 10. Gregor
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

function buildSkillEntry(sinnerKey, sIndex, sDef, isGolden) {
  const skillId = `skchr_${sinnerKey}_${sIndex + 1}`;
  const iconId = skillId;
  const level = isGolden ? 7 : 4;
  return {
    skillId,
    iconId,
    name: sDef.name,
    level,
    desc: sDef.desc,
    descRaw: sDef.descRaw,
    skillType: sDef.skillType,
    durationType: sDef.duration ? 'NONE' : 'NONE',
    duration: sDef.duration || 0,
    spType: sDef.spType,
    spCost: sDef.spCost,
    initSp: sDef.initSp,
    maxChargeTime: sDef.skillType === 'AUTO' ? 2 : 1,
    increment: 1,
    bb: sDef.bb,
    bbStr: {},
    rangeId: null,
    rangeGrid: null,
    prefabId: skillId,
    trigger: {
      rule: 'DEFAULT',
      rawRule: 'DEFAULT',
      customRangeGrid: null
    },
    index: sIndex,
    overrideTokenKey: null
  };
}

function buildChessEntry(def, isGolden, identifier, shopSortId) {
  const sinnerKey = def.sinner;
  const chessId = `chess_char_${def.tier}_limbus_${sinnerKey}_${isGolden ? 'b' : 'a'}`;
  const baseId = `chess_char_${def.tier}_limbus_${sinnerKey}_a`;
  const goldenId = `chess_char_${def.tier}_limbus_${sinnerKey}_b`;
  const garrisonId = `garrison_limbus_${sinnerKey}_${isGolden ? 'b' : 'a'}`;
  const charId = `char_limbus_${sinnerKey}`;

  const allSkills = def.skills.map((s, idx) => buildSkillEntry(sinnerKey, idx, s, isGolden));
  const activeSkill = allSkills[0];

  return {
    chessId,
    baseId,
    goldenId,
    isGolden,
    tier: def.tier,
    identifier,
    isHidden: false,
    isDiy: false,
    visible: true,
    chessType: 'PRESET',
    shopSortId,
    charId,
    name: def.name,
    appellation: def.appellation,
    rarity: 6,
    profession: def.profession,
    subProfessionId: def.subProfessionId,
    subProfessionName: def.subProfessionName,
    position: def.position,
    nationId: 'limbus',
    bonds: def.bonds,
    garrisonIds: [garrisonId],
    price: def.tier,
    sellPrice: def.tier,
    upgradeNum: isGolden ? 0 : 3,
    upgradeChessId: isGolden ? null : goldenId,
    status: {
      phase: isGolden ? 2 : 1,
      level: isGolden ? 90 : 1,
      skillLevel: isGolden ? 7 : 4,
      equipLevel: 0
    },
    stats: isGolden ? def.statsGolden : def.statsBase,
    immunities: null,
    rangeGrid: def.rangeGrid,
    dmgType: def.dmgType,
    attackKind: def.attackKind,
    projectile: def.projectile,
    canHitFly: def.canHitFly,
    targetPriority: null,
    trait: {
      desc: def.trait.desc,
      descRaw: def.trait.descRaw,
      bb: {},
      bbStr: {},
      rangeGrid: null
    },
    skill: activeSkill,
    skills: allSkills,
    allSkills,
    talents: def.talents,
    tokens: [],
    module: null,
    assets: {
      avatar: charId,
      portrait: `${charId}_1`,
      skillIcon: `skchr_${sinnerKey}_1`,
      subProfIcon: def.subProfIcon
    }
  };
}

// 1. Process chess.json
const existingChess = JSON.parse(fs.readFileSync(CHESS_PATH, 'utf8'));
let nextId = 123;
let nextSort = 23;

for (const def of SINNER_DEFS) {
  const baseEntry = buildChessEntry(def, false, nextId, nextSort);
  const goldenEntry = buildChessEntry(def, true, nextId, nextSort);
  existingChess[baseEntry.chessId] = baseEntry;
  existingChess[goldenEntry.chessId] = goldenEntry;
  nextId++;
  nextSort++;
}
fs.writeFileSync(CHESS_PATH, JSON.stringify(existingChess, null, 2), 'utf8');
console.log(`Updated chess.json: total ${Object.keys(existingChess).length} chess entries.`);

// 2. Process garrisons.json
const existingGarrisons = JSON.parse(fs.readFileSync(GARRISONS_PATH, 'utf8'));
for (const def of SINNER_DEFS) {
  const sk = def.sinner;
  const gIdA = `garrison_limbus_${sk}_a`;
  const gIdB = `garrison_limbus_${sk}_b`;
  const cIdA = `chess_char_${def.tier}_limbus_${sk}_a`;
  const cIdB = `chess_char_${def.tier}_limbus_${sk}_b`;

  existingGarrisons[gIdA] = {
    garrisonId: gIdA,
    desc: '<获得时>【边狱公司】层数+2（无需激活盟约）',
    descRaw: '<获得时>【边狱公司】层数<@ba.vup>+2</>（无需激活盟约）',
    eventType: 'SERVER_GAIN',
    eventTypeDesc: '单次叠加',
    eventTypeIcon: 'icon_bond',
    effectType: 'SERVER_ADD_BOND',
    effectKey: 'SERVER_ADD_BOND',
    battleRuneKey: null,
    charLevel: 0,
    bb: { count: 2 },
    bbStr: { bond: 'limbusShip' },
    owners: [cIdA]
  };

  existingGarrisons[gIdB] = {
    garrisonId: gIdB,
    desc: '<获得时>【边狱公司】层数+4（无需激活盟约）',
    descRaw: '<获得时>【边狱公司】层数<@ba.vup>+4</>（无需激活盟约）',
    eventType: 'SERVER_GAIN',
    eventTypeDesc: '单次叠加',
    eventTypeIcon: 'icon_bond',
    effectType: 'SERVER_ADD_BOND',
    effectKey: 'SERVER_ADD_BOND',
    battleRuneKey: null,
    charLevel: 0,
    bb: { count: 4 },
    bbStr: { bond: 'limbusShip' },
    owners: [cIdB]
  };
}
fs.writeFileSync(GARRISONS_PATH, JSON.stringify(existingGarrisons, null, 2), 'utf8');
console.log(`Updated garrisons.json: total ${Object.keys(existingGarrisons).length} garrison entries.`);

// 3. Process skins.json
const existingSkins = JSON.parse(fs.readFileSync(SKINS_PATH, 'utf8'));
for (const def of SINNER_DEFS) {
  const charId = `char_limbus_${def.sinner}`;
  existingSkins[charId] = [
    {
      id: `${charId}@limbus#1`,
      name: def.skinName,
      group: '边狱公司'
    }
  ];
}
fs.writeFileSync(SKINS_PATH, JSON.stringify(existingSkins, null, 2), 'utf8');
console.log(`Updated skins.json: total ${Object.keys(existingSkins).length} characters registered.`);

// 4. Process bonds.json
const existingBonds = JSON.parse(fs.readFileSync(BONDS_PATH, 'utf8'));
const all12BaseChess = [
  'chess_char_1_limbus_yisang_a',
  'chess_char_1_limbus_faust_a',
  'chess_char_2_limbus_sinclair_a',
  'chess_char_2_limbus_rodion_a',
  'chess_char_3_limbus_donquixote_a',
  'chess_char_3_limbus_meursault_a',
  'chess_char_3_limbus_ishmael_a',
  'chess_char_4_limbus_ryoshu_a',
  'chess_char_4_limbus_outis_a',
  'chess_char_4_limbus_heathcliff_a',
  'chess_char_5_limbus_honglu_a',
  'chess_char_5_limbus_gregor_a'
];
existingBonds.limbusShip.members = all12BaseChess;
existingBonds.limbusShip.visibleMembers = all12BaseChess;
fs.writeFileSync(BONDS_PATH, JSON.stringify(existingBonds, null, 2), 'utf8');
console.log(`Updated bonds.json: limbusShip has ${all12BaseChess.length} members.`);

// 5. Process mod.json
const allChessList = [];
const allGarrisonList = [];
const allSkinList = [
  'char_limbus_yisang@limbus#1',
  'char_limbus_sinclair@limbus#1'
];

for (const k of Object.keys(existingChess)) {
  allChessList.push(k);
}
for (const k of Object.keys(existingGarrisons)) {
  allGarrisonList.push(k);
}
for (const def of SINNER_DEFS) {
  allSkinList.push(`char_limbus_${def.sinner}@limbus#1`);
}

const modMeta = {
  id: 'limbus-company',
  name: '边狱公司 (Limbus Company)',
  version: '1.0.0',
  description: '新增【边狱公司】势力核心盟约及完整12罪人干员（李箱、浮士德、唐吉诃德、良秀、默尔索、鸿璐、希斯克利夫、以实玛利、罗佳、辛克莱、奥提斯、格里高尔）',
  author: 'ruka',
  bonds: ['limbusShip'],
  chess: allChessList,
  garrisons: allGarrisonList,
  skins: allSkinList
};
fs.writeFileSync(MOD_PATH, JSON.stringify(modMeta, null, 2), 'utf8');
console.log(`Updated mod.json with full 12 sinners roster.`);
