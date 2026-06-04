"""Runner in-process del Reporte de Gestiones (Atención)."""
from __future__ import annotations

from datetime import datetime

from ..core.database import session_scope
from ..core.logging import logger
from ..models.atencion_gestion_report import AtencionGestionReport
from ..models.atencion_gestion_upload import AtencionGestionUpload
from ..services.analyzers import analyze_atencion_gestiones
from ..services.parsers import parse_atencion_gestiones


async def process_atencion_gestion_upload(upload_id: str) -> None:
    logger.info(f"[atencion-gestion-job] start {upload_id}")

    async with session_scope() as db:
        upload = await db.get(AtencionGestionUpload, upload_id)
        if not upload:
            return
        upload.status = "processing"
        upload.started_at = datetime.utcnow()
        await db.commit()

    try:
        rows = parse_atencion_gestiones(upload.file_path)
        analysis = analyze_atencion_gestiones(rows)
        k = analysis["kpis"]

        async with session_scope() as db:
            period = upload.period_month or datetime.utcnow().date().replace(day=1)
            report = AtencionGestionReport(
                upload_id=upload.id,
                period_month=period,
                total_gestiones=k["total_gestiones"],
                cerrados=k["cerrados"],
                pendientes=k["pendientes"],
                pct_cerrados=k["pct_cerrados"],
                data=analysis,
            )
            db.add(report)
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
