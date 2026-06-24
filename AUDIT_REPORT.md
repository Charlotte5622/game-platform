# 🔍 游戏平台全面审计报告
> 审计时间: 2026-06-25 | 双Agent交叉验证 | 覆盖前后端全部代码

---

## 一、统计总览

| 类别 | 🔴 严重 | 🟠 高 | 🟡 中 | 🟢 低 | 合计 |
|------|---------|-------|-------|-------|------|
| Bug | 2 | 4 | 7 | 5 | 18 |
| 安全问题 | 2 | 1 | 3 | 3 | 9 |
| 冗余代码 | - | - | - | - | 10 |
| React性能 | - | - | 6 | - | 6 |
| **合计** | **4** | **5** | **16** | **8** | **43** |

---

## 二、🔴 严重Bug (必须立即修复)

### BUG-01: DoudizhuGame 缺少 `useRef` 导入 → 运行时崩溃
- **文件**: `games/doudizhu/client/DoudizhuGame.jsx:1` vs `:212`
- **问题**: 第1行 `import { useState, useEffect, useCallback }` 未导入 `useRef`，但第212行 `const prevPhaseRef = useRef(null)` 使用了它
- **影响**: 斗地主游戏在phase变化时抛 `ReferenceError`，游戏崩溃
- **修复**: 第1行添加 `useRef`
- **✅ 已验证**: 确认存在此问题

### BUG-02: 多处 PrismaClient 实例化 → 数据库连接池泄漏
- **文件**: `server/src/index.js:19`, `auth.js:48`, `leaderboard.js:5`, `gameLoader.js:5`
- **问题**: 4个独立 PrismaClient 实例，每个默认10连接，共40连接
- **影响**: 高并发时耗尽PostgreSQL连接上限
- **修复**: 统一使用 index.js 中的实例，通过依赖注入传递
- **✅ 已验证**: 4处 `new PrismaClient()` 确认

---

## 三、🟠 高优先级Bug

### BUG-03: GomokuGame `playSound('click')` 参数错误 → 音效不播放
- **文件**: `games/gomoku/client/GomokuGame.jsx:334,381,382`
- **问题**: `playSound(gameId, eventName)` 需要2个参数，但写了 `playSound('click')`（1个参数），`SOUND_MAP['click']` 不存在
- **影响**: 五子棋所有按钮点击无声
- **✅ 已验证**: 3处错误调用确认

### BUG-04: 五子棋/象棋 `handleDrawResponse` 未验证求和请求 → 可强制和棋
- **文件**: `games/gomoku/server/index.js:505-507`
- **问题**: 只检查 `phase === 'playing'`，不检查是否有活跃的 `drawRequest`。任何玩家可发送 `draw_response accept` 强制和棋
- **✅ 已验证**: 确认缺少 drawRequest 存在性检查

### BUG-05: `return_to_room` 缺少完整验证 → 恶意重连
- **文件**: `server/src/services/socketHandler.js:484-531`
- **问题**: 只检查 `wasInRoom`（曾经在房间），未验证当前是否仍在房间。已离开的玩家可反复重连
- **修复**: 增加 `roomManager.getUserRoom(socket.user.id)` 检查

### BUG-06: `kick_player` 直接操作数组绕过 roomManager → 脏数据
- **文件**: `server/src/services/socketHandler.js:587,609`
- **问题**: `room.players = room.players.filter(...)` 绕过 roomManager 映射维护
- **修复**: 使用 `roomManager.removePlayer()` 方法

---

## 四、🟡 中等优先级Bug

### BUG-07: Navbar 取消静音时点击声在音量0下播放
- **文件**: `client/src/components/Navbar.jsx:17-23`
- **问题**: `toggleMute` 先播放音效（音量0），再恢复音量。用户听不到取消静音的反馈

### BUG-08: 斗地主 `restartGame` 未保留 `playerInfo`
- **文件**: `games/doudizhu/server/index.js:401-416`
- **问题**: 重新发牌后 `playerInfo` 丢失，客户端无法显示玩家昵称/头像

### BUG-09: GameHost 与游戏组件的 `game_over` 处理冲突
- **文件**: `GameHost.jsx:189` + 各游戏组件
- **问题**: GameHost 设置 `phase='finished'` 卸载游戏组件，导致各游戏内部的结果弹窗成为死代码（如象棋的绝杀/投降弹窗、五子棋的结果屏幕）

### BUG-10: 麻将超时自动操作未检查期间玩家是否已操作
- **文件**: `games/mahjong/server/index.js:350-364`
- **问题**: setTimeout 超时后直接 pass，未验证玩家是否已碰/杠

### BUG-11: UNO 罚摸逻辑可能误罚
- **文件**: `games/uno/server/index.js:196-213`
- **问题**: `calledUno[pid]` 可能在 `handleDrawCard` 中被重置为 false，导致出到1张时误罚

### BUG-12: 海龟汤 Timer 引用存储在游戏状态中
- **文件**: `games/turtle-soup/server/index.js:113,251`
- **问题**: `voteTimer`/`revealTimer` 是 setTimeout 返回值，房间销毁时未清理会内存泄漏

### BUG-13: 五子棋 Bot 同意和棋后不记录战绩
- **文件**: `games/gomoku/server/index.js:470-492`
- **问题**: Bot `Math.random() < 0.5` 同意和棋后不调用 `onGameOver`

---

## 五、🟢 低优先级Bug

| 编号 | 文件 | 问题 |
|------|------|------|
| L01 | `sounds.js:23-27` | AudioContext resume 事件监听器永远不移除 |
| L02 | `DoudizhuGame.jsx:196` | passAnimation setTimeout 未清理，组件卸载后 set state |
| L03 | `EmotePanel.jsx:70-75` | onPointerUp 闭包捕获的 position 可能过时 |
| L04 | `MahjongGame.jsx:216` | processedEvents Set 只增不减，长时间游戏内存增长 |
| L05 | `GameHost.jsx:122` | 重连用 `quick_match` 而非专门的重连事件 |

---

## 六、安全问题

### 🔴 高危

| 编号 | 文件 | 问题 |
|------|------|------|
| S01 | `middleware/auth.js:4` | JWT_SECRET 使用硬编码 fallback `'dev-secret-change-in-production'`，生产环境若未配置则所有token可伪造 |
| S02 | `authSecurity.js:26` | Encryption Key 依赖 JWT_SECRET，若JWT未配置则加密也可预测 |

### 🟠 中危

| 编号 | 文件 | 问题 |
|------|------|------|
| S03 | `routes/auth.js:767` | GitHub OAuth state cookie `secure: false`，HTTP下可被截获进行CSRF |
| S04 | `index.js:116-143` | sendBeacon leave-room 端点信任客户端提供的 token/userId |
| S05 | `routes/auth.js:791` | CLIENT_URL fallback 硬编码内网IP `119.29.147.165` |

### 🟢 低危

| 编号 | 文件 | 问题 |
|------|------|------|
| S06 | `routes/leaderboard.js:12` | 排行榜接口无认证，可被爬虫滥用 |
| S07 | `authSecurity.js:242` | Cookie 值无长度限制 |
| S08 | `routes/auth.js:282` | 验证码明文输出到控制台日志 |
| S09 | `index.js:72` | CSP connect-src 允许任意域名 |

---

## 七、冗余代码

| 编号 | 文件 | 问题 |
|------|------|------|
| R01 | `socketHandler.js:66-70` | `if (dbUser)` 死代码（前面已检查 `!dbUser`） |
| R02 | 6个游戏 server/index.js | `BaseGameServer` 类重复定义6次，应提取为共享模块 |
| R03 | `chinese-chess` + `gomoku` server | `RPS_CHOICES` 和 `judgeRPS` 完全重复 |
| R04 | `GameHost.jsx:621-636,722-737` | 离开确认弹窗 JSX 重复2处 |
| R05 | `UnoGame.jsx:256` | `phase==='ended' \|\| (...&& phase==='ended')` 条件重复 |
| R06 | `TurtleSoupGame.jsx:99,194` | `getNickname` 函数定义2次 |
| R07 | `socketHandler.js:376,427` | 冗余注释3处 |
| R08 | `leaderboard.js:60` | 变量名 `userMap2` 语义不清 |
| R09 | `GameHost.jsx:44,179` | 生产环境残留 console.log |
| R10 | `GameHost.jsx:349-352` | `handleQuickMatch` 只是 `handleCreateRoom` 的薄包装 |

---

## 八、React 性能问题

| 编号 | 文件 | 问题 |
|------|------|------|
| P01 | `ChineseChessGame.jsx:356-379` | moveHistory useEffect 依赖数组每次 state_update 都触发 |
| P02 | `MahjongGame.jsx:244-277` | currentTurn 变化时重新绑定所有 socket 监听器 |
| P03 | `GameHost.jsx:86-92` | BGM effect 在5个phase间多次 start/stop |
| P04 | 多个游戏组件 | `emitAction` 未用 `useCallback`，每次渲染创建新引用 |
| P05 | `sounds.js:520` | `_audioCache` 无大小限制 |
| P06 | `GameHost.jsx:529` | 匹配等待界面无取消按钮 |

---

## 九、最优先修复清单（按紧急度排序）

1. **🔴 DoudizhuGame 添加 useRef 导入** — 1行改动，防止崩溃
2. **🔴 统一 PrismaClient 实例** — 防止连接池泄漏
3. **🟠 GomokuGame playSound 参数修复** — 2处改为 soundClick()
4. **🟠 handleDrawResponse 增加 drawRequest 验证** — 防止强制和棋
5. **🟠 kick_player 通过 roomManager 操作** — 防止脏数据
6. **🟡 JWT_SECRET 启动检查** — 生产环境安全基线
7. **🟡 提取 BaseGameServer 为共享模块** — 消除6处重复
