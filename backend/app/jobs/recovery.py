"""On startup, re-queue uploads stuck in 'processing' or 'pending'."""
from __future__ import annotations

import asyncio

from sqlalchemy import select

from ..core.database import session_scope
from ..core.logging import logger
from ..models.atencion_gestion_upload import AtencionGestionUpload
from ..models.atencion_llamadas_upload import AtencionLlamadasUpload
from ..models.base_adicional_upload import BaseAdicionalUpload
from ..models.call_upload import CallUpload
from ..models.gestion_upload import GestionUpload
from ..models.upload import Upload
from .atencion_gestion_runner import process_atencion_gestion_upload
from .atencion_llamadas_runner import process_atencion_llamadas_upload
from .base_adicional_runner import process_base_adicional_upload
from .call_runner import process_call_upload
from .gestion_runner import process_gestion_upload
from .runner import process_upload


async def resume_pending_jobs() -> int:
    total = 0
    async with session_scope() as db:
        cobranzas = (await db.execute(
            select(Upload).where(Upload.status.in_(["pending", "processing"]))
        )).scalars().all()
        calls = (await db.execute(
            select(CallUpload).where(CallUpload.status.in_(["pending", "processing"]))
        )).scalars().all()
        gestiones = (await db.execute(
            select(GestionUpload).where(GestionUpload.status.in_(["pending", "processing"]))
        )).scalars().all()
        bases_adic = (await db.execute(
            select(BaseAdicionalUpload).where(BaseAdicionalUpload.status.in_(["pending", "processing"]))
        )).scalars().all()
        at_llamadas = (await db.execute(
            select(AtencionLlamadasUpload).where(AtencionLlamadasUpload.status.in_(["pending", "processing"]))
        )).scalars().all()
        at_gestiones = (await db.execute(
            select(AtencionGestionUpload).where(AtencionGestionUpload.status.in_(["pending", "processing"]))
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
    for u in at_llamadas:
        logger.info(f"[recovery] re-queuing atencion-llamadas {u.id}")
        asyncio.create_task(process_atencion_llamadas_upload(u.id))
        total += 1
    for u in at_gestiones:
        logger.info(f"[recovery] re-queuing atencion-gestiones {u.id}")
        asyncio.create_task(process_atencion_gestion_upload(u.id))
        total += 1

    return total
