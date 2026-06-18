require('dotenv').config({ path: '../config/.env' });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const authRoutes = require('./routes/auth');
const gamesRoutes = require('./routes/games');
const { setupSocketHandlers } = require('./services/socketHandler');
const { loadAllGames } = require('./services/gameLoader');

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 8080;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

// Socket.IO
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
  },
});

// 中间件
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());

// 静态文件：游戏资源
app.use('/games', express.static(path.join(__dirname, '../../games')));

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/games', gamesRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 离开房间（sendBeacon 端点，页面卸载时调用）
// sendBeacon 发送 Content-Type: text/plain，需要用 raw 解析
const roomManager = require('./services/roomManager');
const { verifySocketToken } = require('./middleware/auth');

app.post('/api/leave-room', express.raw({ type: '*/*' }), (req, res) => {
  try {
    const body = JSON.parse(req.body.toString());
    const { roomId, token, userId } = body;
    if (userId) {
      roomManager.cleanupUser(userId);
    }
  } catch {}
  res.json({ ok: true });
});

// WebSocket 处理
setupSocketHandlers(io, prisma);

// 启动服务器
server.listen(PORT, () => {
  // 加载游戏插件
  loadAllGames();

  console.log(`🎮 游戏平台服务器运行在 http://localhost:${PORT}`);
  console.log(`📡 WebSocket 已就绪`);
});

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('收到 SIGTERM 信号，正在关闭...');
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});

module.exports = { app, server, io, prisma };
