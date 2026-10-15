#!/usr/bin/env node
// tools/mod.mjs — Pluggable mod manager for Stronghold Protocol
//
// Usage:
//   node tools/mod.mjs list
//   node tools/mod.mjs status
//   node tools/mod.mjs install <mod-id>
//   node tools/mod.mjs uninstall <mod-id>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODS_DIR = path.join(ROOT, 'mods');
const DATA_DIR = path.join(ROOT, 'data');
const SIM_MODS_DIR = path.join(ROOT, 'server', 'sim', 'content', 'mods');
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

function getInstalled() {
  return readJson(INSTALLED_FILE, { installed: [] });
}

function setInstalled(inst) {
  writeJson(INSTALLED_FILE, inst);
}

function listMods() {
  if (!fs.existsSync(MODS_DIR)) return [];
  const entries = fs.readdirSync(MODS_DIR, { withFileTypes: true });
  const list = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      const mJson = path.join(MODS_DIR, e.name, 'mod.json');
      if (fs.existsSync(mJson)) {
        list.push({ dir: e.name, ...readJson(mJson) });
      }
    }
  }
  return list;
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

export function installMod(modId) {
  const modDir = path.join(MODS_DIR, modId);
  const modJsonFile = path.join(modDir, 'mod.json');
  if (!fs.existsSync(modJsonFile)) {
    console.error(`[mod] Error: Mod "${modId}" not found in ${MODS_DIR}`);
    process.exit(1);
  }

  const meta = readJson(modJsonFile);
  console.log(`[mod] Installing "${meta.name}" (${meta.id} v${meta.version})...`);

  // 1. Copy sim files
  const simSrc = path.join(modDir, 'sim');
  const camelName = meta.id.replace(/-([a-z])/g, (_, g) => g.toUpperCase());
  const simDest = path.join(SIM_MODS_DIR, camelName);
  if (fs.existsSync(simSrc)) {
    copyDirRecursive(simSrc, simDest);
    console.log(`  Copied simulation files to server/sim/content/mods/${camelName}`);
  }

  // 2. Merge bonds.json
  const modBonds = path.join(modDir, 'data', 'bonds.json');
  if (fs.existsSync(modBonds)) {
    const bondsData = readJson(path.join(DATA_DIR, 'bonds.json'));
    Object.assign(bondsData, readJson(modBonds));
    writeJson(path.join(DATA_DIR, 'bonds.json'), bondsData);
    console.log(`  Merged bonds: ${Object.keys(readJson(modBonds)).join(', ')}`);
  }

  // 3. Merge chess.json
  const modChess = path.join(modDir, 'data', 'chess.json');
  if (fs.existsSync(modChess)) {
    const chessData = readJson(path.join(DATA_DIR, 'chess.json'));
    const modChessObj = readJson(modChess);
    Object.assign(chessData, modChessObj);
    writeJson(path.join(DATA_DIR, 'chess.json'), chessData);
    console.log(`  Merged ${Object.keys(modChessObj).length} chess records`);

    // Link base chess into bonds' members and visibleMembers
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
      console.log('  Updated bond membership lists for mod chess');
    }
  }

  // 4. Merge garrisons.json
  const modGarrisons = path.join(modDir, 'data', 'garrisons.json');
  if (fs.existsSync(modGarrisons)) {
    const garrisonsData = readJson(path.join(DATA_DIR, 'garrisons.json'));
    Object.assign(garrisonsData, readJson(modGarrisons));
    writeJson(path.join(DATA_DIR, 'garrisons.json'), garrisonsData);
    console.log(`  Merged ${Object.keys(readJson(modGarrisons)).length} garrison records`);
  }

  // 4b. Merge tokens.json
  const modTokens = path.join(modDir, 'data', 'tokens.json');
  if (fs.existsSync(modTokens)) {
    const tokensData = readJson(path.join(DATA_DIR, 'tokens.json'));
    const modTokensObj = readJson(modTokens);
    Object.assign(tokensData, modTokensObj);
    writeJson(path.join(DATA_DIR, 'tokens.json'), tokensData);
    console.log(`  Merged ${Object.keys(modTokensObj).length} token records`);
  }

  // 4c. Merge flat key→record domains that some mods ship but the base merge above does not cover
  //     (effects/items/config). Same additive Object.assign as tokens — the mod fragment holds ONLY its own records.
  for (const domain of ['effects', 'items', 'config']) {
    const modFile = path.join(modDir, 'data', `${domain}.json`);
    if (!fs.existsSync(modFile)) continue;
    const baseData = readJson(path.join(DATA_DIR, `${domain}.json`));
    const modObj = readJson(modFile);
    Object.assign(baseData, modObj);
    writeJson(path.join(DATA_DIR, `${domain}.json`), baseData);
    console.log(`  Merged ${Object.keys(modObj).length} ${domain} records`);
  }

  // 5. Merge skins.json & skins-installed.json
  const modSkins = path.join(modDir, 'data', 'skins.json');
  if (fs.existsSync(modSkins)) {
    const skinsData = readJson(path.join(DATA_DIR, 'skins.json'));
    const modSkinsObj = readJson(modSkins);
    skinsData.chars = skinsData.chars || {};
    for (const [charId, skinList] of Object.entries(modSkinsObj)) {
      skinsData.chars[charId] = skinList;
    }
    writeJson(path.join(DATA_DIR, 'skins.json'), skinsData);

    const instSkins = readJson(path.join(DATA_DIR, 'skins-installed.json'), { installed: [] });
    instSkins.installed = instSkins.installed || [];
    for (const s of meta.skins || []) {
      if (!instSkins.installed.includes(s)) instSkins.installed.push(s);
    }
    writeJson(path.join(DATA_DIR, 'skins-installed.json'), instSkins);
    console.log(`  Merged skins for: ${Object.keys(modSkinsObj).join(', ')}`);
  }

  // 6. Merge assets.json
  const modAssets = path.join(modDir, 'data', 'assets.json');
  if (fs.existsSync(modAssets)) {
    const assetsData = readJson(path.join(DATA_DIR, 'assets.json'));
    const modAssetsObj = readJson(modAssets);
    if (modAssetsObj.chars) {
      assetsData.chars = assetsData.chars || {};
      for (const [k, v] of Object.entries(modAssetsObj.chars)) {
        assetsData.chars[k] = Object.assign(assetsData.chars[k] || {}, v);
      }
    }
    if (modAssetsObj.bonds) {
      assetsData.bonds = Object.assign(assetsData.bonds || {}, modAssetsObj.bonds);
    }
    if (modAssetsObj.skills) {
      assetsData.skills = Object.assign(assetsData.skills || {}, modAssetsObj.skills);
    }
    if (modAssetsObj.skillsById) {
      assetsData.skillsById = Object.assign(assetsData.skillsById || {}, modAssetsObj.skillsById);
    }
    for (const sec of ['items', 'tokens']) {
      if (modAssetsObj[sec]) assetsData[sec] = Object.assign(assetsData[sec] || {}, modAssetsObj[sec]);
    }
    if (modAssetsObj.audio) {
      assetsData.audio = assetsData.audio || {};
      if (modAssetsObj.audio.voice) {
        assetsData.audio.voice = Object.assign(assetsData.audio.voice || {}, modAssetsObj.audio.voice);
      }
      if (modAssetsObj.audio.sfx && modAssetsObj.audio.sfx.units) {
        assetsData.audio.sfx = assetsData.audio.sfx || {};
        assetsData.audio.sfx.units = Object.assign(assetsData.audio.sfx.units || {}, modAssetsObj.audio.sfx.units);
      }
    }
    writeJson(path.join(DATA_DIR, 'assets.json'), assetsData);
    console.log(`  Merged assets configuration`);
  }

  // 7. Copy static assets if present in modDir/assets
  const modAssetsDir = path.join(modDir, 'assets');
  if (fs.existsSync(modAssetsDir)) {
    copyDirRecursive(modAssetsDir, path.join(ROOT, 'public', 'assets'));
    console.log(`  Copied mod assets to public/assets`);
  }

  // 7. Track installed
  const inst = getInstalled();
  if (!inst.installed.includes(meta.id)) {
    inst.installed.push(meta.id);
    setInstalled(inst);
  }

  console.log(`[mod] Successfully installed "${meta.name}"!`);
}

export function uninstallMod(modId) {
  const modDir = path.join(MODS_DIR, modId);
  const modJsonFile = path.join(modDir, 'mod.json');
  if (!fs.existsSync(modJsonFile)) {
    console.error(`[mod] Error: Mod "${modId}" not found in ${MODS_DIR}`);
    process.exit(1);
  }

  const meta = readJson(modJsonFile);
  console.log(`[mod] Uninstalling "${meta.name}" (${meta.id})...`);

  // 1. Remove sim files
  const camelName = meta.id.replace(/-([a-z])/g, (_, g) => g.toUpperCase());
  const simDest = path.join(SIM_MODS_DIR, camelName);
  removeDirRecursive(simDest);

  // 2. Clean bonds.json
  const bondsData = readJson(path.join(DATA_DIR, 'bonds.json'));
  for (const b of meta.bonds || []) delete bondsData[b];
  for (const b of Object.values(bondsData)) {
    if (b && Array.isArray(b.members)) {
      b.members = b.members.filter((m) => !(meta.chess || []).includes(m));
    }
    if (b && Array.isArray(b.visibleMembers)) {
      b.visibleMembers = b.visibleMembers.filter((m) => !(meta.chess || []).includes(m));
    }
  }
  writeJson(path.join(DATA_DIR, 'bonds.json'), bondsData);

  // 3. Clean chess.json
  const chessData = readJson(path.join(DATA_DIR, 'chess.json'));
  for (const c of meta.chess || []) delete chessData[c];
  writeJson(path.join(DATA_DIR, 'chess.json'), chessData);

  // 4. Clean garrisons.json
  const garrisonsData = readJson(path.join(DATA_DIR, 'garrisons.json'));
  for (const g of meta.garrisons || []) delete garrisonsData[g];
  writeJson(path.join(DATA_DIR, 'garrisons.json'), garrisonsData);

  // 4b. Clean tokens.json
  const modTokens = path.join(modDir, 'data', 'tokens.json');
  if (fs.existsSync(modTokens)) {
    const tokensData = readJson(path.join(DATA_DIR, 'tokens.json'));
    const modTokensObj = readJson(modTokens);
    for (const t of Object.keys(modTokensObj)) delete tokensData[t];
    writeJson(path.join(DATA_DIR, 'tokens.json'), tokensData);
  }

  // 4c. Clean flat domains the install step merges (effects/items/config)
  for (const domain of ['effects', 'items', 'config']) {
    const modFile = path.join(modDir, 'data', `${domain}.json`);
    if (!fs.existsSync(modFile)) continue;
    const baseData = readJson(path.join(DATA_DIR, `${domain}.json`));
    for (const k of Object.keys(readJson(modFile))) delete baseData[k];
    writeJson(path.join(DATA_DIR, `${domain}.json`), baseData);
  }

  // 5. Clean skins.json
  const skinsData = readJson(path.join(DATA_DIR, 'skins.json'));
  const modSkins = readJson(path.join(modDir, 'data', 'skins.json'));
  for (const charId of Object.keys(modSkins)) delete skinsData.chars?.[charId];
  writeJson(path.join(DATA_DIR, 'skins.json'), skinsData);

  const instSkins = readJson(path.join(DATA_DIR, 'skins-installed.json'), { installed: [] });
  instSkins.installed = (instSkins.installed || []).filter((s) => !(meta.skins || []).includes(s));
  writeJson(path.join(DATA_DIR, 'skins-installed.json'), instSkins);

  // 6. Clean assets.json
  const assetsData = readJson(path.join(DATA_DIR, 'assets.json'));
  const modAssets = path.join(modDir, 'data', 'assets.json');
  const modAssetsObj = fs.existsSync(modAssets) ? readJson(modAssets) : {};
  for (const charId of Object.keys(modSkins)) delete assetsData.chars?.[charId];
  if (modAssetsObj.chars) {
    for (const charId of Object.keys(modAssetsObj.chars)) delete assetsData.chars?.[charId];
  }
  for (const b of meta.bonds || []) delete assetsData.bonds?.[b];
  if (modAssetsObj.skills) {
    for (const sk of Object.keys(modAssetsObj.skills)) delete assetsData.skills?.[sk];
  }
  if (modAssetsObj.skillsById) {
    for (const sk of Object.keys(modAssetsObj.skillsById)) delete assetsData.skillsById?.[sk];
  }
  for (const sec of ['items', 'tokens']) {
    if (modAssetsObj[sec]) for (const k of Object.keys(modAssetsObj[sec])) delete assetsData[sec]?.[k];
  }
  writeJson(path.join(DATA_DIR, 'assets.json'), assetsData);

  // 7. Track installed
  const inst = getInstalled();
  inst.installed = inst.installed.filter((id) => id !== meta.id);
  setInstalled(inst);

  console.log(`[mod] Successfully uninstalled "${meta.name}"!`);
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'status';

  if (cmd === 'list' || cmd === 'status') {
    const mods = listMods();
    const inst = getInstalled().installed;
    console.log('Available mods in mods/:');
    if (!mods.length) console.log('  (no mods found)');
    for (const m of mods) {
      const active = inst.includes(m.id);
      console.log(`  - [${active ? 'ACTIVE' : 'INACTIVE'}] ${m.id}: ${m.name} (v${m.version})`);
      if (m.description) console.log(`      ${m.description}`);
    }
  } else if (cmd === 'install' || cmd === 'enable') {
    const target = args[1];
    if (!target) {
      console.error('Usage: node tools/mod.mjs install <mod-id>');
      process.exit(1);
    }
    installMod(target);
  } else if (cmd === 'uninstall' || cmd === 'disable') {
    const target = args[1];
    if (!target) {
      console.error('Usage: node tools/mod.mjs uninstall <mod-id>');
      process.exit(1);
    }
    uninstallMod(target);
  } else {
    console.error(`Unknown command "${cmd}". Usage: node tools/mod.mjs [list|install|uninstall]`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
