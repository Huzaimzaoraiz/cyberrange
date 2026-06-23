// routes/labs.js
// Lab management routes: start, stop, status

const express = require('express');
const router = express.Router();
const orchestrator = require('../orchestrator');
const { requireAuth } = require('../middleware/auth');

function unwrapOrError(result, res) {
  if (result && result.error) {
    const message = String(result.error);
    const status = message.toLowerCase().includes('not found') ? 404 : 400;
    return res.status(status).json({ detail: message });
  }
  return null;
}

// POST /api/lab/:challengeId/start
router.post('/lab/:challengeId/start', requireAuth, async (req, res) => {
  try {
    const result = await orchestrator.createLab(req.user.id, req.params.challengeId);
    const errRes = unwrapOrError(result, res);
    if (errRes) return errRes;
    result.message = 'Lab started';
    return res.json(result);
  } catch (err) {
    console.error('start lab error:', err);
    return res.status(500).json({ detail: 'internal server error' });
  }
});

// POST /api/lab/:challengeId/stop
router.post('/lab/:challengeId/stop', requireAuth, async (req, res) => {
  try {
    const result = await orchestrator.destroyLab(req.user.id, req.params.challengeId);
    const errRes = unwrapOrError(result, res);
    if (errRes) return errRes;
    result.message = 'Lab stopped';
    return res.json(result);
  } catch (err) {
    console.error('stop lab error:', err);
    return res.status(500).json({ detail: 'internal server error' });
  }
});

// GET /api/lab/:challengeId/status
router.get('/lab/:challengeId/status', requireAuth, async (req, res) => {
  try {
    const result = await orchestrator.getLabStatus(req.user.id, req.params.challengeId);
    return res.json(result);
  } catch (err) {
    console.error('lab status error:', err);
    return res.status(500).json({ detail: 'internal server error' });
  }
});

module.exports = router;
