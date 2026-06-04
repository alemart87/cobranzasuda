"""Endpoints del módulo Atención al Cliente.

Dos reportes independientes, ambos con el mismo flujo de publicación que Cobranzas:
  * Llamadas  → 4 archivos (entrantes, estados, intervalo, colas) en una carga.
  * Gestiones → 1 archivo.
"""
from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import settings
from ...core.database import get_db
from ...jobs.atencion_gestion_runner import process_atencion_gestion_upload
from ...jobs.atencion_llamadas_runner import process_atencion_llamadas_upload
from ...models.atencion_gestion_report import AtencionGestionReport
from ...models.atencion_gestion_upload import AtencionGestionUpload
from ...models.atencion_llamadas_report import AtencionLlamadasReport
from ...models.atencion_llamadas_upload import AtencionLlamadasUpload
from ...schemas.atencion import (
    AtencionGestionReportDetail,
    AtencionGestionReportList,
    AtencionGestionReportSummary,
    AtencionGestionUploadList,
    AtencionGestionUploadRead,
    AtencionLlamadasReportDetail,
    AtencionLlamadasReportList,
    AtencionLlamadasReportSummary,
    AtencionLlamadasUploadList,
    AtencionLlamadasUploadRead,
    PublishRequest,
)
from ...services.audit_service import record_action
from ..deps import CurrentUser, client_ip, get_current_user, require_analyst_or_admin


router = APIRouter(prefix="/atencion", tags=["atencion"])


def _parse_period(period_month: Optional[str]):
    if not period_month:
        return None
    try:
        return datetime.strptime(period_month, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "period_month debe ser YYYY-MM-DD")


async def _save(file: UploadFile, kind: str, subdir: str, upload_id: str) -> tuple[str, str, str]:
    if not file.filename:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Archivo {kind} sin nombre")
    target_dir = settings.upload_path / "atencion" / subdir / upload_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{kind}_{file.filename}"

    sha = hashlib.sha256()
    content = await file.read()
    sha.update(content)
    if len(content) > settings.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Archivo {kind} excede {settings.max_upload_size_mb}MB",
        )
    target.write_bytes(content)
    return file.filename, str(target.resolve()), sha.hexdigest()


# ============================ LLAMADAS ============================
@router.post("/llamadas/uploads", response_model=AtencionLlamadasUploadRead,
             status_code=status.HTTP_202_ACCEPTED)
async def create_llamadas_upload(
    background_tasks: BackgroundTasks,
    request: Request,
    entrantes: UploadFile = File(..., description="Entrantes/Salientes por agente"),
    estados: UploadFile = File(..., description="Estados por agente (auxiliares)"),
    intervalo: UploadFile = File(..., description="Llamadas por intervalo"),
    colas: UploadFile = File(..., description="Colas de atención"),
    period_month: Optional[str] = Form(None),
    user: CurrentUser = Depends(require_analyst_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AtencionLlamadasUpload:
    period_date = _parse_period(period_month)
    upload = AtencionLlamadasUpload(uploaded_by=user.id, status="pending", period_month=period_date)
    db.add(upload)
    await db.commit()
    await db.refresh(upload)

    upload.entrantes_filename, upload.entrantes_path, upload.entrantes_sha256 = await _save(
        entrantes, "entrantes", "llamadas", upload.id)
    upload.estados_filename, upload.estados_path, upload.estados_sha256 = await _save(
        estados, "estados", "llamadas", upload.id)
    upload.intervalo_filename, upload.intervalo_path, upload.intervalo_sha256 = await _save(
        intervalo, "intervalo", "llamadas", upload.id)
    upload.colas_filename, upload.colas_path, upload.colas_sha256 = await _save(
        colas, "colas", "llamadas", upload.id)
    await db.commit()

    await record_action(
        db, user_id=user.id, action="create_atencion_llamadas_upload",
        resource_type="atencion_llamadas_upload", resource_id=upload.id,
        ip=client_ip(request), extra={"period_month": period_month},
    )
    background_tasks.add_task(process_atencion_llamadas_upload, upload.id)
    return upload


@router.get("/llamadas/uploads", response_model=AtencionLlamadasUploadList)
async def list_llamadas_uploads(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AtencionLlamadasUploadList:
    result = await db.execute(
        select(AtencionLlamadasUpload).order_by(AtencionLlamadasUpload.uploaded_at.desc()).limit(100))
    items = result.scalars().all()
    return AtencionLlamadasUploadList(
        items=[AtencionLlamadasUploadRead.model_validate(u) for u in items], total=len(items))


@router.get("/llamadas/uploads/{upload_id}", response_model=AtencionLlamadasUploadRead)
async def get_llamadas_upload(
    upload_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AtencionLlamadasUpload:
    upload = await db.get(AtencionLlamadasUpload, upload_id)
    if not upload:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Upload no encontrado")
    return upload


@router.get("/llamadas/reports", response_model=AtencionLlamadasReportList)
async def list_llamadas_reports(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AtencionLlamadasReportList:
    stmt = select(AtencionLlamadasReport).order_by(AtencionLlamadasReport.generated_at.desc()).limit(100)
    if user.is_client:
        stmt = (
            select(AtencionLlamadasReport)
            .where(AtencionLlamadasReport.is_published == True)  # noqa: E712
            .order_by(AtencionLlamadasReport.generated_at.desc())
            .limit(100)
        )
    result = await db.execute(stmt)
    items = result.scalars().all()
    return AtencionLlamadasReportList(
        items=[AtencionLlamadasReportSummary.model_validate(r) for r in items], total=len(items))


@router.get("/llamadas/reports/{report_id}", response_model=AtencionLlamadasReportDetail)
async def get_llamadas_report(
    report_id: str,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AtencionLlamadasReport:
    report = await db.get(AtencionLlamadasReport, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reporte no encontrado")
    if user.is_client and not report.is_published:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Reporte no publicado")
    await record_action(
        db, user_id=user.id, action="view_atencion_llamadas_report",
        resource_type="atencion_llamadas_report", resource_id=report_id,
        ip=client_ip(request), extra={"role": user.role},
    )
    return report


@router.post("/llamadas/reports/{report_id}/publish", response_model=AtencionLlamadasReportSummary)
async def publish_llamadas_report(
    report_id: str,
    payload: PublishRequest,
    request: Request,
    user: CurrentUser = Depends(require_analyst_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AtencionLlamadasReport:
    report = await db.get(AtencionLlamadasReport, report_id)
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
        action="publish_atencion_llamadas_report" if payload.is_published else "unpublish_atencion_llamadas_report",
        resource_type="atencion_llamadas_report", resource_id=report_id, ip=client_ip(request),
    )
    return report


@router.delete("/llamadas/reports/{report_id}")
async def delete_llamadas_report(
    report_id: str,
    request: Request,
    user: CurrentUser = Depends(require_analyst_or_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    report = await db.get(AtencionLlamadasReport, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reporte no encontrado")
    await db.delete(report)
    await db.commit()
    await record_action(
        db, user_id=user.id, action="delete_atencion_llamadas_report",
        resource_type="atencion_llamadas_report", resource_id=report_id, ip=client_ip(request),
    )
    return {"status": "deleted", "report_id": report_id}


# ============================ GESTIONES ============================
@router.post("/gestiones/uploads", response_model=AtencionGestionUploadRead,
             status_code=status.HTTP_202_ACCEPTED)
async def create_gestion_upload(
    background_tasks: BackgroundTasks,
    request: Request,
    file: UploadFile = File(..., description="Archivo de Gestiones (CRM Atención)"),
    period_month: Optional[str] = Form(None),
    user: CurrentUser = Depends(require_analyst_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AtencionGestionUpload:
    period_date = _parse_period(period_month)
    upload = AtencionGestionUpload(uploaded_by=user.id, status="pending", period_month=period_date)
    db.add(upload)
    await db.commit()
    await db.refresh(upload)

    upload.filename, upload.file_path, upload.file_sha256 = await _save(
        file, "gestiones", "gestiones", upload.id)
    await db.commit()

    await record_action(
        db, user_id=user.id, action="create_atencion_gestion_upload",
        resource_type="atencion_gestion_upload", resource_id=upload.id,
        ip=client_ip(request), extra={"period_month": period_month},
    )
    background_tasks.add_task(process_atencion_gestion_upload, upload.id)
    return upload


@router.get("/gestiones/uploads", response_model=AtencionGestionUploadList)
async def list_gestion_uploads(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AtencionGestionUploadList:
    result = await db.execute(
        select(AtencionGestionUpload).order_by(AtencionGestionUpload.uploaded_at.desc()).limit(100))
    items = result.scalars().all()
    return AtencionGestionUploadList(
        items=[AtencionGestionUploadRead.model_validate(u) for u in items], total=len(items))


@router.get("/gestiones/uploads/{upload_id}", response_model=AtencionGestionUploadRead)
async def get_gestion_upload(
    upload_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AtencionGestionUpload:
    upload = await db.get(AtencionGestionUpload, upload_id)
    if not upload:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Upload no encontrado")
    return upload


@router.get("/gestiones/reports", response_model=AtencionGestionReportList)
async def list_gestion_reports(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AtencionGestionReportList:
    stmt = select(AtencionGestionReport).order_by(AtencionGestionReport.generated_at.desc()).limit(100)
    if user.is_client:
        stmt = (
            select(AtencionGestionReport)
            .where(AtencionGestionReport.is_published == True)  # noqa: E712
            .order_by(AtencionGestionReport.generated_at.desc())
            .limit(100)
        )
    result = await db.execute(stmt)
    items = result.scalars().all()
    return AtencionGestionReportList(
        items=[AtencionGestionReportSummary.model_validate(r) for r in items], total=len(items))


@router.get("/gestiones/reports/{report_id}", response_model=AtencionGestionReportDetail)
async def get_gestion_report(
    report_id: str,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AtencionGestionReport:
    report = await db.get(AtencionGestionReport, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reporte no encontrado")
    if user.is_client and not report.is_published:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Reporte no publicado")
    await record_action(
        db, user_id=user.id, action="view_atencion_gestion_report",
        resource_type="atencion_gestion_report", resource_id=report_id,
        ip=client_ip(request), extra={"role": user.role},
    )
    return report


@router.post("/gestiones/reports/{report_id}/publish", response_model=AtencionGestionReportSummary)
async def publish_gestion_report(
    report_id: str,
    payload: PublishRequest,
    request: Request,
    user: CurrentUser = Depends(require_analyst_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AtencionGestionReport:
    report = await db.get(AtencionGestionReport, report_id)
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
        action="publish_atencion_gestion_report" if payload.is_published else "unpublish_atencion_gestion_report",
        resource_type="atencion_gestion_report", resource_id=report_id, ip=client_ip(request),
    )
    return report


@router.delete("/gestiones/reports/{report_id}")
async def delete_gestion_report(
    report_id: str,
    request: Request,
    user: CurrentUser = Depends(require_analyst_or_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    report = await db.get(AtencionGestionReport, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reporte no encontrado")
    await db.delete(report)
    await db.commit()
    await record_action(
        db, user_id=user.id, action="delete_atencion_gestion_report",
        resource_type="atencion_gestion_report", resource_id=report_id, ip=client_ip(request),
    )
    return {"status": "deleted", "report_id": report_id}
