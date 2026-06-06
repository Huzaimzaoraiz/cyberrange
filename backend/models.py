from pydantic import BaseModel


class AdminCreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "user"


class LoginRequest(BaseModel):
    username: str
    password: str


class FlagSubmitRequest(BaseModel):
    challenge_id: str
    flag: str


class ChallengeCreateRequest(BaseModel):
    id: str
    name: str
    description: str = ""
    difficulty: str = "Easy"
    category: str = "General"
    points: int = 100
    docker_image: str
    internal_port: int = 80


class ChallengeUpdateRequest(BaseModel):
    name: str
    description: str = ""
    difficulty: str = "Easy"
    category: str = "General"
    points: int = 100
    docker_image: str
    internal_port: int = 80


class AdminScoringConfigRequest(BaseModel):
    positive_multiplier: float
    negative_multiplier: float
