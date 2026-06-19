/**
 * 外部游戏加载器
 *
 * 功能：
 * 1. 从 config/external-games.json 读取外部游戏配置
 * 2. 提供外部游戏元数据查询
 * 3. 为每个外部游戏创建代理中间件
 *
 * 外部游戏是独立运行的服务，平台只做反向代理。
 * 与内置游戏（games/ 目录下的插件）完全独立，互不影响。
 */

const fs = require('fs');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { io: socketIOClient } = require('socket.io-client');

const CONFIG_PATH = path.join(__dirname, '../../../config/external-games.json');

// 外部游戏注册表: gameId -> config
const externalGames = new Map();

/**
 * 加载外部游戏配置
 */
function loadExternalGames() {
  console.log('🔌 正在加载外部游戏配置...');

  if (!fs.existsSync(CONFIG_PATH)) {
    console.log('  ⚠️  未找到 external-games.json，跳过');
    return;
  }

  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

    for (const game of config.games || []) {
      if (!game.enabled) {
        console.log(`  ⏭️  ${game.name} (${game.id}) - 已禁用`);
        continue;
      }

      externalGames.set(game.id, {
        ...game,
        type: 'external',
        baseUrl: `http://${game.host || 'localhost'}:${game.port}`,
      });

      console.log(`  ✅ ${game.name} (${game.id}) -> :${game.port}`);
    }

    console.log(`🔌 共加载 ${externalGames.size} 个外部游戏\n`);
  } catch (err) {
    console.error('  ❌ 加载外部游戏配置失败:', err.message);
  }
}

/**
 * 获取所有外部游戏元数据（用于 API 返回）
 */
function getExternalGamesList() {
  return Array.from(externalGames.values()).map(g => ({
    id: g.id,
    name: g.name,
    description: g.description,
    minPlayers: g.minPlayers,
    maxPlayers: g.maxPlayers,
    type: 'external',
  }));
}

/**
 * 获取单个外部游戏配置
 */
function getExternalGame(gameId) {
  return externalGames.get(gameId) || null;
}

/**
 * 判断是否是外部游戏
 */
function isExternalGame(gameId) {
  return externalGames.has(gameId);
}

/**
 * 为 Express 注册外部游戏代理
 * 前端资源代理 + WebSocket 代理
 */
function registerExternalGameProxy(app, io, gameId) {
  const game = externalGames.get(gameId);
  if (!game) return;

  const { baseUrl, wsPath } = game;

  // HTTP 代理：前端资源
  app.use(`/games/${gameId}`, createProxyMiddleware({
    target: baseUrl,
    changeOrigin: true,
    pathRewrite: { [`^/games/${gameId}`]: '' },
  }));

  // WebSocket 代理：游戏通信
  const wsNamespace = `/external/${gameId}`;
  const nsp = io.of(wsNamespace);

  nsp.on('connection', (socket) => {
    console.log(`🔌 [外部游戏 ${gameId}] 玩家连接: ${socket.id}`);

    // 连接到外部游戏的 WebSocket
    const externalSocket = socketIOClient(baseUrl + (wsPath || '/socket.io'), {
      transports: ['websocket'],
      reconnection: false,
    });

    externalSocket.on('connect', () => {
      console.log(`  🔗 [${gameId}] 已连接外部游戏服务`);
    });

    externalSocket.on('connect_error', (err) => {
      console.error(`  ❌ [${gameId}] 连接外部游戏失败: ${err.message}`);
      socket.emit('error', { message: '外部游戏服务不可用' });
      socket.disconnect();
    });

    // 双向转发
    externalSocket.onAny((event, ...args) => {
      socket.emit(event, ...args);
    });

    socket.onAny((event, ...args) => {
      if (externalSocket.connected) {
        externalSocket.emit(event, ...args);
      }
    });

    socket.on('disconnect', () => {
      externalSocket.disconnect();
    });

    externalSocket.on('disconnect', () => {
      socket.disconnect();
    });
  });

  console.log(`  🔗 代理已注册: /games/${gameId} -> ${baseUrl}`);
  console.log(`  🔗 WebSocket: ${wsNamespace} -> ${wsPath}`);
}

/**
 * 注册所有外部游戏的代理
 */
function registerAllExternalProxies(app, io) {
  for (const [gameId] of externalGames) {
    registerExternalGameProxy(app, io, gameId);
  }
}

module.exports = {
  loadExternalGames,
  getExternalGamesList,
  getExternalGame,
  isExternalGame,
  registerExternalGameProxy,
  registerAllExternalProxies,
};
