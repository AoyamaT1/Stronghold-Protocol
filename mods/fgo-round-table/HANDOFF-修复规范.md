# HANDOFF · FGO 圆桌模组修复规范（W-审 出品，2026-10-16）

> ## ⚠️ 状态更新（2026-10-16 08:20，W-审 复核后）
> **下面 9 类致命问题 W-FGO 已于 02:45 修复完毕，并经 W-审 逐条实测 + 端到端验收（10/10）确认。**
> 本文档**现在仍然有效的是**：§0 验收纪律与三条禁令、§1.2 的机制解释（层数链路）、§1.7 的钩子对照表、
> §2 的 fx 机制说明（注册已完成）、**§3 语音管线（已落地 267 条真音频，但 §3.5 的安装器缺口与普攻/受击语音 slot 仍待补）**、
> §4 立绘机制、§5 验收清单、§6 雷区速查。
> **已完成、不必重做的**：§1.1 三技能 index、§1.3 isMember、§1.4 小盟约 id、§1.5 特质/天赋拆分、§1.6 数值降档、§1.8 表现层接线。
> 各条已就地标注状态。

> **给接手方的硬性说明**：本文档每一条都已在当前工作树上**实测复现**（含 file:line 与运行输出）。
> 照着改即可，**不要臆测 API、不要凭记忆写字段名**——文里给的签名/模板都是从磁盘源码里抄的。
> `test/mods/fgoRoundTable.test.js` 现在 8/8 全绿，但它**只断言"记录存在/条数/字段形状"**，
> 下面 9 类致命问题它一条都没覆盖。**别拿 8/8 当完成标准。**

---

## 0. 验收纪律（先读这一节）

改完必须按顺序跑，**全绿才算完成**：

```bash
node --test test/mods/fgoRoundTable.test.js        # 现有 8 项（数据形状）
node --test test/render/boardart.test.js           # fx 注册（会点名未注册的 kind）
node tools/setup.mjs --check                       # 素材必须 0 缺失（§3 红线，否则启动会卡死）
node tools/simrun.mjs --mode normal --lineup fgo   # 无头模拟 0 报错
node -e "import('./public/js/render/app.js').then(()=>console.log('OK'))"   # 渲染层语法自检
```

**动手前的三条禁令**（`AGENT-COORD.md` §3）：

1. **绝不向 `data/assets.json` / `mods/*/data/assets.json` 登记磁盘上不存在的文件** —— `tools/setup.mjs` 每次启动全量扫描，缺一个就触发 `fetch-assets.mjs` 去 GitHub 拉私有资源 → 卡死在 `[files] n/8939`，玩家进不去游戏。
2. **绝不整文件 `Write` `data/chess.json` / `sim/kits.js`** —— 会抹掉别的窗口的改动。用 Edit 或**限定 key 的 node 脚本**（读最新磁盘内容 → 只改 `*_fgo_*` → 写回）。
3. **改完 `sim/*.js` 必须同步部署副本** `server/sim/content/mods/fgoRoundTable/*`，并重启服务端。

---

## 1. 九类致命问题：根因与精确修法

### 1.1 【致命】三个技能只有一个能用

**根因**：fgo 的 30 条棋子 `skills[]` 每项**缺 `index`(0/1/2)**、**缺 `isDefault`**，`rec.skill` 也缺 `index`。

两条取值路径同时断（`shared/loadoutRecord.js:24-28`）：

```js
const defSkill = rec.skill && Number.isInteger(rec.skill.index) ? rec.skill.index
               : (skills?.find((s) => s && s.isDefault)?.index ?? null);   // ← 两条都 null
```

实测：`getChess(id,{skillIndex:0/1/2})` 三种入参**返回同一个** `skchr_fgo_*_3`；客户端 `loadoutOptions` 返回 `{"skills":[]}` → 调配界面技能按钮 **0 个**。

**修法**（三处都要改，`_a` 和 `_b` 各一遍 = 30×3）：每个技能对象补 `"index": 0|1|2` + `"overrideTokenKey": null`；**只有 S3 填 `"isDefault": true`**，S1/S2 填 `false`；`rec.skill.index` 填 `2`；顺手删掉引擎从不读的 `"requireTarget"`。

判定依据（三条独立证据方向一致）：
- 官方 350 条棋子 **100% 满足** `rec.skill.index === skills[isDefault].index`，没有一次例外；
- `docs/干员设计指南.md:29` 的模板明写 `// 默认技能` 指向 `_3`；
- fgo 现有 30 条的 `rec.skill` **全部是 `_3`**，标 S3 为默认不会改变任何现有对局表现；标 S1 反而会与 `rec.skill` 打架。

生成器源头是 `tools/generate_fgo_chess_data.mjs:925-946` 的 `mappedSkills`，**改生成器 + 重生成**，或写一个限 key 的补丁脚本（推荐前者，避免下次重生成又丢）。

---

### 1.2 【致命】圆桌盟约层数不生效（4 个独立根因，缺一不可）

**根因① `S.gainLayers` 签名用错**（7 处，全部静默 no-op，返回 0）。

引擎签名（`server/sim/content/support/index.js:332`）——**第一个参数是 battle 位置参数，其余全在对象里**：

```js
export function gainLayers(battle, { playerId, bonds, n, requireActive = true,
                                     source = null, reason = 'content',
                                     cap = Infinity, capKey = null } = {})
```

正确写法（照抄 `mods/limbus-company/sim/bonds.js:85`）：

```js
S.gainLayers?.(battle, { playerId: pid, bonds: ['roundTable'], n: 2, source: unit, reason: 'fgo:gareth' });
```

要改的 7 处：`sim/bonds.js:74`、`sim/items.js:36`、`sim/kits.js:135,136,202,996,997`。
其中 `kits.js:136`（`unyieldingShip`）和 `:997`（`precisionShip`）**连盟约 id 都是错的**，见 1.4。

**根因② 30 条守备部队缺 `bbStr.add_method`** —— `server/sim/content/garrisons/meta.js:119-137` 的 `switch` 落 `default: break` → **获得干员时永远 0 层**（这是"层数没涨"的主通道）。

fgo 现在写的是 `effectKey: "SERVER_ADD_BOND_METHOD"` + `bb:{multi:2}` + `bbStr:{bond:"roundTable", op_id:"gareth"}`，五处错：
1. 缺 `add_method`（`SERVER_ADD_BOND_METHOD` 的合法值只有 5 个：`shoplv` / `round_gain_char` / `hand_count` / `same_row` / `same_bond_diff_lv`）；
2. 一条 garrison 塞了两种触发（`<获得时>` + `<被击倒时>`）—— `eventType` 是**单值**，后半句**永远不会执行，必须拆成两条**；
3. `bbStr.bond` 只写了 `roundTable`，文案里的【不屈】没写进去；
4. `op_id` 是 handler 从不读的键；
5. `multi` 是「局势值 × multi」的倍率，不是固定层数。

**修法**：拆成 2 条 garrison，`chess.garrisonIds` 改成数组两项。模板（真实可用，抄 `garrison_25_a` + `garrison_46_a`）：

```json
"garrison_fgo_gareth_a": {
  "garrisonId": "garrison_fgo_gareth_a",
  "desc": "<获得时>自身所属盟约层数+2（无需激活盟约）",
  "descRaw": "<获得时>自身所属盟约层数<@ba.vup>+2</>（无需激活盟约）",
  "eventType": "SERVER_GAIN", "eventTypeDesc": "单次叠加", "eventTypeIcon": "icon_bond",
  "effectType": "SERVER_ADD_BOND_CHESS_ALL", "effectKey": "SERVER_ADD_BOND_CHESS_ALL",
  "battleRuneKey": null, "charLevel": 0,
  "bb": { "count": 2 }, "bbStr": {},
  "owners": ["chess_fgo_1_gareth_a", "chess_fgo_1_gareth_b"]
},
"garrison_fgo_gareth_death": {
  "garrisonId": "garrison_fgo_gareth_death",
  "desc": "<战斗中>自身被击倒时，使已激活的【圆桌】【不屈】层数+2",
  "descRaw": "<战斗中>自身被击倒时，使已激活的【圆桌】【不屈】层数<@ba.vup>+2</>",
  "eventType": "IN_BATTLE", "eventTypeDesc": "持续叠加", "eventTypeIcon": "icon_battle",
  "effectType": "ADD_BOND", "effectKey": "act1autochess_gar_event_selfdead",
  "battleRuneKey": "env_gbuff_new_with_verify", "charLevel": 0,
  "bb": { "bond_add_count": 2 },
  "bbStr": { "key": "act1autochess_gar_event_selfdead", "bond_type": "bond_by_id",
             "bond_id": "roundTable,indomShip", "bond_add_type": "by_count" },
  "owners": ["chess_fgo_1_gareth_a", "chess_fgo_1_gareth_b"]
}
```

> `requireActiveOf`（`garrisons/meta.js:39-43`）**只看文案**：含「无需激活」→ false；含「已激活」→ true；其余一律 false。写文案时务必带这三个字，否则语义反了。
> `SERVER_ADD_BOND_CHESS_ALL` 会自动把棋子 `bonds[]` 里的**全部**盟约各 +count，不用手写 bond id。

**根因③ `registerMeta` 用了不存在的 ctx API** —— `sim/bonds.js:196-213` 里的 `ctx.getLayers / getMeta / setMeta / addItem` **全部不存在**，真名是：

| 幻觉名 | 真名 | 位置 |
|---|---|---|
| `ctx.getLayers(id)` | `ctx.layers(id)` | `server/match/effectsMeta.js:475` |
| `ctx.getMeta(k)` / `ctx.setMeta(k,v)` | `ctx.counter(k)` / `ctx.setCounter(k,v)` | `:489 / :490` |
| `ctx.addItem(id)` | `ctx.grantItem(id, {source})` | `:567` |

现成范式照抄 `server/sim/content/bonds/core.js:687-717` 的维多利亚 25 层发装备（`payHammers`）：

```js
const due = Math.floor(ctx.layers('roundTable') / 25);
for (let guard = 0; guard < 100; guard++) {
  const paid = ctx.counter('fgo:roundTable:milestone') | 0;
  if (paid >= due) break;
  ctx.setCounter('fgo:roundTable:milestone', paid + 1);
  const id = ctx.rollItem({ pool: /* 你的池 */ });
  if (id) ctx.grantItem(id, { source: 'bond:roundTable' });
}
```
并把这段挂到 `HAMMER_HOOKS` 那组钩子上（`onLayers/onRoundStart/onPrepStart/onPrepEnd/onBuy/onGain/onSold/onMerge`）。
顺手删掉 `ctx.rng ? ctx.rng() : Math.random()` 的兜底——`ctx.rng` 恒存在，`Math.random` 是联机确定性红线。

另外 `mods/fgo-round-table/sim/meta.js` 是**死文件**：`server/sim/content/index.js:56-57` 的 `MODULES` 只加载 9 个域文件，没有任何 import 方。要么接线，要么删。

**根因④ `layerMilestones` 格式错** —— `data/bonds.json` 里 roundTable 写的是裸数字数组 `[25,50,75,...]`，官方 schema 是**对象数组** `[{layer:100, mode, effect}]`（`server/match/effectsMeta.js:186-188` 用 `Number(x.layer) > 0` 读）。任何现成引擎逻辑都读不到 → 必须自己实现（即根因③那段）。

**已经是对的、别动**：`battle.on('layerGain')` → `battle.after(0, applyStatsBuff)` 这条刷新链**实测有效**（层数一涨，`bond:roundTable:stats` 的 atkPct/defPct 立刻重算）。`roundTable` 的注册也是对的（`isCore:true`、`thresholds:[3,6,9]`、`weight:12`）。

---

### 1.3 【致命】`S.isMember` 参数错序（2 处）

真签名是 `isMember(battle, unit, bondId)`（`support/index.js:201`）。错的两处：

- `sim/kits.js:1064`（阿尔托莉雅 S1）→ 圆桌干员永远走非圆桌档 25%，拿不到 45%；
- `sim/kits.js:1419`（摩根特质）→「全场圆桌下次技能视为蓄力」**永不触发**。

---

### 1.4 【致命】10 个小盟约 id 是杜撰的（48/90 条引用落空）

`data/bonds.json` 里**根本不存在**这些 id，UI 回退是 `rec?.name || id` → **界面上直接显示英文 id + `?` 图标，点开盟约弹窗是空白**（`bondStrip.js:109` 查不到直接 `return null`）。加层请求也会被 `economy.js:44` 的 `if (!this.gd.bond(bondId)) return 0` 静默丢弃。

| 错的 id | 正确 id | 中文 | 阈值 |
|---|---|---|---|
| `unyieldingShip` | `indomShip` | 不屈 | [2,3] |
| `fortitudeShip` | `steadShip` | 坚守 | [2,3] |
| `assistShip` | `deputShip` | 助力 | [2,3] |
| `precisionShip` | `preciShip` | 精准 | [2,3] |
| `agilityShip` | `swiftShip` | 迅捷 | [2] |
| `miracleShip` | `miraShip` | 奇迹 | [2] |
| `assaultShip` | `raidShip` | 突袭 | [2] |
| `stuntShip` | `skillfulShip` | 灵巧 | [2] |
| `farsightShip` | `visiShip` | 远见 | [2] |
| `harmonyShip` | `maniShip` | 调和 | [1] |

已正确的：`roundTable` / `arcaneShip`(奥术) / `swiftShip` / `soloShip`(独行)。

**注意两点**：
1. `swiftShip` 被 `agilityShip` 和原本的 `swiftShip` 共用会重复——按设计意图把「灵巧」那条挪走，同一干员别给两个重复盟约。
2. `maniShip`（调和）是引擎特殊盟约：`isMember` 会让调和干员**享受所有核心盟约**，`bondsMeta.js:120-126` 还会给核心盟约 **+1 count**。玛修的文案「自带【调和】」必须**真的往 `bonds[]` 里加 `maniShip`**，不能只写在文案里。
3. `mode_*_funny` 模式的禁用表包含 `skillfulShip/arcaneShip/miraShip/raidShip/soloShip/suntShip` → 这些在 funny 模式下会显示灰盘「本局禁用」。标准/困难/深渊模式禁用表为空，不受影响。

---

### 1.5 【致命】特质直接复用特质（`trait` ≡ `talents[0]`）

实测 30/30 条：`trait.desc` 与 `talents[0].desc` **逐字节同文**，且 `talents[0]` **缺 `name`、缺 `index`** → 客户端天赋栏 `detailPanel.js:334` 的 `t.name` 过滤 → **30/30 全空**。

对照 limbus（`data/chess.json:133771/134038`）：`trait` 是**职业/阵营规则**（无 name/index，讲无视防御、精神值这类），`talents[]` 是**具名天赋**（必须有 index + name）。两者从不相同。

**修法**：每条干员拆成「1 条 trait + 2 条具名天赋」，从设计文档里各干员的**两档能力**里取：

```json
"trait": {
  "desc": "职业/阵营规则纯文本（数值写 bb）",
  "descRaw": "同上",
  "bb": { "def_ignore": 0.3 },
  "bbStr": {},
  "rangeGrid": null
},
"talents": [
  { "index": 0, "name": "天赋名（必须写，否则天赋栏不显示）",
    "desc": "…", "descRaw": "…", "bb": { "…": 0 }, "bbStr": {},
    "rangeGrid": null, "tokenKey": null, "hidden": false, "fromModule": false },
  { "index": 1, "name": "天赋名二", "desc": "…", "descRaw": "…", "bb": { "…": 0 },
    "bbStr": {}, "rangeGrid": null, "tokenKey": null, "hidden": false, "fromModule": false }
]
```

`index` 语义：**位置即下标**（`talentBb(chess,0)` 取第一条）；`index:-1` 是**隐藏的模组天赋**专用，**普通棋子的具名天赋绝不能用 -1**。

并且：**15 人里现在只有 Gareth / Morgan 写了 `install()`**，其余 13 人的特质全是文案。所有 `trait.bb` / `talents[].bb` 键在 JS 里**零引用**，必须逐个落地成 kit 里的真实现（读 `traitBb(chess)` / `talentBb(chess, i)`，参考 limbus 各罪人 kit 的写法）。

---

### 1.6 【致命】基础数值超纲（17/30 条、25 个字段级）

标尺：`docs/干员设计指南.md §4`（`DPS = atk / bat`，同阶不得超过 max）。

| 记录 | 问题 |
|---|---|
| `fgo_4_gawain_a` | DPS 624 > 上限 517 |
| `fgo_4_barghest_a` | hp 3200 > 2867、DPS 600 |
| `fgo_4_mash_a` | hp 3100 > 2867、def 680 > 557 |
| `fgo_6_artoria_a` | hp 3100、def 460、DPS 662 > 621 |
| `_b` 13 条 | `artoria_b` hp+63%/def+49%/DPS 954、`barghest_b` hp 4600/DPS 867、`mash_b` def 980(+76%)、`gawain_b` DPS 896、`percival_b`、`bedivere_b`、`tristan_b`、`mordred_b`、`lancelot_b`、`melusine_b`、`morgan_b`、`merlin_b`、`gareth_b` |

Tier 上限（DPS）：T1 502 / T2 478 / T3 702 / T4 517 / T5 640 / T6 621。
**修法**：优先压 `_b`（金卡是 1.44× 面板的粗暴设计，导致全面超纲），再压 4 条 `_a`。对照 limbus 的做法：`_a` 保持、（必要时）`_b` 降到同阶上限内。

---

### 1.7 【致命】死钩子与误用钩子

| 问题 | 位置 | 为什么错 | 正确做法 |
|---|---|---|---|
| `spec.onDamaged` **引擎从不调用** | `kits.js:80`（Gareth S2 受击回 SP）、`kits.js:896`（Mordred S2 赤雷反伤） | 运行时只有 `SkillRuntime.onDamaged()` 方法由 `damage.js:432` 走，**不是 spec 钩子** | 放进 `install(battle, unit)` 里 `battle.on('damaged', cb, { owner: unit })` |
| `onTick` 是**每模拟步 = 30 次/秒**（`battle/lifecycle.js:103`，`TICK=1/30`） | `kits.js:1208`（Merlin S3）、`kits.js:1291`（Castoria S3） | 代码按「每 0.5 秒一次」写的 → **治疗/回 SP 超设计值 ~15 倍** | 自己按 `dt` 累加计时器，或改走 `battle.every(0.5, fn)` |
| `attack:{atkScale}` 与 `onStart` 手动 `dealDamage` **并存 = 双重结算** | `kits.js:47-56`（Gareth S1 唯一一处） | 合成实验实测：一次施放 **2×1900 = 3800** | 二选一：要么走引擎 `attack`，要么只走 `onStart` 手动结算 |
| `type:'elemental'` **不传 `element` 字段 = 真伤** | `kits.js:435,486,567,1036,1366` 五处 | `damage.js:425`：没有 `element` 就按 true 结算，元素槽/引爆全不生效 | 走 `applyElement`，或补 `element: 'burn' | 'necrosis' | …` |

真正会被调用的技能钩子只有：**`onStart / onEnd / onTick / onAttack / onHit`**（外加 `attack.onHit` / `attack.onEachHit`）。

---

### 1.8 【已修】表现层死代码 —— 仅剩清理项

- ✅ `public/js/mods/fgo-fx-rig-audio.js` **已重写并真正接线**（W-审，2026-10-16）：导出 `installFgoFx(ctx)`，在 `public/js/render/app.js:385` 安装、`:1641` 分发（try/catch 兜住）。只做 FX_KINDS 画不出的三件事：宝具真名横幅（0.9s，同时只留一条）/ `roundTableDecision` 十三拘束法阵 / `skySupportBurst` 圣光环 / 宝具期间 BGM Ducking（60%，3.5s）。动画挂 `app.ticker` 且跟随暂停冻结；`extra.late` 的追帧事件不补演。回归测试 `test/render/fgofx.test.js`（11/11）。
- ✅ **已清理（2026-10-16）**：`mods/fgo-round-table/data/rigs.json` 与 `audio_map.json` **已删除**，连同
  `tools/fgo_asset_icon_audio_builder.py` 里生成它们的 `build_rigs_metadata()` / `build_audio_mapping()` 两个函数。
  两者全仓库零消费者（唯一引用方就是那个生成器）；ducking/throttling 的职责已由 `public/js/mods/fgo-fx-rig-audio.js`
  与引擎 `audio.js` 接管。删除后 `python -c ast.parse` 语法自检通过、`grep` 无残留引用。

---

## 2. 特效：50 个 kind 已注册完毕（**别重做**）

> **状态：已完成，已复验。** `public/js/render/fx/kinds.js:93-110` 已有全部 50 条（照本文配色表加的）。
> 复验结果：**50/50 全注册、`a` 值全合法、15 个宝具配色互不相同、`app.js` 语法自检 OK**。
> 回归测试 `test/render/fgofx.test.js` 会持续兜住（新增 fx 种类未注册即失败）。**这一节现在只用来看懂机制，不需要动手。**

**关键事实**：`battle.fx(kind, params)` **没有 `tint`/`color` 通道**（`server/sim/battle/events.js:10-13` 把 `x/y` 之外的字段原样塞进 `extra`，但 `simfx.js` 里根本没有读 `ex.tint` 的代码）。**颜色只能由 `FX_KINDS[kind].c` 决定**。

所以做法唯一：**往 `public/js/render/fx/kinds.js` 的 `FX_KINDS` 里加条目**。格式：

```js
kindName: { a: '绘制分支', c: 0xRRGGBB, r?: 半径, dur?: 秒, smoke?: 0xRRGGBB, pt?: true, heavy?: true }
```

`a` 的合法取值（照抄即用，对应 `simfx.js:74-329` 的 case）：
`blast shell zone wall telegraph chill heal healAoe sp shield shatter summon vanish blink move qi wave mark reticle buff lift sleep crit dodge counter dp coin crate down beam bolt flame strike pillar volley lp element none`

选型建议：宝具/光炮 → `beam`|`bolt`|`pillar`；斩击 → `counter`|`qi`；爆炸 AoE → `blast`（**`r>=12` 会退化成整屏闪光**）；领域/持续 → `zone` + `dur`；强化/护盾 → `buff`|`shield`；变身/位移 → `blink`|`summon`|`vanish`。

**逐角色配色表**（设计文档原文的 16 进制）：

| 干员 | 主色 | 辅色 |
|---|---|---|
| 阿尔托莉雅 S3 | `0xFFE066` | `0xFFF9C4` |
| 莫德雷德 S3 | `0xFF1E42` | `0x1E1E24` |
| 高文 S2/S3 | `0xFFB142` | `0xFF5252` |
| 贝德维尔 / 剑兰 | `0x80FFDB` | `0x2E86DE` |
| 崔斯坦 / 芭万·希 | `0xD2FBF0` | `0xB53471` |
| 玛修 / C呆 | `0xF8EFBA` | `0x74B9FF` |
| 梅林 S3 | `0xFDA7DF` | `0xA3CB38` |
| 摩根 S3 | `0x341F97` | `0x00D2D3` |
| 梅柳齐娜 S3 | `0x48DBFB` | `0xFF3F34` |

示例条目：

```js
artoriaExcalibur: { a: 'beam',  c: 0xFFE066 },
morganS3:         { a: 'zone',  c: 0x341F97, dur: 4, r: 2 },
melusineS3Beam:   { a: 'bolt',  c: 0x48DBFB },
mashS3Form2:      { a: 'pillar', c: 0xF8EFBA },
```

触发侧**不用改**（`kits.js` 现有的 `battle.fx?.('garethS1', {x,y,id})` 全部保留）；要给宝具加范围/时长就补 `r` / `dur`（`simfx.js:67,69` 认 `r|radius`、`dur|duration`）。

> 顺带：`test/render/boardart.test.js:139-171` 会扫描 `server/sim/**` 里的字面 fx kind 并逐个点名未注册的。它的正则**匹配不到 `fx?.(`**，所以 fgo 的 50 个现在隐身——把 `fx?.(` 改成 `fx(` 就能让这个测试帮忙兜底。

---

## 3. 语音：真·拉取管线（已打通，可执行）

### 3.1 数据源（已实测 200 OK + 真 mp3）

```
清单：https://api.atlasacademy.io/nice/JP/servant/{svtId}?lore=true
      → profile.voices[]  （没有 ?lore=true 时 profile 是空对象 {}，这就是 15 份 official_voices_manifest.json 全是 {} 的原因）
音频：https://static.atlasacademy.io/JP/Audio/{folder}/{voiceId}.mp3
      folder = Servants_{svtId} | NoblePhantasm_{svtId} | ChrVoice_{svtId}
```
（URL 构造来自 `atlasacademy/fgo-game-data-api` 的 `app/schemas/nice.py:183` `audio = "{base_url}/{region}/Audio/{folder}/{id}.mp3"` 与 `app/core/nice/svt/voice.py` 的 `get_voice_folder`。）

### 3.2 15 人 svtId（已核实）

| 干员 | charId | svtId |
|---|---|---|
| 加雷斯 | `char_fgo_gareth` | 303900 |
| 贝德维尔 | `char_fgo_bedivere` | 101200 |
| 崔斯坦 | `char_fgo_tristan` | 200800 |
| 珀西瓦尔 | `char_fgo_percival` | 304700 |
| 芭万·希 | `char_fgo_baobhan` | 204300 |
| 高文 | `char_fgo_gawain` | 100700 |
| 巴格斯特 | `char_fgo_barghest` | 105000 |
| 玛修 | `char_fgo_mash` | 800100 |
| 兰斯洛特 | `char_fgo_lancelot` | 102000 |
| 莫德雷德 | `char_fgo_mordred` | 100900 |
| 梅柳齐娜 | `char_fgo_melusine` | 304800 |
| 阿尔托莉雅 | `char_fgo_artoria` | 100100 |
| 梅林 | `char_fgo_merlin` | 500800 |
| C呆 | `char_fgo_castoria` | 504500 |
| 摩根 | `char_fgo_morgan` | 704000 |

### 3.3 语音组 → 引擎 slot 映射

引擎**只认这些 slot**：`start / faceEnemy / select / place / skill1..4 / resultFour / resultThree / resultTwo / resultLose / gacha / squad / squadFirst`（`public/js/audio.js` + `tools/assets/audio.mjs:371 VOICE_SLOTS`）。

| FGO 语音组 / 行名 | 引擎 slot | 说明 |
|---|---|---|
| `firstGet` 「召喚」 | `gacha` | 招募入手（设计文档时点①） |
| `battle` 「開始 1/2/3」 | `start`（全场第一个）/ `place`（其余） | 时点④ |
| `battle` 「コマンドカード 1/2/3」 | `select` | 点选（时点③，自带 2s 防连点） |
| `battle` 「スキル 1」 | `skill1` | 时点⑦/⑧ |
| `battle` 「スキル 2」 | `skill2` | 时点⑧ |
| `treasureDevice` 「宝具」（5 条全下） | `skill3` | 时点⑨，配 ducking |
| `battle` 「勝利 1/2/3」 | `resultFour/Three/Two` | 时点⑩ |
| `battle` 「戦闘不能 1/2」 | `resultLose` | 时点⑩ |
| `battle` 「ダメージ 1~4」 | **`hurt`（已新增）** | 时点⑩。✅ 已在 `audio.js` 加出该 slot |
| `battle` 「アタック 1~4」 | **`attack`（已新增）** | 时点⑥。✅ 已在 `audio.js` 加出该 slot |

> ✅ **已于 2026-10-16 落地**：引擎 `public/js/audio.js` 新增 `attack` / `hurt` 两个 slot ——
> `VOICE_PRIORITY` = hurt 55 / attack 40（都压在 作战中 70 之下，技能台词永不被切；hurt > attack + preemptMargin，
> 受击可顶掉普攻、反之不行）；`VOICE_COOLDOWN_MS` 两者都是 **6000 ms**（同干员 6 秒）；
> 触发在 `handleBattleEvents`：`['atk']` 按 `VOICE_ATTACK_CHANCE = 0.15` 喊、`['dmg']` 只在
> `amount / maxHp > VOICE_HURT_HP_RATIO = 0.2` 时喊（`_track` 因此多存了一个 `maxHp`）。
> 回归测试 `test/ui/voice-attack-hurt.test.js`（6/6）。**新增 slot 只影响有对应语音的干员，其余静默降级。**

### 3.4 落地路径与清单

```
mods/fgo-round-table/assets/audio/voice/jp/char_fgo_gareth/start_1.mp3     ← 源（随 mod 分发）
        ↓ node tools/mod.mjs install fgo-round-table
public/assets/audio/voice/jp/char_fgo_gareth/start_1.mp3                    ← 运行时
```

清单写进 `mods/fgo-round-table/data/assets.json`：

```json
"audio": {
  "voice": {
    "char_fgo_gareth": {
      "start":  "/assets/audio/voice/jp/char_fgo_gareth/start_1.mp3",
      "place":  ["…/place_1.mp3", "…/place_2.mp3"],
      "select": ["…/select_1.mp3", "…/select_2.mp3", "…/select_3.mp3"],
      "skill1": "…/skill1.mp3",
      "skill2": "…/skill2.mp3",
      "skill3": ["…/np_1.mp3", "…/np_2.mp3"],
      "resultFour": "…/win_1.mp3", "resultThree": "…/win_2.mp3", "resultTwo": "…/win_3.mp3",
      "resultLose": "…/lose_1.mp3",
      "gacha": "…/summon_1.mp3"
    }
  }
}
```

**值可以是字符串（单条）或字符串数组（随机抽一条）**。播放 key 是 **charId**（引擎传 unit 的 `spine`，fgo 棋子无 `spine` 字段 → 回退 `charId`，正好命中）。

### 3.5 三个必踩的坑

1. **FGO 专用安装器不搬运音频**：`tools/install_fgo_round_table_mod.mjs:164-190` 只合并 `chars/bonds/skills/items`、只拷 4 个子目录，**不含 `audio`**。要么改用 `node tools/mod.mjs install fgo-round-table`（`mod.mjs:209-218` 合并 voice、`:224-228` 整棵拷 assets），要么照抄那两段。
2. **`mods/fgo-round-table/data/assets.json` 的 `skills` 段是坏 schema（定时炸弹）**：
   - 根 `data/assets.json` 现在是**字符串**（能跑，图标路径 `/assets/skills/skill_icon_skchr_fgo_*.png` 的文件确实存在，所以 `setup.mjs --check` 显示 0 缺失）；
   - mod **源**里却是**对象** `{"icon": "…"}` —— 而 `tools/mod.mjs:201` 是 `Object.assign`，**一旦重跑 `node tools/mod.mjs install fgo-round-table`，对象值就会覆盖根里的字符串，45 个技能图标立刻全退回字母占位**（`public/js/assets.js:142-152` 的 `str()` 对对象返回 null）。
   - **修法**：把 mod 源的 `skills` 全部改成**纯字符串**，且对齐 §3 红线（单数目录、无 `skill_icon_` 前缀）：`"skchr_fgo_x_1": "/assets/skill/skchr_fgo_x_1.png"`。`public/assets/skill/` 下 45 个文件已经就位，改完清单即可。
3. **缺文件绝不许登记**（§3 红线）。下完全部语音后必须 `node tools/setup.mjs --check` → **0 缺失**。

### 3.6 缺失文件的降级（无需额外处理）

清单里没有该 slot → `voice()` 直接 `return false`；文件 404 → 只打一次 `console.warn`，静音。`preload.js` 只是 HTTP 预热器，404 不阻塞游戏。

---

## 4. 立绘/资源：现在有一个"看起来做了其实拿不到"的 bug

W-Fix 已经把立绘 standee + 呼吸/倾斜/旋转/跃动/倒下/变扁/光效做进 `public/js/render/units.js:1471-1510`，方向正确。**但立绘实际拿不到**：

```js
// public/js/render/units.js:703
const sUrl = a.standee(this.info.avatar || this.info.defId, { e2: … });
// public/js/render/app.js:727
avatar: rec?.assets?.avatar || rec?.charId || null
```

fgo 棋子的 `assets.avatar` 是**路径** `"/assets/char/avatar/char_fgo_gawain.png"`（官方 schema 是**裸 charId** `"char_498_inside"`）。`standeeUrl` 拿路径去查 `chars` 表必然落空，`startsWith('char_fgo_')` 也命中不了 → 两条路都断。

实测：
```
standeeUrl(m, '/assets/char/avatar/char_fgo_gawain.png') -> null      ← 当前实际入参
standeeUrl(m, 'char_fgo_gawain')                         -> "/assets/char/standee/char_fgo_gawain.png"   ← 正确
```

**修法（二选一）**：
- **推荐**：把 30 条 fgo 棋子的 `assets.avatar` / `assets.portrait` 改成**裸 charId**（与官方 schema 一致，顺带让 `assetUrls.js:21/37` 不再依赖 charId 兜底）；
- 或让 `units.js:703` 在 `info.avatar` 失配时回退 `info.spine`。

`chars.<charId>.standee` / `.standeeE2` 的登记已经对了（`public/assets/char/standee/` 有 30 个文件，0 缺失）。`assets.js:111,118` 里硬编码的 `char_fgo_` 特判建议改成数据驱动。

---

## 5. 验收清单（逐条可执行）

- [ ] `node --test test/mods/fgoRoundTable.test.js` —— 8/8
- [ ] **新增**：写一条测试断言"三个技能都能被选中"，例如
      `assert.deepEqual(getChess('chess_fgo_1_gareth_a',{skillIndex:0}).skill.id, 'skchr_fgo_gareth_1')`（0/1/2 三种入参返回三个不同 id）
- [ ] **新增**：写一条测试断言"场上有 3 名圆桌 → 开技能后 `bondLayers(roundTable)` 真的增加"
- [ ] **新增**：写一条测试断言"30 条棋子的 `bonds[]` 全部能在 `data/bonds.json` 里查到"（现在 10 个查不到）
- [ ] **新增**：写一条测试断言"每条干员的 `talents[]` 都有 `name` 且与 `trait` 不同文"
- [ ] `node --test test/render/fgofx.test.js` —— 11/11（fx 注册 + 演出层行为契约，已就位）
- [ ] `node --test test/render/boardart.test.js` —— 不出现 fgo 的 kind 名（当前该文件另有 3 个**与本模组无关**的既有失败：`knockout/ward/miss` 是别的 mod 的 fx、假 PIXI 缺 `P.Graphics` 构造器、本机未提取美术时的素材断言）
- [ ] `node tools/setup.mjs --check` —— **0 缺失**
- [ ] `node tools/simrun.mjs --mode normal --lineup fgo` —— 0 报错
- [ ] `node -e "import('./public/js/render/app.js').then(()=>console.log('OK'))"` —— OK
- [ ] 实机：进战斗能看到 3 个技能按钮、能切换；立绘带呼吸动画；开宝具时特效有颜色且不重样；小盟约显示中文名不是英文 id；天赋栏有内容

---

## 6. 雷区速查

| 别做 | 后果 |
|---|---|
| 向 `assets.json` 登记不存在的文件 | 启动器卡死在 `[files] n/8939`，玩家进不去游戏 |
| `Write` 整个 `data/chess.json` / `sim/kits.js` | 抹掉别的窗口的改动 |
| 在 `sim/` 里用 `Math.random()` | 联机确定性红线（回放/服务端校验不一致） |
| 单次伤害 ≥ 300000 | `BOSS_HIT_LIMIT` 判定**整次作废**（不是截断），所以 5~6 段拆 Hit 是对的，别合回去 |
| 反伤/受击钩子不加 `tags:['counter']` | 32 层 `MAX_HOOK_DEPTH` 死循环 |
| 改 `public/js/render/units.js` 后不跑语法自检 | 上次重复追加 `export const ALIAS_TINT` 直接把 Pixi 渲染打成 2D 降级视图 |
| 拿 `test/mods/fgoRoundTable.test.js` 8/8 当验收 | 上面 9 类致命问题一条都没覆盖 |
