/**
 * 外部游戏加载器
 *
 * 支持两种代理模式：
 * 1. proxy  - 全代理（HTTP + WebSocket），适合 Socket.IO 游戏
 * 2. iframe - 仅代理 HTTP，游戏自行处理 WebSocket，适合大型独立项目
 */

const fs = require('fs');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const CONFIG_PATH = path.join(__dirname, '../../../config/external-games.json');
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

      const proxyMode = game.proxyMode || 'iframe'; // 默认 iframe 模式
      externalGames.set(game.id, {
        ...game,
        proxyMode,
        baseUrl: `http://${game.host || 'localhost'}:${game.port}`,
      });

      console.log(`  ✅ ${game.name} (${game.id}) -> :${game.port} [${proxyMode}]`);
    }

    console.log(`🔌 共加载 ${externalGames.size} 个外部游戏\n`);
  } catch (err) {
    console.error('  ❌ 加载外部游戏配置失败:', err.message);
  }
}

/**
 * 获取所有外部游戏元数据
 */
function getExternalGamesList() {
  return Array.from(externalGames.values()).map(g => ({
    id: g.id,
    name: g.name,
    description: g.description,
    minPlayers: g.minPlayers,
    maxPlayers: g.maxPlayers,
    type: 'external',
    proxyMode: g.proxyMode,
  }));
}

function getExternalGame(gameId) {
  return externalGames.get(gameId) || null;
}

function isExternalGame(gameId) {
  return externalGames.has(gameId);
}

/**
 * 注册外部游戏代理
 */
function registerExternalGameProxy(app, io, gameId) {
  const game = externalGames.get(gameId);
  if (!game) return;

  const { baseUrl, proxyMode } = game;

  if (proxyMode === 'iframe') {
    // iframe 模式：只代理 HTTP，不处理 WebSocket
    // 游戏自行管理 WebSocket 连接
    app.use(`/games/${gameId}`, createProxyMiddleware({
      target: baseUrl,
      changeOrigin: true,
      ws: false,
      pathRewrite: { [`^/games/${gameId}`]: '' },
    }));
    console.log(`  🔗 HTTP代理: /games/${gameId} -> ${baseUrl} [iframe模式]`);
  } else {
    // proxy 模式：代理 HTTP + WebSocket
    app.use(`/games/${gameId}`, createProxyMiddleware({
      target: baseUrl,
      changeOrigin: true,
      ws: true,
      pathRewrite: { [`^/games/${gameId}`]: '' },
    }));
    console.log(`  🔗 全代理: /games/${gameId} -> ${baseUrl} [proxy模式]`);
  }
}

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
