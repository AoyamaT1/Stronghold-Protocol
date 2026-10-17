# AGENTS.md

## What this repo is

Unofficial fan remake of Arknights "Stronghold Protocol: Alliance" (auto-chess tower defense). One persistent Node server (`server/index.js`, HTTP + WebSocket at `/ws`, port 3000, `HOST` defaults to `::`) serves a bundler-free browser client (`public/` = native ES modules; PixiJS + pixi-spine, three.js, Preact + htm). Combat is simulated **in each player's browser**; the server only runs the lobby, economy, and match turn state.

- **Not a git repo.** This tree is a deployed build = upstream master + 4 unmerged PRs (see `这个目录是什么-先看这里.md`). `backup-pre-*/`, `update/`, `dist/`, `node_modules/` are install artifacts — don't treat them as source.
- `MANIFEST.json` hashes all program files; the updater verifies it at startup and prompts for a full re-download if files were changed. Don't regenerate it by hand.
- Node 22 or 24 (`engines` in package.json).

## Commands

There is **no** `npm test` / `npm run lint` / `npm run golden:update` script here, even though the upstream README references them. Run tests directly:

```bash
node --test                                    # full suite (~3000+ tests); env-gated suites auto-skip
node --test test/render/*.test.js              # render layer only
GOLDEN_FULL=1 node --test test/golden.test.js  # full golden corpus (default = fast subset)
node tools/golden.mjs --update                 # recompute test/golden/*.json
node tools/setup.mjs --check                   # asset completeness — must report 0 missing
node tools/doctor.mjs                          # env diagnostics (packages, assets, port, LAN)
node --watch server/index.js                   # npm run dev
```

- E2E/render-browser suites need flags: `SP_E2E=1` (Chrome), `SP_REAL_E2E=1` (Chrome + downloaded assets), `RENDER_E2E=1`.
- `npm install` postinstall runs `tools/vendor.mjs` (copies pixi/preact/three into `public/vendor/`).

## Golden results

`test/golden/<family>.json` hashes the exact outcome of seeded deterministic scenarios (`test/golden/README.md`).

- A pure refactor **must not** change these files. If a digest moves, your "refactor" changed behaviour — find why, don't update the file.
- Intended gameplay / data changes: run `node tools/golden.mjs --update` and mention which scenarios moved. Mod data (new chess records) joins the corpus automatically.

## Data & mods pipeline

**Read `docs/模组迁移交接.md` first** — it is the current state, the open problems and the required acceptance
commands for everything below. The short version after the 0.3.0 upgrade (which wiped every 0.2.x mod install):

Mod content now lives in **layers, not in one place**:

- **Plugins** (`plugins/<id>/`, 0.3.0's own system): operators (`chess_x_*`), skills, art/models (`-look` packages),
  garrisons/effects. `plugins/config.json` (server owner policy) lists the ids every new room starts with.
- **The covenant layer** — root `data/bonds.json` (`rhodesShip`/`aveMujicaShip`), `data/effects.json`
  (`bondeffect_*`), `server/sim/content/bonds.js` (loads `./mods/rhodes/bonds.js` + `./mods/aveMujica/bonds.js`).
  **A plugin cannot add a covenant** (`shared/plugins/patch.js` `RECORD_MAPS` has no `bonds`) — this layer is the
  documented exception to "keep root data official" (docs/更新规范.md §一.3) and an official upgrade will overwrite it.
- **The old `mods/<mod>/` pipeline** (`node tools/mod.mjs install <mod>` → merges into root `data/`) still exists and
  is still the source of truth for mod sim code, but its data merges were cleared by the upgrade: only the mods
  listed in `docs/模组迁移交接.md` are back, and only at the covenant layer.

Rules:

- After editing any `mods/<mod>/sim/**` sync the deployed copy (`server/sim/content/mods/<Mod>/`) and **restart the
  server** — `data/*.json` is read dynamically per request, but server JS modules are not.
- `data/*.json` came from upstream (`tools/build-data.mjs`): don't hand-edit upstream entries; plugin content goes in
  a plugin, covenant content in the two tables named above (keep the mod fragment in `mods/<mod>/data/` in sync).
- Any plugin change: `node tools/plugin.mjs check` (a bad manifest is only one line in the start log and the plugin is
  silently skipped) — then the acceptance commands in `docs/模组迁移交接.md` §四, real browser included.

## assets.json red line

**Never register a path in `data/assets.json` or `mods/*/data/assets.json` that doesn't exist on disk.**

Startup (`tools/setup.mjs`) scans every entry; one missing file makes the launcher treat the whole asset set as broken and retry downloading it from the upstream repo forever (the known "1/8939 … 0.00 MB/s" hang that bricks the game). The engine degrades gracefully for missing art (procedural standees, icons) — missing art is fine, listed-but-absent art is not.

- Schema: skill icons are `"skills": { "<skillId>": "/assets/skill/<id>.png" }` — plain string values, no nesting, no `skill_icon_` prefix.
- After any data/asset change run `node tools/setup.mjs --check` (0 missing required).

## Server vs browser edits

- `scripts/launch.mjs` sees port 3000 occupied and prints "already running", **skipping the restart**. After server-side changes, kill the old node process fully (`Stop-Process`), restart, then verify the `build` tag changed via `curl http://localhost:3000/healthz`.
- The build tag is computed once at server start and gates client hot-reload (`buildGuard.js`).
- Static files are **not** cached server-side (`Cache-Control: no-cache` + ETag): changes under `public/js/**` take effect with a browser Ctrl+F5, no restart needed.
- After touching rendering modules, sanity-check module syntax: `node -e "import('./public/js/render/app.js').then(()=>console.log('OK'))"`. (A duplicated-appended `public/js/render/units.js` once destroyed rendering for everyone.)

## Multi-agent coordination — read AGENT-COORD.md first

Several agent windows edit this worktree concurrently. `AGENT-COORD.md` is the law here:

- Claim shared/engine files in §2 before editing; append to §4 after — §4 entries must carry **files → acceptance command → pasted real output → what is left / known red** (the format is in `docs/模组迁移交接.md` §四; a claim without output counts as not done).
- Never revert the §3 protected invariants (pool weighting, SAKIKO/AVEMUJICA kit ordering, `ai.js` noAttack flags, `coop-pause`, the 0.3.0 covenant layer, …).
- `mods/limbus-company/sim/kits.js` and `data/chess.json` are shared: **never whole-file Write** — scope edits to your key (e.g. only `*_rodion_*`), re-read before each edit, append single keys to `STACKS`.

## Engine facts agents keep getting wrong

(Each of these cost real debugging time — see AGENT-COORD §4 for file:line evidence.)

- There is **no** `beforeDamage` / `afterDamage` event; real hooks are `hit`, `hpDamage`, `damaged`, `fatal`, `kill`, `tick`. Listeners on the dead ones are silent no-ops.
- `onTick` fires every sim step = **30×/sec** — timers written for per-second are ~15× too strong.
- `attack.atkScale` must be a **number**; a function evaluates to NaN → the attack deals 0 damage. Dynamic scaling goes in `dmgMul` (may be a function).
- Battle units have no `.chess` field; faction checks must use `unit.def?.raw?.nationId`.
- Skill/bond APIs: `S.gainLayers(battle, { playerId, bonds, n, ... })` (object arg), `S.isMember(battle, unit, bondId)`. Pass positional args and layers silently never increase.
- Unregistered fx kinds render as generic sparks — new effects must be added to `FX_KINDS` in `public/js/render/fx/kinds.js`.
- Skill `desc` must not contain full-width parentheses（）— a mod test enforces this.
- Changing `profession` on a chess record requires changing the whole set (`subProfessionId`, `position`, `attackKind`, `dmgType`, `rangeGrid`, `blockCnt`, trait) — `resolveProfile` only lets the record override `dmgType`/`attackKind`; profession-unique fields (`heal`, `noAttack`, `blockFly`) always apply.

## Known-failure baseline

Don't chase failures that were already red before your change; don't "fix" them in passing.

- `RENDER-FAILURES.md` lists ~18 pre-existing render test failures with per-item root causes. Read it before touching the render layer.
- Also pre-existing (verified by A/B experiments): 4 in `test/ui/audio.test.js`, 1 carryState assertion in `test/sim/skills.test.js` (engine intentionally doesn't carry skill state across phases), and 3 battle/combat cases (deploy order / stun / cold).
- Red since the 0.3.0 plugin migration (see `docs/模组迁移交接.md` §二.5 — report them as they are, don't claim green): `test/mods/aveMujica.test.js` 6/6 (it reads the mod chess from root `data/chess.json`; those are plugin content now), `test/mods/assistTopbond.test.js` (`topCoreBondByLayers` + `config.assist` still missing), `test/match/diy-bonds.test.js` 2 (red before the migration too).

## Conventions

- Docs are written in Simplified Chinese; code and code comments in English.
- Operator design must follow `docs/干员设计指南.md` tier DPS/HP/DEF caps (a reviewer will check).
- Key references: `docs/SIM.md` (battle sim), `docs/META.md` (match/economy), `docs/ARCHITECTURE.md` (upstream GitHub — not in this tree), `docs/DEPLOY.md`.
