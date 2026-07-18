"""Auth endpoints."""
from __future__ import annotations

import hashlib
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import settings
from ...core.database import get_db
from ...core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from ...models.user import User
from ...schemas.auth import LoginRequest, TokenPair, TokenRefresh
from ...services.audit_service import record_action
from ..deps import client_ip, get_current_user, CurrentUser


router = APIRouter(prefix="/auth", tags=["auth"])

SUPERADMIN_SELF_MSG = (
    "El superadmin gestiona sus credenciales y perfil desde la configuración del "
    "servidor (.env). No se editan desde la aplicación."
)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class ProfileUpdate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)


async def _current_db_user(user: CurrentUser, db: AsyncSession) -> User:
    """Devuelve el User (DB) del usuario autenticado, o 400 si es superadmin."""
    if user.role == "superadmin" or user.id == "superadmin":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, SUPERADMIN_SELF_MSG)
    target = await db.get(User, user.id)
    if not target or not target.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario inválido o inactivo")
    return target


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
        "granted_modules": user.granted_modules,
        "can_upload": user.can_upload,
        "can_manage_publish": user.can_manage_publish,
        "can_use_agent": user.is_superadmin or user.can_use_agent,
        "can_view_facturacion": user.has_restricted_module("televentas_claro"),
        "can_view_logistica": user.has_restricted_module("logistica"),
        # El superadmin no puede autoeditar perfil/contraseña (vive en .env).
        "can_edit_profile": user.role != "superadmin",
    }


@router.patch("/me")
async def update_my_profile(
    payload: ProfileUpdate,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    target = await _current_db_user(user, db)
    target.full_name = payload.full_name.strip()
    await db.commit()
    await db.refresh(target)
    await record_action(
        db, user_id=user.id, action="update_own_profile", resource_type="user",
        resource_id=target.id, ip=client_ip(request),
    )
    return {
        "id": target.id, "email": target.email, "full_name": target.full_name,
        "role": target.role, "photo_url": target.photo_url,
        "allowed_modules": target.allowed_modules,
    }


@router.post("/change-password")
async def change_my_password(
    payload: ChangePasswordRequest,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    target = await _current_db_user(user, db)
    if not verify_password(payload.current_password, target.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La contraseña actual es incorrecta")
    if verify_password(payload.new_password, target.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La nueva contraseña debe ser distinta de la actual")
    target.hashed_password = hash_password(payload.new_password)
    await db.commit()
    await record_action(
        db, user_id=user.id, action="change_own_password", resource_type="user",
        resource_id=target.id, ip=client_ip(request),
    )
    return {"status": "ok"}


@router.post("/me/photo")
async def upload_my_photo(
    request: Request,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    target = await _current_db_user(user, db)
    if file.content_type not in ("image/png", "image/jpeg", "image/webp"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Solo PNG, JPEG o WEBP")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Máximo 5 MB")

    ext = (file.filename or "").split(".")[-1].lower() or "png"
    photos_dir = settings.upload_path / "photos"
    photos_dir.mkdir(parents=True, exist_ok=True)
    sha = hashlib.sha256(content).hexdigest()[:16]
    fname = f"{target.id}_{sha}.{ext}"
    (photos_dir / fname).write_bytes(content)

    target.photo_url = f"/api/v1/users/{target.id}/photo/{fname}"
    await db.commit()
    await db.refresh(target)
    await record_action(
        db, user_id=user.id, action="upload_own_photo", resource_type="user",
        resource_id=target.id, ip=client_ip(request),
    )
    return {
        "id": target.id, "email": target.email, "full_name": target.full_name,
        "role": target.role, "photo_url": target.photo_url,
        "allowed_modules": target.allowed_modules,
    }
