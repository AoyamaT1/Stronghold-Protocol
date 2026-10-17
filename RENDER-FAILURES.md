# 渲染层测试失败清单（19 个）

> 生成：W-审，2026-10-16。基线：`node --test test/render/*.test.js` → **475 pass / 19 fail**（此前 33 fail，
> 其中 14 个是 `test/render/fakepixi.js` 假 `PIXI.Text` 缺 `updateText()` 造成的假失败，已修）。
>
> **这 19 个都不是 FGO 工作引入的**（除 #1 的 fgo 那条是模组数据自带的），但整个渲染套件长期带红 = 谁都不敢信它。
> 每条都给了**根因 + 精确修法**，照单修即可。修完请把本文档的对应条目划掉。

复现命令（每条独立跑，避免互相干扰）：

```bash
node --test test/render/assets.test.js
node --test test/render/boardart.test.js
...
```

---

## A. 模组数据 / 清单类（3 条）

### ~A1. `assets.test.js` — `spine chess_fgo_1_gareth_a` 🔴 **FGO 相关**~ ✅ **已修** (2026-10-16: 30 条 chess_fgo_* 的 assets.spine 已全部移除，测试已绿)

**断言**（`test/render/assets.test.js:144-154`）：凡是 `visible && assets.spine` 的棋子，其 `assets.spine` 必须在
`data/assets.json` 里能解析出 `.skel` + `idle` 动画。

**根因**：30 条 `chess_fgo_*` 棋子都写了 `"spine": "char_fgo_<name>"`，但清单的 `chars.char_fgo_<name>` **只有
`avatar/avatarE2/portrait/portraitE2/standee/standeeE2`，没有 `spine` 块** —— 因为圆桌模组**故意不做骨骼，改用立绘**
（用户决定）。于是 `spineEntry(m, "char_fgo_gareth")` 返回 null。

**影响**：① 这条断言红；② 运行时 `units.js:_loadSpine()` 里 `const id = this.info.spine || this.info.defId` 拿
一个查不到的 id，`spineEntry` 返回 null 后直接 return（**不会死循环、不会重试**，实测确认），立绘走 standee 分支正常显示。
所以这是**死字段 + 测试红**，不影响玩法。

**修法**：把 30 条 `chess_fgo_*` 的 `assets.spine` **删掉**（只留 `avatar`/`portrait`）。注意要同时改
`mods/fgo-round-table/data/chess.json`（源）与根 `data/chess.json`（已安装副本），否则下次安装又回来。

```bash
# 作用域限定脚本：只动 chess_fgo_* 三条 key 里的 assets.spine
node -e "
const fs=require('fs');
for (const f of ['mods/fgo-round-table/data/chess.json','data/chess.json']) {
  const d=JSON.parse(fs.readFileSync(f,'utf8'));
  let n=0;
  for (const [k,v] of Object.entries(d)) {
    if (!k.startsWith('chess_fgo_')) continue;
    if (v.assets && 'spine' in v.assets) { delete v.assets.spine; n++; }
  }
  fs.writeFileSync(f, JSON.stringify(d,null,2)+'\n');
  console.log(f, '清掉', n, '条');
}"
```

### A2. `assets.test.js` — `fetches the manifest once; helpers bind to it; missing manifest ⇒ nulls`
**根因**：清单单例/缓存语义。多为 `assets.js` 的 `installAssets` 被多次调用或 `resetData` 未清 assets 缓存。
**修法**：先读该用例（同文件内 "fetches the manifest once" 那条）确认它断言的是"同一次 install 只 fetch 一次"，
再看 `public/js/assets.js` 是否新增了会绕过缓存的路径（例如 `standeeUrl` 里的 `m()` 懒取）。**修完 A1 后复跑，可能已连带修好。**

### A3. `board3d-extract.test.js` — `derived maps on disk: …` → `'not a PNG'`
**根因**：本机没有完整提取本地客户端美术，磁盘上的派生贴图不存在或是占位文件。**环境问题**。
**修法**：跑 `node tools/setup.mjs`（或 `npm run assets`）把本地美术提取全；确实没有素材时，这条应加 `skip`。

---

## B. 假 PIXI / 测试替身缺口（2 条）

### B1. `boardart.test.js` — `P.Graphics is not a constructor`（2 个用例）
「impostor atlas allocator」的两个用例要构造 `P.Graphics`，但那个文件用的假 PIXI 没提供 `Graphics`。
**修法**：改用 `test/render/fakepixi.js` 的 `installFakePixi()`（它有 `Graphics`），或在本题内补一个最小 `Graphics` 替身。
（`fakepixi.js` 已经有 `class Graphics extends Container`，含全部 draw* 方法，直接复用即可。）

### B2. `battle-perf.browser.test.js` — `ENOENT: public/dev/perf/index.json`
**根因**：浏览器性能台的数据文件不在仓库里（dev 产物）。
**修法**：文件不存在时 `skip` 而不是抛错。

---

## C. 生产代码与测试期望脱节（5 条，**这些是真信号**）

### C1. `playtest6-promote.test.js` — 源码正则对不上
**期望**（`test/render/playtest6-promote.test.js:81`）：
```
if (promoFrom.has(e.uid)) { … fx.promote(v, … } else if (e.area === 'board' && prevBoard.size && !prevBoard.has(e.uid)) { v.onDeploy?.(); fx.deploy(v); }
```
**实际**（`public/js/render/app.js:837` 附近）：
```
} else if (e.area === 'board' && prevBoard.size && !prevBoard.has(e.uid)) { landPiece(v, 'board'); fx.deploy(v); }
```
即 `v.onDeploy?.()` 被换成了 `landPiece(v, 'board')`（PR #416 的落地音/位移改动）。
**修法**：二选一——若 `landPiece` 是有意替换（新语义正确），**改测试的正则**；若 `onDeploy` 是必需的，
把它补回去（`landPiece(v,'board'); v.onDeploy?.(); fx.deploy(v);`）。**需要人判断语义，别机械改测试。**

### C2. `forms.test.js` — 源码正则对不上
**期望**：`e[1] === 'phase' … inf.form = … setForm?.(e[4].kind)`。
**实际**：`app.js` 的 `case 'fx'` 已重构（现在走 `fxForm(e)` + `inf.form = form` + `views.get(...)?.setForm?.(form, x)`）。
**修法**：**按新的实现更新测试正则**（新实现更完整：处理了 `late`、`FORMS` 白名单）。

### C3. `downring.test.js`（3 个） — `undefined !== '20'`
**期望**：倒计时环上应能读到标签文本 `'20'`。
**根因**：`render/textures.js:1489` 的 `downLabel()` 改成了**共享一个缓存 Text 只取 `.texture`**
（每条标签不再各自持有 Text 对象），视图侧若还从旧字段读文本就会拿到 `undefined`。
**修法**：读 `public/js/render/units.js` 的 `_updateDownRing`，确认标签文本从哪来；
新实现下文本应存在视图自己的 `mem`/字段里，或断言改为"纹理由共享池给出"。

### C4. `playtest6-enemies.test.js` — `drone._headTiles` 公式不符
```
assert.ok(Math.abs(drone._headTiles - Math.max(0.55, 390 * UNIT.modelScale * 0.5926 * 0.92)) < 1e-9)
```
**根因**：某个模型常量（`HEAD_TILES` / `modelScale` / 系数）被改过，测试里的公式没跟上。
**修法**：用当前 `units.js` 的公式重算测试期望值（先确认是新数值正确，再改测试）。

### C5. `feedback2-enemy-attack-clip.test.js` — `false !== true`
**根因**：敌人攻击 clip 的选择结果与期望相反。与 C3/C4 同源（模型/clip 选择逻辑动过）。
**修法**：读该用例的断言意图，对照 `units.js` 的 `_wantsBack` / clip 选择逻辑判断谁对。

---

## D. 与 FGO 无关的既有失败（已在别处记录，可暂缓）（4 条）

### D1. `fxproj.test.js`（2 个） — `droneBomb shadow` / `blastcaster's bomb explodes purple`
**AGENT-COORD 早在 10-11 就记录为既有失败**，并用「禁用音符代码重跑」对照证实与祥子音符无关。
**修法**：单独立项，别顺手改。

### D2. `issue25-downback.test.js` — 老鲤（自选 pick）的 Back 骨骼清单漂移
**根因**：`most Back skeletons have no fall…` 的期望列表与当前 `data/assets.json` 的实际骨骼对不上（新增了 0.2.x 的干员）。
**修法**：按当前清单刷新期望数组，**但先确认不是真的漏了一套 Back 骨骼**。

### D3. `tiles.test.js` — `act1autochess_escaped_single hand 0` → `'#' !== 'a'`
### D4. `pen.test.js` — `0 !== 13`
**根因**：两者都是**关卡/地块数据**与测试期望脱节（`data/stages.json` 的材质网格、战区格数）。
不是渲染层问题，是关卡数据/测试的漂移。**修法**：对照 `data/stages.json` 的实际网格刷新测试期望；
若是关卡数据被改坏了，则应改回数据。

---

## E. 语法/导出缺失（1 条，**优先级最高**）

### E1. `fevericon.test.js` — `SyntaxError: style.js does not provide an export named 'FEVER_ROSE'`

```
import { FEVER_ROSE, FEVER_ROSE_HI, FEVER_ROSE_DIM, COLORS } from '../../public/js/render/style.js';
```

**根因**：`public/js/render/style.js` **没有导出 `FEVER_ROSE` / `FEVER_ROSE_HI` / `FEVER_ROSE_DIM`**，
但 `test/render/fevericon.test.js`（Ave Mujica 的 FEVER 徽章）在 import 它们。整条用例在**模块加载阶段就崩**。
**修法**：在 `style.js` 补上这三个颜色常量（对照 `units.js` 的 `FEVER_ICON` 与 `_updateFeverIcon` 用色），
或删掉确实不再需要的 import。**这是 Ave Mujica 模组的功能，FGO 别顺手删。**

---

## 修完的验收

```bash
node --test test/render/*.test.js        # 目标：fail 逐条归零
node -e "import('./public/js/render/app.js').then(()=>console.log('OK'))"   # §3 红线：渲染层语法自检
node tools/setup.mjs --check             # §3 红线：素材 0 缺失
```

**改了 `public/js/render/**` 的，务必复跑上面第二条** —— 历史上重复拼接代码造成的 `SyntaxError` 直接把
PixiJS 渲染降级成 2D 简化视图（见 `AGENT-COORD.md` §3）。
