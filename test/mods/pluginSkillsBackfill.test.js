// test/mods/pluginSkillsBackfill.test.js — Comprehensive verification for backfilled Limbus and FGO operators
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { skillSpecSource, KITS } from '../../server/sim/content/index.js';
import { expandRecords } from '../../shared/plugins/records.js';
import { canonicalVoiceCharId, voiceLine } from '../../public/js/audio.js';
import { pluginDirs } from '../../tools/plugin.mjs';
import { createPluginRegistry } from '../../server/plugins/registry.js';
import { buildContentSet } from '../../server/plugins/contentSet.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { toDataSource } from '../../server/sim/simdata.js';
import { FX_KINDS } from '../../public/js/render/fx/kinds.js';

const ROOT = path.resolve('.');
const assets = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const garrisons = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/garrisons.json'), 'utf8'));
const tokens = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tokens.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/config.json'), 'utf8'));

const registry = createPluginRegistry(pluginDirs(process.cwd()));
const set = buildContentSet({ registry, ids: ['limbus-company', 'fgo-round-table'] });
const ds = toDataSource(set.data);

const TIER_CAPS = {
  1: { maxHp: 2530, atk: 921, def: 516, dps: 502 },
  2: { maxHp: 2895, atk: 728, def: 495, dps: 478 },
  3: { maxHp: 2938, atk: 875, def: 530, dps: 702 },
  4: { maxHp: 2867, atk: 1020, def: 557, dps: 517 },
  5: { maxHp: 4947, atk: 1362, def: 514, dps: 640 },
  6: { maxHp: 2703, atk: 1118, def: 444, dps: 621 }
};

describe('边狱公司 (Limbus Company) 12罪人技能与数值回填核查', () => {
  const sinners = [
    'yisang', 'sinclair', 'faust', 'ishmael', 'rodion', 'heathcliff',
    'honglu', 'meursault', 'ryoshu', 'outis', 'donquixote', 'gregor'
  ];

  test('全12罪人数据记录完备性与契约合规 (3技能/天赋/特性/驻扎/Tier数值)', () => {
    for (const name of sinners) {
      const filePath = path.join(ROOT, `plugins/limbus-company/operators/${name}.json`);
      assert.ok(fs.existsSync(filePath), `${name}.json exists`);
      const op = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      assert.equal(op.op, 1);
      assert.equal(op.charId, `char_x_limbus_company_${name}`);
      assert.equal(op.as, 'both');
      assert.equal(op.kit, 'generic');
      assert.equal(op.nationId, 'limbus');

      const tier = op.chess.tier;
      assert.ok(tier >= 1 && tier <= 6, `${name} tier is valid`);
      const cap = TIER_CAPS[tier];

      // Garrison IDs
      assert.ok(op.chess.garrisonIds?.normal?.length > 0, `${name} has normal garrison`);
      assert.ok(op.chess.garrisonIds?.golden?.length > 0, `${name} has golden garrison`);
      assert.ok(garrisons[op.chess.garrisonIds.normal[0]], `${op.chess.garrisonIds.normal[0]} in garrisons.json`);
      assert.ok(garrisons[op.chess.garrisonIds.golden[0]], `${op.chess.garrisonIds.golden[0]} in garrisons.json`);

      // Stats check
      for (const form of ['normal', 'elite']) {
        const st = op.forms[form].stats;
        assert.ok(st, `${name} has ${form} stats`);
        const dps = Math.round(st.atk / st.bat);
        assert.ok(st.maxHp <= cap.maxHp, `${name} ${form} HP ${st.maxHp} <= ${cap.maxHp}`);
        assert.ok(st.atk <= cap.atk, `${name} ${form} ATK ${st.atk} <= ${cap.atk}`);
        assert.ok(st.def <= cap.def, `${name} ${form} DEF ${st.def} <= ${cap.def}`);
        assert.ok(dps <= cap.dps, `${name} ${form} DPS ${dps} <= ${cap.dps}`);
        assert.ok(st.cost > 0, `${name} ${form} cost > 0`);
        assert.ok(st.respawnTime > 0, `${name} ${form} respawnTime > 0`);
      }

      // Skills check
      assert.equal(op.skills.length, 3, `${name} has 3 skills`);
      const defSkills = op.skills.filter(s => s.default);
      assert.equal(defSkills.length, 1, `${name} has exactly 1 default skill`);
      for (const s of op.skills) {
        assert.ok(s.skillId.startsWith('skx_limbus_company_'), `${s.skillId} namespaced`);
        assert.ok(s.name.length > 0, `${s.skillId} has name`);
        assert.ok(s.desc.length > 0, `${s.skillId} has desc`);
        assert.ok(!/[（）]/.test(s.desc), `${s.skillId} desc has no full-width parentheses`);
        assert.ok(typeof s.bb === 'object', `${s.skillId} has bb object`);
      }

      // Talents check
      assert.ok(op.talents.length > 0, `${name} has talents`);
      for (const t of op.talents) {
        assert.ok(!/[（）]/.test(t.desc), `${name} talent ${t.name} has no full-width parentheses`);
      }

      // Trait check
      assert.ok(op.trait && op.trait.desc, `${name} has trait`);
      assert.ok(!/[（）]/.test(op.trait.desc), `${name} trait has no full-width parentheses`);
    }
  });

  test('全12罪人全技能 (36个技能) 均命中专属 kit 实现 (skillSpecSource === skills)', () => {
    for (const name of sinners) {
      const op = JSON.parse(fs.readFileSync(path.join(ROOT, `plugins/limbus-company/operators/${name}.json`), 'utf8'));
      const chessId = `chess_x_limbus_company_${name}_a`;

      for (const s of op.skills) {
        const def = {
          id: chessId,
          charId: op.charId,
          skill: { skillId: s.skillId },
          loadout: { skillIsDefault: s.default }
        };
        const src = skillSpecSource(def, KITS);
        assert.equal(src, 'skills', `${name} ${s.skillId} (${s.name}) resolves to 'skills'`);
      }
    }
  });

  test('全12罪人语音系统 100% 完整解析', () => {
    for (const name of sinners) {
      const charId = `char_x_limbus_company_${name}`;
      const chessId = `chess_x_limbus_company_${name}_a`;
      const expected = `char_limbus_${name}`;

      assert.equal(canonicalVoiceCharId(charId), expected);
      assert.equal(canonicalVoiceCharId(chessId), expected);

      for (const slot of ['start', 'place', 'select', 'skill1', 'skill2', 'skill3', 'resultLose']) {
        const cnLine = voiceLine(assets.audio, charId, slot, 'cn', () => 0);
        assert.ok(cnLine && cnLine.url, `${charId} 缺 ${slot} 语音`);
        assert.ok(fs.existsSync(path.join(ROOT, 'public', cnLine.url.replace(/^\//, ''))), `${cnLine.url} 文件存在`);
      }
    }
  });
});

describe('圆桌骑士 (FGO Round Table) 15从者技能与数值回填核查', () => {
  const servants = [
    'gareth', 'bedivere', 'tristan', 'percival', 'baobhan', 'gawain',
    'barghest', 'mash', 'lancelot', 'mordred', 'melusine', 'artoria',
    'merlin', 'castoria', 'morgan'
  ];

  test('全15从者数据记录完备性与契约合规 (3技能/天赋/特性/驻扎/Tier数值)', () => {
    for (const name of servants) {
      const filePath = path.join(ROOT, `plugins/fgo-round-table/operators/${name}.json`);
      assert.ok(fs.existsSync(filePath), `${name}.json exists`);
      const op = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      assert.equal(op.op, 1);
      assert.equal(op.charId, `char_x_fgo_round_table_${name}`);
      assert.equal(op.as, 'both');
      assert.equal(op.kit, 'generic');
      assert.equal(op.nationId, 'fgo');

      const tier = op.chess.tier;
      assert.ok(tier >= 1 && tier <= 6, `${name} tier is valid`);
      const cap = TIER_CAPS[tier];

      // Garrison IDs
      assert.ok(op.chess.garrisonIds?.normal?.length > 0, `${name} has normal garrison`);
      assert.ok(op.chess.garrisonIds?.golden?.length > 0, `${name} has golden garrison`);
      assert.ok(garrisons[op.chess.garrisonIds.normal[0]], `${op.chess.garrisonIds.normal[0]} in garrisons.json`);
      assert.ok(garrisons[op.chess.garrisonIds.golden[0]], `${op.chess.garrisonIds.golden[0]} in garrisons.json`);

      // Stats check
      for (const form of ['normal', 'elite']) {
        const st = op.forms[form].stats;
        assert.ok(st, `${name} has ${form} stats`);
        const dps = Math.round(st.atk / st.bat);
        assert.ok(st.maxHp <= cap.maxHp, `${name} ${form} HP ${st.maxHp} <= ${cap.maxHp}`);
        assert.ok(st.atk <= cap.atk, `${name} ${form} ATK ${st.atk} <= ${cap.atk}`);
        assert.ok(st.def <= cap.def, `${name} ${form} DEF ${st.def} <= ${cap.def}`);
        assert.ok(dps <= cap.dps, `${name} ${form} DPS ${dps} <= ${cap.dps}`);
        assert.ok(st.cost > 0, `${name} ${form} cost > 0`);
        assert.ok(st.respawnTime > 0, `${name} ${form} respawnTime > 0`);
      }

      // Skills check
      assert.equal(op.skills.length, 3, `${name} has 3 skills`);
      const defSkills = op.skills.filter(s => s.default);
      assert.equal(defSkills.length, 1, `${name} has exactly 1 default skill`);
      for (const s of op.skills) {
        assert.ok(s.skillId.startsWith('skx_fgo_round_table_'), `${s.skillId} namespaced`);
        assert.ok(s.name.length > 0, `${s.skillId} has name`);
        assert.ok(s.desc.length > 0, `${s.skillId} has desc`);
        assert.ok(!/[（）]/.test(s.desc), `${s.skillId} desc has no full-width parentheses`);
        assert.ok(typeof s.bb === 'object', `${s.skillId} has bb object`);
      }

      // Talents check
      assert.ok(op.talents.length > 0, `${name} has talents`);
      for (const t of op.talents) {
        assert.ok(!/[（）]/.test(t.desc), `${name} talent ${t.name} has no full-width parentheses`);
      }

      // Trait check
      assert.ok(op.trait && op.trait.desc, `${name} has trait`);
      assert.ok(!/[（）]/.test(op.trait.desc), `${name} trait has no full-width parentheses`);
    }
  });

  test('全15从者全技能 (45个技能) 均命中专属 kit 实现 (skillSpecSource === skills)', () => {
    for (const name of servants) {
      const op = JSON.parse(fs.readFileSync(path.join(ROOT, `plugins/fgo-round-table/operators/${name}.json`), 'utf8'));
      const chessId = `chess_x_fgo_round_table_${name}_a`;

      for (const s of op.skills) {
        const def = {
          id: chessId,
          charId: op.charId,
          skill: { skillId: s.skillId },
          loadout: { skillIsDefault: s.default }
        };
        const src = skillSpecSource(def, KITS);
        assert.equal(src, 'skills', `${name} ${s.skillId} (${s.name}) resolves to 'skills'`);
      }
    }
  });

  test('全15从者语音系统 100% 完整解析', () => {
    for (const name of servants) {
      const charId = `char_x_fgo_round_table_${name}`;
      const chessId = `chess_x_fgo_round_table_${name}_a`;
      const expected = `char_fgo_${name}`;

      assert.equal(canonicalVoiceCharId(charId), expected);
      assert.equal(canonicalVoiceCharId(chessId), expected);

      for (const slot of ['start', 'place', 'select', 'skill1', 'skill2', 'skill3', 'attack', 'hurt', 'die', 'resultLose']) {
        const jpLine = voiceLine(assets.audio, charId, slot, 'jp', () => 0);
        assert.ok(jpLine && jpLine.url, `${charId} 缺 ${slot} 语音`);
        assert.ok(fs.existsSync(path.join(ROOT, 'public', jpLine.url.replace(/^\//, ''))), `${jpLine.url} 文件存在`);
      }
    }
  });
});

describe('全量插件干员 expandRecords 展开与数据一致性测试', () => {
  test('27名插件干员 (54枚棋子) 全部正确展开，零冲突、零问题', () => {
    const bonds = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/bonds.json')));
    for (const b of Object.values(bonds)) { b.members = []; b.visibleMembers = []; }
    let data = {
      chess: JSON.parse(fs.readFileSync(path.join(ROOT, 'data/chess.json'))),
      bonds,
      backups: JSON.parse(fs.readFileSync(path.join(ROOT, 'data/backups.json'))),
      config: { economy: config.economy }
    };

    const limbusOps = fs.readdirSync(path.join(ROOT, 'plugins/limbus-company/operators')).map(f => JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins/limbus-company/operators/' + f))));
    const res1 = expandRecords(data, limbusOps, { pluginId: 'limbus-company' });
    assert.equal(res1.problems.length, 0, 'Limbus expandRecords has 0 problems');

    const fgoOps = fs.readdirSync(path.join(ROOT, 'plugins/fgo-round-table/operators')).map(f => JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins/fgo-round-table/operators/' + f))));
    const res2 = expandRecords(res1.data, fgoOps, { pluginId: 'fgo-round-table' });
    assert.equal(res2.problems.length, 0, 'FGO expandRecords has 0 problems');

    const limbusChess = Object.keys(res2.data.chess).filter(k => k.startsWith('chess_x_limbus_company_'));
    const fgoChess = Object.keys(res2.data.chess).filter(k => k.startsWith('chess_x_fgo_round_table_'));

    assert.equal(limbusChess.length, 24, '24 Limbus chess pieces (12 normal + 12 elite)');
    assert.equal(fgoChess.length, 30, '30 FGO chess pieces (15 normal + 15 elite)');
  });

  test('召唤物 token_limbus_jaro 存在于 data/tokens.json', () => {
    assert.ok(tokens.token_limbus_jaro, 'token_limbus_jaro exists');
    assert.equal(tokens.token_limbus_jaro.tokenId, 'token_limbus_jaro');
    assert.equal(tokens.token_limbus_jaro.name, '卯兔');
  });
});

describe('插件干员实战模拟 (Live Battle Sim) 关键机制核查', () => {
  test('Faust S3 拥有合法数值 atkScale 与 dmgMul 动态增伤函数', () => {
    const h = makeBattle({
      data: ds,
      defs: { enemies: { enemy_test: enemyRec({ key: 'enemy_test', hp: 300000, def: 100, res: 20, speed: 0 }) } },
      units: [{ chessId: 'chess_x_limbus_company_faust_a', row: 10, col: 4, skillIndex: 2 }],
    });
    const faust = h.unit('chess_x_limbus_company_faust_a');
    assert.ok(faust, 'Faust deployed');
    assert.equal(typeof faust.skill.spec.attack.atkScale, 'number', 'atkScale is a number, not NaN');
    assert.equal(faust.skill.spec.attack.atkScale, 2.6, 'atkScale is 2.6');
    assert.equal(typeof faust.skill.spec.attack.dmgMul, 'function', 'dmgMul is a function');
  });

  test('Yi Sang 攻击时通过 nationId 成功向理智最低友方供给理智 (lowestSanityAlly)', () => {
    const h = makeBattle({
      data: ds,
      bonds: { limbusShip: { count: 3, active: true, tier: 1, layers: 5 } },
      defs: { enemies: { enemy_test: enemyRec({ key: 'enemy_test', hp: 300000, def: 0, res: 0, speed: 0 }) } },
      units: [
        { chessId: 'chess_x_limbus_company_yisang_a', row: 10, col: 4 },
        { chessId: 'chess_x_limbus_company_faust_a', row: 10, col: 5 },
      ],
    });
    const faust = h.unit('chess_x_limbus_company_faust_a');
    assert.ok(faust, 'Faust deployed');
    faust.mem.limbusSanity = 5;
    h.spawn('enemy_test', { pos: [10, 6] });
    h.run(3.0);
    assert.equal(faust.mem.limbusSanity, 7, `Faust sanity fed: 5 -> ${faust.mem.limbusSanity}`);
  });

  test('Faust 在场降低相邻边狱公司友方技力消耗光环 (buff:faust:tempo)', () => {
    const h = makeBattle({
      data: ds,
      bonds: { limbusShip: { count: 3, active: true, tier: 1, layers: 5 } },
      defs: { enemies: { enemy_test: enemyRec({ key: 'enemy_test', hp: 300000, def: 0, res: 0, speed: 0 }) } },
      units: [
        { chessId: 'chess_x_limbus_company_faust_a', row: 10, col: 4 },
        { chessId: 'chess_x_limbus_company_sinclair_a', row: 10, col: 5 },
      ],
    });
    h.run(1.0);
    const sinclair = h.unit('chess_x_limbus_company_sinclair_a');
    const buff = sinclair.findBuff('buff:faust:tempo');
    assert.ok(buff, 'Sinclair received buff:faust:tempo from adjacent Faust');
    assert.equal(buff.mods?.spCostFlat, -1, 'spCostFlat is -1');
  });
});

describe('全量 27 名插件干员 81 个技能（S1/S2/S3）实战模拟与特效全量覆盖测试', () => {
  const limbusOps = [
    'donquixote', 'faust', 'gregor', 'heathcliff', 'honglu', 'ishmael',
    'meursault', 'outis', 'rodion', 'ryoshu', 'sinclair', 'yisang'
  ];

  const fgoServants = [
    'gareth', 'bedivere', 'tristan', 'percival', 'baobhan',
    'gawain', 'barghest', 'mash', 'lancelot', 'mordred',
    'melusine', 'artoria', 'merlin', 'castoria', 'morgan'
  ];

  const dummy = enemyRec({ key: 'enemy_dummy', hp: 1000000, speed: 0, mass: 5 });

  test('边狱公司全 12 罪人 36 技能全部实战激活、正确切换形态与结算', () => {
    for (const name of limbusOps) {
      for (let sIdx = 0; sIdx < 3; sIdx++) {
        const chessId = `chess_x_limbus_company_${name}_a`;
        const h = makeBattle({
          data: ds,
          players: [{
            playerId: 'p1', seat: 0, side: 'L', colOffset: 0,
            units: [{ chessId, row: 10, col: 4, skillIndex: sIdx }],
            bonds: {}, playerEffects: []
          }],
          enemies: [{ key: 'enemy_dummy', rec: dummy, row: 10, col: 5 }]
        });
        h.step();
        const u = h.allies().find(a => a.defId === chessId);
        assert.ok(u && u.skill, `${name} S${sIdx + 1} exists`);
        assert.ok(u.skill.id.endsWith(`_${sIdx + 1}`), `${name} S${sIdx + 1} ID matches index: ${u.skill.id}`);
        u.skill.gainSp(u.skill.spCost, 'skill');
        const activated = u.skill.activate('DEFAULT');
        assert.ok(activated, `${name} S${sIdx + 1} activated`);
        for (let f = 0; f < 30; f++) h.step();
      }
    }
  });

  test('圆桌骑士全 15 从者 45 技能全部实战激活、正确切换形态与结算', () => {
    for (const name of fgoServants) {
      for (let sIdx = 0; sIdx < 3; sIdx++) {
        const chessId = `chess_x_fgo_round_table_${name}_a`;
        const h = makeBattle({
          data: ds,
          players: [{
            playerId: 'p1', seat: 0, side: 'L', colOffset: 0,
            units: [{ chessId, row: 10, col: 4, skillIndex: sIdx }],
            bonds: {}, playerEffects: []
          }],
          enemies: [{ key: 'enemy_dummy', rec: dummy, row: 10, col: 5 }]
        });
        h.step();
        const u = h.allies().find(a => a.defId === chessId);
        assert.ok(u && u.skill, `${name} S${sIdx + 1} exists`);
        assert.ok(u.skill.id.endsWith(`_${sIdx + 1}`), `${name} S${sIdx + 1} ID matches index: ${u.skill.id}`);
        u.skill.gainSp(u.skill.spCost, 'skill');
        const activated = u.skill.activate('DEFAULT');
        assert.ok(activated, `${name} S${sIdx + 1} activated`);
        for (let f = 0; f < 30; f++) h.step();
      }
    }
  });

  test('81 个技能实战施放触发的所有 FX 特效全部显式注册在 FX_KINDS 中', () => {
    const emittedFx = new Set();
    const missing = [];
    const allOps = [
      ...limbusOps.map(n => ({ name: n, prefix: 'chess_x_limbus_company' })),
      ...fgoServants.map(n => ({ name: n, prefix: 'chess_x_fgo_round_table' }))
    ];
    for (const { name, prefix } of allOps) {
      for (let sIdx = 0; sIdx < 3; sIdx++) {
        const chessId = `${prefix}_${name}_a`;
        const h = makeBattle({
          data: ds,
          players: [{
            playerId: 'p1', seat: 0, side: 'L', colOffset: 0,
            units: [{ chessId, row: 10, col: 4, skillIndex: sIdx }],
            bonds: {}, playerEffects: []
          }],
          enemies: [{ key: 'enemy_dummy', rec: dummy, row: 10, col: 5 }]
        });
        h.step();
        const u = h.allies().find(a => a.defId === chessId);
        if (u && u.skill) {
          u.skill.gainSp(u.skill.spCost, 'skill');
          u.skill.activate('DEFAULT');
        }
        for (let f = 0; f < 30; f++) h.step();
        for (const ev of h.events.filter(e => e[0] === 'fx')) {
          emittedFx.add(ev[1]);
          if (!FX_KINDS[ev[1]]) missing.push(`${name} S${sIdx + 1}: ${ev[1]}`);
        }
      }
    }
    assert.equal(missing.length, 0, `Missing FX kinds: ${missing.join(', ')}`);
    assert.ok(emittedFx.size > 20, `Emitted at least 20 unique FX kinds (got ${emittedFx.size})`);
  });
});

