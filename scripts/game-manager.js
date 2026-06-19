#!/usr/bin/env node

/**
 * 游戏管理工具
 *
 * 功能：
 * - 从 GitHub 搜索游戏
 * - 克隆外部游戏到本地
 * - 自动配置 external-games.json
 * - 启动/停止外部游戏
 *
 * 用法：
 *   node scripts/game-manager.js search <keyword>
 *   node scripts/game-manager.js install <github-url>
 *   node scripts/game-manager.js list
 *   node scripts/game-manager.js start <game-id>
 *   node scripts/game-manager.js stop <game-id>
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const https = require('https');

const EXTERNAL_GAMES_DIR = path.join(__dirname, '../external-games');
const CONFIG_PATH = path.join(__dirname, '../config/external-games.json');

// ========== 配置管理 ==========

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return { games: [] };
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

// ========== GitHub API ==========

function githubGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'game-platform' },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ========== 命令 ==========

async function searchGames(keyword) {
  console.log(`🔍 搜索 GitHub: "${keyword}"...\n`);

  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(keyword)}+socket.io&sort=stars&per_page=10`;
  const data = await githubGet(url);

  if (!data.items || data.items.length === 0) {
    console.log('未找到相关游戏');
    return;
  }

  for (const repo of data.items) {
    console.log(`⭐ ${repo.stargazers_count}  ${repo.full_name}`);
    console.log(`   ${repo.description || '(无描述)'}`);
    console.log(`   ${repo.html_url}`);
    console.log('');
  }
}

async function installGame(githubUrl) {
  // 解析 GitHub URL
  const match = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) {
    console.error('❌ 无效的 GitHub URL');
    return;
  }

  const [, owner, repo] = match;
  const gameId = repo.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const gameDir = path.join(EXTERNAL_GAMES_DIR, gameId);

  // 创建目录
  if (!fs.existsSync(EXTERNAL_GAMES_DIR)) {
    fs.mkdirSync(EXTERNAL_GAMES_DIR, { recursive: true });
  }

  // 克隆仓库
  console.log(`📦 克隆 ${owner}/${repo}...`);
  try {
    execSync(`git clone --depth 1 ${githubUrl} ${gameDir}`, { stdio: 'inherit' });
  } catch (e) {
    console.error('❌ 克隆失败');
    return;
  }

  // 安装依赖
  console.log('\n📥 安装依赖...');
  if (fs.existsSync(path.join(gameDir, 'package.json'))) {
    try {
      execSync('npm install', { cwd: gameDir, stdio: 'inherit' });
    } catch (e) {
      console.warn('⚠️  依赖安装可能有问题，继续...');
    }
  }

  // 读取游戏配置
  let gameConfig = {
    id: gameId,
    name: repo,
    description: '',
    port: 4000 + Math.floor(Math.random() * 100),
    host: 'localhost',
    wsPath: '/socket.io',
    minPlayers: 2,
    maxPlayers: 4,
    enabled: true,
  };

  // 尝试从游戏目录读取配置
  const manifestPath = path.join(gameDir, 'manifest.json');
  const gameJsonPath = path.join(gameDir, 'game.json');
  const pkgPath = path.join(gameDir, 'package.json');

  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    Object.assign(gameConfig, manifest);
  } else if (fs.existsSync(gameJsonPath)) {
    const gameJson = JSON.parse(fs.readFileSync(gameJsonPath, 'utf-8'));
    Object.assign(gameConfig, {
      name: gameJson.name || gameConfig.name,
      description: gameJson.description || gameConfig.description,
      minPlayers: gameJson.minPlayers || gameConfig.minPlayers,
      maxPlayers: gameJson.maxPlayers || gameConfig.maxPlayers,
    });
  }

  // 添加到配置
  const config = loadConfig();
  const existing = config.games.findIndex(g => g.id === gameId);
  if (existing >= 0) {
    config.games[existing] = gameConfig;
  } else {
    config.games.push(gameConfig);
  }
  saveConfig(config);

  console.log(`\n✅ 安装成功！`);
  console.log(`   游戏ID: ${gameId}`);
  console.log(`   目录: ${gameDir}`);
  console.log(`   端口: ${gameConfig.port}`);
  console.log(`\n下一步:`);
  console.log(`   1. 检查游戏目录的 README 了解启动方式`);
  console.log(`   2. 启动游戏: node scripts/game-manager.js start ${gameId}`);
  console.log(`   3. 重启平台: pm2 restart game-server`);
}

function listGames() {
  const config = loadConfig();

  if (config.games.length === 0) {
    console.log('没有已安装的外部游戏');
    return;
  }

  console.log('已安装的外部游戏:\n');
  for (const game of config.games) {
    const status = game.enabled ? '✅' : '⏸️';
    console.log(`  ${status} ${game.id}: ${game.name} (:${game.port})`);
  }
}

function startGame(gameId) {
  const config = loadConfig();
  const game = config.games.find(g => g.id === gameId);

  if (!game) {
    console.error(`❌ 游戏 ${gameId} 不存在`);
    return;
  }

  const gameDir = path.join(EXTERNAL_GAMES_DIR, gameId);
  if (!fs.existsSync(gameDir)) {
    console.error(`❌ 游戏目录不存在: ${gameDir}`);
    return;
  }

  // 检测启动方式
  const pkgPath = path.join(gameDir, 'package.json');
  let startCmd = 'node server.js';

  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    if (pkg.scripts?.start) {
      startCmd = 'npm start';
    }
  }

  console.log(`🚀 启动游戏 ${gameId}...`);
  console.log(`   命令: ${startCmd}`);
  console.log(`   端口: ${game.port}`);

  const child = spawn('bash', ['-c', `PORT=${game.port} ${startCmd}`], {
    cwd: gameDir,
    detached: true,
    stdio: 'ignore',
  });

  child.unref();

  // 保存 PID
  fs.writeFileSync(path.join(gameDir, '.pid'), String(child.pid));

  console.log(`\n✅ 游戏已启动 (PID: ${child.pid})`);
  console.log(`   访问: http://localhost:${game.port}`);
}

function stopGame(gameId) {
  const gameDir = path.join(EXTERNAL_GAMES_DIR, gameId);
  const pidFile = path.join(gameDir, '.pid');

  if (!fs.existsSync(pidFile)) {
    console.log(`游戏 ${gameId} 未在运行`);
    return;
  }

  const pid = fs.readFileSync(pidFile, 'utf-8').trim();
  try {
    process.kill(Number(pid), 'SIGTERM');
    fs.unlinkSync(pidFile);
    console.log(`✅ 游戏 ${gameId} 已停止`);
  } catch (e) {
    console.log(`游戏 ${gameId} 已不在运行`);
    fs.unlinkSync(pidFile);
  }
}

// ========== 主程序 ==========

const [,, command, ...args] = process.argv;

switch (command) {
  case 'search':
    searchGames(args[0] || 'socket.io game');
    break;
  case 'install':
    installGame(args[0]);
    break;
  case 'list':
    listGames();
    break;
  case 'start':
    startGame(args[0]);
    break;
  case 'stop':
    stopGame(args[0]);
    break;
  default:
    console.log(`
游戏管理工具

用法:
  node scripts/game-manager.js search <keyword>    搜索 GitHub 游戏
  node scripts/game-manager.js install <github-url> 安装外部游戏
  node scripts/game-manager.js list                 列出已安装游戏
  node scripts/game-manager.js start <game-id>      启动游戏
  node scripts/game-manager.js stop <game-id>       停止游戏
`);
}
