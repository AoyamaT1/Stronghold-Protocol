#!/usr/bin/env node
// tools/install_fgo_round_table_mod.mjs — Installer and repair toolkit for FGO Round Table Mod
//
// Usage:
//   node tools/install_fgo_round_table_mod.mjs --fix-38f
//   node tools/install_fgo_round_table_mod.mjs install
//   node tools/install_fgo_round_table_mod.mjs uninstall
//   node tools/install_fgo_round_table_mod.mjs status

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOD_ID = 'fgo-round-table';
const MOD_DIR = path.join(ROOT, 'mods', MOD_ID);
const DATA_DIR = path.join(ROOT, 'data');
const SIM_DEST_DIR = path.join(ROOT, 'server', 'sim', 'content', 'mods', 'fgoRoundTable');
const INSTALLED_FILE = path.join(DATA_DIR, 'mods-installed.json');

function readJson(file, def = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return def;
  }
}

function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

function removeDirRecursive(dest) {
  if (!fs.existsSync(dest)) return;
  fs.rmSync(dest, { recursive: true, force: true });
}

export function fix38f() {
  console.log('[fix-38f] Running pre-flight consistency checks & fixes...');
  const chessFile = path.join(DATA_DIR, 'chess.json');
  if (!fs.existsSync(chessFile)) {
    console.error('[fix-38f] Error: data/chess.json does not exist.');
    return false;
  }

  const chessData = readJson(chessFile);
  let changed = false;

  // 1. Check honglu projectile configuration
  for (const id of ['chess_char_4_limbus_honglu_a', 'chess_char_4_limbus_honglu_b']) {
    if (chessData[id]) {
      if (chessData[id].projectile !== 'magic') {
        console.log(`[fix-38f] Aligning ${id}.projectile to 'magic' (was ${chessData[id].projectile})`);
        chessData[id].projectile = 'magic';
        changed = true;
      }
    }
  }

  // 2. Check kalts2 ID isolation
  for (const id of ['chess_custom_5_kalts2_a', 'chess_custom_5_kalts2_b']) {
    if (chessData[id]) {
      if (chessData[id].charId !== 'char_1052_kalts2') {
        console.log(`[fix-38f] Ensuring ${id}.charId is 'char_1052_kalts2'`);
        chessData[id].charId = 'char_1052_kalts2';
        changed = true;
      }
    }
  }

  if (changed) {
    writeJson(chessFile, chessData);
    console.log('[fix-38f] Successfully updated data/chess.json.');
  } else {
    console.log('[fix-38f] All baseline checks passed, no fixes needed.');
  }
  return true;
}

export function installMod() {
  const modJsonFile = path.join(MOD_DIR, 'mod.json');
  if (!fs.existsSync(modJsonFile)) {
    console.error(`[fgo-mod] Error: Mod manifest not found at ${modJsonFile}`);
    process.exit(1);
  }

  fix38f();

  const meta = readJson(modJsonFile);
  console.log(`[fgo-mod] Installing "${meta.name}" (${meta.id} v${meta.version})...`);

  // 1. Copy sim files to server/sim/content/mods/fgoRoundTable
  const simSrc = path.join(MOD_DIR, 'sim');
  if (fs.existsSync(simSrc)) {
    copyDirRecursive(simSrc, SIM_DEST_DIR);
    console.log(`  Copied simulation files to server/sim/content/mods/fgoRoundTable`);
  }

  // 2. Merge bonds.json
  const modBonds = path.join(MOD_DIR, 'data', 'bonds.json');
  if (fs.existsSync(modBonds)) {
    const bondsData = readJson(path.join(DATA_DIR, 'bonds.json'));
    Object.assign(bondsData, readJson(modBonds));
    writeJson(path.join(DATA_DIR, 'bonds.json'), bondsData);
    console.log(`  Merged bonds: ${Object.keys(readJson(modBonds)).join(', ')}`);
  }

  // 3. Merge chess.json & link bonds
  const modChess = path.join(MOD_DIR, 'data', 'chess.json');
  if (fs.existsSync(modChess)) {
    const chessData = readJson(path.join(DATA_DIR, 'chess.json'));
    const modChessObj = readJson(modChess);
    const TIER_PRICES = { 1: 2, 2: 3, 3: 3, 4: 3, 5: 4, 6: 4 };
    for (const c of Object.values(modChessObj)) {
      if (c && c.tier) {
        c.price = TIER_PRICES[c.tier] ?? 3;
        c.sellPrice = 1;
      }
    }
    Object.assign(chessData, modChessObj);
    writeJson(path.join(DATA_DIR, 'chess.json'), chessData);
    console.log(`  Merged ${Object.keys(modChessObj).length} chess records`);

    const bondsData = readJson(path.join(DATA_DIR, 'bonds.json'));
    let bondsChanged = false;
    for (const c of Object.values(modChessObj)) {
      if (!c || c.isGolden || !Array.isArray(c.bonds)) continue;
      for (const bId of c.bonds) {
        if (bondsData[bId]) {
          bondsData[bId].members = bondsData[bId].members || [];
          if (!bondsData[bId].members.includes(c.chessId)) {
            bondsData[bId].members.push(c.chessId);
            bondsChanged = true;
          }
          bondsData[bId].visibleMembers = bondsData[bId].visibleMembers || [];
          if (!bondsData[bId].visibleMembers.includes(c.chessId)) {
            bondsData[bId].visibleMembers.push(c.chessId);
            bondsChanged = true;
          }
        }
      }
    }
    if (bondsChanged) {
      writeJson(path.join(DATA_DIR, 'bonds.json'), bondsData);
      console.log('  Updated bond membership lists for FGO round table chess');
    }
  }

  // 4. Merge items.json, garrisons.json, assets.json
  for (const domain of ['items', 'garrisons']) {
    const modFile = path.join(MOD_DIR, 'data', `${domain}.json`);
    if (!fs.existsSync(modFile)) continue;
    const baseData = readJson(path.join(DATA_DIR, `${domain}.json`));
    const modObj = readJson(modFile);
    Object.assign(baseData, modObj);
    writeJson(path.join(DATA_DIR, `${domain}.json`), baseData);
    console.log(`  Merged ${Object.keys(modObj).length} ${domain} records`);
  }

  const modAssets = path.join(MOD_DIR, 'data', 'assets.json');
  if (fs.existsSync(modAssets)) {
    const assetsData = readJson(path.join(DATA_DIR, 'assets.json'));
    const modAssetsObj = readJson(modAssets);
    if (modAssetsObj.chars) {
      assetsData.chars = assetsData.chars || {};
      for (const [k, v] of Object.entries(modAssetsObj.chars)) {
        assetsData.chars[k] = Object.assign(assetsData.chars[k] || {}, v);
      }
    }
    if (modAssetsObj.bonds) assetsData.bonds = Object.assign(assetsData.bonds || {}, modAssetsObj.bonds);
    if (modAssetsObj.skills) assetsData.skills = Object.assign(assetsData.skills || {}, modAssetsObj.skills);
    if (modAssetsObj.items) assetsData.items = Object.assign(assetsData.items || {}, modAssetsObj.items);
    if (modAssetsObj.audio) {
      assetsData.audio = assetsData.audio || {};
      if (modAssetsObj.audio.voice) {
        assetsData.audio.voice = Object.assign(assetsData.audio.voice || {}, modAssetsObj.audio.voice);
      }
      if (modAssetsObj.audio.voiceJp) {
        assetsData.audio.voiceJp = Object.assign(assetsData.audio.voiceJp || {}, modAssetsObj.audio.voiceJp);
      } else if (modAssetsObj.audio.voice) {
        assetsData.audio.voiceJp = Object.assign(assetsData.audio.voiceJp || {}, modAssetsObj.audio.voice);
      }
      if (modAssetsObj.audio.voice && !assetsData.audio.voice) {
        assetsData.audio.voice = Object.assign({}, modAssetsObj.audio.voice);
      }
      if (modAssetsObj.audio.sfx && modAssetsObj.audio.sfx.units) {
        assetsData.audio.sfx = assetsData.audio.sfx || {};
        assetsData.audio.sfx.units = Object.assign(assetsData.audio.sfx.units || {}, modAssetsObj.audio.sfx.units);
      }
    }
    writeJson(path.join(DATA_DIR, 'assets.json'), assetsData);
    console.log('  Merged assets configuration');

    // Copy static image and audio assets from mod to public
    const modAssetsDir = path.join(MOD_DIR, 'assets');
    if (fs.existsSync(modAssetsDir)) {
      copyDirRecursive(path.join(modAssetsDir, 'standees'), path.join(ROOT, 'public', 'assets', 'char', 'standee'));
      copyDirRecursive(path.join(modAssetsDir, 'avatar'), path.join(ROOT, 'public', 'assets', 'char', 'avatar'));
      copyDirRecursive(path.join(modAssetsDir, 'portrait'), path.join(ROOT, 'public', 'assets', 'char', 'portrait'));
      copyDirRecursive(path.join(modAssetsDir, 'skills'), path.join(ROOT, 'public', 'assets', 'skills'));
      copyDirRecursive(path.join(modAssetsDir, 'skills'), path.join(ROOT, 'public', 'assets', 'skill'));
      const modAudioDir = path.join(modAssetsDir, 'audio');
      if (fs.existsSync(modAudioDir)) {
        copyDirRecursive(modAudioDir, path.join(ROOT, 'public', 'assets', 'audio'));
      }
      console.log('  Copied servant standees, portraits, avatars, skill icons, and audio to public/assets');
    }
  }

  // 5. Wire into server/sim/content/index.js & bonds.js safely preserving SAKIKO invariant
  wireServerSimContent();

  // 6. Track installed
  const inst = readJson(INSTALLED_FILE, { installed: [] });
  inst.installed = inst.installed || [];
  if (!inst.installed.includes(meta.id)) {
    inst.installed.push(meta.id);
    writeJson(INSTALLED_FILE, inst);
  }

  console.log(`[fgo-mod] Successfully installed "${meta.name}"!`);
}

function wireServerSimContent() {
  const contentIdxFile = path.join(ROOT, 'server', 'sim', 'content', 'index.js');
  if (fs.existsSync(contentIdxFile)) {
    let src = fs.readFileSync(contentIdxFile, 'utf8');
    if (!src.includes('FGO_KITS')) {
      // Add safeImport
      src = src.replace(
        "const AVEMUJICA_KITS = await safeImport('./mods/aveMujica/kits.js');",
        "const AVEMUJICA_KITS = await safeImport('./mods/aveMujica/kits.js');\nconst FGO_KITS = await safeImport('./mods/fgoRoundTable/kits.js');"
      );
      // In KITS Object.assign: insert FGO_KITS.default before AVEMUJICA or SAKIKO, KEEP SAKIKO AFTER AVEMUJICA
      src = src.replace(
        "AVEMUJICA_KITS.default ?? {}, SAKIKO_KITS.default ?? {}",
        "FGO_KITS.default ?? {}, AVEMUJICA_KITS.default ?? {}, SAKIKO_KITS.default ?? {}"
      );
      fs.writeFileSync(contentIdxFile, src, 'utf8');
      console.log('  Wired FGO_KITS into server/sim/content/index.js (preserved SAKIKO invariant)');
    }
  }

  const bondsIdxFile = path.join(ROOT, 'server', 'sim', 'content', 'bonds.js');
  if (fs.existsSync(bondsIdxFile)) {
    let bsrc = fs.readFileSync(bondsIdxFile, 'utf8');
    if (!bsrc.includes('fgoBond')) {
      bsrc = bsrc.replace(
        "load('./mods/aveMujica/bonds.js')",
        "load('./mods/aveMujica/bonds.js'),\n  load('./mods/fgoRoundTable/bonds.js')"
      );
      bsrc = bsrc.replace(
        "aveMujicaBond] = await Promise.all",
        "aveMujicaBond, fgoBond] = await Promise.all"
      );
      bsrc = bsrc.replace(
        "['mods/aveMujica/bonds', aveMujicaBond]]",
        "['mods/aveMujica/bonds', aveMujicaBond], ['mods/fgoRoundTable/bonds', fgoBond]]"
      );
      fs.writeFileSync(bondsIdxFile, bsrc, 'utf8');
      console.log('  Wired fgoBond into server/sim/content/bonds.js');
    }
  }
}

export function uninstallMod() {
  console.log(`[fgo-mod] Uninstalling "${MOD_ID}"...`);
  removeDirRecursive(SIM_DEST_DIR);

  // Clean from server/sim/content/index.js
  const contentIdxFile = path.join(ROOT, 'server', 'sim', 'content', 'index.js');
  if (fs.existsSync(contentIdxFile)) {
    let src = fs.readFileSync(contentIdxFile, 'utf8');
    src = src.replace("\nconst FGO_KITS = await safeImport('./mods/fgoRoundTable/kits.js');", "");
    src = src.replace("FGO_KITS.default ?? {}, ", "");
    fs.writeFileSync(contentIdxFile, src, 'utf8');
  }

  // Clean from server/sim/content/bonds.js
  const bondsIdxFile = path.join(ROOT, 'server', 'sim', 'content', 'bonds.js');
  if (fs.existsSync(bondsIdxFile)) {
    let bsrc = fs.readFileSync(bondsIdxFile, 'utf8');
    bsrc = bsrc.replace(",\n  load('./mods/fgoRoundTable/bonds.js')", "");
    bsrc = bsrc.replace("aveMujicaBond, fgoBond", "aveMujicaBond");
    bsrc = bsrc.replace(", ['mods/fgoRoundTable/bonds', fgoBond]", "");
    fs.writeFileSync(bondsIdxFile, bsrc, 'utf8');
  }

  // Clean records from data/*.json
  for (const domain of ['chess', 'bonds', 'items', 'garrisons']) {
    const modFile = path.join(MOD_DIR, 'data', `${domain}.json`);
    const baseFile = path.join(DATA_DIR, `${domain}.json`);
    if (fs.existsSync(modFile) && fs.existsSync(baseFile)) {
      const modObj = readJson(modFile);
      const baseObj = readJson(baseFile);
      for (const k of Object.keys(modObj)) delete baseObj[k];
      writeJson(baseFile, baseObj);
    }
  }

  const inst = readJson(INSTALLED_FILE, { installed: [] });
  inst.installed = (inst.installed || []).filter((x) => x !== MOD_ID);
  writeJson(INSTALLED_FILE, inst);

  console.log(`[fgo-mod] Uninstalled successfully.`);
}

const action = process.argv[2];
if (action === '--fix-38f') {
  fix38f();
} else if (action === 'install') {
  installMod();
} else if (action === 'uninstall') {
  uninstallMod();
} else if (action === 'status') {
  const inst = readJson(INSTALLED_FILE, { installed: [] });
  console.log(`[fgo-mod] Installed status: ${inst.installed?.includes(MOD_ID) ? 'YES' : 'NO'}`);
} else {
  console.log(`Usage: node tools/install_fgo_round_table_mod.mjs [--fix-38f | install | uninstall | status]`);
}
