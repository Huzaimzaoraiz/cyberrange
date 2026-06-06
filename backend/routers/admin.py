from fastapi import APIRouter, HTTPException
from models import (
    AdminCreateUserRequest,
    ChallengeCreateRequest,
    ChallengeUpdateRequest,
    FlagSubmitRequest,
)
from deps import CurrentUser, AdminUser
from auth_fuc import hash_password
import database
import orchestrator
import flag_engine

router = APIRouter(prefix="/api", tags=["admin"])


# ---- flag submission (user) ----

@router.post("/submit_flag")
async def submit_flag(req: FlagSubmitRequest, user: CurrentUser):
    challenge = database.get_challenge(req.challenge_id)
    if not challenge:
        raise HTTPException(404, "challenge not found")

    submitted_flag = req.flag.strip()
    if not submitted_flag:
        raise HTTPException(400, "flag cannot be empty")

    if database.has_user_used_flag(user["id"], submitted_flag):
        return {
            "correct": False,
            "message": "you already used this flag before (duplicate submissions do not earn points)",
        }

    if not flag_engine.validate_flag(user["id"], req.challenge_id, submitted_flag):
        other_flag_owner_id = None
        for candidate_user_id in database.get_all_user_ids():
            if int(candidate_user_id) == int(user["id"]):
                continue
            if flag_engine.validate_flag(candidate_user_id, req.challenge_id, submitted_flag):
                other_flag_owner_id = candidate_user_id
                break

        database.save_attack_submission(
            user_id=user["id"],
            challenge_id=req.challenge_id,
            flag_submitted=submitted_flag,
            correct=False,
            target_user_id=other_flag_owner_id,
        )

        if other_flag_owner_id is not None:
            return {
                "correct": False,
                "message": "this flag belongs to another player; submit only your own flag",
            }

        return {"correct": False, "message": "wrong flag, try again"}

    points = int(challenge.get("points") or 0)
    database.save_attack_submission(
        user_id=user["id"],
        challenge_id=req.challenge_id,
        flag_submitted=submitted_flag,
        correct=True,
        target_user_id=user["id"],
    )

    return {
        "correct": True,
        "message": f"correct flag submitted! +{points} points applied on live scoreboard",
    }


@router.get("/scoreboard")
async def get_scoreboard(user: CurrentUser):
    return {"scoreboard": database.get_scoreboard()}


@router.get("/scoreboard/portal")
async def get_scoreboard_portal(user: CurrentUser):
    return {
        "scoreboard": database.get_scoreboard(),
        "portal": database.get_scoreboard_with_ips(show_ips=False),
    }


# ---- admin: challenge management ----

@router.get("/admin/challenges")
async def admin_list_challenges(user: AdminUser):
    return {"challenges": database.get_all_challenges()}


@router.post("/admin/challenges")
async def admin_create_challenge(req: ChallengeCreateRequest, user: AdminUser):
    if database.get_challenge(req.id):
        raise HTTPException(400, "challenge id already exists")
    database.create_challenge(
        req.id, req.name, req.description, req.difficulty,
        req.category, req.points, req.docker_image, req.internal_port,
    )
    return {"message": "challenge created", "id": req.id}


@router.put("/admin/challenges/{challenge_id}")
async def admin_update_challenge(challenge_id: str, req: ChallengeUpdateRequest, user: AdminUser):
    if not database.get_challenge(challenge_id):
        raise HTTPException(404, "challenge not found")
    database.update_challenge(
        challenge_id, req.name, req.description, req.difficulty,
        req.category, req.points, req.docker_image, req.internal_port,
    )
    return {"message": "challenge updated"}


@router.delete("/admin/challenges/{challenge_id}")
async def admin_delete_challenge(challenge_id: str, user: AdminUser):
    if not database.get_challenge(challenge_id):
        raise HTTPException(404, "challenge not found")
    database.delete_challenge(challenge_id)
    return {"message": "challenge deleted"}


# ---- admin: instance management ----

@router.get("/admin/instances")
async def admin_list_instances(user: AdminUser):
    return {"instances": database.get_all_running_instances()}


@router.post("/admin/instances/{instance_id}/kill")
async def admin_kill_instance(instance_id: int, user: AdminUser):
    return orchestrator.destroy_lab_by_instance_id(instance_id)


# ---- admin: user management ----

@router.get("/admin/users")
async def admin_list_users(user: AdminUser):
    return {"users": database.get_all_users()}


@router.post("/admin/users")
async def admin_create_user(req: AdminCreateUserRequest, user: AdminUser):
    username = req.username.strip()
    if len(username) < 3:
        raise HTTPException(400, "username must be at least 3 characters")
    if len(username) > 32:
        raise HTTPException(400, "username must be at most 32 characters")
    if not username.replace("_", "").replace("-", "").isalnum():
        raise HTTPException(400, "username can only use letters, numbers, '_' and '-'")

    if len(req.password) < 8:
        raise HTTPException(400, "password must be at least 8 characters")

    role = req.role.strip().lower()
    if role not in {"user", "admin"}:
        raise HTTPException(400, "role must be either 'user' or 'admin'")

    password_hash = hash_password(req.password)
    user_id = database.create_user(username, password_hash, role=role)
    if user_id is None:
        raise HTTPException(400, "username already taken")

    return {
        "message": "user created",
        "user": {"id": user_id, "username": username, "role": role},
    }


@router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: int, user: AdminUser):
    target_user = database.get_user_by_id(user_id)
    if not target_user:
        raise HTTPException(404, "user not found")

    if int(user_id) == int(user["id"]):
        raise HTTPException(400, "you cannot delete your own account")

    if target_user["role"] == "admin" and database.count_admin_users() <= 1:
        raise HTTPException(400, "cannot delete the last admin account")

    running_instances = database.get_running_instances_by_user(user_id)
    for instance in running_instances:
        result = orchestrator.destroy_lab_by_instance_id(instance["id"])
        if isinstance(result, dict) and result.get("error"):
            raise HTTPException(400, f"failed to stop user labs: {result['error']}")

    database.delete_user_and_related_data(user_id)
    return {"message": "user removed"}
