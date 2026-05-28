"""In-process runner para uploads de Bases Adicionales."""
from __future__ import annotations

from datetime import datetime

from ..core.database import session_scope
from ..core.logging import logger
from ..models.base_adicional_report import BaseAdicionalReport
from ..models.base_adicional_upload import BaseAdicionalUpload
from ..services.analyzers.bases_adicionales import analyze_base_adicional
from ..services.parsers.dxp_parser import parse_dxp


async def process_base_adicional_upload(upload_id: str) -> None:
    logger.info(f"[base-adic-job] start {upload_id}")

    async with session_scope() as db:
        upload = await db.get(BaseAdicionalUpload, upload_id)
        if not upload:
            return
        upload.status = "processing"
        upload.started_at = datetime.utcnow()
        await db.commit()

    try:
        # Reutilizamos el parser DXP — la estructura es idéntica.
        rows = parse_dxp(upload.file_path)
        analysis = analyze_base_adicional(rows)

        async with session_scope() as db:
            period = upload.period_month or datetime.utcnow().date().replace(day=1)
            report = BaseAdicionalReport(
                upload_id=upload.id,
                tipo=upload.tipo,
                period_month=period,
                polizas=analysis["kpis"]["polizas"],
                asegurados=analysis["kpis"]["asegurados"],
                saldo_total=analysis["kpis"]["saldo_total"],
                data=analysis,
            )
            db.add(report)
            up = await db.get(BaseAdicionalUpload, upload_id)
            up.status = "completed"
            up.completed_at = datetime.utcnow()
            up.last_error = None
            await db.commit()
        logger.info(f"[base-adic-job] completed {upload_id}")

    except Exception as exc:
        logger.exception(f"[base-adic-job] failed {upload_id}: {exc}")
        async with session_scope() as db:
            up = await db.get(BaseAdicionalUpload, upload_id)
            if up:
                up.status = "failed"
                up.last_error = str(exc)[:500]
                up.retry_count = (up.retry_count or 0) + 1
                await db.commit()
