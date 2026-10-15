// tools/limbus/apply-model-tweaks.mjs — apply mods/limbus-company/data/model-tweaks.json into the spine entries of
// BOTH the limbus mod fragment (mods/limbus-company/data/assets.json, persistent) and the live data/assets.json
// (what the server serves). Modular: when you add a new identity skin, add it as a new skin under the char in
// assets.json, add/keep a tweak entry here, and re-run this — the char-level entry covers the base + every skin.
//
//   key "char_limbus_x"            → applies to that char's base spine.front/back AND every skin's spine.front/back
//   key "char_limbus_x@skin#id"    → overrides just that one skin (processed after char-level)
//   fields: modelScale, modelOffsetX, modelOffsetY (any subset; omitted fields are left untouched)
import fs from 'node:fs';

const CONFIG = 'mods/limbus-company/data/model-tweaks.json';
const TARGETS = ['mods/limbus-company/data/assets.json', 'data/assets.json'];
const FIELDS = ['modelScale', 'modelOffsetX', 'modelOffsetY'];

const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
const entries = Object.entries(cfg).filter(([k]) => !k.startsWith('_'));
// char-level first, then @skin overrides win
entries.sort((a, b) => (a[0].includes('@') ? 1 : 0) - (b[0].includes('@') ? 1 : 0));

function applyToSpine(spine, tweak) {
  if (!spine || typeof spine !== 'object') return 0;
  let n = 0;
  for (const side of ['front', 'back']) {
    const s = spine[side];
    if (!s || typeof s !== 'object') continue;
    for (const f of FIELDS) if (f in tweak) { s[f] = tweak[f]; n++; }
  }
  return n;
}

for (const file of TARGETS) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const chars = doc.chars || {};
  let touched = 0;
  for (const [key, tweak] of entries) {
    const [charId, skinId] = key.split('@');
    const ch = chars[charId];
    if (!ch) { console.log(`  ${file}: ${charId} not found — skipped`); continue; }
    if (skinId) {
      applyToSpine(ch.skins?.[`${charId}@${skinId}`]?.spine, tweak);
    } else {
      applyToSpine(ch.spine, tweak);                                   // base model
      for (const sk of Object.values(ch.skins || {})) applyToSpine(sk.spine, tweak); // every skin
    }
    touched++;
  }
  fs.writeFileSync(file, JSON.stringify(doc) + '\n');
  console.log(`  ${file}: applied ${touched} tweak ent(ies)`);
}
console.log('done. restart server + hard-refresh to see it.');
