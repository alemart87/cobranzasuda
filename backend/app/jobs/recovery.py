"""On startup, re-queue uploads stuck in 'processing' or 'pending'."""
from __future__ import annotations

import asyncio

from sqlalchemy import select

from ..core.database import session_scope
from ..core.logging import logger
from ..models.upload import Upload
from .runner import process_upload


async def resume_pending_jobs() -> int:
    async with session_scope() as db:
        result = await db.execute(
            select(Upload).where(Upload.status.in_(["pending", "processing"]))
        )
        stuck = result.scalars().all()

    if not stuck:
        return 0

    for upload in stuck:
        logger.info(f"[recovery] re-queuing {upload.id} (status={upload.status})")
        asyncio.create_task(process_upload(upload.id))

    return len(stuck)
