import asyncio
import secrets

from fastapi import APIRouter, Cookie, HTTPException, Request, Response
from models import LoginRequest
from deps import CurrentUser
from auth_fuc import check_password, create_token, verify_token_details
from config import settings
import database

router = APIRouter(prefix="/api", tags=["auth"])

@router.post("/login")
async def login(req: LoginRequest, request: Request, response: Response):
    client_host = request.client.host if request.client else "unknown"
    retry_after = database.get_login_retry_after(req.username, client_host)
    if retry_after > 0:
        await asyncio.sleep(min(2, retry_after))
        raise HTTPException(
            429,
            f"too many login attempts, try again in {retry_after} seconds",
            headers={"Retry-After": str(retry_after)},
        )

    user = database.get_user_by_username(req.username)
    if not user or not check_password(req.password, user["password_hash"]):
        delay = database.record_login_failure(req.username, client_host)
        await asyncio.sleep(min(2, delay if delay > 0 else 1))
        if delay > 0:
            raise HTTPException(
                429,
                f"too many login attempts, try again in {delay} seconds",
                headers={"Retry-After": str(delay)},
            )
        raise HTTPException(401, "wrong username or password")

    database.clear_login_failures(req.username, client_host)
    session_id = secrets.token_urlsafe(32)
    database.set_active_session(user["id"], session_id)
    token = create_token(user["id"], session_id)
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
async def logout(response: Response, cyberrange_auth: str = Cookie(None)):
    token_details = verify_token_details(cyberrange_auth) if cyberrange_auth else None
    if token_details:
        database.clear_active_session(token_details["user_id"], token_details["session_id"])
    response.delete_cookie("cyberrange_auth")
    return {"message": "logged out"}

@router.get("/me")
async def get_me(user: CurrentUser):
    return {"user_id": user["id"], "username": user["username"], "role": user["role"]}
