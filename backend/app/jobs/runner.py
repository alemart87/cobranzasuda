"""In-process job runner: parse + analyze + persist report.

Triggered by FastAPI BackgroundTasks. Updates upload.status as it progresses.
On error marks failed and increments retry_count.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import select

from ..core.database import session_scope
from ..core.logging import logger
from ..models.report import Report
from ..models.upload import Upload
from ..services.analyzers import analyze_cartera, analyze_recupero, project_recupero
from ..services.parsers import parse_boca, parse_cobrado, parse_dxp


async def process_upload(upload_id: str) -> None:
    logger.info(f"[job] start process_upload {upload_id}")

    async with session_scope() as db:
        upload = await db.get(Upload, upload_id)
        if not upload:
            logger.warning(f"[job] upload {upload_id} not found")
            return
        upload.status = "processing"
        upload.started_at = datetime.utcnow()
        await db.commit()

    try:
        dxp_rows = parse_dxp(upload.dxp_path)
        boca_rows = parse_boca(upload.boca_path)
        cobrado_rows = parse_cobrado(upload.cobrado_path)

        cartera = analyze_cartera(dxp_rows)
        recupero = analyze_recupero(dxp_rows, boca_rows, cobrado_rows)

        # Proyección al cierre del mes
        period = upload.period_month or datetime.utcnow().date().replace(day=1)
        dias_transcurridos = datetime.utcnow().day
        proyeccion_total = project_recupero(
            recupero["kpis"]["recupero_total"],
            dias_transcurridos,
            period,
        )

        async with session_scope() as db:
            report = Report(
                upload_id=upload.id,
                period_month=period,
                asegurados_total=cartera["kpis"]["asegurados_total"],
                polizas_total=cartera["kpis"]["polizas_total"],
                saldo_total=cartera["kpis"]["saldo_total"],
                vencido_total=cartera["kpis"]["vencido_total"],
                asegurados_en_mora=cartera["kpis"]["asegurados_en_mora"],
                recupero_total=recupero["kpis"]["recupero_total"],
                asegurados_pagaron=recupero["kpis"]["asegurados_pagaron"],
                data={
                    "cartera": cartera,
                    "recupero": recupero,
                    "proyeccion_total": proyeccion_total,
                },
            )
            db.add(report)

            up = await db.get(Upload, upload_id)
            up.status = "completed"
            up.completed_at = datetime.utcnow()
            up.last_error = None
            await db.commit()
        logger.info(f"[job] completed {upload_id}")

    except Exception as exc:
        logger.exception(f"[job] failed {upload_id}: {exc}")
        async with session_scope() as db:
            up = await db.get(Upload, upload_id)
            if up:
                up.status = "failed"
                up.last_error = str(exc)[:500]
                up.retry_count = (up.retry_count or 0) + 1
                await db.commit()
