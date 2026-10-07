const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const router = express.Router();
const settings = require('../config');
const database = require('../database');
const mailer = require('../mailer');
const { signToken, verifyTokenDetails, requireAuth } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password required' });
    }

    const clientHost = req.ip || 'unknown';

    // Check rate limiting
    const retryAfter = await database.getLoginRetryAfter(username, clientHost);
    if (retryAfter > 0) {
      await sleep(Math.min(2000, retryAfter * 1000));
      return res
        .status(429)
        .set('Retry-After', String(retryAfter))
        .json({ error: `too many login attempts, try again in ${retryAfter} seconds` });
    }

    const user = await database.getUserByUsername(username);

    // response time normalizatioon 
    const dummyHash = '$2b$10$1yqR./W7LgQ62f/N61i/yO1HkQ6Kj3Z4jX9Hk8Z2MvQ6H5vM3q6e';
    let Match = false;

    if (user) {
      Match = await bcrypt.compare(password, user.password_hash);
    } else {
      await bcrypt.compare(password, dummyHash);
    }

    if (!user || !Match) {
      const delay = await database.recordLoginFailure(username, clientHost);
      await sleep(Math.min(2000, delay > 0 ? delay * 1000 : 1000));
      if (delay > 0) {
        return res
          .status(429)
          .set('Retry-After', String(delay))
          .json({ error: `too many login attempts, try again in ${delay} seconds` });
      }
      return res.status(401).json({ error: 'wrong username or password' });
    }

    await database.clearLoginFailures(username, clientHost);
    const sessionId = crypto.randomBytes(32).toString('base64url');
    await database.setActiveSession(user.id, sessionId);
    const token = signToken(user.id, sessionId);

    res.cookie('cyberrange_auth', token, {
      httpOnly: true,
      maxAge: settings.tokenExpirySeconds * 1000,
      sameSite: 'lax',
      secure: false, // Change to true if running behind HTTPS
    });

    return res.json({
      user_id: user.id,
      username: user.username,
      role: user.role,
    });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const token = req.cookies?.cyberrange_auth;
    if (token) {
      const payload = verifyTokenDetails(token);
      if (payload) {
        await database.clearActiveSession(payload.user_id, payload.session_id);
      }
    }
    res.clearCookie('cyberrange_auth');
    return res.json({ message: 'logged out' });
  } catch (err) {
    console.error('logout error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

router.get('/me', requireAuth, (req, res) => {
  return res.json({
    user_id: req.user.id,
    username: req.user.username,
    role: req.user.role,
  });
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

router.post('/register', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });
    
    // Generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    await database.saveRegistrationOtp(email, otp);
    await mailer.sendRegistrationOtp(email, otp);
    
    return res.json({ message: 'OTP sent to ' + email });
  } catch (err) {
    console.error('Registration request error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

router.post('/verify-register', async (req, res) => {
  try {
    const { email, otp, password } = req.body;
    if (!email || !otp || !password) return res.status(400).json({ error: 'email, otp, and password required' });
    if (password.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });
    
    const record = await database.getRegistrationOtp(email);
    if (!record || record.otp !== otp || record.expires_at < new Date()) {
      return res.status(400).json({ error: 'invalid or expired OTP' });
    }
    
    const username = email.split('@')[0].substring(0, 32);
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = await database.createUser(username, passwordHash, 'user');
    
    if (userId == null) {
      return res.status(400).json({ error: 'username already taken (please use another email)' });
    }
    
    await database.deleteRegistrationOtp(email);
    
    return res.json({
      message: 'user created successfully',
      user: { id: userId, username, role: 'user' },
    });
  } catch (err) {
    console.error('Verify registration error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

module.exports = router;
