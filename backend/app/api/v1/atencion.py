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
from ...jobs.atencion_queue import signal_atencion_queue
from ...models.atencion_gestion_report import AtencionGestionReport
from ...models.atencion_gestion_upload import AtencionGestionUpload
from ...models.atencion_gestion_item import AtencionGestionItem
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
    # Encolar: el archivo ya está en disco y el job en 'pending'.
    # El worker de cola (atencion_queue) lo tomará según la concurrencia disponible.
    signal_atencion_queue()
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
    signal_atencion_queue()
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


async def _heal_kpis_desde_items(db: AsyncSession, reports: list[AtencionGestionReport]) -> None:
    """Auto-reparación de KPIs: 'pendientes' debe contar SOLO el estado 'Pendiente'
    (los reportes viejos guardaban total - cerrados, que incluía 'En proceso').
    Recalcula desde atencion_gestion_items y persiste si difiere."""
    from collections import defaultdict
    from sqlalchemy import func
    from ...services.parsers._text import strip_accents

    ids = [r.id for r in reports]
    if not ids:
        return
    rows = (await db.execute(
        select(AtencionGestionItem.report_id, AtencionGestionItem.estado, func.count(AtencionGestionItem.id))
        .where(AtencionGestionItem.report_id.in_(ids))
        .group_by(AtencionGestionItem.report_id, AtencionGestionItem.estado)
    )).all()
    counts: dict[str, dict[str, int]] = defaultdict(dict)
    for rid, estado, n in rows:
        counts[rid][strip_accents(estado or "")] = int(n)

    CERR = {"cerrado", "resuelto", "finalizado"}
    changed = False
    for rep in reports:
        c = counts.get(rep.id)
        if not c:
            continue  # sin items (no se puede recalcular)
        total = sum(c.values())
        cerrados = sum(n for e, n in c.items() if e in CERR)
        pendientes = c.get("pendiente", 0)
        if int(rep.pendientes or 0) != pendientes or int(rep.cerrados or 0) != cerrados:
            rep.cerrados = cerrados
            rep.pendientes = pendientes
            rep.pct_cerrados = round(cerrados / total * 100, 1) if total else 0.0
            data = dict(rep.data or {})
            kpis = dict(data.get("kpis") or {})
            kpis.update({"cerrados": cerrados, "pendientes": pendientes,
                         "en_proceso": total - cerrados - pendientes,
                         "pct_cerrados": rep.pct_cerrados})
            data["kpis"] = kpis
            rep.data = data
            changed = True
    if changed:
        await db.commit()


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
    try:
        await _heal_kpis_desde_items(db, list(items))
    except Exception:
        pass  # self-heal best-effort; nunca rompe la lista
    return AtencionGestionReportList(
        items=[AtencionGestionReportSummary.model_validate(r) for r in items], total=len(items))


async def _backfill_series_desde_items(db: AsyncSession, report: AtencionGestionReport) -> None:
    """Auto-reparación: si el reporte no tiene serie por día / cruce responsable×estado
    guardados (reportes viejos o de la ventana del incidente), los reconstruye desde
    `atencion_gestion_items` y los persiste."""
    from collections import defaultdict
    from ...services.parsers._text import strip_accents

    data = dict(report.data or {})
    if data.get("serie_estado_dia") and data.get("por_responsable_estado"):
        return  # ya están

    items = (await db.execute(
        select(AtencionGestionItem.estado, AtencionGestionItem.fecha, AtencionGestionItem.responsable)
        .where(AtencionGestionItem.report_id == report.id)
    )).all()
    if not items:
        return

    PREF = ["Cerrado", "En proceso", "Pendiente"]

    def lab(e):
        return (e or "").strip() or "(sin estado)"

    presentes: dict[str, str] = {}
    for est, _f, _r in items:
        e = lab(est)
        presentes.setdefault(strip_accents(e), e)
    estados, seen = [], set()
    for p in PREF:
        k = strip_accents(p)
        if k in presentes and k not in seen:
            estados.append(presentes[k]); seen.add(k)
    for k in sorted(presentes):
        if k not in seen:
            estados.append(presentes[k]); seen.add(k)

    dia: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    resp: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    rtot: dict[str, int] = defaultdict(int)
    for est, fecha, responsable in items:
        e = lab(est)
        if fecha:
            dia[fecha.isoformat()][e] += 1
        r = (responsable or "").strip() or "(sin responsable)"
        resp[r][e] += 1
        rtot[r] += 1

    data["estados_lista"] = estados
    data["serie_estado_dia"] = [
        {"dia": d, **{e: dia[d].get(e, 0) for e in estados}} for d in sorted(dia)
    ]
    data["por_responsable_estado"] = {
        "estados": estados,
        "responsables": [
            {"responsable": r, "por_estado": {e: resp[r].get(e, 0) for e in estados}, "total": rtot[r]}
            for r in sorted(resp, key=lambda x: -rtot[x])
        ],
        "totales": {**{e: sum(resp[r].get(e, 0) for r in resp) for e in estados},
                    "total": sum(rtot.values())},
    }
    report.data = data  # persiste en el commit del record_action (self-healing)


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
    try:
        await _backfill_series_desde_items(db, report)
        await _heal_kpis_desde_items(db, [report])
    except Exception:
        pass
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
