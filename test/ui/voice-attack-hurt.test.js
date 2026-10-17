// test/ui/voice-attack-hurt.test.js — 受击 / 普攻语音（内容模组用；FGO 圆桌骑士的「ダメージ / アタック」）：
//   * audio.js VOICE_PRIORITY / VOICE_COOLDOWN_MS: 两个 slot 存在、优先级压在 作战中(70) 之下（技能台词永不被切），
//     受击能顶掉普攻、反之不行（preemptMargin），冷却同为 6 秒
//   * audio.js handleBattleEvents: ['atk'] 按概率喊普攻、['dmg'] 只在单次掉血 > 20% 最大生命时喊受击；
//     两条都要能在真实清单里解析出文件（否则喊了也是静默）
//   * 没有这两个 slot 的干员必须静默降级（voiceLine → null），不得报错

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VOICE_PRIORITY, VOICE_COOLDOWN_MS, VOICE_ATTACK_CHANCE, VOICE_HURT_HP_RATIO, voiceLine,
} from '../../public/js/audio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifestFile = path.join(ROOT, 'data/assets.json');
const hasManifest = existsSync(manifestFile);

describe('受击 / 普攻语音的 slot 定义', () => {
  test('两个 slot 都在优先级表里，且都压在 作战中(70) 之下', () => {
    assert.equal(typeof VOICE_PRIORITY.attack, 'number');
    assert.equal(typeof VOICE_PRIORITY.hurt, 'number');
    assert.ok(VOICE_PRIORITY.attack < VOICE_PRIORITY.skill1, '普攻不得压过技能台词');
    assert.ok(VOICE_PRIORITY.hurt < VOICE_PRIORITY.skill1, '受击不得压过技能台词');
    assert.ok(VOICE_PRIORITY.hurt > VOICE_PRIORITY.attack, '受击应能顶掉普攻');
    assert.ok(VOICE_PRIORITY.hurt - VOICE_PRIORITY.attack > 10, '差值要大于 preemptMargin(10) 才真的抢得动');
  });

  test('同干员冷却都是 6 秒（设计文档⑥/⑩）', () => {
    assert.equal(VOICE_COOLDOWN_MS.attack, 6000);
    assert.equal(VOICE_COOLDOWN_MS.hurt, 6000);
  });

  test('触发参数：普攻 15% 概率、受击门槛 15% 最大生命（防吵闹调参）', () => {
    assert.equal(VOICE_ATTACK_CHANCE, 0.15);
    assert.equal(VOICE_HURT_HP_RATIO, 0.15);
  });
});

describe('真实清单里的 FGO 语音', () => {
  const m = hasManifest ? JSON.parse(readFileSync(manifestFile, 'utf8')) : null;
  const OP = ['gareth', 'bedivere', 'tristan', 'percival', 'baobhan', 'gawain', 'barghest', 'mash',
    'lancelot', 'mordred', 'melusine', 'artoria', 'merlin', 'castoria', 'morgan'];

  test('15 名圆桌干员都能解析出普攻与受击台词，且文件在盘上', { skip: !hasManifest }, () => {
    let checked = 0;
    for (const n of OP) {
      const id = `char_fgo_${n}`;
      for (const slot of ['attack', 'hurt']) {
        const line = voiceLine(m.audio, id, slot, 'cn', () => 0);
        assert.ok(line && line.url, `${id} 缺 ${slot} 台词`);
        assert.ok(existsSync(path.join(ROOT, 'public', line.url)), `${id}/${slot} 的文件不在盘上: ${line.url}`);
        checked++;
      }
    }
    assert.equal(checked, OP.length * 2);
  });

  test('中日双轨都解析得出来（canonicalVoiceCharId 修好了 char_fgo_* 的语言切换）', { skip: !hasManifest }, () => {
    assert.ok(m.audio.voice?.char_fgo_gareth?.attack, '普攻台词应登记在 audio.voice');
    // 这条曾经是 undefined —— voicePrefs 的正则不认 char_fgo_*，日语轨整条取不到（本用例原先把该缺陷写成了断言）。
    // 2026-10-16 的 canonicalVoiceCharId 把 chess_fgo_*/char_fgo_*_2 归一到 char_fgo_* 之后，两轨都有了。
    assert.ok(m.audio.voiceJp?.char_fgo_gareth?.attack, '日语轨也应登记');
    const jp = voiceLine(m.audio, 'char_fgo_gareth', 'attack', 'jp', () => 0);
    assert.ok(jp && /voice\/jp\//.test(jp.url), 'jp 请求应走日语轨');

    // 金卡（_2）与商店里的 chess id 都要归一到同一条台词，否则买了金卡就没声音
    for (const alias of ['chess_fgo_1_gareth_a', 'char_fgo_gareth_2']) {
      const l = voiceLine(m.audio, alias, 'attack', 'jp', () => 0);
      assert.ok(l && /voice\/jp\//.test(l.url || ''), `${alias} 应归一到 char_fgo_gareth 的台词`);
    }
  });

  test('没有这两个 slot 的干员静默降级（voiceLine 返回 null，不抛）', { skip: !hasManifest }, () => {
    assert.equal(voiceLine(m.audio, 'char_498_inside', 'attack', 'cn', () => 0), null);
    assert.equal(voiceLine(m.audio, 'char_fgo_gareth', 'nonexistentSlot', 'cn', () => 0), null);
    assert.doesNotThrow(() => voiceLine(null, 'x', 'attack'));
  });
});
