# auth.py
# Simple token-based authentication
# No JWT library - just HMAC + base64

import hashlib
import hmac
import base64
import time
import bcrypt
from config import settings


def hash_password(password):
    """hash a password using bcrypt"""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def check_password(password, password_hash):
    """check if a password matches its hash"""
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_token(user_id):
    """
    create a login token for a user

    token format: base64( user_id : timestamp : signature )
    signature = HMAC-SHA256( secret, user_id + timestamp )
    """
    timestamp = str(int(time.time()))
    user_id_str = str(user_id)

    # create the signature
    message = user_id_str + ":" + timestamp
    signature = hmac.new(
        settings.secret_key.encode(),
        message.encode(),
        hashlib.sha256
    ).hexdigest()

    # combine everything and encode
    token_data = user_id_str + ":" + timestamp + ":" + signature
    token = base64.b64encode(token_data.encode()).decode()
    return token


def verify_token(token):
    """
    verify a login token and return the user_id
    returns None if token is invalid or expired
    """
    try:
        # decode the token
        token_data = base64.b64decode(token.encode()).decode()
        parts = token_data.split(":")

        if len(parts) != 3:
            return None

        user_id_str = parts[0]
        timestamp = parts[1]
        signature = parts[2]

        # check if token is expired
        token_time = int(timestamp)
        now = int(time.time())
        if now - token_time > settings.token_expiry_seconds:
            return None

        # verify the signature
        message = user_id_str + ":" + timestamp
        expected_signature = hmac.new(
            settings.secret_key.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(signature, expected_signature):
            return None

        return int(user_id_str)

    except Exception:
        return None
