"""In-process runner for call upload processing."""
from __future__ import annotations

from datetime import datetime

from ..core.database import session_scope
from ..core.logging import logger
from ..models.call_report import CallReport
from ..models.call_upload import CallUpload
from ..services.analyzers import analyze_llamadas
from ..services.parsers import parse_llamadas


async def process_call_upload(upload_id: str) -> None:
    logger.info(f"[call-job] start {upload_id}")

    async with session_scope() as db:
        upload = await db.get(CallUpload, upload_id)
        if not upload:
            return
        upload.status = "processing"
        upload.started_at = datetime.utcnow()
        await db.commit()

    try:
        rows = parse_llamadas(upload.file_path)
        analysis = analyze_llamadas(rows)

        async with session_scope() as db:
            period = upload.period_month or datetime.utcnow().date().replace(day=1)
            report = CallReport(
                upload_id=upload.id,
                period_month=period,
                total_llamadas=analysis["kpis"]["total_llamadas"],
                total_talk_seg=analysis["kpis"]["total_talk_seg"],
                asesores_activos=analysis["kpis"]["asesores_activos"],
                dias_operativos=analysis["kpis"]["dias_operativos"],
                efectivas_total=analysis["kpis"]["efectivas_total"],
                aht_seg=analysis["kpis"]["aht_seg"],
                data=analysis,
            )
            db.add(report)
            up = await db.get(CallUpload, upload_id)
            up.status = "completed"
            up.completed_at = datetime.utcnow()
            up.last_error = None
            await db.commit()

        logger.info(f"[call-job] completed {upload_id}")
    except Exception as exc:
        logger.exception(f"[call-job] failed {upload_id}: {exc}")
        async with session_scope() as db:
            up = await db.get(CallUpload, upload_id)
            if up:
                up.status = "failed"
                up.last_error = str(exc)[:500]
                up.retry_count = (up.retry_count or 0) + 1
                await db.commit()
