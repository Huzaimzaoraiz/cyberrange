from fastapi import APIRouter, HTTPException
from deps import CurrentUser
import orchestrator

router = APIRouter(prefix="/api", tags=["labs"])

def _unwrap_or_error(result):
    """Convert orchestrator-style {"error": ...} responses into HTTP errors."""
    if isinstance(result, dict) and result.get("error"):
        message = str(result["error"])
        status = 404 if "not found" in message.lower() else 400
        raise HTTPException(status, message)
    return result

@router.post("/lab/{challenge_id}/start")
async def start_lab(challenge_id: str, user: CurrentUser):
    result = _unwrap_or_error(orchestrator.create_lab(user["id"], challenge_id))
    result["message"] = "Lab started"
    return result

@router.post("/lab/{challenge_id}/stop")
async def stop_lab(challenge_id: str, user: CurrentUser):
    result = _unwrap_or_error(orchestrator.destroy_lab(user["id"], challenge_id))
    result["message"] = "Lab stopped"
    return result

@router.get("/lab/{challenge_id}/status")
async def lab_status(challenge_id: str, user: CurrentUser):
    result = orchestrator.get_lab_status(user["id"], challenge_id)
    if not result.get("running"):
        return result

    return result
