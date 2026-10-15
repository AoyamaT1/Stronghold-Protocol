// mods/rhodes/sim/kits.js — 罗德岛 mod kit registry (this repo's convention: copied to
// server/sim/content/mods/rhodes/kits.js, its default export merged into the global KITS by
// server/sim/content/index.js alongside the other mods).
//
// Aggregates one file per operator under ./ops/. Each ops/*.js is the Rhodes 1.4.0 payload kit ported verbatim;
// the only edits are import paths fixed for this deeper location (../../../kits/shared/… and ../../../../<sim>.js).
// kalts2 is intentionally NOT here yet — its char_1052_kalts2 + token_10068_kalts2_mtship collide with the recruits
// mod; port it after reconciling those ids. savage (char_230_savage) ships as data only and uses the generic kit.

import amiya3 from './ops/amiya3.js';
import ascln from './ops/ascln.js';
import closur from './ops/closur.js';
import logos from './ops/logos.js';
import monstr from './ops/monstr.js';

export default Object.assign({}, amiya3, ascln, closur, logos, monstr);
