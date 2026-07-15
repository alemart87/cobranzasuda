"""Runner del Libro de Producción (Televentas) — reporte + filas granulares."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select

from ..core.database import session_scope
from ..core.logging import logger
from ..models.televentas_produccion_item import TeleventasProduccionItem
from ..models.televentas_produccion_report import TeleventasProduccionReport
from ..models.televentas_produccion_upload import TeleventasProduccionUpload
from ..services.analyzers import analyze_televentas_produccion, build_produccion_items
from ..services.parsers import parse_televentas_produccion
from .isolated import run_isolated


def _build(file_path: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    rows = parse_televentas_produccion(file_path)
    return analyze_televentas_produccion(rows), build_produccion_items(rows)


async def run_televentas_produccion(upload_id: str) -> None:
    logger.info(f"[televentas-produccion-job] start {upload_id}")
    async with session_scope() as db:
        upload = await db.get(TeleventasProduccionUpload, upload_id)
        if not upload:
            return
        existing = (await db.execute(
            select(TeleventasProduccionReport.id).where(TeleventasProduccionReport.upload_id == upload_id)
        )).first()
        if existing:
            upload.status = "completed"
            upload.completed_at = upload.completed_at or datetime.utcnow()
            await db.commit()
            return
        file_path = upload.file_path
        period = upload.period_month or datetime.utcnow().date().replace(day=1)

    try:
        analysis, items = await run_isolated(_build, file_path)
        k = analysis["kpis"]
        async with session_scope() as db:
            report = TeleventasProduccionReport(
                upload_id=upload_id,
                period_month=period,
                polizas_emitidas=k["polizas_emitidas"],
                prima_emitida=k["prima_emitida"],
                polizas_anuladas=k["polizas_anuladas"],
                prima_anulada=k["prima_anulada"],
                ticket_promedio=k["ticket_promedio"],
                dias_productivos=k["dias_productivos"],
                data=analysis,
            )
            db.add(report)
            await db.flush()
            for it in items:
                db.add(TeleventasProduccionItem(report_id=report.id, period_month=period, **it))
            up = await db.get(TeleventasProduccionUpload, upload_id)
            up.status = "completed"
            up.completed_at = datetime.utcnow()
            up.last_error = None
            await db.commit()
        logger.info(f"[televentas-produccion-job] completed {upload_id}")
    except Exception as exc:
        logger.exception(f"[televentas-produccion-job] failed {upload_id}: {exc}")
        async with session_scope() as db:
            up = await db.get(TeleventasProduccionUpload, upload_id)
            if up:
                up.status = "failed"
                up.last_error = str(exc)[:500]
                up.retry_count = (up.retry_count or 0) + 1
                await db.commit()
