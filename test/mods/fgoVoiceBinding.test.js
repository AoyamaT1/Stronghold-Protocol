import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { voiceLine, canonicalVoiceCharId, VOICE_PRIORITY, VOICE_COOLDOWN_MS, VOICE_HURT_HP_RATIO, VOICE_ATTACK_CHANCE } from '../../public/js/audio.js';
import { sanitizeVoiceOverrides, voiceLangFor } from '../../public/js/voicePrefs.js';

const ROOT = path.resolve('.');
const ASSETS_PATH = path.join(ROOT, 'data', 'assets.json');

const SERVANTS = [
  'char_fgo_gareth',
  'char_fgo_bedivere',
  'char_fgo_tristan',
  'char_fgo_percival',
  'char_fgo_baobhan',
  'char_fgo_gawain',
  'char_fgo_barghest',
  'char_fgo_mash',
  'char_fgo_lancelot',
  'char_fgo_mordred',
  'char_fgo_melusine',
  'char_fgo_artoria',
  'char_fgo_merlin',
  'char_fgo_castoria',
  'char_fgo_morgan',
];

const REQUIRED_SLOTS = [
  'start',
  'place',
  'select',
  'skill1',
  'skill2',
  'skill3',
  'attack',
  'hurt',
  'resultLose',
];

test('FGO Voice: All 15 servants have complete voice manifests with valid disk files', () => {
  const assets = JSON.parse(fs.readFileSync(ASSETS_PATH, 'utf8'));
  assert.ok(assets.audio, 'assets.audio must exist');
  assert.ok(assets.audio.voice, 'assets.audio.voice must exist');
  assert.ok(assets.audio.voiceJp, 'assets.audio.voiceJp must exist');

  for (const charId of SERVANTS) {
    const vCn = assets.audio.voice[charId];
    const vJp = assets.audio.voiceJp[charId];
    assert.ok(vCn, `${charId} missing in audio.voice`);
    assert.ok(vJp, `${charId} missing in audio.voiceJp`);

    for (const slot of REQUIRED_SLOTS) {
      assert.ok(vCn[slot], `${charId} missing slot ${slot} in voice`);
      assert.ok(vJp[slot], `${charId} missing slot ${slot} in voiceJp`);

      const urls = Array.isArray(vCn[slot]) ? vCn[slot] : [vCn[slot]];
      assert.ok(urls.length > 0, `${charId} slot ${slot} has 0 audio files`);
      for (const u of urls) {
        assert.ok(u.startsWith('/assets/'), `URL must start with /assets/: ${u}`);
        const diskPath = path.join(ROOT, 'public', u.replace(/^\//, ''));
        assert.ok(fs.existsSync(diskPath), `Voice audio file does not exist on disk: ${diskPath}`);
        const size = fs.statSync(diskPath).size;
        assert.ok(size > 1024, `Voice file ${diskPath} too small (${size} bytes)`);
      }
    }
  }
});

test('FGO Voice: Canonical ID normalization resolves base, E2, and chess IDs', () => {
  assert.equal(canonicalVoiceCharId('char_fgo_artoria'), 'char_fgo_artoria');
  assert.equal(canonicalVoiceCharId('char_fgo_artoria_2'), 'char_fgo_artoria');
  assert.equal(canonicalVoiceCharId('char_fgo_gareth_1'), 'char_fgo_gareth');
  assert.equal(canonicalVoiceCharId('chess_fgo_1_gareth_a'), 'char_fgo_gareth');
  assert.equal(canonicalVoiceCharId('chess_fgo_5_artoria_b'), 'char_fgo_artoria');
  assert.equal(canonicalVoiceCharId('chess_fgo_6_merlin_a'), 'char_fgo_merlin');
  // Vanilla check
  assert.equal(canonicalVoiceCharId('char_1028_texas2'), 'char_1028_texas2');
  assert.equal(canonicalVoiceCharId('char_1028_texas2_2'), 'char_1028_texas2');
  assert.equal(canonicalVoiceCharId('chess_char_1028_texas2_a'), 'char_1028_texas2');
});

test('FGO Voice: voiceLine resolves all 7 event categories across forms and dub settings', () => {
  const assets = JSON.parse(fs.readFileSync(ASSETS_PATH, 'utf8'));

  for (const charId of SERVANTS) {
    // 1. Attack voice (普攻)
    const atk = voiceLine(assets.audio, charId, 'attack', 'jp');
    assert.ok(atk?.url, `${charId} attack voice line unresolved`);

    // 2. Normal Skill (技能1 / 技能2)
    const s1 = voiceLine(assets.audio, charId, 'skill1', 'jp');
    assert.ok(s1?.url, `${charId} skill1 voice line unresolved`);
    const s2 = voiceLine(assets.audio, charId, 'skill2', 'jp');
    assert.ok(s2?.url, `${charId} skill2 voice line unresolved`);

    // 3. Hurt voice (受到攻击)
    const hurt = voiceLine(assets.audio, charId, 'hurt', 'jp');
    assert.ok(hurt?.url, `${charId} hurt voice line unresolved`);

    // 4. Noble Phantasm chant (宝具解放 - skill3)
    const np = voiceLine(assets.audio, charId, 'skill3', 'jp');
    assert.ok(np?.url, `${charId} noble phantasm (skill3) voice line unresolved`);

    // 5. Select voice (选中/点击)
    const sel = voiceLine(assets.audio, charId, 'select', 'jp');
    assert.ok(sel?.url, `${charId} select voice line unresolved`);

    // 6. Deploy voice (部署/出击)
    const start = voiceLine(assets.audio, charId, 'start', 'jp');
    const place = voiceLine(assets.audio, charId, 'place', 'jp');
    assert.ok(start?.url, `${charId} start voice line unresolved`);
    assert.ok(place?.url, `${charId} place voice line unresolved`);

    // 7. Defeat / Die voice (死亡/战斗不能 - die / resultLose)
    const die = voiceLine(assets.audio, charId, 'die', 'jp');
    const rLose = voiceLine(assets.audio, charId, 'resultLose', 'jp');
    assert.ok(die?.url, `${charId} die alias voice line unresolved`);
    assert.ok(rLose?.url, `${charId} resultLose voice line unresolved`);

    // Cross-form resolution test (chessId and golden skin)
    const chessId = `chess_fgo_5_${charId.replace('char_fgo_', '')}_a`;
    const chessLine = voiceLine(assets.audio, chessId, 'skill3', 'jp');
    assert.ok(chessLine?.url, `${chessId} failed to resolve via canonical id`);

    const e2Id = `${charId}_2`;
    const e2Line = voiceLine(assets.audio, e2Id, 'skill3', 'jp');
    assert.ok(e2Line?.url, `${e2Id} failed to resolve via canonical id`);
  }
});

test('FGO Voice: Anti-clutter priority, cooldowns, and thresholds', () => {
  // Priority hierarchy: start > die/resultLose > skill > hurt > attack > place > select
  assert.ok(VOICE_PRIORITY.start > VOICE_PRIORITY.resultLose, 'start must outrank resultLose');
  assert.ok(VOICE_PRIORITY.resultLose > VOICE_PRIORITY.skill1, 'die/resultLose must outrank skill');
  assert.ok(VOICE_PRIORITY.skill1 > VOICE_PRIORITY.hurt, 'skill must outrank hurt');
  assert.ok(VOICE_PRIORITY.hurt > VOICE_PRIORITY.attack, 'hurt must outrank attack');
  assert.ok(VOICE_PRIORITY.attack > VOICE_PRIORITY.place, 'attack must outrank place');
  assert.ok(VOICE_PRIORITY.place > VOICE_PRIORITY.select, 'place must outrank select');

  // Cooldowns and throttling
  assert.equal(VOICE_COOLDOWN_MS.attack, 6000, 'Attack voice must have 6s cooldown per unit');
  assert.equal(VOICE_COOLDOWN_MS.hurt, 6000, 'Hurt voice must have 6s cooldown per unit');
  assert.equal(VOICE_COOLDOWN_MS.skill1, 10000, 'Skill voice must have 10s cooldown per unit');
  assert.equal(VOICE_ATTACK_CHANCE, 0.15, 'Attack chatter throttled to 15%');
  assert.equal(VOICE_HURT_HP_RATIO, 0.15, 'Hurt voice requires >15% max HP hit');
});

test('FGO Voice: voicePrefs handles char_fgo_* overrides correctly', () => {
  const sanitized = sanitizeVoiceOverrides({
    char_fgo_artoria: 'jp',
    char_1028_texas2: 'cn',
    invalid_operator: 'jp',
  });
  assert.equal(sanitized.char_fgo_artoria, 'jp');
  assert.equal(sanitized.char_1028_texas2, 'cn');
  assert.equal(sanitized.invalid_operator, undefined);

  assert.equal(voiceLangFor('char_fgo_artoria', 'cn', { char_fgo_artoria: 'jp' }), 'jp');
  assert.equal(voiceLangFor('char_fgo_artoria', 'cn', {}), 'cn');
  assert.equal(voiceLangFor('char_fgo_artoria', 'jp', {}), 'jp');
});
