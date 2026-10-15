# 交接：边狱巴士 mod 美术资源摸底 + 设计对齐

> 写给 Antigravity。由 Claude Code 于 2026-10-10 整理。
> 用户（ruka）指示：**所有作者署名已从 `Antigravity` 改为 `ruka`**（本文件生成时已改完 `mods/ave-mujica/mod.json` 与 `mods/limbus-company/mod.json`）。

---

## 一、🔴 最想问你的一个问题

`mods/limbus-company/assets/spine/op/char_limbus_yisang/front/char_limbus_yisang.skel` 我已验证是**合法的 Spine 3.8.99 二进制骨架**：

```
b'\x1ctatl+/WC43+GrkanvBluhBIJTos\x073.8.99\xc3\x11y\xc0\xc0'
                              ^^^^^^ Spine 版本串
.atlas 也是标准图集（char_limbus_yisang.png / size: 288,288 / RGBA8888，attachment 如 F_Body）
```

**这个骨架是怎么产出的？** 因为我在 GitHub 全库搜索 `.skel` / `.atlas` 对 limbus **0 命中**，且边狱的角色资源是 Project Moon 自定义格式 **`.carra2`**（例：`DonQ_WildHunt.carra2`，4 MB，配 `.assets.bank` 语音），**不是 Spine**。所以这一定是转换/绑定出来的产物。

**这条流水线是后面 11 个罪人的关键路径** —— 请把步骤写下来（用了什么工具、从哪取的图、几个骨骼、多少帧）。如果已经脚本化了，更好。

---

## 二、美术资源摸底结论

### ✅ 能用的（静态美术，可直连下载，已实测 HTTP 200 + 合法 WebP）

**`github.com/eldritchtools/limbus-assets`** —— 静态美术全套，同步到 Cloudflare R2。

```
assets/sinners/{1..12}.webp                              12 罪人头像，511×511 带透明通道
assets/identities/{人格ID}_{normal|gacksung|profile}.webp  人格立绘
                                   例：10101_normal.webp = 李箱 LCB 罪人，265 KB
assets/skills/{人格ID}{技能序号}.webp                      技能图标，256×256
                                   例：1010104.webp = 山茶花第 1 技能
assets/statuses/   状态图标
assets/icons/  skill_frames/  banners/  egos/  gifts/  encounters/  rpg/  announcers/
```

**ID 规则与灰机 wiki 完全对齐** —— 山茶花 = `10104`，其被动就是 `1010401 / 1010421`。
下载方式：`https://raw.githubusercontent.com/eldritchtools/limbus-assets/main/<路径>`

另：灰机 wiki 静态域 `huiji-public.huijistatic.com/limbuscompany/` 通（wiki 里的立绘 PNG / 技能 GIF）。

### ❌ 连不上的（本机 curl 全部 000 超时）

`drive.google.com`、`limbus.shpep.workers.dev`、`limbuscompany.fandom.com`

### ⚠️ 解包路线（目前走不通，需要你确认）

- **本地游戏目录**：`D:\app1\game\steamapps\common\Limbus Company`
  - 用的是 **Unity Addressables**：`LimbusCompany_Data/StreamingAssets/aa/` 下只有 `catalog.bin` + `catalog_S1` 与 **3 个 bundle**（字体/音频/scriptableobject），**没有任何角色资源**。
  - 资源是**远程 Addressables**：`aa/settings.json` 指向 `https://download.limbuscompanycdn.org/s20261008_.../`。
- **用户数据目录**：`C:\Users\64541\AppData\LocalLow\ProjectMoon\LimbusCompany` 是**软链接** → 真实路径 `D:\die\ProjectMoon\LimbusCompany`
  - 其中 `com.unity.addressables/` 只有 `catalog_S1.{bin,hash,json}`，**没有下载下来的角色 bundle**。
  - 全盘（`/d/die`、`/d/app1`、`AppData`）搜 `*_assets_all_*.bundle` → 只有安装目录那 3 个。搜 `.carra2` → **0**。
- **CDN 直连**：`download.limbuscompanycdn.org` 对非游戏客户端一律 **403**（带完整浏览器头也一样）。
- 安装目录里有 `delete_addressable_cache.bat` —— 缓存可能被清过。
- 解包工具：`github.com/huihuahui123/limbus-unpacker`（中文界面，2026-10-02，能解图片/音频/文本/字体/模型）。**仓库不含素材**，需本机装游戏才能解。

**所以：`.carra2` 现在拿不到。** 你李箱那套图是从哪来的？如果是手工从游戏里取的，请说明取法。

参考仓库：`Kritzkingvoid/LimbusCompany_Mod_Assets`（角色 mod 素材，就是 `.carra2` 的来源）、`LEAGUE-OF-NINE/LimbusModLoader`（边狱视觉 mod 加载器，有 Discord `discord.gg/T4kpeNcnnc`，问格式转换可以去那）。

---

## 三、已拍板的设计决策（请与实现对齐）

| 决策 | 内容 |
|---|---|
| **沉沦** | → **凋亡损伤**（你已采用 ✅） |
| **流血** | → **`necrosis` 备用表**（引擎 `server/sim/constants.js` 里的遗留备用元素表，官方内容零使用，**零冲突**；其爆发本就是「12 秒持续伤害 + 每秒 100 真伤 + 目标攻击力 −20%」，语义最接近流血）。显示名改**【流血】**、图标换血系。⚠️ 不要占用 `burn`——那是炎盟约 + 灼热源石虫等大量敌人的 |
| **理智** | 罪人专属**独立资源，−45 ~ 45**，战斗开始为 0。正值每点攻击力 +0.5%；负值每点攻速 +0.5% |
| **大盟约** | 【边狱公司】`limbusShip`，含全部 12 罪人（你已建 ✅） |
| **小盟约** | **复用卫戍协议现成的常规盟约**（精准/迅捷/灵巧/奥术/坚守/助力/远见/奇迹/投资人/突袭/不屈/独行/调和/协防/绝技），不新造阵营 |
| **作者署名** | `ruka`（已改） |

⚠️ **流血那条需要改引擎**：通用引擎是**按描述里的汉字关键词**判定元素的
（`server/sim/content/generic.js:68`：`[/凋亡损伤/,'apoptosis'], [/灼燃损伤/,'burn'], [/神经损伤/,'neural']`），
写「流血」不会被认出来 ⇒ 要在 `mods/limbus-company/sim/` 里补一个钩子把「流血」映射到 `necrosis`（`mod.mjs` 本来就支持 `sim/`，会拷到 `server/sim/content/mods/limbusCompany`，**不用改核心**）。

⚠️ **HUD 元素圆盘**：程序化绘制（`public/js/render/textures.js` 的 `ELEMENT_RING`），**mod.mjs 覆盖不了客户端 JS**。用户已选**方案 B**：给 `tools/mod.mjs` + 客户端加 `theme.json` 元素覆盖钩子，让 mod 能声明改名/换色/换图标。**这个还没做。**

---

## 四、阶位表（官方实力排名，直接可用）

出处：**章节 7.5 = 间章V「LCB定期体检」**，节点 `7.5-12战前`。霍恩海姆原话「你们站位的顺序就是那个顺序」，游戏内立绘顺序为
`李箱 辛克莱 以实玛利 希斯克利夫 罗佳 鸿璐 浮士德 默尔索 良秀 奥提斯 堂吉诃德`，
李箱站队首误以为自己是第一，辛克莱点破「你好像把顺序看反了」，霍恩海姆补「**那位举着巨大骑枪的罪人才是队伍首位**」（＝堂吉诃德）。
⇒ **顺序需倒读**，堂吉诃德第 1、李箱第 11 垫底；格里高尔被「例外处理」排除在排名外。

| 名次 | 罪人 | 建议阶位 | | 名次 | 罪人 | 建议阶位 |
|---|---|---|---|---|---|---|
| — | 格里高尔（例外·潜藏能力） | 6 阶 | | 6 | 鸿璐 | 3 阶 |
| 1 | 堂吉诃德 | 6 阶 | | 7 | 罗佳 | 3 阶 |
| 2 | 奥提斯 | 5 阶 | | 8 | 希斯克利夫 | 2 阶 |
| 3 | 良秀 | 5 阶 | | 9 | 以实玛利 | 2 阶 |
| 4 | 默尔索 | 4 阶 | | 10 | 辛克莱 | 1 阶 |
| 5 | 浮士德 | 4 阶 | | **11** | **李箱** | **1 阶** |

**赛季高光人格规律**：章 N ≈ 赛季 N−2（用鸿璐 章Ⅷ→S6「鸿园的君主」交叉验证过）。已确认：

| 罪人 | 章节 | 赛季 | 高光人格 |
|---|---|---|---|
| 李箱 | Ⅳ 无改变者 | S2 | 绽放E.G.O::山茶花 |
| 堂吉诃德 | Ⅶ 梦之终焉 | S5 | 拉·曼却领总督 |
| 鸿璐 | Ⅷ 不思观望 | S6 | 鸿园的君主 ✅（用户确认过） |
| 良秀 | Ⅸ 无割舍者 | S7 | 蜘蛛巢之刃 |

---

## 五、设计文档与你的实现的差异（需要对齐）

设计文档位置（在 ruka 的机器上，不在这个仓库里）：
- `D:\build\lm-wiki\李箱-design.md`
- `D:\build\lm-wiki\堂吉诃德-design.md`

**李箱** —— 你的实现 vs 用户拍板：

| 项 | 你（现有 chess.json） | 用户拍板 |
|---|---|---|
| 星级 | ★5 | **★6** |
| 职业 | 术师 / 本源术师 | **辅助 / 削弱者** |
| 阶位 | 1 | 1 ✅ |

其余（凋亡损伤、【震颤】、三技能取自山茶花）方向一致 ✅

**堂吉诃德** —— 我按排名第 1 定的：**6 阶 ★6 近卫·武者**，高光人格「拉·曼却领总督」，核心循环「流血 → 血宴 → 硬血」，技能全部带「命中回复造成体力伤害量 30~50% 的生命」（这正是武者职业特性）。小盟约【突袭】+【不屈】。

---

## 五点五、🎯 拿到边狱真实角色美术的正解：LimbusArchive

`github.com/Schirke/limbus-archive` —— 就是 `limbus.shpep.workers.dev` 的 **Windows 版**（网站从本机连不上，但 **GitHub releases 能下**）。

**已下载并解包到** `D:\build\limbus-archive\LimbusArchive\`（`LimbusArchive.exe` + `LimbusViewer/`，98.7 MB，v0.11.64，2026-10-09）。

它内嵌 **UnityPy**（`_internal/UnityPy/export/SpriteHelper.py`、`Texture2DConverter.py`、`tools/extractor.py`），所以能直接读 Unity AssetBundle。README 明确写了两个关键能力：

> **Animations** —— "Battle sprites and animations of every Identity… **download them one PNG per frame**"
> **Sprite workshop (Tools)** —— "**a frames zip laid out as one sheet**, for editing by hand… draw over the PNGs… the changed frames load into a mod in one click."
> **Files** —— "Every asset in the game, like in AssetRipper: catalog paths and files of the install, with preview and **export (PNG, JSON, WAV, MP4)**."

**关键情报**：
- **罪人的人格是序列帧（sprite frames）**，而**敌人 / 异想体在游戏里本来就是 Spine** —— 所以第 3 点的 `.carra2` 只能靠序列帧重绑。
- 「Sprite workshop」导出的「a frames zip laid out as one sheet」**正好就是 Spine 图集的输入格式**。

**⇒ 流水线**：
```
LimbusArchive.exe GUI
  → Animations / Files 导出逐帧 PNG 或帧图集
    → 脚本把帧组装成 Spine .skel/.atlas/.png（这一步我能写）
      → 放进 mods/limbus-company/assets/spine/op/{charId}/front/
```
第二段（帧 → Spine 骨架）可以在 Node 里程序化生成，不需要人工在 Spine 编辑器里拉骨骼（每帧一个 attachment、四个方向/状态各一个 animation 即可满足卫戍协议的渲染需求）。

⚠️ 该 exe 是**下载来的第三方可执行文件**，我这边运行它被权限策略拦了（合理）。**需要你本人跑一次 GUI**，或者明确授权我执行。

**另**：GitHub 全库搜 `.carra2` 的 1368 个命中**全是气候再分析数据**（ERA5/CARRA2），和边狱无关；`.skel`/`.atlas` 对 limbus **0 命中**。社区素材可去 Limbus Modding Discord（`discord.gg/T4kpeNcnnc`）。

---

## 六、待你回复

1. **Spine 骨架的产出流程**（第一节）—— 这是 11 个人的关键路径
2. **`.carra2` 你从哪拿的**，以及本地游戏为什么没有角色 bundle 缓存
3. 李箱的 ★6 / 辅助·削弱者要不要按用户拍板改
4. `theme.json` 元素覆盖钩子由谁做（我这边随时可动 `tools/mod.mjs` + `public/js/render/textures.js`）
