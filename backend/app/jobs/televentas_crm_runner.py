"""Runner de Gestiones CRM (Televentas) — reporte + filas granulares."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select

from ..core.database import session_scope
from ..core.logging import logger
from ..models.televentas_crm_item import TeleventasCrmItem
from ..models.televentas_crm_report import TeleventasCrmReport
from ..models.televentas_crm_upload import TeleventasCrmUpload
from ..services.analyzers import analyze_televentas_crm, build_crm_items
from ..services.parsers import parse_gestiones
from .isolated import run_isolated


def _build(file_path: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    rows = parse_gestiones(file_path)
    return analyze_televentas_crm(rows), build_crm_items(rows)


async def run_televentas_crm(upload_id: str) -> None:
    logger.info(f"[televentas-crm-job] start {upload_id}")
    async with session_scope() as db:
        upload = await db.get(TeleventasCrmUpload, upload_id)
        if not upload:
            return
        existing = (await db.execute(
            select(TeleventasCrmReport.id).where(TeleventasCrmReport.upload_id == upload_id)
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
            report = TeleventasCrmReport(
                upload_id=upload_id,
                period_month=period,
                total_gestiones=k["total_gestiones"],
                contactos=k["contactos"],
                aceptas=k["aceptas"],
                agendados=k["agendados"],
                no_acepta=k["no_acepta"],
                tasa_contacto_pct=k["tasa_contacto_pct"],
                operadores_activos=k["operadores_activos"],
                dias_operativos=k["dias_operativos"],
                data=analysis,
            )
            db.add(report)
            await db.flush()
            for it in items:
                db.add(TeleventasCrmItem(report_id=report.id, period_month=period, **it))
            up = await db.get(TeleventasCrmUpload, upload_id)
            up.status = "completed"
            up.completed_at = datetime.utcnow()
            up.last_error = None
            await db.commit()
        logger.info(f"[televentas-crm-job] completed {upload_id}")
    except Exception as exc:
        logger.exception(f"[televentas-crm-job] failed {upload_id}: {exc}")
        async with session_scope() as db:
            up = await db.get(TeleventasCrmUpload, upload_id)
            if up:
                up.status = "failed"
                up.last_error = str(exc)[:500]
                up.retry_count = (up.retry_count or 0) + 1
                await db.commit()
