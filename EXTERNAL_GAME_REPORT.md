# 外部游戏代理模块 - 开发报告

## 概述

新增外部游戏代理功能，支持将独立运行的外部游戏接入平台。与现有内置游戏系统**完全并存，互不影响**。

---

## 架构设计

```
┌─────────────────────────────────────────────────┐
│                游戏平台 (8080)                    │
│                                                  │
│   ┌────────────────┐   ┌────────────────────┐   │
│   │   内置游戏      │   │    外部游戏         │   │
│   │  (进程内加载)   │   │   (反向代理)        │   │
│   └───────┬────────┘   └─────────┬──────────┘   │
│           │                      │              │
│      require()            http-proxy-middleware   │
│           ↓                      ↓              │
│     本进程代码            localhost:4001         │
│                                                  │
│   games/doudizhu/         外部独立项目           │
│   games/mahjong/          自己开端口运行         │
│   games/chinese-chess/                           │
└─────────────────────────────────────────────────┘
```

---

## 新增文件

| 文件 | 说明 |
|------|------|
| `config/external-games.json` | 外部游戏配置（游戏ID、端口、启用状态） |
| `server/src/services/externalGameLoader.js` | 外部游戏加载器 + 代理注册 |
| `server/src/routes/externalGames.js` | 外部游戏 API 路由 |

## 修改文件

| 文件 | 改动 |
|------|------|
| `server/src/index.js` | +3行：引入外部游戏模块、注册路由、启动时加载 |
| `server/package.json` | +2依赖：http-proxy-middleware, socket.io-client |

---

## 配置格式

`config/external-games.json`:

```json
{
  "games": [
    {
      "id": "my-game",           // 游戏唯一ID
      "name": "我的游戏",         // 显示名称
      "description": "游戏描述",
      "port": 4001,              // 外部游戏运行端口
      "host": "localhost",       // 外部游戏主机
      "wsPath": "/socket.io",    // WebSocket 路径
      "frontendPath": "/",       // 前端资源路径
      "minPlayers": 2,
      "maxPlayers": 4,
      "enabled": true            // 是否启用
    }
  ]
}
```

---

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/external-games` | 获取所有外部游戏列表 |
| GET | `/api/external-games/:id` | 获取单个外部游戏详情 |

---

## 代理机制

### HTTP 代理（前端资源）

```
请求: GET /games/my-game/index.html
  → 代理到: http://localhost:4001/index.html
```

### WebSocket 代理（游戏通信）

```
客户端连接: ws://平台/external/my-game
  → 转发到: ws://localhost:4001/socket.io
  → 双向消息转发
```

---

## 外部游戏接入步骤

### 1. 开发外部游戏

外部游戏是独立项目，只需：
- 开放一个 HTTP 端口提供前端资源
- 开放 WebSocket 端口处理游戏通信
- 提供 `manifest.json` 描述游戏元数据

### 2. 配置平台

编辑 `config/external-games.json`，添加游戏配置：

```json
{
  "id": "my-chess",
  "name": "我的象棋",
  "port": 4001,
  "enabled": true
}
```

### 3. 启动外部游戏

```bash
cd my-chess-game
node server.js  # 监听 4001 端口
```

### 4. 重启平台

```bash
pm2 restart game-server
```

### 5. 访问

平台大厅会显示外部游戏卡片，点击后通过代理加载游戏页面。

---

## 兼容性

| 功能 | 内置游戏 | 外部游戏 |
|------|----------|----------|
| 游戏列表 API | `/api/games` | `/api/external-games` |
| 前端加载 | React 组件 import | iframe / 代理页面 |
| WebSocket | 平台 Socket.IO 直连 | 平台代理转发 |
| 房间管理 | 平台 roomManager | 外部游戏自行管理 |
| 战绩记录 | 平台自动记录 | 需外部游戏回调 |
| 认证 | 平台 JWT | 需传递 token |

---

## 未实现项

| 优先级 | 说明 |
|--------|------|
| P1 | 前端 GameRoom 支持 iframe 加载外部游戏 |
| P1 | 外部游戏认证 token 传递 |
| P2 | 外部游戏战绩回调接口 |
| P2 | 外部游戏健康检查 |
| P3 | 外部游戏热加载（不重启平台） |

---

## 附带修复

### Chinese Chess Bug

修复 `handleChooseColor` 中 `redPlayerKey` 未定义错误，改为 `redPlayerId`。
