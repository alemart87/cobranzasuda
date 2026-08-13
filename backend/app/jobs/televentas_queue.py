"""Cola de trabajo del módulo Televentas (Postgres + disco, sin Redis).

Idéntica en mecánica a `atencion_queue`: claim atómico, concurrencia acotada,
wakeup inmediato y recuperación fail-safe al boot. Tres kinds: llamadas,
producción y CRM.

Resiliencia (el worker NUNCA debe morir en silencio):
- El loop está blindado: un error transitorio (p.ej. corte de conexión a la DB)
  se loguea y se reintenta con backoff — no mata la tarea.
- Watchdog en caliente: un job "processing" cuyo started_at superó el timeout
  del subproceso + margen se considera trabado; se reintenta una vez (vuelve a
  pending) y si reincide queda "failed" con mensaje claro. Sin reiniciar nada.
- Heartbeat + snapshot de estado (`estado_cola`) para visibilidad en la UI.
"""
from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy import func, select, update

from ..core.config import settings
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
_WATCHDOG_CADA_S = 60.0        # frecuencia del chequeo de jobs trabados
_MAX_REINTENTOS_TRABADO = 1    # un job trabado se re-encola una vez; después, failed
_wakeup = asyncio.Event()

# Latido del worker: la UI lo usa para mostrar si la cola está viva.
_heartbeat: Optional[datetime] = None
_ultimo_error: Optional[str] = None
_procesando_ahora: int = 0

_KINDS = {
    "llamadas": (TeleventasLlamadasUpload, run_televentas_llamadas),
    "produccion": (TeleventasProduccionUpload, run_televentas_produccion),
    "crm": (TeleventasCrmUpload, run_televentas_crm),
}


def signal_televentas_queue() -> None:
    _wakeup.set()


def _limite_trabado() -> timedelta:
    # El subproceso de parseo tiene su propio timeout; pasado ese tiempo + margen,
    # un "processing" solo puede ser un claim perdido o un worker muerto.
    return timedelta(seconds=max(10, settings.upload_proc_timeout_s) + 180)


async def _reset_stale_processing() -> int:
    """Al boot: todo 'processing' es de un proceso anterior → re-encolar (1 intento)."""
    tocados = 0
    async with session_scope() as db:
        for Model, _ in _KINDS.values():
            res = await db.execute(
                update(Model)
                .where(Model.status == "processing", Model.retry_count < _MAX_REINTENTOS_TRABADO)
                .values(status="pending", retry_count=Model.retry_count + 1,
                        last_error="Reintento automático: el servidor se reinició durante el procesamiento.")
            )
            tocados += res.rowcount or 0
            res = await db.execute(
                update(Model)
                .where(Model.status == "processing")
                .values(status="failed",
                        last_error="El procesamiento se interrumpió repetidas veces (posible archivo "
                                   "demasiado grande o corrupto). Revisá el archivo y volvé a subirlo.")
            )
            tocados += res.rowcount or 0
        await db.commit()
    if tocados:
        logger.warning(f"[televentas-queue] boot: {tocados} job(s) interrumpido(s) recuperados/marcados")
    return tocados


async def _recuperar_trabados() -> int:
    """Watchdog en caliente: jobs 'processing' vencidos → re-encolar o marcar failed."""
    limite = datetime.utcnow() - _limite_trabado()
    tocados = 0
    async with session_scope() as db:
        for kind, (Model, _) in _KINDS.items():
            res = await db.execute(
                update(Model)
                .where(Model.status == "processing", Model.started_at.isnot(None),
                       Model.started_at < limite, Model.retry_count < _MAX_REINTENTOS_TRABADO)
                .values(status="pending", retry_count=Model.retry_count + 1, started_at=None,
                        last_error="Reintento automático: el procesamiento quedó trabado y se re-encoló.")
            )
            if res.rowcount:
                logger.warning(f"[televentas-queue] watchdog: {res.rowcount} job(s) de {kind} re-encolado(s)")
                tocados += res.rowcount
            res = await db.execute(
                update(Model)
                .where(Model.status == "processing", Model.started_at.isnot(None),
                       Model.started_at < limite)
                .values(status="failed",
                        last_error="El procesamiento quedó trabado dos veces (posible archivo demasiado "
                                   "grande o con formato inesperado). Revisá el archivo y volvé a subirlo.")
            )
            if res.rowcount:
                logger.error(f"[televentas-queue] watchdog: {res.rowcount} job(s) de {kind} marcados failed")
                tocados += res.rowcount
        await db.commit()
    if tocados:
        signal_televentas_queue()
    return tocados


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
    global _procesando_ahora
    runner = _KINDS[kind][1]
    _procesando_ahora += 1
    try:
        await runner(upload_id)
    except Exception as exc:  # el runner ya maneja sus errores; esto es el último paracaídas
        logger.exception(f"[televentas-queue] runner {kind}/{upload_id} lanzó fuera de control: {exc}")
    finally:
        _procesando_ahora -= 1
        signal_televentas_queue()


async def televentas_worker() -> None:
    global _heartbeat, _ultimo_error
    concurrency = _concurrency()
    logger.info(f"[televentas-queue] worker iniciado (concurrencia={concurrency})")
    try:
        await _reset_stale_processing()
    except Exception as exc:
        logger.exception(f"[televentas-queue] fail-safe de boot falló (sigo igual): {exc}")

    running: set[asyncio.Task] = set()
    ultimo_watchdog = datetime.utcnow()
    while True:
        try:
            _heartbeat = datetime.utcnow()

            if (datetime.utcnow() - ultimo_watchdog).total_seconds() >= _WATCHDOG_CADA_S:
                ultimo_watchdog = datetime.utcnow()
                await _recuperar_trabados()

            while len(running) < concurrency:
                job = await _claim_next()
                if job is None:
                    break
                task = asyncio.create_task(_run(*job))
                running.add(task)
                task.add_done_callback(running.discard)

            _ultimo_error = None
            _wakeup.clear()
            try:
                await asyncio.wait_for(_wakeup.wait(), timeout=_POLL_SECONDS)
            except asyncio.TimeoutError:
                pass
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            # NUNCA morir: un corte transitorio (p.ej. DB) se loguea y se reintenta.
            _ultimo_error = str(exc)[:300]
            logger.exception(f"[televentas-queue] error transitorio en el loop (reintento en 5s): {exc}")
            await asyncio.sleep(5)


async def estado_cola() -> dict[str, Any]:
    """Snapshot de la cola para la UI: salud del worker, conteos y detalle."""
    ahora = datetime.utcnow()
    vivo = _heartbeat is not None and (ahora - _heartbeat).total_seconds() < _POLL_SECONDS * 4
    out: dict[str, Any] = {
        "worker_vivo": vivo,
        "heartbeat_hace_s": round((ahora - _heartbeat).total_seconds()) if _heartbeat else None,
        "procesando_ahora": _procesando_ahora,
        "ultimo_error_worker": _ultimo_error,
        "kinds": {},
    }
    async with session_scope() as db:
        for kind, (Model, _) in _KINDS.items():
            counts = {s: c for s, c in (await db.execute(
                select(Model.status, func.count()).group_by(Model.status)
            )).all()}
            procesando = [{
                "id": r.id, "filename": r.filename,
                "hace_s": round((ahora - r.started_at).total_seconds()) if r.started_at else None,
            } for r in (await db.execute(
                select(Model).where(Model.status == "processing")
            )).scalars().all()]
            fallidos = [{
                "id": r.id, "filename": r.filename, "error": r.last_error,
                "uploaded_at": r.uploaded_at.isoformat() if r.uploaded_at else None,
            } for r in (await db.execute(
                select(Model).where(Model.status == "failed")
                .order_by(Model.uploaded_at.desc()).limit(3)
            )).scalars().all()]
            out["kinds"][kind] = {
                "pendientes": counts.get("pending", 0),
                "procesando": counts.get("processing", 0),
                "completados": counts.get("completed", 0),
                "fallidos": counts.get("failed", 0),
                "en_proceso": procesando,
                "ultimos_fallidos": fallidos,
            }
    return out
