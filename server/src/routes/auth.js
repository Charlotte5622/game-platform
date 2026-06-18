const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, generateToken } = require('../middleware/auth');
const { createRateLimit } = require('../middleware/rateLimit');

const router = express.Router();
const prisma = new PrismaClient();

// 登录/注册接口限流：每 IP 每分钟最多 10 次
const authRateLimit = createRateLimit(60000, 10, '登录/注册请求过于频繁，请稍后再试');

/**
 * 简易输入清理：去除首尾空白，限制长度
 */
function sanitize(str, maxLen = 50) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen);
}

/**
 * POST /api/auth/register
 * 注册新用户
 */
router.post('/register', authRateLimit, async (req, res) => {
  try {
    const username = sanitize(req.body.username, 20);
    const password = req.body.password || '';
    const nickname = sanitize(req.body.nickname, 20);

    // 参数验证
    if (!username || !password || !nickname) {
      return res.status(400).json({ error: '用户名、密码和昵称不能为空' });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: '用户名长度需要 3-20 个字符' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度至少 6 个字符' });
    }

    // 用户名只允许字母数字下划线
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: '用户名只能包含字母、数字和下划线' });
    }

    // 检查用户名是否已存在
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return res.status(409).json({ error: '用户名已存在' });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建用户
    const user = await prisma.user.create({
      data: { username, password: hashedPassword, nickname },
      select: { id: true, username: true, nickname: true },
    });

    // 生成 Token
    const token = generateToken(user);

    res.status(201).json({
      message: '注册成功',
      token,
      user: { id: user.id, username: user.username, nickname: user.nickname },
    });
  } catch (err) {
    console.error('注册失败:', err);
    res.status(500).json({ error: '服务器错误，请稍后重试' });
  }
});

/**
 * POST /api/auth/login
 * 用户登录
 */
router.post('/login', authRateLimit, async (req, res) => {
  try {
    const username = sanitize(req.body.username, 20);
    const password = req.body.password || '';

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    // 查找用户
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 验证密码
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 生成 Token
    const token = generateToken(user);

    res.json({
      message: '登录成功',
      token,
      user: { id: user.id, username: user.username, nickname: user.nickname },
    });
  } catch (err) {
    console.error('登录失败:', err);
    res.status(500).json({ error: '服务器错误，请稍后重试' });
  }
});

/**
 * GET /api/auth/me
 * 获取当前用户信息
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, username: true, nickname: true, avatar: true, createdAt: true },
    });

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 获取战绩统计
    const stats = await prisma.gameRecord.groupBy({
      by: ['result'],
      where: { userId: user.id },
      _count: true,
    });

    const gameStats = {
      wins: stats.find(s => s.result === 'win')?._count || 0,
      losses: stats.find(s => s.result === 'lose')?._count || 0,
      draws: stats.find(s => s.result === 'draw')?._count || 0,
    };

    res.json({ user, stats: gameStats });
  } catch (err) {
    console.error('获取用户信息失败:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
