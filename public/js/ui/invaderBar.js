// Invader tactical command terminal (1vN Dungeon Master Mode)
import { useEffect, useMemo, useState } from '../../vendor/hooks.module.js';
import { html, Icon, MicroLabel, Button, Tooltip } from './components.js';
import { Img, GIcon, useGameData } from './gameComponents.js';
import { enemyIconUrl } from './assetUrls.js';
import { actions } from './gameActions.js';
import { toast } from './toasts.js';

const ROUTE_OPTIONS = [
  { id: 'balanced', name: '均衡推进', desc: '双路平推，常规战术配置' },
  { id: 'upper_focus', name: '主攻上路', desc: '强攻上路高台/防线' },
  { id: 'lower_focus', name: '主攻下路', desc: '集中下路密集突破' },
];

export function InvaderBar({ priv, editable = true, collapsed = false, onCollapse, onDetail }) {
  const gd = useGameData();
  const invader = priv?.invader || {};
  const budget = invader.budget || 14;
  const tactics = invader.tactics || [];
  const enemies = invader.enemies || [];
  const ready = !!priv?.ready;

  const normalEnemies = useMemo(() => enemies.filter((e) => e.rank === 'NORMAL'), [enemies]);
  const eliteEnemies = useMemo(() => enemies.filter((e) => e.rank !== 'NORMAL'), [enemies]);

  const [normalKey, setNormalKey] = useState(invader.currentPlan?.normalKey || normalEnemies[0]?.key || null);
  const [eliteKey, setEliteKey] = useState(invader.currentPlan?.eliteKey || eliteEnemies[0]?.key || null);
  const [tacticId, setTacticId] = useState(invader.currentPlan?.tacticId || 'rush');
  const [routeStrategy, setRouteStrategy] = useState(invader.currentPlan?.routeStrategy || 'balanced');
  const [reinforcements, setReinforcements] = useState(invader.currentPlan?.reinforcements || []);

  // Modal picker state: { target: 'normal'|'elite'|'reinf', reinfIdx?: number } | null
  const [picker, setPicker] = useState(null);

  // Sync state when round/enemies/plan updates
  useEffect(() => {
    if (invader.currentPlan) {
      if (invader.currentPlan.normalKey) setNormalKey(invader.currentPlan.normalKey);
      if (invader.currentPlan.eliteKey) setEliteKey(invader.currentPlan.eliteKey);
      if (invader.currentPlan.tacticId) setTacticId(invader.currentPlan.tacticId);
      if (invader.currentPlan.routeStrategy) setRouteStrategy(invader.currentPlan.routeStrategy);
      if (Array.isArray(invader.currentPlan.reinforcements)) setReinforcements(invader.currentPlan.reinforcements);
    } else {
      if (!normalKey && normalEnemies.length > 0) setNormalKey(normalEnemies[0].key);
      if (!eliteKey && eliteEnemies.length > 0) setEliteKey(eliteEnemies[0].key);
    }
  }, [invader.round, invader.currentPlan, normalEnemies, eliteEnemies]);

  const selNormal = useMemo(() => enemies.find((e) => e.key === normalKey) || normalEnemies[0] || null, [enemies, normalKey, normalEnemies]);
  const selElite = useMemo(() => enemies.find((e) => e.key === eliteKey) || eliteEnemies[0] || null, [enemies, eliteKey, eliteEnemies]);
  const selTactic = useMemo(() => tactics.find((t) => t.id === tacticId) || tactics[0] || null, [tactics, tacticId]);

  // CP Budget Accounting
  const tacticCost = selTactic?.cost || 0;
  const reinfCost = useMemo(() => {
    return reinforcements.reduce((sum, r) => {
      const e = enemies.find((x) => x.key === r.enemyKey);
      return sum + (e?.cost || 0) * (r.count || 1);
    }, 0);
  }, [reinforcements, enemies]);

  const totalSpent = tacticCost + reinfCost;
  const remainingBudget = budget - totalSpent;

  // Handlers
  const handleAddReinforcement = () => {
    if (reinforcements.length >= 3) {
      toast('最多派遣 3 支突击援军', 'warn');
      return;
    }
    const defaultEnemy = enemies[0]?.key || '';
    setReinforcements([...reinforcements, { enemyKey: defaultEnemy, count: 1, routeIndex: 0, time: 15 }]);
  };

  const handleRemoveReinforcement = (idx) => {
    setReinforcements(reinforcements.filter((_, i) => i !== idx));
  };

  const handleUpdateReinforcement = (idx, patch) => {
    setReinforcements(reinforcements.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleSubmit = async () => {
    if (remainingBudget < 0) {
      toast('指挥点数超出上限，请精简兵力配置', 'warn');
      return;
    }
    const plan = {
      normalKey: selNormal?.key || undefined,
      eliteKey: selElite?.key || undefined,
      tacticId: selTactic?.id || 'rush',
      routeStrategy,
      reinforcements: reinforcements.filter((r) => r.enemyKey && r.count > 0),
    };
    const ok = await actions.invaderPlan(plan);
    if (ok) {
      toast('作战指令已下达，全军进入预备状态！', 'success');
    }
  };

  const handleUnready = async () => {
    await actions.ready(false);
  };

  if (collapsed) {
    return html`<aside class="invaderbar invaderbar--collapsed">
      <div class="invaderbar__collapsed-box brackets">
        <span class="invaderbar__tag">👹 敌方总指挥终端</span>
        <span class="invaderbar__cp-pill">CP <b>${remainingBudget}</b> / ${budget}</span>
        <${Button} size="sm" variant="danger" icon="menu" onClick=${() => onCollapse && onCollapse(false)}>
          展开部署终端
        <//>
      </div>
    </aside>`;
  }

  return html`<section class="invaderbar ${ready ? 'is-ready' : ''}">
    <header class="invaderbar__header">
      <div class="invaderbar__header-left">
        <span class="invaderbar__title">👹 敌方作战指挥终端<${MicroLabel}>INVASION COMMAND<//></span>
        <div class="invaderbar__cp-gauge ${remainingBudget < 0 ? 'is-over' : ''}">
          <span class="invaderbar__cp-label">⚡ 指挥点数 (CP)</span>
          <span class="invaderbar__cp-val num"><b>${remainingBudget}</b> / ${budget}</span>
          ${remainingBudget < 0 ? html`<small class="t-red">点数超限！</small>` : null}
        </div>
      </div>
      <div class="invaderbar__header-right">
        ${onCollapse ? html`<${Button} size="xs" variant="ghost" onClick=${() => onCollapse(true)}>✕ 收起终端<//>` : null}
      </div>
    </header>

    <div class="invaderbar__body">
      <!-- Section 1: Main Vanguard Squads -->
      <div class="invader-panel invader-panel--vanguard brackets">
        <div class="invader-panel__head">
          <span>主力编队配置</span>
          <${MicroLabel}>VANGUARD SQUADS<//>
        </div>
        <div class="invader-slots">
          <!-- Normal Vanguard Slot -->
          <div class="invader-slot ${ready ? 'is-locked' : ''}">
            <div class="invader-slot__badge">普通集群</div>
            <div class="invader-slot__card" onClick=${() => !ready && setPicker({ target: 'normal' })}>
              <${Img} src=${enemyIconUrl(gd.m, selNormal?.key)} class="invader-slot__art" />
              <div class="invader-slot__meta">
                <span class="invader-slot__name">${selNormal?.name || '默认普通怪'}</span>
                <span class="invader-slot__stats">
                  HP <b>${selNormal?.stats?.maxHp || '-'}</b> · ATK <b>${selNormal?.stats?.atk || '-'}</b>
                </span>
              </div>
              ${!ready ? html`<button type="button" class="invader-slot__btn">更换</button>` : null}
            </div>
            ${selNormal?.key ? html`<button type="button" class="invader-slot__info" onClick=${() => onDetail && onDetail(selNormal.key)} title="查看详情">🔍</button>` : null}
          </div>

          <!-- Elite Breacher Slot -->
          <div class="invader-slot ${ready ? 'is-locked' : ''}">
            <div class="invader-slot__badge invader-slot__badge--elite">精英攻坚</div>
            <div class="invader-slot__card" onClick=${() => !ready && setPicker({ target: 'elite' })}>
              <${Img} src=${enemyIconUrl(gd.m, selElite?.key)} class="invader-slot__art" />
              <div class="invader-slot__meta">
                <span class="invader-slot__name">${selElite?.name || '默认精英怪'}</span>
                <span class="invader-slot__stats">
                  HP <b>${selElite?.stats?.maxHp || '-'}</b> · DEF <b>${selElite?.stats?.def || '-'}</b>
                </span>
              </div>
              ${!ready ? html`<button type="button" class="invader-slot__btn">更换</button>` : null}
            </div>
            ${selElite?.key ? html`<button type="button" class="invader-slot__info" onClick=${() => onDetail && onDetail(selElite.key)} title="查看详情">🔍</button>` : null}
          </div>
        </div>
      </div>

      <!-- Section 2: Strategy & Tactics -->
      <div class="invader-panel invader-panel--strategy brackets">
        <div class="invader-panel__head">
          <span>行军路线与战术</span>
          <${MicroLabel}>TACTICS & ROUTES<//>
        </div>

        <div class="invader-strategy-row">
          <div class="invader-sublabel">路线主攻</div>
          <div class="invader-pills">
            ${ROUTE_OPTIONS.map((opt) => html`
              <button key=${opt.id} type="button"
                class="invader-pill ${routeStrategy === opt.id ? 'is-active' : ''} ${ready ? 'is-locked' : ''}"
                disabled=${ready}
                onClick=${() => setRouteStrategy(opt.id)}
                title=${opt.desc}>
                ${opt.name}
              </button>
            `)}
          </div>
        </div>

        <div class="invader-strategy-row">
          <div class="invader-sublabel">军令增益</div>
          <div class="invader-tactics">
            ${tactics.map((t) => html`
              <button key=${t.id} type="button"
                class="invader-tactic-btn ${tacticId === t.id ? 'is-active' : ''} ${ready ? 'is-locked' : ''}"
                disabled=${ready}
                onClick=${() => setTacticId(t.id)}>
                <div class="invader-tactic-btn__top">
                  <span class="invader-tactic-btn__name">${t.name}</span>
                  <span class="invader-tactic-btn__cost num">${t.cost > 0 ? `${t.cost} CP` : '免费'}</span>
                </div>
                <div class="invader-tactic-btn__desc">${t.desc}</div>
              </button>
            `)}
          </div>
        </div>
      </div>

      <!-- Section 3: Reinforcements -->
      <div class="invader-panel invader-panel--reinf brackets">
        <div class="invader-panel__head">
          <span>空降突击援军 (${reinforcements.length}/3)</span>
          <${MicroLabel}>AIR-DROP SQUADS<//>
        </div>

        <div class="invader-reinfs">
          ${reinforcements.map((r, idx) => {
            const reinfEnemy = enemies.find((x) => x.key === r.enemyKey);
            const unitCost = reinfEnemy?.cost || 1;
            const squadCost = unitCost * (r.count || 1);
            return html`
              <div key=${idx} class="invader-reinf-item ${ready ? 'is-locked' : ''}">
                <div class="invader-reinf-item__icon" onClick=${() => !ready && setPicker({ target: 'reinf', reinfIdx: idx })}>
                  <${Img} src=${enemyIconUrl(gd.m, r.enemyKey)} class="invader-reinf-item__art" />
                  <span class="invader-reinf-item__cost num">${squadCost} CP</span>
                </div>
                <div class="invader-reinf-item__controls">
                  <div class="invader-reinf-item__title">
                    <span>${reinfEnemy?.name || r.enemyKey}</span>
                    ${!ready ? html`<button type="button" class="invader-reinf-item__del" onClick=${() => handleRemoveReinforcement(idx)}>✕</button>` : null}
                  </div>
                  <div class="invader-reinf-item__row">
                    <!-- Route select -->
                    <select class="invader-select" disabled=${ready} value=${r.routeIndex}
                      onChange=${(e) => handleUpdateReinforcement(idx, { routeIndex: Number(e.target.value) })}>
                      <option value="0">主路/上路</option>
                      <option value="1">支路/下路</option>
                    </select>

                    <!-- Spawn Time -->
                    <select class="invader-select" disabled=${ready} value=${r.time}
                      onChange=${(e) => handleUpdateReinforcement(idx, { time: Number(e.target.value) })}>
                      <option value="10">10 秒出击</option>
                      <option value="15">15 秒出击</option>
                      <option value="20">20 秒出击</option>
                      <option value="30">30 秒出击</option>
                    </select>

                    <!-- Count -->
                    <div class="invader-counter">
                      <button type="button" disabled=${ready || r.count <= 1} onClick=${() => handleUpdateReinforcement(idx, { count: r.count - 1 })}>-</button>
                      <span class="num">${r.count}</span>
                      <button type="button" disabled=${ready || r.count >= 3} onClick=${() => handleUpdateReinforcement(idx, { count: r.count + 1 })}>+</button>
                    </div>
                  </div>
                </div>
              </div>
            `;
          })}

          ${reinforcements.length < 3 && !ready ? html`
            <button type="button" class="invader-add-reinf" onClick=${handleAddReinforcement}>
              <${Icon} name="plus" />
              <span>添加突击小队</span>
            </button>
          ` : null}
        </div>
      </div>

      <!-- Section 4: Action Ready Panel -->
      <div class="invader-panel invader-panel--action brackets">
        <div class="invader-panel__head">
          <span>部署状态</span>
          <${MicroLabel}>DEPLOYMENT STATUS<//>
        </div>
        <div class="invader-action-box">
          <div class="invader-action-summary">
            <div>战术军令: <b>${selTactic?.name || '无'}</b> (${tacticCost} CP)</div>
            <div>空降援军: <b>${reinforcements.length} 支</b> (${reinfCost} CP)</div>
            <div>总消耗点数: <b class="num ${remainingBudget < 0 ? 't-red' : 't-mint'}">${totalSpent} CP</b></div>
          </div>

          ${ready ? html`
            <div class="invader-ready-status">
              <span class="invader-ready-badge">✓ 指令已下发 · 预备中</span>
              <${Button} size="md" variant="secondary" onClick=${handleUnready}>
                重新调整部署
              <//>
            </div>
          ` : html`
            <${Button} size="lg" variant="danger" icon="flash" disabled=${remainingBudget < 0 || !editable}
              onClick=${handleSubmit}>
              ⚡ 下发指令并就绪
            <//>
          `}
        </div>
      </div>
    </div>

    <!-- Enemy Picker Modal -->
    ${picker ? html`
      <div class="invader-picker-modal" onClick=${() => setPicker(null)}>
        <div class="invader-picker-modal__dialog brackets" onClick=${(e) => e.stopPropagation()}>
          <header class="invader-picker-modal__head">
            <h3>
              选择单位 — ${picker.target === 'normal' ? '普通集群' : picker.target === 'elite' ? '精英攻坚' : '空降援军'}
            </h3>
            <button type="button" class="invader-picker-modal__close" onClick=${() => setPicker(null)}>✕</button>
          </header>
          <div class="invader-picker-modal__list">
            ${(picker.target === 'normal' ? normalEnemies : picker.target === 'elite' ? eliteEnemies : enemies).map((e) => html`
              <div key=${e.key} class="invader-picker-card">
                <div class="invader-picker-card__art-wrap">
                  <${Img} src=${enemyIconUrl(gd.m, e.key)} class="invader-picker-card__art" />
                  <span class="invader-picker-card__cost num">${e.cost} CP</span>
                </div>
                <div class="invader-picker-card__info">
                  <div class="invader-picker-card__name-row">
                    <span class="invader-picker-card__name">${e.name}</span>
                    <span class="badge ${e.rank === 'ELITE' ? 'badge--elite' : ''}">${e.rank === 'ELITE' ? '精英' : '普通'}</span>
                    ${e.isFly ? html`<span class="badge badge--fly">飞行</span>` : null}
                  </div>
                  <div class="invader-picker-card__stats">
                    <span>生命: <b>${e.stats?.maxHp || '-'}</b></span>
                    <span>攻击: <b>${e.stats?.atk || '-'}</b></span>
                    <span>防御: <b>${e.stats?.def || '-'}</b></span>
                    <span>法抗: <b>${e.stats?.res || '-'}</b></span>
                  </div>
                  <div class="invader-picker-card__btns">
                    <${Button} size="sm" variant="danger" onClick=${() => {
                      if (picker.target === 'normal') setNormalKey(e.key);
                      else if (picker.target === 'elite') setEliteKey(e.key);
                      else if (picker.target === 'reinf' && picker.reinfIdx != null) {
                        handleUpdateReinforcement(picker.reinfIdx, { enemyKey: e.key });
                      }
                      setPicker(null);
                    }}>选择配置<//>
                    <${Button} size="sm" variant="ghost" onClick=${() => onDetail && onDetail(e.key)}>情报<//>
                  </div>
                </div>
              </div>
            `)}
          </div>
        </div>
      </div>
    ` : null}
  </section>`;
}
