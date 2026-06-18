const fs = require('fs');
const path = require('path');

const gamesDir = path.join(__dirname, '../../../games');
const registeredGames = new Map(); // gameId -> { meta, GameServerClass }

/**
 * 扫描 games/ 目录，加载所有游戏插件
 */
function loadAllGames() {
  console.log('🎮 正在加载游戏插件...');

  if (!fs.existsSync(gamesDir)) {
    console.warn('⚠️  games/ 目录不存在');
    return;
  }

  const entries = fs.readdirSync(gamesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const gameDir = path.join(gamesDir, entry.name);
    const gameJsonPath = path.join(gameDir, 'game.json');

    // 跳过没有 game.json 的目录
    if (!fs.existsSync(gameJsonPath)) continue;

    try {
      const meta = JSON.parse(fs.readFileSync(gameJsonPath, 'utf-8'));

      // 跳过模板
      if (entry.name === 'game-template') continue;

      // 加载服务端逻辑
      const serverPath = path.join(gameDir, 'server', 'index.js');
      let GameServerClass = null;

      if (fs.existsSync(serverPath)) {
        GameServerClass = require(serverPath);
      }

      registeredGames.set(meta.id, {
        meta: {
          ...meta,
          // 确保客户端路径可用
          clientPath: `/games/${entry.name}/client`,
        },
        GameServerClass,
        instance: null, // 延迟实例化
      });

      console.log(`  ✅ ${meta.name} (${meta.id})`);
    } catch (err) {
      console.error(`  ❌ 加载游戏 ${entry.name} 失败:`, err.message);
    }
  }

  console.log(`🎮 共加载 ${registeredGames.size} 个游戏\n`);
}

/**
 * 获取已注册游戏列表（元数据）
 */
function getRegisteredGames() {
  return Array.from(registeredGames.values()).map(g => g.meta);
}

/**
 * 获取游戏服务端实例
 */
function getGameInstance(gameId) {
  const entry = registeredGames.get(gameId);
  if (!entry) return null;

  // 延迟实例化
  if (!entry.instance && entry.GameServerClass) {
    entry.instance = new entry.GameServerClass();
  }

  return entry.instance;
}

/**
 * 检查游戏是否存在
 */
function gameExists(gameId) {
  return registeredGames.has(gameId);
}

module.exports = { loadAllGames, getRegisteredGames, getGameInstance, gameExists };
