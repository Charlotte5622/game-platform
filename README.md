# 🎮 联机游戏平台

类似 4399 的自托管联机游戏平台，支持可插拔的游戏模块。

## ✨ 特性

- 🔐 用户注册/登录（JWT 认证）
- 🎮 游戏大厅（游戏列表展示）
- 🏠 自动匹配房间（快速开始游戏）
- 🔌 可插拔游戏架构（每个游戏独立开发）
- 💾 战绩记录（PostgreSQL 持久化）
- ⚡ 实时通信（Socket.IO）

## 🎯 已实现游戏

| 游戏 | 人数 | 说明 |
|------|------|------|
| 🃏 斗地主 | 3人 | 经典三人斗地主，叫分抢地主 |

## 📁 目录结构

```
game-platform/
├── server/           # 后端服务
│   ├── src/
│   │   ├── index.js          # Express + Socket.IO 入口
│   │   ├── routes/           # API 路由（auth, games）
│   │   ├── middleware/       # JWT 认证中间件
│   │   └── services/         # 游戏加载、房间管理、Socket 处理
│   └── prisma/               # 数据库模型
├── client/           # 前端（React + Vite）
│   └── src/
│       ├── pages/            # 页面（登录、注册、大厅、游戏房间）
│       ├── components/       # 组件（导航栏、游戏卡片、GameHost）
│       ├── services/         # API 和 Socket.IO 客户端
│       └── games/            # 游戏组件注册表
├── games/            # 游戏插件目录
│   ├── game-template/        # 游戏开发模板
│   └── doudizhu/             # 斗地主
├── config/           # 配置文件
├── scripts/          # 脚本
└── docker-compose.yml
```

## 🚀 快速开始

### 方式一：Docker Compose（推荐）

```bash
# 1. 复制配置文件
cp config/example.env config/.env

# 2. 启动所有服务
docker-compose up -d

# 3. 初始化数据库
docker-compose exec server npx prisma db push

# 4. 访问
# 前端: http://localhost:3000
# 后端 API: http://localhost:8080
```

### 方式二：本地开发

```bash
# 需要先启动 PostgreSQL 和 Redis（可通过 docker-compose 启动）
docker-compose up -d db redis

# 后端
cd server
npm install
npx prisma db push
npm run dev

# 前端（新终端）
cd client
npm install
npm run dev
```

### 方式三：一键脚本

```bash
./scripts/dev.sh
```

## 🔧 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + Vite + Zustand |
| 后端 | Node.js + Express + Socket.IO |
| 数据库 | PostgreSQL + Prisma ORM |
| 缓存 | Redis |
| 认证 | JWT + bcrypt |
| 部署 | Docker Compose |

## 🎮 添加新游戏

### 1. 创建游戏目录

```bash
cp -r games/game-template games/my-game
```

### 2. 实现服务端逻辑

编辑 `games/my-game/server/index.js`，继承 `GameServer`：

```javascript
const GameServer = require('../../game-template/server/index');

class MyGameServer extends GameServer {
  initGameState(players) {
    // 初始化游戏状态
    return { players, /* ... */ };
  }

  onPlayerAction(roomId, playerId, action) {
    // 处理玩家操作
  }

  getVisibleState(gameState, playerId) {
    // 返回该玩家可见的状态（隐藏其他玩家信息）
    return gameState;
  }
}

module.exports = MyGameServer;
```

### 3. 实现前端组件

编辑 `games/my-game/client/MyGame.jsx`：

```jsx
export default function MyGame({ socket, roomId, playerId, gameState, onAction, players }) {
  // 渲染游戏 UI
  return <div>...</div>;
}
```

### 4. 注册到平台

编辑 `client/src/games/index.js`：

```javascript
import MyGame from '../../games/my-game/client/MyGame';

const gameComponents = {
  'doudizhu': DoudizhuGame,
  'my-game': MyGame,  // 添加这行
};
```

### 5. 更新 game.json

```json
{
  "id": "my-game",
  "name": "我的游戏",
  "description": "游戏描述",
  "minPlayers": 2,
  "maxPlayers": 4,
  "version": "1.0.0"
}
```

## 📡 WebSocket 消息协议

### 客户端 → 服务器

| 事件 | 数据 | 说明 |
|------|------|------|
| `quick_match` | `{ gameId }` | 快速匹配 |
| `join_room` | `{ roomId }` | 加入指定房间 |
| `player_ready` | `{ roomId, ready }` | 准备/取消准备 |
| `game_action` | `{ roomId, action }` | 游戏操作 |

### 服务器 → 客户端

| 事件 | 数据 | 说明 |
|------|------|------|
| `room_update` | `{ roomId, players, state }` | 房间状态变化 |
| `game_start` | `{ roomId, state }` | 游戏开始 |
| `state_update` | `{ state }` | 游戏状态更新 |
| `game_over` | `{ winner, scores, message }` | 游戏结束 |

## 📝 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录 |
| GET | `/api/auth/me` | 获取当前用户信息 |
| GET | `/api/games` | 获取游戏列表 |
| GET | `/api/health` | 健康检查 |

## 📄 License

MIT
