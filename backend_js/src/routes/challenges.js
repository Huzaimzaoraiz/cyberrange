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

// POST /api/submit_flag
router.post('/submit_flag', requireAuth, async (req, res) => {
  try {
    const { challenge_id, flag } = req.body;
    if (!challenge_id || !flag) {
      return res.status(400).json({ error: 'challenge_id and flag required' });
    }

    const challenge = await database.getChallenge(challenge_id);
    if (!challenge) {
      return res.status(404).json({ error: 'challenge not found' });
    }

    const submittedFlag = flag.trim();
    if (!submittedFlag) {
      return res.status(400).json({ error: 'flag cannot be empty' });
    }

    if (await database.hasUserUsedFlag(req.user.id, submittedFlag)) {
      return res.json({
        correct: false,
        message: 'you already used this flag before (duplicate submissions do not earn points)',
      });
    }

    if (!flagEngine.validateFlag(req.user.id, challenge_id, submittedFlag)) {
      return res.json({ correct: false, message: 'wrong flag, try again' });
    }

    const points = Number(challenge.points || 0);
    await database.saveSubmission(
      req.user.id,
      challenge_id,
      submittedFlag,
      true
    );

    const stopResult = await orchestrator.destroyLab(req.user.id, challenge_id);
    const stopMessage = stopResult.success ? ' Lab stopped.' : '';

    return res.json({
      correct: true,
      message: `correct flag submitted! +${points} points applied on live scoreboard.${stopMessage}`,
    });
  } catch (err) {
    console.error('submit flag error:', err);
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

module.exports = router;
