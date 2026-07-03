import hmac
import hashlib
from config import settings


def generate_flag(user_id, challenge_id):
    message = str(user_id) + ":" + str(challenge_id)
    h = hmac.new(
        settings.flag_secret.encode(),
        message.encode(),
        hashlib.sha256
    ).hexdigest()

    return "flag{" + h[:8] + "}"


def validate_flag(user_id, challenge_id, submitted_flag):

    correct_flag = generate_flag(user_id, challenge_id)
    return submitted_flag.strip() == correct_flag
