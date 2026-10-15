import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { PHASE } from '../../shared/constants.js';
import { Lobby } from '../../server/lobby.js';

test('invader mode match: seat role, private view, custom plan and combat launch', () => {
  const h = makeMatch({
    mode: 'coop',
    difficulty: 'NORMAL',
    seats: [
      { seat: 0, playerId: 'p_def', name: 'Defender', isBot: false, connected: true, role: 'defender' },
      { seat: 1, playerId: 'p_inv', name: 'Invader', isBot: false, connected: true, role: 'invader' },
    ],
    seed: 42,
    fake: true,
  });

  h.start();
  // Move through INFO_CHECK, BAND_DRAFT, BATTLE_CHECK to ROUND_START & PREP
  h.runToPhase(PHASE.PREP);

  const defPs = h.ps('p_def');
  const invPs = h.ps('p_inv');

  assert.equal(defPs.role, 'defender');
  assert.equal(invPs.role, 'invader');

  // Invader private view has available enemies and budget
  const invView = invPs.privateView();
  assert.equal(invView.role, 'invader');
  assert.ok(invView.invader);
  assert.ok(invView.invader.budget >= 14);
  assert.ok(invView.invader.enemies.length > 0);

  // Submit invader plan
  const sampleEnemy = invView.invader.enemies[0].key;
  const plan = {
    normalKey: sampleEnemy,
    tacticId: 'rush',
    reinforcements: [
      { enemyKey: sampleEnemy, routeIndex: 0, count: 1, time: 10 },
    ],
  };

  const res = h.m.handle('p_inv', { t: 'g.invaderPlan', plan });
  assert.deepEqual(res, { ok: true });
  assert.equal(invPs.ready, true);

  // Defender readies up
  h.m.handle('p_def', { t: 'g.ready', ready: true });

  // Advance scheduler into COMBAT
  h.runToPhase(PHASE.COMBAT);
  assert.equal(h.m.phase, PHASE.COMBAT);

  // The wave generated has the custom enemy and reinforcement
  assert.ok(h.m.wave);
  const reinf = h.m.wave.spawns.find((s) => s.tag === 'reinforcement');
  assert.ok(reinf, 'reinforcement squad exists in battle spawns');
  assert.equal(reinf.enemyKey, sampleEnemy);

  // Fields are only created for the defender
  assert.equal(h.m.fields.length, 1);
  assert.equal(h.m.fields[0].players[0], 'p_def');

  // Invader is watching the defender's field
  assert.equal(h.m.watchers.get('p_inv'), 'n:p_def');
});

test('invader mode blindFaction: masked in INFO_CHECK, picked by invader, revealed at ROUND_START', () => {
  const h = makeMatch({
    mode: 'invader',
    difficulty: 'NORMAL',
    blindFaction: true,
    seats: [
      { seat: 0, playerId: 'p_def', name: 'Defender', isBot: false, connected: true, role: 'defender' },
      { seat: 1, playerId: 'p_inv', name: 'Invader', isBot: false, connected: true, role: 'invader' },
    ],
    seed: 42,
    fake: true,
  });

  h.start();
  assert.equal(h.m.phase, PHASE.INFO_CHECK);

  // In INFO_CHECK: 3rd faction is masked as 'BLIND'
  const pubView = h.m.publicView();
  assert.equal(pubView.factions.length, 3);
  assert.equal(pubView.factions[2], 'BLIND');

  const invPs = h.ps('p_inv');
  const invView = invPs.privateView();
  assert.equal(invView.role, 'invader');
  assert.equal(invView.invader.blindFaction, true);
  assert.ok(Array.isArray(invView.invader.selectableFactions));
  assert.ok(invView.invader.selectableFactions.length > 0);
  assert.ok(typeof invView.invader.chosenFaction === 'string');

  const selectable = invView.invader.selectableFactions;
  const originalChosen = invView.invader.chosenFaction;
  const newTarget = selectable.find((f) => f !== originalChosen) || selectable[0];

  // Defender cannot pick faction
  const defRes = h.m.handle('p_def', { t: 'g.invaderPickFaction', faction: newTarget });
  assert.equal(defRes.ok, undefined);
  assert.ok(defRes.error);

  // Invader cannot pick invalid or already scheduled faction
  const badRes = h.m.handle('p_inv', { t: 'g.invaderPickFaction', faction: 'INVALID_FACTION' });
  assert.ok(badRes.error);

  // Invader picks valid faction
  const pickRes = h.m.handle('p_inv', { t: 'g.invaderPickFaction', faction: newTarget });
  assert.deepEqual(pickRes, { ok: true });
  assert.equal(h.m.factions[2], newTarget);

  // Private view updates chosenFaction
  const updatedInvView = invPs.privateView();
  assert.equal(updatedInvView.invader.chosenFaction, newTarget);

  // Public view still masked during INFO_CHECK
  assert.equal(h.m.publicView().factions[2], 'BLIND');

  // Ready up and run to ROUND_START
  h.runToPhase(PHASE.ROUND_START);
  assert.equal(h.m.phase, PHASE.ROUND_START);

  // Once ROUND_START is entered, factions are revealed
  const roundPubView = h.m.publicView();
  assert.equal(roundPubView.factions[2], newTarget);
});

test('lobby room in invader mode: 5 seats, mode switching and blindFaction toggle', () => {
  const reg = new (class {
    constructor() { this.byPlayerId = new Map(); }
    byId(id) { return this.byPlayerId.get(id) || null; }
  })();
  const lobby = new (class extends Lobby {
    constructor() {
      super({ registry: reg, log: { info() {}, warn() {}, error() {}, debug() {} } });
    }
  })();

  const session = { playerId: 'host1', name: 'Host', addr: '127.0.0.1', connected: true, loadout: null, skins: null, ws: { send() {} } };
  reg.byPlayerId.set('host1', session);

  // 1. Create room in invader mode
  const res = lobby.create(session, { mode: 'invader', difficulty: 'NORMAL' });
  assert.deepEqual(res, { ok: true });
  const room = lobby.getRoom(session.roomCode);
  assert.ok(room);
  assert.equal(room.mode, 'invader');
  assert.equal(room.seats.length, 5);
  assert.equal(room.blindFaction, true);

  // 2. Toggle blindFaction
  const toggleRes = lobby.setBlindFaction(session, { enabled: false });
  assert.deepEqual(toggleRes, { ok: true });
  assert.equal(room.blindFaction, false);

  // 3. Switch mode to coop (should shrink seats to 4)
  const modeRes = lobby.setMode(session, { mode: 'coop' });
  assert.deepEqual(modeRes, { ok: true });
  assert.equal(room.mode, 'coop');
  assert.equal(room.seats.length, 4);

  // 4. Switch mode back to invader (should expand seats to 5 and default blindFaction to true)
  const modeBackRes = lobby.setMode(session, { mode: 'invader' });
  assert.deepEqual(modeBackRes, { ok: true });
  assert.equal(room.mode, 'invader');
  assert.equal(room.seats.length, 5);
  assert.equal(room.blindFaction, true);
});
