# 五子棋 v1.1.0 — 猜拳选先手

## 目标
和象棋一样，五子棋开局增加猜拳（石头剪刀布）环节，胜者选择执黑（先手）或执白（后手）。

## 流程
1. **rps 阶段** — 双方出拳（石头✊/剪刀✌️/布🖐），平局重新出拳
2. **choosing 阶段** — 胜者选择执黑（先手）或执白（后手）
3. **playing 阶段** — 黑棋先手，正常对弈

## 文件清单

### 1. 服务端 `games/gomoku/server/index.js`
- `initGameState`: 初始 `phase: 'rps'`，新增 `rpsChoices`, `rpsRound`, `rpsWinner`, `colorChosen`
- 新增 `postInit`: 广播 `game_start` + `rps_start`
- 新增 `handleRPS`: 记录出拳，双方都出后调 `resolveRPS`
- 新增 `resolveRPS`: 判定胜负，平局清空重来，胜者进入 choosing
- 新增 `handleChooseColor`: 胜者选黑/白，设置 `blackId`/`whiteId`，进入 playing
- `onPlayerAction`: 新增 `rps` 和 `choose_color` case
- Bot 处理: RPS 阶段 bot 随机出拳（延迟 1.5s），choosing 阶段 bot 随机选色（延迟 2s）
- `makeBotMove`: 检查 phase === 'playing' 后才触发

### 2. 客户端 `games/gomoku/client/GomokuGame.jsx`
- 新增 state: `myRpsChoice`
- 监听 socket 事件: `rps_recorded`, `rps_draw`, `rps_result`, `rps_start`
- RPS UI: 三个按钮（石头/剪刀/布），象棋同样式，`gomoku-rps-*` 类名
- Choosing UI: 两个按钮（执黑/执白），`gomoku-choose-*` 类名
- 重置 `myRpsChoice` 当 phase 变化

### 3. CSS `client/src/index.css`
- 新增 `.gomoku-rps-*` 样式（复用 chess-rps 设计风格）
- 新增 `.gomoku-choose-*` 样式
- 移动端适配

### 4. `games/gomoku/game.json`
- version: "1.1.0"

### 5. `server/src/services/socketHandler.js`
- 无需修改，`postInit` 已在 `startGame` 中被调用（line 1057-1058）

## 注意事项
- `blackId`/`whiteId` 不再在 `initGameState` 中随机分配，改为 choosing 阶段由胜者决定
- bot 在 RPS/choosing 阶段需要自动操作（参考象棋 bot 的 makeBotMove 模式）
- 所有 ID 比较统一用 `String()` 包装
