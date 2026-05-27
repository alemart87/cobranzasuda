"""Audit log viewer — only superadmin."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.database import get_db
from ...models.audit import AuditLog
from ...schemas.audit import AuditRead
from ..deps import CurrentUser, require_superadmin


router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditRead])
async def list_audit(
    limit: int = Query(100, ge=1, le=500),
    user: CurrentUser = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
) -> list[AuditLog]:
    rows = await db.execute(
        select(AuditLog).order_by(AuditLog.occurred_at.desc()).limit(limit)
    )
    return rows.scalars().all()
