"""Runner del Reporte de Llamadas (Atención).

El parseo de los 4 Excel es CPU-bound: se ejecuta en un thread
(`asyncio.to_thread`) para NO congelar el event loop del servidor. El disparo y
la serialización los maneja el worker de cola (`atencion_queue`); este runner
asume que el upload ya fue reclamado (status='processing').
"""
from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any

from sqlalchemy import select

from ..core.database import session_scope
from ..core.logging import logger
from ..models.atencion_llamadas_report import AtencionLlamadasReport
from ..models.atencion_llamadas_upload import AtencionLlamadasUpload
from ..services.analyzers import analyze_atencion_llamadas
from ..services.parsers import parse_colas, parse_entrantes, parse_estados, parse_intervalo


def _build_analysis(entrantes_path: str, estados_path: str,
                    intervalo_path: str, colas_path: str) -> dict[str, Any]:
    """Trabajo pesado (sync). Se corre en un thread aparte."""
    entrantes = parse_entrantes(entrantes_path)
    estados = parse_estados(estados_path)
    intervalo = parse_intervalo(intervalo_path)
    colas = parse_colas(colas_path)
    return analyze_atencion_llamadas(entrantes, estados, intervalo, colas)


async def run_atencion_llamadas(upload_id: str) -> None:
    logger.info(f"[atencion-llamadas-job] start {upload_id}")

    async with session_scope() as db:
        upload = await db.get(AtencionLlamadasUpload, upload_id)
        if not upload:
            return
        # Idempotencia: si ya existe reporte para este upload, no reprocesar.
        existing = (await db.execute(
            select(AtencionLlamadasReport.id).where(AtencionLlamadasReport.upload_id == upload_id)
        )).first()
        if existing:
            upload.status = "completed"
            upload.completed_at = upload.completed_at or datetime.utcnow()
            await db.commit()
            logger.info(f"[atencion-llamadas-job] already done {upload_id}")
            return
        paths = (upload.entrantes_path, upload.estados_path,
                 upload.intervalo_path, upload.colas_path)
        period = upload.period_month or datetime.utcnow().date().replace(day=1)

    try:
        analysis = await asyncio.to_thread(_build_analysis, *paths)
        k = analysis["kpis"]

        async with session_scope() as db:
            report = AtencionLlamadasReport(
                upload_id=upload_id,
                period_month=period,
                llamadas_ingresadas=k["llamadas_ingresadas"],
                contestadas=k["contestadas"],
                abandonadas=k["abandonadas"],
                nivel_atencion_pct=k["nivel_atencion_pct"],
                sla_pct=k["sla_pct"],
                abandono_pct=k["abandono_pct"],
                aht_seg=k["aht_seg"],
                operadores_activos=k["operadores_activos"],
                dias_operativos=k["dias_operativos"],
                data=analysis,
            )
            db.add(report)
            up = await db.get(AtencionLlamadasUpload, upload_id)
            up.status = "completed"
            up.completed_at = datetime.utcnow()
            up.last_error = None
            await db.commit()

        logger.info(f"[atencion-llamadas-job] completed {upload_id}")
    except Exception as exc:
        logger.exception(f"[atencion-llamadas-job] failed {upload_id}: {exc}")
        async with session_scope() as db:
            up = await db.get(AtencionLlamadasUpload, upload_id)
            if up:
                up.status = "failed"
                up.last_error = str(exc)[:500]
                up.retry_count = (up.retry_count or 0) + 1
                await db.commit()
