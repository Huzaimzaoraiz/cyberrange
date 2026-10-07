
const settings = require('./config');

let db; // set by initDb

function setDb(mongoDb) {
  db = mongoDb;
}


async function getNextSequenceValue(sequenceName) {
  const result = await db.collection('counters').findOneAndUpdate(
    { _id: sequenceName },
    { $inc: { sequence_value: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return result.sequence_value;
}


async function initDb(mongoDb) {
  db = mongoDb;

  // Verify connectivity
  await db.command({ ping: 1 });

  // Create indexes
  await db.collection('users').createIndex({ username: 1 }, { unique: true });
  await db.collection('users').createIndex({ id: 1 }, { unique: true });
  await db.collection('challenges').createIndex({ id: 1 }, { unique: true });
  await db.collection('instances').createIndex({ id: 1 }, { unique: true });
  await db.collection('instances').createIndex({ user_id: 1, challenge_id: 1, status: 1 });
  await db.collection('instances').createIndex({ user_id: 1, status: 1 });
  await db.collection('instances').createIndex({ status: 1, expires_at: 1 });
  await db.collection('submissions').createIndex({ user_id: 1, challenge_id: 1, correct: 1 });
  await db.collection('submissions').createIndex({ user_id: 1, flag_submitted: 1, correct: 1 });
  await db.collection('submissions').createIndex({ correct: 1, user_id: 1, submitted_at: 1 });
  await db.collection('login_attempts').createIndex({ key: 1 }, { unique: true });
  await db.collection('login_attempts').createIndex({ updated_at: 1 });
  await db.collection('registration_otps').createIndex({ email: 1 }, { unique: true });
  await db.collection('registration_otps').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });



  // Initialize / synchronize admin user
  const bcrypt = require('bcrypt');
  const adminUsername = settings.adminId;
  const adminPassword = settings.adminPassword;

  const adminUser = await db.collection('users').findOne({ username: adminUsername });
  if (adminUser) {
    const passwordOk = await bcrypt.compare(adminPassword, adminUser.password_hash || '');
    if (adminUser.role !== 'admin' || !passwordOk) {
      const hash = await bcrypt.hash(adminPassword, 10);
      await db.collection('users').updateOne(
        { username: adminUsername },
        { $set: { role: 'admin', password_hash: hash } }
      );
    }
  } else {
    const adminId = await getNextSequenceValue('users');
    const hash = await bcrypt.hash(adminPassword, 10);
    await db.collection('users').insertOne({
      id: adminId,
      username: adminUsername,
      password_hash: hash,
      role: 'admin',
      created_at: new Date(),
    });
  }
}


async function createUser(username, passwordHash, role = 'user') {
  const userId = await getNextSequenceValue('users');
  try {
    await db.collection('users').insertOne({
      id: userId,
      username,
      password_hash: passwordHash,
      role,
      created_at: new Date(),
    });
    return userId;
  } catch (err) {
    if (err.code === 11000) return null; // duplicate key
    throw err;
  }
}

async function getUserByUsername(username) {
  return db.collection('users').findOne({ username });
}

async function getUserById(userId) {
  if (userId == null) return null;
  return db.collection('users').findOne({ id: Number(userId) });
}

async function getAllUsers() {
  return db.collection('users')
    .find({}, { projection: { _id: 0, id: 1, username: 1, role: 1, created_at: 1 } })
    .toArray();
}

async function countAdminUsers() {
  return db.collection('users').countDocuments({ role: 'admin' });
}

async function getRunningInstancesByUser(userId) {
  return db.collection('instances')
    .find({ user_id: Number(userId), status: 'running' }, { projection: { id: 1 } })
    .toArray();
}

async function deleteUserAndRelatedData(userId) {
  userId = Number(userId);
  await db.collection('submissions').deleteMany({ user_id: userId });
  await db.collection('instances').deleteMany({ user_id: userId });
  await db.collection('users').deleteOne({ id: userId });
}

async function setActiveSession(userId, sessionId) {
  await db.collection('users').updateOne(
    { id: Number(userId) },
    { $set: { active_session_id: sessionId, active_session_started_at: new Date() } }
  );
}

async function clearActiveSession(userId, sessionId = null) {
  const query = { id: Number(userId) };
  if (sessionId !== null) query.active_session_id = sessionId;
  await db.collection('users').updateOne(
    query,
    { $unset: { active_session_id: '', active_session_started_at: '' } }
  );
}

async function isActiveSession(userId, sessionId) {
  if (!sessionId) return false;
  const doc = await db.collection('users').findOne(
    { id: Number(userId), active_session_id: sessionId },
    { projection: { _id: 1 } }
  );
  return doc !== null;
}


function _loginKey(username, clientHost) {
  return (username || '').trim().toLowerCase() + '|' + (clientHost || 'unknown');
}

async function getLoginRetryAfter(username, clientHost) {
  const row = await db.collection('login_attempts').findOne({ key: _loginKey(username, clientHost) });
  if (!row) return 0;
  const lockedUntil = row.locked_until;
  if (!lockedUntil) return 0;
  const now = new Date();
  if (lockedUntil <= now) return 0;
  return Math.max(1, Math.floor((lockedUntil - now) / 1000));
}

async function recordLoginFailure(username, clientHost) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - settings.loginRateLimitWindowSeconds * 1000);
  const key = _loginKey(username, clientHost);
  const row = (await db.collection('login_attempts').findOne({ key })) || {};

  let failures;
  if (row.updated_at && row.updated_at >= windowStart) {
    failures = (row.failures || 0) + 1;
  } else {
    failures = 1;
  }

  const overLimit = Math.max(0, failures - settings.loginRateLimitMaxFailures);
  let delay = 0;
  let lockedUntil = null;
  if (overLimit > 0) {
    delay = Math.min(
      settings.loginRateLimitMaxDelaySeconds,
      settings.loginRateLimitBaseDelaySeconds * Math.pow(2, overLimit - 1)
    );
    lockedUntil = new Date(now.getTime() + delay * 1000);
  }

  await db.collection('login_attempts').updateOne(
    { key },
    {
      $set: {
        key,
        username: (username || '').trim().toLowerCase(),
        client_host: clientHost || 'unknown',
        failures,
        locked_until: lockedUntil,
        updated_at: now,
      },
    },
    { upsert: true }
  );
  return delay;
}

async function clearLoginFailures(username, clientHost) {
  await db.collection('login_attempts').deleteOne({ key: _loginKey(username, clientHost) });
}


async function getAllChallenges() {
  return db.collection('challenges').find({}, { projection: { _id: 0 } }).toArray();
}

async function getChallenge(challengeId) {
  return db.collection('challenges').findOne({ id: challengeId }, { projection: { _id: 0 } });
}

async function createChallenge(challengeId, name, description, difficulty, category, points, dockerImage, internalPort) {
  await db.collection('challenges').updateOne(
    { id: challengeId },
    {
      $set: {
        name,
        description,
        difficulty,
        category,
        points: Number(points),
        docker_image: dockerImage,
        internal_port: Number(internalPort),
      },
    },
    { upsert: true }
  );
}

async function updateChallenge(challengeId, name, description, difficulty, category, points, dockerImage, internalPort) {
  await db.collection('challenges').updateOne(
    { id: challengeId },
    {
      $set: {
        name,
        description,
        difficulty,
        category,
        points: Number(points),
        docker_image: dockerImage,
        internal_port: Number(internalPort),
      },
    }
  );
}

async function deleteChallenge(challengeId) {
  await db.collection('challenges').deleteOne({ id: challengeId });
}


async function getRunningInstance(userId, challengeId) {
  return db.collection('instances').findOne(
    { user_id: Number(userId), challenge_id: challengeId, status: 'running' },
    { projection: { _id: 0 } }
  );
}

async function getAllRunningInstances() {
  const instances = await db.collection('instances')
    .find({ status: 'running' }, { projection: { _id: 0 } })
    .toArray();

  const userIds = [...new Set(instances.map((i) => Number(i.user_id)))];
  const challengeIds = [...new Set(instances.map((i) => i.challenge_id))];

  const users = await db.collection('users')
    .find({ id: { $in: userIds } }, { projection: { _id: 0, id: 1, username: 1 } })
    .toArray();
  const challenges = await db.collection('challenges')
    .find({ id: { $in: challengeIds } }, { projection: { _id: 0, id: 1, name: 1 } })
    .toArray();

  const usersById = {};
  users.forEach((u) => (usersById[u.id] = u));
  const challengesById = {};
  challenges.forEach((c) => (challengesById[c.id] = c));

  for (const inst of instances) {
    const user = usersById[Number(inst.user_id)];
    const challenge = challengesById[inst.challenge_id];
    inst.username = user ? user.username : 'deleted_user';
    inst.challenge_name = challenge ? challenge.name : 'deleted_challenge';
  }
  return instances;
}

async function getUsedInstanceNumbers() {
  const rows = await db.collection('instances')
    .find({ status: 'running' }, { projection: { instance_number: 1 } })
    .toArray();
  return new Set(rows.map((r) => r.instance_number));
}

async function createInstance(userId, challengeId, instanceNumber, containerIds, networkId, labSubnet, targetIp) {
  const instId = await getNextSequenceValue('instances');
  const now = new Date();
  const instance = {
    id: instId,
    user_id: Number(userId),
    challenge_id: challengeId,
    instance_number: Number(instanceNumber),
    status: 'running',
    container_ids: containerIds,
    network_id: networkId,
    lab_subnet: labSubnet,
    target_ip: targetIp,
    created_at: now,
    expires_at: new Date(now.getTime() + settings.labMaxAgeSeconds * 1000),
  };
  await db.collection('instances').insertOne(instance);
  return instance;
}

async function updateInstanceStatus(instanceId, status) {
  await db.collection('instances').updateOne(
    { id: Number(instanceId) },
    { $set: { status } }
  );
}

async function getInstanceById(instanceId) {
  return db.collection('instances').findOne(
    { id: Number(instanceId) },
    { projection: { _id: 0 } }
  );
}

async function getOldRunningInstances(maxAgeSeconds) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - maxAgeSeconds * 1000);
  return db.collection('instances')
    .find(
      {
        status: 'running',
        $or: [
          { expires_at: { $lte: now } },
          { expires_at: { $exists: false }, created_at: { $lt: cutoff } },
        ],
      },
      { projection: { _id: 0 } }
    )
    .toArray();
}


async function saveSubmission(userId, challengeId, flagSubmitted, correct) {
  const subId = await getNextSequenceValue('submissions');
  await db.collection('submissions').insertOne({
    id: subId,
    user_id: Number(userId),
    challenge_id: challengeId,
    flag_submitted: flagSubmitted,
    correct: correct ? 1 : 0,
    submitted_at: new Date(),
  });
}


async function hasUserSolved(userId, challengeId) {
  const doc = await db.collection('submissions').findOne(
    { user_id: Number(userId), challenge_id: challengeId, correct: 1 },
    { projection: { _id: 1 } }
  );
  return doc !== null;
}

async function hasUserUsedFlag(userId, flagSubmitted) {
  const count = await db.collection('submissions').countDocuments(
    { user_id: Number(userId), flag_submitted: flagSubmitted, correct: 1 },
    { limit: 1 }
  );
  return count > 0;
}

async function getAllUserIds() {
  const rows = await db.collection('users')
    .find({ role: { $ne: 'admin' } }, { projection: { id: 1 } })
    .toArray();
  return rows.map((r) => r.id);
}

async function getScoreboard() {
  const users = await db.collection('users')
    .find({ role: { $ne: 'admin' } }, { projection: { _id: 0, id: 1, username: 1 } })
    .toArray();

  const challengesCursor = await db.collection('challenges')
    .find({}, { projection: { _id: 0, id: 1, points: 1 } })
    .toArray();
  const challengePoints = {};
  challengesCursor.forEach((c) => (challengePoints[c.id] = Number(c.points || 100)));

  const rowsByUserId = {};
  for (const u of users) {
    rowsByUserId[u.id] = {
      id: u.id,
      username: u.username,
      score: 0,
      solves: 0,
      last_solve_at: null,
    };
  }

  const userIdList = Object.keys(rowsByUserId).map(Number);
  if (userIdList.length > 0) {
    const correctSubs = await db.collection('submissions')
      .find(
        { user_id: { $in: userIdList }, correct: 1 },
        { projection: { _id: 0, user_id: 1, challenge_id: 1, submitted_at: 1 } }
      )
      .sort({ submitted_at: 1 })
      .toArray();

    for (const sub of correctSubs) {
      const row = rowsByUserId[Number(sub.user_id)];
      const points = challengePoints[sub.challenge_id];
      if (!row || points == null) continue;
      row.score += points;
      row.solves += 1;
      if (sub.submitted_at) row.last_solve_at = sub.submitted_at;
    }
  }

  const scoreboard = Object.values(rowsByUserId);
  scoreboard.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aTime = a.last_solve_at ? a.last_solve_at.getTime() : Infinity;
    const bTime = b.last_solve_at ? b.last_solve_at.getTime() : Infinity;
    if (aTime !== bTime) return aTime - bTime;
    return a.username.localeCompare(b.username);
  });
  return scoreboard;
}

async function getScoreboardWithIps(showIps = false) {
  const scores = await getScoreboard();
  const scoresByUserId = {};
  scores.forEach((r) => (scoresByUserId[r.id] = r));

  const users = await db.collection('users')
    .find({ role: { $ne: 'admin' } }, { projection: { _id: 0, id: 1, username: 1 } })
    .toArray();
  const userIds = users.map((u) => Number(u.id));

  const runningInstances = await db.collection('instances')
    .find(
      { user_id: { $in: userIds }, status: 'running' },
      { projection: { _id: 0, user_id: 1, challenge_id: 1, target_ip: 1 } }
    )
    .sort({ created_at: 1 })
    .toArray();

  const instanceByUserId = {};
  for (const inst of runningInstances) {
    if (!instanceByUserId[Number(inst.user_id)]) {
      instanceByUserId[Number(inst.user_id)] = inst;
    }
  }

  const portalRows = [];
  for (const u of users) {
    const scoreRow = scoresByUserId[u.id] || {};
    const inst = instanceByUserId[Number(u.id)];
    portalRows.push({
      user_id: u.id,
      username: u.username,
      score: scoreRow.score || 0,
      challenge_id: inst ? inst.challenge_id : null,
      target_ip: inst && showIps ? inst.target_ip : null,
    });
  }
  portalRows.sort((a, b) => a.username.localeCompare(b.username));
  return portalRows;
}



async function getRunningMachineIps(includeUsernames = false) {
  const instances = await db.collection('instances')
    .find({ status: 'running' }, { projection: { _id: 0 } })
    .toArray();

  let usersById = {};
  if (includeUsernames) {
    const userIds = [...new Set(instances.map((i) => Number(i.user_id)))];
    const users = await db.collection('users')
      .find({ id: { $in: userIds } }, { projection: { _id: 0, id: 1, username: 1 } })
      .toArray();
    users.forEach((u) => (usersById[u.id] = u));
  }

  const result = [];
  for (const inst of instances) {
    if (inst.target_ip) {
      const row = { target_ip: inst.target_ip, challenge_id: inst.challenge_id };
      if (includeUsernames) {
        const user = usersById[Number(inst.user_id)];
        row.username = user ? user.username : 'deleted_user';
      }
      result.push(row);
    }
  }
  return result;
}

module.exports = {
  setDb,
  initDb,
  createUser,
  getUserByUsername,
  getUserById,
  getAllUsers,
  countAdminUsers,
  getRunningInstancesByUser,
  deleteUserAndRelatedData,
  setActiveSession,
  clearActiveSession,
  isActiveSession,
  getLoginRetryAfter,
  recordLoginFailure,
  clearLoginFailures,
  getAllChallenges,
  getChallenge,
  createChallenge,
  updateChallenge,
  deleteChallenge,
  getRunningInstance,
  getAllRunningInstances,
  getUsedInstanceNumbers,
  createInstance,
  updateInstanceStatus,
  getInstanceById,
  getOldRunningInstances,
  saveSubmission,
  hasUserSolved,
  hasUserUsedFlag,
  getAllUserIds,
  getScoreboard,
  getScoreboardWithIps,
  getRunningMachineIps,
  
  saveRegistrationOtp: async function (email, otp) {
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    await db.collection('registration_otps').updateOne(
      { email },
      { $set: { otp, expires_at: expiresAt } },
      { upsert: true }
    );
  },

  getRegistrationOtp: async function (email) {
    return db.collection('registration_otps').findOne({ email });
  },

  deleteRegistrationOtp: async function (email) {
    await db.collection('registration_otps').deleteOne({ email });
  }
};
