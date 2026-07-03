# orchestrator.py
# Manages Docker containers for simplified-cyberrange using one private lab network

import datetime
import docker
from docker.errors import NotFound
from docker.types import IPAMConfig, IPAMPool
import database
import flag_engine
import config

client = None

def get_docker_client():
    """Connect to Docker only when a lab operation needs it."""
    global client
    if client is None:
        client = docker.from_env()
    try:
        client.ping()
    except Exception as e:
        client = None
        raise RuntimeError(
            "Docker is not reachable. Open Docker Desktop on your Mac and wait until it is running, then try again."
        ) from e
    return client

def get_lab_network():
    """Create or return the shared Docker network for all challenge containers."""
    docker_client = get_docker_client()
    network_name = config.settings.docker_network_name
    try:
        return docker_client.networks.get(network_name)
    except NotFound:
        ipam_pool = IPAMPool(subnet=config.settings.lab_subnet)
        ipam_config = IPAMConfig(pool_configs=[ipam_pool])
        return docker_client.networks.create(
            network_name,
            driver="bridge",
            ipam=ipam_config,
            check_duplicate=True,
        )

def get_container_ip(container, network_name):
    container.reload()
    networks = container.attrs.get("NetworkSettings", {}).get("Networks", {})
    return networks.get(network_name, {}).get("IPAddress")

def instance_number_from_ip(ip_address):
    if not ip_address:
        return 0
    parts = ip_address.split(".")
    return (int(parts[-2]) * 256) + int(parts[-1])

def _remove_stale_container(name):
    """Remove a leftover container by name if it exists."""
    try:
        docker_client = get_docker_client()
        c = docker_client.containers.get(name)
        c.stop(timeout=5)
        c.remove(force=True)
        print("removed stale container: " + name)
    except NotFound:
        pass
    except Exception as e:
        print("warning: could not remove stale container " + name + ": " + str(e))

def cleanup_stale_resources():
    """
    Run at startup: mark database instances as 'destroyed' if their
    corresponding Docker containers are not running.
    """
    try:
        docker_client = get_docker_client()
    except RuntimeError as e:
        print("startup cleanup skipped: " + str(e))
        return

    for inst in database.get_all_running_instances():
        alive = False
        for cid in inst.get("container_ids") or []:
            try:
                c = docker_client.containers.get(cid)
                if c.status == "running":
                    alive = True
            except NotFound:
                pass
        if not alive:
            database.update_instance_status(inst["id"], "destroyed")
            print("startup cleanup: marked instance " + str(inst["id"]) + " as destroyed (containers gone)")

def create_lab(user_id, challenge_id):
    # Check for existing running lab
    existing = database.get_running_instance(user_id, challenge_id)
    if existing:
        return {
            "error": "you already have a running lab for this challenge",
            "instance": existing
        }

    # Fetch challenge configuration
    challenge = database.get_challenge(challenge_id)
    if not challenge:
        return {"error": "challenge not found"}

    # Generate user/challenge specific flag
    flag = flag_engine.generate_flag(user_id, challenge_id)
    container_name = f"lab_u{user_id}_{challenge_id}"

    # Remove any duplicate containers
    _remove_stale_container(container_name)

    try:
        docker_client = get_docker_client()
        network = get_lab_network()
        internal_port = challenge.get("internal_port", 80)
        container = docker_client.containers.run(
            image=challenge["docker_image"],
            name=container_name,
            detach=True,
            environment={
                "FLAG": flag,
            },
            network=network.name,
            mem_limit=config.CONTAINER_MEMORY_LIMIT,
            cpu_period=config.CONTAINER_CPU_PERIOD,
            cpu_quota=config.CONTAINER_CPU_QUOTA,
            read_only=False,
            privileged=False,
            security_opt=["no-new-privileges"],
        )
        
        container_ip = get_container_ip(container, network.name)
        if not container_ip:
            raise RuntimeError("container started but did not receive an IP on " + network.name)
        target_ip = container_ip if int(internal_port) == 80 else f"{container_ip}:{internal_port}"
        instance_number = instance_number_from_ip(container_ip)
        print(f"started container: {container.name} on {network.name} at {target_ip}")

    except Exception as e:
        return {"error": "failed to start container: " + str(e)}

    # Save to database
    instance = database.create_instance(
        user_id=user_id,
        challenge_id=challenge_id,
        instance_number=instance_number,
        container_ids=[container.id],
        network_id=config.settings.docker_network_name,
        lab_subnet=config.settings.lab_subnet,
        target_ip=target_ip,
    )

    return {
        "success": True,
        "instance_number": instance_number,
        "lab_subnet": config.settings.lab_subnet,
        "target_ip": target_ip,
        "containers": [target_ip],
        "expires_at": instance.get("expires_at") if instance else None,
    }

def destroy_lab(user_id, challenge_id):
    instance = database.get_running_instance(user_id, challenge_id)
    if not instance:
        return {"error": "no running lab found for this challenge"}

    database.update_instance_status(instance["id"], "destroying")

    try:
        docker_client = get_docker_client()
    except RuntimeError as e:
        database.update_instance_status(instance["id"], "running")
        return {"error": str(e)}

    for container_id in instance.get("container_ids") or []:
        try:
            container = docker_client.containers.get(container_id)
            container.stop(timeout=5)
            container.remove(force=True)
            print("removed container: " + container_id[:12])
        except Exception as e:
            print("warning: could not remove container " + container_id[:12] + ": " + str(e))

    database.update_instance_status(instance["id"], "destroyed")
    return {"success": True}

def destroy_lab_by_instance_id(instance_id):
    instance = database.get_instance_by_id(instance_id)
    if not instance:
        return {"error": "instance not found"}

    if instance["status"] != "running":
        return {"error": "instance is not running"}

    database.update_instance_status(instance["id"], "destroying")

    try:
        docker_client = get_docker_client()
    except RuntimeError as e:
        database.update_instance_status(instance["id"], "running")
        return {"error": str(e)}

    for container_id in instance.get("container_ids") or []:
        try:
            container = docker_client.containers.get(container_id)
            container.stop(timeout=5)
            container.remove(force=True)
        except Exception as e:
            print("warning: " + str(e))

    database.update_instance_status(instance["id"], "destroyed")
    return {"success": True}

def get_lab_status(user_id, challenge_id):
    instance = database.get_running_instance(user_id, challenge_id)
    if not instance:
        return {"running": False}

    expires_at = instance.get("expires_at")
    now = datetime.datetime.utcnow()
    if expires_at and expires_at <= now:
        result = destroy_lab(user_id, challenge_id)
        if result.get("success"):
            return {"running": False, "expired": True}

    all_running = True
    try:
        docker_client = get_docker_client()
    except RuntimeError:
        all_running = False
        docker_client = None

    if docker_client:
        for container_id in instance.get("container_ids") or []:
            try:
                container = docker_client.containers.get(container_id)
                if container.status != "running":
                    all_running = False
            except Exception:
                all_running = False

    remaining_seconds = None
    if expires_at:
        remaining_seconds = max(0, int((expires_at - now).total_seconds()))

    return {
        "running": True,
        "all_containers_healthy": all_running,
        "instance_id": instance["id"],
        "lab_subnet": instance.get("lab_subnet") or config.settings.lab_subnet,
        "target_ip": instance.get("target_ip"),
        "instance_number": instance["instance_number"],
        "created_at": instance["created_at"],
        "expires_at": expires_at,
        "remaining_seconds": remaining_seconds,
    }
