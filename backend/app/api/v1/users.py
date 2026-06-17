"""User management — only superadmin can manage analysts/clients."""
from __future__ import annotations

import hashlib
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import settings
from ...core.database import get_db
from ...core.modules import MODULES, filter_restricted_slugs, filter_valid_slugs
from ...core.security import hash_password
from ...models.user import User
from ...schemas.user import PasswordReset, UserCreate, UserRead, UserUpdate
from ...services.audit_service import record_action
from ..deps import CurrentUser, client_ip, require_superadmin


router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserRead])
async def list_users(
    user: CurrentUser = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
) -> list[User]:
    rows = await db.execute(select(User).order_by(User.created_at.desc()))
    return rows.scalars().all()


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    request: Request,
    user: CurrentUser = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
) -> User:
    email = payload.email.lower().strip()

    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Email ya registrado")

    # allowed_modules: solo aplica a clientes; analistas siempre tienen acceso completo
    allowed = None
    if payload.role == "client" and payload.allowed_modules is not None:
        allowed = filter_valid_slugs(payload.allowed_modules)

    # granted_modules (módulos restringidos): solo analistas; clientes nunca.
    granted = filter_restricted_slugs(payload.granted_modules) if payload.role == "analyst" else []

    new_user = User(
        email=email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        allowed_modules=allowed,
        granted_modules=granted,
        can_use_agent=bool(payload.can_use_agent),
        created_by=user.id if user.id != "superadmin" else None,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    await record_action(
        db,
        user_id=user.id,
        action="create_user",
        resource_type="user",
        resource_id=new_user.id,
        ip=client_ip(request),
        extra={"new_user_email": email, "role": payload.role, "allowed_modules": allowed},
    )
    return new_user


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: str,
    payload: UserUpdate,
    request: Request,
    user: CurrentUser = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
) -> User:
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")

    changes = {}
    if payload.full_name is not None:
        target.full_name = payload.full_name
        changes["full_name"] = payload.full_name
    if payload.is_active is not None:
        target.is_active = payload.is_active
        changes["is_active"] = payload.is_active
    if payload.password is not None:
        target.hashed_password = hash_password(payload.password)
        changes["password_changed"] = True
    if payload.photo_url is not None:
        target.photo_url = payload.photo_url
        changes["photo_url"] = payload.photo_url
    # Distinguir "no enviado" de "enviado como null".
    # null = "acceso a todas" (queremos poder volver a este estado desde una lista).
    # [] = sin operativas, ["cobranzas", ...] = solo esas.
    if "allowed_modules" in payload.model_fields_set and target.role == "client":
        target.allowed_modules = filter_valid_slugs(payload.allowed_modules)
        changes["allowed_modules"] = target.allowed_modules
    # granted_modules (restringidos): solo aplica a analistas.
    if "granted_modules" in payload.model_fields_set and target.role == "analyst":
        target.granted_modules = filter_restricted_slugs(payload.granted_modules)
        changes["granted_modules"] = target.granted_modules
    if payload.can_use_agent is not None:
        target.can_use_agent = payload.can_use_agent
        changes["can_use_agent"] = payload.can_use_agent

    await db.commit()
    await db.refresh(target)

    await record_action(
        db,
        user_id=user.id,
        action="update_user",
        resource_type="user",
        resource_id=user_id,
        ip=client_ip(request),
        extra=changes,
    )
    return target


@router.post("/{user_id}/reset-password", response_model=UserRead)
async def reset_password(
    user_id: str,
    payload: PasswordReset,
    request: Request,
    user: CurrentUser = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
) -> User:
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")
    target.hashed_password = hash_password(payload.new_password)
    await db.commit()
    await db.refresh(target)
    await record_action(
        db,
        user_id=user.id,
        action="reset_password",
        resource_type="user",
        resource_id=user_id,
        ip=client_ip(request),
        extra={"target_email": target.email},
    )
    return target


@router.post("/{user_id}/photo", response_model=UserRead)
async def upload_user_photo(
    user_id: str,
    request: Request,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
) -> User:
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")

    if file.content_type not in ("image/png", "image/jpeg", "image/webp"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Solo PNG, JPEG o WEBP")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Máximo 5 MB")

    ext = (file.filename or "").split(".")[-1].lower() or "png"
    photos_dir = settings.upload_path / "photos"
    photos_dir.mkdir(parents=True, exist_ok=True)
    sha = hashlib.sha256(content).hexdigest()[:16]
    fname = f"{user_id}_{sha}.{ext}"
    (photos_dir / fname).write_bytes(content)

    photo_url = f"/api/v1/users/{user_id}/photo/{fname}"
    target.photo_url = photo_url
    await db.commit()
    await db.refresh(target)

    await record_action(
        db, user_id=user.id, action="upload_user_photo", resource_type="user",
        resource_id=user_id, ip=client_ip(request),
    )
    return target


@router.get("/{user_id}/photo/{fname}")
async def get_user_photo(user_id: str, fname: str):
    """Sirve la foto del usuario desde el disco persistente."""
    from fastapi.responses import FileResponse
    photos_dir = settings.upload_path / "photos"
    full = photos_dir / fname
    if not full.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Foto no encontrada")
    return FileResponse(str(full))


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    request: Request,
    user: CurrentUser = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")
    target.is_active = False
    await db.commit()
    await record_action(
        db, user_id=user.id, action="delete_user", resource_type="user",
        resource_id=user_id, ip=client_ip(request),
    )
    return {"status": "deactivated", "user_id": user_id}
