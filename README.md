#  CyberRange

> A modern, Docker-native platform for hosting isolated cybersecurity labs, CTF competitions, and hands-on training environments.

   <p align="left">
  <img src="https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black">
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white">
  <img src="https://img.shields.io/badge/MongoDB-47A248?style=flat-square&logo=mongodb&logoColor=white">
  <img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white">
  <img src="https://img.shields.io/badge/NetBird-000000?style=flat-square">
</p>

CyberRange is built with **React**, **Node.js**, **MongoDB**, and **Docker** to dynamically provision challenge environments for each participant. Challenge containers are deployed on isolated Docker networks and securely managed through the Docker API, while **NetBird VPN** provides private access to lab environments without exposing them to the public Internet.

## Features

- **Docker-based Labs** — Isolated challenge environments provisioned on demand.
- **React Frontend** — Modern and responsive user interface.
- **Node.js Backend** — REST APIs for authentication and challenge orchestration.
- **MongoDB Storage** — Persistent storage for users, challenges, and scores.
- **Docker Socket Proxy** — Secure access to the Docker Engine.
- **NetBird VPN** — Private access to lab environments over VPN.
- **Dynamic Provisioning** — Automatic deployment and cleanup of challenge containers.
- **Multi-user Isolation** — Dedicated lab instances for every participant.
- **Scalable Architecture** — Designed for CTFs, workshops, and cybersecurity training.
## Services

- `nginx`: single web entrypoint for the VPN users
- `frontend`: built React app served by Nginx
- `backend`: FastAPI API server
- `mongodb`: private database container
- `docker-socket-proxy`: limited Docker API proxy for the backend
- `netbird-client`: VPN node for web access
- `netbird-lab-router`: VPN route into the challenge subnet

The backend does not join the challenge network. It talks to Docker only through `docker-socket-proxy`.

## System Architecture

The CyberRange platform uses a containerized microservices architecture that separates the web application, control plane, and isolated challenge infrastructure. **NGINX** serves as a reverse proxy for the frontend and backend, while the backend uses **MongoDB** for persistent storage and communicates with the Docker Engine through a **Docker Socket Proxy** to securely provision and manage challenge environments.

Each challenge runs in one or more Docker containers on the isolated `cyberrange_labs` network. Participants connect through **NetBird VPN**, where the **NetBird Lab Router** advertises and routes traffic to the lab subnet, providing secure access to assigned challenge containers without exposing the lab network to the public Internet.
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
                 │ React/Vue  │ │ API Server │
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
                            │ Routed VPN Access
                            │
                 ┌──────────┴───────────┐
                 │ NetBird Lab Router   │
                 │ VPN Gateway          │
                 └──────────┬───────────┘
                            │
                     NetBird Overlay
                            │
                            ▼
                    ┌─────────────────┐
                    │ Participant VPN │
                    │ Clients         │
                    └─────────────────┘
```

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
http://YOUR_NETBIRD_WEB_IP:80
```

##  Flag Injection into Challenge Containers

To ensure every participant receives a unique flag, the backend orchestrator injects a **per-user flag** into each challenge container during deployment. When a challenge container is created, the backend sets the `FLAG` environment variable using the Docker API.

This is equivalent to running the container with:

```bash
docker run -e FLAG=<user_specific_flag> <challenge_image>
```

Internally, the orchestrator includes:

```javascript
Env: ['FLAG=<user_specific_flag>']
```

in the Docker container creation request (see `orchestrator.js`).


## Security Notes

- Keep backend off `cyberrange_labs`.
- Keep challenge containers without host mounts or privileged mode.
- Treat the backend as trusted because it can ask Docker to create and remove lab containers through the proxy.