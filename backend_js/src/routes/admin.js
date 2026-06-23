// routes/admin.js
// Admin routes: user management, challenge management, instance management,
// flag submission, scoreboard

const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const database = require('../database');
const orchestrator = require('../orchestrator');
const flagEngine = require('../flagEngine');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ---- flag submission (user) ----

// POST /api/submit_flag
router.post('/submit_flag', requireAuth, async (req, res) => {
  try {
    const { challenge_id, flag } = req.body;
    if (!challenge_id || !flag) {
      return res.status(400).json({ detail: 'challenge_id and flag required' });
    }

    const challenge = await database.getChallenge(challenge_id);
    if (!challenge) {
      return res.status(404).json({ detail: 'challenge not found' });
    }

    const submittedFlag = flag.trim();
    if (!submittedFlag) {
      return res.status(400).json({ detail: 'flag cannot be empty' });
    }

    if (await database.hasUserUsedFlag(req.user.id, submittedFlag)) {
      return res.json({
        correct: false,
        message: 'you already used this flag before (duplicate submissions do not earn points)',
      });
    }

    if (!flagEngine.validateFlag(req.user.id, challenge_id, submittedFlag)) {
      // Check if the flag belongs to another user
      let otherFlagOwnerId = null;
      const allUserIds = await database.getAllUserIds();
      for (const candidateUserId of allUserIds) {
        if (parseInt(candidateUserId, 10) === parseInt(req.user.id, 10)) continue;
        if (flagEngine.validateFlag(candidateUserId, challenge_id, submittedFlag)) {
          otherFlagOwnerId = candidateUserId;
          break;
        }
      }

      await database.saveAttackSubmission(
        req.user.id,
        challenge_id,
        submittedFlag,
        false,
        otherFlagOwnerId
      );

      if (otherFlagOwnerId !== null) {
        return res.json({
          correct: false,
          message: "this flag belongs to another player; submit only your own flag",
        });
      }

      return res.json({ correct: false, message: 'wrong flag, try again' });
    }

    const points = parseInt(challenge.points || 0, 10);
    await database.saveAttackSubmission(
      req.user.id,
      challenge_id,
      submittedFlag,
      true,
      req.user.id
    );

    const stopResult = await orchestrator.destroyLab(req.user.id, challenge_id);
    const stopMessage = stopResult.success ? ' Lab stopped.' : '';

    return res.json({
      correct: true,
      message: `correct flag submitted! +${points} points applied on live scoreboard.${stopMessage}`,
    });
  } catch (err) {
    console.error('submit flag error:', err);
    return res.status(500).json({ detail: 'internal server error' });
  }
});

// GET /api/scoreboard
router.get('/scoreboard', requireAuth, async (req, res) => {
  try {
    return res.json({ scoreboard: await database.getScoreboard() });
  } catch (err) {
    console.error('scoreboard error:', err);
    return res.status(500).json({ detail: 'internal server error' });
  }
});

// GET /api/scoreboard/portal
router.get('/scoreboard/portal', requireAuth, async (req, res) => {
  try {
    return res.json({
      scoreboard: await database.getScoreboard(),
      portal: await database.getScoreboardWithIps(false),
    });
  } catch (err) {
    console.error('scoreboard portal error:', err);
    return res.status(500).json({ detail: 'internal server error' });
  }
});

// ---- admin: challenge management ----

// GET /api/admin/challenges
router.get('/admin/challenges', requireAdmin, async (req, res) => {
  try {
    return res.json({ challenges: await database.getAllChallenges() });
  } catch (err) {
    console.error('admin list challenges error:', err);
    return res.status(500).json({ detail: 'internal server error' });
  }
});

// POST /api/admin/challenges
router.post('/admin/challenges', requireAdmin, async (req, res) => {
  try {
    const { id, name, description = '', difficulty = 'Easy', category = 'General', points = 100, docker_image, internal_port = 80 } = req.body;
    if (!id || !name || !docker_image) {
      return res.status(400).json({ detail: 'id, name, and docker_image are required' });
    }

    if (await database.getChallenge(id)) {
      return res.status(400).json({ detail: 'challenge id already exists' });
    }

    await database.createChallenge(id, name, description, difficulty, category, points, docker_image, internal_port);
    return res.json({ message: 'challenge created', id });
  } catch (err) {
    console.error('admin create challenge error:', err);
    return res.status(500).json({ detail: 'internal server error' });
  }
});

// PUT /api/admin/challenges/:challengeId
router.put('/admin/challenges/:challengeId', requireAdmin, async (req, res) => {
  try {
    const { challengeId } = req.params;
    if (!(await database.getChallenge(challengeId))) {
      return res.status(404).json({ detail: 'challenge not found' });
    }

    const { name, description = '', difficulty = 'Easy', category = 'General', points = 100, docker_image, internal_port = 80 } = req.body;
    if (!name || !docker_image) {
      return res.status(400).json({ detail: 'name and docker_image are required' });
    }

    await database.updateChallenge(challengeId, name, description, difficulty, category, points, docker_image, internal_port);
    return res.json({ message: 'challenge updated' });
  } catch (err) {
    console.error('admin update challenge error:', err);
    return res.status(500).json({ detail: 'internal server error' });
  }
});

// DELETE /api/admin/challenges/:challengeId
router.delete('/admin/challenges/:challengeId', requireAdmin, async (req, res) => {
  try {
    const { challengeId } = req.params;
    if (!(await database.getChallenge(challengeId))) {
      return res.status(404).json({ detail: 'challenge not found' });
    }
    await database.deleteChallenge(challengeId);
    return res.json({ message: 'challenge deleted' });
  } catch (err) {
    console.error('admin delete challenge error:', err);
    return res.status(500).json({ detail: 'internal server error' });
  }
});

// ---- admin: instance management ----

// GET /api/admin/instances
router.get('/admin/instances', requireAdmin, async (req, res) => {
  try {
    return res.json({ instances: await database.getAllRunningInstances() });
  } catch (err) {
    console.error('admin list instances error:', err);
    return res.status(500).json({ detail: 'internal server error' });
  }
});

// POST /api/admin/instances/:instanceId/kill
router.post('/admin/instances/:instanceId/kill', requireAdmin, async (req, res) => {
  try {
    const result = await orchestrator.destroyLabByInstanceId(parseInt(req.params.instanceId, 10));
    return res.json(result);
  } catch (err) {
    console.error('admin kill instance error:', err);
    return res.status(500).json({ detail: 'internal server error' });
  }
});

// ---- admin: user management ----

// GET /api/admin/users
router.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    return res.json({ users: await database.getAllUsers() });
  } catch (err) {
    console.error('admin list users error:', err);
    return res.status(500).json({ detail: 'internal server error' });
  }
});

// POST /api/admin/users
router.post('/admin/users', requireAdmin, async (req, res) => {
  try {
    const { username: rawUsername, password, role: rawRole = 'user' } = req.body;
    if (!rawUsername || !password) {
      return res.status(400).json({ detail: 'username and password required' });
    }

    const username = rawUsername.trim();
    if (username.length < 3) {
      return res.status(400).json({ detail: 'username must be at least 3 characters' });
    }
    if (username.length > 32) {
      return res.status(400).json({ detail: 'username must be at most 32 characters' });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.status(400).json({ detail: "username can only use letters, numbers, '_' and '-'" });
    }
    if (password.length < 8) {
      return res.status(400).json({ detail: 'password must be at least 8 characters' });
    }

    const role = rawRole.trim().toLowerCase();
    if (role !== 'user' && role !== 'admin') {
      return res.status(400).json({ detail: "role must be either 'user' or 'admin'" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = await database.createUser(username, passwordHash, role);
    if (userId === null) {
      return res.status(400).json({ detail: 'username already taken' });
    }

    return res.json({
      message: 'user created',
      user: { id: userId, username, role },
    });
  } catch (err) {
    console.error('admin create user error:', err);
    return res.status(500).json({ detail: 'internal server error' });
  }
});

// DELETE /api/admin/users/:userId
router.delete('/admin/users/:userId', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const targetUser = await database.getUserById(userId);
    if (!targetUser) {
      return res.status(404).json({ detail: 'user not found' });
    }

    if (userId === parseInt(req.user.id, 10)) {
      return res.status(400).json({ detail: 'you cannot delete your own account' });
    }

    if (targetUser.role === 'admin' && (await database.countAdminUsers()) <= 1) {
      return res.status(400).json({ detail: 'cannot delete the last admin account' });
    }

    const runningInstances = await database.getRunningInstancesByUser(userId);
    for (const instance of runningInstances) {
      const result = await orchestrator.destroyLabByInstanceId(instance.id);
      if (result && result.error) {
        return res.status(400).json({ detail: `failed to stop user labs: ${result.error}` });
      }
    }

    await database.deleteUserAndRelatedData(userId);
    return res.json({ message: 'user removed' });
  } catch (err) {
    console.error('admin delete user error:', err);
    return res.status(500).json({ detail: 'internal server error' });
  }
});

module.exports = router;
