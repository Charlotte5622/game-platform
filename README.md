# 🎮 多人联机游戏平台

一个自建的多人在线游戏平台，支持 6 款游戏，提供实时对战、房间系统、AI 对手等功能。

## 📋 游戏列表

| 游戏 | 人数 | AI对手 | 说明 |
|------|------|--------|------|
| 🏁 中国象棋 | 2人 | ✅ | 猜拳选色、走棋计时、将军/绝杀判定 |
| 🃏 斗地主 | 3人 | ✅ | 叫分、炸弹、春天、组合牌语音 |
| 🀄 麻将 | 4人 | ❌ | 吃碰杠和、超时自动过 |
| 🎴 UNO | 2-6人 | ✅ | 反转/跳过/+2/+4、喊UNO罚摸 |
| 🧩 海龟汤 | 3-8人 | ❌ | AI裁判（DeepSeek）、投票选题 |
| ⚫ 五子棋 | 2人 | ✅ | 猜拳选色、连珠获胜 |

## ✨ 核心特性

- **房间系统**：创建/加入房间，3-6位房间码，支持机器人填充
- **实时对战**：Socket.IO 双向通信，毫秒级同步
- **语音系统**：66个游戏音效 + 12个互动语音（可拖动面板）
- **音效引擎**：Web Audio API 程序音 + Edge TTS 中文语音
- **用户系统**：注册/登录/GitHub OAuth、头像、昵称、排行榜
- **深色主题**：支持多种主题切换
- **移动端适配**：响应式布局，触控优化

## 🏗️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + Vite + React Router |
| 后端 | Node.js + Express + Socket.IO |
| 数据库 | PostgreSQL + Prisma ORM |
| 认证 | JWT + bcrypt + GitHub OAuth |
| AI | DeepSeek API（象棋/麻将/海龟汤） |
| TTS | Edge TTS（zh-CN-XiaoxiaoNeural） |
| 部署 | PM2 进程管理 |

## 📁 项目结构

```
game-platform/
├── client/                  # 前端 React 应用
│   ├── src/
│   │   ├── components/      # 通用组件 (GameHost, EmotePanel, Navbar)
│   │   ├── pages/           # 页面 (Lobby, Login, Register)
│   │   ├── services/        # 服务 (socket.js, api.js, sounds.js)
│   │   ├── stores/          # 状态管理 (authStore.js)
│   │   └── styles/          # 样式 (index.css)
│   └── public/sfx/          # 音效文件 (按游戏分类)
├── games/                   # 游戏模块（每个游戏独立目录）
│   ├── chinese-chess/
│   │   ├── client/          # React 组件
│   │   └── server/          # 游戏逻辑
│   ├── doudizhu/
│   ├── mahjong/
│   ├── uno/
│   ├── gomoku/
│   └── turtle-soup/
├── server/                  # 后端服务
│   ├── src/
│   │   ├── index.js         # Express + Socket.IO 入口
│   │   ├── middleware/       # JWT 认证中间件
│   │   ├── routes/          # API 路由 (auth, games, leaderboard)
│   │   └── services/        # 核心服务
│   │       ├── socketHandler.js    # Socket 事件处理
│   │       ├── roomManager.js      # 房间管理
│   │       ├── botService.js       # AI 对手
│   │       ├── baseGameServer.js   # 游戏基类（共享）
│   │       ├── gameLoader.js       # 游戏注册
│   │       └── authSecurity.js     # 安全工具
│   └── prisma/              # 数据库 Schema
├── config/                  # 配置文件 (.env)
├── ecosystem.config.js      # PM2 配置
└── AUDIT_REPORT.md          # 代码审计报告
```

---

## 🚀 部署指南

### 一、环境要求

| 依赖 | 最低版本 | 推荐版本 |
|------|---------|---------|
| Node.js | 18.x | 22.x |
| PostgreSQL | 14.x | 16.x |
| npm | 8.x | 10.x |
| PM2 | 5.x | latest |
| nginx | 1.18+ | latest |

### 二、从零部署到新服务器

#### 1. 安装基础环境

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs postgresql nginx

# 安装 PM2
sudo npm install -g pm2

# 安装 edge-tts（语音生成，可选）
pip install edge-tts
```

#### 2. 克隆项目

```bash
cd /home
git clone https://github.com/Charlotte5622/game-platform.git
cd game-platform
```

#### 3. 配置环境变量

```bash
mkdir -p config
cat > config/.env << 'EOF'
# 数据库
DATABASE_URL=postgresql://用户名:密码@localhost:5432/game_platform

# 认证（必须修改！）
JWT_SECRET=替换为随机生成的长字符串至少32位
ENCRYPTION_KEY=替换为另一个随机字符串

# 服务端口
PORT=8080
CLIENT_URL=http://你的域名或IP:3001

# GitHub OAuth（可选）
GITHUB_CLIENT_ID=你的GitHub应用ID
GITHUB_CLIENT_SECRET=你的GitHub应用密钥
GITHUB_CALLBACK_URL=http://你的域名/api/auth/github/callback

# AI（可选，用于象棋/麻将/海龟汤AI）
DEEPSEEK_API_KEY=你的DeepSeek密钥

# 短信验证码（可选）
SMS_ACCESS_KEY_ID=
SMS_ACCESS_KEY_SECRET=
SMS_SIGN_NAME=
SMS_TEMPLATE_CODE=
EOF
```

#### 4. 初始化数据库

```bash
# 创建数据库
sudo -u postgres createdb game_platform

# 安装依赖
npm install
cd client && npm install && cd ..

# 生成 Prisma Client 并迁移
npx prisma generate
npx prisma db push

# 导入海龟汤谜题（可选）
cd games/turtle-soup/server
node -e "require('./seedPuzzles')" 2>/dev/null
cd ../../..
```

#### 5. 构建前端

```bash
cd client
npm run build
cd ..
```

#### 6. 配置 PM2

```bash
# 编辑 ecosystem.config.js 中的路径（如果需要）
cat > ecosystem.config.js << 'PMEOF'
module.exports = {
  apps: [
    {
      name: 'game-server',
      script: 'server/src/index.js',
      cwd: '/home/game-platform',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '500M',
    },
    {
      name: 'game-client',
      script: 'node_modules/.bin/vite',
      args: 'preview --port 3001 --host',
      cwd: '/home/game-platform/client',
      env: { NODE_ENV: 'production' },
    },
  ],
};
PMEOF

# 启动
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # 设置开机自启
```

#### 7. 配置 nginx 反向代理

```nginx
server {
    listen 80;
    server_name 你的域名;

    # 前端
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # API + WebSocket
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/game /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

#### 8. 配置 HTTPS（推荐）

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名
```

### 三、更新部署

```bash
cd /home/game-platform
git pull
cd client && npm run build && cd ..
pm2 restart game-server
pm2 restart game-client
```

### 四、数据备份

```bash
# 数据库备份
pg_dump game_platform > backup_$(date +%Y%m%d).sql

# 恢复
psql game_platform < backup_20260625.sql
```

### 五、迁移项目到其他服务器

完整迁移步骤：

1. **旧服务器导出**：
   ```bash
   # 导出数据库
   pg_dump game_platform > game_platform_dump.sql

   # 打包项目（不含 node_modules）
   cd /home
   tar czf game-platform.tar.gz --exclude='node_modules' --exclude='client/dist' --exclude='.env' game-platform/
   ```

2. **传输到新服务器**：
   ```bash
   scp game-platform.tar.gz user@新服务器:/home/
   scp game_platform_dump.sql user@新服务器:/home/
   ```

3. **新服务器部署**：
   ```bash
   # 解压
   cd /home
   tar xzf game-platform.tar.gz
   cd game-platform

   # 安装依赖
   npm install
   cd client && npm install && cd ..

   # 配置环境变量（参考上面的 config/.env）
   vim config/.env

   # 导入数据库
   sudo -u postgres createdb game_platform
   psql game_platform < /home/game_platform_dump.sql

   # 生成 Prisma Client
   npx prisma generate

   # 构建前端
   cd client && npm run build && cd ..

   # 启动
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup
   ```

4. **配置 nginx 和域名**（参考上面的 nginx 配置）

5. **验证**：
   - 访问前端页面
   - 测试注册/登录
   - 创建房间测试各游戏
   - 检查 WebSocket 连接

### 六、常见问题

| 问题 | 解决方案 |
|------|---------|
| WebSocket 连不上 | 检查 nginx 的 `proxy_read_timeout` 和 `Upgrade` 配置 |
| 数据库连接失败 | 确认 PostgreSQL 监听地址和 `pg_hba.conf` |
| 静态资源404 | 检查 `client/dist` 是否存在（需要 `npm run build`） |
| PM2 内存占用高 | 设置 `max_memory_restart: '500M'` |
| 端口被占用 | `lsof -i :8080` 查看并释放端口 |

---

## 📊 审计报告

完整的代码审计报告见 [AUDIT_REPORT.md](./AUDIT_REPORT.md)，包含 43 个问题的详细分析和修复状态。

## 📄 License

Private project - All rights reserved.
