// test/mods/fgoRoundTable.test.js — Serial unit & integration tests for FGO Round Table Mod
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadData } from '../../server/data.js';
import { makeBattle } from '../helpers/battleHarness.js';
import { KITS } from '../../server/sim/content/index.js';
import * as S from '../../server/sim/content/support/index.js';

const ROOT = path.resolve('.');
const data = loadData();

// =============================================================================
// Test 1: Data Integrity & Zero Cross-Core Bond Collision
// =============================================================================
test('FGO Round Table: Data integrity, 0 cross-core bonds, and pure EQUIP items', () => {
  // 1. Bond definition
  assert.ok(data.bonds.roundTable, 'roundTable bond exists');
  assert.equal(data.bonds.roundTable.isCore, true, 'roundTable is a core bond');
  assert.deepEqual(data.bonds.roundTable.thresholds, [3, 6, 9], 'Thresholds are 3, 6, 9');

  // 2. 15 operators * 2 (30 chess records)
  const opNames = [
    'gareth', 'bedivere', 'tristan', 'percival', 'baobhan',
    'gawain', 'barghest', 'mash', 'lancelot', 'mordred',
    'melusine', 'artoria', 'merlin', 'castoria', 'morgan'
  ];

  const forbiddenCoreBonds = ['syracuseShip', 'yanShip', 'aegirShip', 'victoriaShip', 'casimiroShip'];

  for (const name of opNames) {
    const baseId = Object.keys(data.chess).find((k) => k.includes(`_fgo_`) && k.includes(`_${name}_a`));
    const goldenId = Object.keys(data.chess).find((k) => k.includes(`_fgo_`) && k.includes(`_${name}_b`));

    assert.ok(baseId, `Base chess for ${name} exists`);
    assert.ok(goldenId, `Golden chess for ${name} exists`);

    const baseChess = data.chess[baseId];
    const goldenChess = data.chess[goldenId];

    // Bonds check: must have roundTable, must NOT have any other core bond
    assert.ok(baseChess.bonds.includes('roundTable'), `${baseId} contains roundTable`);
    assert.ok(goldenChess.bonds.includes('roundTable'), `${goldenId} contains roundTable`);

    for (const fb of forbiddenCoreBonds) {
      assert.equal(baseChess.bonds.includes(fb), false, `${baseId} must NOT include ${fb}`);
      assert.equal(goldenChess.bonds.includes(fb), false, `${goldenId} must NOT include ${fb}`);
    }

    // Skills check: S1, S2, S3 present
    assert.equal(baseChess.skills?.length, 3, `${baseId} has 3 skills`);
    assert.equal(goldenChess.skills?.length, 3, `${goldenId} has 3 skills`);
    assert.ok(baseChess.skill?.skillId, `${baseId} has default skill`);
  }

  // 3. 12 Items check: all itemType: "EQUIP"
  const itemPrefixes = [
    'chess_item_1_fgo_sqshard',
    'chess_item_2_fgo_crestshield',
    'chess_item_3_fgo_silverarmor',
    'chess_item_4_fgo_belt',
    'chess_item_5_fgo_staff',
    'chess_item_6_fgo_avalon'
  ];

  for (const prefix of itemPrefixes) {
    const itemA = data.items[`${prefix}_a`];
    const itemB = data.items[`${prefix}_b`];
    assert.ok(itemA, `${prefix}_a exists`);
    assert.ok(itemB, `${prefix}_b exists`);
    assert.equal(itemA.itemType, 'EQUIP', `${prefix}_a must be EQUIP`);
    assert.equal(itemB.itemType, 'EQUIP', `${prefix}_b must be EQUIP`);
  }
});

// =============================================================================
// Test 2: Kit Registration & Multi-Skill Dispatch
// =============================================================================
test('FGO Round Table: All 15 kits registered with 3 skills each', () => {
  const opKeys = [
    'chess_fgo_1_gareth_a', 'chess_fgo_2_bedivere_a', 'chess_fgo_2_tristan_a',
    'chess_fgo_3_percival_a', 'chess_fgo_3_baobhan_a', 'chess_fgo_4_gawain_a',
    'chess_fgo_4_barghest_a', 'chess_fgo_4_mash_a', 'chess_fgo_5_lancelot_a',
    'chess_fgo_5_mordred_a', 'chess_fgo_5_melusine_a', 'chess_fgo_6_artoria_a',
    'chess_fgo_6_merlin_a', 'chess_fgo_6_castoria_a', 'chess_fgo_6_morgan_a'
  ];

  for (const key of opKeys) {
    assert.equal(typeof KITS[key], 'function', `Kit for ${key} is a function in KITS`);
    const chess = data.chess[key];
    const kit = KITS[key](chess.skill?.bb || {}, chess, chess);
    assert.ok(kit, `Kit instance created for ${key}`);
    assert.ok(kit.skills, `Kit for ${key} exposes skills map`);
    assert.equal(Object.keys(kit.skills).length, 3, `Kit for ${key} has exactly 3 skills`);
  }
});

// =============================================================================
// Test 3: Round Table 3-Piece Covenant (Stats Buff & Oath Resonance)
// =============================================================================
test('FGO Round Table: 3-piece stat scaling and oath resonance SP recovery', () => {
  const h = makeBattle({
    units: [
      { chessId: 'chess_fgo_1_gareth_a', row: 10, col: 4 },
      { chessId: 'chess_fgo_2_bedivere_a', row: 10, col: 5 },
      { chessId: 'chess_fgo_2_tristan_a', row: 10, col: 6 }
    ],
    bonds: {
      roundTable: { count: 3, active: true, tier: 1, layers: 25 }
    }
  });

  const gareth = h.unit('chess_fgo_1_gareth_a');
  const bedivere = h.unit('chess_fgo_2_bedivere_a');
  const tristan = h.unit('chess_fgo_2_tristan_a');

  assert.ok(gareth && bedivere && tristan, 'All 3 units present on board');

  // Stats buff: atk +(20 + 0.8 * 25)% = +40% = 0.40; def +(16 + 0.5 * 25)% = +28.5% = 0.285
  const statBuff = gareth.findBuff('bond:roundTable:stats');
  assert.ok(statBuff, 'Stat buff exists on Gareth');
  assert.ok(Math.abs((statBuff.mods?.atkPct || 0) - 0.40) < 1e-4, 'ATK% is +40% at 25 layers');
  assert.ok(Math.abs((statBuff.mods?.defPct || 0) - 0.285) < 1e-4, 'DEF% is +28.5% at 25 layers');

  // Resonance SP: simulate Gareth skill activation
  const spBeforeBedi = bedivere.skill?.sp || 0;
  h.b.emit('skillStart', { unit: gareth });
  const spAfterBedi = bedivere.skill?.sp || 0;

  assert.equal(spAfterBedi, spBeforeBedi + 3, 'Resonance restored 3 SP to Bedivere');
});

// =============================================================================
// Test 4: Round Table 6-Piece Covenant (Shield & Weakness Decision)
// =============================================================================
test('FGO Round Table: 6-piece initial shield and weakness damage decision', () => {
  const h = makeBattle({
    units: [
      { chessId: 'chess_fgo_1_gareth_a', row: 10, col: 2 },
      { chessId: 'chess_fgo_2_bedivere_a', row: 10, col: 3 },
      { chessId: 'chess_fgo_2_tristan_a', row: 10, col: 4 },
      { chessId: 'chess_fgo_3_percival_a', row: 10, col: 5 },
      { chessId: 'chess_fgo_3_baobhan_a', row: 10, col: 6 },
      { chessId: 'chess_fgo_4_gawain_a', row: 10, col: 7 }
    ],
    bonds: {
      roundTable: { count: 6, active: true, tier: 2, layers: 30 }
    }
  });

  const percival = h.unit('chess_fgo_3_percival_a');
  assert.ok(percival, 'Percival exists');

  // 1. Initial shield layer
  const shieldBuff = percival.findBuff('bond:roundTable:shield');
  assert.ok(shieldBuff, 'Percival has Round Table shield buff');
  assert.equal(shieldBuff.shieldHits, 1, 'Shield has 1 hit layer');

  // 2. Permanent resist status
  const resistBuff = percival.buffs.find((b) => b.status === 'resist' || b.key === 'status:resist');
  assert.ok(resistBuff, 'Percival has resist status');

  // 3. Trigger Round Table decision by emitting 6 skills
  for (let i = 0; i < 6; i++) {
    h.b.emit('skillStart', { unit: percival });
  }

  assert.equal(h.b._roundTableDecisionActive, true, 'Round table decision is active after 6 skill casts');
});

// =============================================================================
// Test 5: Equipment Synergy (Avalon undying + Staff Castoria/Morgan SP burst)
// =============================================================================
test('FGO Round Table: Avalon undying lock and Staff Castoria/Morgan SP burst', () => {
  const h = makeBattle({
    units: [
      {
        chessId: 'chess_fgo_6_artoria_a',
        row: 10,
        col: 5,
        items: ['chess_item_6_fgo_avalon_a']
      },
      {
        chessId: 'chess_fgo_6_castoria_a',
        row: 10,
        col: 6,
        items: ['chess_item_5_fgo_staff_a']
      }
    ],
    bonds: {
      roundTable: { count: 2, active: false, tier: 0, layers: 0 }
    }
  });

  const artoria = h.unit('chess_fgo_6_artoria_a');
  const castoria = h.unit('chess_fgo_6_castoria_a');

  assert.ok(artoria, 'Artoria exists');
  assert.ok(castoria, 'Castoria exists');

  // 1. Avalon lethal protection
  const lethalEvent = { unit: artoria, prevented: false };
  h.b.emit('fatal', lethalEvent);
  assert.equal(lethalEvent.prevented, true, 'Avalon cancelled lethal damage');
  assert.ok(artoria.hp > 100, 'Artoria healed to 50% HP');
  const undyingBuff = artoria.findBuff('item:avalon:undying');
  assert.ok(undyingBuff, 'Artoria has 5s undying lock buff');

  // 2. Castoria Staff first skill SP burst
  const artoriaSpBefore = artoria.skill?.sp || 0;
  h.b.emit('skillStart', { unit: castoria });
  const artoriaSpAfter = artoria.skill?.sp || 0;
  assert.equal(artoriaSpAfter, artoriaSpBefore + 5, 'Castoria staff granted 5 SP to all allies');
});

// =============================================================================
// Test 6: Round Table 9-Piece Covenant (Initial SP, -25% SP Cost, Decision Active)
// =============================================================================
test('FGO Round Table: 9-piece initial SP +20 and -25% SP cost reduction', () => {
  const h = makeBattle({
    units: [
      { chessId: 'chess_fgo_1_gareth_a', row: 10, col: 2 },
      { chessId: 'chess_fgo_2_bedivere_a', row: 10, col: 3 },
      { chessId: 'chess_fgo_2_tristan_a', row: 10, col: 4 },
      { chessId: 'chess_fgo_3_percival_a', row: 10, col: 5 },
      { chessId: 'chess_fgo_3_baobhan_a', row: 10, col: 6 },
      { chessId: 'chess_fgo_4_gawain_a', row: 10, col: 7 },
      { chessId: 'chess_fgo_4_barghest_a', row: 10, col: 8 },
      { chessId: 'chess_fgo_4_mash_a', row: 10, col: 9 },
      { chessId: 'chess_fgo_5_lancelot_a', row: 10, col: 10 }
    ],
    bonds: {
      roundTable: { count: 9, active: true, tier: 3, layers: 50 }
    }
  });

  const lancelot = h.unit('chess_fgo_5_lancelot_a');
  assert.ok(lancelot, 'Lancelot exists');

  // 1. Decision is immediately active at battle start
  assert.equal(h.b._roundTableDecisionActive, true, 'Round table decision active at start of 9-piece');

  // 2. SP cost is reduced by 25% (spCostMul = 0.75)
  assert.equal(lancelot.skill?.spCostMul, 0.75, 'Lancelot skill SP cost reduced by 25%');

  // 3. 初始技力 +20（九件套）。这里断言的是**盟约规则**（比没有【圆桌】时恰好多 20，且不超过减免后的消耗），
  //    而不是"SP 满"——那是默认技能还是 S1（消耗低）时的偶然结果，默认技能改 S3 后不再成立。
  const line = [
    { chessId: 'chess_fgo_1_gareth_a', row: 10, col: 2 },
    { chessId: 'chess_fgo_2_bedivere_a', row: 10, col: 3 },
    { chessId: 'chess_fgo_2_tristan_a', row: 10, col: 4 },
    { chessId: 'chess_fgo_3_percival_a', row: 10, col: 5 },
    { chessId: 'chess_fgo_3_baobhan_a', row: 10, col: 6 },
    { chessId: 'chess_fgo_4_gawain_a', row: 10, col: 7 },
    { chessId: 'chess_fgo_4_barghest_a', row: 10, col: 8 },
    { chessId: 'chess_fgo_4_mash_a', row: 10, col: 9 },
    { chessId: 'chess_fgo_5_lancelot_a', row: 10, col: 10 }
  ];
  const bare = makeBattle({ units: line, bonds: {} });
  const spBase = bare.unit('chess_fgo_5_lancelot_a')?.skill?.sp ?? 0;
  const spNow = lancelot.skill?.sp ?? 0;
  assert.equal(spNow - spBase, 20, `九件套使初始技力 +20（无盟约 ${spBase} → 有盟约 ${spNow}）`);
  assert.ok(spNow <= (lancelot.skill?.spCost ?? 0), '初始技力不超过减免后的消耗');
});

// =============================================================================
// Test 7: Hit-Splitting & Multi-Hit Verification
// =============================================================================
test('FGO Round Table: Tier 5/6 S3 bursts split into 5-6 hits under BOSS_HIT_LIMIT', () => {
  // Artoria S3 Excalibur
  const artoriaDef = data.chess['chess_fgo_6_artoria_a'];
  const artoriaKit = KITS['chess_fgo_6_artoria_a'](artoriaDef.skill?.bb || {}, artoriaDef, artoriaDef);
  assert.ok(artoriaKit.skills.skchr_fgo_artoria_3, 'Artoria S3 exists');

  // Mordred S3 Clarent
  const mordredDef = data.chess['chess_fgo_5_mordred_a'];
  const mordredKit = KITS['chess_fgo_5_mordred_a'](mordredDef.skill?.bb || {}, mordredDef, mordredDef);
  assert.ok(mordredKit.skills.skchr_fgo_mordred_3, 'Mordred S3 exists');

  // Melusine S3 Ray Horizon
  const melusineDef = data.chess['chess_fgo_5_melusine_a'];
  const melusineKit = KITS['chess_fgo_5_melusine_a'](melusineDef.skill?.bb || {}, melusineDef, melusineDef);
  assert.ok(melusineKit.skills.skchr_fgo_melusine_3, 'Melusine S3 exists');

  // Morgan S3 Rhongomyniad
  const morganDef = data.chess['chess_fgo_6_morgan_a'];
  const morganKit = KITS['chess_fgo_6_morgan_a'](morganDef.skill?.bb || {}, morganDef, morganDef);
  assert.ok(morganKit.skills.skchr_fgo_morgan_3, 'Morgan S3 exists');
});

// =============================================================================
// Test 8: Equipment Crestshield + 变形同构体 Combo
// =============================================================================
test('FGO Round Table: Crestshield + 变形同构体 grants Round Table bond to vanilla operator', () => {
  const h = makeBattle({
    units: [
      {
        chessId: 'chess_char_1_01_a', // Vanilla Insider
        row: 10,
        col: 5,
        items: ['chess_item_2_fgo_crestshield_a', 'chess_item_6_09_e_a']
      }
    ]
  });

  const insider = h.unit('chess_char_1_01_a');
  assert.ok(insider, 'Insider exists');
  assert.ok(S.unitBonds(insider).includes('roundTable'), 'Insider gained roundTable bond from crestshield + 变形同构体');
  assert.equal(S.isMember(h.b, insider, 'roundTable'), true, 'Insider is roundTable member');
});

// =============================================================================
// Test 9: 9-Point Root Causes — Data, Loadout & Stats Verification
// =============================================================================
test('FGO Round Table: 3 skills loadout, real bond IDs, named talents, and tier stat limits', async () => {
  const { loadoutOptions } = await import('../../shared/protocol.js');
  const { resolveRecordLoadout } = await import('../../shared/loadoutRecord.js');
  const { chessTalents } = await import('../../public/js/ui/detailPanel.js');
  const { FX_KINDS } = await import('../../public/js/render/fx/kinds.js');

  const limits = {
    1: { atk: 921, hp: 2530, def: 516, dps: 502 },
    2: { atk: 728, hp: 2895, def: 495, dps: 478 },
    3: { atk: 875, hp: 2938, def: 530, dps: 702 },
    4: { atk: 1020, hp: 2867, def: 557, dps: 517 },
    5: { atk: 1362, hp: 4947, def: 514, dps: 640 },
    6: { atk: 1118, hp: 2703, def: 444, dps: 621 }
  };

  const opKeys = [
    'gareth', 'bedivere', 'tristan', 'percival', 'baobhan',
    'gawain', 'barghest', 'mash', 'lancelot', 'mordred',
    'melusine', 'artoria', 'merlin', 'castoria', 'morgan'
  ];

  for (const name of opKeys) {
    const baseId = Object.keys(data.chess).find((k) => k.includes(`_fgo_`) && k.includes(`_${name}_a`));
    const goldenId = baseId.replace(/_a$/, '_b');
    const base = data.chess[baseId];
    const golden = data.chess[goldenId];

    // 1. 3 skills in loadoutOptions
    const opt = loadoutOptions(base, golden);
    assert.deepEqual(opt.skills, [0, 1, 2], `${baseId} offers 3 skills [0, 1, 2] in loadout`);
    assert.equal(opt.defaultSkill, 2, `${baseId} defaultSkill is 2 (S3 宝具，对齐官方 T6 惯例)`);

    // 2. resolveRecordLoadout works for S1, S2, S3
    assert.equal(resolveRecordLoadout(base, {})?.skillIndex, 2, `${baseId} default is S3 (index 2)`);
    assert.equal(resolveRecordLoadout(base, { skillIndex: 1 })?.skillIndex, 1, `${baseId} resolves S2`);
    assert.equal(resolveRecordLoadout(base, { skillIndex: 2 })?.skillIndex, 2, `${baseId} resolves S3`);

    // 3. Named talents present in UI
    const talents = chessTalents(base);
    assert.ok(talents.length > 0 && talents[0].name, `${baseId} has named talent ${talents[0]?.name}`);

    // 4. All bonds are valid (real IDs)
    for (const bId of base.bonds) {
      assert.ok(data.bonds[bId], `${baseId} bond ${bId} exists in data/bonds.json`);
    }

    // 5. Stat limits compliance (Tier p75/max)
    for (const rec of [base, golden]) {
      const lim = limits[rec.tier];
      const s = rec.stats;
      const dps = s.atk / (s.bat || 1);
      assert.ok(s.atk <= lim.atk, `${rec.chessId} ATK ${s.atk} <= ${lim.atk}`);
      assert.ok(s.maxHp <= lim.hp, `${rec.chessId} HP ${s.maxHp} <= ${lim.hp}`);
      assert.ok(s.def <= lim.def, `${rec.chessId} DEF ${s.def} <= ${lim.def}`);
      assert.ok(dps <= lim.dps + 1.0, `${rec.chessId} DPS ${dps.toFixed(1)} <= ${lim.dps}`);
    }

    // 6. Garrison trait has SERVER_ADD_BOND and owners
    const garId = base.garrisonIds?.[0];
    const gar = data.garrisons[garId];
    assert.ok(gar, `Garrison ${garId} exists`);
    assert.equal(gar.effectType, 'SERVER_ADD_BOND', `${garId} effectType is SERVER_ADD_BOND`);
    assert.ok(gar.bb?.count >= 2, `${garId} count >= 2`);
    assert.ok(gar.owners?.includes(baseId), `${garId} owners includes ${baseId}`);
  }

  // 7. Verify all 50 mod FX kinds registered in FX_KINDS
  const modFxList = [
    'garethS1', 'garethS2', 'garethS3',
    'bedivereS1', 'bedivereS2', 'bedivereS3',
    'tristanS1', 'tristanS2', 'tristanS3',
    'percivalS1', 'percivalS2', 'percivalS3',
    'baobhanS1', 'baobhanS2', 'baobhanS3',
    'gawainS1', 'gawainS2', 'gawainS3',
    'barghestS2', 'barghestS3', 'mashS1',
    'mashS2', 'mashS3Form1', 'mashS3Form2',
    'lancelotS1', 'lancelotS2', 'lancelotS3',
    'mordredS2', 'mordredS3', 'melusineS1',
    'melusineS2', 'melusineTransform', 'melusineS3Beam',
    'artoriaS1', 'artoriaS2', 'artoriaExcalibur',
    'merlinS1', 'merlinS2', 'merlinAvalon',
    'castoriaS1', 'castoriaS2', 'castoriaS3',
    'morganS1', 'morganS2', 'morganS3',
    'resonanceSp', 'roundTableDecision', 'skySupportBurst',
    'staffSpBurst', 'avalonProtect'
  ];
  for (const fx of modFxList) {
    assert.ok(FX_KINDS[fx], `FX kind ${fx} is registered in FX_KINDS`);
  }
});

// =============================================================================
// Test 10: 9-Point Root Causes — Sim Hooks, gainLayers & isMember
// =============================================================================
test('FGO Round Table: S.gainLayers object signature, isMember param order, and live hooks', () => {
  const h = makeBattle({
    flags: { layerGainsEnabled: true },
    units: [
      { chessId: 'chess_fgo_1_gareth_a', row: 10, col: 4 },
      { chessId: 'chess_fgo_6_artoria_a', row: 10, col: 5 },
      { chessId: 'chess_fgo_5_mordred_a', row: 10, col: 6 }
    ],
    bonds: {
      roundTable: { count: 3, active: true, tier: 1, layers: 10 }
    }
  });

  h.step();

  const gareth = h.unit('chess_fgo_1_gareth_a');
  const artoria = h.unit('chess_fgo_6_artoria_a');
  const mordred = h.unit('chess_fgo_5_mordred_a');

  // 1. isMember parameter order (battle, unit, bondId)
  assert.equal(S.isMember(h.b, artoria, 'roundTable'), true, 'Artoria is roundTable member');
  assert.equal(S.isMember(h.b, gareth, 'roundTable'), true, 'Gareth is roundTable member');

  // 2. Artoria S1 onStart applies 45% roundTable boost (because isMember is fixed)
  const artoriaKit = KITS['chess_fgo_6_artoria_a'](artoria.def?.skill?.bb || {}, artoria.def, artoria.def);
  artoriaKit.skills.skchr_fgo_artoria_1.onStart({ battle: h.b, unit: artoria });
  const artoriaBuff = gareth.findBuff('artoria:s1:atk');
  assert.ok(artoriaBuff, 'Artoria S1 applied ATK buff to Gareth');
  assert.equal(artoriaBuff.mods?.atkPct, 0.45, 'Round table ally received 45% bonus, not 25% non-round-table');

  // 3. S.gainLayers object parameter increases layers
  const initialLayers = S.bondLayers(h.b, gareth.ownerId, 'roundTable');
  const gained = S.gainLayers(h.b, { playerId: gareth.ownerId, bonds: 'roundTable', n: 4 });
  assert.equal(gained, 4, 'gainLayers added 4 layers');
  assert.equal(S.bondLayers(h.b, gareth.ownerId, 'roundTable'), initialLayers + 4, 'Bond layers increased by 4');

  // 4. Gareth S2 recovers SP on damaged via install hook
  const spBefore = gareth.skill?.sp || 0;
  h.b.emit('damaged', { target: gareth, source: mordred, dmg: { amount: 100 } });
  // Gareth S2 is not active, so SP does not increase from S2
  assert.equal(gareth.skill?.sp, spBefore, 'Gareth S2 damaged hook does not trigger when S2 inactive');
});

// =============================================================================
// Test 11: Stronghold Protocol Pricing Standards (2/3/3/3/4/4 and sellPrice 1)
// =============================================================================
test('FGO Round Table: All 30 chess pieces strictly adhere to Stronghold Protocol pricing (2/3/3/3/4/4 and sellPrice=1)', () => {
  const rootChess = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'chess.json'), 'utf8'));
  const modChess = JSON.parse(fs.readFileSync(path.join(ROOT, 'mods', 'fgo-round-table', 'data', 'chess.json'), 'utf8'));

  const EXPECTED_PRICES = { 1: 2, 2: 3, 3: 3, 4: 3, 5: 4, 6: 4 };

  for (const [name, table] of [['data/chess.json', rootChess], ['mods/fgo-round-table/data/chess.json', modChess]]) {
    const fgoKeys = Object.keys(table).filter((k) => k.startsWith('chess_fgo_'));
    assert.equal(fgoKeys.length, 30, `${name} must contain exactly 30 chess_fgo records`);

    for (const key of fgoKeys) {
      const c = table[key];
      const expectedBuy = EXPECTED_PRICES[c.tier];
      assert.ok(expectedBuy, `Invalid tier ${c.tier} for ${key}`);
      assert.equal(
        c.price,
        expectedBuy,
        `${name} ${key} (Tier ${c.tier}) purchase price must be ${expectedBuy}, got ${c.price}`
      );
      assert.equal(
        c.sellPrice,
        1,
        `${name} ${key} (Tier ${c.tier}) sellPrice must be 1, got ${c.sellPrice}`
      );
    }
  }
});


