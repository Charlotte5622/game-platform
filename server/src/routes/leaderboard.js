const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/leaderboard/:gameId
 * 获取指定游戏的排行榜（前 20 名）
 * 排名依据：胜场数 > 胜率 > 总场次
 */
router.get('/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;

    // 聚合每个用户在该游戏的战绩
    const records = await prisma.gameRecord.findMany({
      where: { gameId },
      select: { userId: true, result: true },
    });

    // 按用户聚合
    const userMap = {};
    for (const r of records) {
      if (!userMap[r.userId]) {
        userMap[r.userId] = { wins: 0, losses: 0, draws: 0, total: 0 };
      }
      const u = userMap[r.userId];
      u.total++;
      if (r.result === 'win') u.wins++;
      else if (r.result === 'lose') u.losses++;
      else u.draws++;
    }

    // 排序：胜场降序 → 胜率降序 → 总场次降序
    const sorted = Object.entries(userMap)
      .map(([userId, stats]) => ({
        userId: Number(userId),
        ...stats,
        winRate: stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0,
      }))
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        return b.total - a.total;
      })
      .slice(0, 20);

    // 批量查用户名
    const userIds = sorted.map(p => p.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, nickname: true, avatar: true },
    });
    const userMap2 = {};
    users.forEach(u => { userMap2[u.id] = u; });

    // 组装最终结果
    const leaderboard = sorted.map((p, i) => ({
      rank: i + 1,
      userId: p.userId,
      nickname: userMap2[p.userId]?.nickname || '未知玩家',
      avatar: userMap2[p.userId]?.avatar || null,
      wins: p.wins,
      losses: p.losses,
      draws: p.draws,
      total: p.total,
      winRate: p.winRate,
    }));

    res.json({ gameId, leaderboard });
  } catch (err) {
    console.error('获取排行榜失败:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
