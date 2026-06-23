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
  const submitted = submittedFlag.trim();
  
  if (correctFlag.length !== submitted.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(
    Buffer.from(correctFlag, 'utf8'),
    Buffer.from(submitted, 'utf8')
  );
}

module.exports = { generateFlag, validateFlag };
