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
from ..models.atencion_gestion_report import AtencionGestionReport
from ..models.atencion_gestion_upload import AtencionGestionUpload
from ..services.analyzers import analyze_atencion_gestiones
from ..services.parsers import parse_atencion_gestiones


def _build_analysis(file_path: str) -> dict[str, Any]:
    """Trabajo pesado (sync). Se corre en un thread aparte."""
    rows = parse_atencion_gestiones(file_path)
    return analyze_atencion_gestiones(rows)


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
        analysis = await asyncio.to_thread(_build_analysis, file_path)
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
