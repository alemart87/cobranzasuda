"""On startup, re-queue uploads stuck in 'processing' or 'pending'."""
from __future__ import annotations

import asyncio

from sqlalchemy import select

from ..core.database import session_scope
from ..core.logging import logger
from ..models.call_upload import CallUpload
from ..models.gestion_upload import GestionUpload
from ..models.upload import Upload
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

    return total
