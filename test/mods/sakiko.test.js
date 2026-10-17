// test/mods/sakiko.test.js — smoke test for the ported 丰川祥子 kit (mods/sakiko, op-oblvns) + the projectile
// `steer` engine hook it needs. Proves her authored kit loads (not the generic fallback), her notes fly via steer
// and deal damage, and the battle stays invariant-clean.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const MUJICA_CHESS = JSON.parse(fs.readFileSync(new URL('../../mods/ave-mujica/data/chess.json', import.meta.url), 'utf-8'));

test('祥子 (chess_char_6_21_a) runs her ported kit: notes fly via steer and deal damage', () => {
  const h = makeBattle({
    seed: 7,
    defs: { chess: MUJICA_CHESS, enemies: { enemy_test: enemyRec({ key: 'enemy_test', hp: 200000, def: 300, res: 20, speed: 0.6 }) } },
    units: [{ chessId: 'chess_char_6_21_a', row: 10, col: 4 }],
    enemies: [{ key: 'enemy_test', time: 0, route: 0 }],
  });

  const saki = h.unit('chess_char_6_21_a');
  assert.ok(saki, 'Sakiko deployed');
  // authored kit, not the generic fallback: all three skills present
  const skills = Object.keys(saki.kit?.skills ?? {});
  assert.ok(['skchr_oblvns_1', 'skchr_oblvns_2', 'skchr_oblvns_3'].every((s) => skills.includes(s)),
    `authored skills present, got [${skills}]`);

  // run until she has launched note projectiles (her attack carrier) and dealt damage to the dummy
  let sawNote = false;
  h.runUntil((b) => {
    if ((b.projectiles?.list ?? []).some((p) => p?.data?.tag === 'sakiko:note')) sawNote = true;
    const e = b.units.find((u) => u.side === 'enemy' && u.defId === 'enemy_test');
    return sawNote && e && e.hp < e.s.maxHp;
  }, 30);

  assert.ok(sawNote, 'at least one 音符 (sakiko:note) projectile was launched (steer-driven)');
  const enemy = h.battle.units.find((u) => u.side === 'enemy' && u.defId === 'enemy_test');
  assert.ok(enemy && enemy.hp < enemy.s.maxHp, 'the note damage reduced the enemy HP');
  h.invariants();
});

// The attack CARRIER contract (kit ATTACK_CARRIER + ai.js `noAttackDamage`/`noAttackVis`): her ordinary attack is the
// note, so the engine's own invisible arrow must deal nothing and must not complete the attack — the note settles both
// the damage (`isAttack`-flagged, tag 'talent') and the attack-type SP when IT reaches the enemy.
test('祥子 attack carrier: the arrow deals nothing, the note settles damage + attack SP exactly once', () => {
  const h = makeBattle({
    seed: 3, autoFinish: false, timeLimit: 90, captureNoisy: true, hooks: ['damaged', 'spGain', 'attack'],
    defs: { chess: MUJICA_CHESS, enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e9, def: 0, res: 0, speed: 0, atk: 0 }) } },
    units: [{ chessId: 'chess_char_6_21_a', row: 10, col: 4 }],
    enemies: [{ key: 'enemy_dummy', pos: [10, 6] }],
  });
  h.step();
  const saki = h.unit('chess_char_6_21_a');
  const dummy = h.enemy('enemy_dummy');
  // no skill casts (the kit's charge/Fever release stays out of the way): only ordinary attacks happen
  saki.skill.rule = 'NEVER';
  saki.skill.sp = 0;
  saki.skill.charges = 0;
  const hp0 = dummy.hp;

  const hits = () => h.hooksOf('damaged').filter((c) => c.source === saki && c.target === dummy);
  h.runUntil(() => hits().length >= 3, 40);
  const list = hits();
  assert.ok(list.length >= 3, `the notes landed (${list.length})`);

  // 1. every HP loss on the dummy came from a note (tag 'talent'): the engine's arrow dealt none of its own
  for (const c of list) assert.ok((c.dmg?.tags ?? []).includes('talent'), `note-tagged damage, got [${c.dmg?.tags}]`);
  const dealt = list.reduce((n, c) => n + c.amount, 0);
  assert.ok(Math.abs(dealt - (hp0 - dummy.hp)) < 1e-6, `no phantom arrow damage: dealt ${dealt} vs HP lost ${hp0 - dummy.hp}`);

  // 2. attack-type SP is paid ONCE per landed note (the arrow no longer completes the attack)
  const sp = h.hooksOf('spGain').filter((c) => c.unit === saki && c.reason === 'attack');
  assert.equal(sp.length, list.length, 'one attack-SP gain per landed note, never two');

  // 3. the note is published for the client while it flies (snap.proj, render/fx/notes.js)
  const flying = h.battle.projectiles.list.filter((p) => p.data?.tag === 'sakiko:note');
  if (flying.length) {
    const proj = h.snapshot().proj ?? [];
    assert.ok(proj.some((e) => e[3] === 'note' || e[3] === 'noteSkill'), 'snap.proj carries her notes');
  }
  h.invariants();
});

// Talent 2 (毋畏遗忘): Ave Mujica attack range extension (direct & chained extensions + retreat cleanup).
test('祥子天赋二【毋畏遗忘】: Ave Mujica干员重叠时攻击范围延伸 (直接延伸与多干员链式延伸, 撤退断开时清除)', () => {
  const COLS = 21;
  const tileKey = (r, c) => r * COLS + c;

  // 1. Direct extension: Sakiko at [10, 4] base range reaches up to [10, 7].
  // Mortis at [10, 7] has range covering [10, 7] and [10, 8].
  // [10, 7] overlaps Sakiko's range, so Sakiko's range extends to include [10, 8].
  const h = makeBattle({
    defs: { chess: MUJICA_CHESS, enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 100000, def: 0, res: 0, speed: 0, atk: 0 }) } },
    units: [
      { chessId: 'chess_char_6_21_a', row: 10, col: 4 },
      { chessId: 'chess_char_4_27_a', row: 10, col: 7 },
    ],
    enemies: [{ key: 'enemy_dummy', pos: [10, 8] }],
    captureNoisy: true,
    hooks: ['damaged', 'attack'],
  });
  h.step();
  const saki = h.unit('chess_char_6_21_a');
  const mortis = h.unit('chess_char_4_27_a');
  const dummy = h.enemy('enemy_dummy');

  assert.ok(saki.extraRangeKeys?.includes(tileKey(10, 8)), 'Sakiko extraRangeKeys contains Mortis range tile [10, 8]');
  assert.ok(saki.rangeKeySet.has(tileKey(10, 8)), 'Sakiko rangeKeySet includes extended tile [10, 8]');

  // Verify Sakiko can attack the enemy standing at [10, 8] through extended range
  saki.skill.rule = 'NEVER';
  saki.skill.sp = 0;
  saki.skill.charges = 0;
  h.run(2);
  assert.ok(dummy.hp < 100000, `enemy at [10, 8] took damage: ${dummy.hp} < 100000`);
  assert.ok(h.hooksOf('damaged').some((c) => c.source === saki && c.target === dummy), 'damaged hook confirmed hit from Sakiko');

  // 2. Transitive / chained extension: Add Dolris at [10, 10].
  // Dolris has [0, -2] backwards range covering [10, 8], which connects to Mortis's range [10, 8].
  // Dolris also covers [10, 10], [10, 11], [10, 12].
  // Sakiko's range must transitively extend to Dolris's range tiles!
  const h2 = makeBattle({
    defs: { chess: MUJICA_CHESS },
    units: [
      { chessId: 'chess_char_6_21_a', row: 10, col: 4 },
      { chessId: 'chess_char_4_27_a', row: 10, col: 7 },
      { chessId: 'chess_char_5_24_a', row: 10, col: 10 },
    ],
  });
  h2.step();
  const saki2 = h2.unit('chess_char_6_21_a');
  const mortis2 = h2.unit('chess_char_4_27_a');

  assert.ok(saki2.rangeKeySet.has(tileKey(10, 8)), 'chained: covers Mortis tile [10, 8]');
  assert.ok(saki2.rangeKeySet.has(tileKey(10, 10)), 'chained: covers Dolris tile [10, 10]');
  assert.ok(saki2.rangeKeySet.has(tileKey(10, 12)), 'chained: covers Dolris forward tile [10, 12]');

  // 3. Retreat Mortis: breaks the link between Sakiko and Dolris.
  // Sakiko's extra range drops back to null.
  h2.battle.retreat(mortis2);
  h2.step();
  assert.equal(saki2.extraRangeKeys, null, 'after bridge retreat, Sakiko extraRangeKeys drops to null');
  assert.ok(!saki2.rangeKeySet.has(tileKey(10, 12)), 'Dolris tile no longer in Sakiko range');

  h.invariants();
  h2.invariants();
});

// S3 (残月的余响): Continuous attack fires enhanced notes (2 piano phys + 2 organ arts) even when range is empty.
test('祥子三技能【残月的余响】: 攻击范围内无敌人时持续攻击仍释放强化音符', () => {
  const h = makeBattle({
    defs: { chess: MUJICA_CHESS },
    units: [{ chessId: 'chess_char_6_21_a', row: 10, col: 4, loadout: { skillId: 'skchr_oblvns_3' } }],
  });
  h.step();
  const saki = h.unit('chess_char_6_21_a');
  assert.equal(saki.skill?.id, 'skchr_oblvns_3', 'S3 selected');

  // Activate S3
  saki.skill.setSpTotal(saki.skill.spCost);
  assert.ok(saki.skill.activate('manual'), 'S3 activated');
  assert.ok(saki.skill.active, 'S3 is active');

  // Run simulation with 0 enemies in range; track fired projectiles
  const observed = [];
  h.runUntil(() => {
    for (const p of h.battle.projectiles?.list ?? []) {
      if (!observed.includes(p)) observed.push(p);
    }
    const skillNotes = observed.filter((p) => p.data?.hitTag === 'skill' && p.data?.tag === 'sakiko:note');
    return skillNotes.length >= 8;
  }, 10);

  const skillNotes = observed.filter((p) => p.data?.hitTag === 'skill' && p.data?.tag === 'sakiko:note');
  assert.ok(skillNotes.length >= 8, `at least 8 enhanced notes fired during S3 empty-range continuous attacks (got ${skillNotes.length})`);

  // Verify enhanced note properties: speed is 1.3 (NOTE_S3 tracking speed)
  for (const p of skillNotes) {
    assert.equal(p.speed, 1.3, 'S3 note has tracking speed 1.3');
  }

  h.invariants();
});
