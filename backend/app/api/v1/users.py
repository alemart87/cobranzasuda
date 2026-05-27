"""User management — only superadmin can manage viewers."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.database import get_db
from ...core.security import hash_password
from ...models.user import User
from ...schemas.user import UserCreate, UserRead, UserUpdate
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

    new_user = User(
        email=email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
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
        extra={"new_user_email": email, "role": payload.role},
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
    target.is_active = False  # soft delete
    await db.commit()
    await record_action(
        db,
        user_id=user.id,
        action="delete_user",
        resource_type="user",
        resource_id=user_id,
        ip=client_ip(request),
    )
    return {"status": "deactivated", "user_id": user_id}
