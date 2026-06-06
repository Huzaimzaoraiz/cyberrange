from fastapi import APIRouter
from deps import CurrentUser
import database

router = APIRouter(prefix="/api", tags=["challenges"])


@router.get("/challenges")
async def list_challenges(user: CurrentUser):
    challenges = database.get_all_challenges()
    for c in challenges:
        c["solved"] = database.has_user_solved(user["id"], c["id"])
    return {"challenges": challenges}
