"""Runner in-process del Reporte de Llamadas (Atención) — procesa los 4 archivos."""
from __future__ import annotations

from datetime import datetime

from ..core.database import session_scope
from ..core.logging import logger
from ..models.atencion_llamadas_report import AtencionLlamadasReport
from ..models.atencion_llamadas_upload import AtencionLlamadasUpload
from ..services.analyzers import analyze_atencion_llamadas
from ..services.parsers import parse_colas, parse_entrantes, parse_estados, parse_intervalo


async def process_atencion_llamadas_upload(upload_id: str) -> None:
    logger.info(f"[atencion-llamadas-job] start {upload_id}")

    async with session_scope() as db:
        upload = await db.get(AtencionLlamadasUpload, upload_id)
        if not upload:
            return
        upload.status = "processing"
        upload.started_at = datetime.utcnow()
        await db.commit()

    try:
        entrantes = parse_entrantes(upload.entrantes_path)
        estados = parse_estados(upload.estados_path)
        intervalo = parse_intervalo(upload.intervalo_path)
        colas = parse_colas(upload.colas_path)
        analysis = analyze_atencion_llamadas(entrantes, estados, intervalo, colas)
        k = analysis["kpis"]

        async with session_scope() as db:
            period = upload.period_month or datetime.utcnow().date().replace(day=1)
            report = AtencionLlamadasReport(
                upload_id=upload.id,
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
