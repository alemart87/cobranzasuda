"""Endpoints del módulo Televentas (ventas de pólizas).

Dos reportes independientes con el mismo flujo de publicación que el resto de la app:
  * Llamadas   → 1 archivo (export de voz saliente).
  * Producción → 1 archivo (Libro de Producción / ventas).
Más un overview combinado para el Gerente de Ventas (KPIs, ranking y alertas).
"""
from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import settings
from ...core.database import get_db
from ...jobs.televentas_queue import signal_televentas_queue
from ...models.televentas_llamadas_report import TeleventasLlamadasReport
from ...models.televentas_llamadas_upload import TeleventasLlamadasUpload
from ...models.televentas_produccion_item import TeleventasProduccionItem
from ...models.televentas_produccion_report import TeleventasProduccionReport
from ...models.televentas_produccion_upload import TeleventasProduccionUpload
from ...schemas.televentas import (
    PublishRequest,
    TeleventasLlamadasReportDetail, TeleventasLlamadasReportList, TeleventasLlamadasReportSummary,
    TeleventasLlamadasUploadList, TeleventasLlamadasUploadRead,
    TeleventasProduccionReportDetail, TeleventasProduccionReportList, TeleventasProduccionReportSummary,
    TeleventasProduccionUploadList, TeleventasProduccionUploadRead,
)
from ...services.analyzers import combine_televentas, comparativo_televentas
from ...services.audit_service import record_action
from ..deps import CurrentUser, client_ip, get_current_user, require_analyst_or_admin


router = APIRouter(prefix="/televentas", tags=["televentas"])


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
    target_dir = settings.upload_path / "televentas" / subdir / upload_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{kind}_{file.filename}"
    sha = hashlib.sha256()
    content = await file.read()
    sha.update(content)
    if len(content) > settings.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            f"Archivo {kind} excede {settings.max_upload_size_mb}MB")
    target.write_bytes(content)
    return file.filename, str(target.resolve()), sha.hexdigest()


# ============================ LLAMADAS ============================
@router.post("/llamadas/uploads", response_model=TeleventasLlamadasUploadRead, status_code=status.HTTP_202_ACCEPTED)
async def create_llamadas_upload(
    background_tasks: BackgroundTasks, request: Request,
    file: UploadFile = File(..., description="Export de llamadas (voz saliente)"),
    period_month: Optional[str] = Form(None),
    user: CurrentUser = Depends(require_analyst_or_admin),
    db: AsyncSession = Depends(get_db),
) -> TeleventasLlamadasUpload:
    upload = TeleventasLlamadasUpload(uploaded_by=user.id, status="pending", period_month=_parse_period(period_month))
    db.add(upload)
    await db.commit()
    await db.refresh(upload)
    upload.filename, upload.file_path, upload.file_sha256 = await _save(file, "llamadas", "llamadas", upload.id)
    await db.commit()
    await record_action(db, user_id=user.id, action="create_televentas_llamadas_upload",
                        resource_type="televentas_llamadas_upload", resource_id=upload.id,
                        ip=client_ip(request), extra={"period_month": period_month})
    signal_televentas_queue()
    return upload


@router.get("/llamadas/uploads", response_model=TeleventasLlamadasUploadList)
async def list_llamadas_uploads(user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    items = (await db.execute(
        select(TeleventasLlamadasUpload).order_by(TeleventasLlamadasUpload.uploaded_at.desc()).limit(100)
    )).scalars().all()
    return TeleventasLlamadasUploadList(items=[TeleventasLlamadasUploadRead.model_validate(u) for u in items], total=len(items))


@router.get("/llamadas/uploads/{upload_id}", response_model=TeleventasLlamadasUploadRead)
async def get_llamadas_upload(upload_id: str, user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    upload = await db.get(TeleventasLlamadasUpload, upload_id)
    if not upload:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Upload no encontrado")
    return upload


@router.get("/llamadas/reports", response_model=TeleventasLlamadasReportList)
async def list_llamadas_reports(user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stmt = select(TeleventasLlamadasReport).order_by(TeleventasLlamadasReport.generated_at.desc()).limit(100)
    if user.is_client:
        stmt = stmt.where(TeleventasLlamadasReport.is_published == True)  # noqa: E712
    items = (await db.execute(stmt)).scalars().all()
    return TeleventasLlamadasReportList(items=[TeleventasLlamadasReportSummary.model_validate(r) for r in items], total=len(items))


@router.get("/llamadas/reports/{report_id}", response_model=TeleventasLlamadasReportDetail)
async def get_llamadas_report(report_id: str, request: Request, user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    report = await db.get(TeleventasLlamadasReport, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reporte no encontrado")
    if user.is_client and not report.is_published:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Reporte no publicado")
    await record_action(db, user_id=user.id, action="view_televentas_llamadas_report",
                        resource_type="televentas_llamadas_report", resource_id=report_id,
                        ip=client_ip(request), extra={"role": user.role})
    return report


@router.post("/llamadas/reports/{report_id}/publish", response_model=TeleventasLlamadasReportSummary)
async def publish_llamadas_report(report_id: str, payload: PublishRequest, request: Request,
                                  user: CurrentUser = Depends(require_analyst_or_admin), db: AsyncSession = Depends(get_db)):
    report = await db.get(TeleventasLlamadasReport, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reporte no encontrado")
    report.is_published = payload.is_published
    report.published_at = datetime.utcnow() if payload.is_published else None
    report.published_by = user.id if payload.is_published else None
    if payload.title is not None:
        report.title = payload.title
    await db.commit()
    await db.refresh(report)
    await record_action(db, user_id=user.id,
                        action="publish_televentas_llamadas_report" if payload.is_published else "unpublish_televentas_llamadas_report",
                        resource_type="televentas_llamadas_report", resource_id=report_id, ip=client_ip(request))
    return report


@router.delete("/llamadas/reports/{report_id}")
async def delete_llamadas_report(report_id: str, request: Request,
                                 user: CurrentUser = Depends(require_analyst_or_admin), db: AsyncSession = Depends(get_db)):
    report = await db.get(TeleventasLlamadasReport, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reporte no encontrado")
    await db.delete(report)
    await db.commit()
    await record_action(db, user_id=user.id, action="delete_televentas_llamadas_report",
                        resource_type="televentas_llamadas_report", resource_id=report_id, ip=client_ip(request))
    return {"status": "deleted", "report_id": report_id}


# ============================ PRODUCCIÓN ============================
@router.post("/produccion/uploads", response_model=TeleventasProduccionUploadRead, status_code=status.HTTP_202_ACCEPTED)
async def create_produccion_upload(
    background_tasks: BackgroundTasks, request: Request,
    file: UploadFile = File(..., description="Libro de Producción (ventas de pólizas)"),
    period_month: Optional[str] = Form(None),
    user: CurrentUser = Depends(require_analyst_or_admin),
    db: AsyncSession = Depends(get_db),
) -> TeleventasProduccionUpload:
    upload = TeleventasProduccionUpload(uploaded_by=user.id, status="pending", period_month=_parse_period(period_month))
    db.add(upload)
    await db.commit()
    await db.refresh(upload)
    upload.filename, upload.file_path, upload.file_sha256 = await _save(file, "produccion", "produccion", upload.id)
    await db.commit()
    await record_action(db, user_id=user.id, action="create_televentas_produccion_upload",
                        resource_type="televentas_produccion_upload", resource_id=upload.id,
                        ip=client_ip(request), extra={"period_month": period_month})
    signal_televentas_queue()
    return upload


@router.get("/produccion/uploads", response_model=TeleventasProduccionUploadList)
async def list_produccion_uploads(user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    items = (await db.execute(
        select(TeleventasProduccionUpload).order_by(TeleventasProduccionUpload.uploaded_at.desc()).limit(100)
    )).scalars().all()
    return TeleventasProduccionUploadList(items=[TeleventasProduccionUploadRead.model_validate(u) for u in items], total=len(items))


@router.get("/produccion/uploads/{upload_id}", response_model=TeleventasProduccionUploadRead)
async def get_produccion_upload(upload_id: str, user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    upload = await db.get(TeleventasProduccionUpload, upload_id)
    if not upload:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Upload no encontrado")
    return upload


@router.get("/produccion/reports", response_model=TeleventasProduccionReportList)
async def list_produccion_reports(user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stmt = select(TeleventasProduccionReport).order_by(TeleventasProduccionReport.generated_at.desc()).limit(100)
    if user.is_client:
        stmt = stmt.where(TeleventasProduccionReport.is_published == True)  # noqa: E712
    items = (await db.execute(stmt)).scalars().all()
    return TeleventasProduccionReportList(items=[TeleventasProduccionReportSummary.model_validate(r) for r in items], total=len(items))


@router.get("/produccion/reports/{report_id}", response_model=TeleventasProduccionReportDetail)
async def get_produccion_report(report_id: str, request: Request, user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    report = await db.get(TeleventasProduccionReport, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reporte no encontrado")
    if user.is_client and not report.is_published:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Reporte no publicado")
    await record_action(db, user_id=user.id, action="view_televentas_produccion_report",
                        resource_type="televentas_produccion_report", resource_id=report_id,
                        ip=client_ip(request), extra={"role": user.role})
    return report


@router.get("/produccion/reports/{report_id}/polizas")
async def get_produccion_polizas(
    report_id: str,
    vendedor: Optional[str] = None,
    producto: Optional[str] = None,
    tipo: Optional[str] = Query(None, description="emitidas | anuladas | todas"),
    limit: int = 5000,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Pólizas del reporte (drilldown/descarga), filtrables por vendedor/producto/tipo."""
    report = await db.get(TeleventasProduccionReport, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reporte no encontrado")
    if user.is_client and not report.is_published:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Reporte no publicado")
    limit = max(1, min(limit, 20000))
    stmt = select(TeleventasProduccionItem).where(TeleventasProduccionItem.report_id == report_id)
    if vendedor:
        stmt = stmt.where(TeleventasProduccionItem.vendedor == vendedor)
    if producto:
        stmt = stmt.where(TeleventasProduccionItem.producto == producto)
    if tipo == "emitidas":
        stmt = stmt.where(TeleventasProduccionItem.es_anulacion == False)  # noqa: E712
    elif tipo == "anuladas":
        stmt = stmt.where(TeleventasProduccionItem.es_anulacion == True)  # noqa: E712
    rows = (await db.execute(stmt.order_by(TeleventasProduccionItem.prima.desc()).limit(limit))).scalars().all()
    polizas = [{
        "poliza": r.poliza, "asegurado": r.asegurado, "producto": r.producto,
        "vendedor": r.vendedor, "canal": r.canal, "cobrador": r.cobrador,
        "prima": float(r.prima or 0), "suma_asegurada": float(r.suma_asegurada or 0),
        "tipo": "anulada" if r.es_anulacion else "emitida",
        "fecha": r.fecha.isoformat() if r.fecha else None,
    } for r in rows]
    return {"report_id": report_id, "cantidad": len(polizas), "polizas": polizas}


@router.post("/produccion/reports/{report_id}/publish", response_model=TeleventasProduccionReportSummary)
async def publish_produccion_report(report_id: str, payload: PublishRequest, request: Request,
                                    user: CurrentUser = Depends(require_analyst_or_admin), db: AsyncSession = Depends(get_db)):
    report = await db.get(TeleventasProduccionReport, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reporte no encontrado")
    report.is_published = payload.is_published
    report.published_at = datetime.utcnow() if payload.is_published else None
    report.published_by = user.id if payload.is_published else None
    if payload.title is not None:
        report.title = payload.title
    await db.commit()
    await db.refresh(report)
    await record_action(db, user_id=user.id,
                        action="publish_televentas_produccion_report" if payload.is_published else "unpublish_televentas_produccion_report",
                        resource_type="televentas_produccion_report", resource_id=report_id, ip=client_ip(request))
    return report


@router.delete("/produccion/reports/{report_id}")
async def delete_produccion_report(report_id: str, request: Request,
                                   user: CurrentUser = Depends(require_analyst_or_admin), db: AsyncSession = Depends(get_db)):
    report = await db.get(TeleventasProduccionReport, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reporte no encontrado")
    await db.delete(report)
    await db.commit()
    await record_action(db, user_id=user.id, action="delete_televentas_produccion_report",
                        resource_type="televentas_produccion_report", resource_id=report_id, ip=client_ip(request))
    return {"status": "deleted", "report_id": report_id}


# ============================ OVERVIEW ============================
def _month_bounds(month: str):
    start = datetime.strptime(month, "%Y-%m").date().replace(day=1)
    end = start.replace(year=start.year + 1, month=1) if start.month == 12 else start.replace(month=start.month + 1)
    return start, end


@router.get("/overview")
async def televentas_overview(
    month: Optional[str] = Query(None, description="YYYY-MM"),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Overview combinado (llamadas + producción publicadas) para el Gerente de Ventas."""
    # El visualizador principal muestra SOLO datos publicados (para todos los roles).
    # Los borradores se ven en las listas de reportes / publicaciones, no en el overview.
    pub_only = True

    def _base(Model):
        stmt = select(Model.period_month).where(Model.period_month.isnot(None))
        if pub_only:
            stmt = stmt.where(Model.is_published == True)  # noqa: E712
        return stmt

    months = set()
    for Model in (TeleventasLlamadasReport, TeleventasProduccionReport):
        for (pm,) in (await db.execute(_base(Model))).all():
            if pm:
                months.add(pm.strftime("%Y-%m"))
    available = sorted(months, reverse=True)
    target = month if month in months else (available[0] if available else None)
    if not target:
        return {"available_months": [], "month": None, "overview": None}

    start, end = _month_bounds(target)

    async def _latest(Model):
        stmt = (select(Model)
                .where(Model.period_month >= start, Model.period_month < end)
                .order_by(Model.generated_at.desc()).limit(1))
        if pub_only:
            stmt = stmt.where(Model.is_published == True)  # noqa: E712
        return (await db.execute(stmt)).scalars().first()

    ll = await _latest(TeleventasLlamadasReport)
    pr = await _latest(TeleventasProduccionReport)
    overview = combine_televentas(ll.data if ll else None, pr.data if pr else None)
    return {
        "available_months": available,
        "month": target,
        "overview": overview,
        "tiene_llamadas": ll is not None,
        "tiene_produccion": pr is not None,
        "llamadas_report_id": ll.id if ll else None,
        "produccion_report_id": pr.id if pr else None,
    }


async def _overview_del_mes(db: AsyncSession, month: str) -> dict:
    start, end = _month_bounds(month)

    async def _latest(Model):
        return (await db.execute(
            select(Model).where(Model.period_month >= start, Model.period_month < end,
                                Model.is_published == True)  # noqa: E712
            .order_by(Model.generated_at.desc()).limit(1)
        )).scalars().first()

    ll = await _latest(TeleventasLlamadasReport)
    pr = await _latest(TeleventasProduccionReport)
    return combine_televentas(ll.data if ll else None, pr.data if pr else None)


@router.get("/comparativo")
async def televentas_comparativo(
    month: Optional[str] = Query(None, description="YYYY-MM (mes actual). Se compara con el anterior con datos."),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Comparativo del mes vs el mes anterior (publicados): KPIs, por operador
    (conversión, contactabilidad, llamadas, prima) e insights del cambio."""
    months = set()
    for Model in (TeleventasLlamadasReport, TeleventasProduccionReport):
        for (pm,) in (await db.execute(
            select(Model.period_month).where(Model.period_month.isnot(None), Model.is_published == True)  # noqa: E712
        )).all():
            if pm:
                months.add(pm.strftime("%Y-%m"))
    available = sorted(months, reverse=True)
    curr = month if month in months else (available[0] if available else None)
    if not curr:
        return {"disponible": False, "available_months": [], "mensaje": "No hay meses publicados."}
    anteriores = [m for m in available if m < curr]
    if not anteriores:
        return {"disponible": False, "available_months": available, "mes_actual": curr,
                "mensaje": "Se necesita al menos un mes anterior publicado para comparar."}
    prev = anteriores[0]
    comp = comparativo_televentas(await _overview_del_mes(db, prev), await _overview_del_mes(db, curr), prev, curr)
    return {"disponible": True, "available_months": available, **comp}
