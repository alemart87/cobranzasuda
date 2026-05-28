"""Endpoints para Bases Adicionales y Carteras Totales."""
from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Optional

from fastapi import (
    APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Request,
    UploadFile, status,
)
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import settings
from ...core.database import get_db
from ...jobs.base_adicional_runner import process_base_adicional_upload
from ...models.base_adicional_report import BaseAdicionalReport
from ...models.base_adicional_upload import BaseAdicionalUpload
from ...models.report import Report
from ...schemas.bases_adicionales import (
    BaseAdicionalReportDetail, BaseAdicionalReportList, BaseAdicionalReportSummary,
    BaseAdicionalUploadList, BaseAdicionalUploadRead, CarterasTotalesResponse,
    CarteraResumen, VALID_TIPOS,
)
from ...services.audit_service import record_action
from ..deps import CurrentUser, client_ip, get_current_user, require_analyst_or_admin


TIPO_LABELS = {
    "debitos_automaticos": "Débitos Automáticos",
    "bancard": "Bancard",
}


class PublishRequest(BaseModel):
    is_published: bool
    title: str | None = None


router = APIRouter(prefix="/bases-adicionales", tags=["bases-adicionales"])


async def _save_file(file: UploadFile, upload_id: str) -> tuple[str, str, str]:
    if not file.filename:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Archivo sin nombre")
    target_dir = settings.upload_path / "bases-adicionales" / upload_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / file.filename
    sha = hashlib.sha256()
    content = await file.read()
    sha.update(content)
    if len(content) > settings.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Archivo excede {settings.max_upload_size_mb}MB",
        )
    target.write_bytes(content)
    return file.filename, str(target.resolve()), sha.hexdigest()


@router.post("/uploads", response_model=BaseAdicionalUploadRead,
             status_code=status.HTTP_202_ACCEPTED)
async def create_base_adicional_upload(
    background_tasks: BackgroundTasks,
    request: Request,
    tipo: str = Form(..., description="debitos_automaticos | bancard"),
    file: UploadFile = File(..., description="Archivo XLSX con la cartera"),
    period_month: Optional[str] = Form(None),
    user: CurrentUser = Depends(require_analyst_or_admin),
    db: AsyncSession = Depends(get_db),
) -> BaseAdicionalUpload:
    if tipo not in VALID_TIPOS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"tipo inválido. Permitidos: {sorted(VALID_TIPOS)}",
        )

    period_date = None
    if period_month:
        try:
            period_date = datetime.strptime(period_month, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "period_month debe ser YYYY-MM-DD",
            )

    upload = BaseAdicionalUpload(
        tipo=tipo,
        uploaded_by=user.id,
        status="pending",
        period_month=period_date,
    )
    db.add(upload)
    await db.commit()
    await db.refresh(upload)

    upload.filename, upload.file_path, upload.file_sha256 = await _save_file(
        file, upload.id,
    )
    await db.commit()

    await record_action(
        db, user_id=user.id, action="create_base_adicional_upload",
        resource_type="base_adicional_upload", resource_id=upload.id,
        ip=client_ip(request),
        extra={"tipo": tipo, "period_month": period_month},
    )

    background_tasks.add_task(process_base_adicional_upload, upload.id)
    return upload


@router.get("/uploads", response_model=BaseAdicionalUploadList)
async def list_base_adicional_uploads(
    tipo: Optional[str] = Query(None),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BaseAdicionalUploadList:
    stmt = select(BaseAdicionalUpload).order_by(BaseAdicionalUpload.uploaded_at.desc()).limit(100)
    if tipo:
        if tipo not in VALID_TIPOS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "tipo inválido")
        stmt = (
            select(BaseAdicionalUpload)
            .where(BaseAdicionalUpload.tipo == tipo)
            .order_by(BaseAdicionalUpload.uploaded_at.desc())
            .limit(100)
        )
    result = await db.execute(stmt)
    items = result.scalars().all()
    return BaseAdicionalUploadList(
        items=[BaseAdicionalUploadRead.model_validate(u) for u in items],
        total=len(items),
    )


@router.get("/uploads/{upload_id}", response_model=BaseAdicionalUploadRead)
async def get_base_adicional_upload(
    upload_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BaseAdicionalUpload:
    upload = await db.get(BaseAdicionalUpload, upload_id)
    if not upload:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Upload no encontrado")
    return upload


@router.get("/reports", response_model=BaseAdicionalReportList)
async def list_base_adicional_reports(
    tipo: Optional[str] = Query(None),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BaseAdicionalReportList:
    stmt = select(BaseAdicionalReport).order_by(BaseAdicionalReport.generated_at.desc()).limit(100)
    conds = []
    if tipo:
        if tipo not in VALID_TIPOS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "tipo inválido")
        conds.append(BaseAdicionalReport.tipo == tipo)
    if user.is_client:
        conds.append(BaseAdicionalReport.is_published == True)  # noqa: E712
    if conds:
        stmt = (
            select(BaseAdicionalReport)
            .where(*conds)
            .order_by(BaseAdicionalReport.generated_at.desc())
            .limit(100)
        )
    result = await db.execute(stmt)
    items = result.scalars().all()
    return BaseAdicionalReportList(
        items=[BaseAdicionalReportSummary.model_validate(r) for r in items],
        total=len(items),
    )


@router.get("/reports/{report_id}", response_model=BaseAdicionalReportDetail)
async def get_base_adicional_report(
    report_id: str, request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BaseAdicionalReport:
    report = await db.get(BaseAdicionalReport, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reporte no encontrado")
    if user.is_client and not report.is_published:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Reporte no publicado")
    await record_action(
        db, user_id=user.id, action="view_base_adicional_report",
        resource_type="base_adicional_report", resource_id=report_id,
        ip=client_ip(request), extra={"role": user.role, "tipo": report.tipo},
    )
    return report


@router.post("/reports/{report_id}/publish", response_model=BaseAdicionalReportSummary)
async def publish_base_adicional_report(
    report_id: str, payload: PublishRequest, request: Request,
    user: CurrentUser = Depends(require_analyst_or_admin),
    db: AsyncSession = Depends(get_db),
) -> BaseAdicionalReport:
    report = await db.get(BaseAdicionalReport, report_id)
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
        action="publish_base_adicional_report" if payload.is_published else "unpublish_base_adicional_report",
        resource_type="base_adicional_report", resource_id=report_id, ip=client_ip(request),
    )
    return report


@router.delete("/reports/{report_id}")
async def delete_base_adicional_report(
    report_id: str, request: Request,
    user: CurrentUser = Depends(require_analyst_or_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    report = await db.get(BaseAdicionalReport, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reporte no encontrado")
    await db.delete(report)
    await db.commit()
    await record_action(
        db, user_id=user.id, action="delete_base_adicional_report",
        resource_type="base_adicional_report", resource_id=report_id, ip=client_ip(request),
    )
    return {"status": "deleted", "report_id": report_id}


# -------- Carteras Totales (vista gerencial agregada) --------


def _tramos_from_report_data(data: dict) -> dict[str, float]:
    """Extrae el desglose por tramos del JSON del report (DXP o base adicional)."""
    # Caso BaseAdicional: tiene `kpis.tramo_*` directos.
    kpis = data.get("kpis") or {}
    if "tramo_a_vencer" in kpis:
        return {
            "a_vencer": float(kpis.get("tramo_a_vencer", 0)),
            "h_30": float(kpis.get("tramo_h_30", 0)),
            "h_60": float(kpis.get("tramo_h_60", 0)),
            "h_90": float(kpis.get("tramo_h_90", 0)),
            "h_120": float(kpis.get("tramo_h_120", 0)),
            "h_150": float(kpis.get("tramo_h_150", 0)),
            "m_150": float(kpis.get("tramo_m_150", 0)),
        }
    # Caso DXP/Report — el cartera analyzer guarda `tramos_cartera` con la lista
    # ordenada por tramo. Lo normalizamos.
    out = {"a_vencer": 0.0, "h_30": 0.0, "h_60": 0.0, "h_90": 0.0,
           "h_120": 0.0, "h_150": 0.0, "m_150": 0.0}
    tramos = (data.get("cartera") or {}).get("tramos") or data.get("tramos") or []
    name_map = {
        "a vencer": "a_vencer", "avencer": "a_vencer",
        "hasta 30": "h_30", "hasta 30 dias": "h_30", "hasta 30 días": "h_30",
        "hasta 60": "h_60", "hasta 60 dias": "h_60", "hasta 60 días": "h_60",
        "hasta 90": "h_90", "hasta 90 dias": "h_90", "hasta 90 días": "h_90",
        "hasta 120": "h_120", "hasta 120 dias": "h_120", "hasta 120 días": "h_120",
        "hasta 150": "h_150", "hasta 150 dias": "h_150", "hasta 150 días": "h_150",
        "mas 150": "m_150", "más 150": "m_150", "más 150 días": "m_150",
    }
    for t in tramos:
        n = str(t.get("tramo", "")).lower().strip()
        slot = name_map.get(n)
        if slot:
            out[slot] += float(t.get("monto", 0) or 0)
    return out


# Tramos que cuentan como "vencido" (en mora) — todos menos "a vencer".
_MORA_KEYS = ("h_30", "h_60", "h_90", "h_120", "h_150", "m_150")


def _vencido_from_tramos(tramos: dict[str, float]) -> float:
    return float(sum(tramos.get(k, 0.0) for k in _MORA_KEYS))


@router.get("/carteras-totales", response_model=CarterasTotalesResponse,
            tags=["carteras-totales"])
async def get_carteras_totales(
    period_month: Optional[str] = Query(None, description="YYYY-MM-DD; default = más reciente"),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CarterasTotalesResponse:
    """Vista gerencial: suma de DXP + Débitos Automáticos + Bancard.

    Cada cartera se reporta por separado (NO se mezclan filas), y se devuelve
    también un total general. Toma el último reporte publicado por cliente o
    cualquier último reporte por analista/admin.
    """
    period_date = None
    if period_month:
        try:
            period_date = datetime.strptime(period_month, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "period_month YYYY-MM-DD")

    only_published = user.is_client

    # DXP (Report principal)
    dxp_stmt = select(Report).order_by(Report.generated_at.desc())
    if only_published:
        dxp_stmt = dxp_stmt.where(Report.is_published == True)  # noqa: E712
    if period_date:
        dxp_stmt = dxp_stmt.where(Report.period_month == period_date)
    dxp_stmt = dxp_stmt.limit(1)
    dxp_report = (await db.execute(dxp_stmt)).scalar_one_or_none()

    carteras: list[CarteraResumen] = []
    if dxp_report:
        data = dxp_report.data or {}
        # Report tiene columnas denormalizadas (polizas_total, asegurados_total,
        # saldo_total, vencido_total); el cartera analyzer las repite en
        # data.cartera.kpis con sufijo _total. Usamos la columna y caemos al JSON.
        cartera_kpis = (data.get("cartera") or {}).get("kpis") or {}
        tramos = _tramos_from_report_data(data)
        saldo_total = float(dxp_report.saldo_total or cartera_kpis.get("saldo_total", 0) or 0)
        vencido = float(dxp_report.vencido_total or cartera_kpis.get("vencido_total", 0) or 0)
        # El analyzer de cartera DXP no trackea "A vencer" por separado:
        # lo derivamos como saldo_total - vencido para que el desglose cierre.
        if not tramos.get("a_vencer"):
            tramos["a_vencer"] = max(saldo_total - vencido, 0.0)
        carteras.append(CarteraResumen(
            nombre="Cartera DXP",
            fuente="dxp",
            polizas=int(dxp_report.polizas_total or cartera_kpis.get("polizas_total", 0) or 0),
            asegurados=int(dxp_report.asegurados_total or cartera_kpis.get("asegurados_total", 0) or 0),
            asegurados_mora=int(dxp_report.asegurados_en_mora or cartera_kpis.get("asegurados_en_mora", 0) or 0),
            saldo_total=saldo_total,
            saldo_mora=vencido,
            tramos=tramos,
            recibe_pagos=True,
            period_month=dxp_report.period_month,
            report_id=dxp_report.id,
            generated_at=dxp_report.generated_at,
        ))

    # Bases adicionales: una por tipo (el más reciente)
    for tipo in ("debitos_automaticos", "bancard"):
        bstmt = (
            select(BaseAdicionalReport)
            .where(BaseAdicionalReport.tipo == tipo)
            .order_by(BaseAdicionalReport.generated_at.desc())
        )
        if only_published:
            bstmt = bstmt.where(BaseAdicionalReport.is_published == True)  # noqa: E712
        if period_date:
            bstmt = bstmt.where(BaseAdicionalReport.period_month == period_date)
        bstmt = bstmt.limit(1)
        rep = (await db.execute(bstmt)).scalar_one_or_none()
        if not rep:
            continue
        rdata = rep.data or {}
        tramos = _tramos_from_report_data(rdata)
        rep_kpis = rdata.get("kpis") or {}
        carteras.append(CarteraResumen(
            nombre=f"Base {TIPO_LABELS[tipo]}",
            fuente=tipo,
            polizas=int(rep.polizas or 0),
            asegurados=int(rep.asegurados or 0),
            asegurados_mora=int(rep_kpis.get("asegurados_en_mora", 0) or 0),
            saldo_total=float(rep.saldo_total or 0),
            saldo_mora=_vencido_from_tramos(tramos),
            tramos=tramos,
            recibe_pagos=False,
            period_month=rep.period_month,
            report_id=rep.id,
            generated_at=rep.generated_at,
        ))

    totales = {
        "polizas": float(sum(c.polizas for c in carteras)),
        "asegurados": float(sum(c.asegurados for c in carteras)),
        "asegurados_mora": float(sum(c.asegurados_mora for c in carteras)),
        "saldo_total": float(sum(c.saldo_total for c in carteras)),
        "saldo_mora": float(sum(c.saldo_mora for c in carteras)),
        "a_vencer": float(sum(c.tramos.get("a_vencer", 0) for c in carteras)),
        "h_30": float(sum(c.tramos.get("h_30", 0) for c in carteras)),
        "h_60": float(sum(c.tramos.get("h_60", 0) for c in carteras)),
        "h_90": float(sum(c.tramos.get("h_90", 0) for c in carteras)),
        "h_120": float(sum(c.tramos.get("h_120", 0) for c in carteras)),
        "h_150": float(sum(c.tramos.get("h_150", 0) for c in carteras)),
        "m_150": float(sum(c.tramos.get("m_150", 0) for c in carteras)),
    }
    return CarterasTotalesResponse(
        period_month=period_date,
        carteras=carteras,
        totales=totales,
    )


@router.get("/carteras-totales/periods", tags=["carteras-totales"])
async def get_carteras_periods(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, list[str]]:
    """Períodos (period_month) disponibles entre DXP + Bases Adicionales, desc.

    Sirve para el selector de fecha de Carteras Totales. Cliente solo ve
    períodos con al menos un reporte publicado.
    """
    only_published = user.is_client
    periods: set = set()

    dxp_stmt = select(Report.period_month).where(Report.period_month.is_not(None))
    if only_published:
        dxp_stmt = dxp_stmt.where(Report.is_published == True)  # noqa: E712
    for (pm,) in (await db.execute(dxp_stmt)).all():
        periods.add(pm)

    b_stmt = select(BaseAdicionalReport.period_month).where(
        BaseAdicionalReport.period_month.is_not(None)
    )
    if only_published:
        b_stmt = b_stmt.where(BaseAdicionalReport.is_published == True)  # noqa: E712
    for (pm,) in (await db.execute(b_stmt)).all():
        periods.add(pm)

    ordered = sorted(periods, reverse=True)
    return {"periods": [p.isoformat() for p in ordered]}
