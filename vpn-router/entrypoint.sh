#!/bin/bash
set -e

echo "[vpn-router] Starting CyberRange VPN Lab Router..."

CONF_FILE="/etc/wireguard/wg0.conf"
LAB_SUBNET="${LAB_SUBNET:-172.30.0.0/16}"

if [ -z "$VPN_V2_URL" ] || [ -z "$VPN_V2_SERVICE_EMAIL" ] || [ -z "$VPN_V2_SERVICE_PASS" ] || [ -z "$VPN_V2_NETWORK_ID" ]; then
  echo "[vpn-router] ERROR: Missing one or more required environment variables:"
  echo "  VPN_V2_URL, VPN_V2_SERVICE_EMAIL, VPN_V2_SERVICE_PASS, VPN_V2_NETWORK_ID"
  echo "[vpn-router] Waiting 30s before exiting..."
  sleep 30
  exit 1
fi

# Ensure /dev/net/tun is present
if [ ! -c /dev/net/tun ]; then
  mkdir -p /dev/net
  mknod /dev/net/tun c 10 200 || true
  chmod 600 /dev/net/tun || true
fi

# Wait for VPN Controller backend to be reachable
echo "[vpn-router] Checking connectivity to VPN Controller at $VPN_V2_URL..."
MAX_RETRIES=20
RETRY_COUNT=0
until curl -s -f -m 3 "$VPN_V2_URL/api/v1/auth/me" > /dev/null 2>&1 || [ "$?" -eq 22 ] || [ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$VPN_V2_URL/api/v1/auth/me" || true)
  if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "200" ]; then
    break
  fi
  echo "[vpn-router] Waiting for VPN backend ($VPN_V2_URL)... ($RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
  RETRY_COUNT=$((RETRY_COUNT + 1))
done

# If configuration does not exist, provision device and route
if [ ! -f "$CONF_FILE" ]; then
  echo "[vpn-router] Provisioning new routing peer in OverlayVPN..."

  # 1. Log in to get JWT token
  echo "[vpn-router] Authenticating as $VPN_V2_SERVICE_EMAIL..."
  LOGIN_RESP=$(curl -s -f -X POST "$VPN_V2_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$VPN_V2_SERVICE_EMAIL\",\"password\":\"$VPN_V2_SERVICE_PASS\"}")

  TOKEN=$(echo "$LOGIN_RESP" | jq -r '.access_token // empty')
  if [ -z "$TOKEN" ]; then
    echo "[vpn-router] ERROR: Failed to log in to VPN Controller. Response:"
    echo "$LOGIN_RESP"
    exit 1
  fi

  # 2. Generate WireGuard keypair
  PRIVKEY=$(wg genkey)
  PUBKEY=$(echo "$PRIVKEY" | wg pubkey)

  # 3. Register device in the network
  echo "[vpn-router] Registering device 'cyberrange-lab-router'..."
  DEVICE_RESP=$(curl -s -f -X POST "$VPN_V2_URL/api/v1/networks/$VPN_V2_NETWORK_ID/devices" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"cyberrange-lab-router\",\"public_key\":\"$PUBKEY\",\"is_exit_node\":false}")

  DEVICE_ID=$(echo "$DEVICE_RESP" | jq -r '.device_id // .id // empty')
  VPN_IP=$(echo "$DEVICE_RESP" | jq -r '.vpn_ip // empty')
  GW_ENDPOINT=$(echo "$DEVICE_RESP" | jq -r '.gateway_endpoint // empty')
  GW_PUBKEY=$(echo "$DEVICE_RESP" | jq -r '.gateway_public_key // empty')

  if [ -z "$VPN_IP" ] || [ -z "$GW_ENDPOINT" ] || [ -z "$GW_PUBKEY" ]; then
    echo "[vpn-router] ERROR: Incomplete device registration response:"
    echo "$DEVICE_RESP"
    exit 1
  fi

  echo "[vpn-router] Device registered! VPN IP: $VPN_IP, Gateway: $GW_ENDPOINT"

  # 4. Register route for LAB_SUBNET through this device
  echo "[vpn-router] Registering subnet route $LAB_SUBNET via $VPN_IP..."
  ROUTE_RESP=$(curl -s -X POST "$VPN_V2_URL/api/v1/networks/$VPN_V2_NETWORK_ID/routes" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"destination_cidr\":\"$LAB_SUBNET\",\"next_hop_vpn_ip\":\"$VPN_IP\",\"description\":\"CyberRange Labs Subnet\"}")
  echo "[vpn-router] Route registration response: $ROUTE_RESP"

  # 5. Write wg0.conf
  cat <<EOF > "$CONF_FILE"
[Interface]
PrivateKey = $PRIVKEY
Address = $VPN_IP/32

[Peer]
PublicKey = $GW_PUBKEY
Endpoint = $GW_ENDPOINT
AllowedIPs = 10.0.0.0/8
PersistentKeepalive = 25
EOF

  chmod 600 "$CONF_FILE"
  echo "[vpn-router] Generated $CONF_FILE"
fi

# Bring up WireGuard interface
echo "[vpn-router] Bringing up WireGuard interface wg0..."
wg-quick up wg0 || {
  echo "[vpn-router] wg-quick up failed, retrying..."
  wg-quick down wg0 2>/dev/null || true
  wg-quick up wg0
}

# Enable kernel IP forwarding
sysctl -w net.ipv4.ip_forward=1 || true

# Find the network interface connected to LAB_SUBNET (e.g. 172.30.0.0/16)
LAB_IFACE=$(ip -4 route show to "$LAB_SUBNET" | awk '{for(i=1;i<=NF;i++) if ($i=="dev") print $(i+1)}' | head -n1)

if [ -z "$LAB_IFACE" ]; then
  echo "[vpn-router] ERROR: Could not detect lab interface for subnet $LAB_SUBNET!"
  echo "[vpn-router] Available routes:"
  ip -4 route show
  echo "[vpn-router] Refusing to fall back to eth0 to prevent forwarding non-lab networks."
  exit 1
else
  echo "[vpn-router] Detected lab interface: $LAB_IFACE for subnet $LAB_SUBNET"
fi

# Setup strict iptables forwarding and NAT masquerade (ONLY lab network)
echo "[vpn-router] Configuring strict iptables isolation for $LAB_SUBNET on $LAB_IFACE..."

# 1. Set default policy on FORWARD to DROP (drops all unapproved transit traffic)
iptables -P FORWARD DROP

# 2. Flush FORWARD chain to ensure clean state
iptables -F FORWARD

# 3. Allow incoming VPN traffic from wg0 ONLY to $LAB_IFACE and ONLY destined for $LAB_SUBNET
iptables -A FORWARD -i wg0 -o "$LAB_IFACE" -d "$LAB_SUBNET" -j ACCEPT

# 4. Allow return traffic from $LAB_IFACE back to wg0 ONLY from $LAB_SUBNET (established/related connections only)
iptables -A FORWARD -i "$LAB_IFACE" -o wg0 -s "$LAB_SUBNET" -m state --state RELATED,ESTABLISHED -j ACCEPT

# 5. Drop everything else forwarded (e.g., wg0 -> app_net, lab_iface -> app_net, or lab_iface -> internet)
iptables -A FORWARD -j DROP

# 6. Setup NAT Masquerade ONLY for traffic going out $LAB_IFACE to $LAB_SUBNET
iptables -t nat -F POSTROUTING
iptables -t nat -A POSTROUTING -o "$LAB_IFACE" -d "$LAB_SUBNET" -j MASQUERADE

echo "[vpn-router] Routing peer is active: strictly forwarding only $LAB_SUBNET via $LAB_IFACE!"

# Graceful teardown
cleanup() {
  echo "[vpn-router] Shutting down..."
  wg-quick down wg0 2>/dev/null || true
  exit 0
}
trap cleanup SIGTERM SIGINT

# Keep container running
sleep infinity &
wait $!
