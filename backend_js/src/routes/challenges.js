const express = require('express');
const router = express.Router();
const database = require('../database');
const { requireAuth } = require('../middleware/auth');
const flagEngine = require('../flagEngine');
const orchestrator = require('../orchestrator');

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
    return res.status(500).json({ error: 'internal server error' });
  }
});

// GET /api/scoreboard
router.get('/scoreboard', requireAuth, async (req, res) => {
  try {
    return res.json({ scoreboard: await database.getScoreboard() });
  } catch (err) {
    console.error('scoreboard error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
router.get('/scoreboard/portal', requireAuth, async (req, res) => {
  try {
    return res.json({
      scoreboard: await database.getScoreboard(),
      portal: await database.getScoreboardWithIps(false),
    });
  } catch (err) {
    console.error('scoreboard portal error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// POST /api/submit_flag
router.post('/submit_flag', requireAuth, async (req, res) => {
  try {
    const { challenge_id, flag } = req.body;
    if (!challenge_id || !flag) {
      return res.status(400).json({ error: 'challenge_id and flag required' });
    }

    const submittedFlag = flag.trim();
    if (!submittedFlag) {
      return res.status(400).json({ error: 'flag cannot be empty' });
    }

    // 1. FAST FAIL: Validate the flag cryptographically FIRST (no database hit).
    // This protects the database from brute-force/spam requests with fake flags.
    if (!flagEngine.validateFlag(req.user.id, challenge_id, submittedFlag)) {
      return res.json({ correct: false, message: 'wrong flag, try again' });
    }

    // 2. The flag is mathematically correct. Now check the database if it was already used.
    if (await database.hasUserUsedFlag(req.user.id, submittedFlag)) {
      return res.json({
        correct: false,
        message: 'you already submitted this flag before',
      });
    }

    // 3. Fetch challenge details to calculate points.
    const challenge = await database.getChallenge(challenge_id);
    if (!challenge) {
      return res.status(404).json({ error: 'challenge not found' });
    }

    // 4. Save success and award points
    const points = Number(challenge.points || 0);
    await database.saveSubmission(
      req.user.id,
      challenge_id,
      submittedFlag,
      true
    );

    // 5. Cleanup the lab (Run asynchronously in the background so the user doesn't wait)
    orchestrator.destroyLab(req.user.id, challenge_id).catch(err => {
      console.error('Failed to stop lab in background:', err);
    });

    return res.json({
      correct: true,
      message: `correct flag submitted! +${points}`,
    });
  } catch (err) {
    console.error('submit flag error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});


module.exports = router;
