"""Helper for inserting audit log rows."""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from ..models.audit import AuditLog


async def record_action(
    db: AsyncSession,
    *,
    user_id: Optional[str],
    action: str,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
    extra: Optional[dict[str, Any]] = None,
) -> None:
    row = AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        ip_address=ip,
        user_agent=user_agent,
        extra=extra or {},
    )
    db.add(row)
    await db.commit()
