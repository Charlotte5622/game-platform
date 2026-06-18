# 修复报告

## 概述

本次修复覆盖 10 个文件（含 1 个新增），解决 3 个 P0 致命 bug、3 个 P1 安全/连接问题、以及代码审查发现的 7 个额外缺陷。

---

## 第一轮修复（P0 + P1）

### FIX-1: 游戏状态存储断裂

**问题**: `DoudizhuServer` 维护自己的 `this.rooms` Map，但 `socketHandler` 将游戏状态存入 `roomManager`。两套数据互不相通，`onPlayerAction()` 始终读到 `undefined`，**游戏完全无法进行**。

**修复**: 引入状态访问器模式。`BaseGameServer` 新增 `_getRoomData` / `_setRoomData` 属性，由 `socketHandler.startGame()` 注入 `roomManager.getGameData` / `setGameData`。所有游戏逻辑改用 `this.getState(roomId)` / `this.saveState(roomId, state)` 读写。

**改动**: `roomManager.js` (+getGameData/setGameData), `socketHandler.js` (注入访问器), `doudizhu/server/index.js` (重写基类和全部状态访问)

---

### FIX-2: game_start 事件双重发送

**问题**: `socketHandler.startGame()` 和 `DoudizhuServer.setLandlord()` 各发一次 `game_start`，客户端收到两条。

**修复**: 从 `socketHandler.startGame()` 移除 `game_start` 发送，改由游戏实例的 `setLandlord()` 通过 `sendToPlayer` 向每个玩家单独发送各自可见的状态。

**改动**: `socketHandler.js` (移除发送), `doudizhu/server/index.js` (用 doBroadcastTo)

---

### FIX-3: 牌型判定 — 飞机带单翼恒为 true

**问题**: `cards.js:167` 条件 `trios.length === singles.length + (groups.filter(g => g.count === 3).length - singles.length)` 化简后恒为 `trios.length === trios.length`，任何含 2+ 三条的组合都被误判。

**修复**: 改为 `trios.length === singles.length`。

**改动**: `games/doudizhu/server/cards.js`

---

### FIX-4: 防御性密码哈希保护

**问题**: 注册查询未用 `select`，Prisma 返回的 user 对象含 `password` 字段。

**修复**: `prisma.user.create()` 添加 `select: { id, username, nickname }`。

**改动**: `server/src/routes/auth.js`

---

### FIX-5: Socket.IO 连接可配置

**问题**: 硬编码 `window.location.origin`，无法适配不同部署环境。

**修复**: 支持 `VITE_SOCKET_URL` 环境变量，默认 `window.location.origin`。

**改动**: `client/src/services/socket.js`

---

### FIX-6: 速率限制 + 输入校验

**问题**: 登录/注册无防暴力破解，输入无清理。

**修复**: 新增内存速率限制中间件（惰性清理，无 setInterval）；`sanitize()` 输入清理；用户名正则校验。

**改动**: `server/src/middleware/rateLimit.js` (新增), `server/src/routes/auth.js`

---

## 第二轮修复（代码审查发现）

### FIX-7: 游戏实例单例覆写 (BUG-1, High)

**问题**: `gameLoader.getGameInstance()` 返回单例，两个房间同时玩同一游戏时，后启动的房间覆写前一个房间的 `broadcast` / `onGameOver` 等注入函数。

**修复**:
- `gameLoader` 新增 `createGameInstance(gameId)`，每次调用创建新实例
- 房间对象新增 `gameInstance` 字段，`startGame()` 时存入
- `game_action` 处理器改用 `room.gameInstance` 而非全局单例

**改动**: `server/src/services/gameLoader.js`, `server/src/services/socketHandler.js`, `server/src/services/roomManager.js`

---

### FIX-8: 房间无最大人数限制 (BUG-4, Medium)

**问题**: `joinRoom` 不校验人数上限，第 4 个玩家可加入 3 人斗地主房间，导致 `dealCards` 只生成 3 份手牌，第 4 个玩家的 `playerHands[id]` 为 `undefined`，游戏崩溃。

**修复**:
- `gameLoader` 新增 `getGameMaxPlayers(gameId)`，从 `game.json` 读取
- `joinRoom(roomId, socketId, userInfo, maxPlayers)` 新增可选 `maxPlayers` 参数
- `quickMatch` 同步传递 `maxPlayers`
- `socketHandler` 的 `quick_match` / `join_room` 处理器传入 `maxPlayers`

**改动**: `server/src/services/gameLoader.js`, `server/src/services/roomManager.js`, `server/src/services/socketHandler.js`

---

### FIX-9: game_over 事件结构不一致 (BUG-2, Medium)

**问题**: 正常结束时发送 `{ type, winner, winners, landlord, scores, message }`，断线时只发 `{ reason, message }`，客户端读 `result.winners` 得到 `undefined`。

**修复**: 断线时也发送完整结构，填充默认值。

**改动**: `server/src/services/socketHandler.js`

---

### FIX-10: player_ready 无状态校验 (BUG-3, Low)

**问题**: 游戏进行中或已结束时，客户端仍可发送 `player_ready`，翻转 `ready` 状态，脏写房间数据。

**修复**: 处理器增加 `room.state !== 'waiting'` 守卫。

**改动**: `server/src/services/socketHandler.js`

---

### FIX-11: rateLimit setInterval 泄漏 (BUG-10, Medium)

**问题**: `createRateLimit` 每次调用启动一个永不清理的 `setInterval`。虽然当前只调用一次，但导出的 API 允许多次调用，每次泄漏一个定时器。

**修复**: 改为惰性清理 — 每次请求时顺手清除过期条目（上限 50 条/次），无需定时器。

**改动**: `server/src/middleware/rateLimit.js`

---

### FIX-12: canBeat 死代码 (BUG-7, Low)

**问题**: `cards.js` 中 `bomb vs bomb` 分支不可达，因为同类型比较已在前面处理。

**修复**: 删除不可达代码。

**改动**: `games/doudizhu/server/cards.js`

---

### FIX-13: setStateAccessor 死代码 (BUG-8, Low)

**问题**: `BaseGameServer.setStateAccessor()` 定义了但从未被调用（socketHandler 直接设置 `_getRoomData`/`_setRoomData`）。

**修复**: 删除未使用的方法，改为文档注释说明平台注入的属性。

**改动**: `games/doudizhu/server/index.js`

---

### FIX-14: GameHost parseInt + localStorage 安全 (BUG-12/13, Medium/Low)

**问题**:
- `parseInt(pid)` 假设 player ID 是数字，UUID 场景返回 `NaN` 导致查找失败
- `JSON.parse(localStorage.getItem('user'))` 无 try/catch，畸形 JSON 会崩溃组件

**修复**:
- 比较改为 `String(pl.id) === String(pid)`
- localStorage 解析提取为 `getPlayerId()` 函数，包裹 try/catch
- `playerId` 用 `useMemo` 避免每次渲染重新解析

**改动**: `client/src/components/GameHost.jsx`

---

## 变更清单

| 文件 | 状态 | 涉及修复 |
|------|------|----------|
| `server/src/services/gameLoader.js` | 修改 | FIX-7, FIX-8 |
| `server/src/services/roomManager.js` | 修改 | FIX-1, FIX-8 |
| `server/src/services/socketHandler.js` | 重写 | FIX-1, FIX-2, FIX-7, FIX-8, FIX-9, FIX-10 |
| `games/doudizhu/server/index.js` | 重写 | FIX-1, FIX-2, FIX-13 |
| `games/doudizhu/server/cards.js` | 修改 | FIX-3, FIX-12 |
| `server/src/routes/auth.js` | 修改 | FIX-4, FIX-6 |
| `server/src/middleware/rateLimit.js` | 新增 | FIX-6, FIX-11 |
| `client/src/services/socket.js` | 修改 | FIX-5 |
| `client/src/components/GameHost.jsx` | 修改 | FIX-14 |
| `.gitignore` | 修改 | — |

## 已知未修复项

| 优先级 | 问题 | 说明 |
|--------|------|------|
| P2 | 房间数据纯内存 | 重启丢失，需引入 Redis 持久化 |
| P2 | 断线无法重连 | socket.id 变化后无法找回房间，需按 userId 重连 |
| P2 | 无超时机制 | 叫分/出牌无计时器，挂机卡死 |
| P3 | 前端全内联样式 | 部分组件已迁移到 CSS 类，但仍有残留 |
