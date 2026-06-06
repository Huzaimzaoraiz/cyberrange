# deps.py
# FastAPI dependencies for simplified-cyberrange

from typing import Annotated
from fastapi import Depends, Cookie, HTTPException
import auth_fuc as auth_module
import database

async def get_current_user(cyberrange_auth: str = Cookie(None)):
    """FastAPI dependency: extract and verify user from HttpOnly cookie."""
    if not cyberrange_auth:
        raise HTTPException(401, "Authentication required (missing session cookie)")
    user_id = auth_module.verify_token(cyberrange_auth)
    if not user_id:
        raise HTTPException(401, "Invalid or expired session token")
    user = database.get_user_by_id(user_id)
    if not user:
        raise HTTPException(401, "User not found")
    return dict(user)

async def get_admin_user(user: dict = Depends(get_current_user)):
    """FastAPI dependency: require admin role."""
    if user["role"] != "admin":
        raise HTTPException(403, "Admin access required")
    return user

CurrentUser = Annotated[dict, Depends(get_current_user)]
AdminUser = Annotated[dict, Depends(get_admin_user)]
