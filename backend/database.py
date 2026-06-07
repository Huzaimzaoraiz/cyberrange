# database.py
# MongoDB database layer for simplified-cyberrange

import datetime
import pymongo
from pymongo import MongoClient
import config

# Connect to MongoDB
client = MongoClient(config.MONGO_URI, serverSelectionTimeoutMS=3000)
db = client[config.MONGO_DB]

def get_next_sequence_value(sequence_name):
    """Retrieve auto-incrementing sequence value for integer IDs."""
    result = db.counters.find_one_and_update(
        {"_id": sequence_name},
        {"$inc": {"sequence_value": 1}},
        upsert=True,
        return_document=pymongo.ReturnDocument.AFTER
    )
    return result["sequence_value"]

def init_db():
    """Initialize collections, create indexes and seed base platform state."""
    try:
        client.admin.command("ping")
    except Exception as e:
        raise RuntimeError(
            "MongoDB is not reachable at "
            + config.MONGO_URI
            + ". Start MongoDB on your Mac or update CR_MONGO_URI in backend/.env."
        ) from e

    db.users.create_index("username", unique=True)
    db.users.create_index("id", unique=True)
    db.challenges.create_index("id", unique=True)
    db.instances.create_index("id", unique=True)
    db.instances.create_index([("user_id", 1), ("challenge_id", 1), ("status", 1)])
    db.instances.create_index([("user_id", 1), ("status", 1)])
    db.instances.create_index([("status", 1), ("expires_at", 1)])
    db.submissions.create_index([("user_id", 1), ("challenge_id", 1), ("correct", 1)])
    db.submissions.create_index([("user_id", 1), ("flag_submitted", 1), ("correct", 1)])
    db.submissions.create_index([("correct", 1), ("user_id", 1), ("submitted_at", 1)])
    db.login_attempts.create_index("key", unique=True)
    db.login_attempts.create_index("updated_at")

    # Seed platform state defaults
    db.platform_state.update_one(
        {"_id": "score_positive_multiplier"},
        {"$setOnInsert": {"value": "1.0"}},
        upsert=True
    )
    db.platform_state.update_one(
        {"_id": "score_negative_multiplier"},
        {"$setOnInsert": {"value": "1.0"}},
        upsert=True
    )

    # Initialize/synchronize admin user from configuration settings
    import auth_fuc
    admin_username = config.settings.admin_id
    admin_password = config.settings.admin_password
    
    admin_user = db.users.find_one({"username": admin_username})
    if admin_user:
        if admin_user.get("role") != "admin" or not auth_fuc.check_password(admin_password, admin_user.get("password_hash", "")):
            db.users.update_one(
                {"username": admin_username},
                {"$set": {
                    "role": "admin",
                    "password_hash": auth_fuc.hash_password(admin_password)
                }}
            )
    else:
        admin_id = get_next_sequence_value("users")
        db.users.insert_one({
            "id": admin_id,
            "username": admin_username,
            "password_hash": auth_fuc.hash_password(admin_password),
            "role": "admin",
            "created_at": datetime.datetime.utcnow()
        })


# ---- user functions ----

def create_user(username, password_hash, role="user"):
    """add a new user to the database"""
    user_id = get_next_sequence_value("users")
    try:
        db.users.insert_one({
            "id": user_id,
            "username": username,
            "password_hash": password_hash,
            "role": role,
            "created_at": datetime.datetime.utcnow()
        })
        return user_id
    except pymongo.errors.DuplicateKeyError:
        return None

def get_user_by_username(username):
    """find a user by their username"""
    return db.users.find_one({"username": username})

def get_user_by_id(user_id):
    """find a user by their id"""
    if user_id is None:
        return None
    return db.users.find_one({"id": int(user_id)})

def get_all_users():
    """get all users (for admin panel)"""
    users = db.users.find({}, {"_id": 0, "id": 1, "username": 1, "role": 1, "created_at": 1})
    return [dict(u) for u in users]

def count_admin_users():
    return db.users.count_documents({"role": "admin"})

def get_running_instances_by_user(user_id):
    rows = db.instances.find({"user_id": int(user_id), "status": "running"}, {"id": 1})
    return [dict(r) for r in rows]

def delete_user_and_related_data(user_id):
    user_id = int(user_id)
    db.submissions.delete_many({"$or": [{"user_id": user_id}, {"target_user_id": user_id}]})
    db.instances.delete_many({"user_id": user_id})
    db.users.delete_one({"id": user_id})

def set_active_session(user_id, session_id):
    """Make this session the only valid login session for the user."""
    db.users.update_one(
        {"id": int(user_id)},
        {"$set": {
            "active_session_id": session_id,
            "active_session_started_at": datetime.datetime.utcnow(),
        }}
    )

def clear_active_session(user_id, session_id=None):
    """Clear the active session, optionally only if it matches the supplied session."""
    query = {"id": int(user_id)}
    if session_id is not None:
        query["active_session_id"] = session_id
    db.users.update_one(
        query,
        {"$unset": {"active_session_id": "", "active_session_started_at": ""}}
    )

def is_active_session(user_id, session_id):
    if not session_id:
        return False
    return db.users.find_one(
        {"id": int(user_id), "active_session_id": session_id},
        {"_id": 1},
    ) is not None

def _login_key(username, client_host):
    return (username or "").strip().lower() + "|" + (client_host or "unknown")

def get_login_retry_after(username, client_host):
    """Return remaining lockout seconds for this username/IP pair."""
    row = db.login_attempts.find_one({"key": _login_key(username, client_host)})
    if not row:
        return 0
    locked_until = row.get("locked_until")
    if not locked_until:
        return 0
    now = datetime.datetime.utcnow()
    if locked_until <= now:
        return 0
    return max(1, int((locked_until - now).total_seconds()))

def record_login_failure(username, client_host):
    """Record a failed login and return the enforced delay in seconds."""
    now = datetime.datetime.utcnow()
    window_start = now - datetime.timedelta(seconds=config.settings.login_rate_limit_window_seconds)
    key = _login_key(username, client_host)
    row = db.login_attempts.find_one({"key": key}) or {}

    if row.get("updated_at") and row["updated_at"] >= window_start:
        failures = int(row.get("failures", 0)) + 1
    else:
        failures = 1

    over_limit = max(0, failures - config.settings.login_rate_limit_max_failures)
    delay = 0
    locked_until = None
    if over_limit > 0:
        delay = min(
            config.settings.login_rate_limit_max_delay_seconds,
            config.settings.login_rate_limit_base_delay_seconds * (2 ** (over_limit - 1)),
        )
        locked_until = now + datetime.timedelta(seconds=delay)

    db.login_attempts.update_one(
        {"key": key},
        {"$set": {
            "key": key,
            "username": (username or "").strip().lower(),
            "client_host": client_host or "unknown",
            "failures": failures,
            "locked_until": locked_until,
            "updated_at": now,
        }},
        upsert=True,
    )
    return delay

def clear_login_failures(username, client_host):
    db.login_attempts.delete_one({"key": _login_key(username, client_host)})

# ---- challenge functions ----

def get_all_challenges():
    """get every challenge"""
    challenges = db.challenges.find({}, {"_id": 0})
    return [dict(c) for c in challenges]

def get_challenge(challenge_id):
    """get one challenge by id"""
    c = db.challenges.find_one({"id": challenge_id}, {"_id": 0})
    return dict(c) if c else None

def create_challenge(
    challenge_id,
    name,
    description,
    difficulty,
    category,
    points,
    docker_image,
    internal_port,
):
    """add a new challenge (admin only)"""
    db.challenges.update_one(
        {"id": challenge_id},
        {"$set": {
            "name": name,
            "description": description,
            "difficulty": difficulty,
            "category": category,
            "points": int(points),
            "docker_image": docker_image,
            "internal_port": int(internal_port)
        }},
        upsert=True
    )

def update_challenge(
    challenge_id,
    name,
    description,
    difficulty,
    category,
    points,
    docker_image,
    internal_port,
):
    """edit an existing challenge (admin only)"""
    db.challenges.update_one(
        {"id": challenge_id},
        {"$set": {
            "name": name,
            "description": description,
            "difficulty": difficulty,
            "category": category,
            "points": int(points),
            "docker_image": docker_image,
            "internal_port": int(internal_port)
        }}
    )

def delete_challenge(challenge_id):
    """remove a challenge (admin only)"""
    db.challenges.delete_one({"id": challenge_id})

# ---- instance functions ----

def get_running_instance(user_id, challenge_id):
    """check if user already has a running lab for this challenge"""
    inst = db.instances.find_one(
        {"user_id": int(user_id), "challenge_id": challenge_id, "status": "running"},
        {"_id": 0}
    )
    return dict(inst) if inst else None

def get_all_running_instances():
    """get all running instances across all users (admin)"""
    instances = list(db.instances.find({"status": "running"}, {"_id": 0}))
    user_ids = list({int(inst["user_id"]) for inst in instances})
    challenge_ids = list({inst["challenge_id"] for inst in instances})
    users = db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "username": 1})
    challenges = db.challenges.find({"id": {"$in": challenge_ids}}, {"_id": 0, "id": 1, "name": 1})
    users_by_id = {int(u["id"]): u for u in users}
    challenges_by_id = {c["id"]: c for c in challenges}

    for inst in instances:
        user = users_by_id.get(int(inst["user_id"]))
        challenge = challenges_by_id.get(inst["challenge_id"])
        inst["username"] = user["username"] if user else "deleted_user"
        inst["challenge_name"] = challenge["name"] if challenge else "deleted_challenge"
    return instances

def get_used_instance_numbers():
    """get all instance numbers currently in use"""
    rows = db.instances.find({"status": "running"}, {"instance_number": 1})
    return set(r["instance_number"] for r in rows)

def create_instance(
    user_id,
    challenge_id,
    instance_number,
    container_ids,
    network_id,
    lab_subnet,
    target_ip,
):
    """save a new running lab instance"""
    inst_id = get_next_sequence_value("instances")
    now = datetime.datetime.utcnow()
    instance = {
        "id": inst_id,
        "user_id": int(user_id),
        "challenge_id": challenge_id,
        "instance_number": int(instance_number),
        "status": "running",
        "container_ids": container_ids,
        "network_id": network_id,
        "lab_subnet": lab_subnet,
        "target_ip": target_ip,
        "created_at": now,
        "expires_at": now + datetime.timedelta(seconds=config.settings.lab_max_age_seconds),
    }
    db.instances.insert_one(instance)
    return dict(instance)

def update_instance_status(instance_id, status):
    """change the status of an instance (running / destroying / destroyed)"""
    db.instances.update_one({"id": int(instance_id)}, {"$set": {"status": status}})

def get_instance_by_id(instance_id):
    inst = db.instances.find_one({"id": int(instance_id)}, {"_id": 0})
    return dict(inst) if inst else None

def get_old_running_instances(max_age_seconds):
    now = datetime.datetime.utcnow()
    cutoff = now - datetime.timedelta(seconds=max_age_seconds)
    instances = db.instances.find(
        {
            "status": "running",
            "$or": [
                {"expires_at": {"$lte": now}},
                {"expires_at": {"$exists": False}, "created_at": {"$lt": cutoff}},
            ],
        },
        {"_id": 0},
    )
    return [dict(i) for i in instances]

# ---- submission functions ----

def save_submission(user_id, challenge_id, flag_submitted, correct):
    """record a flag submission"""
    sub_id = get_next_sequence_value("submissions")
    db.submissions.insert_one({
        "id": sub_id,
        "user_id": int(user_id),
        "challenge_id": challenge_id,
        "flag_submitted": flag_submitted,
        "correct": 1 if correct else 0,
        "target_user_id": None,
        "submitted_at": datetime.datetime.utcnow()
    })

def save_attack_submission(user_id, challenge_id, flag_submitted, correct, target_user_id=None):
    """Record a flag submission with optional flag owner metadata."""
    sub_id = get_next_sequence_value("submissions")
    db.submissions.insert_one({
        "id": sub_id,
        "user_id": int(user_id),
        "challenge_id": challenge_id,
        "flag_submitted": flag_submitted,
        "correct": 1 if correct else 0,
        "target_user_id": int(target_user_id) if target_user_id is not None else None,
        "submitted_at": datetime.datetime.utcnow()
    })

def has_user_solved(user_id, challenge_id):
    """check if user already solved this challenge"""
    return db.submissions.find_one(
        {"user_id": int(user_id), "challenge_id": challenge_id, "correct": 1},
        {"_id": 1},
    ) is not None

def has_user_used_flag(user_id, flag_submitted):
    """Prevent a user from scoring repeatedly with the same accepted flag."""
    return db.submissions.find_one(
        {"user_id": int(user_id), "flag_submitted": flag_submitted, "correct": 1},
        {"_id": 1},
    ) is not None

def get_all_user_ids():
    rows = db.users.find({"role": {"$ne": "admin"}}, {"id": 1})
    return [r["id"] for r in rows]

def get_scoreboard():
    """Get scoreboard points from correct submissions only."""
    users = list(db.users.find(
        {"role": {"$ne": "admin"}},
        {"_id": 0, "id": 1, "username": 1},
    ))
    challenge_points = {
        c["id"]: int(c.get("points", 100))
        for c in db.challenges.find({}, {"_id": 0, "id": 1, "points": 1})
    }
    rows_by_user_id = {
        int(u["id"]): {
            "id": u["id"],
            "username": u["username"],
            "score": 0,
            "attacker_points": 0,
            "net_score": 0,
            "total_points": 0,
            "solves": 0,
            "successful_attacks": 0,
            "last_solve_at": None
        }
        for u in users
    }

    if rows_by_user_id:
        correct_subs = db.submissions.find(
            {"user_id": {"$in": list(rows_by_user_id)}, "correct": 1},
            {"_id": 0, "user_id": 1, "challenge_id": 1, "submitted_at": 1},
        ).sort("submitted_at", 1)

        for sub in correct_subs:
            row = rows_by_user_id.get(int(sub["user_id"]))
            points = challenge_points.get(sub["challenge_id"])
            if not row or points is None:
                continue
            row["score"] += points
            row["attacker_points"] += points
            row["net_score"] += points
            row["total_points"] += points
            row["solves"] += 1
            row["successful_attacks"] += 1
            submitted_at = sub.get("submitted_at")
            if submitted_at:
                row["last_solve_at"] = submitted_at

    scoreboard = list(rows_by_user_id.values())
    scoreboard.sort(key=lambda x: (
        -x["net_score"],
        x["last_solve_at"] is None,
        x["last_solve_at"] or datetime.datetime.max,
        x["username"],
    ))
    return scoreboard

def get_scoreboard_with_ips(show_ips=False):
    """build portal rows with live score and optional target IP disclosure"""
    scores = get_scoreboard()
    scores_by_user_id = {int(r["id"]): r for r in scores}

    users = list(db.users.find(
        {"role": {"$ne": "admin"}},
        {"_id": 0, "id": 1, "username": 1},
    ))
    user_ids = [int(u["id"]) for u in users]
    running_instances = db.instances.find(
        {"user_id": {"$in": user_ids}, "status": "running"},
        {"_id": 0, "user_id": 1, "challenge_id": 1, "target_ip": 1},
    ).sort("created_at", 1)
    instance_by_user_id = {}
    for inst in running_instances:
        instance_by_user_id.setdefault(int(inst["user_id"]), inst)

    portal_rows = []
    for u in users:
        u_id = u["id"]
        score_row = scores_by_user_id.get(u_id, {})
        inst = instance_by_user_id.get(int(u_id))
        portal_rows.append({
            "user_id": u_id,
            "username": u["username"],
            "score": score_row.get("net_score", 0),
            "attacker_points": score_row.get("attacker_points", 0),
            "challenge_id": inst["challenge_id"] if inst else None,
            "target_ip": inst["target_ip"] if (inst and show_ips) else None
        })
    portal_rows.sort(key=lambda x: x["username"])
    return portal_rows

def get_scoring_config():
    return {"positive_multiplier": 1.0, "negative_multiplier": 1.0}

def set_scoring_config(positive_multiplier, negative_multiplier):
    pass

def get_running_machine_ips(include_usernames=False):
    instances = list(db.instances.find({"status": "running"}, {"_id": 0}))
    users_by_id = {}
    if include_usernames:
        user_ids = list({int(inst["user_id"]) for inst in instances})
        users = db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "username": 1})
        users_by_id = {int(u["id"]): u for u in users}

    result = []
    for inst in instances:
        if inst.get("target_ip"):
            row = {"target_ip": inst["target_ip"], "challenge_id": inst["challenge_id"]}
            if include_usernames:
                user = users_by_id.get(int(inst["user_id"]))
                row["username"] = user["username"] if user else "deleted_user"
            result.append(row)
    return result
