// mods/ave-mujica/sim/fever.js — Ave Mujica Fever system (丰川祥子 talent 2「毋畏遗忘」+ team-wide meter).
//
// Meter: every damage instance a Mujica member deals to an enemy +3 (cap 450, shown 0-100%). At >= 225 (50%) the next
// skill activation of ANY member (manual, engine auto-cast or kit auto-release — 2026-10-08 ruling) starts team
// FEVER for 20s: the meter resets to 0 [ASSUMED] and stops charging; every member's skill becomes free (SP cost 0,
// charges kept topped so each unit's own trigger rule auto-casts — AUTO_OP_COOLDOWN still applies to MANUAL skills);
// readiness (sp/charges) saved at fever start is restored when it ends. While a member's SELECTED skill is
// skchr_oblvns_3 (残月的余响, Sakiko on field) fatal damage on members is prevented (HP stays at 1); units saved this
// way are force-retreated (FORCED_EXIT) when fever ends. The meter lives for one battle (new round / 联防 = new battle).
//
// Engine-patch note: the snapshot (`snap.fever`) and the client rose SP-bar are deferred to the 0.2.2 baseline update.
import { FORCED_EXIT } from '../../../constants.js';
import * as S from '../../support/index.js';

export const FEVER_MAX = 450;
export const FEVER_TRIGGER = 225; // 50 %
export const FEVER_DURATION = 20;
export const FEVER_CHARGE = 3;

/** Mujica member (own aveMujicaShip bond, incl. the 调和 share rule). */
export const isMujica = (battle, u) => S.isOp(u) && S.isMember(battle, u, 'aveMujicaShip');

/** Per-player fever state (lazy). */
export function feverState(battle, pid) {
  const all = S.battleStore(battle, 'mujica:fever', () => new Map());
  let st = all.get(pid);
  if (!st) {
    st = { pid, value: 0, active: false, left: 0, saved: new Map(), undied: new Set() };
    all.set(pid, st);
  }
  return st;
}

/** Fever state of the player owning `u` (null when u is not a fielded Mujica member). */
export const feverOf = (battle, u) => (isMujica(battle, u) ? feverState(battle, u.ownerId) : null);

export const feverValue = (battle, pid) => S.num(feverState(battle, pid)?.value, 0);
export const feverActive = (battle, pid) => !!feverState(battle, pid)?.active;

/** Sakiko of `pid` with 残月的余响 selected, alive on the field (S3's fever undying requires her presence). */
export const sakikoS3OnField = (battle, pid) => battle.allyUnits.some((u) =>
  u.ownerId === pid && S.onField(u) && u.def?.raw?.charId === 'char_4182_oblvns' &&
  (u.def?.skill?.skillId ?? u.def?.skill?.id) === 'skchr_oblvns_3');

function startFever(battle, st) {
  st.active = true;
  st.left = FEVER_DURATION;
  st.value = 0; // entering fever resets the meter [ASSUMED]
  st.saved.clear();
  st.undied.clear();
  for (const u of S.bondMembers(battle, st.pid, 'aveMujicaShip', { fieldOnly: true })) {
    saveAndFree(battle, st, u);
    battle.addBuff(u, { key: 'sakiko:fever', duration: FEVER_DURATION, refresh: 'replace', tags: ['fever', 'mujica'] });
    u.mem = u.mem || {};
    u.mem.gauges = u.mem.gauges || {};
    u.mem.gauges.fever = 100;
  }
  for (const u of S.bondMembers(battle, st.pid, 'aveMujicaShip', { fieldOnly: true })) {
    battle.fx('bloodBattle', { x: u.x, y: u.y, id: u.id });
  }
}

function saveAndFree(battle, st, u) {
  const sk = u.skill;
  if (!sk || sk.kind === 'passive' || sk.noSkill) return;
  if (!st.saved.has(u)) st.saved.set(u, { spCostMul: sk.spCostMul, sp: sk.sp, charges: sk.charges });
  sk.spCostMul = 0;
}

/** Per-tick fever upkeep: free casts (top charges up; late deployments get freed too) and the 20 s countdown. */
function feverTick(battle, st, dt) {
  const pct = Math.max(0, (st.left / FEVER_DURATION) * 100);
  for (const u of S.bondMembers(battle, st.pid, 'aveMujicaShip', { fieldOnly: true })) {
    u.mem = u.mem || {};
    u.mem.gauges = u.mem.gauges || {};
    u.mem.gauges.fever = pct;
    const sk = u.skill;
    if (!sk || sk.kind === 'passive' || sk.noSkill) continue;
    if (sk.spCostMul !== 0) {
      saveAndFree(battle, st, u); // deployed / redeployed mid-fever
      battle.addBuff(u, { key: 'sakiko:fever', duration: Math.max(0.1, st.left), refresh: 'replace', tags: ['fever', 'mujica'] });
    }
    if (!sk.active && !sk.pending && sk.charges < sk.maxCharges) sk.addCharge(sk.maxCharges - sk.charges);
  }
  st.left -= dt;
  if (st.left <= 0) endFever(battle, st);
}

function endFever(battle, st) {
  st.active = false;
  st.left = 0;
  for (const [u, sav] of st.saved) {
    const sk = u.skill;
    if (!sk || sk.noSkill || sk.kind === 'passive') continue;
    sk.spCostMul = S.num(sav.spCostMul, 1);
    sk.sp = Math.max(0, S.num(sav.sp, 0));
    sk.charges = Math.max(0, Math.min(sk.maxCharges, Math.floor(S.num(sav.charges, 0))));
  }
  st.saved.clear();
  for (const u of st.undied) {
    if (u.alive && u.deployed) battle.retreat(u, { reason: FORCED_EXIT });
  }
  st.undied.clear();
  for (const u of S.bondMembers(battle, st.pid, 'aveMujicaShip', { fieldOnly: true })) {
    if (u.findBuff?.('sakiko:fever')) battle.removeBuff(u, 'sakiko:fever');
    if (u.mem?.gauges) u.mem.gauges.fever = 0;
    battle.fx('pulse', { x: u.x, y: u.y, id: u.id });
  }
}

/** Install the fever hooks on a battle (idempotent). */
export function installFever(battle) {
  const meta = S.battleStore(battle, 'mujica:fever:meta', () => ({ installed: false }));
  if (meta.installed) return;
  meta.installed = true;

  // Charge: any damage a member deals to an enemy (+3 per instance, cap 450; paused during fever).
  battle.on('damaged', (c) => {
    if (!c.source || !c.target || c.target.side !== 'enemy' || !(c.amount > 0)) return;
    const st = feverOf(battle, c.source);
    if (!st || st.active) return;
    st.value = Math.min(FEVER_MAX, st.value + FEVER_CHARGE);
    const pct = (st.value / FEVER_MAX) * 100;
    for (const u of S.bondMembers(battle, st.pid, 'aveMujicaShip', { fieldOnly: true })) {
      u.mem = u.mem || {};
      u.mem.gauges = u.mem.gauges || {};
      u.mem.gauges.fever = pct;
    }
  });

  // Trigger: a member's skill activation at >= 50 % starts team fever.
  battle.on('skillStart', (c) => {
    const st = feverOf(battle, c.unit);
    if (!st || st.active || st.value < FEVER_TRIGGER) return;
    startFever(battle, st);
  });

  battle.on('tick', ({ dt }) => {
    const all = S.battleStore(battle, 'mujica:fever', () => new Map());
    for (const st of all.values()) if (st.active) feverTick(battle, st, dt);
  });

  // 残月的余响: members do not retreat from fatal damage during fever (Sakiko with S3 selected on field).
  battle.on('fatal', (c) => {
    if (c.prevented || !c.unit || c.unit.side !== 'ally' || !c.unit.alive) return;
    const st = feverOf(battle, c.unit);
    if (!st?.active || !sakikoS3OnField(battle, st.pid)) return;
    c.prevented = true;
    st.undied.add(c.unit);
  }, { priority: 10 });
}
