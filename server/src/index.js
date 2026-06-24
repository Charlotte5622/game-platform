require('dotenv').config({ path: '../config/.env' });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const prisma = require('./services/prisma');

const authRoutes = require('./routes/auth');
const gamesRoutes = require('./routes/games');
const externalGamesRoutes = require('./routes/externalGames');
const leaderboardRoutes = require('./routes/leaderboard');
const { listEmulatorRoms } = require('./services/romLibrary');
const { setupSocketHandlers } = require('./services/socketHandler');
const { loadAllGames } = require('./services/gameLoader');
const { loadExternalGames, registerAllExternalProxies } = require('./services/externalGameLoader');
const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 8080;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3001';

app.disable('x-powered-by');
app.set('trust proxy', 1);

// Socket.IO
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
  },
});

// 中间件
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const isEmulatorAsset = req.path.startsWith('/games/emulator');
  const csp = isEmulatorAsset
    ? [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: https://cdn.emulatorjs.org",
        "style-src 'self' 'unsafe-inline' https://cdn.emulatorjs.org",
        "img-src 'self' data: blob: https://cdn.emulatorjs.org",
        "font-src 'self' data: https://cdn.emulatorjs.org",
        "media-src 'self' data: blob: https://cdn.emulatorjs.org",
        "connect-src 'self' blob: http: https: ws: wss:",
        "worker-src 'self' blob: https://cdn.emulatorjs.org",
        "child-src 'self' blob:",
        "frame-src 'self'",
        "form-action 'self'",
      ]
    : [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "media-src 'self' data: blob:",
        "connect-src 'self' http: https: ws: wss:",
        "frame-src 'self'",
        "form-action 'self'",
      ];
  res.setHeader(
    'Content-Security-Policy',
    csp.join('; ')
  );
  next();
});
app.use(express.json({ limit: '64kb' }));

// 静态文件：内置游戏资源（只响应实际存在的文件，不拦截代理请求）
app.use('/games', express.static(path.join(__dirname, '../../games'), {
  // 设置 fallthrough，让不存在的文件请求传递给后续中间件（代理）
  fallthrough: true,
}));

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/external-games', externalGamesRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ROM list API for emulator games
app.get('/api/roms', (req, res) => {
  try {
    res.json(listEmulatorRoms());
  } catch (err) {
    console.error('加载 ROM 列表失败:', err.message);
    res.status(500).json({ error: '加载 ROM 列表失败' });
  }
});

// 离开房间（sendBeacon 端点，页面卸载时调用）
// sendBeacon 发送 Content-Type: text/plain，需要用 raw 解析
const roomManager = require('./services/roomManager');
const { verifySocketToken } = require('./middleware/auth');

app.post('/api/leave-room', express.raw({ type: '*/*' }), (req, res) => {
  try {
    const body = JSON.parse(req.body.toString());
    const { roomId, token, userId } = body;
    if (userId && token) {
      const decoded = verifySocketToken(token);
      if (decoded && decoded.id === userId) {
        const userRoom = roomManager.getUserRoom(userId);
        if (userRoom) {
          const { roomId: rid, room } = userRoom;
          if (room) {
            // 从 players 数组移除该用户
            room.players = room.players.filter(p => p.id !== userId);
            // 如果只剩机器人或房间已空，销毁房间
            const humans = room.players.filter(p => !p.isBot);
            if (humans.length === 0) {
              roomManager.destroyRoom(rid);
            }
          }
        }
        roomManager.cleanupUser(userId);
      }
    }
  } catch (err) {
    console.warn('leave-room 解析错误:', err.message);
  }
  res.json({ ok: true });
});


// WebSocket 处理
setupSocketHandlers(io, prisma);

// 启动服务器
server.listen(PORT, () => {
  // 加载内置游戏插件
  loadAllGames();

  // 加载外部游戏配置并注册代理
  loadExternalGames();
  registerAllExternalProxies(app, io);

  console.log(`🎮 游戏平台服务器运行在 http://localhost:${PORT}`);
  console.log(`📡 WebSocket 已就绪`);
});

// 优雅关闭
const gracefulShutdown = async (signal) => {
  console.log(`收到 ${signal} 信号，正在关闭...`);
  await prisma.$disconnect();
  server.close(() => process.exit(0));
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = { app, server, io, prisma };
