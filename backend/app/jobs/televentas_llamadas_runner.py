"""Runner del reporte de Llamadas (Televentas)."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import select

from ..core.database import session_scope
from ..core.logging import logger
from ..models.televentas_llamadas_report import TeleventasLlamadasReport
from ..models.televentas_llamadas_upload import TeleventasLlamadasUpload
from ..services.analyzers import analyze_televentas_llamadas
from ..services.parsers import parse_televentas_llamadas
from .isolated import run_isolated


def _build(file_path: str) -> dict:
    return analyze_televentas_llamadas(parse_televentas_llamadas(file_path))


async def run_televentas_llamadas(upload_id: str) -> None:
    logger.info(f"[televentas-llamadas-job] start {upload_id}")
    async with session_scope() as db:
        upload = await db.get(TeleventasLlamadasUpload, upload_id)
        if not upload:
            return
        existing = (await db.execute(
            select(TeleventasLlamadasReport.id).where(TeleventasLlamadasReport.upload_id == upload_id)
        )).first()
        if existing:
            upload.status = "completed"
            upload.completed_at = upload.completed_at or datetime.utcnow()
            await db.commit()
            return
        file_path = upload.file_path
        period = upload.period_month or datetime.utcnow().date().replace(day=1)

    try:
        analysis = await run_isolated(_build, file_path)
        k = analysis["kpis"]
        async with session_scope() as db:
            report = TeleventasLlamadasReport(
                upload_id=upload_id,
                period_month=period,
                total_llamadas=k["total_llamadas"],
                contestadas=k["contestadas"],
                no_contestadas=k["no_contestadas"],
                pct_contestadas=k["pct_contestadas"],
                tmo_seg=k["tmo_seg"],
                vendedores_activos=k["vendedores_activos"],
                dias_operativos=k["dias_operativos"],
                data=analysis,
            )
            db.add(report)
            up = await db.get(TeleventasLlamadasUpload, upload_id)
            up.status = "completed"
            up.completed_at = datetime.utcnow()
            up.last_error = None
            await db.commit()
        logger.info(f"[televentas-llamadas-job] completed {upload_id}")
    except Exception as exc:
        logger.exception(f"[televentas-llamadas-job] failed {upload_id}: {exc}")
        async with session_scope() as db:
            up = await db.get(TeleventasLlamadasUpload, upload_id)
            if up:
                up.status = "failed"
                up.last_error = str(exc)[:500]
                up.retry_count = (up.retry_count or 0) + 1
                await db.commit()
