"""In-process runner for Gestiones upload."""
from __future__ import annotations

from datetime import datetime

from typing import Any

from ..core.database import session_scope
from ..core.logging import logger
from ..models.gestion_item import GestionItem
from ..models.gestion_report import GestionReport
from ..models.gestion_upload import GestionUpload
from ..services.analyzers import analyze_gestiones
from ..services.parsers import parse_gestiones
from .isolated import friendly_error, run_isolated


def _build(file_path: str) -> tuple[dict, list[dict[str, Any]]]:
    """Parseo + análisis + filas granulares (sync). Corre AISLADO en subproceso."""
    rows = parse_gestiones(file_path)
    analysis = analyze_gestiones(rows)
    items: list[dict[str, Any]] = []
    for r in rows:
        f = r.get("fecha")
        items.append({
            "fecha": f.date() if f else None,
            "subestado": (r.get("subestado") or "")[:120] or None,
            "estado": (r.get("estado") or "")[:120] or None,
            "usuario": (r.get("usuario") or "")[:160] or None,
            "campana": (r.get("campana") or "")[:160] or None,
            "cliente": (r.get("lead") or "")[:255] or None,
            "poliza": (str(r.get("poliza_raw")) if r.get("poliza_raw") else None or "")[:60] or None,
            "poliza_key": r.get("poliza_key"),
        })
    return analysis, items


async def process_gestion_upload(upload_id: str) -> None:
    logger.info(f"[gestion-job] start {upload_id}")

    async with session_scope() as db:
        upload = await db.get(GestionUpload, upload_id)
        if not upload:
            return
        upload.status = "processing"
        upload.started_at = datetime.utcnow()
        await db.commit()
        file_path = upload.file_path

    try:
        analysis, items = await run_isolated(_build, file_path)

        async with session_scope() as db:
            period = upload.period_month or datetime.utcnow().date().replace(day=1)
            report = GestionReport(
                upload_id=upload.id,
                period_month=period,
                total_gestiones=analysis["kpis"]["total_gestiones"],
                asesores_activos=analysis["kpis"]["asesores_activos"],
                promesas_totales=analysis["kpis"]["promesas_totales"],
                cobros_totales=analysis["kpis"]["cobros_totales"],
                promesas_cumplidas=analysis["kpis"]["promesas_cumplidas"],
                pct_promesas_cumplidas=analysis["kpis"]["pct_promesas_cumplidas"],
                data=analysis,
            )
            db.add(report)
            await db.flush()
            for it in items:
                db.add(GestionItem(report_id=report.id, period_month=period, **it))
            up = await db.get(GestionUpload, upload_id)
            up.status = "completed"
            up.completed_at = datetime.utcnow()
            up.last_error = None
            await db.commit()
        logger.info(f"[gestion-job] completed {upload_id}")

    except Exception as exc:
        logger.exception(f"[gestion-job] failed {upload_id}: {exc}")
        async with session_scope() as db:
            up = await db.get(GestionUpload, upload_id)
            if up:
                up.status = "failed"
                up.last_error = friendly_error(exc)
                up.retry_count = (up.retry_count or 0) + 1
                await db.commit()
