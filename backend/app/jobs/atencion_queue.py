"""Cola de trabajo del módulo Atención (Postgres + disco, sin Redis).

Modelo: el endpoint solo guarda los archivos al disco y deja la fila en
`status='pending'`. Un worker en background hace polling de las tablas de uploads,
reclama cada job de forma atómica (`UPDATE ... WHERE status='pending'`) y lo
procesa con concurrencia limitada, para no forzar al servidor. El parseo pesado
corre en threads (ver runners) y nunca bloquea el event loop.

Características:
* Concurrencia máxima configurable (default 2).
* Claim atómico → un job no se procesa dos veces (ni con varios slots ni tras
  un reinicio).
* Wakeup inmediato: al subir un archivo se despierta el worker (sin esperar al
  poll). También se re-evalúa al liberarse un slot.
* Recuperación al boot: los jobs que quedaron en 'processing' (server caído a
  mitad) se devuelven a 'pending' y se reprocesan.
"""
from __future__ import annotations

import asyncio
import os
from datetime import datetime

from sqlalchemy import select, update

from ..core.database import session_scope
from ..core.logging import logger
from ..models.atencion_gestion_upload import AtencionGestionUpload
from ..models.atencion_llamadas_upload import AtencionLlamadasUpload
from .atencion_gestion_runner import run_atencion_gestion
from .atencion_llamadas_runner import run_atencion_llamadas


def _concurrency() -> int:
    try:
        return max(1, int(os.getenv("ATENCION_WORKER_CONCURRENCY", "2")))
    except ValueError:
        return 2


_POLL_SECONDS = 5.0
_wakeup = asyncio.Event()

# kind → (modelo de upload, runner)
_KINDS = {
    "llamadas": (AtencionLlamadasUpload, run_atencion_llamadas),
    "gestiones": (AtencionGestionUpload, run_atencion_gestion),
}


def signal_atencion_queue() -> None:
    """Despierta al worker (lo llama el endpoint al recibir un upload nuevo)."""
    _wakeup.set()


async def _reset_stale_processing() -> int:
    """FAIL-SAFE: un job en 'processing' al bootear significa que el contenedor
    murió mientras lo procesaba (posible archivo enorme/corrupto que provocó un
    crash u OOM). Para NO entrar en un crash-loop, se marca 'failed' y NO se
    reprocesa. Los uploads nuevos ('pending') se procesan con normalidad.
    """
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
        logger.warning(f"[atencion-queue] {failed} job(s) interrumpido(s) marcados 'failed' (fail-safe)")
    return failed


async def _claim_next() -> tuple[str, str] | None:
    """Reclama atómicamente el upload pendiente más antiguo entre ambas tablas.

    Devuelve (kind, upload_id) o None si no hay nada (o se perdió la carrera).
    """
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
        return None  # otro slot lo tomó primero; el loop reintenta


async def _run(kind: str, upload_id: str) -> None:
    runner = _KINDS[kind][1]
    try:
        await runner(upload_id)
    finally:
        # Slot liberado: re-evaluar la cola de inmediato.
        signal_atencion_queue()


async def atencion_worker() -> None:
    concurrency = _concurrency()
    logger.info(f"[atencion-queue] worker iniciado (concurrencia={concurrency})")
    await _reset_stale_processing()

    running: set[asyncio.Task] = set()
    while True:
        # Llenar slots libres reclamando pendientes.
        while len(running) < concurrency:
            job = await _claim_next()
            if job is None:
                break
            task = asyncio.create_task(_run(*job))
            running.add(task)
            task.add_done_callback(running.discard)

        # Esperar wakeup (upload nuevo / slot liberado) o el poll de seguridad.
        _wakeup.clear()
        try:
            await asyncio.wait_for(_wakeup.wait(), timeout=_POLL_SECONDS)
        except asyncio.TimeoutError:
            pass
