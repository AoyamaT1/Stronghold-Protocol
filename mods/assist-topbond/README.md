# 辅助：主盟约干员刷新加成 (assist-topbond)

一个**辅助/作弊向**模组：在调度中心（商店）刷新干员时，提高你**当前已激活、且层数最多的主盟约**旗下干员的刷出概率。

> “主盟约”＝所有**核心盟约**（数据里 `isCore: true`）。原版 8 个：炎 / 萨尔贡 / 维多利亚 / 谢拉格 / 拉特兰 / 阿戈尔 / 叙拉古 / 卡西米尔；已安装的模组阵营同样是核心盟约并一并纳入：**罗德岛**（rhodesShip）、**边狱公司**（limbusShip）、**Ave Mujica**（aveMujicaShip）。本模组按 `isCore` 动态判断，不写死清单——以后新增的、带 `isCore` 的模组阵营会自动纳入。

> 干员池太大、想要的核心盟约干员总是抓不到时，用它更快凑齐在建的阵容。

## 效果

- 每名“目标主盟约”干员在**干员栏**里的刷新权重 ×`(1 + boost)`，默认 `boost = 0.2`，即 **+20%**。
- “目标主盟约” = 该玩家当前**已激活**（在场人数达标）且**层数最多**的核心盟约；并列时取数据顺序靠前者（与游戏「当前已激活且层数最多的盟约」一致）。
- 每次刷新实时按当前棋盘重新计算，所以你换阵容/叠层后目标会跟着变。
- 没有任何已激活的核心盟约时**不生效**（恢复原版概率）。
- 只影响**干员栏**，不影响**道具栏**的档位概率。
- 每名玩家各自独立计算（看自己的盟约，不看队友）。

“+20%”指的是**刷新权重**（抽到的相对概率）而非固定百分点；某盟约干员整体占比的提升幅度取决于当前池子里还剩多少该盟约干员。想调整力度，改 `mods/assist-topbond/data/config.json` 里的 `topCoreBondShopBoost`（如 `0.3` = +30%），重新 `install` 即可。

## 安装 / 卸载

```bash
node tools/mod.mjs install assist-topbond
node tools/mod.mjs uninstall assist-topbond
```

安装会把 `data/config.json` 片段并入仓库的 `data/config.json`（新增一个顶层 `assist` 键）；卸载会移除它，概率恢复原版。

## 实现说明（给维护者）

本模组是**行为类**模组，刷新概率逻辑位于预备期（server/match），不属于战斗内容模组系统，因此除了本模组自带的 `config` 片段外，还依赖引擎里一处**常驻但默认关闭**的通用能力：

- `server/match/pool.js` — `SharedPool.roll` 新增可选 `weight(id, e)` 权重系数（默认 1，不传则行为与原版完全一致）。
- `server/match/bondsMeta.js` — 导出 `topCoreBondByLayers(gd, bonds)`：取已激活、层数最多的核心盟约。
- `server/match/player/economy.js` — `_rollChessSlot` 读取 `config.assist.topCoreBondShopBoost`，命中时给目标盟约干员加权。

未配置 `config.assist.topCoreBondShopBoost`（即未安装本模组）时，这段能力处于休眠状态，刷新概率与原版一致。
