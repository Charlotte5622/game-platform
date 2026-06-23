const jwt = require('jsonwebtoken');
const { parseCookies, sendAuthError, ACCESS_TOKEN_TTL_SECONDS } = require('../services/authSecurity');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

function signToken(payload, expiresIn) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function generateAccessToken(user) {
  return signToken(
    {
      type: 'access',
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar || null,
    },
    `${ACCESS_TOKEN_TTL_SECONDS}s`
  );
}

function generateRefreshToken(user, sessionId, expiresIn) {
  return signToken(
    {
      type: 'refresh',
      id: user.id,
      sid: sessionId,
    },
    expiresIn
  );
}

function verifyAccessToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (decoded.type !== 'access') {
    const err = new Error('Invalid token type');
    err.code = 'AUTH_402';
    throw err;
  }
  return decoded;
}

function verifyRefreshToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (decoded.type !== 'refresh') {
    const err = new Error('Invalid token type');
    err.code = 'AUTH_403';
    throw err;
  }
  return decoded;
}

function getAccessTokenFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return parseCookies(req).access_token || null;
}

function getRefreshTokenFromRequest(req) {
  return parseCookies(req).refresh_token || req.body?.refreshToken || null;
}

function authMiddleware(req, res, next) {
  const token = getAccessTokenFromRequest(req);
  if (!token) {
    return sendAuthError(res, 401, 'AUTH_401');
  }

  try {
    req.user = verifyAccessToken(token);
    req.accessToken = token;
    return next();
  } catch (err) {
    return sendAuthError(res, 401, err.name === 'TokenExpiredError' ? 'AUTH_408' : 'AUTH_402');
  }
}

function verifySocketToken(token) {
  try {
    return verifyAccessToken(token);
  } catch {
    return null;
  }
}

module.exports = {
  authMiddleware,
  generateAccessToken,
  generateRefreshToken,
  getAccessTokenFromRequest,
  getRefreshTokenFromRequest,
  verifyAccessToken,
  verifyRefreshToken,
  verifySocketToken,
};
