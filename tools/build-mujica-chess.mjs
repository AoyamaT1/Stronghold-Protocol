// tools/build-mujica-chess.mjs — Construct complete skills and modules for Ave Mujica chess
import { readFileSync, writeFileSync } from 'node:fs';

const official = JSON.parse(readFileSync('official_mujica_data.json', 'utf8'));
const currentChess = JSON.parse(readFileSync('mods/ave-mujica/data/chess.json', 'utf8'));

const CHAR_MAPPING = {
  char_4185_amoris: { normal: 'chess_char_2_20_a', golden: 'chess_char_2_20_b', defaultSkill: 0, modLevel: 1 },
  char_4186_tmoris: { normal: 'chess_char_3_22_a', golden: 'chess_char_3_22_b', defaultSkill: 0, modLevel: 1 },
  char_4183_mortis: { normal: 'chess_char_4_27_a', golden: 'chess_char_4_27_b', defaultSkill: 0, modLevel: 1 },
  char_4184_dolris: { normal: 'chess_char_5_24_a', golden: 'chess_char_5_24_b', defaultSkill: 0, modLevel: 1 },
  char_4182_oblvns: { normal: 'chess_char_6_21_a', golden: 'chess_char_6_21_b', defaultSkill: 2, modLevel: 3 }
};

for (const [charId, cfg] of Object.entries(CHAR_MAPPING)) {
  const off = official[charId];
  if (!off) continue;

  const normalChess = currentChess[cfg.normal];
  const goldenChess = currentChess[cfg.golden];

  const buildSkillRecord = (sInfo, isGolden, isDef) => {
    const lvl = isGolden ? sInfo.lvl7 : sInfo.lvl4;
    const bbObj = {};
    for (const b of lvl.blackboard || []) {
      bbObj[b.key] = b.value;
    }

    return {
      skillId: sInfo.skillId,
      iconId: sInfo.skillId,
      name: lvl.name,
      level: isGolden ? 7 : 4,
      desc: lvl.description.replace(/\\n/g, '\n'),
      descRaw: lvl.description.replace(/\\n/g, '\n'),
      skillType: lvl.skillType,
      durationType: lvl.durationType,
      duration: lvl.duration > 0 ? lvl.duration : 0,
      spType: lvl.spData.spType,
      spCost: lvl.spData.spCost,
      initSp: lvl.spData.initSp,
      maxChargeTime: lvl.spData.maxChargeTime || 1,
      increment: lvl.spData.increment || 1,
      bb: bbObj,
      bbStr: {},
      rangeId: lvl.rangeId || null,
      rangeGrid: null,
      prefabId: sInfo.skillId,
      trigger: {
        rule: 'DEFAULT',
        rawRule: 'DEFAULT',
        customRangeGrid: null
      },
      index: sInfo.index,
      overrideTokenKey: null,
      isDefault: isDef
    };
  };

  // Normal chess skills
  normalChess.skills = off.skills.map(s => buildSkillRecord(s, false, s.index === cfg.defaultSkill));
  const defSkillNormal = normalChess.skills.find(s => s.index === cfg.defaultSkill) || normalChess.skills[0];
  normalChess.skill = { ...defSkillNormal };
  delete normalChess.skill.isDefault;

  // Normal chess module
  const modMeta = off.module.meta;
  normalChess.module = {
    id: off.module.id,
    name: modMeta.uniEquipName,
    type: `${modMeta.typeName1}-${modMeta.typeName2}`,
    level: 0,
    active: false
  };

  // Golden chess skills
  goldenChess.skills = off.skills.map(s => buildSkillRecord(s, true, s.index === cfg.defaultSkill));
  const defSkillGolden = goldenChess.skills.find(s => s.index === cfg.defaultSkill) || goldenChess.skills[0];
  goldenChess.skill = { ...defSkillGolden };
  delete goldenChess.skill.isDefault;

  // Golden chess module
  const phIdx = Math.min(cfg.modLevel - 1, off.module.battle.phases.length - 1);
  const phaseData = off.module.battle.phases[phIdx];
  const modAttr = {};
  for (const a of phaseData.attributeBlackboard || []) {
    const k = a.key === 'max_hp' ? 'maxHp' : a.key === 'attack_speed' ? 'aspd' : a.key;
    modAttr[k] = a.value;
  }

  // Trait candidate
  let traitOverride = null;
  for (const part of phaseData.parts || []) {
    if (part.overrideTraitDataBundle?.candidates?.length) {
      const c = part.overrideTraitDataBundle.candidates[0];
      const bb = {};
      for (const b of c.blackboard || []) bb[b.key] = b.value;
      traitOverride = {
        desc: normalChess.trait.desc + (c.additionalDescription ? '，' + c.additionalDescription : ''),
        descRaw: normalChess.trait.descRaw + (c.additionalDescription ? '，' + c.additionalDescription : ''),
        bb,
        bbStr: {},
        rangeGrid: null
      };
    }
  }

  goldenChess.module = {
    id: off.module.id,
    name: modMeta.uniEquipName,
    type: `${modMeta.typeName1}-${modMeta.typeName2}`,
    level: cfg.modLevel,
    active: true
  };

  goldenChess.status.equipLevel = cfg.modLevel;

  goldenChess.modules = [
    {
      uniEquipId: off.module.id,
      name: modMeta.uniEquipName,
      typeName: `${modMeta.typeName1}-${modMeta.typeName2}`,
      typeIcon: `${modMeta.typeName1.toLowerCase()}-${modMeta.typeName2.toLowerCase()}`,
      icon: off.module.id,
      isDefault: true,
      level: cfg.modLevel,
      attr: modAttr,
      traitOverride: traitOverride || { ...goldenChess.trait },
      talentChanges: []
    }
  ];

  goldenChess.statsBase = { ...goldenChess.stats };
  // Add module stat bonuses to stats
  if (modAttr.maxHp) goldenChess.stats.maxHp += modAttr.maxHp;
  if (modAttr.atk) goldenChess.stats.atk += modAttr.atk;
  if (modAttr.def) goldenChess.stats.def += modAttr.def;
  if (modAttr.aspd) goldenChess.stats.aspd += modAttr.aspd;

  goldenChess.traitBase = { ...normalChess.trait };
  goldenChess.talentsBase = JSON.parse(JSON.stringify(normalChess.talents || []));
}

writeFileSync('mods/ave-mujica/data/chess.json', JSON.stringify(currentChess, null, 2), 'utf8');
console.log('Successfully updated mods/ave-mujica/data/chess.json with all skills and modules!');
