from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_email: str
    user_role: str
    user_name: str


class TokenRefresh(BaseModel):
    refresh_token: str
