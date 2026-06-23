const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const {
  authMiddleware,
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenFromRequest,
  verifyRefreshToken,
} = require('../middleware/auth');
const {
  DEFAULT_REFRESH_DAYS,
  REMEMBER_REFRESH_DAYS,
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
  normalizeEmail,
  normalizeIdentifier,
  normalizeNickname,
  normalizePhone,
  publicUser,
  recordLoginAttempt,
  sanitizeText,
  sendAuthError,
  sendAuthOk,
  setAuthCookies,
  verifyCaptcha,
  writeAuditLog,
} = require('../services/authSecurity');
const { createRateLimit } = require('../middleware/rateLimit');

const router = express.Router();
const prisma = new PrismaClient();

const PASSWORD_ROUNDS = 12;
const authBurstLimit = createRateLimit(60 * 1000, 30, '操作已提交');

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function verificationHash(identifierHash, code, purpose) {
  return hashValue(`${identifierHash}:${sanitizeText(code, 12)}:${purpose}`, 'verification-code');
}

function getContact(reqBody) {
  const phone = normalizePhone(reqBody.phone || '');
  const email = normalizeEmail(reqBody.email || '');
  if (phone && isValidPhone(phone)) {
    return {
      type: 'phone',
      value: phone,
      hash: hashValue(phone, 'phone'),
      encrypted: encryptValue(phone),
    };
  }
  if (email && isValidEmail(email)) {
    return {
      type: 'email',
      value: email,
      hash: hashValue(email, 'email'),
      encrypted: encryptValue(email),
    };
  }
  return null;
}

async function findUserByIdentifier(identifierInput) {
  const normalized = normalizeIdentifier(identifierInput);
  if (!normalized.value) return null;

  if (normalized.type === 'phone') {
    return prisma.user.findUnique({ where: { phoneHash: hashValue(normalized.value, 'phone') } });
  }
  if (normalized.type === 'email') {
    return prisma.user.findUnique({ where: { emailHash: hashValue(normalized.value, 'email') } });
  }

  return prisma.user.findFirst({
    where: {
      OR: [
        { nickname: normalized.value },
        { username: normalized.value },
      ],
    },
  });
}

async function createUniqueUsername(nickname) {
  for (let i = 0; i < 8; i += 1) {
    const username = makeUsername(nickname);
    const exists = await prisma.user.findUnique({ where: { username } });
    if (!exists) return username;
  }
  return `player_${crypto.randomBytes(8).toString('hex')}`;
}

function buildSessionTokens(user, req, rememberMe = false) {
  const sessionId = crypto.randomUUID();
  const refreshDays = rememberMe ? REMEMBER_REFRESH_DAYS : DEFAULT_REFRESH_DAYS;
  const refreshExpiresAt = addDays(new Date(), refreshDays);
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user, sessionId, `${refreshDays}d`);
  return {
    accessToken,
    refreshToken,
    refreshTokenHash: hashToken(refreshToken),
    refreshExpiresAt,
    session: {
      id: sessionId,
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      deviceFingerprint: getDeviceFingerprint(req),
      deviceName: getDeviceName(req),
      ipHash: hashValue(getClientIp(req), 'session-ip'),
      userAgent: getUserAgent(req),
      expiresAt: refreshExpiresAt,
    },
  };
}

async function createSession(user, req, res, rememberMe = false) {
  const tokens = buildSessionTokens(user, req, rememberMe);
  await prisma.refreshToken.create({ data: tokens.session });
  setAuthCookies(req, res, tokens.accessToken, tokens.refreshToken, tokens.refreshExpiresAt);
  return tokens;
}

function refreshModeFromDecoded(decoded) {
  const seconds = Number(decoded.exp || 0) - Number(decoded.iat || 0);
  return seconds > 8 * 24 * 60 * 60;
}

async function verifyPasswordHistory(userId, newPassword) {
  const recent = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  for (const item of recent) {
    const reused = await bcrypt.compare(newPassword, item.passwordHash);
    if (reused) return false;
  }
  return true;
}

async function updatePassword(user, newPassword, req, action) {
  const allowed = await verifyPasswordHistory(user.id, newPassword);
  if (!allowed || (await bcrypt.compare(newPassword, user.passwordHash))) {
    await writeAuditLog(prisma, req, user.id, `${action}_password_reused`);
    return false;
  }

  const nextHash = await bcrypt.hash(newPassword, PASSWORD_ROUNDS);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: nextHash, passwordChangedAt: new Date() },
    }),
    prisma.passwordHistory.create({
      data: { userId: user.id, passwordHash: nextHash },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    }),
  ]);
  await writeAuditLog(prisma, req, user.id, action);
  return true;
}

async function requireCaptchaIfNeeded(req, res, identifier) {
  const state = await getLoginAttemptState(prisma, req, identifier);
  if (state.locked) {
    sendAuthError(res, 429, 'AUTH_101', { retryAfter: 15 * 60, requiresCaptcha: true });
    return false;
  }
  if (state.requiresCaptcha && !verifyCaptcha(req.body?.captcha, req)) {
    sendAuthError(res, 400, 'AUTH_110', { requiresCaptcha: true, captcha: createCaptchaChallenge(req) });
    return false;
  }
  return true;
}

async function verifyCode(contactHash, code, purpose) {
  const active = await prisma.verificationCode.findFirst({
    where: {
      identifierHash: contactHash,
      purpose,
      consumed: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!active || active.attempts >= 5) return false;

  const codeHash = verificationHash(contactHash, code, purpose);
  if (codeHash !== active.codeHash) {
    await prisma.verificationCode.update({
      where: { id: active.id },
      data: { attempts: { increment: 1 } },
    });
    return false;
  }

  await prisma.verificationCode.update({
    where: { id: active.id },
    data: { consumed: true },
  });
  return true;
}

router.get('/captcha', (req, res) => {
  res.json(createCaptchaChallenge(req));
});

router.post('/send-code', authBurstLimit, async (req, res) => {
  try {
    const purpose = ['register', 'reset'].includes(req.body?.purpose) ? req.body.purpose : 'register';
    const contact = getContact(req.body || {});
    if (!contact) return sendAuthOk(res, {}, 202);

    const code = String(crypto.randomInt(100000, 999999));
    await prisma.verificationCode.create({
      data: {
        identifierHash: contact.hash,
        purpose,
        codeHash: verificationHash(contact.hash, code, purpose),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    if (!process.env.SMS_API_KEY && contact.type === 'phone') {
      console.info(`[auth] SMS provider not configured. ${purpose} code for ${contact.value}: ${code}`);
    }
    if (contact.type === 'email') {
      console.info(`[auth] Email provider not configured. ${purpose} code for ${contact.value}: ${code}`);
    }

    return sendAuthOk(res, {}, 202);
  } catch (err) {
    console.error('[auth] send-code failed:', err);
    return sendAuthError(res, 500, 'AUTH_500');
  }
});

router.post('/register', authBurstLimit, async (req, res) => {
  const contact = getContact(req.body || {});
  const identifier = contact ? `${contact.type}:${contact.value}` : 'register';
  try {
    if (!(await requireCaptchaIfNeeded(req, res, identifier))) return;

    const nickname = normalizeNickname(req.body.nickname || '');
    const password = String(req.body.password || '');
    const code = sanitizeText(req.body.code || '', 12);

    if (!contact || !nickname || nickname.length < 2 || !isStrongPassword(password)) {
      await recordLoginAttempt(prisma, req, identifier, false);
      return sendAuthError(res, 400, 'AUTH_120');
    }

    const codeOk = await verifyCode(contact.hash, code, 'register');
    if (!codeOk) {
      await recordLoginAttempt(prisma, req, identifier, false);
      return sendAuthError(res, 400, 'AUTH_121', { requiresCaptcha: true, captcha: createCaptchaChallenge(req) });
    }

    const nicknameExists = await prisma.user.findUnique({ where: { nickname } });
    if (nicknameExists) {
      await recordLoginAttempt(prisma, req, identifier, false);
      return sendAuthError(res, 409, 'AUTH_122');
    }

    const existingContact = await prisma.user.findFirst({
      where: {
        OR: [
          contact.type === 'phone' ? { phoneHash: contact.hash } : undefined,
          contact.type === 'email' ? { emailHash: contact.hash } : undefined,
        ].filter(Boolean),
      },
    });
    if (existingContact) {
      await recordLoginAttempt(prisma, req, identifier, false);
      return sendAuthOk(res, {}, 202);
    }

    const passwordHash = await bcrypt.hash(password, PASSWORD_ROUNDS);
    const username = await createUniqueUsername(nickname);
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        nickname,
        avatar: getRandomAvatar(contact.value),
        phone: contact.type === 'phone' ? contact.encrypted : null,
        phoneHash: contact.type === 'phone' ? contact.hash : null,
        email: contact.type === 'email' ? contact.encrypted : null,
        emailHash: contact.type === 'email' ? contact.hash : null,
        passwordHistory: {
          create: { passwordHash },
        },
      },
    });

    const tokens = await createSession(user, req, res, Boolean(req.body.rememberMe));
    await recordLoginAttempt(prisma, req, identifier, true);
    await writeAuditLog(prisma, req, user.id, 'register');

    return sendAuthOk(res, {
      token: tokens.accessToken,
      accessToken: tokens.accessToken,
      user: publicUser(user),
      expiresIn: 15 * 60,
    }, 201);
  } catch (err) {
    console.error('[auth] register failed:', err);
    return sendAuthError(res, 500, 'AUTH_500');
  }
});

router.post('/login', authBurstLimit, async (req, res) => {
  const identifierInput = req.body.identifier || req.body.username || req.body.phone || req.body.nickname || '';
  const password = String(req.body.password || '');
  const normalized = normalizeIdentifier(identifierInput);
  const identifier = normalized.value ? `${normalized.type}:${normalized.value}` : 'unknown';

  try {
    if (!identifierInput || !password) {
      await recordLoginAttempt(prisma, req, identifier, false);
      return sendAuthError(res, 400, 'AUTH_001');
    }
    if (!(await requireCaptchaIfNeeded(req, res, identifier))) return;

    const user = await findUserByIdentifier(identifierInput);
    const passwordOk = user && user.status === 'active' && (await bcrypt.compare(password, user.passwordHash));
    if (!passwordOk) {
      await recordLoginAttempt(prisma, req, identifier, false);
      const state = await getLoginAttemptState(prisma, req, identifier);
      return sendAuthError(res, 401, 'AUTH_001', {
        requiresCaptcha: state.requiresCaptcha,
        captcha: state.requiresCaptcha ? createCaptchaChallenge(req) : undefined,
      });
    }

    const tokens = await createSession(user, req, res, Boolean(req.body.rememberMe));
    await recordLoginAttempt(prisma, req, identifier, true);
    await writeAuditLog(prisma, req, user.id, 'login', { rememberMe: Boolean(req.body.rememberMe) });

    return sendAuthOk(res, {
      token: tokens.accessToken,
      accessToken: tokens.accessToken,
      user: publicUser(user),
      expiresIn: 15 * 60,
    });
  } catch (err) {
    console.error('[auth] login failed:', err);
    return sendAuthError(res, 500, 'AUTH_500');
  }
});

router.post('/refresh', async (req, res) => {
  const refreshToken = getRefreshTokenFromRequest(req);
  if (!refreshToken) return sendAuthError(res, 401, 'AUTH_403');

  try {
    const decoded = verifyRefreshToken(refreshToken);
    const currentHash = hashToken(refreshToken);
    const current = await prisma.refreshToken.findUnique({
      where: { tokenHash: currentHash },
      include: { user: true },
    });

    if (!current || current.revoked || current.expiresAt <= new Date() || current.user.status !== 'active') {
      clearAuthCookies(req, res);
      return sendAuthError(res, 401, 'AUTH_403');
    }

    if (current.deviceFingerprint !== getDeviceFingerprint(req)) {
      await prisma.refreshToken.update({
        where: { id: current.id },
        data: { revoked: true, revokedAt: new Date() },
      });
      await writeAuditLog(prisma, req, current.userId, 'refresh_fingerprint_mismatch');
      clearAuthCookies(req, res);
      return sendAuthError(res, 401, 'AUTH_206', { requiresVerification: true });
    }

    const rememberMe = refreshModeFromDecoded(decoded);
    const next = buildSessionTokens(current.user, req, rememberMe);
    await prisma.$transaction([
      prisma.refreshToken.update({
        where: { id: current.id },
        data: {
          revoked: true,
          revokedAt: new Date(),
          lastUsedAt: new Date(),
          replacedByTokenHash: next.refreshTokenHash,
        },
      }),
      prisma.refreshToken.create({ data: next.session }),
    ]);

    setAuthCookies(req, res, next.accessToken, next.refreshToken, next.refreshExpiresAt);
    return sendAuthOk(res, {
      token: next.accessToken,
      accessToken: next.accessToken,
      user: publicUser(current.user),
      expiresIn: 15 * 60,
    });
  } catch (err) {
    console.warn('[auth] refresh failed:', err.message);
    clearAuthCookies(req, res);
    return sendAuthError(res, 401, 'AUTH_403');
  }
});

router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);
    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(refreshToken), userId: req.user.id },
        data: { revoked: true, revokedAt: new Date() },
      });
    }
    clearAuthCookies(req, res);
    await writeAuditLog(prisma, req, req.user.id, 'logout');
    return sendAuthOk(res);
  } catch (err) {
    console.error('[auth] logout failed:', err);
    clearAuthCookies(req, res);
    return sendAuthOk(res);
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || user.status !== 'active') return sendAuthError(res, 401, 'AUTH_401');

    const stats = await prisma.gameRecord.groupBy({
      by: ['result'],
      where: { userId: user.id },
      _count: true,
    });

    return res.json({
      user: publicUser(user),
      stats: {
        wins: stats.find((s) => s.result === 'win')?._count || 0,
        losses: stats.find((s) => s.result === 'lose')?._count || 0,
        draws: stats.find((s) => s.result === 'draw')?._count || 0,
      },
    });
  } catch (err) {
    console.error('[auth] me failed:', err);
    return sendAuthError(res, 500, 'AUTH_500');
  }
});

router.get('/devices', authMiddleware, async (req, res) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);
    const currentHash = refreshToken ? hashToken(refreshToken) : null;
    const devices = await prisma.refreshToken.findMany({
      where: {
        userId: req.user.id,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        tokenHash: true,
        deviceName: true,
        userAgent: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
    });

    return res.json({
      devices: devices.map((device) => ({
        id: device.id,
        deviceName: device.deviceName || 'Unknown device',
        userAgent: sanitizeText(device.userAgent || '', 120),
        createdAt: device.createdAt,
        lastUsedAt: device.lastUsedAt,
        expiresAt: device.expiresAt,
        current: currentHash === device.tokenHash,
      })),
    });
  } catch (err) {
    console.error('[auth] devices failed:', err);
    return sendAuthError(res, 500, 'AUTH_500');
  }
});

router.delete('/devices/:id', authMiddleware, async (req, res) => {
  try {
    const id = sanitizeText(req.params.id, 80);
    await prisma.refreshToken.updateMany({
      where: { id, userId: req.user.id },
      data: { revoked: true, revokedAt: new Date() },
    });
    await writeAuditLog(prisma, req, req.user.id, 'device_revoked', { deviceId: id });
    return sendAuthOk(res);
  } catch (err) {
    console.error('[auth] revoke device failed:', err);
    return sendAuthError(res, 500, 'AUTH_500');
  }
});

router.put('/avatar', authMiddleware, async (req, res) => {
  try {
    const avatar = sanitizeText(req.body.avatar || '', 10);
    if (!avatar) return sendAuthError(res, 400, 'AUTH_130');
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatar },
    });
    await writeAuditLog(prisma, req, req.user.id, 'avatar_update');
    return res.json({ ok: true, avatar, user: publicUser(user) });
  } catch (err) {
    console.error('[auth] avatar failed:', err);
    return sendAuthError(res, 500, 'AUTH_500');
  }
});

router.put('/nickname', authMiddleware, async (req, res) => {
  try {
    const nickname = normalizeNickname(req.body.nickname || '');
    if (nickname.length < 2) return sendAuthError(res, 400, 'AUTH_131');
    const existing = await prisma.user.findUnique({ where: { nickname } });
    if (existing && existing.id !== req.user.id) return sendAuthError(res, 409, 'AUTH_132');
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { nickname },
    });
    await writeAuditLog(prisma, req, req.user.id, 'nickname_update');
    return res.json({ ok: true, nickname, user: publicUser(user) });
  } catch (err) {
    console.error('[auth] nickname failed:', err);
    return sendAuthError(res, 500, 'AUTH_500');
  }
});

router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const oldPassword = String(req.body.oldPassword || '');
    const newPassword = String(req.body.newPassword || '');
    if (!isStrongPassword(newPassword)) return sendAuthError(res, 400, 'AUTH_140');

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !(await bcrypt.compare(oldPassword, user.passwordHash))) {
      await writeAuditLog(prisma, req, req.user.id, 'change_password_failed');
      return sendAuthError(res, 401, 'AUTH_141');
    }

    const ok = await updatePassword(user, newPassword, req, 'change_password');
    if (!ok) return sendAuthError(res, 400, 'AUTH_142');
    clearAuthCookies(req, res);
    return sendAuthOk(res);
  } catch (err) {
    console.error('[auth] change password failed:', err);
    return sendAuthError(res, 500, 'AUTH_500');
  }
});

router.post('/reset-password', authBurstLimit, async (req, res) => {
  const identifierInput = req.body.identifier || req.body.phone || req.body.email || '';
  const normalized = normalizeIdentifier(identifierInput);
  const identifier = normalized.value ? `${normalized.type}:${normalized.value}` : 'unknown';

  try {
    if (!(await requireCaptchaIfNeeded(req, res, identifier))) return;

    const password = String(req.body.newPassword || req.body.password || '');
    if (!isStrongPassword(password) || !normalized.value) {
      await recordLoginAttempt(prisma, req, identifier, false);
      return sendAuthOk(res, {}, 202);
    }

    const contactHash =
      normalized.type === 'phone'
        ? hashValue(normalized.value, 'phone')
        : normalized.type === 'email'
          ? hashValue(normalized.value, 'email')
          : null;
    if (!contactHash || !(await verifyCode(contactHash, req.body.code, 'reset'))) {
      await recordLoginAttempt(prisma, req, identifier, false);
      return sendAuthOk(res, {}, 202);
    }

    const user = await findUserByIdentifier(identifierInput);
    if (user && user.status === 'active') {
      await updatePassword(user, password, req, 'reset_password');
    }

    await recordLoginAttempt(prisma, req, identifier, true);
    clearAuthCookies(req, res);
    return sendAuthOk(res, {}, 202);
  } catch (err) {
    console.error('[auth] reset password failed:', err);
    return sendAuthOk(res, {}, 202);
  }
});

router.post('/delete-account', authMiddleware, async (req, res) => {
  try {
    const password = String(req.body.password || '');
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      await writeAuditLog(prisma, req, req.user.id, 'delete_account_failed');
      return sendAuthError(res, 401, 'AUTH_150');
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { status: 'pending_deletion', deletionRequestedAt: new Date() },
      }),
      prisma.refreshToken.updateMany({
        where: { userId: user.id, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
      }),
    ]);
    await writeAuditLog(prisma, req, user.id, 'delete_account_requested');
    clearAuthCookies(req, res);
    return sendAuthOk(res, { deletionAfterDays: 30 });
  } catch (err) {
    console.error('[auth] delete account failed:', err);
    return sendAuthError(res, 500, 'AUTH_500');
  }
});

router.post('/delete-account/cancel', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { status: 'active', deletionRequestedAt: null },
    });
    await writeAuditLog(prisma, req, req.user.id, 'delete_account_cancelled');
    return sendAuthOk(res, { user: publicUser(user) });
  } catch (err) {
    console.error('[auth] cancel delete failed:', err);
    return sendAuthError(res, 500, 'AUTH_500');
  }
});

router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const records = await prisma.gameRecord.findMany({
      where: { userId: req.user.id },
      select: { gameId: true, result: true, score: true, duration: true, createdAt: true },
    });

    const byGame = {};
    const summary = { totalGames: records.length, totalWins: 0, totalLosses: 0, totalDraws: 0, totalDuration: 0 };

    for (const record of records) {
      if (record.result === 'win') summary.totalWins += 1;
      else if (record.result === 'lose') summary.totalLosses += 1;
      else summary.totalDraws += 1;
      if (record.duration) summary.totalDuration += record.duration;

      if (!byGame[record.gameId]) {
        byGame[record.gameId] = { wins: 0, losses: 0, draws: 0, totalDuration: 0, games: 0, totalScore: 0 };
      }
      const game = byGame[record.gameId];
      game.games += 1;
      game.totalScore += record.score || 0;
      if (record.duration) game.totalDuration += record.duration;
      if (record.result === 'win') game.wins += 1;
      else if (record.result === 'lose') game.losses += 1;
      else game.draws += 1;
    }

    return res.json({ summary, byGame });
  } catch (err) {
    console.error('[auth] stats failed:', err);
    return sendAuthError(res, 500, 'AUTH_500');
  }
});

module.exports = router;
