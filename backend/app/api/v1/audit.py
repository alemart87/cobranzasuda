"""Audit log + usage analytics — only superadmin."""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.database import get_db
from ...models.audit import AuditLog
from ...models.user import User
from ...schemas.audit import AuditRead
from ..deps import CurrentUser, require_superadmin


router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditRead])
async def list_audit(
    limit: int = Query(200, ge=1, le=1000),
    action: str | None = Query(None),
    user_id: str | None = Query(None),
    user: CurrentUser = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
) -> list[AuditLog]:
    stmt = select(AuditLog).order_by(AuditLog.occurred_at.desc()).limit(limit)
    if action:
        stmt = select(AuditLog).where(AuditLog.action == action).order_by(AuditLog.occurred_at.desc()).limit(limit)
    if user_id:
        stmt = select(AuditLog).where(AuditLog.user_id == user_id).order_by(AuditLog.occurred_at.desc()).limit(limit)
    rows = await db.execute(stmt)
    return rows.scalars().all()


@router.get("/usage")
async def usage_analytics(
    days: int = Query(30, ge=1, le=365),
    user: CurrentUser = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Estadísticas de uso de los últimos N días — para gráficos del dashboard."""
    since = datetime.utcnow() - timedelta(days=days)
    rows = (
        await db.execute(
            select(AuditLog).where(AuditLog.occurred_at >= since).order_by(AuditLog.occurred_at.asc())
        )
    ).scalars().all()

    # Map user_id -> email/role
    users = (await db.execute(select(User))).scalars().all()
    user_info: dict[str, dict] = {
        u.id: {"email": u.email, "role": u.role, "full_name": u.full_name} for u in users
    }
    user_info["superadmin"] = {"email": "superadmin", "role": "superadmin", "full_name": "Superadmin"}

    by_day: dict[str, int] = defaultdict(int)
    by_day_role: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    by_action = Counter()
    by_user: dict[str, dict] = defaultdict(lambda: {
        "logins": 0, "views": 0, "actions": 0, "first_seen": None, "last_seen": None,
    })
    # Permanencia: distancia entre primer y último evento por (user, day) en minutos
    presence: dict[tuple[str, str], list[datetime]] = defaultdict(list)

    for r in rows:
        day = r.occurred_at.date().isoformat()
        by_day[day] += 1
        by_action[r.action] += 1

        uid = r.user_id or "anonymous"
        info = user_info.get(uid, {"role": "unknown"})
        role = info.get("role", "unknown")
        by_day_role[day][role] += 1

        ub = by_user[uid]
        if r.action == "login":
            ub["logins"] += 1
        elif r.action.startswith("view_"):
            ub["views"] += 1
        else:
            ub["actions"] += 1
        if ub["first_seen"] is None or r.occurred_at < ub["first_seen"]:
            ub["first_seen"] = r.occurred_at
        if ub["last_seen"] is None or r.occurred_at > ub["last_seen"]:
            ub["last_seen"] = r.occurred_at

        presence[(uid, day)].append(r.occurred_at)

    # Permanencia promedio por usuario (min)
    user_permanencia: dict[str, list[float]] = defaultdict(list)
    for (uid, day), times in presence.items():
        if len(times) > 1:
            delta = (max(times) - min(times)).total_seconds() / 60.0
            if delta > 0:
                user_permanencia[uid].append(delta)

    # Serie diaria
    days_sorted = sorted(by_day.keys())
    serie = [
        {
            "fecha": d,
            "eventos": by_day[d],
            "superadmin": by_day_role[d].get("superadmin", 0),
            "analyst": by_day_role[d].get("analyst", 0),
            "client": by_day_role[d].get("client", 0),
        }
        for d in days_sorted
    ]

    # Ranking de usuarios
    users_list = []
    for uid, ub in by_user.items():
        info = user_info.get(uid, {"email": uid, "role": "unknown", "full_name": uid})
        permanencias = user_permanencia.get(uid, [])
        users_list.append({
            "user_id": uid,
            "email": info["email"],
            "full_name": info["full_name"],
            "role": info["role"],
            "logins": ub["logins"],
            "views": ub["views"],
            "actions": ub["actions"],
            "first_seen": ub["first_seen"].isoformat() if ub["first_seen"] else None,
            "last_seen": ub["last_seen"].isoformat() if ub["last_seen"] else None,
            "permanencia_promedio_min": round(sum(permanencias) / len(permanencias), 1) if permanencias else 0,
            "sesiones": len(permanencias),
        })
    users_list.sort(key=lambda x: x["logins"] + x["views"], reverse=True)

    return {
        "rango_dias": days,
        "total_eventos": len(rows),
        "serie_diaria": serie,
        "top_acciones": [{"action": a, "count": c} for a, c in by_action.most_common(15)],
        "usuarios": users_list,
    }
