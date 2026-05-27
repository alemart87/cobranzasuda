"""Reports endpoints: list + detail."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.database import get_db
from ...models.report import Report
from ...schemas.report import ReportDetail, ReportList, ReportSummary
from ...services.audit_service import record_action
from ..deps import CurrentUser, client_ip, get_current_user


router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("", response_model=ReportList)
async def list_reports(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReportList:
    result = await db.execute(select(Report).order_by(Report.generated_at.desc()).limit(100))
    items = result.scalars().all()
    return ReportList(items=[ReportSummary.model_validate(r) for r in items], total=len(items))


@router.get("/{report_id}", response_model=ReportDetail)
async def get_report(
    report_id: str,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Report:
    report = await db.get(Report, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reporte no encontrado")

    await record_action(
        db,
        user_id=user.id,
        action="view_report",
        resource_type="report",
        resource_id=report_id,
        ip=client_ip(request),
    )
    return report
