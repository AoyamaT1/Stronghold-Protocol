// server/match/match/pause.js — Match methods: the solo pause (g.pause, DESIGN §14 "Solo pause") — freeze, resume
// (every clock and deadline shifted by the pause), the drop at the battle phase's end, and the field clocks' "now".
// Installed on Match.prototype by server/match/Match.js (a method container: never instantiated; `this` is the match).

import { PHASE, ERR } from '../../../shared/constants.js';
import { msg } from '../../../shared/i18n.js';
import { BOSS_CLOCK_MS, FLOW_TICKER_PRIORITY, OK, fail } from './common.js';

export class MatchPause {
  /**
   * Pause (official PauseUp / ResumeUp; DESIGN §14 "Solo pause"): g.pause { on } freezes the running battle — the
   * field clock (b.start `elapsed`, the boss budgets and overtime), the result deadline / server release timers, the
   * boss clock, the HUD `deadline` / `overtimeAt` (shifted by the pause on resume) and the server-run pacers
   * (FieldRunner / HeadlessPacer skip their intervals) — and the browser's runner stops its local clock while
   * `m.public.paused` is true.
   * Solo matches by default; co-op battles also supported when config.coopPause is enabled.
   */
  setPause(ps, on) {
    const allowCoop = !this.isSolo && Boolean(this.gd && this.gd.config && this.gd.config.coopPause);
    if (!this.isSolo && !allowCoop) return fail(ERR.WRONG_PHASE, 'co-op battles never pause');
    if (ps && ps.alive === false) return fail(ERR.WRONG_PHASE, 'eliminated players cannot pause');
    if (!on) { this._resume(ps); return OK; }
    if (this.paused) return OK;
    const battlePhase = this.phase === PHASE.COMBAT || (allowCoop && this.phase === PHASE.UNITE) || this.phase === PHASE.FINAL_ASSAULT || this.phase === PHASE.HIDDEN_CORE;
    if (!battlePhase || this._finalEnding || !this.fields.some((f) => f.live && !f.done)) return fail(ERR.WRONG_PHASE, 'no battle running');
    this.paused = true;
    this._pausedAt = this.sched.now();
    this._pausedByName = ps?.name || null;
    this._pausedById = ps?.playerId || null;
    for (const f of this.fields) {
      if (!f.cc) continue;
      if (f.deadlineTimer) { this.cancel(f.deadlineTimer); f.deadlineTimer = null; f.rearmDeadline = true; }
      if (f.doneTimer) { this.cancel(f.doneTimer); f.doneTimer = null; f.rearmRelease = true; }
    }
    if (this._bossClock) { this.cancel(this._bossClock); this._bossClock = null; }
    if (allowCoop) {
      this.tickerText(msg('{name} 暂停了游戏', { name: ps?.name || '玩家' }), FLOW_TICKER_PRIORITY);
    }
    this.markPublic();
    return OK;
  }

  /** End a pause: every clock and deadline moves on by the paused time (no-op when not paused). */
  _resume(ps = null) {
    if (!this.paused) return;
    const allowCoop = !this.isSolo && Boolean(this.gd && this.gd.config && this.gd.config.coopPause);
    const d = Math.max(0, this.sched.now() - this._pausedAt);
    this.paused = false;
    this._pausedAt = 0;
    this.pausedMs += d;
    if (this.deadline) this.deadline += d;
    if (this.overtimeAt) this.overtimeAt += d;
    if (this._bossStartAt != null) this._bossStartAt += d;
    for (const f of this.fields) {
      if (!f.cc || f.done) continue;
      f.startAt += d;
      f.lastProgressAt += d;
      if (f.rearmDeadline && f.mode === 'client') this._armDeadline(f);
      if (f.rearmRelease && f.mode === 'server') this._armRelease(f);
      f.rearmDeadline = false;
      f.rearmRelease = false;
    }
    if (this._bossClockOn && !this._bossClock && (this.phase === PHASE.FINAL_ASSAULT || this.phase === PHASE.HIDDEN_CORE)) {
      this._bossClock = this.later(BOSS_CLOCK_MS, () => this._bossClockTick());
    }
    if (allowCoop && (ps || this._pausedByName)) {
      const name = ps?.name || this._pausedByName || '玩家';
      this.tickerText(msg('{name} 继续了游戏', { name }), FLOW_TICKER_PRIORITY);
    }
    this._pausedByName = null;
    this._pausedById = null;
    this.markPublic();
  }

  /** The battle phase is over: drop the pause without shifting anything (its timers are gone). */
  _clearPause() {
    if (!this.paused) return;
    this.pausedMs += Math.max(0, this.sched.now() - this._pausedAt);
    this.paused = false;
    this._pausedAt = 0;
    this._pausedByName = null;
    this._pausedById = null;
    this.markPublic();
  }

  /** The field clocks' "now": frozen at the pause instant while paused. */
  _clockNow() { return this.paused ? this._pausedAt : this.sched.now(); }
}
