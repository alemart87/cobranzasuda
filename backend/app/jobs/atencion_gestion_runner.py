"""Runner del Reporte de Gestiones (Atención).

Parseo CPU-bound en thread (`asyncio.to_thread`). El disparo y la serialización
los maneja el worker de cola (`atencion_queue`); asume el upload ya reclamado.
"""
from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any

from sqlalchemy import select

from ..core.database import session_scope
from ..core.logging import logger
from ..models.atencion_gestion_item import AtencionGestionItem
from ..models.atencion_gestion_report import AtencionGestionReport
from ..models.atencion_gestion_upload import AtencionGestionUpload
from ..services.analyzers import analyze_atencion_gestiones
from ..services.analyzers.voz_cliente import clasificar_tema
from ..services.parsers import parse_atencion_gestiones


def _build(file_path: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Trabajo pesado (sync) en thread: análisis agregado + filas granulares."""
    rows = parse_atencion_gestiones(file_path)
    analysis = analyze_atencion_gestiones(rows)
    items: list[dict[str, Any]] = []
    for r in rows:
        dt = r.get("fecha_llamada_dt")
        items.append({
            "fecha": dt.date() if dt else None,
            "cliente": (r.get("cliente") or "")[:255] or None,
            "documento": (r.get("documento") or "")[:60] or None,
            "telefono": (r.get("telefono") or "")[:60] or None,
            "tipo_caso": (r.get("tipo_caso") or "")[:80] or None,
            "estado": (r.get("estado") or "")[:60] or None,
            "motivo": (r.get("motivo") or "")[:255] or None,
            "departamento": (r.get("departamento") or "")[:120] or None,
            "responsable": (r.get("responsable") or "")[:160] or None,
            "canal": (r.get("canal") or "")[:60] or None,
            "seccion": (r.get("seccion") or "")[:80] or None,
            "tema": clasificar_tema(r.get("descripcion", "")),
            "descripcion": (r.get("descripcion") or "") or None,
        })
    return analysis, items


async def run_atencion_gestion(upload_id: str) -> None:
    logger.info(f"[atencion-gestion-job] start {upload_id}")

    async with session_scope() as db:
        upload = await db.get(AtencionGestionUpload, upload_id)
        if not upload:
            return
        existing = (await db.execute(
            select(AtencionGestionReport.id).where(AtencionGestionReport.upload_id == upload_id)
        )).first()
        if existing:
            upload.status = "completed"
            upload.completed_at = upload.completed_at or datetime.utcnow()
            await db.commit()
            logger.info(f"[atencion-gestion-job] already done {upload_id}")
            return
        file_path = upload.file_path
        period = upload.period_month or datetime.utcnow().date().replace(day=1)

    try:
        analysis, items = await asyncio.to_thread(_build, file_path)
        k = analysis["kpis"]

        async with session_scope() as db:
            report = AtencionGestionReport(
                upload_id=upload_id,
                period_month=period,
                total_gestiones=k["total_gestiones"],
                cerrados=k["cerrados"],
                pendientes=k["pendientes"],
                pct_cerrados=k["pct_cerrados"],
                data=analysis,
            )
            db.add(report)
            await db.flush()  # report.id disponible para los items
            for it in items:
                db.add(AtencionGestionItem(report_id=report.id, period_month=period, **it))
            up = await db.get(AtencionGestionUpload, upload_id)
            up.status = "completed"
            up.completed_at = datetime.utcnow()
            up.last_error = None
            await db.commit()

        logger.info(f"[atencion-gestion-job] completed {upload_id}")
    except Exception as exc:
        logger.exception(f"[atencion-gestion-job] failed {upload_id}: {exc}")
        async with session_scope() as db:
            up = await db.get(AtencionGestionUpload, upload_id)
            if up:
                up.status = "failed"
                up.last_error = str(exc)[:500]
                up.retry_count = (up.retry_count or 0) + 1
                await db.commit()
