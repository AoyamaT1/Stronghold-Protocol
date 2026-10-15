// 皮肤选择器 (docs/SKINS.md) — the 皮肤 section of the 干员调配 screen's detail panel.
//
// Self-contained on purpose: screens/loadout.js only imports this and drops `<${SkinSection} chess=… />` into its
// detail body, so upstream rewriting that screen (it is one of the two files most likely to change) costs one
// line here rather than a merge conflict over the whole panel.
//
// Three states per skin, and the difference matters because skins are installed on demand:
//   * installed   → selectable, thumbnails from the asset manifest
//   * not installed → shown, with an 安装 button; picking it would just render the default model, so it is not
//     selectable until its files exist
//   * 默认        → clears the choice (the operator's own model)

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, MicroLabel, Spinner } from './components.js';
import { useStore, shallowEqual } from '../store.js';
import { data } from '../data.js';
import { toast } from './toasts.js';
import { net as appNet } from '../net.js';
import { skinsStore, availableSkins, loadSkinData, setSkin, clearSkin, requestSkinInstall } from './skins.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/**
 * The installed skin's 180×180 avatar URL, or null (an uninstalled skin has no files to point at).
 *
 * Keyed by OPERATOR id, not by chess id: data/assets.json groups everything under `chars[charId]`, and the skin
 * catalogue does the same. A chess record carries both (`chess_char_1_01_a` → `charId: char_498_inside`), and
 * getting the two the wrong way round makes the whole section silently empty.
 */
function skinAvatar(charId, skinId) {
  return data.get('assets')?.chars?.[charId]?.skins?.[skinId]?.avatar || null;
}

/**
 * 皮肤 section for one operator.
 * @param {{ chess: any, net?: any }} props `chess` is the chess record of the detail panel; `net` is injectable for tests
 */
export function SkinSection({ chess, net = appNet }) {
  const s = useStore((v) => v, shallowEqual, skinsStore);
  const [, bump] = useState(0);
  // Two ids, and they are not interchangeable: the CHOICE is stored per chess (like the loadout, and that is the
  // key the server validates and the renderer reads), while the catalogue and the asset manifest are per operator.
  const chessId = chess && chess.chessId;
  const charId = chess && chess.charId;
  // the catalogue lives in data/skins.json and the installed set in data/assets.json; both may still be loading
  useEffect(() => {
    let dead = false;
    loadSkinData();
    const off = data.subscribe?.(() => { if (!dead) bump((n) => n + 1); });
    const t = setInterval(() => { if (!dead) bump((n) => n + 1); }, 500);
    return () => { dead = true; clearInterval(t); off?.(); };
  }, [chessId]);

  if (!chessId || !charId) return null;
  const list = availableSkins(charId);
  if (!list.length) return null; // this operator has no skins at all — say nothing rather than show an empty section

  const chosen = s.entries[chessId] || null;
  const installedCount = list.filter((x) => x.installed).length;
  const sock = net;
  const installing = s.installing || null;
  const prog = s.installingProgress;
  // The seven files are 2 models × (skel + atlas + png) + the avatar, and the installer reports them as they land.
  // Before the first report there is nothing to show but that it started.
  const progLabel = !prog ? '' :
    prog.phase === 'queued' ? '排队中…' :
    prog.total > 0 ? `${prog.done}/${prog.total}${prog.phase === 'finishing' ? ' · 解析中…' : ''}` : '准备中…';

  const install = async (skinId) => {
    if (!sock || installing) return;
    try {
      // acknowledged at once; the outcome arrives as skins.changed (ui/skins.js), which also reloads the manifest
      await requestSkinInstall(sock, skinId);
      toast('开始安装，装好后这里会自动出现（网络慢时约一分钟）', 'info');
    } catch (e) {
      toast('安装失败：' + (e && (e.detail || e.code) || '未知错误'), 'warn');
    }
  };

  return html`<section class="lo-sec lo-sec--skin" data-testid="skin-section">
    <header class="lo-sec__head">
      <h3>皮肤<${MicroLabel}>SKIN<//></h3>
      <span class="lo-sec__note">
        ${installing
          ? html`<${Spinner} size="sm" /> 正在安装 <b class="num">${progLabel}</b>`
          : `${installedCount}/${list.length} 已安装`}
      </span>
    </header>
    <div class="lo-skins" role="radiogroup" aria-label="选择皮肤">
      <button type="button" role="radio" aria-checked=${chosen ? 'false' : 'true'} data-skin=""
        class=${cx('lo-skin', 'lo-skin--default', !chosen && 'is-on')} onClick=${() => clearSkin(chessId)}>
        <span class="lo-skin__art lo-skin__art--none"></span>
        <span class="lo-skin__text"><b class="lo-skin__name">默认</b><span class="lo-skin__group">DEFAULT</span></span>
      </button>
      ${list.map((x) => {
        const art = x.installed ? skinAvatar(charId, x.id) : null;
        const isBusy = installing === x.id;
        return html`<button key=${x.id} type="button" role="radio" aria-checked=${chosen === x.id ? 'true' : 'false'}
            data-skin=${x.id} disabled=${!!installing}
            class=${cx('lo-skin', chosen === x.id && 'is-on', !x.installed && 'lo-skin--missing', isBusy && 'is-installing')}
            onClick=${() => (x.installed ? setSkin(chessId, x.id) : install(x.id))}>
          <span class="lo-skin__art">
            ${art
              ? html`<img src=${art} alt="" loading="lazy" />`
              : isBusy ? html`<${Spinner} size="sm" />` : html`<span class="lo-skin__art--none"></span>`}
          </span>
          <span class="lo-skin__text">
            <b class="lo-skin__name">${x.name}</b>
            <span class="lo-skin__group">${isBusy ? progLabel : x.installed ? x.group : '未安装 · 点击安装'}</span>
          </span>
        </button>`;
      })}
    </div>
  </section>`;
}
