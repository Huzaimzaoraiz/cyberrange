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
    db.challenges.create_index("id", unique=True)
    db.instances.create_index([("user_id", 1), ("challenge_id", 1), ("status", 1)])
    db.submissions.create_index([("user_id", 1), ("challenge_id", 1), ("correct", 1)])

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
    for inst in instances:
        user = get_user_by_id(inst["user_id"])
        challenge = get_challenge(inst["challenge_id"])
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
    db.instances.insert_one({
        "id": inst_id,
        "user_id": int(user_id),
        "challenge_id": challenge_id,
        "instance_number": int(instance_number),
        "status": "running",
        "container_ids": container_ids,
        "network_id": network_id,
        "lab_subnet": lab_subnet,
        "target_ip": target_ip,
        "created_at": datetime.datetime.utcnow()
    })

def update_instance_status(instance_id, status):
    """change the status of an instance (running / destroying / destroyed)"""
    db.instances.update_one({"id": int(instance_id)}, {"$set": {"status": status}})

def get_instance_by_id(instance_id):
    inst = db.instances.find_one({"id": int(instance_id)}, {"_id": 0})
    return dict(inst) if inst else None

def get_old_running_instances(max_age_seconds):
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(seconds=max_age_seconds)
    instances = db.instances.find({"status": "running", "created_at": {"$lt": cutoff}}, {"_id": 0})
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
    return db.submissions.count_documents({"user_id": int(user_id), "challenge_id": challenge_id, "correct": 1}) > 0

def has_user_used_flag(user_id, flag_submitted):
    """Prevent a user from scoring repeatedly with the same accepted flag."""
    return db.submissions.count_documents({"user_id": int(user_id), "flag_submitted": flag_submitted, "correct": 1}) > 0

def get_all_user_ids():
    rows = db.users.find({}, {"id": 1})
    return [r["id"] for r in rows]

def get_scoreboard():
    """Get scoreboard points from correct submissions only."""
    users = get_all_users()
    scoreboard = []
    for u in users:
        u_id = u["id"]
        correct_subs = list(db.submissions.find({"user_id": u_id, "correct": 1}))
        score = 0
        solves = 0
        for sub in correct_subs:
            ch = get_challenge(sub["challenge_id"])
            if ch:
                score += ch.get("points", 100)
                solves += 1

        scoreboard.append({
            "id": u_id,
            "username": u["username"],
            "score": score,
            "attacker_points": score,
            "net_score": score,
            "total_points": score,
            "solves": solves,
            "successful_attacks": solves
        })
    scoreboard.sort(key=lambda x: (-x["net_score"], x["username"]))
    return scoreboard

def get_scoreboard_with_ips(show_ips=False):
    """build portal rows with live score and optional target IP disclosure"""
    scores = get_scoreboard()
    scores_by_user_id = {int(r["id"]): r for r in scores}
    
    users = get_all_users()
    portal_rows = []
    for u in users:
        u_id = u["id"]
        score_row = scores_by_user_id.get(u_id, {})
        # Find running instance
        inst = db.instances.find_one({"user_id": u_id, "status": "running"})
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
    result = []
    for inst in instances:
        if inst.get("target_ip"):
            row = {"target_ip": inst["target_ip"], "challenge_id": inst["challenge_id"]}
            if include_usernames:
                user = get_user_by_id(inst["user_id"])
                row["username"] = user["username"] if user else "deleted_user"
            result.append(row)
    return result
