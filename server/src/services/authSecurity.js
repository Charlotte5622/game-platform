const crypto = require('crypto');

const PUBLIC_AUTH_MESSAGE = '操作已提交';
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const DEFAULT_REFRESH_DAYS = 7;
const REMEMBER_REFRESH_DAYS = 30;

const DEFAULT_AVATARS = ['🐢', '🀄', '🎮', '⭐', '🔥', '🌙', '🍀', '🎲', '🏆', '✨'];

function getSecret(seedName, fallbackName) {
  const value = process.env[seedName] || process.env[fallbackName] || 'dev-secret-change-in-production';
  return crypto.createHash('sha256').update(String(value)).digest();
}

function getEncryptionKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (raw) {
    if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
    try {
      const decoded = Buffer.from(raw, 'base64');
      if (decoded.length === 32) return decoded;
    } catch {
      // fall through to hash derivation
    }
  }
  return getSecret('ENCRYPTION_KEY', 'JWT_SECRET');
}

function getHmacKey() {
  return getSecret('AUTH_HMAC_SECRET', 'JWT_SECRET');
}

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function fromBase64url(value) {
  return Buffer.from(String(value), 'base64url');
}

function hashValue(value, scope = 'lookup') {
  return crypto
    .createHmac('sha256', getHmacKey())
    .update(`${scope}:${String(value)}`)
    .digest('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function encryptValue(value) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${base64url(iv)}.${base64url(tag)}.${base64url(encrypted)}`;
}

function decryptValue(value) {
  if (!value) return null;
  const [ivRaw, tagRaw, encryptedRaw] = String(value).split('.');
  if (!ivRaw || !tagRaw || !encryptedRaw) return null;
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), fromBase64url(ivRaw));
  decipher.setAuthTag(fromBase64url(tagRaw));
  return Buffer.concat([decipher.update(fromBase64url(encryptedRaw)), decipher.final()]).toString('utf8');
}

function sanitizeText(value, maxLen = 80) {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, maxLen);
}

function normalizePhone(value) {
  const raw = sanitizeText(value, 32);
  if (!raw) return '';
  let normalized = raw.replace(/[^\d+]/g, '');
  if (normalized.startsWith('+86')) normalized = normalized.slice(3);
  if (normalized.startsWith('86') && normalized.length === 13) normalized = normalized.slice(2);
  return normalized;
}

function normalizeEmail(value) {
  return sanitizeText(value, 160).toLowerCase();
}

function normalizeNickname(value) {
  return sanitizeText(value, 20);
}

function normalizeIdentifier(value) {
  const raw = sanitizeText(value, 160);
  if (!raw) return { type: 'unknown', value: '' };
  if (raw.includes('@')) return { type: 'email', value: normalizeEmail(raw) };
  const phone = normalizePhone(raw);
  if (/^\d{7,15}$/.test(phone)) return { type: 'phone', value: phone };
  return { type: 'nickname', value: normalizeNickname(raw) };
}

function isValidPhone(value) {
  return /^\d{7,15}$/.test(normalizePhone(value));
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function isStrongPassword(password) {
  return typeof password === 'string' && password.length >= 6;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function getUserAgent(req) {
  return sanitizeText(req.headers['user-agent'] || 'unknown-device', 240);
}

function getDeviceFingerprint(req) {
  const ip = getClientIp(req);
  const userAgent = getUserAgent(req);
  return hashValue(`${ip}|${userAgent}`, 'device');
}

function getDeviceName(req) {
  const ua = getUserAgent(req);
  if (/iphone|ipad/i.test(ua)) return 'iOS Safari';
  if (/android/i.test(ua)) return 'Android Browser';
  if (/edg/i.test(ua)) return 'Microsoft Edge';
  if (/chrome/i.test(ua)) return 'Chrome';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua)) return 'Safari';
  return 'Unknown device';
}

function maskPhone(value) {
  if (!value) return null;
  const phone = normalizePhone(value);
  if (phone.length < 7) return '***';
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function maskEmail(value) {
  if (!value) return null;
  const email = normalizeEmail(value);
  const [name, domain] = email.split('@');
  if (!domain) return '***';
  const maskedName = name.length <= 2 ? `${name[0] || '*'}*` : `${name.slice(0, 2)}***`;
  return `${maskedName}@${domain}`;
}

function publicUser(user) {
  if (!user) return null;
  let phone = null;
  let email = null;
  try {
    phone = maskPhone(decryptValue(user.phone));
  } catch {
    phone = null;
  }
  try {
    email = maskEmail(decryptValue(user.email));
  } catch {
    email = null;
  }
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatar: user.avatar,
    phone,
    email,
    status: user.status,
    createdAt: user.createdAt,
    nicknameChangeCount: user.nicknameChangeCount || 0,
  };
}

function getRandomAvatar(seed = '') {
  const index = Math.abs(hashValue(seed || crypto.randomUUID(), 'avatar').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)) % DEFAULT_AVATARS.length;
  return DEFAULT_AVATARS[index];
}

function makeUsername(nickname) {
  const base = normalizeNickname(nickname).replace(/[^\w]/g, '').toLowerCase() || 'player';
  return `${base.slice(0, 12)}_${crypto.randomBytes(4).toString('hex')}`;
}

function sendAuthError(res, status = 400, code = 'AUTH_001', extra = {}) {
  return res.status(status).json({
    ok: false,
    code,
    message: PUBLIC_AUTH_MESSAGE,
    error: PUBLIC_AUTH_MESSAGE,
    ...extra,
  });
}

function sendAuthOk(res, data = {}, status = 200) {
  return res.status(status).json({
    ok: true,
    message: PUBLIC_AUTH_MESSAGE,
    ...data,
  });
}

function isHttpsRequest(req) {
  return Boolean(req?.secure || String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
}

function cookieOptions(req, maxAgeMs) {
  const secure =
    process.env.COOKIE_SECURE === 'true' ||
    (process.env.COOKIE_SECURE !== 'false' && isHttpsRequest(req));
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    maxAge: maxAgeMs,
    path: '/',
  };
}

function setAuthCookies(req, res, accessToken, refreshToken, refreshExpiresAt) {
  res.cookie('access_token', accessToken, cookieOptions(req, ACCESS_TOKEN_TTL_SECONDS * 1000));
  res.cookie('refresh_token', refreshToken, cookieOptions(req, Math.max(0, refreshExpiresAt.getTime() - Date.now())));
}

function clearAuthCookies(req, res) {
  const opts = cookieOptions(req, 0);
  res.clearCookie('access_token', opts);
  res.clearCookie('refresh_token', opts);
}

function parseCookies(req) {
  const raw = req.headers.cookie;
  if (!raw) return {};
  return raw.split(';').reduce((cookies, item) => {
    const index = item.indexOf('=');
    if (index === -1) return cookies;
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function createCaptchaChallenge(req) {
  const target = crypto.randomInt(28, 73);
  const payload = {
    id: crypto.randomUUID(),
    target,
    exp: Date.now() + 5 * 60 * 1000,
    ip: hashValue(getClientIp(req), 'captcha-ip').slice(0, 16),
    ua: hashValue(getUserAgent(req), 'captcha-ua').slice(0, 16),
  };
  const body = base64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = crypto.createHmac('sha256', getHmacKey()).update(body).digest('base64url');
  return {
    challengeId: payload.id,
    min: 0,
    max: 100,
    target,
    tolerance: 6,
    token: `${body}.${sig}`,
  };
}

function verifyCaptcha(captcha, req) {
  if (!captcha || typeof captcha !== 'object') return false;
  const token = captcha.token || captcha.captchaToken;
  const position = Number(captcha.position);
  if (!token || !Number.isFinite(position)) return false;
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return false;
  const expectedSig = crypto.createHmac('sha256', getHmacKey()).update(body).digest('base64url');
  if (Buffer.byteLength(sig) !== Buffer.byteLength(expectedSig)) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return false;
  let payload;
  try {
    payload = JSON.parse(fromBase64url(body).toString('utf8'));
  } catch {
    return false;
  }
  if (Date.now() > payload.exp) return false;
  if (payload.ip !== hashValue(getClientIp(req), 'captcha-ip').slice(0, 16)) return false;
  if (payload.ua !== hashValue(getUserAgent(req), 'captcha-ua').slice(0, 16)) return false;
  return Math.abs(Number(payload.target) - position) <= 6;
}

async function recordLoginAttempt(prisma, req, identifier, success) {
  const ipKey = `ip:${hashValue(getClientIp(req), 'attempt-ip')}`;
  const acctKey = identifier ? `acct:${hashValue(identifier, 'attempt-account')}` : null;

  if (success) {
    // 成功登录 → 清除该 IP 和账号的所有失败记录
    const deleteWhere = acctKey
      ? { identifier: { in: [ipKey, acctKey] } }
      : { identifier: ipKey };
    await prisma.loginAttempt.deleteMany({ where: deleteWhere });
    return;
  }

  const rows = [{ identifier: ipKey, success: false }];
  if (acctKey) rows.push({ identifier: acctKey, success: false });
  await prisma.loginAttempt.createMany({ data: rows });
}

async function getLoginAttemptState(prisma, req, identifier) {
  const now = new Date();
  const ipWindow = new Date(now.getTime() - 15 * 60 * 1000);
  const accountWindow = new Date(now.getTime() - 10 * 60 * 1000);
  const ipKey = `ip:${hashValue(getClientIp(req), 'attempt-ip')}`;
  const accountKey = identifier ? `acct:${hashValue(identifier, 'attempt-account')}` : null;

  const [ipFailures, accountFailures] = await Promise.all([
    prisma.loginAttempt.count({ where: { identifier: ipKey, success: false, createdAt: { gte: ipWindow } } }),
    accountKey
      ? prisma.loginAttempt.count({ where: { identifier: accountKey, success: false, createdAt: { gte: accountWindow } } })
      : Promise.resolve(0),
  ]);

  return {
    ipFailures,
    accountFailures,
    locked: ipFailures >= 5 || accountFailures >= 5,
    requiresCaptcha: ipFailures >= 3 || accountFailures >= 3,
  };
}

async function writeAuditLog(prisma, req, userId, action, metadata = {}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        action,
        ipHash: hashValue(getClientIp(req), 'audit-ip'),
        deviceFingerprint: getDeviceFingerprint(req),
        metadata,
      },
    });
  } catch (err) {
    console.warn('[audit] write failed:', err.message);
  }
}

module.exports = {
  ACCESS_TOKEN_TTL_SECONDS,
  DEFAULT_REFRESH_DAYS,
  REMEMBER_REFRESH_DAYS,
  PUBLIC_AUTH_MESSAGE,
  clearAuthCookies,
  createCaptchaChallenge,
  decryptValue,
  encryptValue,
  getClientIp,
  getDeviceFingerprint,
  getDeviceName,
  getLoginAttemptState,
  getRandomAvatar,
  getUserAgent,
  hashToken,
  hashValue,
  isStrongPassword,
  isValidEmail,
  isValidPhone,
  makeUsername,
  maskEmail,
  maskPhone,
  normalizeEmail,
  normalizeIdentifier,
  normalizeNickname,
  normalizePhone,
  parseCookies,
  publicUser,
  recordLoginAttempt,
  sanitizeText,
  sendAuthError,
  sendAuthOk,
  setAuthCookies,
  verifyCaptcha,
  writeAuditLog,
};
