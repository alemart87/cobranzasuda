from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, ConfigDict


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=2, max_length=255)
    role: str = Field(default="analyst", pattern="^(analyst|client)$")
    # Solo aplica a clientes; null = acceso total
    allowed_modules: Optional[List[str]] = None
    # Módulos restringidos habilitados (analistas). Lista de slugs.
    granted_modules: Optional[List[str]] = None
    can_use_agent: bool = False


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=8)
    photo_url: Optional[str] = None
    allowed_modules: Optional[List[str]] = None
    granted_modules: Optional[List[str]] = None
    can_use_agent: Optional[bool] = None


class PasswordReset(BaseModel):
    new_password: str = Field(min_length=8)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: str
    role: str
    is_active: bool
    photo_url: Optional[str] = None
    allowed_modules: Optional[List[str]] = None
    granted_modules: Optional[List[str]] = None
    can_use_agent: bool = False
    created_at: datetime
    last_login_at: Optional[datetime] = None
