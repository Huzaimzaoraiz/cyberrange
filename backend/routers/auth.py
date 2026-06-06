from fastapi import APIRouter, HTTPException, Response
from models import LoginRequest
from deps import CurrentUser
from auth_fuc import check_password, create_token
from config import settings
import database

router = APIRouter(prefix="/api", tags=["auth"])

@router.post("/login")
async def login(req: LoginRequest, response: Response):
    user = database.get_user_by_username(req.username)
    if not user or not check_password(req.password, user["password_hash"]):
        raise HTTPException(401, "wrong username or password")

    token = create_token(user["id"])
    response.set_cookie(
        key="cyberrange_auth",
        value=token,
        httponly=True,
        max_age=settings.token_expiry_seconds,
        samesite="lax",
        secure=False  # Change to True if running behind HTTPS
    )
    return {
        "user_id": user["id"],
        "username": user["username"],
        "role": user["role"],
    }

@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("cyberrange_auth")
    return {"message": "logged out"}

@router.get("/me")
async def get_me(user: CurrentUser):
    return {"user_id": user["id"], "username": user["username"], "role": user["role"]}