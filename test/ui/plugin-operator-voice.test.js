// test/ui/plugin-operator-voice.test.js — 插件干员语音系统重新绑定与解析测试
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  voiceLine,
  canonicalVoiceCharId,
  VOICE_PRIORITY,
  VOICE_COOLDOWN_MS,
  VOICE_ATTACK_CHANCE,
  VOICE_HURT_HP_RATIO,
  SLOT_ALIASES
} from '../../public/js/audio.js';
import { sanitizeVoiceOverrides, voiceLangFor } from '../../public/js/voicePrefs.js';

const ROOT = path.resolve('.');
const assets = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));

describe('插件干员语音绑定与归一化测试', () => {
  test('罗德岛干员（Ascalon, Closure, Logos, Mon3tr）语音双轨正常解析', () => {
    const rhodesOps = [
      { id: 'char_x_rhodes_ascln', chess: 'chess_x_rhodes_ascln_a', target: 'char_4132_ascln' },
      { id: 'char_x_rhodes_closur', chess: 'chess_x_rhodes_closur_a', target: 'char_4228_closur' },
      { id: 'char_x_rhodes_logos', chess: 'chess_x_rhodes_logos_a', target: 'char_4133_logos' },
      { id: 'char_x_rhodes_monstr', chess: 'chess_x_rhodes_monstr_a', target: 'char_4179_monstr' }
    ];

    for (const op of rhodesOps) {
      assert.equal(canonicalVoiceCharId(op.id), op.target);
      assert.equal(canonicalVoiceCharId(op.chess), op.target);

      for (const query of [op.id, op.chess]) {
        for (const slot of ['place', 'select', 'start', 'skill1', 'skill2', 'skill3']) {
          const cnLine = voiceLine(assets.audio, query, slot, 'cn', () => 0);
          assert.ok(cnLine && cnLine.url, `${query} 缺 ${slot} 中文语音`);
          assert.ok(fs.existsSync(path.join(ROOT, 'public', cnLine.url.replace(/^\//, ''))), `${query} ${slot} 中文文件不在盘上`);

          const jpLine = voiceLine(assets.audio, query, slot, 'jp', () => 0);
          assert.ok(jpLine && jpLine.url, `${query} 缺 ${slot} 日文语音`);
          assert.ok(fs.existsSync(path.join(ROOT, 'public', jpLine.url.replace(/^\//, ''))), `${query} ${slot} 日文文件不在盘上`);
        }
      }
    }
  });

  test('FGO 插件干员 15 名从者语音归一化与双轨全槽位解析', () => {
    const fgoServants = [
      'artoria', 'baobhan', 'barghest', 'bedivere', 'castoria', 'gareth',
      'gawain', 'lancelot', 'mash', 'melusine', 'merlin', 'mordred',
      'morgan', 'percival', 'tristan'
    ];

    for (const name of fgoServants) {
      const charId = `char_x_fgo_round_table_${name}`;
      const chessId = `chess_x_fgo_round_table_${name}_a`;
      const expected = `char_fgo_${name}`;

      assert.equal(canonicalVoiceCharId(charId), expected);
      assert.equal(canonicalVoiceCharId(chessId), expected);

      for (const query of [charId, chessId]) {
        for (const slot of ['start', 'place', 'select', 'skill1', 'skill2', 'skill3', 'attack', 'hurt', 'die', 'resultLose']) {
          const jpLine = voiceLine(assets.audio, query, slot, 'jp', () => 0);
          assert.ok(jpLine && jpLine.url, `${query} 缺 ${slot} 日文语音`);
          assert.ok(fs.existsSync(path.join(ROOT, 'public', jpLine.url.replace(/^\//, ''))), `${query} ${slot} 文件不在盘上: ${jpLine.url}`);
        }
      }
    }
  });

  test('边狱公司插件干员 12 名罪人语音归一化与全槽位解析', () => {
    const limbusSinners = [
      'donquixote', 'faust', 'gregor', 'heathcliff', 'honglu', 'ishmael',
      'meursault', 'outis', 'rodion', 'ryoshu', 'sinclair', 'yisang'
    ];

    for (const name of limbusSinners) {
      const charId = `char_x_limbus_company_${name}`;
      const chessId = `chess_x_limbus_company_${name}_a`;
      const expected = `char_limbus_${name}`;

      assert.equal(canonicalVoiceCharId(charId), expected);
      assert.equal(canonicalVoiceCharId(chessId), expected);

      for (const query of [charId, chessId]) {
        for (const slot of ['start', 'place', 'select', 'skill1', 'skill2', 'skill3', 'resultLose']) {
          const cnLine = voiceLine(assets.audio, query, slot, 'cn', () => 0);
          assert.ok(cnLine && cnLine.url, `${query} 缺 ${slot} 中文语音`);
          assert.ok(fs.existsSync(path.join(ROOT, 'public', cnLine.url.replace(/^\//, ''))), `${query} ${slot} 文件不在盘上: ${cnLine.url}`);
        }
      }
    }
  });

  test('罗德岛思衡凯尔希与原生干员（望/赤刃陈/维什戴尔/思衡凯尔希）语音正常解析', () => {
    const ops = [
      { id: 'char_x_rhodes_kalts2', chess: 'chess_x_rhodes_kalts2_a', target: 'char_1052_kalts2' },
      { id: 'char_2027_wang', chess: 'char_2027_wang', target: 'char_2027_wang' },
      { id: 'char_1050_chen3', chess: 'char_1050_chen3', target: 'char_1050_chen3' },
      { id: 'char_1052_kalts2', chess: 'char_1052_kalts2', target: 'char_1052_kalts2' },
      { id: 'char_1035_wisdel', chess: 'char_1035_wisdel', target: 'char_1035_wisdel' }
    ];

    for (const op of ops) {
      assert.equal(canonicalVoiceCharId(op.id), op.target);
      assert.equal(canonicalVoiceCharId(op.chess), op.target);

      for (const query of [op.id, op.chess]) {
        for (const slot of ['place', 'select', 'start']) {
          const line = voiceLine(assets.audio, query, slot, 'cn', () => 0);
          assert.ok(line && line.url, `${query} 缺 ${slot} 语音`);
          assert.ok(fs.existsSync(path.join(ROOT, 'public', line.url.replace(/^\//, ''))), `${query} ${slot} 文件不在盘上: ${line.url}`);
        }
      }
    }
  });

  test('Ave Mujica 干员无专用音频时优雅降级为 null 不抛异常', () => {
    const aveOps = ['amoris', 'tmoris', 'mortis', 'dolris', 'oblvns'];
    for (const name of aveOps) {
      const charId = `char_x_ave_mujica_${name}`;
      const chessId = `chess_x_ave_mujica_${name}_a`;
      assert.equal(voiceLine(assets.audio, charId, 'place', 'cn'), null);
      assert.equal(voiceLine(assets.audio, chessId, 'place', 'jp'), null);
      assert.doesNotThrow(() => voiceLine(assets.audio, charId, 'skill1', 'cn'));
    }
  });

  test('语音偏好设置支持插件干员 ID 格式', () => {
    const raw = {
      char_x_rhodes_ascln: 'jp',
      char_x_fgo_round_table_gareth: 'jp',
      char_x_limbus_company_sinclair: 'cn',
      char_1028_texas2: 'jp',
      'invalid name': 'cn'
    };
    const sanitized = sanitizeVoiceOverrides(raw);
    assert.equal(sanitized.char_x_rhodes_ascln, 'jp');
    assert.equal(sanitized.char_x_fgo_round_table_gareth, 'jp');
    assert.equal(sanitized.char_x_limbus_company_sinclair, 'cn');
    assert.equal(sanitized.char_1028_texas2, 'jp');
    assert.equal(sanitized['invalid name'], undefined);
  });
});
