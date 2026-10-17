#!/usr/bin/env node
// tools/fetch_fgo_voices.mjs — 拉取 FGO 圆桌 15 名干员的官方战斗语音并落地为引擎可播的素材
//
// 数据源（已实测可用）：
//   清单 https://api.atlasacademy.io/nice/JP/servant/{svtId}?lore=true  → profile.voices[]
//   音频 https://static.atlasacademy.io/{REGION}/Audio/{folder}/{voiceId}.mp3
//        folder = Servants_{svtId} | NoblePhantasm_{svtId} | ChrVoice_{svtId}
//
// 落地：
//   mods/fgo-round-table/assets/audio/voice/jp/<charId>/<slot>_<n>.mp3   （随 mod 分发）
//   public/assets/audio/voice/jp/<charId>/<slot>_<n>.mp3                 （直接可播，.gitignore 内）
//   mods/fgo-round-table/data/voice_manifest.json                        （可并入 data/assets.json 的音频片段）
//
// 用法：
//   node tools/fetch_fgo_voices.mjs              # 拉全部 15 人（已存在的文件跳过）
//   node tools/fetch_fgo_voices.mjs gareth mash  # 只拉指定干员
//   node tools/fetch_fgo_voices.mjs --manifest-only   # 只重算清单，不下载

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOD_ASSETS = path.join(ROOT, 'mods', 'fgo-round-table', 'assets', 'audio', 'voice', 'jp');
const PUB_ASSETS = path.join(ROOT, 'public', 'assets', 'audio', 'voice', 'jp');
const MANIFEST = path.join(ROOT, 'mods', 'fgo-round-table', 'data', 'voice_manifest.json');

const REGION = 'JP';
const API = (id) => `https://api.atlasacademy.io/nice/${REGION}/servant/${id}?lore=true`;

/** 圆桌 15 人：charId ↔ Atlas Academy svtId（svtId 已逐个核对过 atlas_nice_servant.json） */
const SERVANTS = [
  { key: 'gareth', charId: 'char_fgo_gareth', svtId: 303900 },
  { key: 'bedivere', charId: 'char_fgo_bedivere', svtId: 101200 },
  { key: 'tristan', charId: 'char_fgo_tristan', svtId: 200800 },
  { key: 'percival', charId: 'char_fgo_percival', svtId: 304700 },
  { key: 'baobhan', charId: 'char_fgo_baobhan', svtId: 204300 },
  { key: 'gawain', charId: 'char_fgo_gawain', svtId: 100700 },
  { key: 'barghest', charId: 'char_fgo_barghest', svtId: 105000 },
  { key: 'mash', charId: 'char_fgo_mash', svtId: 800100 },
  { key: 'lancelot', charId: 'char_fgo_lancelot', svtId: 102000 },
  { key: 'mordred', charId: 'char_fgo_mordred', svtId: 100900 },
  { key: 'melusine', charId: 'char_fgo_melusine', svtId: 304800 },
  { key: 'artoria', charId: 'char_fgo_artoria', svtId: 100100 },
  { key: 'merlin', charId: 'char_fgo_merlin', svtId: 500800 },
  { key: 'castoria', charId: 'char_fgo_castoria', svtId: 504500 },
  { key: 'morgan', charId: 'char_fgo_morgan', svtId: 704000 }
];

/**
 * FGO 语音行名 → 引擎 slot。引擎只认 start/place/select/faceEnemy/skill1..4/resultFour/Three/Two/Lose/gacha。
 * 每项：[slot, 行名正则, 取几条]（`*` = 该行 audioAssets 全要）
 */
const MAPPING = [
  ['start', /^開始\s*1$/, 1],
  ['place', /^開始\s*2$/, 1],
  ['faceEnemy', /^開始\s*3$/, 1],
  ['select', /^コマンドカード\s*[123]$/, 3],
  ['skill1', /^スキル\s*1$/, 1],
  ['skill2', /^スキル\s*2$/, 1],
  ['resultFour', /^勝利\s*1$/, 1],
  ['resultThree', /^勝利\s*2$/, 1],
  ['resultTwo', /^勝利\s*3$/, 1],
  ['resultLose', /^戦闘不能\s*[12]$/, 2],
  // 普攻 / 受击：引擎原本没有这两个 slot，为圆桌模组在 public/js/audio.js 里新增（攻击 15% 概率 + 6s 冷却；
  // 受击仅在单次掉血 >20% 最大生命时播，6s 冷却）。FGO 侧对应「アタック 1~4」「ダメージ 1~4」。
  ['attack', /^アタック\s*[1-4]$/, 4],
  ['hurt', /^ダメージ\s*[1-4]$/, 4]
];
const FIRSTGET = /^召喚$/;      // 招募入手 → gacha
const NP_GROUP = 'treasureDevice'; // 宝具释放 → skill3

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'stronghold-fgo-mod/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

/** 下一条音频；返回 {ok, bytes} —— 404/网络失败都返回 ok:false，绝不抛 */
async function fetchAudio(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return { ok: true, bytes: 0, cached: true };
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'stronghold-fgo-mod/1.0' } });
    if (!res.ok) return { ok: false, status: res.status };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 512) return { ok: false, status: 'too-small' };
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    // 同时落一份到 public/（mod.mjs 装的时候也会拷，这里先手动同步保证立刻能播）
    const pub = path.join(PUB_ASSETS, path.relative(MOD_ASSETS, dest));
    fs.mkdirSync(path.dirname(pub), { recursive: true });
    fs.writeFileSync(pub, buf);
    return { ok: true, bytes: buf.length };
  } catch (e) {
    return { ok: false, status: e.message };
  }
}

/** 把一组音频下到 charId 目录下，返回可写进 assets.json 的路径数组（相对 public/ 的 URL） */
async function download(slot, entries, charId, stat) {
  const out = [];
  let n = 0;
  for (const e of entries) {
    n += 1;
    const name = entries.length > 1 ? `${slot}_${n}.mp3` : `${slot}.mp3`;
    const dest = path.join(MOD_ASSETS, charId, name);
    const r = await fetchAudio(e.url, dest);
    if (r.ok) {
      out.push(`/assets/audio/voice/jp/${charId}/${name}`);
      stat.ok += 1;
      if (!r.cached) stat.bytes += r.bytes;
      await sleep(60); // 别把 CDN 打爆
    } else {
      stat.miss += 1;
      stat.missing.push(`${charId}/${name} (${r.status})  ${e.url}`);
    }
  }
  return out;
}

async function processServant(s, stat) {
  const json = await getJson(API(s.svtId));
  const groups = json?.profile?.voices;
  if (!Array.isArray(groups) || !groups.length) {
    stat.missing.push(`${s.charId}: profile.voices 为空（lore=true 没生效？）`);
    return null;
  }
  const byType = (t) => groups.filter((g) => g.type === t).flatMap((g) => g.voiceLines || []);
  const battle = byType('battle');
  const firstGet = byType('firstGet');
  const np = groups.filter((g) => g.type === NP_GROUP).flatMap((g) => g.voiceLines || []);

  /** 一行语音 → [{url, id}] */
  const urls = (line, take) => {
    const pairs = (line.id || []).map((id, i) => ({ id, url: (line.audioAssets || [])[i] })).filter((p) => p.url);
    return take === '*' ? pairs : pairs.slice(0, take);
  };

  const voice = {};
  for (const [slot, re, take] of MAPPING) {
    const picked = [];
    for (const line of battle) {
      if (!re.test(line.name || '')) continue;
      picked.push(...urls(line, take));
      if (picked.length >= take) break;
    }
    if (picked.length) {
      const files = await download(slot, picked.slice(0, take), s.charId, stat);
      if (files.length) voice[slot] = files.length === 1 ? files[0] : files;
    }
  }

  // 宝具 → skill3（取 treasureDevice 组第一条的全部音轨）
  if (np.length) {
    const files = await download('skill3', urls(np[0], '*'), s.charId, stat);
    if (files.length) voice.skill3 = files.length === 1 ? files[0] : files;
  }

  // 召唤 → gacha
  const summon = firstGet.find((l) => FIRSTGET.test(l.name || '')) || firstGet[0];
  if (summon) {
    const files = await download('gacha', urls(summon, 2), s.charId, stat);
    if (files.length) voice.gacha = files.length === 1 ? files[0] : files;
  }

  return Object.keys(voice).length ? voice : null;
}

async function main() {
  const args = process.argv.slice(2);
  const manifestOnly = args.includes('--manifest-only');
  const only = args.filter((a) => !a.startsWith('--'));
  const list = only.length ? SERVANTS.filter((s) => only.includes(s.key)) : SERVANTS;

  const stat = { ok: 0, miss: 0, bytes: 0, missing: [], chars: {} };
  console.log(`[fgo-voices] ${manifestOnly ? '仅重算清单' : '开始拉取'}：${list.map((s) => s.key).join(', ')}`);

  for (const s of list) {
    process.stdout.write(`  ${s.charId.padEnd(20)} … `);
    try {
      const voice = await processServant(s, stat);
      if (voice) {
        stat.chars[s.charId] = voice;
        console.log(`${Object.keys(voice).length} 个 slot: ${Object.keys(voice).join(',')}`);
      } else {
        console.log('无可用语音');
      }
    } catch (e) {
      console.log(`失败: ${e.message}`);
      stat.missing.push(`${s.charId}: ${e.message}`);
    }
  }

  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify({ audio: { voice: stat.chars, voiceJp: stat.chars } }, null, 2), 'utf8');

  console.log(`\n[fgo-voices] 下载 ${stat.ok} 条（${(stat.bytes / 1048576).toFixed(1)} MB），失败 ${stat.miss} 条`);
  if (stat.missing.length) {
    console.log('[fgo-voices] 未取到的：');
    for (const m of stat.missing.slice(0, 30)) console.log('   -', m);
    if (stat.missing.length > 30) console.log(`   … 另有 ${stat.missing.length - 30} 条`);
  }
  console.log(`[fgo-voices] 清单已写到 ${path.relative(ROOT, MANIFEST)}`);
  console.log('[fgo-voices] 下一步：把该文件的 audio.voice 并进 mods/fgo-round-table/data/assets.json，再 node tools/setup.mjs --check 确认 0 缺失');
}

main().catch((e) => {
  console.error('[fgo-voices] 致命错误', e);
  process.exit(1);
});
