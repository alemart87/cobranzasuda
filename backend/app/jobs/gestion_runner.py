"""In-process runner for Gestiones upload."""
from __future__ import annotations

from datetime import datetime

from ..core.database import session_scope
from ..core.logging import logger
from ..models.gestion_report import GestionReport
from ..models.gestion_upload import GestionUpload
from ..services.analyzers import analyze_gestiones
from ..services.parsers import parse_gestiones


async def process_gestion_upload(upload_id: str) -> None:
    logger.info(f"[gestion-job] start {upload_id}")

    async with session_scope() as db:
        upload = await db.get(GestionUpload, upload_id)
        if not upload:
            return
        upload.status = "processing"
        upload.started_at = datetime.utcnow()
        await db.commit()

    try:
        rows = parse_gestiones(upload.file_path)
        analysis = analyze_gestiones(rows)

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
                up.last_error = str(exc)[:500]
                up.retry_count = (up.retry_count or 0) + 1
                await db.commit()
