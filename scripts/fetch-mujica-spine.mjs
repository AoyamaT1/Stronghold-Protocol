import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasInfo, normalizeAtlas } from '../tools/assets/atlas.mjs';
import { pngSize } from '../tools/assets/formats.mjs';
import { parseSkel } from '../tools/assets/skel.mjs';
import { resolveRoles } from '../tools/assets/anim-roles.mjs';
import { safeName, mirrorUrl } from '../tools/assets/sources.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MOD_DIR = path.join(ROOT, 'mods', 'ave-mujica');
const PUBLIC_ASSETS = path.join(ROOT, 'public', 'assets');
const MOD_ASSETS = path.join(MOD_DIR, 'assets');

const OPS = [
  { id: 'char_4185_amoris', name: '祐天寺若麦', skills: [0, 1] },
  { id: 'char_4186_tmoris', name: '八幡海铃', skills: [0, 1] },
  { id: 'char_4183_mortis', name: '若叶睦', skills: [0, 1] },
  { id: 'char_4184_dolris', name: '三角初华', skills: [0, 1] },
  { id: 'char_4182_oblvns', name: '丰川祥子', skills: [0, 1, 2] },
];

async function downloadFile(url, destPath) {
  if (existsSync(destPath)) {
    const st = await fs.stat(destPath);
    if (st.size > 0) return true;
  }
  await fs.mkdir(path.dirname(destPath), { recursive: true });

  const urls = [url];
  const mirror = mirrorUrl(url);
  if (mirror) urls.push(mirror);

  for (const u of urls) {
    try {
      const res = await fetch(u);
      if (res.status === 200) {
        const buf = Buffer.from(await res.arrayBuffer());
        await fs.writeFile(destPath, buf);
        return true;
      }
      if (res.status === 404) return false;
    } catch (e) {
      console.warn(`  Failed ${u}: ${e.message}`);
    }
  }
  return false;
}

async function processModel({ stem, remoteDir, localDir, relDir, skillIndices }) {
  const atlasUrl = `${remoteDir}/${stem}.atlas`;
  const atlasPath = path.join(localDir, `${stem}.atlas`);
  const atlasOk = await downloadFile(atlasUrl, atlasPath);
  if (!atlasOk) return null;

  const atlasText = await fs.readFile(atlasPath, 'utf8');
  const info0 = atlasInfo(atlasText);
  if (!info0.pages.length) {
    console.warn(`  [warn] No pages in atlas: ${atlasPath}`);
    return null;
  }

  // Download all png pages
  const sizes = new Map();
  for (const page of info0.pages) {
    const pageUrl = `${remoteDir}/${page}`;
    const pagePath = path.join(localDir, safeName(page));
    const pageOk = await downloadFile(pageUrl, pagePath);
    if (!pageOk) {
      console.warn(`  [warn] Failed to download page: ${pageUrl}`);
      return null;
    }
    const buf = await fs.readFile(pagePath);
    const sz = pngSize(buf);
    if (!sz) {
      console.warn(`  [warn] Cannot determine PNG size: ${pagePath}`);
      return null;
    }
    sizes.set(page, sz);
  }

  // Normalize atlas
  const norm = normalizeAtlas(atlasText, {
    pageSize: (p) => sizes.get(p) || null,
    pma: false,
    renamePage: (p) => safeName(p),
  });
  if (norm.missingSize.length) {
    console.warn(`  [warn] Missing size for pages: ${norm.missingSize.join(',')}`);
    return null;
  }
  if (norm.changed) {
    await fs.writeFile(atlasPath, norm.text, 'utf8');
  }

  const finalInfo = atlasInfo(norm.text);

  // Download skel
  const skelUrl = `${remoteDir}/${stem}.skel`;
  const skelPath = path.join(localDir, `${stem}.skel`);
  const skelOk = await downloadFile(skelUrl, skelPath);
  if (!skelOk) {
    console.warn(`  [warn] Failed to download skel: ${skelUrl}`);
    return null;
  }

  const skelBuf = await fs.readFile(skelPath);
  let sk;
  try {
    sk = parseSkel(skelBuf, finalInfo.regions);
  } catch (e) {
    console.error(`  [error] Failed parsing skeleton ${skelPath}: ${e.message}`);
    return null;
  }

  const anims = resolveRoles(sk.animations, {
    skillIndices,
    durations: sk.durations,
  });

  return {
    skel: `/assets/spine/op/${relDir}/${stem}.skel`,
    atlas: `/assets/spine/op/${relDir}/${stem}.atlas`,
    textures: finalInfo.pages.map((p) => `/assets/spine/op/${relDir}/${safeName(p)}`),
    pma: false,
    anims,
    animations: sk.durations,
    events: sk.events,
    hits: sk.hits,
    bounds: sk.bounds,
  };
}

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await fs.copyFile(s, d);
  }
}

async function main() {
  console.log('=== Fetching & Processing Ave Mujica Spine Models ===');
  const modAssetsJsonPath = path.join(MOD_DIR, 'data', 'assets.json');
  const modAssets = JSON.parse(await fs.readFile(modAssetsJsonPath, 'utf8'));

  for (const op of OPS) {
    console.log(`\nProcessing ${op.name} (${op.id})...`);
    const charEntry = modAssets.chars[op.id] || {};
    charEntry.spine = charEntry.spine || {};

    // 1. Default Front & Back
    const defaultBaseUrl = `https://raw.githubusercontent.com/fexli/ArknightsResource/main/spine/${op.id}/${op.id}`;
    
    // Front
    const frontRel = `${op.id}/front`;
    const frontLocal = path.join(PUBLIC_ASSETS, 'spine', 'op', frontRel);
    console.log(`  Downloading Default Front...`);
    const frontSpine = await processModel({
      stem: op.id,
      remoteDir: `${defaultBaseUrl}/Front`,
      localDir: frontLocal,
      relDir: frontRel,
      skillIndices: op.skills,
    });
    if (frontSpine) {
      charEntry.spine.front = frontSpine;
      console.log(`  ✓ Default Front parsed successfully (${Object.keys(frontSpine.animations).length} anims)`);
    } else {
      console.error(`  ✗ Failed Default Front for ${op.id}`);
    }

    // Back
    const backRel = `${op.id}/back`;
    const backLocal = path.join(PUBLIC_ASSETS, 'spine', 'op', backRel);
    console.log(`  Checking Default Back...`);
    const backSpine = await processModel({
      stem: op.id,
      remoteDir: `${defaultBaseUrl}/Back`,
      localDir: backLocal,
      relDir: backRel,
      skillIndices: op.skills,
    });
    if (backSpine) {
      charEntry.spine.back = backSpine;
      console.log(`  ✓ Default Back parsed successfully (${Object.keys(backSpine.animations).length} anims)`);
    } else {
      console.log(`  (No Back model or not available)`);
    }

    // 2. Ave Mujica Skin Front & Back
    const skinStem = `${op.id}_avemujica_1`;
    const skinId = `${op.id}@avemujica#1`;
    const skinBaseUrl = `https://raw.githubusercontent.com/fexli/ArknightsResource/main/spine/${op.id}/${skinStem}`;

    charEntry.skins = charEntry.skins || {};
    charEntry.skins[skinId] = charEntry.skins[skinId] || {};
    charEntry.skins[skinId].spine = charEntry.skins[skinId].spine || {};

    // Skin Front
    const skinFrontRel = `${op.id}/${skinStem}/front`;
    const skinFrontLocal = path.join(PUBLIC_ASSETS, 'spine', 'op', skinFrontRel);
    console.log(`  Downloading Skin Front...`);
    const skinFrontSpine = await processModel({
      stem: skinStem,
      remoteDir: `${skinBaseUrl}/Front`,
      localDir: skinFrontLocal,
      relDir: skinFrontRel,
      skillIndices: op.skills,
    });
    if (skinFrontSpine) {
      charEntry.skins[skinId].spine.front = skinFrontSpine;
      console.log(`  ✓ Skin Front parsed successfully (${Object.keys(skinFrontSpine.animations).length} anims)`);
    } else {
      console.error(`  ✗ Failed Skin Front for ${skinStem}`);
    }

    // Skin Back
    const skinBackRel = `${op.id}/${skinStem}/back`;
    const skinBackLocal = path.join(PUBLIC_ASSETS, 'spine', 'op', skinBackRel);
    console.log(`  Checking Skin Back...`);
    const skinBackSpine = await processModel({
      stem: skinStem,
      remoteDir: `${skinBaseUrl}/Back`,
      localDir: skinBackLocal,
      relDir: skinBackRel,
      skillIndices: op.skills,
    });
    if (skinBackSpine) {
      charEntry.skins[skinId].spine.back = skinBackSpine;
      console.log(`  ✓ Skin Back parsed successfully (${Object.keys(skinBackSpine.animations).length} anims)`);
    } else {
      console.log(`  (No Skin Back model or not available)`);
    }

    modAssets.chars[op.id] = charEntry;
  }

  // Save updated mods/ave-mujica/data/assets.json
  await fs.writeFile(modAssetsJsonPath, JSON.stringify(modAssets, null, 2), 'utf8');
  console.log(`\nUpdated ${modAssetsJsonPath} with all Spine definitions.`);

  // Also copy downloaded spine files into mods/ave-mujica/assets/spine/op/
  console.log('Copying spine models into mods/ave-mujica/assets for modularity...');
  for (const op of OPS) {
    const src = path.join(PUBLIC_ASSETS, 'spine', 'op', op.id);
    const dest = path.join(MOD_ASSETS, 'spine', 'op', op.id);
    if (existsSync(src)) {
      await copyDir(src, dest);
    }
  }
  console.log('Done!');
}

main().catch((err) => {
  console.error('Fatal error in fetch-mujica-spine:', err);
  process.exit(1);
});
