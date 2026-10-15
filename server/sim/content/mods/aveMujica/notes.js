// mods/ave-mujica/sim/notes.js — 颂乐音符 (丰川祥子 talent 1): music-note projectiles, contact hits and the
// per-note 无视防御/法抗 stacks shared by every Ave Mujica member.
//
// The 0.1.0 ProjectileSystem only resolves homing shots at arrival (no mid-flight collision), so drifting notes
// (talent notes, S1 fan, pass-through tails) are scanned for contact in a battle 'tick' hook — it runs right after
// ProjectileSystem.update (Battle.js update order: allies → projectiles → … → tickHook), positions are current.
// Note damage snapshots the thrower's ATK × lord rangedScale (0.8) at fire time.
//
// Client rendering (`snap.proj`, rgb(197,62,70) glyphs) is deferred to the 0.2.2 engine/client patch; `visual`
// already carries 'note' / 'noteSkill' for it.
import * as S from '../../support/index.js';

export const NOTE_SPEED = 3.5;        // tiles/s (talent + S1)
export const PIANO_SPEED = 5.0;       // S2 钢琴: 音符飞行速度加快
export const ORGAN_SPEED = 2.2;       // S2 风琴: 飞行速度减缓
export const DRIFT_DIST = 2.5;        // tiles a targetless note travels before fading
export const FADE_DELAY = 1.0;        // s a note lingers after leaving range
export const NOTE_RADIUS = 0.45;      // contact radius for drift hits
export const PASSBY_DIST = 1.5;       // 钢琴 pass-through tail length

const TAU = Math.PI * 2;

function notesState(battle) {
  return S.battleStore(battle, 'mujica:notes', () => ({ installed: false, cfg: { perDef: 0.03, perRes: 0.02, cap: 10 } }));
}

/** Install the note tick hooks on a battle (idempotent). */
export function installNotes(battle) {
  const st = notesState(battle);
  if (st.installed) return;
  st.installed = true;

  battle.on('tick', () => {
    const list = battle.projectiles.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      const nt = p.data && p.data.note;
      if (!nt || p.target) continue; // homing notes resolve via their engine onHit
      // a drifting note dies with its thrower (退场清除非追踪音符)
      if (!p.source || !p.source.alive || !p.source.deployed) { list.splice(i, 1); continue; }
      for (const e of battle.enemies) {
        if (!e.alive || e.hidden || (nt.hit && nt.hit.has(e.id))) continue;
        if (!S.bodyInRadius(e, p.x, p.y, NOTE_RADIUS)) continue;
        battle.dealDamage(nt.source, e, { amount: nt.dmg, type: nt.type, tags: nt.tags });
        if (nt.hit) nt.hit.add(e.id);
        if (!nt.passby) { list.splice(i, 1); break; }
      }
    }
    refreshPierceStacks(battle);
  });
}

/** Module (LOR-Y) level upgrades the pierce numbers: base 3%/2% ×10, module active 4%/2% ×12. */
export function setPierceConfig(battle, unit) {
  const st = notesState(battle);
  const active = !!(unit.def?.module?.active || unit.def?.raw?.module?.active);
  st.cfg = active ? { perDef: 0.04, perRes: 0.02, cap: 12 } : { perDef: 0.03, perRes: 0.02, cap: 10 };
}

/** Lord trait: snapshot multiplier for thrown notes (remote ×0.8 is part of it). */
const noteAtk = (unit) => (unit.s?.atk || 0) * S.num(unit.def?.raw?.trait?.bb?.atk_scale, 0.8);

function forwardVec(unit) {
  const f = S.frontTile(unit, 1);
  let vx = 1, vy = 0; // default RIGHT
  if (Array.isArray(f) && Number.isFinite(f[0]) && Number.isFinite(f[1])) {
    vx = f[1] - unit.tileC; vy = f[0] - unit.tileR;
    const len = Math.hypot(vx, vy);
    if (len > 1e-6) { vx /= len; vy /= len; } else { vx = 1; vy = 0; }
  }
  return [vx, vy];
}

/**
 * Fire a note. opts:
 *   scale      ATK fraction of the hit
 *   type       'arts' | 'phys'
 *   mode       'drift' (straight fan shot) | 'homing' (tracks a target)
 *   target     homing target (homing falls back to drift without one)
 *   angleDeg   drift spread offset (± from the thrower's facing)
 *   speed      tiles/s (default NOTE_SPEED)
 *   passby     钢琴: keep flying through after the first hit (each enemy once)
 *   tags       extra damage tags
 */
export function fireNote(battle, unit, opts = {}) {
  const scale = S.num(opts.scale, 1);
  if (!(scale > 0)) return null;
  const type = opts.type === 'phys' ? 'phys' : 'arts';
  const speed = S.num(opts.speed, NOTE_SPEED);
  const dmg = Math.max(0, noteAtk(unit) * scale);
  const tags = ['mujicaNote', ...(opts.tags || [])];
  const note = { dmg, type, tags, passby: !!opts.passby, hit: new Set() };
  const meta = { note };

  if (opts.mode === 'homing' && opts.target && opts.target.alive && !opts.target.hidden) {
    const dx = opts.target.x - unit.x, dy = opts.target.y - unit.y;
    const len = Math.hypot(dx, dy) || 1;
    const pr = battle.projectiles.add({
      from: { x: unit.x, y: unit.y },
      target: opts.target,
      speed,
      visual: opts.visual ?? 'noteSkill',
      source: unit,
      data: meta,
      onHit: ({ target, x, y, projectile }) => {
        if (target && target.alive) {
          battle.dealDamage(unit, target, { amount: dmg, type, tags });
          note.hit.add(target.id);
        }
        if (note.passby) spawnDrift(battle, unit, { x, y }, projectile, speed, note, PASSBY_DIST);
      },
    });
    pr._dir = { x: dx / len, y: dy / len };
    return pr;
  }

  // drift: straight shot at ±angleDeg from the facing, fades FADE_DELAY after covering DRIFT_DIST
  let [vx, vy] = forwardVec(unit);
  const rad = S.num(opts.angleDeg, 0) * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const dirX = vx * cos - vy * sin, dirY = vx * sin + vy * cos;
  const p = battle.projectiles.add({
    from: { x: unit.x, y: unit.y },
    to: { x: unit.x + dirX * DRIFT_DIST, y: unit.y + dirY * DRIFT_DIST },
    speed,
    visual: opts.visual ?? 'note',
    source: unit,
    data: meta,
    maxAge: DRIFT_DIST / speed + FADE_DELAY,
  });
  p._dir = { x: dirX, y: dirY };
  return p;
}

/** Pass-through tail: keeps the note flying past the hit point (each enemy once). */
function spawnDrift(battle, unit, from, projectile, speed, note, dist) {
  const d = projectile && projectile._dir ? projectile._dir : { x: 1, y: 0 };
  const p = battle.projectiles.add({
    from,
    to: { x: from.x + d.x * dist, y: from.y + d.y * dist },
    speed,
    visual: 'noteSkill',
    source: unit,
    data: { note },
    maxAge: dist / speed + 0.2,
  });
  p._dir = d;
  return p;
}

/**
 * 颂乐音符 stacks: every note in flight gives ALL fielded members 无视防御/法抗 (+3%/+2% per note, cap 10;
 * LOR-Y module active: 4%/2% ×12). Short refresh keeps removal automatic when the last note lands.
 */
function refreshPierceStacks(battle) {
  const st = notesState(battle);
  let n = 0;
  for (const p of battle.projectiles.list) if (p.data && p.data.note) n++;
  if (!(n > 0)) return;
  const stacks = Math.min(n, st.cfg.cap);
  const seen = new Set();
  for (const p of battle.projectiles.list) {
    const src = p.source;
    if (!src || seen.has(src.ownerId) || src.side !== 'ally') continue;
    seen.add(src.ownerId);
    for (const u of S.bondMembers(battle, src.ownerId, 'aveMujicaShip', { fieldOnly: true })) {
      battle.addBuff(u, {
        key: 'mujica:notePierce',
        mods: { defIgnorePct: st.cfg.perDef * stacks, resIgnorePct: st.cfg.perRes * stacks },
        duration: 0.75,
        refresh: 'replace',
        tags: ['mujica'],
      });
    }
  }
}

/** 毋畏遗忘 aura: operators inside Sakiko's attack range get +12 ASPD while she is on the field. */
export function applyAura(battle, unit, aspd = 12) {
  if (!unit.alive || !unit.deployed) return;
  for (const a of battle.allyUnits) {
    if (a.kind !== 'op' || !a.alive || !a.deployed || a.side !== unit.side) continue;
    if (a !== unit && !S.inRange(unit, a)) continue;
    battle.addBuff(a, {
      key: 'mujica:sakikoAura',
      mods: { aspd },
      duration: 0.75,
      refresh: 'replace',
      tags: ['mujica'],
    });
  }
}

export { TAU };
