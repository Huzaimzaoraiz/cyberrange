const Docker = require('dockerode');
const database = require('./database');
const flagEngine = require('./flagEngine');
const settings = require('./config');

let docker = null;

function get_docker_client() {
  if (!docker) {
    docker = new Docker();
  }
  return docker;
}

async function pingDocker() {
  try {
    const client = get_docker_client();
    await client.ping();
    return client;
  } catch (e) {
    docker = null;
    throw new Error(`Docker is not reachable. (${e.message})`);
  }
}

async function getNetwork_for_Lab() {
  const client = await pingDocker();
  const networkName = settings.dockerNetworkName;
  try {
    const network = client.getNetwork(networkName);
    await network.inspect(); // throws if not found
    return network;
  } catch (e) {
    // Create network
    return client.createNetwork({
      Name: networkName,
      Driver: 'bridge',
      CheckDuplicate: true,
      IPAM: {
        Config: [{ Subnet: settings.labSubnet }],
      },
    });
  }
}

function getContainerIp(containerInfo, networkName) {
  const networks = containerInfo.NetworkSettings?.Networks || {};
  return networks[networkName]?.IPAddress || null;
}

function instanceNumberFromIp(ipAddress) {
  if (!ipAddress) return 0;
  const parts = ipAddress.split('.');
  return parseInt(parts[parts.length - 2], 10) * 256 + parseInt(parts[parts.length - 1], 10);
}

async function removeStaleContainer(name) {
  try {
    const client = get_docker_client();
    const container = client.getContainer(name);
    try {
      await container.stop({ t: 5 });
    } catch (_) {
      // may already be stopped
    }
    await container.remove({ force: true });
    console.log('removed stale container: ' + name);
  } catch (e) {
    if (e.statusCode !== 404) {
      console.log('warning: could not remove stale container ' + name + ': ' + e.message);
    }
  }
}

async function cleanupStaleResources() {
  let client;
  try {
    client = await pingDocker();
  } catch (e) {
    console.log('startup cleanup skipped: ' + e.message);
    return;
  }

  const instances = await database.getAllRunningInstances();
  for (const inst of instances) {
    let alive = false;
    for (const cid of inst.container_ids || []) {
      try {
        const container = client.getContainer(cid);
        const info = await container.inspect();
        if (info.State?.Running) alive = true;
      } catch (_) {
        // container not found
      }
    }
    if (!alive) {
      await database.updateInstanceStatus(inst.id, 'destroyed');
      console.log('startup cleanup: marked instance ' + inst.id + ' as destroyed (containers gone)');
    }
  }
}

async function createLab(userId, challengeId) {
  // Check for existing running lab
  const existing = await database.getRunningInstance(userId, challengeId);
  if (existing) {
    return { error: 'you already have a running lab for this challenge', instance: existing };
  }

  // Fetch challenge configuration
  const challenge = await database.getChallenge(challengeId);
  if (!challenge) {
    return { error: 'challenge not found' };
  }

  // Generate user/challenge specific flag
  const flag = flagEngine.generateFlag(userId, challengeId);
  const containerName = `lab_u${userId}_${challengeId}`;

  // Remove any duplicate containers
  await removeStaleContainer(containerName);

  try {
    const client = await pingDocker();
    const network = await getNetwork_for_Lab();

    // Get network name (might be a Network object or have Name/id)
    let networkName = settings.dockerNetworkName;
    if (network.id) {
      try {
        const netInfo = await network.inspect();
        networkName = netInfo.Name || networkName;
      } catch (_) { }
    }

    const internalPort = challenge.internal_port || 80;

    // Parse memory limit
    const memLimitBytes = parseMemoryLimit(settings.containerMemoryLimit);

    const container = await client.createContainer({
      Image: challenge.docker_image,
      name: containerName,
      Env: [`FLAG=${flag}`],
      HostConfig: {
        NetworkMode: networkName,
        Memory: memLimitBytes,
        CpuPeriod: settings.containerCpuPeriod,
        CpuQuota: settings.containerCpuQuota,
        ReadonlyRootfs: false,
        Privileged: false,
        SecurityOpt: ['no-new-privileges'],
      },
    });

    await container.start();

    // Inspect to get IP
    const containerInfo = await container.inspect();
    const containerIp = getContainerIp(containerInfo, networkName);
    if (!containerIp) {
      throw new Error('container started but did not receive an IP on ' + networkName);
    }

    const targetIp = parseInt(internalPort, 10) === 80 ? containerIp : `${containerIp}:${internalPort}`;
    const instanceNum = instanceNumberFromIp(containerIp);
    console.log(`started container: ${containerName} on ${networkName} at ${targetIp}`);

    // Save to database
    const instance = await database.createInstance(
      userId,
      challengeId,
      instanceNum,
      [container.id],
      settings.dockerNetworkName,
      settings.labSubnet,
      targetIp
    );

    return {
      success: true,
      instance_number: instanceNum,
      lab_subnet: settings.labSubnet,
      target_ip: targetIp,
      containers: [targetIp],
      expires_at: instance ? instance.expires_at : null,
    };
  } catch (e) {
    return { error: 'failed to start container: ' + e.message };
  }
}

function parseMemoryLimit(limit) {
  if (typeof limit === 'number') return limit;
  const match = String(limit).match(/^(\d+)([kmg]?)$/i);
  if (!match) return 256 * 1024 * 1024;
  const num = parseInt(match[1], 10);
  const unit = (match[2] || '').toLowerCase();
  if (unit === 'g') return num * 1024 * 1024 * 1024;
  if (unit === 'm') return num * 1024 * 1024;
  if (unit === 'k') return num * 1024;
  return num;
}

async function destroyLab(userId, challengeId) {
  const instance = await database.getRunningInstance(userId, challengeId);
  if (!instance) {
    return { error: 'no running lab found for this challenge' };
  }

  await database.updateInstanceStatus(instance.id, 'destroying');

  let client;
  try {
    client = await pingDocker();
  } catch (e) {
    await database.updateInstanceStatus(instance.id, 'running');
    return { error: e.message };
  }

  for (const containerId of instance.container_ids || []) {
    try {
      const container = client.getContainer(containerId);
      try {
        await container.stop({ t: 5 });
      } catch (_) { }
      await container.remove({ force: true });
      console.log('removed container: ' + containerId.slice(0, 12));
    } catch (e) {
      console.log('warning: could not remove container ' + containerId.slice(0, 12) + ': ' + e.message);
    }
  }

  await database.updateInstanceStatus(instance.id, 'destroyed');
  return { success: true };
}

async function destroyLabByInstanceId(instanceId) {
  const instance = await database.getInstanceById(instanceId);
  if (!instance) return { error: 'instance not found' };
  if (instance.status !== 'running') return { error: 'instance is not running' };

  await database.updateInstanceStatus(instance.id, 'destroying');

  let client;
  try {
    client = await pingDocker();
  } catch (e) {
    await database.updateInstanceStatus(instance.id, 'running');
    return { error: e.message };
  }

  for (const containerId of instance.container_ids || []) {
    try {
      const container = client.getContainer(containerId);
      try {
        await container.stop({ t: 5 });
      } catch (_) { }
      await container.remove({ force: true });
    } catch (e) {
      console.log('warning: ' + e.message);
    }
  }

  await database.updateInstanceStatus(instance.id, 'destroyed');
  return { success: true };
}

async function getLabStatus(userId, challengeId) {
  const instance = await database.getRunningInstance(userId, challengeId);
  if (!instance) return { running: false };

  const expiresAt = instance.expires_at;
  const now = new Date();
  if (expiresAt && expiresAt <= now) {
    const result = await destroyLab(userId, challengeId);
    if (result.success) return { running: false, expired: true };
  }

  let allRunning = true;
  let client;
  try {
    client = await pingDocker();
  } catch (_) {
    allRunning = false;
    client = null;
  }

  if (client) {
    for (const containerId of instance.container_ids || []) {
      try {
        const container = client.getContainer(containerId);
        const info = await container.inspect();
        if (!info.State?.Running) allRunning = false;
      } catch (_) {
        allRunning = false;
      }
    }
  }

  let remainingSeconds = null;
  if (expiresAt) {
    remainingSeconds = Math.max(0, Math.floor((expiresAt - now) / 1000));
  }

  return {
    running: true,
    all_containers_healthy: allRunning,
    instance_id: instance.id,
    lab_subnet: instance.lab_subnet || settings.labSubnet,
    target_ip: instance.target_ip,
    instance_number: instance.instance_number,
    created_at: instance.created_at,
    expires_at: expiresAt,
    remaining_seconds: remainingSeconds,
  };
}

module.exports = {
  cleanupStaleResources,
  createLab,
  destroyLab,
  destroyLabByInstanceId,
  getLabStatus,
};
