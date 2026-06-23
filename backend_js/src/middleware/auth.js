const jwt = require('jsonwebtoken');
const settings = require('../config');
const database = require('../database');

function signToken(userId, sessionId) {
  return jwt.sign(
    { user_id: userId, session_id: sessionId },
    settings.secretKey,
    { expiresIn: settings.tokenExpirySeconds }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, settings.secretKey);
  } catch (e) {
    return null;
  }
}

function verifyTokenDetails(token) {
  return verifyToken(token);
}

// Middleware: require authenticated user
async function requireAuth(req, res, next) {
  const token = req.cookies?.cyberrange_auth;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required (missing session cookie)' });
  }

  const payload = verifyTokenDetails(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired session token' });
  }

  const { user_id, session_id } = payload;

  const isActive = await database.isActiveSession(user_id, session_id);
  if (!isActive) {
    return res.status(401).json({ error: 'Session was replaced by a newer login' });
  }

  const user = await database.getUserById(user_id);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  req.user = user;
  next();
}

// Middleware: require admin role
async function requireAdmin(req, res, next) {
  // requireAuth must run first
  await requireAuth(req, res, () => {
    if (req.user && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

module.exports = { signToken, verifyToken, verifyTokenDetails, requireAuth, requireAdmin };
