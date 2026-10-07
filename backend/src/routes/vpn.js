/**
 * VPN Provisioning Route
 *
 * Bridges the CyberRange player session to the OverlayVPN
 * (github.com/huzaimzaoraiz/vpn) backend.
 *
 * Auth model: The VPN backend is a standard multi-tenant SaaS with JWT Bearer
 * auth. There is no special "admin token". CyberRange logs in with a dedicated
 * VPN service account (email + password) via POST /api/auth/login, caches the
 * returned access_token, and refreshes it automatically when it expires.
 *
 * Required env vars:
 *   VPN_V2_URL            - http://172.17.0.1:8000  (host-internal URL)
 *   VPN_V2_SERVICE_EMAIL  - email of the VPN account that owns the CyberRange network
 *   VPN_V2_SERVICE_PASS   - password for that account
 *   VPN_V2_NETWORK_ID     - UUID of the VPN network (from GET /api/networks)
 *
 * POST /api/vpn/provision
 *   Body:    { public_key: "<base64 WireGuard public key>" }
 *   Returns: { vpnIp, gatewayPublicKey, gatewayEndpoint }
 */

const express = require('express');
const router = express.Router();
const settings = require('../config');
const { requireAuth } = require('../middleware/auth');

// ---------------------------------------------------------------------------
// Token cache — one JWT shared across all provision requests
// ---------------------------------------------------------------------------
let _cachedToken = null;
let _tokenExpiry = 0; // Unix ms

/**
 * Return a valid VPN Bearer token, logging in (or re-logging in) as needed.
 * The VPN's JWT_EXPIRES_IN defaults to something like "1d".
 * We treat the token as expired 60 s early to avoid race conditions.
 */
async function getVpnToken() {
  const { vpnV2Url, vpnV2ServiceEmail, vpnV2ServicePass } = settings.vpn;

  const REFRESH_BUFFER_MS = 60_000; // refresh 60 s before actual expiry

  if (_cachedToken && Date.now() < _tokenExpiry - REFRESH_BUFFER_MS) {
    return _cachedToken;
  }

  const loginRes = await fetch(`${vpnV2Url}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: vpnV2ServiceEmail, password: vpnV2ServicePass }),
  });

  if (!loginRes.ok) {
    const errBody = await loginRes.text().catch(() => '');
    throw new Error(`VPN login failed (${loginRes.status}): ${errBody}`);
  }

  const loginData = await loginRes.json();
  const token = loginData.access_token;

  if (!token) {
    throw new Error('VPN login did not return access_token');
  }

  // Decode the JWT payload to find exp claim (no verification needed here,
  // the VPN backend verifies on every request).
  try {
    const payloadBase64 = token.split('.')[1];
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
    // exp is seconds since epoch
    _tokenExpiry = payload.exp ? payload.exp * 1000 : Date.now() + 23 * 60 * 60 * 1000;
  } catch {
    // If decode fails, assume 23-hour expiry as a safe default
    _tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
  }

  _cachedToken = token;
  console.log('[VPN] Obtained fresh service account token');
  return _cachedToken;
}

// ---------------------------------------------------------------------------
// POST /api/vpn/provision
// ---------------------------------------------------------------------------
router.post('/vpn/provision', requireAuth, async (req, res) => {
  const { public_key } = req.body;

  if (!public_key || typeof public_key !== 'string' || !public_key.trim()) {
    return res.status(400).json({ error: 'public_key is required' });
  }

  const { vpnV2Url, vpnV2ServiceEmail, vpnV2ServicePass, vpnV2NetworkId } = settings.vpn;

  if (!vpnV2Url || !vpnV2ServiceEmail || !vpnV2ServicePass || !vpnV2NetworkId) {
    console.error('[VPN] Missing VPN_V2_* env vars — provisioning disabled');
    return res.status(503).json({ error: 'VPN provisioning is not configured on this server' });
  }

  try {
    const token = await getVpnToken();
    const playerName = `cr-player-${req.user.username}`;

    // Clean up any previous devices for this player so IPs are not leaked
    // and keys are refreshed cleanly.
    try {
      const listRes = await fetch(`${vpnV2Url}/api/v1/networks/${vpnV2NetworkId}/devices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (listRes.ok) {
        const devices = await listRes.json();
        for (const dev of devices) {
          if (dev.name === playerName && dev.id) {
            await fetch(`${vpnV2Url}/api/v1/devices/${dev.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            }).catch(() => {});
          }
        }
      }
    } catch (cleanupErr) {
      console.warn('[VPN] Player device cleanup note:', cleanupErr.message);
    }

    // Helper to register the device with the VPN API
    async function registerDevice(authToken) {
      return fetch(`${vpnV2Url}/api/v1/networks/${vpnV2NetworkId}/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          name: playerName,
          public_key: public_key.trim(),
          is_exit_node: false,
        }),
      });
    }

    let vpnRes = await registerDevice(token);

    // If 401, the cached token was revoked — refresh and retry once
    if (vpnRes.status === 401) {
      _cachedToken = null;
      _tokenExpiry = 0;
      const freshToken = await getVpnToken();
      vpnRes = await registerDevice(freshToken);
    }

    if (!vpnRes.ok) {
      const errBody = await vpnRes.text().catch(() => '');
      console.error(`[VPN] Device creation failed (${vpnRes.status}): ${errBody}`);
      let parsedDetail = '';
      try {
        const parsed = JSON.parse(errBody);
        parsedDetail = parsed.detail || parsed.error || '';
      } catch {}
      return res.status(502).json({
        error: parsedDetail ? `VPN upstream error: ${parsedDetail}` : 'VPN provisioning failed — upstream error',
      });
    }

    const device = await vpnRes.json();
    return res.json(formatDeviceResponse(device));
  } catch (err) {
    console.error('[VPN] provision error:', err.message || err);
    return res.status(500).json({ error: err.message || 'Internal server error during VPN provisioning' });
  }
});

/**
 * Extract the 3 fields the frontend needs from the VPN device response.
 * VPN API returns snake_case: vpn_ip, gateway_endpoint, gateway_public_key
 */
function formatDeviceResponse(device) {
  const vpnIp         = device.vpn_ip;
  const gatewayEndpoint  = device.gateway_endpoint;
  const gatewayPublicKey = device.gateway_public_key;

  if (!vpnIp || !gatewayEndpoint || !gatewayPublicKey) {
    throw new Error(`Unexpected VPN device response shape: ${JSON.stringify(device)}`);
  }

  const labSubnet = settings.labSubnet || '172.30.0.0/16';
  return {
    vpnIp,
    gatewayPublicKey,
    gatewayEndpoint,
    allowedIps: [labSubnet],
    labSubnet,
  };
}

module.exports = router;
