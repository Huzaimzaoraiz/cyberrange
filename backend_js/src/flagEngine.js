const crypto = require('crypto');
const settings = require('./config');

function generateFlag(userId, challengeId) {
  const message = String(userId) + ':' + String(challengeId);
  const h = crypto
    .createHmac('sha256', settings.flagSecret)
    .update(message)
    .digest('hex');
  return 'flag{' + h.slice(0, 8) + '}';
}

function validateFlag(userId, challengeId, submittedFlag) {
  const correctFlag = generateFlag(userId, challengeId);
  return submittedFlag.trim() === correctFlag;
}

module.exports = { generateFlag, validateFlag };
