"""FastAPI dependencies for authentication and authorization.

Superadmin always lives in `.env` (NEVER in DB).
Viewer users live in the DB.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..core.database import get_db
from ..core.security import decode_token
from ..models.user import User


bearer = HTTPBearer(auto_error=False)


@dataclass
class CurrentUser:
    id: str
    email: str
    role: str
    full_name: str
    photo_url: Optional[str] = None
    # Solo aplica a clientes. None = acceso a todos los módulos. Lista = restringido.
    allowed_modules: Optional[list[str]] = None
    # Habilita el Agente de Experiencia (IA). Superadmin siempre True.
    can_use_agent: bool = False

    @property
    def is_superadmin(self) -> bool:
        return self.role == "superadmin"

    @property
    def is_analyst(self) -> bool:
        return self.role == "analyst"

    @property
    def is_client(self) -> bool:
        return self.role == "client"

    @property
    def can_upload(self) -> bool:
        return self.role in ("superadmin", "analyst")

    @property
    def can_manage_publish(self) -> bool:
        return self.role in ("superadmin", "analyst")

    def has_module(self, slug: str) -> bool:
        """Superadmin y analistas tienen acceso a todo. Cliente respeta allowed_modules."""
        if self.role in ("superadmin", "analyst"):
            return True
        if self.allowed_modules is None:
            return True  # cliente sin restricción explícita
        return slug in self.allowed_modules


async def get_current_user(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    if not creds:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Falta token de autenticación")

    try:
        payload = decode_token(creds.credentials)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc

    if payload.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token no es de tipo access")

    subject = payload.get("sub")
    role = payload.get("role")

    # Superadmin sintético (no está en DB)
    if subject == settings.superadmin_email and role == "superadmin":
        return CurrentUser(
            id="superadmin",
            email=settings.superadmin_email,
            role="superadmin",
            full_name=settings.superadmin_name,
            can_use_agent=True,
        )

    # Analyst o Client en DB
    result = await db.execute(select(User).where(User.email == subject))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario inválido o inactivo")

    return CurrentUser(
        id=user.id, email=user.email, role=user.role,
        full_name=user.full_name, photo_url=user.photo_url,
        allowed_modules=user.allowed_modules,
        can_use_agent=bool(user.can_use_agent),
    )


async def require_superadmin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not user.is_superadmin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Se requiere rol superadmin")
    return user


async def require_analyst_or_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Para acciones de carga / publicación / eliminación: superadmin o analyst."""
    if user.role not in ("superadmin", "analyst"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Requiere rol analista o superadmin")
    return user


async def require_agent_access(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Acceso al Agente de Experiencia: superadmin o usuario habilitado."""
    if not (user.is_superadmin or user.can_use_agent):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No tenés acceso al Agente de Experiencia")
    return user


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
