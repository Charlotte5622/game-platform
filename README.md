# 🎮 Game Platform — 自托管联机游戏平台

类似 4399 的自托管多人联机游戏平台，支持可插拔的游戏模块，PC 和手机端自适应。

## ✨ 特性

- 🔐 用户注册 / 登录（JWT 认证）
- 🎮 游戏大厅（游戏列表、快速匹配）
- 🏠 房间系统（创建 / 加入 / 机器人填充）
- 🔌 可插拔游戏架构（每个游戏独立开发，热加载）
- 💾 战绩记录（PostgreSQL 持久化）
- ⚡ 实时通信（Socket.IO）
- 🤖 AI 对手（DeepSeek / 纯代码两种模式）
- 📱 移动端自适应（触控操作、竖屏布局）

## 🎯 已实现游戏

| 游戏 | 人数 | AI | 说明 |
|------|------|-----|------|
| 🀄 四人麻将 | 4人 | DeepSeek | 吃碰杠和、记牌器、手机端自适应 |
| ♟️ 中国象棋 | 2人 | DeepSeek | 猜拳选色、走棋记录、步时超时判负 |
| 🃏 斗地主 | 3人 | 纯代码 | 经典叫分抢地主、54张牌 |
| 🎴 UNO | 2-6人 | 纯代码 | +2/+4叠加、反转、跳过 |
| 🔢 五子棋 | 2人 | — | 15×15棋盘、禁手规则 |
| 🐢 海龟汤 | 1-10人 | DeepSeek | 125道题、5个分类、AI智能判别 |

## 📁 目录结构

```
game-platform/
├── server/                  # 后端服务
│   ├── src/
│   │   ├── index.js         # Express + Socket.IO 入口
│   │   ├── routes/          # API 路由（auth, leaderboard）
│   │   ├── middleware/      # JWT 认证
│   │   └── services/        # 游戏加载、房间管理、Bot 管理
│   └── prisma/              # 数据库 Schema + 迁移脚本
├── client/                  # 前端（React 18 + Vite）
│   └── src/
│       ├── components/      # 通用组件（Lobby, Navbar, GameHost）
│       ├── pages/           # 页面（Login, Register）
│       └── index.css        # 全局样式（7800+ 行，含全游戏适配）
├── games/                   # 游戏插件目录
│   ├── chinese-chess/       # 中国象棋
│   ├── doudizhu/            # 斗地主
│   ├── mahjong/             # 四人麻将
│   ├── uno/                 # UNO
│   ├── gomoku/              # 五子棋
│   ├── turtle-soup/         # 海龟汤
│   └── game-template/       # 新游戏开发模板
├── config/                  # 外部游戏配置
├── data/                    # 数据文件（题库 JSON 等）
└── docker-compose.yml
```

## 🚀 快速开始

### Docker Compose（推荐）

```bash
git clone https://github.com/Charlotte5622/game-platform.git
cd game-platform

# 启动数据库 + Redis + 服务
docker-compose up -d

# 初始化数据库
cd server && npx prisma db push && npx prisma generate
```

### 本地开发

```bash
# 后端
cd server
npm install
npx prisma db push
npx prisma generate
npm run dev        # localhost:8080

# 前端
cd client
npm install
npm run dev        # localhost:3001
```

### PM2 部署

```bash
pm2 start ecosystem.config.js
```

## 🏗️ 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + Vite |
| 后端 | Node.js + Express + Socket.IO |
| 数据库 | PostgreSQL 15（Docker） |
| ORM | Prisma 5 |
| 认证 | JWT + bcrypt |
| 缓存 | Redis 7（房间状态） |
| AI | DeepSeek API / ModelScope |
| 部署 | PM2 + Docker Compose |

## 🎲 添加新游戏

1. 复制 `games/game-template/` 目录
2. 编写 `game.json`（名称、人数、描述）
3. 实现 `server/index.js`（继承 `BaseGameServer`）
4. 实现 `client/XXXGame.jsx`（React 组件）
5. 重启服务，游戏自动加载

详见 `games/game-template/` 和 `games/README.md`。

## 📝 海龟汤题库

当前 **125 道题**，5 个分类：

| 分类 | 数量 | 说明 |
|------|------|------|
| 🔍 悬疑推理 | 53 | 经典推理、逻辑谜题 |
| 👻 恐怖惊悚 | 49 | 悬疑恐怖、暗黑故事 |
| 🎭 黑色幽默 | 11 | 反转、巧合、误会 |
| 💝 温馨感人 | 7 | 感人故事、亲情友情 |
| 🧠 脑洞大开 | 5 | 超常规思维 |

题库位于 `data/turtle_soup_import_*.json`，支持批量导入。

## 📄 License

MIT
