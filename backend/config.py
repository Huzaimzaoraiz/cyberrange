# config.py
# All the settings for our simplified cyber range
import os

def _load_env():
    # Check .env in current, backend, or parent directory
    for path in [".env", "backend/.env", "../.env"]:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#"):
                            continue
                        parts = line.split("=", 1)
                        if len(parts) == 2:
                            key = parts[0].strip()
                            val = parts[1].strip().strip('"').strip("'")
                            if key not in os.environ:
                                os.environ[key] = val
                break
            except Exception:
                pass

_load_env()

SECRET_KEY = os.environ.get("CR_SECRET_KEY", "change-me-in-production-please")
FLAG_SECRET = os.environ.get("CR_FLAG_SECRET", "my-super-secret-flag-key")

MONGO_URI = os.environ.get("CR_MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.environ.get("CR_MONGO_DB", "cyberrange")

ADMIN_ID = os.environ.get("ADMIN_ID") or os.environ.get("ADMIN_USERNAME") or "admin"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or os.environ.get("ADMIN_PASS") or "ChangeMe123!"

# how long a login token lasts (in s)
TOKEN_EXPIRY_SECONDS = 24 * 60 * 60  # 24 hours

# how long a lab can run before auto-cleanup (in s)
LAB_MAX_AGE_SECONDS = 2 * 60 * 60  # 2 hours

# container resource limits
CONTAINER_MEMORY_LIMIT = "256m"
CONTAINER_CPU_PERIOD = 100000
CONTAINER_CPU_QUOTA = 50000  # 50% of one core

# Docker lab network
DOCKER_NETWORK_NAME = os.environ.get("CR_DOCKER_NETWORK_NAME", "cyberrange_labs")
LAB_SUBNET = os.environ.get("CR_LAB_SUBNET", "172.30.0.0/16")

class _Settings:
    secret_key = SECRET_KEY
    flag_secret = FLAG_SECRET
    mongo_uri = MONGO_URI
    mongo_db = MONGO_DB
    admin_id = ADMIN_ID
    admin_password = ADMIN_PASSWORD
    token_expiry_seconds = TOKEN_EXPIRY_SECONDS
    lab_max_age_seconds = LAB_MAX_AGE_SECONDS
    container_memory_limit = CONTAINER_MEMORY_LIMIT
    container_cpu_period = CONTAINER_CPU_PERIOD
    container_cpu_quota = CONTAINER_CPU_QUOTA
    docker_network_name = DOCKER_NETWORK_NAME
    lab_subnet = LAB_SUBNET
    cors_origins = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000"
    ]

settings = _Settings()
