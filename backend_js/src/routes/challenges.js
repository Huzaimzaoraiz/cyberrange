const express = require('express');
const router = express.Router();
const database = require('../database');
const { requireAuth } = require('../middleware/auth');

// GET /api/challenges
router.get('/challenges', requireAuth, async (req, res) => {
  try {
    const challenges = await database.getAllChallenges();
    for (const c of challenges) {
      c.solved = await database.hasUserSolved(req.user.id, c.id);
    }
    return res.json({ challenges });
  } catch (err) {
    console.error('list challenges error:', err);
    return res.status(500).json({ detail: 'internal server error' });
  }
});

module.exports = router;
