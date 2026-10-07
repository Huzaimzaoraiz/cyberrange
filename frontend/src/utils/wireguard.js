/**
 * wireguard.js — Browser-side WireGuard key generation & config building
 *
 * Uses @noble/curves with Web Crypto as fallback.
 * The private key is generated and stored locally in the browser and is NEVER
 * transmitted over the network.
 */
import { x25519 } from '@noble/curves/ed25519.js';

function uint8ArrayToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Generate a WireGuard Curve25519 keypair.
 *
 * @returns {Promise<{ privateKeyBase64: string, publicKeyBase64: string }>}
 */
export async function generateWireguardKeypair() {
  try {
    const { secretKey, publicKey } = x25519.keygen();
    return {
      privateKeyBase64: uint8ArrayToBase64(secretKey),
      publicKeyBase64: uint8ArrayToBase64(publicKey),
    };
  } catch (nobleErr) {
    console.warn('noble/curves keygen failed, falling back to WebCrypto:', nobleErr);
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const keyPair = await crypto.subtle.generateKey(
        { name: 'X25519' },
        true,
        ['deriveKey', 'deriveBits']
      );
      // X25519 private keys in WebCrypto cannot be exported as 'raw'; use 'jwk'
      const jwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
      const rawPub = await crypto.subtle.exportKey('raw', keyPair.publicKey);
      const privateKeyBase64 = jwk.d.replace(/-/g, '+').replace(/_/g, '/') + '=';
      const publicKeyBase64 = uint8ArrayToBase64(new Uint8Array(rawPub));
      return { privateKeyBase64, publicKeyBase64 };
    }
    throw nobleErr;
  }
}

/**
 * Build a WireGuard client configuration file string.
 *
 * @param {string}   privateKeyBase64   Client private key (base64)
 * @param {string}   clientIp           Allocated VPN IP (e.g. "10.1.106.10")
 * @param {string}   serverPublicKey    Gateway WireGuard public key (base64)
 * @param {string}   serverEndpoint     Gateway endpoint (e.g. "104.211.77.85:51820")
 * @param {string[]} allowedIps         CIDR ranges to tunnel through VPN (default: lab subnet only)
 * @param {string[]} [dns]              Optional DNS servers inside the tunnel
 * @returns {string} Contents of a .conf file ready to pass to `wg-quick`
 */
export function buildClientWireguardConfig(
  privateKeyBase64,
  clientIp,
  serverPublicKey,
  serverEndpoint,
  allowedIps = [import.meta.env?.VITE_LAB_SUBNET || '172.30.0.0/16'],
  dns = []
) {
  const dnsLine = dns.length > 0 ? `DNS = ${dns.join(', ')}\n` : '';

  return (
    `[Interface]\n` +
    `PrivateKey = ${privateKeyBase64}\n` +
    `Address = ${clientIp}/32\n` +
    dnsLine +
    `\n` +
    `[Peer]\n` +
    `PublicKey = ${serverPublicKey}\n` +
    `Endpoint = ${serverEndpoint}\n` +
    `AllowedIPs = ${allowedIps.join(', ')}\n` +
    `PersistentKeepalive = 25\n`
  );
}
