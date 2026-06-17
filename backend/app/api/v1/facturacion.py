"""Endpoints del módulo Facturación — Televentas Claro.

Módulo RESTRINGIDO: solo superadmin + analistas habilitados. Clientes NUNCA.
Flujo: subir .txt -> cola (parse aislado) -> reporte (borrador) -> publicar -> comparar.
"""
from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Optional

from fastapi import (
    APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import settings
from ...core.database import get_db
from ...jobs.facturacion_queue import signal_facturacion_queue
from ...models.facturacion_report import FacturacionReport
from ...models.facturacion_upload import FacturacionUpload
from ...schemas.facturacion import (
    CompareRequest, CompareResponse, FacturacionReportDetail, FacturacionReportList,
    FacturacionReportSummary, FacturacionUploadList, FacturacionUploadRead, PublishRequest,
)
from ...services.analyzers.facturacion_compare import compare_facturacion
from ...services.audit_service import record_action
from ..deps import (
    CurrentUser, client_ip, require_facturacion_access, require_facturacion_manage,
)


router = APIRouter(prefix="/facturacion", tags=["facturacion"])


def _parse_period(period_month: Optional[str]):
    if not period_month:
        return None
    try:
        return datetime.strptime(period_month, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "period_month debe ser YYYY-MM-DD")


async def _save(file: UploadFile, upload_id: str) -> tuple[str, str, str]:
    if not file.filename:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Archivo sin nombre")
    if not file.filename.lower().endswith(".txt"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Se espera un archivo .txt de liquidación")
    target_dir = settings.upload_path / "facturacion" / upload_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / file.filename

    content = await file.read()
    if len(content) > settings.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"El archivo excede {settings.max_upload_size_mb}MB",
        )
    target.write_bytes(content)
    return file.filename, str(target.resolve()), hashlib.sha256(content).hexdigest()


# ============================ UPLOADS ============================
@router.post("/uploads", response_model=FacturacionUploadRead, status_code=status.HTTP_202_ACCEPTED)
async def create_upload(
    request: Request,
    file: UploadFile = File(..., description="Liquidación .txt (Televentas Claro)"),
    period_month: Optional[str] = Form(None),
    user: CurrentUser = Depends(require_facturacion_manage),
    db: AsyncSession = Depends(get_db),
) -> FacturacionUpload:
    period_date = _parse_period(period_month)
    upload = FacturacionUpload(uploaded_by=user.id, status="pending", period_month=period_date)
    db.add(upload)
    await db.commit()
    await db.refresh(upload)

    upload.filename, upload.file_path, upload.file_sha256 = await _save(file, upload.id)
    await db.commit()

    await record_action(
        db, user_id=user.id, action="create_facturacion_upload",
        resource_type="facturacion_upload", resource_id=upload.id,
        ip=client_ip(request), extra={"period_month": period_month, "filename": upload.filename},
    )
    signal_facturacion_queue()
    return upload


@router.get("/uploads", response_model=FacturacionUploadList)
async def list_uploads(
    user: CurrentUser = Depends(require_facturacion_access),
    db: AsyncSession = Depends(get_db),
) -> FacturacionUploadList:
    rows = await db.execute(
        select(FacturacionUpload).order_by(FacturacionUpload.uploaded_at.desc()).limit(100))
    items = rows.scalars().all()
    return FacturacionUploadList(
        items=[FacturacionUploadRead.model_validate(u) for u in items], total=len(items))


@router.get("/uploads/{upload_id}", response_model=FacturacionUploadRead)
async def get_upload(
    upload_id: str,
    user: CurrentUser = Depends(require_facturacion_access),
    db: AsyncSession = Depends(get_db),
) -> FacturacionUpload:
    upload = await db.get(FacturacionUpload, upload_id)
    if not upload:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Upload no encontrado")
    return upload


# ============================ REPORTS ============================
@router.get("/reports", response_model=FacturacionReportList)
async def list_reports(
    user: CurrentUser = Depends(require_facturacion_access),
    db: AsyncSession = Depends(get_db),
) -> FacturacionReportList:
    rows = await db.execute(
        select(FacturacionReport).order_by(FacturacionReport.generated_at.desc()).limit(200))
    items = rows.scalars().all()
    return FacturacionReportList(
        items=[FacturacionReportSummary.model_validate(r) for r in items], total=len(items))


@router.get("/reports/{report_id}", response_model=FacturacionReportDetail)
async def get_report(
    report_id: str,
    request: Request,
    user: CurrentUser = Depends(require_facturacion_access),
    db: AsyncSession = Depends(get_db),
) -> FacturacionReport:
    report = await db.get(FacturacionReport, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reporte no encontrado")
    await record_action(
        db, user_id=user.id, action="view_facturacion_report",
        resource_type="facturacion_report", resource_id=report_id,
        ip=client_ip(request), extra={"role": user.role},
    )
    return report


@router.post("/reports/{report_id}/publish", response_model=FacturacionReportSummary)
async def publish_report(
    report_id: str,
    payload: PublishRequest,
    request: Request,
    user: CurrentUser = Depends(require_facturacion_manage),
    db: AsyncSession = Depends(get_db),
) -> FacturacionReport:
    report = await db.get(FacturacionReport, report_id)
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
        action="publish_facturacion_report" if payload.is_published else "unpublish_facturacion_report",
        resource_type="facturacion_report", resource_id=report_id, ip=client_ip(request),
    )
    return report


@router.delete("/reports/{report_id}")
async def delete_report(
    report_id: str,
    request: Request,
    user: CurrentUser = Depends(require_facturacion_manage),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    report = await db.get(FacturacionReport, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reporte no encontrado")
    await db.delete(report)
    await db.commit()
    await record_action(
        db, user_id=user.id, action="delete_facturacion_report",
        resource_type="facturacion_report", resource_id=report_id, ip=client_ip(request),
    )
    return {"status": "deleted", "report_id": report_id}


# ============================ COMPARE ============================
@router.post("/compare", response_model=CompareResponse)
async def compare_reports(
    payload: CompareRequest,
    request: Request,
    user: CurrentUser = Depends(require_facturacion_access),
    db: AsyncSession = Depends(get_db),
) -> CompareResponse:
    rows = await db.execute(
        select(FacturacionReport).where(FacturacionReport.id.in_(payload.report_ids)))
    reports = rows.scalars().all()
    if len(reports) < 2:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Se requieren al menos 2 reportes válidos")

    payload_data = [
        {
            "id": r.id,
            "title": r.title,
            "periodo": r.periodo,
            "nro_liquidacion": r.nro_liquidacion,
            "generated_at": r.generated_at.isoformat() if r.generated_at else "",
            "data": r.data or {},
        }
        for r in reports
    ]
    result = compare_facturacion(payload_data)
    await record_action(
        db, user_id=user.id, action="compare_facturacion_reports",
        resource_type="facturacion_report", resource_id=",".join(payload.report_ids)[:200],
        ip=client_ip(request), extra={"count": len(reports)},
    )
    return CompareResponse(**result)
