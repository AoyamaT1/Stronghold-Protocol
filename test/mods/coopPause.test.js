// test/mods/coopPause.test.js — Unit & integration tests for coop-pause mod.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE, ERR } from '../../shared/constants.js';
import { pauseAvailable } from '../../public/js/ui/matchStatus.js';
import { DATA, makeMatch } from '../match/harness.js';
import { installMod, uninstallMod } from '../../tools/mod.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONFIG_FILE = path.join(ROOT, 'data', 'config.json');

// Dataset with coopPause enabled
const DATA_COOP_PAUSE = {
  ...DATA,
  config: { ...DATA.config, coopPause: true },
};

// Dataset without coopPause
const DATA_VANILLA = {
  ...DATA,
  config: (() => {
    const c = { ...DATA.config };
    delete c.coopPause;
    return c;
  })(),
};

test('UI pauseAvailable: respects allowCoopPause and phases', () => {
  const pub = (phase, extra = {}) => ({ phase, ...extra });

  // 1. When allowCoopPause is false (vanilla), co-op is always denied
  for (const ph of [PHASE.COMBAT, PHASE.UNITE, PHASE.FINAL_ASSAULT, PHASE.HIDDEN_CORE]) {
    assert.equal(pauseAvailable(pub(ph), { solo: false, allowCoopPause: false }), false, `vanilla denies ${ph}`);
  }

  // 2. When allowCoopPause is true, co-op battles allow pause
  for (const ph of [PHASE.COMBAT, PHASE.UNITE, PHASE.FINAL_ASSAULT, PHASE.HIDDEN_CORE]) {
    assert.equal(pauseAvailable(pub(ph), { solo: false, allowCoopPause: true }), true, `coop allows ${ph}`);
  }

  // 3. Non-battle phases are denied even with allowCoopPause
  for (const ph of [PHASE.PREP, PHASE.SP_DRAFT, PHASE.SETTLE, PHASE.RESULT, PHASE.INFO_CHECK]) {
    assert.equal(pauseAvailable(pub(ph), { solo: false, allowCoopPause: true }), false, `denies ${ph}`);
  }

  // 4. Dead / eliminated players cannot pause
  assert.equal(pauseAvailable(pub(PHASE.COMBAT), { solo: false, alive: false, allowCoopPause: true }), false);
});

test('Engine MatchPause: vanilla rejects co-op pause with WRONG_PHASE', () => {
  const h = makeMatch({
    mode: 'coop',
    difficulty: 'NORMAL',
    humans: 2,
    bots: 0,
    data: DATA_VANILLA,
    fake: true,
  });
  h.m.phase = PHASE.COMBAT;
  const p0 = h.m.players.get('p_0');
  h.m.fields = [{ fieldId: 'n:p_0', live: true, done: false, cc: true, players: ['p_0'] }];

  const res = h.m.setPause(p0, true);
  assert.equal(res.ok, undefined);
  assert.equal(res.error, ERR.WRONG_PHASE);
  assert.equal(h.m.paused, false);
});

test('Engine MatchPause: coopPause mod allows pausing, unpausing and broadcasts ticker', () => {
  const h = makeMatch({
    mode: 'coop',
    difficulty: 'NORMAL',
    humans: 2,
    bots: 0,
    data: DATA_COOP_PAUSE,
    fake: true,
  });
  h.m.phase = PHASE.COMBAT;
  const p0 = h.m.players.get('p_0');
  const p1 = h.m.players.get('p_1');
  h.m.fields = [
    { fieldId: 'n:p_0', live: true, done: false, cc: true, players: ['p_0'], progress: { killed: 0, total: 10, resolved: 0 } },
    { fieldId: 'n:p_1', live: true, done: false, cc: true, players: ['p_1'], progress: { killed: 0, total: 10, resolved: 0 } },
  ];

  // 1. Player 0 pauses
  const resPause = h.m.setPause(p0, true);
  assert.equal(resPause.ok, true);
  assert.equal(h.m.paused, true);
  assert.equal(h.m.publicView().paused, true);
  assert.equal(h.m.publicView().pausedBy, p0.name);
  assert.ok(h.m.publicView().pausedAt > 0);

  // Check ticker announcement
  const pauseTicker = h.bc.find((b) => b.t === 'm.ticker' && b.text?.includes('暂停了游戏'));
  assert.ok(pauseTicker, 'should broadcast pause ticker');
  assert.ok(pauseTicker.text.includes(p0.name));

  // Advance virtual time by 5000 ms while paused
  h.sched.advance(5000);

  // 2. Dead player cannot unpause or pause
  p1.alive = false;
  const resDead = h.m.setPause(p1, false);
  assert.equal(resDead.ok, undefined);
  assert.equal(resDead.error, ERR.WRONG_PHASE);
  p1.alive = true;

  // 3. Player 1 unpauses
  const resResume = h.m.setPause(p1, false);
  assert.equal(resResume.ok, true);
  assert.equal(h.m.paused, false);
  assert.equal(h.m.publicView().paused, false);
  assert.equal(h.m.publicView().pausedBy, null);
  assert.equal(h.m.pausedMs, 5000);

  // Check resume ticker announcement
  const resumeTicker = h.bc.find((b) => b.t === 'm.ticker' && b.text?.includes('继续了游戏'));
  assert.ok(resumeTicker, 'should broadcast resume ticker');
  assert.ok(resumeTicker.text.includes(p1.name));
});

test('Engine MatchPause: supports UNITE phase when coopPause is enabled', () => {
  const h = makeMatch({
    mode: 'coop',
    difficulty: 'NORMAL',
    humans: 2,
    bots: 0,
    data: DATA_COOP_PAUSE,
    fake: true,
  });
  h.m.phase = PHASE.UNITE;
  const p0 = h.m.players.get('p_0');
  h.m.fields = [{ fieldId: 'u', kind: 'unite', live: true, done: false, cc: true, players: ['p_0', 'p_1'] }];

  const res = h.m.setPause(p0, true);
  assert.equal(res.ok, true);
  assert.equal(h.m.paused, true);

  const resResume = h.m.setPause(p0, false);
  assert.equal(resResume.ok, true);
  assert.equal(h.m.paused, false);
});

test('Mod manager: install and uninstall coop-pause cleanly merges/cleans config.json', () => {
  // Ensure starting state: if installed, uninstall first
  try { uninstallMod('coop-pause'); } catch { /* ignore */ }

  const beforeConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  assert.equal(beforeConfig.coopPause, undefined);

  // Install
  installMod('coop-pause');
  const installedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  assert.equal(installedConfig.coopPause, true);

  // Uninstall
  uninstallMod('coop-pause');
  const afterConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  assert.equal(afterConfig.coopPause, undefined);

  // Re-install to keep mod active for gameplay
  installMod('coop-pause');
  const restoredConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  assert.equal(restoredConfig.coopPause, true);
});

