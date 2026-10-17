# Notion × Claude Code 本地调度器

用 **ntn CLI** 做零 Token 的队列轮询与 Markdown 读写，用 **Notion 托管 MCP** 让无头 Claude Code 直接呼叫云端 Custom Agent（架构师），把「云上拆任务 → 本地写代码 → 云上验收/解锁」串成闭环。

核心原则：

- **本地不挂着 Claude 轮询。** 轮询由 `ntn datasources query` 完成，不消耗 Claude Token，也不消耗 Notion AI Credits。
- **每个任务一个 git worktree。** 任务之间文件隔离，失败可复用现场继续改。
- **只有 Ready 才拉起 Claude。** 拉取条件固定为 `Status = Ready` 且 `Assigned Agent = Claude Code`。
- **本地 Agent 不写 Notion 页面。** 它只读页面、通过 MCP 呼叫架构师；报告和状态由调度器回写，避免并发写冲突。
- **所有回写先报告、后改状态。** 云端 Trigger 看到 `Review` / `Blocked` 时，报告已经在页面底部。

```
┌───────────────────────────── Notion ─────────────────────────────┐
│  Agent Task Queue (data source)                                   │
│  Status: Backlog / Ready / In Progress / Blocked / Review / Done  │
│  Assigned Agent: Claude Code / Codex / Antigravity                │
└───────────────┬───────────────────────────────────▲──────────────┘
                │ ntn datasources query             │ ntn api PATCH
                │ ntn pages get                     │ ntn api blocks/children
┌───────────────▼───────────────────────────────────┴──────────────┐
│ notion-orchestrator.mjs（本地守护进程，零 Claude Token）          │
│  1. 查询 Ready 任务                                               │
│  2. 依赖 / 文件冲突检查                                           │
│  3. git worktree add -b task-xxxxxxxx                            │
│  4. claude -p（headless，挂载 notion MCP）                        │
│  5. 解析 STATUS: DONE / BLOCKED / FAILED / NO_CHANGES             │
│  6. 追加执行报告 → 状态改为 Review 或 Blocked                     │
└───────────────┬───────────────────────────────────────────────────┘
                │ claude -p + mcp__notion__notion-spawn-session
┌───────────────▼───────────────────────────────────────────────────┐
│ 云端 Custom Agent「Cloud Architect (Opus)」                       │
│  拆解任务 / 回答本地求助 / 处理 Blocked / 验收 Review / 解锁下游  │
└───────────────────────────────────────────────────────────────────┘
```

## 交付物

| 文件 | 作用 |
| --- | --- |
| `orchestrator.mjs` | 主调度脚本（Node.js 22+，零依赖） |
| `config.example.json` | 配置模板 |
| `notion-schema.md` | 数据库字段、页面正文协议、Trigger/权限配置 |
| `cloud-architect-instructions.md` | 云端 Custom Agent 的完整 Instructions（复制即用） |
| `notion-orchestrator.test.mjs` | 纯函数单元测试 |
| `run-orchestrator.cmd` | Windows 启动包装器 |
| 仓库根 `.mcp.json` | 让 Claude Code 连接 `https://mcp.notion.com/mcp` |

## 前置条件

- Node.js **22+**（本机验证：22.23.3）
- Notion CLI **ntn 0.23+**（本机验证：0.23.20）
- **Notion Personal Access Token**（`NOTION_API_TOKEN`；`ntn pages` 当前必需）
- Claude Code CLI（本机验证：2.1.195）
- Git（worktree 模式必须有 commit）
- Notion 工作区支持 **Custom Agents**（Business / Enterprise + Notion AI；以 Notion 当前套餐为准）
- 能访问 `api.notion.com` 与 `mcp.notion.com`；国内网络通常需要 Clash 等代理（见下文）

> **注意：当前 `D:\build\Stronghold-Protocol-4PR` 不是 git 仓库。**
> `git rev-parse --is-inside-work-tree` 会返回失败，所以 `--check` 的「git 仓库」一项会显示 ❌。这不是脚本 bug。
> 三个选择：
> 1. 在真正的 git checkout（`git clone`）里运行；
> 2. 用 `--repo <另一个git仓库>` 指向别处；
> 3. 只在本目录冒烟时加 `--no-worktree`，并保持 `maxConcurrency = 1`（不隔离并发，且提交行为取决于是否有 git）。

## 5 分钟快速开始（Windows / PowerShell）

### 1. 安装 ntn 并配置 Personal Access Token

```powershell
winget install Notion.ntn
# 或 npm install --global ntn
ntn --version

# 本工作流必须设置 PAT：截止 ntn 0.23.20，`ntn pages` 只认 NOTION_API_TOKEN
$env:NOTION_API_TOKEN = "ntn_xxx"
ntn api v1/users/me
```

在 Notion Developer portal 创建 Personal Access Token 时，选择 **Notion API** 能力，并确保该连接/用户能访问 `Agent Task Queue` 数据库。

> **不要只用 `ntn login`。** `ntn login` 的钥匙串凭据能跑 `ntn api` / `ntn datasources query`，但 `ntn pages get/edit` 当前明确要求 `NOTION_API_TOKEN`；调度器读取任务正文依赖 `pages get`，所以没有 PAT 会在每个任务上失败。`--check` 会单独检查这一项。

`NOTION_API_TOKEN` 的优先级高于 `ntn login` 的钥匙串凭据；无人值守环境（计划任务 / CI）也应该用 PAT。

### 2. 建库并拿到 Data Source ID

按 [notion-schema.md](./notion-schema.md) 建好 `Agent Task Queue`。然后：

```powershell
# 数据库容器 ID → data source ID（新版 Notion 中两者分离）
ntn datasources resolve <你的_DATABASE_ID_或链接> --json

# 用返回的 data source id 再验证一次 schema
ntn api v1/data_sources/<DATA_SOURCE_ID>
```

把返回里的 data source `id` 记下来。脚本支持直接填 data source ID、database ID 或 Notion URL；但**推荐显式填 data source ID**，避免数据库里存在多个 data source 时歧义。

### 3. 配置 `.mcp.json` 并完成首次 OAuth

仓库根目录已经有：

```json
{
  "mcpServers": {
    "notion": {
      "type": "http",
      "url": "https://mcp.notion.com/mcp",
      "timeout": 900000,
      "alwaysLoad": true
    }
  }
}
```

> `alwaysLoad: true` 会让 Notion MCP 的工具描述常驻上下文，换取无头会话里会话工具一定可用。如果你更在意上下文体积，可以删掉它，让 Claude Code 按需加载；代价是无头会话首次使用 MCP 工具时可能需要先走工具搜索。
>
> 根目录 `.mcp.json` 会对**本仓库所有 Claude Code 会话**生效。如果只想给调度器用，可以把配置移到 `tools/notion-orchestrator/mcp.notion.json`，并在 `config.json` 里把 `mcpConfigPath` 指过去；调度器本来就用 `--mcp-config` 显式加载它。

首次授权必须交互完成（`claude -p` 里没有 `/mcp` 面板，不能跑 OAuth）：

```powershell
cd D:\build\Stronghold-Protocol-4PR
claude
# 1) 批准项目级 .mcp.json 中的 notion 服务器
# 2) 输入 /mcp → 选择 notion → 浏览器授权
# 3) 退出后验证：
claude mcp get notion
```

也可以从 shell 直接触发已配置服务器的 OAuth：

```powershell
claude mcp login notion
```

> Notion 托管 MCP 使用 **OAuth**。个人连接不要用 `headers.Authorization: Bearer ...` 去模拟；官方文档要求先完成 OAuth。企业托管连接的情况以管理员配置为准。

### 4. 配置调度器

最简单：复制模板并在 `config.json` 里填 ID。

```powershell
Copy-Item tools\notion-orchestrator\config.example.json tools\notion-orchestrator\config.json
notepad tools\notion-orchestrator\config.json
```

> **不要把 `NOTION_API_TOKEN` 写进 `config.json`。** 这个文件可能被提交或分享；token 放环境变量（`$env:NOTION_API_TOKEN`）或系统密钥管理。`config.json` 只放 data source ID、轮询间隔这类非秘密配置。

或者只用环境变量：

```powershell
$env:NOTION_DS_ID = "<data-source-id>"
$env:NOTION_ARCHITECT = "Cloud Architect (Opus)"
$env:CLASH_PORT = "7897"   # 可选；脚本也会自动探测 7897/7890/...
```

配置优先级：**命令行 > 环境变量 > config.json > 默认值**。

### 5. 检查

```powershell
node tools\notion-orchestrator\orchestrator.mjs --self-test
node tools\notion-orchestrator\orchestrator.mjs --check
```

`--check` 会检查：Node / ntn / claude / git 版本、`.mcp.json`、Notion 认证、**Pages PAT**、data source 与字段、Assigned Agent 选项、git worktree、Notion MCP OAuth、代理。

### 6. 冒烟测试

在 Notion 里让云端架构师创建一个测试任务（或手动建一行）：

- `Status = Ready`
- `Assigned Agent = Claude Code`
- 正文包含 `notion-schema.md` 里的四个章节
- 验收命令例如 `node --test test/...`

先只跑一轮，观察日志和 Notion 页面：

```powershell
node tools\notion-orchestrator\orchestrator.mjs --dry-run
node tools\notion-orchestrator\orchestrator.mjs --once
```

确认报告已追加、状态变为 `Review` 后，再常驻：

```powershell
node tools\notion-orchestrator\orchestrator.mjs
```

## 运行模式

| 命令 | 行为 |
| --- | --- |
| `--self-test` | 只跑内置纯函数自检，不联网、不改任何东西 |
| `--check` | 环境/认证/Schema 检查；有 ❌ 时退出码 1 |
| `--dry-run` | 查询并按优先级列出将要执行的任务与分支名；不建 worktree、不调 Claude |
| `--once` | 只轮询一轮，处理完退出；适合排进系统计划任务 |
| 无参数 | 常驻轮询；每轮结束后再等 `pollIntervalMs`，不会重叠执行 |
| `--task <page-id>` | 手动执行某个任务；默认仍要求 Ready + Claude Code，`--force` 可忽略 |
| `--clean-merged` | 删除「已合并到 `cleanupBaseRef` 且工作树干净」的任务 worktree |
| `--no-worktree` | 直接在仓库根目录运行；仅冒烟测试，不隔离并发 |

## 状态机

```
Backlog ──(架构师/人)──> Ready ──(本地调度器)──> In Progress
                                                   │
                              ┌────────────────────┴────────────────────┐
                              │ STATUS: DONE + 新 commit + 工作树干净    │ STATUS: BLOCKED/FAILED
                              ▼                                         ▼
                           Review ──(架构师验收)──> Done              Blocked ──(架构师修正规格/改派)──> Ready
```

调度器只做三件事：`Ready → In Progress`、`In Progress → Review`、`In Progress → Blocked`。`Blocked → Ready` 和 `Review → Done` 由云端架构师负责（也可人工操作）。

## 关键配置项

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `dataSourceId` | 空 | Notion data source ID；也可用 `NOTION_DS_ID` |
| `architectAgentName` | `Cloud Architect (Opus)` | 必须与云端 Custom Agent 名称完全一致 |
| `targetAgent` | `Claude Code` | 只拉取该 `Assigned Agent` 的任务 |
| `pollIntervalMs` | `30000` | 轮询间隔；不要低于 5 秒，避免撞 Notion 速率限制 |
| `queryLimit` | `5` | 每页查询条数；脚本最多读取 5 页（Notion 单页上限 100） |
| `maxConcurrency` | `1` | 同时跑几个 Claude；每个都要一个 worktree，建议先保持 1 |
| `maxTasksPerCycle` | `5` | 单轮最多处理几个任务 |
| `baseRef` | `HEAD` | 新任务分支的起点；可改成 `origin/main` |
| `worktreeBase` | 仓库父目录/.agent-worktrees | worktree 存放目录 |
| `reportMode` | `blocks` | `blocks` 追加块（推荐，append-only）；`markdown` 整页 read-modify-write（可能覆盖云端并发编辑，页面截断时直接拒绝写入） |
| `taskTimeoutMs` | `7200000` | 单任务 2 小时超时；超时会杀进程树并置 Blocked |
| `maxTurns` | `100` | 传给 `claude --max-turns` |
| `maxBudgetUsd` | `null` | 传给 `claude --max-budget-usd`；可选 |
| `claudeModel` | 空 | 传给 `claude --model`；空表示用本机默认模型 |
| `linkPaths` | `[]` | 从主仓库链接/复制到 worktree 的 gitignored 路径（见下文） |
| `bootstrapCommand` | 空 | worktree 缺依赖时执行的命令，例如 `npm ci` |
| `bootstrapWhenMissing` | `[]` | 非空时仅在这些路径缺失时执行 bootstrap；为空时每次任务都执行（建议至少填 `node_modules`） |
| `enforceDependencies` | `true` | 前置 `Blocked By` 未 Done 时跳过任务 |
| `enforceFileConflicts` | `true` | 本轮多个任务 `Target Files` 重叠时跳过低优先级任务 |
| `noWorktree` | `false` | 仅冒烟；不隔离并发，脚本会强制 `maxConcurrency = 1` |
| `allowAllNotionTools` | `false` | 额外放行 `mcp__notion__*`；默认只放行会话/读取工具 |
| `disallowedTools` | `[]` | 附加的 `--disallowedTools` 规则；默认已拒绝 `git push` / `git remote` / `git config` / `gh` |

> 本地执行模型由 `claudeModel` 决定；为空时用本机 Claude Code 的默认模型。如果你希望本地任务固定用某个模型，显式设置（例如 `sonnet` / `opus` / `fable`）。建议同时设置 `maxBudgetUsd`（例如 2–5 美元）或把 `maxTurns` 控制在 60–120，避免单个任务失控。
>
> `maxConcurrency > 1` 会并行跑多个 Claude；`ntn`/git 调用是同步的，会短暂阻塞事件循环。建议先用 1，确认稳定后再提高。

### 本仓库的 worktree 依赖问题

git worktree 不包含被 `.gitignore` 忽略的 `node_modules/`、`public/assets/`、`public/fonts/`。如果任务需要跑测试，建议二选一：

**方案 A：链接共享目录（快，推荐）**

```json
"linkPaths": ["node_modules", "public/assets", "public/fonts"]
```

调度器会在 worktree 中用 Windows junction 指向主仓库的同名目录。注意：这些目录是**共享的**，任务如果修改它们，会影响所有 worktree；纯代码任务通常只读，没问题。

**方案 B：在 worktree 里重新安装**

```json
"bootstrapCommand": "npm ci",
"bootstrapWhenMissing": ["node_modules"],
"bootstrapTimeoutMs": 900000
```

更慢，但完全隔离。注意：bootstrap 使用同步 shell 调用，超时只终止直接子进程；Windows 上 `npm ci` 的孙进程可能残留。优先用 `linkPaths`，或者让 bootstrap 命令自己带超时/清理。

## Clash / 代理

Claude Code 与 `ntn` 都是独立进程，**不会自动继承浏览器的系统代理**。调度器会为所有子进程注入代理：

1. 如果显式设置了 `CLASH_PORT` / `--proxy-port`，优先使用；
2. 否则沿用已有的 `HTTPS_PROXY` / `HTTP_PROXY`；
3. 否则自动探测 `127.0.0.1:7897`、`7890`、`1080`、`10808`、`2080`、`8888`；
4. 始终把 `localhost,127.0.0.1,::1` 加进 `NO_PROXY`，保证 OAuth 回调不被代理拦截。

手工配置（Clash Verge Rev 默认混合端口常见为 7897）：

```powershell
$env:HTTPS_PROXY = "http://127.0.0.1:7897"
$env:HTTP_PROXY  = "http://127.0.0.1:7897"
$env:NO_PROXY    = "localhost,127.0.0.1,::1"
```

注意：

- Claude Code 只支持 `http://` / `https://` 代理，**不支持 `socks5://`**。Clash 的混合端口可以直接当 HTTP 代理用。
- 首次 `ntn login` 和 `claude` 的 `/mcp` OAuth 都会起本地回调端口，必须让 `localhost` 绕过代理。
- 如果不想管环境变量，可以开 Clash 的 **TUN 模式**接管全局 TCP/UDP；但仍建议在规则里固定 `anthropic.com` / `claude.ai` 的节点，避免长连接中途换节点导致会话中断。
- `mcp.notion.com` 使用 Streamable HTTP / SSE 长连接，尽量走低延迟、稳定的节点。
- 代理环境变量可能包含凭据；脚本日志只打印 `protocol://host:port`，不会打印用户名密码。

## Windows 常驻（可选）

用「登录时启动」的计划任务，确保运行在**同一个 Windows 用户**下（`ntn` 的钥匙串、Claude Code 的登录态、Notion MCP 的 OAuth 都按用户存储）：

```powershell
schtasks /Create /TN "NotionOrchestrator" `
  /TR "\"D:\build\Stronghold-Protocol-4PR\tools\notion-orchestrator\run-orchestrator.cmd\"" `
  /SC ONLOGON /RL LIMITED
```

如果计划任务账户无法访问钥匙串：

- `ntn` 改用 `NOTION_API_TOKEN`；
- Claude Code 用 `claude setup-token` 生成长期 token，或设置 `ANTHROPIC_API_KEY`；
- Notion MCP 的 OAuth 仍需先在交互式会话里完成一次，之后复用凭据。

## 安全边界

- **任务正文是外部输入。** 数据库的编辑权限应只给云端架构师和受信任的人；不要把 token、密码、私钥写进任务正文。
- **本地 Claude 允许 `Bash`。** 它在 worktree 里可以执行任务定义的验收命令；脚本用 `--permission-mode dontAsk` + 显式 `allowedTools` 失败关闭，并用 `--disallowedTools` 拒绝 `git push` / `git remote` / `git config` / `gh`。这能挡住常见的误操作，但**不是完整沙箱**：`Bash` 仍能运行其他命令，prompt injection 仍可能读取工作树内的文件。请把数据库编辑权限收紧到架构师和受信任的人。
- **PAT 不进 Claude 的环境。** 调度器给 `ntn` 的 env 保留 `NOTION_API_TOKEN`；给 Claude、git、bootstrap 的 env 会删掉 `NOTION_API_TOKEN` / `NOTION_KEYRING` / `NOTION_WORKSPACE_ID` / `NOTION_HOME`。Claude 用 Notion MCP 的 OAuth 读页面，不需要这把 PAT。
- **任务页面只读。** 本地 Agent 的 MCP 白名单只有读取和 session 工具，没有 `notion-update-page` / `notion-create-pages`。页面回写由调度器负责。
- **报告脱敏。** 回写 Notion 和执行日志前会遮蔽 `ntn_...`、`secret_...`、`sk-ant-...`、`ghp_...`、`Authorization: Bearer ...` 等常见凭据格式。
- **权限拒绝会导致 Blocked。** 只要 Claude 的 JSON 输出里 `permission_denials` 非空，任务不会进入 Review；报告里有「权限拒绝」一节，架构师可以据此调整 `allowedTools` 或拆分任务。
- **合并前人工看一遍。** `Review` 不等于自动合并；任务分支留在 worktree 里，由你决定 merge / PR。

## 故障排查

| 现象 | 原因 / 处理 |
| --- | --- |
| `ntn: No workspace selected` | 设置 `NOTION_API_TOKEN`（推荐），或运行 `ntn login` |
| `Notion Pages Token` ❌ | `ntn pages` 当前要求 PAT；仅 `ntn login` 不够。设置 `$env:NOTION_API_TOKEN`，确保 token 有 Notion API 能力并能访问任务数据库 |
| `Data Source` ❌ | 用 `ntn datasources resolve <db> --json` 取返回里的 data source `id`；数据库有多个 data source 时必须显式指定 |
| `任务 Schema` ❌ | 字段名大小写、类型、Status 选项必须与 `notion-schema.md` 完全一致 |
| `Notion MCP OAuth` ❌（Pending approval） | 在仓库根目录运行一次 `claude`，批准 `.mcp.json` 里的 notion 服务器 |
| `Notion MCP OAuth` ❌（Needs authentication） | 运行 `claude mcp login notion`，或交互式 `/mcp` 授权 |
| Claude 说 MCP 工具不存在 | `claude mcp get notion` 确认已连接；确认工作区套餐支持 Custom Agents；确认连接具备「View sessions and interact with agents」能力 |
| `notion-search-agents` 找不到架构师 | 名称必须完全一致；Custom Agents 需要 Business/Enterprise + Notion AI |
| `git worktree add` 失败 | 分支已被其他 worktree 占用、仓库没有 commit、路径已存在但不是 worktree；按报错清理 |
| 任务一直 `In Progress` | 调度器崩溃或被杀；确认锁文件 `.cache/notion-orchestrator/orchestrator.lock` 没有活进程后，把状态手动改回 `Ready` |
| Claude 因权限被拒 | 任务会被置 `Blocked`；查看页面报告的「权限拒绝」一节，把需要的工具加进 `allowedTools`；不要直接开 `--dangerously-skip-permissions` |
| `Git Branch` 被拒绝 | `main` / `master` / `develop` 等受保护分支名会被拒绝并回退到自动分支；把 `Git Branch` 留空即可 |
| 轮询 429 / rate_limited | 调大 `pollIntervalMs`；不要同时跑多个调度器；状态更新有 3 次退避，报告追加不会自动重试（避免重复报告） |
| 代理连不上 | 显式设 `CLASH_PORT` / `HTTPS_PROXY`；确认 `NO_PROXY` 含 `localhost,127.0.0.1,::1`；或开 TUN |
| OAuth 浏览器回调超时 | 同上；检查代理是否拦截了 `localhost`；检查防火墙 |
| `pages edit` 报错 | 页面可能有子页面/数据库，或 Markdown 被截断；默认 `blocks` 模式是 append-only，不受影响；`markdown` 模式是显式可选项 |

本地日志：

- `.cache/notion-orchestrator/orchestrator-YYYYMMDD.log`
- `.cache/notion-orchestrator/runs.jsonl`（每条任务一行，含成本、轮次、commit、错误）
- `.cache/notion-orchestrator/orchestrator.lock`（单实例锁）

## 与原始草案的关键修正

以下是按官方文档和本机 CLI 实测后做的修正：

1. **命令名**：页面编辑命令是 `ntn pages edit`（不是 `pages update`）；`pages get` 默认会输出 YAML frontmatter，`pages edit` 会剥掉输入开头的 frontmatter。喂给 Claude 的正文已手动 `stripFrontmatter`。
2. **MCP 工具名**：找云端 Agent 用 `notion-search-agents`（不是 `notion-list-agents`）；会话工具是 `notion-spawn-session`、`notion-wait-session`、`notion-get-session-status`、`notion-send-message-to-session`、`notion-list-session-events`、`notion-read-session-event`、`notion-stop-session`。
3. **认证方式**：Notion 托管 MCP 走 OAuth；个人连接不要用 Bearer 头模拟。首次必须在交互式 Claude Code 里授权。
4. **不要复制 `.mcp.json` 进 worktree**：直接用 `--mcp-config <仓库根>/.mcp.json --strict-mcp-config`，否则它可能被任务提交进分支，造成合并冲突。
5. **报告默认用 blocks 追加**：`ntn api v1/blocks/<page_id>/children -X PATCH` 是 append-only，不会覆盖云端架构师同时写入的内容；`markdown` 模式保留为可选。
6. **JSON 不拼命令行**：filter 写临时文件用 `--filter-file`，PATCH body 走 stdin，避免 Windows 引号地狱和命令行长度限制。
7. **不重叠轮询**：用「跑完一轮再等」的循环，不用 `setInterval`。
8. **无头权限失败关闭**：`--permission-mode dontAsk` + 显式 `allowedTools`，而不是 `--dangerously-skip-permissions`。
9. **Windows 可执行文件解析**：按 PATH 顺序取 `where.exe` 的第一个**可执行扩展名**匹配（`.exe` / `.cmd` / `.bat` / `.com`），跳过无扩展名的 npm shell shim；`.cmd` shim 走 `cmd.exe` 包装；`claude` 用异步 spawn，支持超时杀进程树。若路径包含 `%`，优先用 winget 安装的 `.exe`。
10. **补充了**：依赖门禁、`Target Files` 冲突门禁、worktree 复用、状态更新重试（报告追加不重试，避免重复）、凭据脱敏、单实例锁、`runs.jsonl` 审计。
11. **`ntn pages` 需要 PAT**：截止 0.23.20，`ntn login` 只覆盖 `ntn api` / `datasources query`；读取任务正文的 `pages get` 需要 `NOTION_API_TOKEN`。`--check` 会单独检查这一项。
12. **PAT 与 Claude 环境隔离**：`NOTION_API_TOKEN` 只传给 `ntn`；Claude、git、bootstrap 的 env 会删掉 Notion 凭据。另用 `--disallowedTools` 拒绝 `git push/remote/config` 和 `gh`。
13. **报告追加不再自动重试/回退**：blocks 追加不是幂等的；超时后重试或回退 markdown 可能产生重复报告。现在失败会写进 `Last Error` 和本地 `runs.jsonl`，由人/架构师处理。

## 已验证版本与官方文档

本脚本按以下版本实测（2026-10-17）：

- `ntn 0.23.20`
- `claude 2.1.195 (Claude Code)`
- `Node.js 22.23.3`
- `git 2.52.0.windows.1`

官方文档：

- Notion CLI 总览：<https://developers.notion.com/cli/get-started/overview>
- `ntn` 命令参考：<https://developers.notion.com/cli/reference/commands>
- Data sources：<https://developers.notion.com/cli/guides/data-sources>
- `ntn api`：<https://developers.notion.com/cli/guides/api-requests>
- Notion MCP：<https://developers.notion.com/guides/mcp/overview>
- Notion MCP 工具列表（含 Custom Agent session 工具）：<https://developers.notion.com/guides/mcp/mcp-supported-tools>
- Custom Agent API Quickstart：<https://developers.notion.com/guides/notion-agent-apis/quickstart>
- Claude Code 无头模式：<https://code.claude.com/docs/en/headless>
- Claude Code MCP：<https://code.claude.com/docs/en/mcp>
- Claude Code 权限：<https://code.claude.com/docs/en/permissions>

## 本仓库注意事项

- 这是游戏源码树，不是 git 仓库；worktree 模式需要先换成 git checkout。
- 本项目的整包更新会覆盖根目录和 `tools/` 下的文件。升级前请备份 `tools/notion-orchestrator/` 与根 `.mcp.json`，升级后重跑 `--check` 并重新合并 `config.json`（`config.example.json` 会保留在备份/上游里）。
- 如果在本仓库跑任务，注意 `AGENTS.md` 与 `AGENT-COORD.md` 的约定：改共享/引擎文件前先在 `AGENT-COORD.md §2` 认领，完成后在 §4 记录文件 → 验收命令 → 真实输出。
- 云端架构师写任务正文时，应把验收命令写成**可直接非交互执行**的命令，例如 `node --test test/sim/skills.test.js`；不要写依赖人工浏览器操作的步骤。
- `data/assets.json` 的红线同样适用于任务：不要把磁盘上不存在的资源路径写进去。
