/**
 * 外部游戏 API 路由
 *
 * 提供外部游戏的查询接口，
 * 与内置游戏的 /api/games 路由独立。
 */

const express = require('express');
const { getExternalGamesList, getExternalGame } = require('../services/externalGameLoader');

const router = express.Router();

/**
 * GET /api/external-games
 * 获取所有已启用的外部游戏列表
 */
router.get('/', (req, res) => {
  const games = getExternalGamesList();
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
  res.json({
    game: {
      id: game.id,
      name: game.name,
      description: game.description,
      minPlayers: game.minPlayers,
      maxPlayers: game.maxPlayers,
      type: 'external',
    },
  });
});

module.exports = router;
