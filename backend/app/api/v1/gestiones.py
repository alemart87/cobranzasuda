"""Gestiones report endpoints."""
from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Optional

from fastapi import (
    APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile, status,
)
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import settings
from ...core.database import get_db
from ...jobs.gestion_runner import process_gestion_upload
from ...models.gestion_report import GestionReport
from ...models.gestion_upload import GestionUpload
from ...schemas.gestiones import (
    GestionReportDetail, GestionReportList, GestionReportSummary,
    GestionUploadList, GestionUploadRead,
)
from ...services.audit_service import record_action
from ..deps import CurrentUser, client_ip, get_current_user, require_analyst_or_admin


class PublishRequest(BaseModel):
    is_published: bool
    title: str | None = None


router = APIRouter(prefix="/gestiones", tags=["gestiones"])


async def _save_file(file: UploadFile, upload_id: str) -> tuple[str, str, str]:
    if not file.filename:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Archivo sin nombre")
    target_dir = settings.upload_path / "gestiones" / upload_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / file.filename
    sha = hashlib.sha256()
    content = await file.read()
    sha.update(content)
    if len(content) > settings.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            f"Archivo excede {settings.max_upload_size_mb}MB")
    target.write_bytes(content)
    return file.filename, str(target.resolve()), sha.hexdigest()


@router.post("/uploads", response_model=GestionUploadRead, status_code=status.HTTP_202_ACCEPTED)
async def create_gestion_upload(
    background_tasks: BackgroundTasks,
    request: Request,
    file: UploadFile = File(..., description="Reporte de Gestiones XLSX"),
    period_month: Optional[str] = Form(None),
    user: CurrentUser = Depends(require_analyst_or_admin),
    db: AsyncSession = Depends(get_db),
) -> GestionUpload:
    period_date = None
    if period_month:
        try:
            period_date = datetime.strptime(period_month, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "period_month debe ser YYYY-MM-DD")

    upload = GestionUpload(uploaded_by=user.id, status="pending", period_month=period_date)
    db.add(upload)
    await db.commit()
    await db.refresh(upload)

    upload.filename, upload.file_path, upload.file_sha256 = await _save_file(file, upload.id)
    await db.commit()

    await record_action(
        db, user_id=user.id, action="create_gestion_upload",
        resource_type="gestion_upload", resource_id=upload.id,
        ip=client_ip(request), extra={"period_month": period_month},
    )

    background_tasks.add_task(process_gestion_upload, upload.id)
    return upload


@router.get("/uploads", response_model=GestionUploadList)
async def list_gestion_uploads(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GestionUploadList:
    result = await db.execute(select(GestionUpload).order_by(GestionUpload.uploaded_at.desc()).limit(100))
    items = result.scalars().all()
    return GestionUploadList(items=[GestionUploadRead.model_validate(u) for u in items], total=len(items))


@router.get("/uploads/{upload_id}", response_model=GestionUploadRead)
async def get_gestion_upload(
    upload_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GestionUpload:
    upload = await db.get(GestionUpload, upload_id)
    if not upload:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Upload no encontrado")
    return upload


@router.get("/reports", response_model=GestionReportList)
async def list_gestion_reports(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GestionReportList:
    stmt = select(GestionReport).order_by(GestionReport.generated_at.desc()).limit(100)
    if user.is_client:
        stmt = (
            select(GestionReport)
            .where(GestionReport.is_published == True)  # noqa: E712
            .order_by(GestionReport.generated_at.desc())
            .limit(100)
        )
    result = await db.execute(stmt)
    items = result.scalars().all()
    return GestionReportList(items=[GestionReportSummary.model_validate(r) for r in items], total=len(items))


@router.get("/reports/{report_id}", response_model=GestionReportDetail)
async def get_gestion_report(
    report_id: str, request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GestionReport:
    report = await db.get(GestionReport, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reporte no encontrado")
    if user.is_client and not report.is_published:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Reporte no publicado")
    await record_action(
        db, user_id=user.id, action="view_gestion_report",
        resource_type="gestion_report", resource_id=report_id,
        ip=client_ip(request), extra={"role": user.role},
    )
    return report


@router.post("/reports/{report_id}/publish", response_model=GestionReportSummary)
async def publish_gestion_report(
    report_id: str, payload: PublishRequest, request: Request,
    user: CurrentUser = Depends(require_analyst_or_admin),
    db: AsyncSession = Depends(get_db),
) -> GestionReport:
    report = await db.get(GestionReport, report_id)
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
        db, user_id=user.id,
        action="publish_gestion_report" if payload.is_published else "unpublish_gestion_report",
        resource_type="gestion_report", resource_id=report_id, ip=client_ip(request),
    )
    return report


@router.delete("/reports/{report_id}")
async def delete_gestion_report(
    report_id: str, request: Request,
    user: CurrentUser = Depends(require_analyst_or_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    report = await db.get(GestionReport, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reporte no encontrado")
    await db.delete(report)
    await db.commit()
    await record_action(
        db, user_id=user.id, action="delete_gestion_report",
        resource_type="gestion_report", resource_id=report_id, ip=client_ip(request),
    )
    return {"status": "deleted", "report_id": report_id}
