// server/sim/content/index.js — installs all content into a Battle (DESIGN §7).
//
// installContent(battle, { mode }) — applies the per-battle loadout data view (simdata withUnitLoadouts; DESIGN §16),
//   then mode 'full' (default): hand-authored kits (kits/index.js: one file per kit in kits/ops/) with generic
//   fallback + every domain module's install(battle); 'generic': generic kits only, no domain modules;
//   'none': no kits (units never cast skills) and no modules. Every module install runs inside try/catch:
//   a faulty content module is logged and skipped, never crashing the battle.
// setupUnitKit(battle, unit, mode) — resolves a unit's Kit: kits[baseChessId]?.(bb, chess, def) ?? generic.
//   Battle opts.kits ({ [baseChessId]: kitFn }) take precedence (tests / sandboxes).
//   补位 stand-ins (isStandInDef: the def of simdata getStandIn — the chess's ids, another character's body): the kit is
//   kits[def.charId] (the stand-in's own, kits/ops/standin-<codename>.js), never the chess id's — that is the replaced
//   operator's kit; without one, the generic kit plus the talents it can apply exactly (generic.js genericTalents).
//   A stand-in has no default skill: its kit authors every skill it supports in `skills` (selectSkillSpec).
//   自选 pieces (isDiyDef: the def of simdata getDiy — a DIY slot's ids, the picked operator's body) take their kit the
//   same way: kits[def.charId] (an owned 6★'s kits/ops/op-<codename>.js, a prototype's standin-<codename>.js), else the
//   generic kit plus genericTalents; no default skill either (the pick chooses any of the three).
//   Operator loadouts (DESIGN §16): the def is resolved for the unit's selected skill / module (simdata getChess), so
//   the kit receives `chess.skill` = the SELECTED skill record and `bb` = its blackboard (talents / trait / module of
//   the selected module). Kit contract (backward compatible): `{ skill?, skills?: { [skillId]: SkillSpec }, talents,
//   trait, install? }` — the skill spec is `skills[selectedSkillId]` when the kit authors it, else `skill` only when
//   the selected skill is the chess's default one, else the GENERIC spec of the selected skill (its generic install,
//   e.g. counter damage, is chained after the kit's). Talents / trait / install of the kit always apply.
//   syncUnitLoadout (called first, before the battle starts): a unit whose def lacks the loadout of its own input entry
//   (id-only data lookups in a multi-player field; an entry without loadout fields = the default) is given its own
//   def; summon pieces follow their owner (an inline `def` of a token entry is kept). Summons spawned AFTER the start
//   are resolved by Battle (getToken(id, owner.defId, owner.def.loadout)), not here.
// registerAllMeta(registry) — calls each domain module's registerMeta(registry) (prep side, server boot).

import { genericKit, genericTalents } from './generic.js';
import { EXTENSIONS, installExtensions } from './extensions.js';
import { compileDsl } from './dsl/compile.js';
import { validateSkillSpec, matchesSchema, MODS_SCHEMA } from '../../../shared/plugins/skillSpec.js';
import { withUnitLoadouts } from '../simdata.js';
import { isPotential } from '../../../shared/potential.js';

// Content files are loaded with guarded dynamic imports: a module that fails to load (syntax error, throwing
// top-level code, missing file) is logged and replaced by an empty module instead of breaking the server.
async function safeImport(path) {
  try {
    return await import(path);
  } catch (e) {
    console.error(`[content] failed to load ${path}: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`);
    return {};
  }
}

const KIT_REGISTRY = await safeImport('./kits/index.js');
const LIMBUS_KITS = await safeImport('./mods/limbusCompany/kits.js');
const RHODES_KITS = await safeImport('./mods/rhodes/kits.js');
const AVEMUJICA_KITS = await safeImport('./mods/aveMujica/kits.js');
const SAKIKO_KITS = await safeImport('./mods/sakiko/kit.js');
const FGO_KITS = await safeImport('./mods/fgoRoundTable/kits.js');

const PLUGIN_KIT_ALIASES = {
  // Rhodes mod operators:
  chess_x_rhodes_amiya3_a: RHODES_KITS.default?.chess_rhodes_amiya3_a,
  char_x_rhodes_amiya3: RHODES_KITS.default?.chess_rhodes_amiya3_a,
  char_1037_amiya3: RHODES_KITS.default?.chess_rhodes_amiya3_a,
  chess_x_rhodes_closur_a: RHODES_KITS.default?.chess_rhodes_closur_a,
  char_x_rhodes_closur: RHODES_KITS.default?.chess_rhodes_closur_a,
  chess_x_rhodes_monstr_a: RHODES_KITS.default?.chess_rhodes_monstr_a,
  char_x_rhodes_monstr: RHODES_KITS.default?.chess_rhodes_monstr_a,
  chess_x_rhodes_ascln_a: RHODES_KITS.default?.chess_rhodes_ascln_a,
  char_x_rhodes_ascln: RHODES_KITS.default?.chess_rhodes_ascln_a,
  chess_x_rhodes_logos_a: RHODES_KITS.default?.chess_rhodes_logos_a,
  char_x_rhodes_logos: RHODES_KITS.default?.chess_rhodes_logos_a,
  chess_x_rhodes_kalts2_a: KIT_REGISTRY.OPERATOR_KITS?.char_1052_kalts2 ?? KIT_REGISTRY.KITS?.char_1052_kalts2,
  chess_x_rhodes_kalts2_b: KIT_REGISTRY.OPERATOR_KITS?.char_1052_kalts2 ?? KIT_REGISTRY.KITS?.char_1052_kalts2,
  char_x_rhodes_kalts2: KIT_REGISTRY.OPERATOR_KITS?.char_1052_kalts2 ?? KIT_REGISTRY.KITS?.char_1052_kalts2,

  // Ave Mujica mod operators:
  chess_x_ave_mujica_amoris_a: AVEMUJICA_KITS.default?.chess_char_2_20_a,
  char_x_ave_mujica_amoris: AVEMUJICA_KITS.default?.chess_char_2_20_a,
  char_4185_amoris: AVEMUJICA_KITS.default?.chess_char_2_20_a,
  chess_x_ave_mujica_tmoris_a: AVEMUJICA_KITS.default?.chess_char_3_22_a,
  char_x_ave_mujica_tmoris: AVEMUJICA_KITS.default?.chess_char_3_22_a,
  char_4186_tmoris: AVEMUJICA_KITS.default?.chess_char_3_22_a,
  chess_x_ave_mujica_mortis_a: AVEMUJICA_KITS.default?.chess_char_4_27_a,
  char_x_ave_mujica_mortis: AVEMUJICA_KITS.default?.chess_char_4_27_a,
  char_4183_mortis: AVEMUJICA_KITS.default?.chess_char_4_27_a,
  chess_x_ave_mujica_dolris_a: AVEMUJICA_KITS.default?.chess_char_5_24_a,
  char_x_ave_mujica_dolris: AVEMUJICA_KITS.default?.chess_char_5_24_a,
  char_4184_dolris: AVEMUJICA_KITS.default?.chess_char_5_24_a,
  chess_x_ave_mujica_oblvns_a: SAKIKO_KITS.default?.char_4182_oblvns ?? AVEMUJICA_KITS.default?.chess_char_6_21_a,
  char_x_ave_mujica_oblvns: SAKIKO_KITS.default?.char_4182_oblvns ?? AVEMUJICA_KITS.default?.chess_char_6_21_a,
  char_4182_oblvns: SAKIKO_KITS.default?.char_4182_oblvns ?? AVEMUJICA_KITS.default?.chess_char_6_21_a,

  // Limbus Company mod operators:
  chess_x_limbus_company_yisang_a: LIMBUS_KITS.default?.chess_char_1_limbus_yisang_a,
  char_x_limbus_company_yisang: LIMBUS_KITS.default?.char_limbus_yisang,
  chess_x_limbus_company_faust_a: LIMBUS_KITS.default?.chess_char_2_limbus_faust_a,
  char_x_limbus_company_faust: LIMBUS_KITS.default?.char_limbus_faust,
  chess_x_limbus_company_sinclair_a: LIMBUS_KITS.default?.chess_char_1_limbus_sinclair_a,
  char_x_limbus_company_sinclair: LIMBUS_KITS.default?.char_limbus_sinclair,
  chess_x_limbus_company_rodion_a: LIMBUS_KITS.default?.chess_char_3_limbus_rodion_a,
  char_x_limbus_company_rodion: LIMBUS_KITS.default?.char_limbus_rodion,
  chess_x_limbus_company_heathcliff_a: LIMBUS_KITS.default?.chess_char_3_limbus_heathcliff_a,
  char_x_limbus_company_heathcliff: LIMBUS_KITS.default?.char_limbus_heathcliff,
  chess_x_limbus_company_meursault_a: LIMBUS_KITS.default?.chess_char_4_limbus_meursault_a,
  char_x_limbus_company_meursault: LIMBUS_KITS.default?.char_limbus_meursault,
  chess_x_limbus_company_honglu_a: LIMBUS_KITS.default?.chess_char_4_limbus_honglu_a,
  char_x_limbus_company_honglu: LIMBUS_KITS.default?.char_limbus_honglu,
  chess_x_limbus_company_ryoshu_a: LIMBUS_KITS.default?.chess_char_5_limbus_ryoshu_a,
  char_x_limbus_company_ryoshu: LIMBUS_KITS.default?.char_limbus_ryoshu,
  chess_x_limbus_company_ishmael_a: LIMBUS_KITS.default?.chess_char_2_limbus_ishmael_a,
  char_x_limbus_company_ishmael: LIMBUS_KITS.default?.char_limbus_ishmael,
  chess_x_limbus_company_outis_a: LIMBUS_KITS.default?.chess_char_5_limbus_outis_a,
  char_x_limbus_company_outis: LIMBUS_KITS.default?.char_limbus_outis,
  chess_x_limbus_company_donquixote_a: LIMBUS_KITS.default?.chess_char_6_limbus_donquixote_a,
  char_x_limbus_company_donquixote: LIMBUS_KITS.default?.char_limbus_donquixote,
  chess_x_limbus_company_gregor_a: LIMBUS_KITS.default?.chess_char_6_limbus_gregor_a,
  char_x_limbus_company_gregor: LIMBUS_KITS.default?.char_limbus_gregor,

  // FGO Round Table mod operators:
  chess_x_fgo_round_table_gareth_a: FGO_KITS.default?.chess_fgo_1_gareth_a,
  char_x_fgo_round_table_gareth: FGO_KITS.default?.chess_fgo_1_gareth_a,
  chess_x_fgo_round_table_bedivere_a: FGO_KITS.default?.chess_fgo_2_bedivere_a,
  char_x_fgo_round_table_bedivere: FGO_KITS.default?.chess_fgo_2_bedivere_a,
  chess_x_fgo_round_table_tristan_a: FGO_KITS.default?.chess_fgo_2_tristan_a,
  char_x_fgo_round_table_tristan: FGO_KITS.default?.chess_fgo_2_tristan_a,
  chess_x_fgo_round_table_percival_a: FGO_KITS.default?.chess_fgo_3_percival_a,
  char_x_fgo_round_table_percival: FGO_KITS.default?.chess_fgo_3_percival_a,
  chess_x_fgo_round_table_baobhan_a: FGO_KITS.default?.chess_fgo_3_baobhan_a,
  char_x_fgo_round_table_baobhan: FGO_KITS.default?.chess_fgo_3_baobhan_a,
  chess_x_fgo_round_table_gawain_a: FGO_KITS.default?.chess_fgo_4_gawain_a,
  char_x_fgo_round_table_gawain: FGO_KITS.default?.chess_fgo_4_gawain_a,
  chess_x_fgo_round_table_barghest_a: FGO_KITS.default?.chess_fgo_4_barghest_a,
  char_x_fgo_round_table_barghest: FGO_KITS.default?.chess_fgo_4_barghest_a,
  chess_x_fgo_round_table_mash_a: FGO_KITS.default?.chess_fgo_4_mash_a,
  char_x_fgo_round_table_mash: FGO_KITS.default?.chess_fgo_4_mash_a,
  chess_x_fgo_round_table_lancelot_a: FGO_KITS.default?.chess_fgo_5_lancelot_a,
  char_x_fgo_round_table_lancelot: FGO_KITS.default?.chess_fgo_5_lancelot_a,
  chess_x_fgo_round_table_mordred_a: FGO_KITS.default?.chess_fgo_5_mordred_a,
  char_x_fgo_round_table_mordred: FGO_KITS.default?.chess_fgo_5_mordred_a,
  chess_x_fgo_round_table_melusine_a: FGO_KITS.default?.chess_fgo_5_melusine_a,
  char_x_fgo_round_table_melusine: FGO_KITS.default?.chess_fgo_5_melusine_a,
  chess_x_fgo_round_table_artoria_a: FGO_KITS.default?.chess_fgo_6_artoria_a,
  char_x_fgo_round_table_artoria: FGO_KITS.default?.chess_fgo_6_artoria_a,
  chess_x_fgo_round_table_merlin_a: FGO_KITS.default?.chess_fgo_6_merlin_a,
  char_x_fgo_round_table_merlin: FGO_KITS.default?.chess_fgo_6_merlin_a,
  chess_x_fgo_round_table_castoria_a: FGO_KITS.default?.chess_fgo_6_castoria_a,
  char_x_fgo_round_table_castoria: FGO_KITS.default?.chess_fgo_6_castoria_a,
  chess_x_fgo_round_table_morgan_a: FGO_KITS.default?.chess_fgo_6_morgan_a,
  char_x_fgo_round_table_morgan: FGO_KITS.default?.chess_fgo_6_morgan_a,
};

const DOMAIN_NAMES = ['tokens', 'devices', 'enemies', 'bosses', 'bonds', 'garrisons', 'items', 'bands', 'choices'];
const DOMAINS = await Promise.all(DOMAIN_NAMES.map((n) => safeImport(`./${n}.js`)));
const tokens = DOMAINS[0];

/**
 * Merged kit registry: baseChessId → (bb, chess, def) => Kit, then the 补位 stand-in kits: stand-in charId → builder
 * (kits/index.js; each kit file is loaded guarded too)
 */
export const KITS = Object.freeze(Object.assign(
  {},
  KIT_REGISTRY.KITS ?? {},
  LIMBUS_KITS.default ?? {},
  RHODES_KITS.default ?? {},
  FGO_KITS.default ?? {},
  AVEMUJICA_KITS.default ?? {},
  SAKIKO_KITS.default ?? {},
  PLUGIN_KIT_ALIASES
));

/** Domain modules in install order: tokens, devices, enemies, bosses, bonds, garrisons, items, bands, choices. */
export const MODULES = Object.freeze(DOMAIN_NAMES.map((n, i) => [n, DOMAINS[i]]));

/**
 * Whether `def` is a 补位 stand-in: a chess fielded with another character's body (simdata getStandIn — `standInFor` =
 * the replaced operator's charId, `charId` = the stand-in's, which differ).
 */
export function isStandInDef(def) {
  return !!(def && def.standInFor && def.charId && def.charId !== def.standInFor);
}

/**
 * Whether `def` is a 自选 piece: a DIY slot fielded with a picked operator's body (simdata getDiy — `diyFor` = the slot's
 * base id, `charId` = the operator's).
 */
export function isDiyDef(def) {
  return !!(def && def.diyFor && def.charId);
}

/** A def whose body is another character than its chess id names (补位 stand-in, 自选 piece): its kit is keyed by charId. */
const isOtherBody = (def) => isStandInDef(def) || isDiyDef(def);

/**
 * The kit builder of an operator def in `reg` ({ [key]: (bb, chess, def) => Kit }), or undefined. A stand-in's and a
 * 自选 piece's kit is keyed by its charId (`char_609_acguad`, `char_112_siege`) and by nothing else: the chess id it keeps
 * names the replaced operator's kit (a DIY slot has none). Any other def: baseId (`…_a`, data/SIM.md), the exact id, or
 * the suffix-less id of DESIGN §5.6's example.
 */
function registeredKit(def, reg) {
  if (!def || !reg) return undefined;
  if (isOtherBody(def)) return Object.prototype.hasOwnProperty.call(reg, def.charId) ? reg[def.charId] : undefined;
  const bare = String(def.baseId ?? def.id ?? '').replace(/_[ab]$/, '');
  return [def.baseId, def.id, bare].map(k => Object.hasOwn(reg, k) ? reg[k] : undefined).find(Boolean);
}

/** Official kit key or file stem; no path supplied by a plugin is ever imported. */
export function officialKit(ref) {
  if (Object.hasOwn(KITS, ref)) return KITS[ref];
  const file = Object.values(KIT_REGISTRY.KIT_FILES || {}).flat().concat(KIT_REGISTRY.STANDIN_KIT_FILES || [], KIT_REGISTRY.OPERATOR_KIT_FILES || [])
    .find(f => f.replace(/\.js$/, '') === ref);
  if (!file) return undefined;
  const stem = file.replace(/\.js$/, '');
  if (stem.startsWith('chess_')) return KITS[stem.split('-')[0] + '_a'];
  const code = stem.replace(/^(op|standin)-/, '');
  return Object.entries(KITS).find(([k]) => k.startsWith('char_') && k.endsWith('_' + code))?.[1];
}

/**
 * [ASSUMED] A one-skill DIY or stand-in uses that kit's default skill (DESIGN §32.5). Multi-skill clones keep
 * explicit `skills[id]` so selectSkillSpec does not treat the default spec as every selected skill.
 */
function bindDefaultSkill(k, chess, d) {
  if (k?.skill && isOtherBody(d) && chess?.skills?.length === 1 && d?.skill?.id && !k.skills?.[d.skill.id]) {
    return { ...k, skills: { ...(k.skills || {}), [d.skill.id]: k.skill } };
  }
  return k;
}

/** C2 order: extension → DSL → JSON SkillSpec → kitRef → official → generic. */
export function kitOf(def, reg = KITS) {
  if (!def) return undefined;
  // Explicit Battle opts.kits retain their existing precedence and lookup-only semantics.
  if (reg !== KITS) return registeredKit(def, reg);
  const ext = registeredKit(def, EXTENSIONS) ?? (def.charId?.startsWith('char_x_') ? EXTENSIONS[def.charId] : undefined);
  if (ext) return ext;
  const raw = def.raw || {};
  if (raw.dsl != null) return (bb, chess, d) => bindDefaultSkill(compileDsl(raw.dsl, { bb, chess, def: d }), chess, d);
  if (raw.skillSpec != null) return (bb, chess, d) => {
    const spec = chess.skill?.skillSpec ?? raw.skillSpec;
    const errors = validateSkillSpec(spec);
    const mods = chess.talentMods ?? {};
    if (errors.length || !matchesSchema(mods, MODS_SCHEMA)) throw Object.assign(new Error('Invalid JSON SkillSpec'), { code: 'PLUGIN_SKILL_SPEC' });
    return { skills: { [d.skill?.id]: spec }, talents: Object.keys(mods).length ? [{ install(b, u) {
      b.addBuff(u, { key: 'talent:plugin', mods, persist: true, allowDead: true });
    } }] : [] };
  };
  if (raw.kitRef != null) {
    const f = officialKit(raw.kitRef);
    if (!f) return undefined;
    return (bb, chess, d) => {
      return bindDefaultSkill(f(bb, chess, d), chess, d);
    };
  }
  return registeredKit(def, KITS);
}

/** The generic kit of an operator def; a stand-in's / 自选 piece's also carries the talents generic.js can apply exactly. */
function fallbackKit(bb, raw, def) {
  const k = genericKit(bb, raw, def);
  if (!isOtherBody(def)) return k;
  const talents = genericTalents(def);
  return talents.length ? { ...k, talents: [...(k.talents ?? []), ...talents] } : k;
}

/** Resolve the Kit of an ally unit. Never throws (falls back to the generic kit). */
export function setupUnitKit(battle, unit, mode = 'full') {
  try { syncUnitLoadout(battle, unit); } catch (e) { battle._handlerError?.('loadout', unit, e); }
  if (mode === 'none') return {};
  const def = unit.def || {};
  const raw = def.raw ?? def;
  const bb = def.skill?.bb ?? {};
  if (unit.kind === 'token') {
    const tk = mode === 'full' ? (tokens.kits?.[def.id] ?? tokens.default?.[def.id]) : null;
    if (typeof tk === 'function') {
      try { const k = tk(bb, raw, def); if (k) return k; } catch (e) { battle._handlerError(`tokenKit:${def.id}`, unit, e); }
    }
    return def.skill ? genericKit(bb, raw, def) : {};
  }
  if (unit.kind !== 'op') return {};
  const injected = battle.opts && battle.opts.kits;
  if (mode === 'full' || injected) {
    const f = kitOf(def, injected) ?? (mode === 'full' ? kitOf(def, KITS) : undefined);
    if (typeof f === 'function') {
      try {
        const k = f(bb, raw, def);
        if (k) return selectSkillSpec(k, bb, raw, def);
      } catch (e) {
        const dslCode = typeof e?.code === 'string' && /^PLUGIN_DSL_[A-Z0-9_]+$/.test(e.code);
        // A record that carries DSL, or a throw whose code is a DSL problem, is a corrupt content set.
        // Do not substitute the generic kit or an empty kit (DESIGN §32.7). Any other throw still falls back.
        // Matched as a pattern, not a quoted PLUGIN_* name: the error catalogue scans those strings.
        if (dslCode || raw.dsl != null) {
          if (e && typeof e === 'object') {
            e.contentFault = true;
            if (typeof e.code === 'string' && !String(e.message || '').includes(e.code)) e.message = `${e.code} ${e.message || ''}`.trim();
          }
          battle.contentFault = {
            layer: 'setupUnitKit',
            code: typeof e?.code === 'string' ? e.code : 'PLUGIN_DSL_SHAPE',
            message: String(e?.message || e),
          };
          throw e;
        }
        battle._handlerError(`kit:${isOtherBody(def) ? def.charId : def.baseId}`, unit, e);
      }
    }
  }
  return fallbackKit(bb, raw, def);
}

/** A unit's own PlayerBattleInput entry (operators: kind ≠ 'token'; tokens: kind 'token'), or null. */
function inputEntry(unit) {
  const list = unit && unit.player && unit.player.input && Array.isArray(unit.player.input.units) ? unit.player.input.units : null;
  if (!list || unit.uid == null) return null;
  const tok = unit.kind === 'token';
  return list.find((v) => v && v.uid === unit.uid && (v.kind === 'token') === tok) ?? null;
}

/**
 * The loadout `{ skillIndex, moduleId }` a unit's PlayerBattleInput entry gives; an entry without loadout fields means
 * the DEFAULT loadout (`{}`), never "whatever the data view maps this chess id to" (another player's choice in a
 * multi-player field). `standIn: true` rides along (补位: the stand-in def whatever the skill / module fields say), as
 * do `diy` (自选: the pick of a DIY slot's piece) and `potential` (0.2.2: 1–6, never a stand-in's). Null when the unit
 * has no input entry.
 */
function inputLoadout(unit) {
  const x = inputEntry(unit);
  if (!x) return null;
  const extra = {
    ...(x.standIn === true ? { standIn: true } : null),
    ...(x.diy && typeof x.diy === 'object' ? { diy: x.diy } : null),
    ...(x.standIn !== true && isPotential(x.potential) ? { potential: x.potential } : null),
  };
  if (x.skillIndex == null && x.moduleId == null) return extra;
  return { skillIndex: x.skillIndex ?? null, moduleId: x.moduleId ?? null, ...extra };
}

/** Put a def on a not-yet-deployed ally (the fields Battle._makeAlly takes from the def). */
function swapDef(unit, def) {
  const st = def.stats;
  unit.def = def;
  unit.defId = def.id;
  unit.name = def.name;
  unit.rangeGrid = def.rangeGrid;
  Object.assign(unit.base, {
    maxHp: st.maxHp, atk: st.atk, def: st.def, res: st.res, aspd: st.aspd, bat: st.bat, blockCnt: st.blockCnt,
    spRecovery: st.spRecovery, tauntLevel: st.tauntLevel, massLevel: st.massLevel, hpRecoveryPerSec: st.hpRecoveryPerSec,
    cost: st.cost, respawnTime: st.respawnTime,
  });
  unit.markDirty?.();
  unit.hp = unit.s ? unit.s.maxHp : st.maxHp;
}

/**
 * Loadout exactness (DESIGN §16) before the battle starts: an operator whose def does not carry the loadout of its own
 * PlayerBattleInput entry (the per-battle data view resolves id-only lookups per chess id — two players of one field
 * may give the same chess different loadouts) gets the def of its own loadout — an entry without loadout fields means
 * the default — and a summon piece follows its owner's (unless its entry carries an inline `def`). A no-op when the def
 * already matches (Battle passing the unit's loadout to getChess / getToken).
 */
export function syncUnitLoadout(battle, unit) {
  if (!battle || battle.started || !unit || unit.deployed || !unit.def || !battle.data) return;
  if (unit.kind === 'op') {
    const lo = inputLoadout(unit);
    if (!lo || typeof battle.data.getChess !== 'function') return;
    // an entry without loadout fields only needs a look when the def carries a non-default loadout
    if (!Object.keys(lo).length && !(unit.def.loadout && unit.def.loadout.isDefault === false)) return;
    const want = battle.data.getChess(unit.def.id, lo);
    if (want && want !== unit.def && want.id === unit.def.id) swapDef(unit, want);
  } else if (unit.kind === 'token' && unit.ownerUnit && unit.ownerUnit.kind === 'op' && typeof battle.data.getToken === 'function') {
    // an explicit inline def of the input entry (Battle `_tokenDef(id, owner, inp.def)`) is never replaced
    if (inputEntry(unit)?.def) return;
    const owner = unit.ownerUnit;
    syncUnitLoadout(battle, owner);
    if (!owner.def || !owner.def.loadout) return;
    const want = battle.data.getToken(unit.def.id, owner.def.id, owner.def.loadout);
    if (want && want !== unit.def && want.id === unit.def.id) swapDef(unit, want);
  }
}

/** Id of the selected skill of an operator def (null without a skill). */
const selectedSkillId = (def) => def?.skill?.skillId ?? def?.skill?.id ?? def?.raw?.skill?.skillId ?? def?.raw?.skill?.id ?? null;

/**
 * True when the def's selected skill is the chess's default skill (no loadout info ⇒ default). Never for a stand-in:
 * the skill it fields is the one its chess names (S2 on one chess, S3 on another), so its kit authors each in `skills`;
 * nor for a 自选 piece (the pick chooses any of its skills).
 */
const skillIsDefault = (def) => !isOtherBody(def) && (!def?.loadout || def.loadout.skillIsDefault !== false);

/**
 * The kit with the skill spec of the SELECTED skill (see header): `kit.skills[id]` → `kit.skill` (default skill only;
 * never for a stand-in) → the generic spec. Returns the kit itself when nothing changes; `kit.skillSource` tells which
 * one was used ('skills' | 'kit' | 'generic').
 * @param {object} kit hand-authored kit
 */
export function selectSkillSpec(kit, bb, raw, def) {
  const id = selectedSkillId(def);
  const map = kit && kit.skills && typeof kit.skills === 'object' ? kit.skills : null;
  if (id && map && Object.prototype.hasOwnProperty.call(map, id)) return { ...kit, skill: map[id] ?? null, skillSource: 'skills' };
  const aliasId = id ? id.replace(/^skx_[a-z0-9_]+?_([a-z0-9]+_\d+)$/, 'skchr_$1') : null;
  if (aliasId && map && Object.prototype.hasOwnProperty.call(map, aliasId)) return { ...kit, skill: map[aliasId] ?? null, skillSource: 'skills' };
  const aliasFgo = id ? id.replace(/^skx_fgo_round_table_([a-z0-9]+_\d+)$/, 'skchr_fgo_$1') : null;
  if (aliasFgo && map && Object.prototype.hasOwnProperty.call(map, aliasFgo)) return { ...kit, skill: map[aliasFgo] ?? null, skillSource: 'skills' };
  if (skillIsDefault(def)) return kit;
  const g = genericKit(bb, raw, def);
  const own = typeof kit.install === 'function' ? kit.install : null;
  const gen = typeof g.install === 'function' ? g.install : null;
  const out = { ...kit, skill: g.skill ?? null, skillSource: 'generic' };
  if (own && gen) out.install = (battle, unit) => { own(battle, unit); gen(battle, unit); };
  else if (gen) out.install = gen;
  return out;
}

/**
 * Whether the kit of `def` has a hand-authored spec for its selected skill (tools/kit-coverage.mjs, tests): `skills`
 * entry, or the kit's `skill` for the default skill when the kit is not the generic fallback. Never throws.
 * @returns {'skills'|'kit'|'generic'|'none'} where the spec comes from ('none' = no kit function at all)
 */
export function skillSpecSource(def, kits = KITS) {
  const f = kitOf(def, kits);
  if (typeof f !== 'function') return 'none';
  let k = null;
  try { k = f(def.skill?.bb ?? {}, def.raw ?? def, def); } catch { return 'generic'; }
  if (!k || k.generic) return 'generic';
  const id = selectedSkillId(def);
  const aliasId = id ? id.replace(/^skx_[a-z0-9_]+?_([a-z0-9]+_\d+)$/, 'skchr_$1') : null;
  const aliasFgo = id ? id.replace(/^skx_fgo_round_table_([a-z0-9]+_\d+)$/, 'skchr_fgo_$1') : null;
  if (id && k.skills && (Object.prototype.hasOwnProperty.call(k.skills, id) || (aliasId && Object.prototype.hasOwnProperty.call(k.skills, aliasId)) || (aliasFgo && Object.prototype.hasOwnProperty.call(k.skills, aliasFgo)))) return 'skills';
  return skillIsDefault(def) && k.skill !== undefined ? 'kit' : 'generic';
}

/**
 * Install kits for every ally unit and (mode 'full') every domain module. First, a Battle constructed without the spec
 * path (server-run fields, bot rehearsals, tests) gets the same per-battle loadout data view createBattleFromSpec uses
 * (simdata withUnitLoadouts over its players' inputs), so summons spawned during the battle (`getToken(id, owner)`)
 * and every other id-only lookup resolve the owner's selected skill / module there too (DESIGN §16).
 */
export function installContent(battle, { mode = 'full', extra = null } = {}) {
  try {
    const view = withUnitLoadouts(battle.data, (battle.players || []).map((p) => p && p.input));
    if (view && view !== battle.data) battle.data = view;
  } catch (e) { battle._handlerError?.('loadoutView', null, e); }
  for (const u of battle.allyUnits) {
    if (u.kit) continue;
    try { battle._setupUnit(u); } catch (e) {
      if (e?.contentFault || battle.contentFault) {
        battle._handlerError('content:dsl', u, e);
        throw e;
      }
      battle._handlerError('setupUnit', u, e);
    }
  }
  if (mode === 'full') {
    installExtensions(battle);
    for (const [name, mod] of MODULES) {
      if (typeof mod.install !== 'function') continue;
      try { mod.install(battle); } catch (e) { battle._handlerError(`content:${name}`, null, e); }
    }
  }
  for (const m of extra || []) {
    try { (typeof m === 'function' ? m : m.install)?.(battle); } catch (e) { battle._handlerError('content:extra', null, e); }
  }
}

/** Prep-side registration of every domain module (server boot). */
export function registerAllMeta(registry) {
  for (const [name, mod] of MODULES) {
    if (typeof mod.registerMeta !== 'function') continue;
    try { mod.registerMeta(registry); } catch (e) { console.error(`[content] ${name}.registerMeta failed:`, e); }
  }
}
