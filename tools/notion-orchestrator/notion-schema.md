# Notion 任务数据库 Schema 与页面正文协议

这份文档定义 `notion-orchestrator.mjs` 强依赖的 Notion 结构。字段名、类型、选项值都是**大小写敏感**的；脚本会先用 `ntn api v1/data_sources/<id>` 读取 schema 做校验，`--check` 里任何一项 ❌ 都应该先修到 ✅ 再跑任务。

## 0. 先理解 Database 与 Data Source

新版 Notion 把「数据库容器」和「数据源表」分开了：

- **Database** 是容器，可能有多个 data source；
- **Data Source** 才是实际的行/列，查询用它。

拿到 Data Source ID 的两种方式：

```powershell
# 方式 A：从数据库解析
ntn datasources resolve <DATABASE_ID_或链接> --json

# 方式 B：在 Notion 里打开数据库 → 设置 → Manage data sources
#          → data source 的 ... 菜单 → Copy data source ID
```

验证：

```powershell
ntn api v1/data_sources/<DATA_SOURCE_ID>
```

`notion-orchestrator.mjs` 支持填 database ID / URL，会自动尝试 `ntn datasources resolve`；但如果一个 database 下有多个 data source，脚本会要求你显式填 data source ID。

> **PAT 提醒：** 截止 ntn 0.23.20，`ntn pages get/edit` 明确要求 `NOTION_API_TOKEN`（Personal Access Token）；`ntn login` 只覆盖 `ntn api` / `datasources query`。本工作流读取任务正文依赖 `pages get`，所以请设置 PAT。

## 1. 核心属性（前三个必须，其余强烈建议）

在 Notion 中新建一个 Full-page Database，命名为 `Agent Task Queue`。

脚本强依赖 `Name`、`Status`、`Assigned Agent`；`Priority` 缺失时按最低优先级排序；`Blocked By` 缺失时不做依赖门禁；`Target Files` 缺失时不做文件冲突门禁；`Git Branch` 缺失时自动生成。

| 属性名（精确） | 类型 | 选项 / 配置 | 脚本用途 |
| --- | --- | --- | --- |
| `Name` | Title | 默认标题列 | 任务标题；用于生成分支 slug 和报告 |
| `Status` | Status | 见下方分组 | 状态机；调度器只拉 `Ready` |
| `Assigned Agent` | Select | `Claude Code`、`Codex`、`Antigravity`（至少要有 `Claude Code`） | 查询过滤：`equals "Claude Code"` |
| `Priority` | Select | `P0 - Critical`、`P1 - High`、`P2 - Normal` | 本地按优先级排序；`P0` 先跑 |
| `Blocked By` | Relation（关联本数据库） | 双向关联属性命名为 `Blocking` | 前置依赖；未全部 `Done` 时跳过 |
| `Target Files` | Text | 逗号 / 分号 / 换行分隔的仓库相对路径（会做 `\`→`/`、`./`、`../` 规范化） | 同一轮多个任务文件重叠时跳过低优先级任务 |
| `Git Branch` | Text | 可选，例如 `task-a1b2c3d4` | 为空时自动生成；显式值保留大小写，但 `main` / `master` / `develop` 等受保护分支名会被拒绝。不要让两个任务使用同一个分支 |

### Status 分组与选项

Notion 的 Status 属性按组管理，建议这样建：

| 组 | 选项 | 谁来改 |
| --- | --- | --- |
| To-do | `Backlog`、`Ready` | 云端架构师 / 人 |
| In progress | `In Progress`、`Blocked` | 调度器（Ready→In Progress、→Blocked）；架构师（Blocked→Ready） |
| Complete | `Review`、`Done` | 调度器（→Review）；架构师（Review→Done） |

规则：

- 只有 `Status = Ready` 且 `Assigned Agent = Claude Code` 会被本地拉取。
- 调度器在开始执行前把状态改为 `In Progress`，所以不要手动把正在跑的任务改回 `Ready`。
- `Review` 表示「本地跑完、测试通过、有 commit，等待云端验收」，不是「已合并」。
- `Blocked` 表示「需要云端架构师或人介入」；报告里有错误摘要和日志尾部。

## 2. 可选的脚本观测字段

这些属性不是必需的。**存在时脚本会写，不存在时自动跳过**。建议加上，排障会轻松很多。

| 属性名（精确） | 类型 | 写入内容 |
| --- | --- | --- |
| `Attempt` | Number | 第几次尝试；开始时 +1 |
| `Last Run` | Date | 最近一次开始/结束的 ISO 时间 |
| `Commit` | Text | 成功任务的 commit hash（没有新 commit 时不覆盖旧值） |
| `Worktree` | Text | worktree 绝对路径；`--no-worktree` 时为 `(in-place)` |
| `Claude Session` | Text | Claude Code 的 session ID，便于 `claude --resume` 排障 |
| `Agent Session` | Text | 本地 Agent 与云端架构师会话的 `session://...` 链接（如果输出里出现） |
| `Last Error` | Text | 最近一次失败摘要；成功时清空 |
| `Cost USD` | Number | 本次运行的估算成本（来自 `--output-format json`） |
| `Duration (s)` | Number | 本次运行耗时（秒） |
| `Turns` | Number | 本次运行的 agentic turns |

> 云端架构师应把这些字段视为**只读**。它们由调度器维护，手动改可能导致 Review/Blocked 判断失真。

## 3. 页面正文协议

调度器用 `ntn pages get <page-id>` 读取正文（自动剥掉 YAML frontmatter），整段作为任务规格喂给本地 Claude。因此**正文必须自包含**，不能只写在属性里。

必需章节（标题建议完全一致，本地 Agent 会按这些标题找信息）：

````markdown
## 🎯 任务目标 (Objective)

一句话说明要解决什么问题，以及为什么现在要做。

## 📂 上下文与涉及文件 (Context & Files)

- **只读参考**：`src/types/user.ts`、`docs/ARCHITECTURE.md`
- **需修改/新建**：`src/middleware/auth.ts`、`tests/auth.spec.ts`
- **不要动**：`data/assets.json`、共享引擎文件（如需改动先在 AGENT-COORD.md 认领）

## 🛠️ 实现规格 (Implementation Spec)

1. 明确的函数签名 / 接口契约 / 数据结构。
2. 边界条件与错误处理。
3. 与现有模块的交互方式（不要写“自行判断”“适当处理”）。

### 接口契约

```ts
export function refreshToken(input: RefreshInput): Promise<RefreshResult>;
```

## ✅ 验收命令 (Verification Command)

本地 Agent 必须在 worktree 中运行并通过：

```bash
node --test test/auth/jwt.test.js
```

要求：命令非交互、退出码 0 为通过、输出可粘贴。

## 🚧 范围之外 (Out of Scope)

- 不要顺带重构无关模块。
- 不要修改 `package.json` 的版本号。

## 🧾 完成定义 (Definition of Done)

- 验收命令通过。
- 新增/修改的文件在上面列出。
- 已提交 commit，且工作树干净。
````

补充规则：

- **验收命令必须确定性。** 不要写“打开浏览器点一下”“看情况跑”。本地是无头环境，跑不了人工步骤。
- **不要写秘密。** 任务正文会进入 Claude 的上下文；token、密码、私钥都不要写。
- **文件路径用仓库相对路径。** 不要写 `D:\...` 或 `~/...`。
- **Target Files 与正文一致。** `Target Files` 用于并发冲突检测，正文用于实现；两者冲突会让架构师和调度器判断不一致。
- **一个任务只做一件事。** 大任务拆成多个原子任务，用 `Blocked By` 串起来。

## 4. 关系与依赖

`Blocked By` 是本数据库的自关联：

1. 新建 Relation 属性 `Blocked By`，关联 `Agent Task Queue` 自身；
2. 打开「显示反向关系」，把反向属性命名为 `Blocking`；
3. 只有当一个任务的所有 `Blocked By` 都是 `Done`，云端架构师才把它设为 `Ready`；
4. 调度器本地还有一层防御：`enforceDependencies = true` 时会重新读取前置任务状态，未 Done 就跳过本轮。

依赖示例：

```
T1: 实现接口        Status=Done
T2: 写调用方        Blocked By=T1   Status=Ready   ← T1 Done 后才能 Ready
T3: 前端接入        Blocked By=T2   Status=Backlog
```

## 5. 并发与文件冲突

本地每个任务一个 worktree，所以“改同一文件”不会在本地互相污染，但合并时会冲突。规则：

- 同一批 `Ready` 任务，`Target Files` **不能重叠**。
- 如果任务 B 依赖任务 A 的接口，B 必须 `Blocked By = A`，且 B 在 A Done 前保持 `Backlog`。
- 同一批 Ready 任务建议不超过 3 个（`maxConcurrency = 1` 时也会顺序跑，但保留这个约束便于人工审查）。
- 调度器本地还有一层防御：`enforceFileConflicts = true` 时，同一轮里文件重叠的低优先级任务会被跳过，并写日志。

## 6. 权限与 Trigger

### Custom Agent 权限

- 《项目 PRD / 架构规范》页面：**Can view**（只读，防止改乱原始设定）。
- `Agent Task Queue` 数据库：**Can edit content**（建任务、改属性、改正文）。
- 不需要给本地调度器任何 Notion 写权限；它用你自己的 `ntn` 凭据写入（PAT 或 `ntn login`）。

### Trigger

建议只配一个精准触发器，避免无意义烧 Credits：

- 类型：`Database page updated`
- 数据库：`Agent Task Queue`
- 条件：`Status` 变为 `Blocked` **或** `Review`
- 动作：运行 `Cloud Architect (Opus)`

如果当前 Notion 版本的 Trigger 过滤器不支持 OR，就建两个完全相同的触发器，分别监听 `Blocked` 和 `Review`。

平时“拆解需求”由你手动 @ 架构师，或由本地 Claude 通过 `notion-spawn-session` 按需唤醒。不要让架构师监听每一条属性变化。

## 7. 第一次冒烟测试

在 Notion 中手动创建一行（或让架构师创建）：

- `Name`: `[Smoke] 安全的四则运算`
- `Status`: `Ready`
- `Assigned Agent`: `Claude Code`
- `Priority`: `P2 - Normal`
- `Target Files`: `src/utils/math.js, test/utils/math.test.js`
- `Blocked By`: 空
- 正文：

````markdown
## 🎯 任务目标 (Objective)

新增安全的四则运算工具函数，除数为 0 时返回明确错误。

## 📂 上下文与涉及文件 (Context & Files)

- **只读参考**：`package.json`
- **需修改/新建**：`src/utils/math.js`、`test/utils/math.test.js`

## 🛠️ 实现规格 (Implementation Spec)

导出 `add(a,b)`、`sub(a,b)`、`mul(a,b)`、`div(a,b)`。
`div` 在 `b === 0` 时抛出 `RangeError('division by zero')`。
所有函数必须是纯函数，不修改入参。

## ✅ 验收命令 (Verification Command)

```bash
node --test test/utils/math.test.js
```

## 🧾 完成定义 (Definition of Done)

- 测试通过。
- 有 commit，工作树干净。
````

然后：

```powershell
node tools\notion-orchestrator\orchestrator.mjs --dry-run
node tools\notion-orchestrator\orchestrator.mjs --once
```

预期：

1. 日志出现 `开始任务 ... -> task-xxxxxxxx`
2. 终端打印创建 worktree
3. Claude 执行完毕，页面底部出现 `## 🤖 本地 Agent 执行报告`
4. 状态变为 `Review`
5. 架构师 Trigger 验收后改为 `Done`

## 8. 常见 Schema 错误

| 错误 | 后果 | 修复 |
| --- | --- | --- |
| 属性名写成 `Assigned agent` / `assigned agent` | 查询永远为空 | 改成 `Assigned Agent` |
| `Status` 用 Select 而不是 Status | 脚本能跑，但分组/看板体验差；filter 会自动适配 Select | 建议改成 Status 类型 |
| Status 选项写成 `In progress` / `IN PROGRESS` | 状态更新 400 | 严格用 `In Progress` |
| 缺少 `Claude Code` 选项 | 查询为空，`--check` 会报 ❌ | 在 Assigned Agent 里补上 |
| `Blocked By` 没开双向关联 | 架构师看不到 `Blocking`，无法自动解锁下游 | 开启反向关系并命名 `Blocking` |
| 正文只写属性、不写四个章节 | 本地 Claude 没有规格可执行 | 按第 3 节写正文 |
| 验收命令需要人工操作 | 无头运行永远无法通过 | 改成非交互命令 |
| 把秘密写进正文 | 秘密进入模型上下文和日志 | 用环境变量/密钥管理，正文只写引用 |

## 9. 常用检查命令

```powershell
# 数据源 schema
ntn api v1/data_sources/<DATA_SOURCE_ID>

# 看 Ready 任务（和脚本同款过滤）
ntn datasources query <DATA_SOURCE_ID> --filter '{"and":[{"property":"Status","status":{"equals":"Ready"}},{"property":"Assigned Agent","select":{"equals":"Claude Code"}}]}' --json

# 看一个任务页面的 Markdown 正文 + frontmatter（需要 NOTION_API_TOKEN）
ntn pages get <PAGE_ID>

# 看一个任务页面的原始属性 JSON（ntn login 或 PAT 均可）
ntn api v1/pages/<PAGE_ID>
```

> 如果 `ntn datasources query` 的 `--filter` 在 Windows 引号下很难写，直接用脚本的 `--dry-run`，它会把 filter 写到临时文件再用 `--filter-file`，不会踩引号坑。
