"""On startup, re-queue uploads stuck in 'processing' or 'pending'."""
from __future__ import annotations

import asyncio

from sqlalchemy import select, update

from ..core.database import session_scope
from ..core.logging import logger
from ..models.base_adicional_upload import BaseAdicionalUpload
from ..models.call_upload import CallUpload
from ..models.gestion_upload import GestionUpload
from ..models.upload import Upload
from .base_adicional_runner import process_base_adicional_upload
from .call_runner import process_call_upload
from .gestion_runner import process_gestion_upload
from .runner import process_upload

_INTERRUMPIDO = ("El procesamiento se interrumpió por un reinicio del servidor. "
                 "Volvé a subir el archivo.")


async def resume_pending_jobs() -> int:
    total = 0
    async with session_scope() as db:
        # FAIL-SAFE: lo que quedó en 'processing' al bootear NO se reprocesa
        # (evita crash-loops por un archivo malo); se marca 'failed'.
        for Model in (Upload, CallUpload, GestionUpload, BaseAdicionalUpload):
            await db.execute(
                update(Model).where(Model.status == "processing")
                .values(status="failed", last_error=_INTERRUMPIDO)
            )
        await db.commit()

        # Solo se re-encolan los 'pending' (nunca llegaron a ejecutarse).
        cobranzas = (await db.execute(
            select(Upload).where(Upload.status == "pending")
        )).scalars().all()
        calls = (await db.execute(
            select(CallUpload).where(CallUpload.status == "pending")
        )).scalars().all()
        gestiones = (await db.execute(
            select(GestionUpload).where(GestionUpload.status == "pending")
        )).scalars().all()
        bases_adic = (await db.execute(
            select(BaseAdicionalUpload).where(BaseAdicionalUpload.status == "pending")
        )).scalars().all()

    for u in cobranzas:
        logger.info(f"[recovery] re-queuing cobranzas {u.id}")
        asyncio.create_task(process_upload(u.id))
        total += 1
    for u in calls:
        logger.info(f"[recovery] re-queuing calls {u.id}")
        asyncio.create_task(process_call_upload(u.id))
        total += 1
    for u in gestiones:
        logger.info(f"[recovery] re-queuing gestiones {u.id}")
        asyncio.create_task(process_gestion_upload(u.id))
        total += 1
    for u in bases_adic:
        logger.info(f"[recovery] re-queuing base adicional {u.id} ({u.tipo})")
        asyncio.create_task(process_base_adicional_upload(u.id))
        total += 1
    # Atención NO se re-encola acá: lo maneja su propio worker de cola
    # (atencion_queue), que al iniciar resetea 'processing' -> 'pending'.

    return total
