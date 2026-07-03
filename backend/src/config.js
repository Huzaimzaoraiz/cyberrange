
const fs = require('fs');
const dotenv = require('dotenv');

// Check .env in current, backend_js, or parent directory
const envPaths = ['.env', 'backend_js/.env', '../.env', 'backend/.env'];
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}
// Fallback if none found
dotenv.config();

const settings = {
  secretKey: process.env.CR_SECRET_KEY || 'change-me-in-production-please',
  flagSecret: process.env.CR_FLAG_SECRET || 'my-super-secret-flag-key',

  mongoUri: process.env.CR_MONGO_URI || 'mongodb://localhost:27017',
  mongoDb: process.env.CR_MONGO_DB || 'cyberrange',

  adminId: process.env.ADMIN_ID || process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || process.env.ADMIN_PASS || 'ChangeMe123!',

  // how long a login token lasts (in s)
  tokenExpirySeconds: parseInt(process.env.CR_TOKEN_EXPIRY_SECONDS || String(24 * 60 * 60), 10),

  // how long a lab can run before auto-cleanup (in s)
  labMaxAgeSeconds: parseInt(process.env.CR_LAB_MAX_AGE_SECONDS || String(2 * 60 * 60), 10),
  labCleanupIntervalSeconds: parseInt(process.env.CR_LAB_CLEANUP_INTERVAL_SECONDS || '60', 10),

  // login brute-force protection
  loginRateLimitWindowSeconds: parseInt(process.env.CR_LOGIN_RATE_LIMIT_WINDOW_SECONDS || '900', 10),
  loginRateLimitMaxFailures: parseInt(process.env.CR_LOGIN_RATE_LIMIT_MAX_FAILURES || '5', 10),
  loginRateLimitBaseDelaySeconds: parseInt(process.env.CR_LOGIN_RATE_LIMIT_BASE_DELAY_SECONDS || '2', 10),
  loginRateLimitMaxDelaySeconds: parseInt(process.env.CR_LOGIN_RATE_LIMIT_MAX_DELAY_SECONDS || '60', 10),

  containerMemoryLimit: '256m',
  containerCpuPeriod: 100000,
  containerCpuQuota: 50000, // 50% of one core

  // Docker lab network
  dockerNetworkName: process.env.CR_DOCKER_NETWORK_NAME || 'cyberrange_labs',
  labSubnet: process.env.CR_LAB_SUBNET || '127.30.0.0/16',

  corsOrigins: [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
  ],
};

module.exports = settings;
