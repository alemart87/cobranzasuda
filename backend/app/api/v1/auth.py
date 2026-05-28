"""Auth endpoints."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import settings
from ...core.database import get_db
from ...core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from ...models.user import User
from ...schemas.auth import LoginRequest, TokenPair, TokenRefresh
from ...services.audit_service import record_action
from ..deps import client_ip, get_current_user, CurrentUser


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenPair)
async def login(
    payload: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenPair:
    email = payload.email.lower().strip()

    # Caso 1: superadmin desde .env
    if email == settings.superadmin_email.lower().strip():
        # Aceptar password en plano (SUPERADMIN_PASSWORD) o hash (SUPERADMIN_PASSWORD_HASH)
        password_ok = False
        if settings.superadmin_password:
            # Comparación constante para evitar timing attacks
            import secrets
            password_ok = secrets.compare_digest(payload.password, settings.superadmin_password)
        elif settings.superadmin_password_hash:
            password_ok = verify_password(payload.password, settings.superadmin_password_hash)

        if not password_ok:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Credenciales inválidas")
        await record_action(
            db,
            user_id="superadmin",
            action="login",
            resource_type="auth",
            ip=client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
        return TokenPair(
            access_token=create_access_token(email, "superadmin"),
            refresh_token=create_refresh_token(email),
            user_email=email,
            user_role="superadmin",
            user_name=settings.superadmin_name,
        )

    # Caso 2: analyst o client en DB
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user or not user.is_active or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Credenciales inválidas")

    # Marca último login (para usage analytics)
    user.last_login_at = datetime.utcnow()
    await db.commit()

    await record_action(
        db,
        user_id=user.id,
        action="login",
        resource_type="auth",
        ip=client_ip(request),
        user_agent=request.headers.get("user-agent"),
        extra={"role": user.role},
    )
    return TokenPair(
        access_token=create_access_token(user.email, user.role),
        refresh_token=create_refresh_token(user.email),
        user_email=user.email,
        user_role=user.role,
        user_name=user.full_name,
        user_photo_url=user.photo_url,
        user_allowed_modules=user.allowed_modules,
    )


@router.post("/refresh", response_model=TokenPair)
async def refresh_token(
    payload: TokenRefresh,
    db: AsyncSession = Depends(get_db),
) -> TokenPair:
    try:
        data = decode_token(payload.refresh_token)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc

    if data.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token no es refresh")

    email = data.get("sub")

    if email == settings.superadmin_email:
        return TokenPair(
            access_token=create_access_token(email, "superadmin"),
            refresh_token=create_refresh_token(email),
            user_email=email,
            user_role="superadmin",
            user_name=settings.superadmin_name,
        )

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario inválido")

    return TokenPair(
        access_token=create_access_token(user.email, user.role),
        refresh_token=create_refresh_token(user.email),
        user_email=user.email,
        user_role=user.role,
        user_name=user.full_name,
        user_photo_url=user.photo_url,
        user_allowed_modules=user.allowed_modules,
    )


@router.get("/me")
async def me(user: CurrentUser = Depends(get_current_user)) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "photo_url": user.photo_url,
        "allowed_modules": user.allowed_modules,
        "can_upload": user.can_upload,
        "can_manage_publish": user.can_manage_publish,
    }
