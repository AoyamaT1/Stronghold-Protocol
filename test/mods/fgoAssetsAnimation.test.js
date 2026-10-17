// test/mods/fgoAssetsAnimation.test.js — Serial unit tests for FGO Standees & Procedural Animations
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('FGO Assets: All 15 servant standees exist and are non-empty PNG files', () => {
  const chars = [
    'char_fgo_artoria', 'char_fgo_baobhan', 'char_fgo_barghest', 'char_fgo_bedivere',
    'char_fgo_castoria', 'char_fgo_gareth', 'char_fgo_gawain', 'char_fgo_lancelot',
    'char_fgo_mash', 'char_fgo_melusine', 'char_fgo_merlin', 'char_fgo_mordred',
    'char_fgo_morgan', 'char_fgo_percival', 'char_fgo_tristan'
  ];

  for (const c of chars) {
    const standeePath = path.join(ROOT, 'public', 'assets', 'char', 'standee', `${c}.png`);
    assert.ok(fs.existsSync(standeePath), `Standee missing: ${standeePath}`);
    const stat = fs.statSync(standeePath);
    assert.ok(stat.size > 1000, `Standee file too small (${stat.size} bytes): ${standeePath}`);

    // Verify avatar and portrait also exist
    const avPath = path.join(ROOT, 'public', 'assets', 'char', 'avatar', `${c}.png`);
    const ptPath = path.join(ROOT, 'public', 'assets', 'char', 'portrait', `${c}.png`);
    assert.ok(fs.existsSync(avPath), `Avatar missing: ${avPath}`);
    assert.ok(fs.existsSync(ptPath), `Portrait missing: ${ptPath}`);
  }

  // Mash Paladin (E2) standee check
  const mashPaladin = path.join(ROOT, 'public', 'assets', 'char', 'standee', 'char_fgo_mash_2.png');
  assert.ok(fs.existsSync(mashPaladin), `Mash Paladin standee missing: ${mashPaladin}`);
});

test('FGO Assets: All 45 skill icons exist and map to valid paths', () => {
  const assetsJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));
  const chessJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'chess.json'), 'utf8'));

  let skillCount = 0;
  for (const [id, c] of Object.entries(chessJson)) {
    if (!id.startsWith('chess_fgo_') || c.isGolden) continue;
    assert.ok(Array.isArray(c.skills), `Skills missing on ${id}`);
    for (const s of c.skills) {
      skillCount++;
      const iconKey = s.iconId || s.icon || s.id;
      const iconPath = assetsJson.skills[iconKey];
      assert.ok(iconPath, `Skill ${s.id} (icon ${iconKey}) missing from data/assets.json`);
      const rawPath = typeof iconPath === 'object' ? iconPath.icon : iconPath;
      const diskPath = path.join(ROOT, 'public', rawPath.replace(/^\//, ''));
      assert.ok(fs.existsSync(diskPath), `Skill icon file missing on disk: ${diskPath}`);
    }
  }
  assert.equal(skillCount, 45, `Expected exactly 45 unique base skill records, got ${skillCount}`);
});

test('FGO Client Assets: standeeUrl resolves base and E2 standees correctly', async () => {
  const { standeeUrl, skillIconUrl, avatarUrl, portraitUrl } = await import('../../public/js/assets.js');
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));
  const chessJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'chess.json'), 'utf8'));

  const artoriaStandee = standeeUrl(manifest, 'char_fgo_artoria');
  assert.equal(artoriaStandee, '/assets/char/standee/char_fgo_artoria.png');

  const mashE2Standee = standeeUrl(manifest, 'char_fgo_mash', { e2: true });
  assert.equal(mashE2Standee, '/assets/char/standee/char_fgo_mash_2.png');

  // Verify skillIconUrl returns genuine skill icon path instead of fallback empty.png
  const artoriaSkillIcon = skillIconUrl(manifest, 'skchr_fgo_artoria_1');
  assert.equal(artoriaSkillIcon, '/assets/skill/skchr_fgo_artoria_1.png');

  // Verify all 30 chess pieces resolve avatar, portrait, and standee properly
  for (const [id, c] of Object.entries(chessJson)) {
    if (!id.startsWith('chess_fgo_')) continue;
    const av = avatarUrl(manifest, c.assets.avatar);
    assert.ok(av, `${id} avatarUrl returned null for ${c.assets.avatar}`);
    const pt = portraitUrl(manifest, c.assets.portrait);
    assert.ok(pt, `${id} portraitUrl returned null for ${c.assets.portrait}`);
    const st = standeeUrl(manifest, c.assets.avatar, { e2: c.isGolden });
    assert.ok(st, `${id} standeeUrl returned null for ${c.assets.avatar}`);
  }
});
