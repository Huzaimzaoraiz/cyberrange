# CyberRange

> A modern, Docker-native platform for hosting isolated cybersecurity labs, CTF competitions, and hands-on training environments.

<p align="left">
  <img src="https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black">
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white">
  <img src="https://img.shields.io/badge/MongoDB-47A248?style=flat-square&logo=mongodb&logoColor=white">
  <img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white">
  <img src="https://img.shields.io/badge/WireGuard-881798?style=flat-square&logo=wireguard&logoColor=white">
</p>

CyberRange is built with **React**, **Node.js**, **MongoDB**, and **Docker** to dynamically provision challenge environments for each participant. Challenge containers are deployed on isolated Docker networks and securely managed through the Docker API, while **OverlayVPN (WireGuard)** provides private access to lab environments without exposing them to the public Internet.

## Features

- **Docker-based Labs** — Isolated challenge environments provisioned on demand.
- **React Frontend** — Modern and responsive user interface.
- **OTP Email Registration** — Secure, self-service user registration via Brevo SMTP.
- **Node.js Backend** — REST APIs for authentication and challenge orchestration.
- **MongoDB Storage** — Persistent storage for users, challenges, and scores.
- **Docker Socket Proxy** — Secure access to the Docker Engine.
- **OverlayVPN Routing** — Private access to lab environments over WireGuard.
- **Dynamic Provisioning** — Automatic deployment and cleanup of challenge containers.
- **Multi-user Isolation** — Dedicated lab instances for every participant.

## Services

- `nginx`: Web entrypoint serving the React frontend and proxying `/api/` to the backend.
- `backend`: Node.js API server for orchestration, registration, and logic.
- `mongodb`: Private database container.
- `docker-socket-proxy`: Limited Docker API proxy for the backend.
- `vpn-lab-router`: Custom WireGuard router connecting the lab subnet to the OverlayVPN controller.

The backend does not join the challenge network. It talks to Docker only through `docker-socket-proxy`.

## System Architecture

The CyberRange platform uses a containerized microservices architecture. **NGINX** serves as a reverse proxy for the frontend and backend, while the backend uses **MongoDB** for persistent storage and communicates with the Docker Engine through a **Docker Socket Proxy** to securely provision challenge environments.

Each challenge runs in one or more Docker containers on the isolated `cyberrange_labs` network (e.g., `172.30.0.0/16`). The **VPN Lab Router** connects directly to this Docker network and bridges traffic via a WireGuard tunnel to the external OverlayVPN controller.

```text
                    ┌─────────────────────┐
                    │     Participants    │
                    │  Browser / VPN User │
                    └──────────┬──────────┘
                               │
                               │ HTTP/HTTPS
                               ▼
                    ┌─────────────────────┐
                    │       NGINX         │
                    │ Reverse Proxy       │
                    └──────┬──────┬───────┘
                           │      │
                           │      │
                           ▼      ▼
                 ┌────────────┐ ┌────────────┐
                 │ Frontend   │ │ Backend    │
                 │ React UI   │ │ API Server │
                 └────────────┘ └─────┬──────┘
                                      │
                                      │
                       ┌──────────────┼──────────────┐
                       │              │              │
                       ▼              ▼              ▼
               ┌───────────┐  ┌─────────────┐  ┌─────────────┐
               │ MongoDB   │  │ Docker      │  │ Challenge   │
               │ Storage   │  │ Socket Proxy│  │ Management  │
               └───────────┘  └──────┬──────┘  └─────────────┘
                                     │
                                     │ Docker API
                                     ▼
                     ┌──────────────────────────┐
                     │ Docker Host Engine       │
                     │ Creates Challenge Labs   │
                     └───────────┬──────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ cyberrange_labs Network │
                    │ 172.30.0.0/16           │
                    └───────┬─────────────────┘
                            │
       ┌────────────────────┼────────────────────┐
       │                    │                    │
       ▼                    ▼                    ▼
 ┌─────────────┐    ┌─────────────┐      ┌─────────────┐
 │ Lab/User 1  │    │ Lab/User 2  │      │ Lab/User N  │
 │ Containers  │    │ Containers  │      │ Containers  │
 └─────────────┘    └─────────────┘      └─────────────┘
                            ▲
                            │
                            │ Routed WireGuard Access
                            │
                 ┌──────────┴───────────┐
                 │ VPN Lab Router       │
                 │ OverlayVPN Bridge    │
                 └──────────┬───────────┘
                            │
                     OverlayVPN (API)
                            │
                            ▼
                    ┌─────────────────┐
                    │ Participant VPN │
                    │ Clients         │
                    └─────────────────┘
```

## First Run

Create the Docker network manually to ensure the subnet matches your VPN routing rules:

```bash
sudo docker network create --subnet=172.30.0.0/16 cyberrange_labs
```

Create local environment values:

```bash
cp .env.example .env
```

Edit `.env` and set values for your deployment:

```env
# Security
CR_SECRET_KEY=super-secret-jwt-key
CR_FLAG_SECRET=my-super-secret-flag-key
ADMIN_PASSWORD=strong-admin-pass

# Registration (Brevo SMTP)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your_brevo_email
SMTP_PASS=your_brevo_password
SMTP_FROM=noreply@yourdomain.com

# OverlayVPN Integration
VPN_V2_URL=https://overlayvpn.me
VPN_V2_SERVICE_EMAIL=vpn-service-account
VPN_V2_SERVICE_PASS=vpn-service-password
VPN_V2_NETWORK_ID=your-vpn-network-id
```

Start the full stack:

```bash
docker compose up -d --build
```

Access the platform at the domain configured in your NGINX setup.

## Flag Injection into Challenge Containers

To ensure every participant receives a unique flag, the backend orchestrator injects a **per-user flag** into each challenge container during deployment. When a challenge container is created, the backend sets the `FLAG` environment variable using the Docker API.

This is equivalent to running the container with:

```bash
docker run -e FLAG=<user_specific_flag> <challenge_image>
```

Internally, the orchestrator includes:

```javascript
Env: ['FLAG=<user_specific_flag>']
```

in the Docker container creation request.

## Security Notes

- Keep backend off `cyberrange_labs`.
- Keep challenge containers without host mounts or privileged mode.
- Treat the backend as trusted because it can ask Docker to create and remove lab containers through the proxy.