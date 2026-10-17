// test/mods/limbusCompany.test.js — Integration & unit tests for all 12 Limbus Company Sinners
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadData } from '../../server/data.js';
import { makeBattle } from '../helpers/battleHarness.js';
import { KITS } from '../../server/sim/content/index.js';
import { rotateOffset } from '../../server/sim/dir.js';
import * as assets from '../../public/js/assets.js';
import { computeBonds } from '../../server/match/bondsMeta.js';
import { GameData } from '../../server/match/gamedata.js';

const data = loadData();

const ALL_SINNER_KEYS = [
  'yisang',
  'faust',
  'donquixote',
  'ryoshu',
  'meursault',
  'honglu',
  'heathcliff',
  'ishmael',
  'rodion',
  'sinclair',
  'outis',
  'gregor'
];

test('Limbus Company Mod: data integrity & bond structure for all 12 Sinners', () => {
  assert.ok(data.bonds.limbusShip, 'limbusShip bond exists');
  assert.equal(data.bonds.limbusShip.isCore, true, 'limbusShip is a core faction bond');
  assert.deepEqual(data.bonds.limbusShip.thresholds, [3, 6]);
  
  for (const sk of ALL_SINNER_KEYS) {
    const baseId = Object.keys(data.chess).find(k => k.includes(`limbus_${sk}_a`));
    assert.ok(baseId, `Base chess found for sinner ${sk}`);
    assert.ok(data.bonds.limbusShip.members.includes(baseId), `${sk} (${baseId}) is in limbusShip members`);
  }
  assert.equal(data.bonds.limbusShip.members.length >= 12, true, 'limbusShip has at least 12 members');
});

test('Limbus Company Mod: all 12 Sinners chess configurations, skills, and constraints', () => {
  const expectedTiers = {
    yisang: 1,
    sinclair: 1,
    ishmael: 2,
    faust: 2,
    rodion: 3,
    heathcliff: 3,
    meursault: 4,
    honglu: 4,
    outis: 5,
    ryoshu: 5,
    donquixote: 6,
    gregor: 6
  };

  for (const sk of ALL_SINNER_KEYS) {
    const tier = expectedTiers[sk];
    const baseId = `chess_char_${tier}_limbus_${sk}_a`;
    const goldenId = `chess_char_${tier}_limbus_${sk}_b`;

    const base = data.chess[baseId];
    const golden = data.chess[goldenId];

    assert.ok(base, `Base ${sk} (${baseId}) exists`);
    assert.ok(golden, `Golden ${sk} (${goldenId}) exists`);
    const EXPECTED_PRICES = { 1: 2, 2: 3, 3: 3, 4: 3, 5: 4, 6: 4 };
    assert.equal(base.tier, tier, `${sk} tier is ${tier}`);
    assert.equal(base.price, EXPECTED_PRICES[tier], `${sk} price is ${EXPECTED_PRICES[tier]}`);
    assert.ok(base.name, `${sk} has name: ${base.name}`);

    // Verify 3 skills
    assert.equal(base.allSkills.length, 3, `${sk} has 3 skills`);
    for (const s of base.allSkills) {
      assert.ok(s.name, `${sk} skill has name: ${s.name}`);
      assert.ok(!s.desc.includes('[使用时]'), `${sk} skill desc has no raw [使用时]`);
      assert.ok(!s.desc.includes('[命中效果]'), `${sk} skill desc has no raw [命中效果]`);
      assert.ok(!s.desc.includes('（'), `${sk} skill desc has no fullwidth parentheses`);
      assert.ok(!s.desc.includes('('), `${sk} skill desc has no halfwidth parentheses`);
    }

    // Verify 2 talents
    assert.equal(base.talents.length, 2, `${sk} has 2 talents`);
  }
});

test('Limbus Company Mod: Authentic Art, Spine 3.8 and Voice for all 12 Sinners', () => {
  const assetsJsonPath = path.join(process.cwd(), 'data', 'assets.json');
  const manifest = JSON.parse(fs.readFileSync(assetsJsonPath, 'utf8'));

  for (const sk of ALL_SINNER_KEYS) {
    const charId = `char_limbus_${sk}`;

    // Avatar
    const avatar = assets.avatarUrl(manifest, charId);
    assert.ok(avatar, `${charId} Avatar URL exists`);
    const avatarPath = path.join(process.cwd(), 'public', avatar.replace(/^\//, ''));
    assert.ok(fs.existsSync(avatarPath), `Avatar file exists: ${avatarPath}`);

    // Portrait
    const portrait = assets.portraitUrl(manifest, charId);
    assert.ok(portrait, `${charId} Portrait URL exists`);
    const portraitPath = path.join(process.cwd(), 'public', portrait.replace(/^\//, ''));
    assert.ok(fs.existsSync(portraitPath), `Portrait file exists: ${portraitPath}`);

    // Spine Model Entry
    const spine = assets.spineEntry(manifest, charId);
    assert.ok(spine, `${charId} Spine entry resolved`);
    assert.ok(spine.skel.endsWith('.json') || spine.skel.endsWith('.skel'), `${charId} Spine skel path valid`);
    assert.ok(spine.atlas.endsWith('.atlas'), `${charId} Spine atlas path valid`);
    assert.ok(Array.isArray(spine.textures) && spine.textures.length > 0, `${charId} Spine texture list non-empty`);

    const skelFile = path.join(process.cwd(), 'public', spine.skel.replace(/^\//, ''));
    const atlasFile = path.join(process.cwd(), 'public', spine.atlas.replace(/^\//, ''));
    const texFile = path.join(process.cwd(), 'public', spine.textures[0].replace(/^\//, ''));
    assert.ok(fs.existsSync(skelFile), `${charId} Skeleton file exists`);
    assert.ok(fs.existsSync(atlasFile), `${charId} Atlas file exists`);
    assert.ok(fs.existsSync(texFile), `${charId} Texture file exists`);

    // Voice lines
    const voice = manifest.audio?.voice?.[charId];
    assert.ok(voice, `${charId} Voice configuration exists`);
    assert.ok(voice.place && voice.place[0], `${charId} Place voice exists`);
    const placeVoicePath = path.join(process.cwd(), 'public', voice.place[0].split('?')[0].replace(/^\//, ''));
    assert.ok(fs.existsSync(placeVoicePath), `${charId} Place voice WAV file exists`);
  }
});

test('Limbus Company Mod: Simulation combat with all 12 Sinners fielded', () => {
  for (const sk of ALL_SINNER_KEYS) {
    const charId = `char_limbus_${sk}`;
    assert.ok(KITS[charId], `${charId} kit is registered in KITS`);
  }

  // Place 6 Sinners on the battlefield (standard team size)
  const h = makeBattle({
    units: [
      { chessId: 'chess_char_1_limbus_yisang_a', row: 10, col: 2, dir: 'RIGHT' },
      { chessId: 'chess_char_2_limbus_faust_a', row: 11, col: 2, dir: 'RIGHT' },
      { chessId: 'chess_char_1_limbus_sinclair_a', row: 10, col: 4, dir: 'RIGHT' },
      { chessId: 'chess_char_3_limbus_rodion_a', row: 11, col: 4, dir: 'RIGHT' },
      { chessId: 'chess_char_4_limbus_honglu_a', row: 9, col: 3, dir: 'RIGHT' },
      { chessId: 'chess_char_6_limbus_gregor_a', row: 10, col: 5, dir: 'RIGHT' }
    ],
    bonds: {
      limbusShip: { count: 6, active: true, tier: 2, layers: 0 }
    }
  });

  assert.ok(h, 'Battle harness created successfully');
  h.b.start();
  const allies = h.allies();
  assert.equal(allies.length, 6, '6 Ally units placed on board');

  // Run 1 second of battle
  h.run(1);

  for (const ally of allies) {
    assert.ok(ally.hp > 0, `${ally.name} is alive after 1 second`);
  }

  // Verify sanity snapshot
  const snap = h.b.snapshot();
  assert.ok(snap.sanity, 'Snapshot includes sanity array for Limbus Sinners');
  assert.ok(Array.isArray(snap.sanity) && snap.sanity.length > 0, 'Sanity entries exist for fielded Sinners');
  for (const [id, val] of snap.sanity) {
    assert.ok(val >= -45 && val <= 45, `Sanity ${val} for unit ${id} is within [-45, 45] range`);
  }
});

test('Limbus Company Mod: 金枝共鸣 team pool charges, surfaces in snapshot, and 鸿璐 consumes it', () => {
  const h = makeBattle({
    units: [
      { chessId: 'chess_char_1_limbus_yisang_a', row: 10, col: 2, dir: 'RIGHT' },
      { chessId: 'chess_char_2_limbus_faust_a', row: 11, col: 2, dir: 'RIGHT' },
      { chessId: 'chess_char_1_limbus_sinclair_a', row: 10, col: 4, dir: 'RIGHT' },
      { chessId: 'chess_char_3_limbus_rodion_a', row: 11, col: 4, dir: 'RIGHT' },
      { chessId: 'chess_char_4_limbus_honglu_a', row: 9, col: 3, dir: 'RIGHT' },
      { chessId: 'chess_char_6_limbus_gregor_a', row: 10, col: 5, dir: 'RIGHT' }
    ],
    bonds: { limbusShip: { count: 6, active: true, tier: 2, layers: 0 } }
  });
  h.b.start();
  const allies = h.allies();

  // Resonance mirror is present from install, even at 0 → the HUD gauge is visible from the start.
  let snap0 = h.b.snapshot();
  assert.ok(snap0.resonance, 'Snapshot exposes the 金枝共鸣 team gauge for the fielded team');
  for (const [, n, cap] of snap0.resonance) {
    assert.ok(cap >= 1, '金枝共鸣 cap is a positive capacity');
    assert.ok(n >= 0 && n <= cap, `金枝共鸣 reading ${n} within [0, ${cap}]`);
  }

  // Push every sinner's 精神 to the +45 extreme: each one crossing INTO full charges the shared pool.
  for (const a of allies) if (a.mem) a.mem.limbusSanity = 45;
  h.run(0.5);
  const snapHot = h.b.snapshot();
  const peak = snapHot.resonance.reduce((m, [, n]) => Math.max(m, n), 0);
  assert.ok(peak > 0, '金枝共鸣 charges above 0 once the team hits the sanity extreme');
  // The shared pool is team-wide: every member reports the same reading.
  const readings = new Set(snapHot.resonance.map(([, n]) => n));
  assert.equal(readings.size, 1, '金枝共鸣 is a single shared value across the whole team');

  // 鸿璐 is the amplifier main-hand: her spend drains the whole pool back to 0.
  const st = h.b._limbusRes[allies[0].ownerId];
  assert.ok(st && typeof st.spendAll === 'function', '鸿璐 has a spendAll hook on the team pool');
  const spent = st.spendAll();
  assert.ok(spent > 0, `鸿璐 consumed ${spent} 金枝共鸣`);
  const snapSpent = h.b.snapshot();
  for (const [, n] of snapSpent.resonance) {
    assert.equal(n, 0, '金枝共鸣 is drained to 0 after 鸿璐 consumes it');
  }
});

test('Limbus Company Mod: Equipment (金枝, LCB员工证) data integrity, tier/price, and strict zero parentheses constraint', () => {
  const itemData = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'items.json'), 'utf8'));
  const targetItemKeys = [
    'chess_item_2_limbus_lcb_a',
    'chess_item_2_limbus_lcb_b',
    'chess_item_6_limbus_bough_a',
    'chess_item_6_limbus_bough_b'
  ];

  for (const k of targetItemKeys) {
    const it = itemData[k];
    assert.ok(it, `Item ${k} exists in data/items.json`);
    assert.ok(it.name, `${k} has name`);
    assert.ok(it.desc, `${k} has desc`);
    assert.ok(it.descRaw, `${k} has descRaw`);
    assert.ok(it.flavor, `${k} has flavor`);

    // Strict constraint: 禁止出现（）加上解释性话语的描述 (zero parentheses in user-facing texts)
    assert.ok(!it.name.includes('（'), `${k} name has no fullwidth parentheses`);
    assert.ok(!it.name.includes('）'), `${k} name has no fullwidth parentheses`);
    assert.ok(!it.name.includes('('), `${k} name has no halfwidth parentheses`);
    assert.ok(!it.name.includes(')'), `${k} name has no halfwidth parentheses`);

    assert.ok(!it.desc.includes('（'), `${k} desc has no fullwidth parentheses`);
    assert.ok(!it.desc.includes('）'), `${k} desc has no fullwidth parentheses`);
    assert.ok(!it.desc.includes('('), `${k} desc has no halfwidth parentheses`);
    assert.ok(!it.desc.includes(')'), `${k} desc has no halfwidth parentheses`);

    assert.ok(!it.descRaw.includes('（'), `${k} descRaw has no fullwidth parentheses`);
    assert.ok(!it.descRaw.includes('）'), `${k} descRaw has no fullwidth parentheses`);
    assert.ok(!it.descRaw.includes('('), `${k} descRaw has no halfwidth parentheses`);
    assert.ok(!it.descRaw.includes(')'), `${k} descRaw has no halfwidth parentheses`);

    assert.ok(!it.flavor.includes('（'), `${k} flavor has no fullwidth parentheses`);
    assert.ok(!it.flavor.includes('）'), `${k} flavor has no fullwidth parentheses`);
    assert.ok(!it.flavor.includes('('), `${k} flavor has no halfwidth parentheses`);
    assert.ok(!it.flavor.includes(')'), `${k} flavor has no halfwidth parentheses`);
  }

  // Tier and price verification
  const lcbA = itemData['chess_item_2_limbus_lcb_a'];
  assert.equal(lcbA.tier, 2, 'LCB员工证 is Tier 2');
  assert.equal(lcbA.price, 2, 'LCB员工证 price is 2');
  assert.equal(lcbA.giveBondId, 'limbusShip', 'LCB员工证 has giveBondId limbusShip');
  assert.equal(lcbA.canGiveBond, false, 'LCB员工证 canGiveBond is false (pairs with 变形同构体)');

  const boughA = itemData['chess_item_6_limbus_bough_a'];
  assert.equal(boughA.tier, 6, '金枝 is Tier 6');
  assert.equal(boughA.price, 4, '金枝 price is 4');
  assert.equal(boughA.requiresBondId, 'limbusShip', '金枝 requires limbusShip bond');
});

test('Limbus Company Mod: LCB员工证 + 变形同构体 grants wearer limbusShip covenant tag', () => {
  const gd = new GameData(data);
  // Kroos (chess_char_1_01_a) equipped with LCB employee card + morph ball (chess_item_6_09_e_a)
  const ps = {
    hand: [],
    board: new Map([
      ['0,0', {
        kind: 'chess',
        id: 'chess_char_1_01_a',
        items: [
          { id: 'chess_item_2_limbus_lcb_a' },
          { id: 'chess_item_6_09_e_a' }
        ]
      }]
    ])
  };
  const bonds = computeBonds(gd, ps);
  assert.ok(bonds.limbusShip, 'limbusShip covenant is present when LCB card is paired with 变形同构体');
  assert.equal(bonds.limbusShip.count, 1, 'Wearer successfully contributes to limbusShip covenant count');
});

test('Limbus Company Mod: 金枝 & LCB员工证 battle synergy (Sanity boost, resonance cap +5, initial resonance)', () => {
  const h = makeBattle({
    units: [
      {
        chessId: 'chess_char_1_limbus_yisang_a',
        row: 10,
        col: 2,
        dir: 'RIGHT',
        items: ['chess_item_6_limbus_bough_a', 'chess_item_2_limbus_lcb_a']
      },
      { chessId: 'chess_char_2_limbus_faust_a', row: 11, col: 2, dir: 'RIGHT' },
      { chessId: 'chess_char_1_limbus_sinclair_a', row: 10, col: 4, dir: 'RIGHT' }
    ],
    bonds: { limbusShip: { count: 3, active: true, tier: 1, layers: 0 } }
  });
  h.b.start();

  // 1. Initial Sanity boost (+20 from 金枝)
  const yisang = h.allies().find((a) => a.def?.charId?.includes('yisang'));
  assert.ok(yisang, 'Yi Sang is fielded');
  assert.equal(yisang.mem.limbusSanity, 20, 'Yi Sang receives +20 initial Sanity from 金枝');

  // 2. Combo synergy: resonance cap +5 (15 -> 20) and initial resonance = 3
  const snap = h.b.snapshot();
  assert.ok(snap.resonance, 'Resonance snapshot exists');
  for (const [, n, cap] of snap.resonance) {
    assert.equal(cap, 20, 'Team resonance cap increased by 5 (15 -> 20) from LCB + 金枝 combo');
    assert.equal(n, 3, 'Team starts with 3 initial resonance from LCB + 金枝 combo');
  }
});

