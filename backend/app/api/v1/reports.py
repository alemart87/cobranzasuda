"""Reports endpoints: list + detail + publish/unpublish + delete."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.database import get_db
from ...models.report import Report
from ...schemas.report import ReportDetail, ReportList, ReportSummary
from ...services.audit_service import record_action
from ..deps import CurrentUser, client_ip, get_current_user, require_analyst_or_admin


router = APIRouter(prefix="/reports", tags=["reports"])


class PublishRequest(BaseModel):
    is_published: bool
    title: str | None = None


@router.get("", response_model=ReportList)
async def list_reports(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReportList:
    stmt = select(Report).order_by(Report.generated_at.desc()).limit(100)
    if user.is_client:
        stmt = select(Report).where(Report.is_published == True).order_by(Report.generated_at.desc()).limit(100)  # noqa: E712
    result = await db.execute(stmt)
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
    if user.is_client and not report.is_published:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Reporte no publicado")

    await record_action(
        db,
        user_id=user.id,
        action="view_report",
        resource_type="report",
        resource_id=report_id,
        ip=client_ip(request),
        extra={"role": user.role},
    )
    return report


@router.post("/{report_id}/publish", response_model=ReportSummary)
async def publish_report(
    report_id: str,
    payload: PublishRequest,
    request: Request,
    user: CurrentUser = Depends(require_analyst_or_admin),
    db: AsyncSession = Depends(get_db),
) -> Report:
    report = await db.get(Report, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reporte no encontrado")
    report.is_published = payload.is_published
    if payload.is_published:
        report.published_at = datetime.utcnow()
        report.published_by = user.id
    else:
        report.published_at = None
        report.published_by = None
    if payload.title is not None:
        report.title = payload.title
    await db.commit()
    await db.refresh(report)
    await record_action(
        db,
        user_id=user.id,
        action="publish_report" if payload.is_published else "unpublish_report",
        resource_type="report",
        resource_id=report_id,
        ip=client_ip(request),
    )
    return report


@router.delete("/{report_id}")
async def delete_report(
    report_id: str,
    request: Request,
    user: CurrentUser = Depends(require_analyst_or_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    report = await db.get(Report, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reporte no encontrado")
    await db.delete(report)
    await db.commit()
    await record_action(
        db,
        user_id=user.id,
        action="delete_report",
        resource_type="report",
        resource_id=report_id,
        ip=client_ip(request),
    )
    return {"status": "deleted", "report_id": report_id}
