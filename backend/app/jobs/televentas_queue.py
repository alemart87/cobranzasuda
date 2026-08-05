"""Cola de trabajo del módulo Televentas (Postgres + disco, sin Redis).

Idéntica en mecánica a `atencion_queue`: claim atómico, concurrencia acotada,
wakeup inmediato y recuperación fail-safe al boot. Dos kinds: llamadas y producción.
"""
from __future__ import annotations

import asyncio
import os
from datetime import datetime

from sqlalchemy import select, update

from ..core.database import session_scope
from ..core.logging import logger
from ..models.televentas_crm_upload import TeleventasCrmUpload
from ..models.televentas_llamadas_upload import TeleventasLlamadasUpload
from ..models.televentas_produccion_upload import TeleventasProduccionUpload
from .televentas_crm_runner import run_televentas_crm
from .televentas_llamadas_runner import run_televentas_llamadas
from .televentas_produccion_runner import run_televentas_produccion


def _concurrency() -> int:
    try:
        return max(1, int(os.getenv("TELEVENTAS_WORKER_CONCURRENCY", "2")))
    except ValueError:
        return 2


_POLL_SECONDS = 5.0
_wakeup = asyncio.Event()

_KINDS = {
    "llamadas": (TeleventasLlamadasUpload, run_televentas_llamadas),
    "produccion": (TeleventasProduccionUpload, run_televentas_produccion),
    "crm": (TeleventasCrmUpload, run_televentas_crm),
}


def signal_televentas_queue() -> None:
    _wakeup.set()


async def _reset_stale_processing() -> int:
    failed = 0
    async with session_scope() as db:
        for Model, _ in _KINDS.values():
            res = await db.execute(
                update(Model)
                .where(Model.status == "processing")
                .values(
                    status="failed",
                    last_error="El procesamiento se interrumpió y reinició el servidor "
                               "(posible archivo demasiado grande o corrupto). "
                               "Revisá el archivo y volvé a subirlo.",
                )
            )
            failed += res.rowcount or 0
        await db.commit()
    if failed:
        logger.warning(f"[televentas-queue] {failed} job(s) interrumpido(s) marcados 'failed' (fail-safe)")
    return failed


async def _claim_next() -> tuple[str, str] | None:
    async with session_scope() as db:
        candidates: list[tuple[str, str, datetime]] = []
        for kind, (Model, _) in _KINDS.items():
            row = (await db.execute(
                select(Model.id, Model.uploaded_at)
                .where(Model.status == "pending")
                .order_by(Model.uploaded_at.asc())
                .limit(1)
            )).first()
            if row:
                candidates.append((kind, row[0], row[1]))
        if not candidates:
            return None
        candidates.sort(key=lambda c: c[2])
        kind, uid, _ = candidates[0]
        Model = _KINDS[kind][0]
        res = await db.execute(
            update(Model)
            .where(Model.id == uid, Model.status == "pending")
            .values(status="processing", started_at=datetime.utcnow())
        )
        await db.commit()
        if (res.rowcount or 0) == 1:
            return kind, uid
        return None


async def _run(kind: str, upload_id: str) -> None:
    runner = _KINDS[kind][1]
    try:
        await runner(upload_id)
    finally:
        signal_televentas_queue()


async def televentas_worker() -> None:
    concurrency = _concurrency()
    logger.info(f"[televentas-queue] worker iniciado (concurrencia={concurrency})")
    await _reset_stale_processing()

    running: set[asyncio.Task] = set()
    while True:
        while len(running) < concurrency:
            job = await _claim_next()
            if job is None:
                break
            task = asyncio.create_task(_run(*job))
            running.add(task)
            task.add_done_callback(running.discard)

        _wakeup.clear()
        try:
            await asyncio.wait_for(_wakeup.wait(), timeout=_POLL_SECONDS)
        except asyncio.TimeoutError:
            pass
