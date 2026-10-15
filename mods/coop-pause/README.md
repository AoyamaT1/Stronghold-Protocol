# 功能：多人联机暂停 (coop-pause)

允许在**多人游戏（同盟联机）**作战期间暂停游戏的模组。

> 原版《卫戍协议：盟约》只允许独立模拟（单人模式）在战斗期通过暂停按钮或空格键暂停游戏；多人联机中为了避免单人打扰他人，默认禁用了暂停。
> 
> 在朋友开黑或合作练习时，如果某位玩家临时需要离开、或者大家想暂停讨论战术，安装本模组即可让所有玩家在多人游戏中也能随时暂停与继续！

## 效果

- **全员可控**：在同盟联机的作战期（`COMBAT`）、联防期（`UNITE`）、最终攻势（`FINAL_ASSAULT`）与隐秘核心（`HIDDEN_CORE`）中，顶栏右上角的「暂停」按钮对所有存活玩家开放，按快捷键（默认空格键）也可以暂停。
- **全场静止**：一旦任何玩家暂停，所有在线玩家浏览器本地的战斗模拟（`battleRunner`）与 HUD 倒计时完全静止；服务端的判定倒计时和离线托管同时冻结。
- **协同继续**：任何存活玩家均可点击界面上的「继续作战」或再按空格键恢复游戏。恢复时，所有时钟和截止时间平移补偿，无缝衔接。
- **广播提示**：暂停与继续时，会在顶部跑马灯通知所有玩家（例如 `【玩家名】暂停了游戏` / `【玩家名】继续了游戏`），并在暂停遮罩面板上注明由谁发起。
- **断线保护**：如果暂停期间某位玩家断线，只要房间内还有其他真人队友在，游戏会继续保持暂停，等待断线队友重连；若所有真人均离线，则自动恢复并由 AI 托管完成。

## 安装 / 卸载

```bash
node tools/mod.mjs install coop-pause
node tools/mod.mjs uninstall coop-pause
```

安装会把 `coopPause: true` 配置片段并入 `data/config.json`；卸载会将其从 `data/config.json` 中移除，恢复原版单人专属暂停行为。

## 实现说明（给维护者）

本模组是**行为类**功能模组：
- `server/match/match/pause.js`：读取 `this.gd.config.coopPause`，非单人模式下放行存活玩家的暂停与继续，并在多端同步广播通知。
- `server/match/match/views.js`：在 `publicView` 中增加 `pausedBy` 与 `pausedAt`。
- `server/match/match/platform.js`：断线时若同盟仍有其他在线玩家，不强制取消暂停。
- `public/js/ui/matchStatus.js` & `public/js/screens/game.js`：根据 `gd.config.coopPause` 开放多人界面按钮、快捷键及继续操作。
- 未安装本模组（即未配置 `coopPause`）时，所有逻辑处于休眠状态，完全与原版行为一致。
