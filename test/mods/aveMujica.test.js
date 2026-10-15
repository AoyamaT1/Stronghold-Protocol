// test/mods/aveMujica.test.js — Integration & unit tests for Ave Mujica mod
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../../server/data.js';
import { makeBattle } from '../helpers/battleHarness.js';
import { KITS } from '../../server/sim/content/index.js';
import { loadoutOptions, checkLoadout } from '../../shared/protocol.js';
import { feverState, feverValue, feverActive, FEVER_TRIGGER } from '../../server/sim/content/mods/aveMujica/fever.js';
import { fireNote } from '../../server/sim/content/mods/aveMujica/notes.js';

const data = loadData();

const fiveUnits = (extra = {}) => ({
  units: [
    { chessId: 'chess_char_2_20_a', row: 10, col: 4 },
    { chessId: 'chess_char_3_22_a', row: 10, col: 5 },
    { chessId: 'chess_char_4_27_a', row: 10, col: 6 },
    { chessId: 'chess_char_5_24_a', row: 10, col: 7 },
    { chessId: 'chess_char_6_21_a', row: 10, col: 8 },
  ],
  bonds: {
    aveMujicaShip: { count: 5, active: true, tier: 2, layers: 20 },
    indomShip: { count: 1, active: true, tier: 1, layers: 0 }
  },
  ...extra
});

test('Ave Mujica Mod: data integrity, skills, and modules', () => {
  assert.ok(data.bonds.aveMujicaShip, 'aveMujicaShip bond exists');
  assert.equal(data.bonds.aveMujicaShip.isCore, true, 'isCore is true');
  assert.deepEqual(data.bonds.aveMujicaShip.thresholds, [3, 5]);

  const members = [
    { base: 'chess_char_2_20_a', golden: 'chess_char_2_20_b', expectedSkills: 2, modId: 'uniequip_002_amoris' },
    { base: 'chess_char_3_22_a', golden: 'chess_char_3_22_b', expectedSkills: 2, modId: 'uniequip_002_tmoris' },
    { base: 'chess_char_4_27_a', golden: 'chess_char_4_27_b', expectedSkills: 2, modId: 'uniequip_002_mortis' },
    { base: 'chess_char_5_24_a', golden: 'chess_char_5_24_b', expectedSkills: 2, modId: 'uniequip_002_dolris' },
    { base: 'chess_char_6_21_a', golden: 'chess_char_6_21_b', expectedSkills: 3, modId: 'uniequip_002_oblvns' }
  ];

  for (const m of members) {
    const b = data.chess[m.base];
    const g = data.chess[m.golden];

    assert.ok(b, `Base chess ${m.base} exists`);
    assert.ok(g, `Golden chess ${m.golden} exists`);

    // Verify all skills are present
    assert.equal(b.skills?.length, m.expectedSkills, `${m.base} has ${m.expectedSkills} skills`);
    assert.equal(g.skills?.length, m.expectedSkills, `${m.golden} has ${m.expectedSkills} skills`);
    assert.ok(b.skill?.skillId, `${m.base} has valid default skill`);
    assert.ok(g.skill?.skillId, `${m.golden} has valid default skill`);

    // Verify module is present
    assert.ok(b.module, `${m.base} has module object`);
    assert.equal(b.module.id, m.modId, `${m.base} module id is ${m.modId}`);
    assert.equal(b.module.active, false, `${m.base} module is inactive at level 0`);

    assert.ok(g.module, `${m.golden} has module object`);
    assert.equal(g.module.id, m.modId, `${m.golden} module id is ${m.modId}`);
    assert.equal(g.module.active, true, `${m.golden} module is active at elite level`);

    assert.ok(Array.isArray(g.modules), `${m.golden} has modules array`);
    assert.equal(g.modules[0]?.uniEquipId, m.modId, `${m.golden} modules[0] is ${m.modId}`);
    assert.ok(g.modules[0]?.attr, `${m.golden} module has attributes`);
    assert.ok(g.statsBase, `${m.golden} has statsBase`);

    // Verify loadout options
    const opts = loadoutOptions(b, g);
    assert.equal(opts.skills.length, m.expectedSkills, `Loadout skills count matches for ${m.base}`);
    assert.ok(opts.modules.includes(m.modId), `Module ${m.modId} is in selectable modules for ${m.base}`);
    assert.ok(opts.modules.includes('none'), `'none' is in selectable modules for ${m.base}`);

    // Verify checkLoadout
    const chk = checkLoadout({ [m.base]: { skill: 1, module: m.modId } }, (id) => data.chess[id]);
    assert.equal(chk.ok, true, `Loadout selection is valid for ${m.base}`);

    // Verify garrisons
    for (const gid of b.garrisonIds) {
      assert.ok(data.garrisons[gid], `Garrison ${gid} exists`);
    }
  }

  // Check skins
  const charIds = ['char_4182_oblvns', 'char_4183_mortis', 'char_4184_dolris', 'char_4185_amoris', 'char_4186_tmoris'];
  for (const cid of charIds) {
    assert.ok(data.skins.chars[cid]?.length > 0, `Skin exists for ${cid}`);
  }
});

test('Ave Mujica Mod: kits registered', () => {
  assert.equal(typeof KITS.chess_char_2_20_a, 'function');
  assert.equal(typeof KITS.chess_char_3_22_a, 'function');
  assert.equal(typeof KITS.chess_char_4_27_a, 'function');
  assert.equal(typeof KITS.chess_char_5_24_a, 'function');
  assert.equal(typeof KITS.chess_char_6_21_a, 'function');
});

test('Ave Mujica Mod: 3-piece damage scaling and 5-piece SP reduction', () => {
  const h = makeBattle(fiveUnits());

  const amoris = h.unit('chess_char_2_20_a');
  const oblvns = h.unit('chess_char_6_21_a');

  assert.ok(amoris, 'Amoris exists');
  assert.ok(oblvns, 'Oblivionis exists');

  // 1. 3-piece damage multiplier buff: base 1.20 + 0.01 * 20 = 1.40
  const buff = amoris.findBuff('bond:aveMujica:dmg');
  assert.ok(buff, 'Damage buff exists on member');
  assert.equal(buff.mods?.dmgDealtMul, 1.40, 'Damage multiplier is 1.40 at 20 layers');

  // 2. 5-piece SP reduction: 50%
  // skchr_oblvns_3 base spCost 47 -> halved to floor(47 * 0.5) = 23
  assert.equal(oblvns.skill.spCost, Math.floor(oblvns.skill.baseSpCost * 0.5), 'SP cost is halved by 50%');

  // 3. Oblivionis garrison (+6 layers on skill cast)
  h.b.flags.layerGainsEnabled = true;
  h.step();
  const l0 = h.b.getPlayer('p1').bonds.aveMujicaShip.layers;
  oblvns.skill.charges = 1;
  oblvns.skill.activate();
  const l1 = h.b.getPlayer('p1').bonds.aveMujicaShip.layers;
  assert.equal(l1, l0 + 6, 'Oblivionis garrison adds 6 layers on skill cast');

  // 4. Mortis garrison (+5 layers to aveMujicaShip and indomShip on doll swap)
  const indom0 = h.b.getPlayer('p1').bonds.indomShip.layers;
  const mortis = h.unit('chess_char_4_27_a');
  h.b.emit('fatal', { unit: mortis, prevented: false });
  mortis.trait.doll = true;
  h.step();
  const l2 = h.b.getPlayer('p1').bonds.aveMujicaShip.layers;
  const indom1 = h.b.getPlayer('p1').bonds.indomShip.layers;
  assert.equal(l2, l1 + 5, 'Mortis garrison adds 5 Ave Mujica layers on doll swap');
  assert.equal(indom1, indom0 + 5, 'Mortis garrison adds 5 indom layers on doll swap');

  // 5. Dolris garrison (+1 layer when an Ave Mujica member kills an enemy)
  const l3 = h.b.getPlayer('p1').bonds.aveMujicaShip.layers;
  const dummyEnemy = { side: 'enemy', alive: false };
  h.b.emit('kill', { killer: amoris, victim: dummyEnemy });
  const l4 = h.b.getPlayer('p1').bonds.aveMujicaShip.layers;
  assert.equal(l4, l3 + 1, 'Dolris garrison adds 1 layer when an Ave Mujica member kills an enemy');
});

test('Ave Mujica Mod: Fever meter, trigger, free casts and S3 undying', () => {
  const h = makeBattle(fiveUnits());
  h.b.flags.layerGainsEnabled = true;
  h.step();

  const pid = 'p1';
  const amoris = h.unit('chess_char_2_20_a');
  const mortis = h.unit('chess_char_4_27_a');
  const dolris = h.unit('chess_char_5_24_a');
  const oblvns = h.unit('chess_char_6_21_a');

  const hit = (n) => {
    for (let i = 0; i < n; i++) h.b.emit('damaged', { source: amoris, target: { side: 'enemy', alive: true }, amount: 1 });
  };

  // 1. Charge: +3 per damage instance, cap 450
  hit(2);
  assert.equal(feverValue(h.b, pid), 6, 'fever meter is 6 after two hits');
  assert.equal(feverActive(h.b, pid), false, 'fever is not active below the threshold');

  // 2. Below the threshold an activation does NOT start fever
  amoris.skill.charges = 1;
  assert.ok(amoris.skill.activate(), 'Amoris skill activated');
  assert.equal(feverActive(h.b, pid), false, 'no fever below 50%');

  // 3. At >= 50% (225) the next member activation starts team fever; the meter resets
  hit(73); // 6 + 73*3 = 225
  assert.equal(feverValue(h.b, pid), FEVER_TRIGGER, 'meter reached the trigger value');
  mortis.skill.charges = 1;
  assert.ok(mortis.skill.activate(), 'Mortis skill activated');
  assert.equal(feverActive(h.b, pid), true, 'fever started on activation at >= 50%');
  assert.equal(feverValue(h.b, pid), 0, 'entering fever resets the meter');

  // 4. During fever skills are free (cost 0) and charges are topped for auto-casting
  assert.equal(oblvns.skill.spCost, 0, 'skill cost is 0 during fever');
  assert.equal(dolris.skill.spCostMul, 0, 'spCostMul is 0 during fever');
  h.step();
  assert.ok(dolris.skill.charges >= 1, 'charges are topped during fever');

  // 5. S3 fever undying: fatal damage on a member is prevented while Sakiko (S3 selected) is on the field
  const fctx = { unit: mortis, source: null, credit: null, dmg: null, amount: 9999, prevented: false };
  h.b.emit('fatal', fctx);
  assert.equal(fctx.prevented, true, 'fatal prevented during fever (S3)');

  // 6. Fever ends: costs/readiness restored, saved units force-retreated (FORCED_EXIT)
  const st = feverState(h.b, pid);
  st.left = 0.001;
  h.step();
  assert.equal(feverActive(h.b, pid), false, 'fever ended');
  assert.equal(oblvns.skill.spCost, Math.floor(oblvns.skill.baseSpCost * 0.5), 'SP cost restored after fever');
  assert.ok(!mortis.deployed, 'undying survivor force-retreated at fever end');
});

test('Ave Mujica Mod: note projectiles give pierce stacks, Sakiko aura applies', () => {
  const h = makeBattle(fiveUnits());
  h.step();

  const amoris = h.unit('chess_char_2_20_a');
  const oblvns = h.unit('chess_char_6_21_a');

  // 1. Talent aura: Sakiko herself (always) gets +12 ASPD while on the field
  const aura = oblvns.findBuff('mujica:sakikoAura');
  assert.ok(aura, 'Sakiko ASPD aura exists');
  assert.equal(aura.mods?.aspd, 12, 'aura gives +12 ASPD (base value on 0.1.0)');

  // 2. A note in flight gives every member +3% def ignore / +2% res ignore (1 stack)
  const p = fireNote(h.b, oblvns, { scale: 1, type: 'arts', mode: 'drift', angleDeg: 0, speed: 3.5 });
  assert.ok(p, 'note projectile fired');
  h.step();
  const pierce = amoris.findBuff('mujica:notePierce');
  assert.ok(pierce, 'pierce buff exists while a note is in flight');
  assert.ok(Math.abs(pierce.mods?.defIgnorePct - 0.03) < 1e-9, 'defIgnorePct is 3% per note');
  assert.ok(Math.abs(pierce.mods?.resIgnorePct - 0.02) < 1e-9, 'resIgnorePct is 2% per note');

  // 3. Notes expire (drift distance + fade delay) and the stacks drop with them
  h.run(5);
  assert.equal(h.b.projectiles.list.filter((x) => x.data?.note).length, 0, 'note expired');
  h.step(16); // let the 0.75 s refresh buff lapse
  assert.ok(!amoris.findBuff('mujica:notePierce'), 'pierce buff lapses without notes');
});

test('Ave Mujica Mod: attack ranges and Spine models', () => {
  const expectedRanges = {
    chess_char_2_20_a: { rangeId: '1-1', tileCount: 2 },
    chess_char_3_22_a: { rangeId: 'y-1', tileCount: 10 },
    chess_char_4_27_a: { rangeId: '1-1', tileCount: 2 },
    chess_char_5_24_a: { rangeId: 'x-1', tileCount: 13 },
    chess_char_6_21_a: { rangeId: '3-12', tileCount: 8 }
  };

  for (const [id, exp] of Object.entries(expectedRanges)) {
    const c = data.chess[id];
    assert.equal(c.rangeId, exp.rangeId, `${id} rangeId is ${exp.rangeId}`);
    assert.ok(Array.isArray(c.rangeGrid), `${id} rangeGrid is array`);
    assert.equal(c.rangeGrid.length, exp.tileCount, `${id} rangeGrid has ${exp.tileCount} tiles`);
    for (const tile of c.rangeGrid) {
      assert.ok(Array.isArray(tile) && tile.length === 2, `${id} tile is [dr, dc] coordinate pair`);
      assert.ok(Number.isInteger(tile[0]) && Number.isInteger(tile[1]), `${id} coordinates are integers`);
    }
  }

  // Verify Spine definitions in assets.json
  const charIds = ['char_4182_oblvns', 'char_4183_mortis', 'char_4184_dolris', 'char_4185_amoris', 'char_4186_tmoris'];
  for (const cid of charIds) {
    const assetChar = data.assets.chars[cid];
    assert.ok(assetChar, `Assets entry for ${cid} exists`);
    assert.ok(assetChar.spine?.front, `${cid} has spine.front`);
    assert.ok(assetChar.spine.front.skel, `${cid} spine.front has skel`);
    assert.ok(assetChar.spine.front.atlas, `${cid} spine.front has atlas`);
    assert.ok(assetChar.spine.front.textures?.length > 0, `${cid} spine.front has textures`);
    assert.ok(assetChar.spine.front.anims?.idle, `${cid} spine.front has idle animation`);
    assert.ok(assetChar.spine.front.anims?.attack, `${cid} spine.front has attack animation`);

    // Verify skin spine
    const skinId = `${cid}@avemujica#1`;
    const skin = assetChar.skins?.[skinId];
    assert.ok(skin, `${cid} has skin ${skinId}`);
    assert.ok(skin.spine?.front, `${skinId} has skin spine.front`);
    assert.ok(skin.spine.front.skel, `${skinId} skin front has skel`);
    assert.ok(skin.spine.front.atlas, `${skinId} skin front has atlas`);
  }
});
