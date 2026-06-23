/**
 * 外部游戏 API 路由
 *
 * 提供外部游戏的查询接口，
 * 与内置游戏的 /api/games 路由独立。
 */

const express = require('express');
const { getExternalGamesList, getExternalGame } = require('../services/externalGameLoader');
const { listRomsForExternalGame } = require('../services/romLibrary');

const router = express.Router();

function safeGetRomLibrary(gameId) {
  try {
    return listRomsForExternalGame(gameId);
  } catch (err) {
    console.warn(`读取外部游戏 ROM 列表失败: ${gameId}`, err.message);
    return null;
  }
}

function toPublicExternalGame(game) {
  const romLibrary = safeGetRomLibrary(game.id);

  return {
    id: game.id,
    name: game.name,
    description: game.description,
    minPlayers: game.minPlayers,
    maxPlayers: game.maxPlayers,
    type: 'external',
    proxyMode: game.proxyMode,
    playPath: game.proxyMode === 'static' ? `/games/${game.id}/` : null,
    romCount: romLibrary?.meta?.available || 0,
    romsApi: romLibrary ? `/api/external-games/${game.id}/roms` : null,
  };
}

/**
 * GET /api/external-games
 * 获取所有已启用的外部游戏列表
 */
router.get('/', (req, res) => {
  const games = getExternalGamesList().map(toPublicExternalGame);
  res.json({ games });
});

/**
 * GET /api/external-games/:id
 * 获取单个外部游戏详情
 */
router.get('/:id', (req, res) => {
  const game = getExternalGame(req.params.id);
  if (!game) {
    return res.status(404).json({ error: '外部游戏不存在' });
  }
  res.json({ game: toPublicExternalGame(game) });
});

/**
 * GET /api/external-games/:id/roms
 * 获取外部模拟器游戏的 ROM 列表
 */
router.get('/:id/roms', (req, res) => {
  const game = getExternalGame(req.params.id);
  if (!game) {
    return res.status(404).json({ error: '外部游戏不存在' });
  }

  let romLibrary;
  try {
    romLibrary = listRomsForExternalGame(req.params.id);
  } catch (err) {
    console.warn(`读取外部游戏 ROM 列表失败: ${req.params.id}`, err.message);
    return res.status(500).json({ error: '加载 ROM 列表失败' });
  }

  if (!romLibrary) {
    return res.status(404).json({ error: '该外部游戏没有 ROM 列表' });
  }

  res.json(romLibrary);
});

module.exports = router;
