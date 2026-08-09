"""Endpoints del módulo Televentas (ventas de pólizas).

Dos reportes independientes con el mismo flujo de publicación que el resto de la app:
  * Llamadas   → 1 archivo (export de voz saliente).
  * Producción → 1 archivo (Libro de Producción / ventas).
Más un overview combinado para el Gerente de Ventas (KPIs, ranking y alertas).
"""
from __future__ import annotations

import asyncio
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import settings
from ...core.database import get_db
from ...jobs.televentas_queue import signal_televentas_queue
from ...models.televentas_analisis import TeleventasAnalisis
from ...models.televentas_compromiso import TeleventasCompromiso
from ...models.televentas_crm_report import TeleventasCrmReport
from ...models.televentas_crm_upload import TeleventasCrmUpload
from ...models.televentas_llamadas_report import TeleventasLlamadasReport
from ...models.televentas_llamadas_upload import TeleventasLlamadasUpload
from ...models.televentas_produccion_item import TeleventasProduccionItem
from ...models.televentas_produccion_report import TeleventasProduccionReport
from ...models.televentas_produccion_upload import TeleventasProduccionUpload
from ...schemas.televentas import (
    AnalizadorRequest, CompromisoCreate, CompromisoUpdate, SemanalAnalizadorRequest,
    PublishRequest,
    TeleventasCrmReportDetail, TeleventasCrmReportList, TeleventasCrmReportSummary,
    TeleventasCrmUploadList, TeleventasCrmUploadRead,
    TeleventasLlamadasReportDetail, TeleventasLlamadasReportList, TeleventasLlamadasReportSummary,
    TeleventasLlamadasUploadList, TeleventasLlamadasUploadRead,
    TeleventasProduccionReportDetail, TeleventasProduccionReportList, TeleventasProduccionReportSummary,
    TeleventasProduccionUploadList, TeleventasProduccionUploadRead,
)
from ...services.analyzers import (
    combine_televentas, comparativo_televentas, analizar_tendencia_mensual, simular, escenarios,
)
from ...services.analyzers.televentas_analizador import analizar_cientifico
from ...services.analyzers.televentas_llamadas import por_dia_llamadas
from ...services.analyzers.televentas_semanal import agrupar_semanas, analizar_semana, evaluar_semana
from ...services.analyzers.televentas_simulador import regresion_diaria
from ...services.parsers import parse_televentas_llamadas
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
    await _heal_llamadas_diario(db, report)
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


# ============================ GESTIONES CRM ============================
@router.post("/crm/uploads", response_model=TeleventasCrmUploadRead, status_code=status.HTTP_202_ACCEPTED)
async def create_crm_upload(
    background_tasks: BackgroundTasks, request: Request,
    file: UploadFile = File(..., description="Export de Gestiones CRM (ventas)"),
    period_month: Optional[str] = Form(None),
    user: CurrentUser = Depends(require_analyst_or_admin),
    db: AsyncSession = Depends(get_db),
) -> TeleventasCrmUpload:
    upload = TeleventasCrmUpload(uploaded_by=user.id, status="pending", period_month=_parse_period(period_month))
    db.add(upload)
    await db.commit()
    await db.refresh(upload)
    upload.filename, upload.file_path, upload.file_sha256 = await _save(file, "crm", "crm", upload.id)
    await db.commit()
    await record_action(db, user_id=user.id, action="create_televentas_crm_upload",
                        resource_type="televentas_crm_upload", resource_id=upload.id,
                        ip=client_ip(request), extra={"period_month": period_month})
    signal_televentas_queue()
    return upload


@router.get("/crm/uploads", response_model=TeleventasCrmUploadList)
async def list_crm_uploads(user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    items = (await db.execute(
        select(TeleventasCrmUpload).order_by(TeleventasCrmUpload.uploaded_at.desc()).limit(100)
    )).scalars().all()
    return TeleventasCrmUploadList(items=[TeleventasCrmUploadRead.model_validate(u) for u in items], total=len(items))


@router.get("/crm/uploads/{upload_id}", response_model=TeleventasCrmUploadRead)
async def get_crm_upload(upload_id: str, user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    upload = await db.get(TeleventasCrmUpload, upload_id)
    if not upload:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Upload no encontrado")
    return upload


@router.get("/crm/reports", response_model=TeleventasCrmReportList)
async def list_crm_reports(user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stmt = select(TeleventasCrmReport).order_by(TeleventasCrmReport.generated_at.desc()).limit(100)
    if user.is_client:
        stmt = stmt.where(TeleventasCrmReport.is_published == True)  # noqa: E712
    items = (await db.execute(stmt)).scalars().all()
    return TeleventasCrmReportList(items=[TeleventasCrmReportSummary.model_validate(r) for r in items], total=len(items))


@router.get("/crm/reports/{report_id}", response_model=TeleventasCrmReportDetail)
async def get_crm_report(report_id: str, request: Request, user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    report = await db.get(TeleventasCrmReport, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reporte no encontrado")
    if user.is_client and not report.is_published:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Reporte no publicado")
    await record_action(db, user_id=user.id, action="view_televentas_crm_report",
                        resource_type="televentas_crm_report", resource_id=report_id,
                        ip=client_ip(request), extra={"role": user.role})
    return report


@router.post("/crm/reports/{report_id}/publish", response_model=TeleventasCrmReportSummary)
async def publish_crm_report(report_id: str, payload: PublishRequest, request: Request,
                             user: CurrentUser = Depends(require_analyst_or_admin), db: AsyncSession = Depends(get_db)):
    report = await db.get(TeleventasCrmReport, report_id)
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
                        action="publish_televentas_crm_report" if payload.is_published else "unpublish_televentas_crm_report",
                        resource_type="televentas_crm_report", resource_id=report_id, ip=client_ip(request))
    return report


@router.delete("/crm/reports/{report_id}")
async def delete_crm_report(report_id: str, request: Request,
                            user: CurrentUser = Depends(require_analyst_or_admin), db: AsyncSession = Depends(get_db)):
    report = await db.get(TeleventasCrmReport, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reporte no encontrado")
    await db.delete(report)
    await db.commit()
    await record_action(db, user_id=user.id, action="delete_televentas_crm_report",
                        resource_type="televentas_crm_report", resource_id=report_id, ip=client_ip(request))
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
    for Model in (TeleventasLlamadasReport, TeleventasProduccionReport, TeleventasCrmReport):
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


async def _metricas_del_mes(db: AsyncSession, month: str) -> dict:
    """Métricas resumidas de un mes (llamadas + producción) para la serie de tendencia."""
    start, end = _month_bounds(month)

    async def _latest(Model):
        return (await db.execute(
            select(Model).where(Model.period_month >= start, Model.period_month < end,
                                Model.is_published == True)  # noqa: E712
            .order_by(Model.generated_at.desc()).limit(1)
        )).scalars().first()

    ll = await _latest(TeleventasLlamadasReport)
    pr = await _latest(TeleventasProduccionReport)
    crm = await _latest(TeleventasCrmReport)
    if ll:
        await _heal_llamadas_diario(db, ll)
    llk = (ll.data or {}).get("kpis", {}) if ll else {}
    prk = (pr.data or {}).get("kpis", {}) if pr else {}
    crmk = (crm.data or {}).get("kpis", {}) if crm else {}
    contestadas = llk.get("contestadas", 0)
    polizas = prk.get("polizas_emitidas", 0)
    conversion = round(polizas / contestadas * 100, 1) if contestadas else 0.0
    return {
        "mes": month,
        "gestiones_crm": crmk.get("total_gestiones", 0),
        "tasa_contacto_crm": crmk.get("tasa_contacto_pct", 0.0),
        "aceptas_crm": crmk.get("aceptas", 0),
        "agendados_crm": crmk.get("agendados", 0),
        "tasa_aceptacion_crm": crmk.get("tasa_aceptacion_pct", 0.0),
        "prom_gestiones_operador_dia": crmk.get("prom_gestiones_operador_dia", 0.0),
        "tiene_crm": crm is not None,
        "total_llamadas": llk.get("total_llamadas", 0),
        "contestadas": contestadas,
        "llamadas_prom_dia": llk.get("promedio_diario", 0),
        "llamadas_prom_asesor_dia": llk.get("promedio_llamadas_asesor_dia", 0),
        "agentes_activos": llk.get("vendedores_activos", 0),
        # Dotación REAL por día (mediana de asesores efectivos): no cuenta rotaciones
        # ni cuentas con actividad marginal — es la base del simulador.
        "agentes_efectivos": llk.get("asesores_efectivos_mediana_dia", 0),
        "dias_operativos": llk.get("dias_operativos", 0),
        "contactabilidad": llk.get("pct_contestadas", 0),
        "tmo_hms": llk.get("tmo_hms", "00:00:00"),
        "polizas_emitidas": polizas,
        "prima_emitida": prk.get("prima_emitida", 0),
        "prima_neta": prk.get("prima_neta", 0),
        "ticket_promedio": prk.get("ticket_promedio", 0),
        "dias_productivos": prk.get("dias_productivos", 0),
        "conversion_pct": conversion,
        "tiene_llamadas": ll is not None,
        "tiene_produccion": pr is not None,
    }


@router.get("/comparar")
async def televentas_comparar(
    meses: str = Query(..., description="2 o 3 meses YYYY-MM separados por coma, ej: 2026-05,2026-07"),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Comparación de MESES SELECCIONADOS por el usuario (2 o 3): métricas generales
    por mes lado a lado, rendimiento por operador mes a mes e insights entre extremos."""
    sel = sorted({m.strip() for m in meses.split(",") if m.strip()})
    if not 2 <= len(sel) <= 3:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Seleccioná 2 o 3 meses (YYYY-MM).")

    disponibles: set[str] = set()
    for Model in (TeleventasLlamadasReport, TeleventasProduccionReport, TeleventasCrmReport):
        for (pm,) in (await db.execute(
            select(Model.period_month).where(Model.period_month.isnot(None), Model.is_published == True)  # noqa: E712
        )).all():
            if pm:
                disponibles.add(pm.strftime("%Y-%m"))
    faltan = [m for m in sel if m not in disponibles]
    if faltan:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Sin datos publicados para: {', '.join(faltan)}")

    generales = [await _metricas_del_mes(db, m) for m in sel]
    ovs = {m: await _overview_del_mes(db, m) for m in sel}

    # ---- por operador: unión de vendedores de todos los meses seleccionados ----
    vendedores: dict[str, dict] = {}
    for m in sel:
        for v in ovs[m].get("por_vendedor", []):
            slot = vendedores.setdefault(v["vendedor"], {"es_equipo": False, "por_mes": {}})
            slot["es_equipo"] = slot["es_equipo"] or bool(v.get("es_equipo"))
            slot["por_mes"][m] = {
                "llamadas": v.get("llamadas", 0),
                "contactadas": v.get("contestadas", 0),
                "contacto_pct": v.get("pct_contestadas", 0),
                "polizas": v.get("polizas", 0),
                "prima_emitida": v.get("prima_emitida", 0),
                "conversion_pct": v.get("conversion_pct", 0),
            }
    primero, ultimo = sel[0], sel[-1]

    def _pct_delta(cur: float, prev: float):
        return round((cur - prev) / abs(prev) * 100, 1) if prev else None

    filas = []
    for nombre, slot in vendedores.items():
        a = slot["por_mes"].get(primero)
        b = slot["por_mes"].get(ultimo)
        prima_pct = _pct_delta((b or {}).get("prima_emitida", 0), (a or {}).get("prima_emitida", 0))
        estado = "estable"
        if a is None and b is not None:
            estado = "nuevo"
        elif b is None:
            estado = "salio"
        elif prima_pct is not None and prima_pct <= -25:
            estado = "cayo"
        elif prima_pct is not None and prima_pct >= 25:
            estado = "subio"
        filas.append({"vendedor": nombre, "es_equipo": slot["es_equipo"], "estado": estado,
                      "por_mes": slot["por_mes"], "prima_delta_pct": prima_pct})
    filas.sort(key=lambda x: -(x["por_mes"].get(ultimo, x["por_mes"].get(primero, {})).get("prima_emitida", 0)))

    comp = comparativo_televentas(ovs[primero], ovs[ultimo], primero, ultimo)
    return {"meses": sel, "generales": generales, "por_operador": filas,
            "insights": comp["insights"], "extremos": {"desde": primero, "hasta": ultimo},
            "available_months": sorted(disponibles, reverse=True)}


# ============================ ANALIZADOR (método científico) ============================
async def _ejecutar_analizador(db: AsyncSession, meses: list[str], objetivo_prima: float,
                               consulta: Optional[str], created_by: str) -> dict:
    """Corre el análisis científico sobre los meses del comparativo, persiste el log
    (hipótesis + datos + conclusión) y devuelve el resultado con el id del registro."""
    sel = sorted({m.strip() for m in meses if m and m.strip()})
    if not 2 <= len(sel) <= 3:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Seleccioná 2 o 3 meses (YYYY-MM).")
    generales = [await _metricas_del_mes(db, m) for m in sel]
    sin_datos = [g["mes"] for g in generales if not g.get("tiene_llamadas") or not g.get("tiene_produccion")]
    if sin_datos:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Meses sin llamadas y producción publicadas: {', '.join(sin_datos)}")
    resultado = analizar_cientifico(generales, objetivo_prima, consulta)
    if not resultado.get("disponible"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, resultado.get("mensaje", "Análisis no disponible."))

    log = TeleventasAnalisis(
        created_by=created_by,
        meses=",".join(sel),
        objetivo_prima=float(objetivo_prima),
        consulta=resultado.get("consulta"),
        hipotesis=resultado["hipotesis"],
        alcanzado=resultado["observacion"]["alcanzado"],
        brecha_pct=resultado["observacion"]["brecha_pct"],
        conclusion=resultado["conclusion"],
        data={**resultado, "generales": generales},
    )
    db.add(log)
    await db.commit()
    return {**resultado, "log_id": log.id, "meses": sel, "generales": generales}


@router.post("/analizador")
async def televentas_analizador_run(
    payload: AnalizadorRequest, request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Ejecuta el ANALIZADOR sobre los meses seleccionados del comparativo.
    Hipótesis fija: producción (prima neta del mes más reciente) vs objetivo; la
    `consulta` del usuario se incorpora a la hipótesis. Deja registro (log)."""
    out = await _ejecutar_analizador(db, payload.meses, payload.objetivo_prima,
                                     payload.consulta, created_by=user.id)
    await record_action(db, user_id=user.id, action="run_televentas_analizador",
                        resource_type="televentas_analisis", resource_id=out["log_id"],
                        ip=client_ip(request),
                        extra={"meses": out["meses"], "objetivo": payload.objetivo_prima})
    return out


@router.get("/analizador/logs")
async def televentas_analizador_logs(
    limit: int = Query(20, ge=1, le=100),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Historial de hipótesis analizadas (para análisis posterior)."""
    rows = (await db.execute(
        select(TeleventasAnalisis).order_by(TeleventasAnalisis.created_at.desc()).limit(limit)
    )).scalars().all()
    return {"logs": [{
        "id": a.id, "created_at": a.created_at.isoformat() if a.created_at else None,
        "created_by": a.created_by, "tipo": getattr(a, "tipo", "mensual") or "mensual", "meses": a.meses,
        "objetivo_prima": float(a.objetivo_prima or 0), "consulta": a.consulta,
        "hipotesis": a.hipotesis, "alcanzado": a.alcanzado,
        "brecha_pct": float(a.brecha_pct) if a.brecha_pct is not None else None,
        "conclusion": a.conclusion,
    } for a in rows]}


@router.get("/analizador/resumen")
async def televentas_analizador_resumen(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Breve reseña SIEMPRE visible al entrar al comparativo/semanal: últimos
    análisis registrados + compromisos de reunión pendientes."""
    rows = (await db.execute(
        select(TeleventasAnalisis).order_by(TeleventasAnalisis.created_at.desc()).limit(3)
    )).scalars().all()
    pendientes = (await db.execute(
        select(TeleventasCompromiso).where(TeleventasCompromiso.estado != "cumplido")
        .order_by(TeleventasCompromiso.created_at.desc())
    )).scalars().all()
    return {
        "ultimos_analisis": [{
            "id": a.id, "tipo": getattr(a, "tipo", "mensual") or "mensual",
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "meses": a.meses, "alcanzado": a.alcanzado,
            "objetivo_prima": float(a.objetivo_prima or 0),
            "cumplimiento_pct": ((a.data or {}).get("observacion") or {}).get("cumplimiento_pct"),
        } for a in rows],
        "compromisos_pendientes": len(pendientes),
        "compromisos_recientes": [{
            "id": c.id, "semana": c.semana, "descripcion": c.descripcion,
            "responsable": c.responsable, "estado": c.estado,
        } for c in pendientes[:5]],
    }


# ============================ REPORTE SEMANAL ============================
async def _series_diarias(db: AsyncSession) -> tuple[list[dict], list[dict], list[dict]]:
    """Series DIARIAS completas (todos los meses publicados): llamadas (sanadas),
    producción y gestiones CRM — insumo de la agregación semanal."""
    months: set[str] = set()
    for Model in (TeleventasLlamadasReport, TeleventasProduccionReport, TeleventasCrmReport):
        for (pm,) in (await db.execute(
            select(Model.period_month).where(Model.period_month.isnot(None), Model.is_published == True)  # noqa: E712
        )).all():
            if pm:
                months.add(pm.strftime("%Y-%m"))

    dias_ll: list[dict] = []
    dias_pr: list[dict] = []
    dias_crm: list[dict] = []
    for m in sorted(months):
        start, end = _month_bounds(m)

        async def _latest(Model):
            return (await db.execute(
                select(Model).where(Model.period_month >= start, Model.period_month < end,
                                    Model.is_published == True)  # noqa: E712
                .order_by(Model.generated_at.desc()).limit(1)
            )).scalars().first()

        ll = await _latest(TeleventasLlamadasReport)
        if ll:
            await _heal_llamadas_diario(db, ll)
            dias_ll.extend((ll.data or {}).get("por_dia") or [])
        pr = await _latest(TeleventasProduccionReport)
        if pr:
            dias_pr.extend((pr.data or {}).get("por_dia") or [])
        crm = await _latest(TeleventasCrmReport)
        if crm:
            dias_crm.extend((crm.data or {}).get("por_dia") or [])
    return dias_ll, dias_pr, dias_crm


@router.get("/semanal")
async def televentas_semanal(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Reporte SEMANAL: métricas por semana ISO (llamadas + producción + CRM) y
    evaluación inter-semanal (mejoras/desmejoras/datos llamativos) de cada semana."""
    dias_ll, dias_pr, dias_crm = await _series_diarias(db)
    semanas = agrupar_semanas(dias_ll, dias_pr, dias_crm)
    evaluaciones = {s["semana"]: evaluar_semana(semanas, s["semana"]) for s in semanas}
    return {"semanas": semanas, "evaluaciones": evaluaciones}


@router.post("/semanal/analizador")
async def televentas_semanal_analizador(
    payload: SemanalAnalizadorRequest, request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Analizador SEMANAL (mismo método científico): objetivo de la semana vs
    producción, referencia = semanas completas previas. Deja registro (log)."""
    dias_ll, dias_pr, dias_crm = await _series_diarias(db)
    semanas = agrupar_semanas(dias_ll, dias_pr, dias_crm)
    resultado = analizar_semana(semanas, payload.semana.strip(), payload.objetivo_prima, payload.consulta)
    if not resultado.get("disponible"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, resultado.get("mensaje", "Análisis no disponible."))

    periodos = resultado.get("semanas_referencia", []) + [payload.semana.strip()]
    log = TeleventasAnalisis(
        created_by=user.id, tipo="semanal",
        meses=",".join(periodos)[:64],
        objetivo_prima=float(payload.objetivo_prima),
        consulta=resultado.get("consulta"),
        hipotesis=resultado["hipotesis"],
        alcanzado=resultado["observacion"]["alcanzado"],
        brecha_pct=resultado["observacion"]["brecha_pct"],
        conclusion=resultado["conclusion"],
        data=resultado,
    )
    db.add(log)
    await db.commit()
    await record_action(db, user_id=user.id, action="run_televentas_analizador_semanal",
                        resource_type="televentas_analisis", resource_id=log.id,
                        ip=client_ip(request), extra={"semana": payload.semana, "objetivo": payload.objetivo_prima})
    return {**resultado, "log_id": log.id, "periodos": periodos}


# ---- Compromisos de la reunión semanal (Voicenter ↔ Sudameris) ----
def _compromiso_out(c: TeleventasCompromiso) -> dict:
    return {"id": c.id, "semana": c.semana, "descripcion": c.descripcion,
            "responsable": c.responsable, "estado": c.estado, "nota": c.nota,
            "created_by": c.created_by,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None}


@router.get("/semanal/compromisos")
async def listar_compromisos(
    semana: Optional[str] = Query(None, description="Filtrar por semana YYYY-Www"),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    q = select(TeleventasCompromiso).order_by(TeleventasCompromiso.semana.desc(),
                                              TeleventasCompromiso.created_at.asc())
    if semana:
        q = q.where(TeleventasCompromiso.semana == semana.strip())
    rows = (await db.execute(q)).scalars().all()
    return {"compromisos": [_compromiso_out(c) for c in rows]}


@router.post("/semanal/compromisos", status_code=status.HTTP_201_CREATED)
async def crear_compromiso(
    payload: CompromisoCreate, request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if payload.responsable not in ("Voicenter", "Sudameris"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Responsable debe ser Voicenter o Sudameris.")
    if not payload.descripcion.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El compromiso necesita una descripción.")
    c = TeleventasCompromiso(semana=payload.semana.strip(), descripcion=payload.descripcion.strip(),
                             responsable=payload.responsable, created_by=user.id)
    db.add(c)
    await db.commit()
    await record_action(db, user_id=user.id, action="create_televentas_compromiso",
                        resource_type="televentas_compromiso", resource_id=c.id,
                        ip=client_ip(request), extra={"semana": c.semana, "responsable": c.responsable})
    return _compromiso_out(c)


@router.patch("/semanal/compromisos/{compromiso_id}")
async def actualizar_compromiso(
    compromiso_id: str, payload: CompromisoUpdate, request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    c = await db.get(TeleventasCompromiso, compromiso_id)
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Compromiso no encontrado")
    if payload.estado is not None:
        if payload.estado not in ("pendiente", "en_proceso", "cumplido"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Estado inválido.")
        c.estado = payload.estado
    if payload.nota is not None:
        c.nota = payload.nota.strip() or None
    if payload.descripcion is not None and payload.descripcion.strip():
        c.descripcion = payload.descripcion.strip()
    await db.commit()
    await record_action(db, user_id=user.id, action="update_televentas_compromiso",
                        resource_type="televentas_compromiso", resource_id=c.id,
                        ip=client_ip(request), extra={"estado": c.estado})
    return _compromiso_out(c)


@router.delete("/semanal/compromisos/{compromiso_id}")
async def borrar_compromiso(
    compromiso_id: str, request: Request,
    user: CurrentUser = Depends(require_analyst_or_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    c = await db.get(TeleventasCompromiso, compromiso_id)
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Compromiso no encontrado")
    await db.delete(c)
    await db.commit()
    await record_action(db, user_id=user.id, action="delete_televentas_compromiso",
                        resource_type="televentas_compromiso", resource_id=compromiso_id, ip=client_ip(request))
    return {"status": "deleted", "id": compromiso_id}


@router.get("/analizador/logs/{log_id}")
async def televentas_analizador_log(
    log_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Detalle completo de un análisis registrado (datos con los que se corrió)."""
    a = await db.get(TeleventasAnalisis, log_id)
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Análisis no encontrado")
    return {"id": a.id, "created_at": a.created_at.isoformat() if a.created_at else None,
            "created_by": a.created_by, "meses": a.meses,
            "objetivo_prima": float(a.objetivo_prima or 0), "consulta": a.consulta,
            "hipotesis": a.hipotesis, "alcanzado": a.alcanzado,
            "brecha_pct": float(a.brecha_pct) if a.brecha_pct is not None else None,
            "conclusion": a.conclusion, "data": a.data}


async def _parametros_simulador(db: AsyncSession, meses_sel: Optional[list[str]] = None) -> dict:
    """Parámetros REALES para el simulador.

    Solo meses publicados COMPLETOS (llamadas Y producción > 0; excluye el mes en
    curso). El usuario elige qué meses alimentan el modelo (`meses_sel`); default =
    últimos 3. Las tasas se calculan sobre los TOTALES de los meses elegidos (pooled),
    no como promedio de porcentajes — un mes atípico (ej. mayo con conversión 8,5%
    vs julio 4,3%) pesa según su volumen real y se puede excluir."""
    months = set()
    for Model in (TeleventasLlamadasReport, TeleventasProduccionReport):
        for (pm,) in (await db.execute(
            select(Model.period_month).where(Model.period_month.isnot(None), Model.is_published == True)  # noqa: E712
        )).all():
            if pm:
                months.add(pm.strftime("%Y-%m"))
    completos: list[dict] = []
    for m in sorted(months, reverse=True):
        g = await _metricas_del_mes(db, m)
        if g.get("polizas_emitidas", 0) > 0 and g.get("total_llamadas", 0) > 0:
            completos.append(g)
        if len(completos) >= 12:
            break
    if not completos:
        return {"disponible": False, "meses_usados": [], "meses_disponibles": [],
                "mensaje": "No hay meses publicados completos (con llamadas y producción)."}

    # Detalle por mes para que el gerente vea la dispersión y elija.
    disponibles = [{
        "mes": g["mes"],
        "conversion_pct": g.get("conversion_pct", 0),
        "contactabilidad_pct": g.get("contactabilidad", 0),
        "ticket_promedio": g.get("ticket_promedio", 0),
        "llamadas_asesor_dia": g.get("llamadas_prom_asesor_dia", 0),
        "polizas": g.get("polizas_emitidas", 0),
        "llamadas": g.get("total_llamadas", 0),
        # Dotación efectiva por día (mediana); si el reporte es viejo y no se pudo
        # sanar, cae al conteo bruto de nombres del mes.
        "agentes": g.get("agentes_efectivos") or g.get("agentes_activos", 0),
        "agentes_nombres": g.get("agentes_activos", 0),
    } for g in completos]

    sel = [g for g in completos if g["mes"] in (meses_sel or [])]
    if not sel:
        sel = completos[:3]

    # ---- Tasas POOLED sobre los totales de los meses seleccionados ----
    t_llam = sum(float(g.get("total_llamadas") or 0) for g in sel)
    t_cont = sum(float(g.get("contestadas") or 0) for g in sel)
    t_pol = sum(float(g.get("polizas_emitidas") or 0) for g in sel)
    t_emit = sum(float(g.get("prima_emitida") or 0) for g in sel)
    t_neta = sum(float(g.get("prima_neta") or 0) for g in sel)

    def _avg(key: str) -> float:
        vals = [float(g.get(key) or 0) for g in sel]
        return sum(vals) / len(vals) if vals else 0.0

    return {
        "disponible": True,
        "meses_usados": [g["mes"] for g in sel],
        "meses_disponibles": disponibles,
        "ticket_promedio": round(t_emit / t_pol) if t_pol else 0,
        "conversion_pct": round(t_pol / t_cont * 100, 2) if t_cont else 0.0,
        "contactabilidad_pct": round(t_cont / t_llam * 100, 1) if t_llam else 0.0,
        "llamadas_asesor_dia": round(_avg("llamadas_prom_asesor_dia"), 1),
        "dias_habiles": round(_avg("dias_operativos")) or 21,
        "tasa_anulacion_pct": round((t_emit - t_neta) / t_emit * 100, 1) if t_emit else 0.0,
        "intentos_por_registro": 2.0,  # marcaciones promedio por registro de base (ajustable)
    }


@router.get("/simulador")
async def televentas_simulador(
    meta_prima: Optional[float] = Query(None, description="Meta de prima NETA mensual (Gs)"),
    asesores: Optional[float] = Query(None, description="Dotación disponible"),
    registros: Optional[float] = Query(None, description="Registros de base disponibles (insumo)"),
    meses: Optional[str] = Query(None, description="Meses base del modelo, YYYY-MM separados por coma"),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Simulador gerencial de ventas. Sin argumentos devuelve los parámetros reales;
    con `meta_prima`, `asesores` o `registros` devuelve además la simulación.
    `meses` define qué meses alimentan las tasas (default: últimos 3 completos)."""
    meses_sel = [m.strip() for m in meses.split(",") if m.strip()] if meses else None
    params = await _parametros_simulador(db, meses_sel)
    out: dict = {"parametros": params}
    if params.get("disponible"):
        out["regresion"] = await _regresion_diaria_meses(db, params.get("meses_usados", []))
    if params.get("disponible") and (meta_prima is not None or asesores is not None or registros is not None):
        out["resultado"] = simular(params, meta_prima=meta_prima, asesores=asesores, registros=registros)
        if meta_prima is not None:
            out["escenarios"] = escenarios(params, meta_prima)
    return out


async def _heal_llamadas_diario(db: AsyncSession, report: TeleventasLlamadasReport) -> None:
    """Self-heal: recalcula la serie `por_dia` (TMO diario, asesores efectivos y
    promedio por asesor SOLO sobre efectivos) y los KPIs derivados en reportes
    generados antes de estas reglas, re-leyendo el archivo original del upload.
    Se persiste una sola vez; si el archivo ya no existe, se omite en silencio."""
    data = report.data or {}
    por_dia = data.get("por_dia") or []
    if not por_dia or all("tmo_seg" in d and "asesores_efectivos" in d for d in por_dia):
        return
    upload = await db.get(TeleventasLlamadasUpload, report.upload_id)
    if not upload or not upload.file_path or not Path(upload.file_path).exists():
        return
    try:
        rows = await asyncio.to_thread(parse_televentas_llamadas, upload.file_path)
    except Exception:
        return
    umbral = (data.get("kpis") or {}).get("umbral_contestada_seg", 34)
    nuevo_por_dia, dia_stats = por_dia_llamadas(rows, umbral)
    report.data = {**data, "por_dia": nuevo_por_dia,
                   "kpis": {**(data.get("kpis") or {}), **dia_stats}}
    await db.commit()


async def _regresion_diaria_meses(db: AsyncSession, meses: list[str]) -> dict:
    """Dataset DIARIO de los meses seleccionados: contestadas/día (llamadas) unido con
    pólizas y prima/día (producción) por fecha, + regresiones OLS por el origen.
    Cada punto incluye además asesores activos, promedio de llamadas por asesor y
    TMO del día — insumo de los gráficos de ritmo y tiempo medio del simulador."""
    puntos: list[dict] = []
    for m in meses:
        start, end = _month_bounds(m)

        async def _latest(Model):
            return (await db.execute(
                select(Model).where(Model.period_month >= start, Model.period_month < end,
                                    Model.is_published == True)  # noqa: E712
                .order_by(Model.generated_at.desc()).limit(1)
            )).scalars().first()

        ll = await _latest(TeleventasLlamadasReport)
        pr = await _latest(TeleventasProduccionReport)
        if not ll:
            continue
        await _heal_llamadas_diario(db, ll)
        prod_dia = {d.get("fecha"): d for d in ((pr.data or {}).get("por_dia") or [])} if pr else {}
        for d in ((ll.data or {}).get("por_dia") or []):
            f = d.get("fecha")
            if not f:
                continue
            pd = prod_dia.get(f, {})
            # Día con marcación: pólizas/prima 0 si no hubo emisión ese día (cero real).
            puntos.append({"fecha": f, "contestadas": d.get("contestadas", 0),
                           "polizas": pd.get("polizas", 0), "prima": pd.get("prima", 0),
                           "asesores_activos": d.get("asesores_activos", 0),
                           "asesores_efectivos": d.get("asesores_efectivos", d.get("asesores_activos", 0)),
                           "promedio_por_asesor": d.get("promedio_por_asesor", 0),
                           "tmo_seg": d.get("tmo_seg", 0)})
    puntos.sort(key=lambda p: p["fecha"])
    return regresion_diaria(puntos)


@router.get("/tendencias")
async def televentas_tendencias(
    meses: int = Query(12, ge=2, le=24, description="Máximo de meses a incluir (más recientes)"),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Serie de TENDENCIA multi-mes (publicados): conversión, llamadas totales y
    promedio, agentes activos, contactabilidad, prima, etc. + insights de tendencia."""
    months = set()
    for Model in (TeleventasLlamadasReport, TeleventasProduccionReport, TeleventasCrmReport):
        for (pm,) in (await db.execute(
            select(Model.period_month).where(Model.period_month.isnot(None), Model.is_published == True)  # noqa: E712
        )).all():
            if pm:
                months.add(pm.strftime("%Y-%m"))
    ordenados = sorted(months)  # cronológico ascendente
    seleccion = ordenados[-meses:]
    serie = [await _metricas_del_mes(db, m) for m in seleccion]
    insights = analizar_tendencia_mensual(serie)
    return {"meses": serie, "insights": insights, "total_meses": len(serie)}
