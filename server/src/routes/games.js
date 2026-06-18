const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { getRegisteredGames } = require('../services/gameLoader');

const router = express.Router();

/**
 * GET /api/games
 * 获取所有已注册的游戏列表
 */
router.get('/', (req, res) => {
  const games = getRegisteredGames();
  res.json({ games });
});

/**
 * GET /api/games/:id
 * 获取单个游戏详情
 */
router.get('/:id', (req, res) => {
  const games = getRegisteredGames();
  const game = games.find(g => g.id === req.params.id);

  if (!game) {
    return res.status(404).json({ error: '游戏不存在' });
  }

  res.json({ game });
});

module.exports = router;
