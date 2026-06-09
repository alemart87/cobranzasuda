"""In-process job runner: parse + analyze + persist report.

Triggered by FastAPI BackgroundTasks. Updates upload.status as it progresses.
On error marks failed and increments retry_count.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from ..core.database import session_scope
from ..core.logging import logger
from ..models.report import Report
from ..models.upload import Upload
from ..services.analyzers import analyze_cartera, analyze_recupero, project_recupero
from ..services.parsers import parse_boca, parse_cobrado, parse_dxp
from .isolated import friendly_error, run_isolated


def _build(dxp_path: str, boca_path: str, cobrado_path: str,
           period: date, dias_transcurridos: int) -> dict[str, Any]:
    """Parseo + análisis (sync). Corre AISLADO en subproceso."""
    dxp_rows = parse_dxp(dxp_path)
    boca_rows = parse_boca(boca_path)
    cobrado_rows = parse_cobrado(cobrado_path)
    cartera = analyze_cartera(dxp_rows)
    recupero = analyze_recupero(dxp_rows, boca_rows, cobrado_rows)
    proyeccion_total = project_recupero(recupero["kpis"]["recupero_total"], dias_transcurridos, period)
    return {"cartera": cartera, "recupero": recupero, "proyeccion_total": proyeccion_total}


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
        paths = (upload.dxp_path, upload.boca_path, upload.cobrado_path)
        period = upload.period_month or datetime.utcnow().date().replace(day=1)

    try:
        dias_transcurridos = datetime.utcnow().day
        result = await run_isolated(_build, *paths, period, dias_transcurridos)
        cartera = result["cartera"]
        recupero = result["recupero"]

        async with session_scope() as db:
            report = Report(
                upload_id=upload_id,
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
                    "proyeccion_total": result["proyeccion_total"],
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
                up.last_error = friendly_error(exc)
                up.retry_count = (up.retry_count or 0) + 1
                await db.commit()
