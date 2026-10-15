# 指导：把边狱人格的逐帧精灵转成卫戍协议能用的 Spine 骨架

> 给 Antigravity。Claude Code 于 2026-10-10 写，同日更新。
> **⚠️ 2026-10-10 更新：改用 `tools/limbus/make_unit_clips.py`（clips 管线），`make_unit.py`（frames 管线）已废弃。** 见下面第 0 节。

---

## 0. ⚠️ 最新：改用 clips 管线（推荐）

`make_unit.py` 走 `/api/frames`，只能拿到「帧组 + 帧名」，姿态和分组的语义全靠猜，而且**处理不了「一帧由多层部件叠成」的人格**（格里高尔就是，拼出来只有两根木棍）。

改成走**战斗 clip 接口**：

```
GET /api/owner_clips?id=<人格ID>       → clip 列表，带显式语义
   {"name":"Gregor_Salvador_S1","kind":"skill","n":1,"label":"Skill 1 · Flash of Sunup"}
   {"name":"YiSang_SpinebushFlower_Default","kind":"pose","n":0,"label":"Default"}
   {"name":"..._Move" / "_Guard" / "_Evade" / "_Damaged" / "_Dead", "kind":"pose"}
GET /api/clip?bundle=&clip=&go=&all=0  → {fps, frames:[{d, ops:[[key,x,y,flip,a,sx,sy]]}], sprites}
GET /api/object?bundle=&pid=           → 部件 PNG
```

**比 frames 管线好的三点**：
1. **姿态是显式命名的**（Default/Move/Guard/Evade/Damaged/Dead），不用猜
2. **合成逻辑统一**：`ops` 里每个部件带 `x/y/flip/alpha/sx/sy`，照 `app.js paintClip` 的公式合成 ⇒ 分层和单图走同一条路
3. 每个 clip 自带 `fps` 和逐帧时长 `d`，动画节奏真实

```bash
python tools/limbus/make_unit_clips.py --id 11216 --char char_limbus_gregor \
    --api http://127.0.0.1:47821 --mod mods/limbus-company
# 批量：
bash tools/limbus/batch_units.sh
```

**🔴 最坑的一个（已踩，务必记住）：`skins` 必须是【数组】**

Spine **3.8 的 JSON** 里 `skins` 是**对象**（`{"default": {...}}`），**4.0 是数组**（`[{"name":"default","attachments":{...}}]`）。
而仓库客户端实际跑的是 **4.0 的读取器**（按 `i.skins.length` 遍历）—— 给对象的话 `length` 是 `undefined`，
**循环一次都不跑 → 皮肤与附件全丢 → 骨架和动画都正常，但模型完全隐形**（最难查的一类 bug）。

判断方法：把骨骼加载后看 `defaultSkin` 与附件数。打包成数组后：

```
defaultSkin=true    skin 内附件总数=61    该附件 region=true texture=true 328x305    贴图 4096x2019 valid=true
```

（LimbusArchive 自己导出的 `dongbek_yisang.json` 也是数组 —— 跟着它写就对了。）

**踩过的另外三个坑（脚本已处理）**：
- **每帧必须按自己的包围盒渲染**。用「全局共用大画布」会被大挥砍撑爆内存（donquixote 的 `MemoryError`）。
- **引擎用 ±64000 这类哨兵坐标隐藏部件**，必须过滤（`op_rect` 里 `LIMIT = 8192`）。
- **同人物会有骑乘/步行两套同名 clip**（希斯克利夫 `WHunt_S1` 与 `WHunt_Ride_S1`，label 文本相同），要按 label 文本去重；`* Off` / `Add` 这类未装备变体要跳过。

**12 罪人的人格 ID**（`1xx` 是罪人，后两位是人格序号）：

| 罪人 | 人格 | ID | 罪人 | 人格 | ID |
|---|---|---|---|---|---|
| 李箱 | 山茶花 | 10104 | 希斯克利夫 | 狂猎 | 10710 |
| 浮士德 | 黑兽-卯魁首 | 10212 | 以实玛利 | 裴廓德号船长 | 10808 |
| 堂吉诃德 | 拉·曼却领总督 | 10310 | 罗佳 | 泪锋之剑 | 10913 |
| 良秀 | 蜘蛛巢之刃 | 10415 | 辛克莱 | 准执柄者 | 11005 |
| 默尔索 | 拇指东部指挥官 IIII | 10512 | 奥提斯 | 魔弹 | 11107 |
| 鸿璐 | 鸿园的君主 | 10613 | 格里高尔 | 黎明事务所代表 | 11216 |

> 用错 ID 不会有报错 —— 只会静默导出另一个人的图。**务必核对**（`chess.json` 里的 charId 与上表）。

**每人格还有一个原生 Spine**（`/api/characters` 的 `spine` 数组，如 `salvador_gregor_idle`），但那是 **135 骨级别的立绘骨架、只有 1 条动画**（呼吸），**不能当战斗模型** —— 战斗模型仍走上面的帧→自绑 Spine。

---

## 0. 结论先行

**边狱的人格资源可以直接拿到真图，不需要解包 `.carra2`。**

- **罪人的人格是逐帧精灵**（sprite frames），不是 Spine；
- **敌人 / 异想体才是 Spine**；
- 但人格**另有一份「立绘 Spine」**（如 10104 的 `dongbek_yisang`，Spine 4.0.64，34 骨 18 槽仅 1 条动画）——那是抽卡立绘的呼吸动画，**不能当战斗模型用**。

所以战斗模型走：**逐帧 PNG → 拼图集 → 生成 Spine JSON**（每帧一个 region attachment，动画用 attachment timeline 逐帧切换）。

---

## 1. 数据来源：LimbusArchive 的本地 API

`github.com/Schirke/limbus-archive` = `limbus.shpep.workers.dev` 的 Windows 版（网站国内连不上，但 **GitHub releases 能下**）：

```bash
gh release download --repo Schirke/limbus-archive --pattern LimbusArchive.zip -D <目录>
```

程序是 pywebview + UnityPy 的 GUI，**跑起来时开一个本地 HTTP 服务**（端口每次随机，用 `netstat -ano | findstr <PID>` 找）：

| 端点 | 作用 |
|---|---|
| `GET /api/frames?id=<人格ID>` | 帧组清单。每帧带 `{name, bundle, pid, w, h, px, py, ppu}` |
| `GET /api/object?bundle=<bundle>&pid=<pid>` | **该帧的 PNG**（`image/png`） |
| `GET /api/sprites` / `/api/sprites/png` | Sprite workshop 的 zip |
| `POST /api/sprites/load` | 把改好的帧灌进 mod（POST 需带 `X-Limbus-Datamine: 1`） |

**人格 ID 规律**：`1xx0y`，`1xx` = 罪人序号（01 李箱），`0y` = 人格序号。
例：李箱 LCB 罪人 = `10101`，剑契组 = `10103`，**山茶花 = `10104`**。
与灰机 wiki 完全对齐（山茶花的被动就是 `1010401` / `1010421`）。

---

## 2. 🔑 最容易踩的坑：锚点约定（已实测反推）

`/api/frames` 里每帧的 `px` / `py` 是**脚底锚点**，但：

1. **`py` 以「图像底边」为原点**（不是顶边）。
2. **参考系是 app 加过边距的画布**：元数据的 `w`/`h` 比实际 PNG **大 78**（每边 **39**）。
   所以实际 PNG 里的锚点是 `(px - 39, py - 39)`。

**实测证据**（`idle`）：图像内容最底行距底边 **11 px**，而 `py - 39 = 50.43 - 39 = 11.4` ✓

> ⚠️ 不要写死 39。脚本用 `pad = (元数据 w - 实际 PNG w) / 2` **逐帧算**，这样 app 改版也不会错。

Spine region attachment 的 `(x, y)` 是**区域中心**相对骨骼的位置、**y 轴向上**，所以：

```
ax = px - padX            # 锚点距 PNG 左边
ay = py - padY            # 锚点距 PNG 底边
x  = w/2 - ax             # 区域中心 x
y  = h/2 - ay             # 区域中心 y
```

**验证**：把 `idle` 按上式合成出来，红十字（原点/地面线）正好落在脚底 —— 见 `D:\build\lm-wiki\anchor_idle.png`。

---

## 3. 文件格式（两个必须对齐的点）

### 3.1 atlas

**不要用 LimbusArchive 导出的 `bounds:` 格式**——那是它自己的。Spine 用 `xy:` / `size:` / `orig:` / `offset:` / `index:`。
逐字段对齐仓库里已知能用的方舟图集（`public/assets/spine/enemy/enemy_10001_trslim/*.atlas`）：

```
<页文件名>.png
size: 4096,3793
format: RGBA8888
filter: Linear,Linear
repeat: none
pma: false
<区域名>
  rotate: false
  xy: 0, 0
  size: 495, 758
  orig: 495, 758
  offset: 0, 0
  index: -1
```

**区域名必须唯一！** 帧名会在多个帧组里重复（`skill1_1` 同时出现在 `S1` 和 `Parrying_Timeline`），
96 帧里有 34 个重名 —— **必须按名去重**，否则图集里出现同名块。

### 3.2 Spine JSON

- 输出 **Spine 3.8 格式**：`skeleton.spine = "3.8.99"`，`skins` 用**对象**式（`{"default": {<槽>: {<attachment>: ...}}}`）。
- 已确认仓库端兼容：
  - `public/js/assets.js:227` 的校验正则允许 `.skel` **或 `.json`**；
  - `public/vendor/pixi-spine.js` v4.0.6 **内置 3.8 与 4.0 两套 JSON 读取器**（3.8 用 `for..in` 读 `skins` 对象，4.0 用 `.length` 读数组并认 `mixRotate/mixX/mixY`）。

---

## 4. 用脚本

```bash
# 前提：LimbusArchive 正在运行
python tools/limbus/make_unit.py \
    --id 10104 \
    --char char_limbus_yisang \
    --api http://127.0.0.1:<端口> \
    --mod mods/limbus-company
```

产出（`mods/limbus-company/assets/spine/op/<char>/front/`）：

```
<base>.json           Spine 骨架（region attachment + attachment timeline）
<base>.atlas          图集描述
<base>_0.png ...      图集页
assets_entry.json    可直接并进 data/assets.json 的 spine 条目
```

脚本内置两道自检：**区域名 ↔ 骨架引用一一对应**、**重名告警**。

### 帧组 → 动画名（脚本自动）

| 帧组 | 动画 |
|---|---|
| `Poses` 里的 `idle`/`dmg`/`gud`/`dead` | `idle` / `hit` / `guard` / `die` |
| `…_S1` / `…_S2` / `…_S3` | `attack1` / `attack2` / `attack3`（逐帧，12 fps） |
| `…_Parrying_Timeline( 1)` | `parry` / `parry2` |

李箱实测：96 帧 → 去重后 62 帧 → 2 页图集 → **9 条动画**。

---

## 5. 校验

```bash
node tools/limbus/validate_spine.mjs mods/limbus-company/assets/spine/op/char_limbus_yisang/front yisang
```

会打印骨骼/槽位数与动画列表。李箱结果：

```
skeleton ok: bones=1 slots=1
anims: idle / hit / guard / die / attack1 / attack2 / attack3 / parry / parry2
```

> ⚠️ 该脚本**查不到图集区域**（`@pixi-spine/base` 的 `TextureAtlas` 要等贴图加载才建 region）。
> 拿仓库自己已知能用的 `enemy_10001_trslim.atlas` 跑同一个脚本也是 0 —— 所以**不要拿 region=0 当失败判据**。

---

## 6. 接到 data/assets.json

脚本会把条目写到 `assets_entry.json`，形如：

```json
{ "char_limbus_yisang": { "spine": { "front": {
    "skel": "/assets/spine/op/char_limbus_yisang/front/yisang.json",
    "atlas": "/assets/spine/op/char_limbus_yisang/front/yisang.atlas",
    "textures": [".../yisang_0.png", ".../yisang_1.png"],
    "pma": false,
    "anims": {
      "idle": "idle", "die": "die", "stun": "hit", "move": null, "deploy": null,
      "attack": { "begin": null, "loop": "attack1", "end": null },
      "skills": { "0": {"loop":"attack1"}, "1": {"loop":"attack2"}, "2": {"loop":"attack3"} }
    }
}}}}
```

`anim` 各字段的含义见 `data/assets.json` 里任意方舟干员的 spine 条目（如 `char_003_kalts`）。

---

## 7. ⚠️ 还没做的 / 待验证

1. **没在游戏里实跑过**。脚本级验证（Spine 3.8 能解析、区域一一对应、锚点视觉正确）都过了，但**还没确认卫戍协议的渲染器实际画出来的效果**。
2. **图集页 4096×3793 / 4096×约2000，各约 3 MB** —— 仓库 `assets.js` 有 Spine 内存策略（`spineDataWeight`，注释提到手机内存吃紧），大图集可能触发 LRU 驱逐频繁重载。必要时把单页收小、多分几页。
3. **`pma` 目前写 `false`**，图集 PNG 是普通 alpha。方舟敌人的图集是 `pma: true`。
4. **帧率 12 fps 是猜的**（对齐 LimbusArchive 自己的默认值）。真实动作节奏要从 app 的 timing 数据取。
5. **回合制动作语义**：现在 `attack1/2/3` 循环播放技能动画；卫戍协议近战单位的「攻击」是打一下、不是整套技能演出。**是否要重剪动画**（如只取技能的前 N 帧做攻击、完整版做技能）需要你定。
6. **剩下的 11 个罪人还没做** —— 每人只要换 `--id` 和 `--char`。人格 ID：李箱 `10104`（山茶花），其余按 `1xx0y` 规律查。

---

## 8. 相关文档

- `HANDOFF-美术与设计对齐.md` —— 美术源清单、设计决策、12 人阶位表、与现有实现的差异
- `D:\build\lm-wiki\李箱-design.md`、`堂吉诃德-design.md` —— 干员设计稿

---

## 9. 语音 / 音效 / 待机呼吸（2026-10-10 补）

修了三件事：**语音对不上**（10/12 的 wav 其实是李箱语音的字节拷贝，只有李箱+辛克莱是真的）、
**攻击无音效**（`data/assets.json` 根本没有 `audio.sfx` 块）、**模型僵死**（帧管线的 idle 只有一帧附件）。

**语音** —— `tools/limbus/extract_voices.py`
- 源：本机 `…/FMODBuilds/Desktop/Voice_Default_*.assets.bank`（FSB5 / FADPCM，用脚本内置的 `decode_fadpcm`）。
- 设计人格的语音分散在赛季库里（李箱=S2、堂吉诃德=S5…），脚本扫全部 `Voice_Default_*` 建索引。
- clip→方舟语音槽映射：`formation→start`、`battle_endcommand→faceEnemy`、`battleentry→place`、
  `battle_select→select`、`battle_s2/s3→skill1/2/3`、`battle_dead→die`、`battle_clear(_ex)→resultThree/Four`、
  `battle_defeat→resultLose`。技能命名有两种（`…_1_1` 与扁平 `…_1`），都已兼容。
- 人格 ID 见脚本顶部 `IDENTITY`（与第 0 节一致）。跑：`python tools/limbus/extract_voices.py`。

**音效** —— `tools/limbus/extract_sfx.py`
- 源：`SFX_*.assets.bank`（**Vorbis**）。`attack` 用武器类通用短音（SFX_1 的 `Sword_Hori`/`Sword_Stab`/`Roland_Mace`/`PistolShot`），
  `skill` 用该人格的 EGO 入场音（SFX_N 里以人格 ID 命名的 8s 样本；辛克莱 11005 无专属 → 回退到武器类重击）。
- ⚠️ Vorbis 要 `fsb5.rebuild_sample` 重建 Ogg，依赖本机 **libvorbis/libogg**：`conda install -c conda-forge libvorbis libogg`
  （脚本已把 `miniconda3/Library/bin` 加进 DLL 搜索路径）。产物是 `.ogg`，引擎 `/media` 路由与 Web Audio 原生支持（`shared/media.js AUDIO_EXTS` 含 `.ogg`）。
- 产物 → `assets/audio/sfx/<charId>/{attack,skill}.ogg`，并在 `data/assets.json` 的 `audio.sfx.units` 里登记（引擎 `public/js/audio.js` 的 `sfx.units[charId].{attack,skill}`）。

**待机呼吸** —— `tools/limbus/idle_breathing.py`
- 单骨单图骨架的 idle 只有一个附件关键帧 ⇒ 部署后完全静止。脚本给 `root` 骨合成一条**纵向缩放呼吸轨**
  （升余弦、周期 2.8s、首尾=1.0 无缝循环、峰值 +2% 高、−0.6% 宽），用线性多采样避开 vendored pixi-spine 的曲线编码分歧。
- `make_unit_clips.py` 生成时已 `from idle_breathing import breathing_bones` 自动注入；也可独立补已有骨架：`python tools/limbus/idle_breathing.py`。

> 改完任意资源后要 `node tools/mod.mjs install limbus-company` 把 `assets/` 刷进 `public/assets/` 并把 `data/assets.json` 合并进根 `data/`。
