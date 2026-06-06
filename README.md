# Simplified CyberRange

Production-style Docker deployment for the CyberRange app.

## Services

- `nginx`: single web entrypoint for the VPN users
- `frontend`: built React app served by Nginx
- `backend`: FastAPI API server
- `mongodb`: private database container
- `docker-socket-proxy`: limited Docker API proxy for the backend
- `netbird-client`: VPN node for web access
- `netbird-lab-router`: VPN route into the challenge subnet

The backend does not join the challenge network. It talks to Docker only through `docker-socket-proxy`.

## First Run

Create local environment values:

```bash
cp .env.example .env
```

Edit `.env` and set strong values for:

```env
NB_WEB_SETUP_KEY=
NB_LAB_ROUTER_SETUP_KEY=
CR_SECRET_KEY=
CR_FLAG_SECRET=
ADMIN_PASSWORD=
```

Start the NetBird peers first:

```bash
docker compose up -d netbird-client netbird-lab-router
```

In the NetBird dashboard:

1. Find the IP for `cyberrange-web`.
2. Set `NGINX_BIND_IP` in `.env` to that IP.
3. Add a network route for `172.30.0.0/16` through `cyberrange-lab-router`.
4. Allow that route only for the users/groups who should access challenges.

Start the full stack:

```bash
docker compose up -d --build
```

Open:

```text
http://YOUR_NETBIRD_WEB_IP:8080
```

## Security Notes

- Do not commit `.env` or real setup keys.
- Do not expose MongoDB, backend, or frontend directly to host ports.
- Keep backend off `cyberrange_labs`.
- Keep challenge containers without host mounts or privileged mode.
- Treat the backend as trusted because it can ask Docker to create and remove lab containers through the proxy.
