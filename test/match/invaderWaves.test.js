import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameData } from '../../server/match/gamedata.js';
import { DATA } from './harness.js';
import {
  getInvaderBudget,
  calculateEnemyCost,
  getAvailableEnemiesForRound,
  buildInvaderCustomWave,
  INVADER_TACTICS,
} from '../../server/match/invaderWaves.js';
import { setupMatchWaves } from '../../server/match/waves.js';
import { createRng } from '../../server/sim/rng.js';

test('invader budget formula', () => {
  assert.equal(getInvaderBudget(1), 14);
  assert.equal(getInvaderBudget(7), 38);
  assert.equal(getInvaderBudget(14), 66);
});

test('calculateEnemyCost: scales with rank and attrPower', () => {
  const dog = DATA.enemies['enemy_1000_gopro_2']; // normal
  const hammer = DATA.enemies['enemy_1045_hammer']; // elite
  const bigBob = DATA.enemies['enemy_1001_bigbo']; // boss

  assert.ok(calculateEnemyCost(dog) >= 2 && calculateEnemyCost(dog) <= 4);
  assert.ok(calculateEnemyCost(hammer) >= 5 && calculateEnemyCost(hammer) <= 7);
  assert.equal(calculateEnemyCost(bigBob), 15);
});

test('getAvailableEnemiesForRound: respects firstHalf and scheduled factions', () => {
  const gd = new GameData(DATA, 'mode_multi_normal');
  const setup = setupMatchWaves(gd, createRng(42));

  // Round 1 (first half)
  const r1 = getAvailableEnemiesForRound(gd, setup.factions, 1);
  assert.equal(r1.round, 1);
  assert.equal(r1.isFirstHalf, true);
  assert.equal(r1.budget, 14);
  assert.ok(r1.enemies.length > 0);
  assert.ok(r1.tactics.length > 0);

  // Round 10 (second half)
  const r10 = getAvailableEnemiesForRound(gd, setup.factions, 10);
  assert.equal(r10.round, 10);
  assert.equal(r10.isFirstHalf, false);
  assert.equal(r10.budget, 50);
  assert.ok(r10.enemies.length > 0);
});

test('buildInvaderCustomWave: custom picks, tactics and reinforcements', () => {
  const gd = new GameData(DATA, 'mode_multi_normal');
  const rng = createRng(100);
  const setup = setupMatchWaves(gd, rng);

  const available = getAvailableEnemiesForRound(gd, setup.factions, 3);
  const sampleEnemy = available.enemies[0].key;

  const plan = {
    normalKey: sampleEnemy,
    tacticId: 'rush',
    routeStrategy: 'upper_focus',
    reinforcements: [
      { enemyKey: sampleEnemy, routeIndex: 0, count: 2, time: 20 },
    ],
  };

  const wave = buildInvaderCustomWave(gd, rng, setup.factions, 3, plan);
  assert.ok(wave);
  assert.ok(wave.spawns.length > 0);

  // Check tactic effect applied to mods.speedMul
  const scale = gd.enemyScale(3);
  const rushTactic = INVADER_TACTICS.find((t) => t.id === 'rush');
  const expectedSpeedMul = scale.speedMul * rushTactic.effect.speedMul;

  const firstSpawn = wave.spawns[0];
  assert.ok(Math.abs(firstSpawn.mods.speedMul - expectedSpeedMul) < 1e-4);

  // Check reinforcement present
  const reinf = wave.spawns.find((s) => s.tag === 'reinforcement');
  assert.ok(reinf, 'reinforcement squad spawned');
  assert.equal(reinf.enemyKey, sampleEnemy);
  assert.equal(reinf.count, 2);
  assert.equal(reinf.time, 20);
});
