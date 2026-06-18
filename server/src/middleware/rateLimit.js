/**
 * 简易内存速率限制器
 * 用于保护登录/注册等敏感接口，防止暴力破解
 *
 * 使用惰性清理：每次请求时检查并清理过期记录，无需 setInterval
 */

/**
 * 创建速率限制中间件
 * @param {number} windowMs - 时间窗口（毫秒）
 * @param {number} maxAttempts - 窗口内最大请求数
 * @param {string} message - 超限提示信息
 */
function createRateLimit(windowMs = 60000, maxAttempts = 10, message = '请求过于频繁，请稍后再试') {
  const attempts = new Map(); // key -> { count, resetAt }

  return (req, res, next) => {
    const key = `${req.ip}-${req.path}`;
    const now = Date.now();

    // 惰性清理：顺手清除过期条目（每次请求最多扫描 50 条，避免大 Map 扫描过慢）
    if (attempts.size > 100) {
      let cleaned = 0;
      for (const [k, entry] of attempts) {
        if (now > entry.resetAt) {
          attempts.delete(k);
          if (++cleaned >= 50) break;
        }
      }
    }

    let entry = attempts.get(key);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      attempts.set(key, entry);
    }

    entry.count++;

    // 设置响应头
    res.setHeader('X-RateLimit-Limit', maxAttempts);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxAttempts - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    if (entry.count > maxAttempts) {
      return res.status(429).json({ error: message });
    }

    next();
  };
}

module.exports = { createRateLimit };
