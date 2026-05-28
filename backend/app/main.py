"""FastAPI app entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.v1 import audit, auth, calls, gestiones, reports, uploads, users
from .core.config import settings
from .core.database import Base, engine
from .core.logging import configure_logging, logger
from .jobs import resume_pending_jobs


MIGRATIONS_IDEMPOTENT = [
    # users: nuevos campos
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE",
    # migrar viewer -> analyst (rename de rol)
    "UPDATE users SET role = 'analyst' WHERE role = 'viewer'",
    # reports: publish workflow
    "ALTER TABLE reports ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE reports ADD COLUMN IF NOT EXISTS published_at TIMESTAMP WITH TIME ZONE",
    "ALTER TABLE reports ADD COLUMN IF NOT EXISTS published_by VARCHAR(36)",
    "ALTER TABLE reports ADD COLUMN IF NOT EXISTS title VARCHAR(255)",
    # call_reports: publish workflow
    "ALTER TABLE call_reports ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE call_reports ADD COLUMN IF NOT EXISTS published_at TIMESTAMP WITH TIME ZONE",
    "ALTER TABLE call_reports ADD COLUMN IF NOT EXISTS published_by VARCHAR(36)",
    "ALTER TABLE call_reports ADD COLUMN IF NOT EXISTS title VARCHAR(255)",
    # gestion_reports: publish workflow (las tablas se crean via create_all)
    "ALTER TABLE gestion_reports ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE gestion_reports ADD COLUMN IF NOT EXISTS published_at TIMESTAMP WITH TIME ZONE",
    "ALTER TABLE gestion_reports ADD COLUMN IF NOT EXISTS published_by VARCHAR(36)",
    "ALTER TABLE gestion_reports ADD COLUMN IF NOT EXISTS title VARCHAR(255)",
]


async def _run_migrations() -> dict[str, list[str]]:
    """Corre cada ALTER de forma idempotente. Cada uno en su propia transacción
    para que un error no abort'ee toda la cola en PostgreSQL.
    Devuelve {'ok': [...], 'skipped': [...]} para diagnóstico.
    """
    from sqlalchemy import text
    ok: list[str] = []
    skipped: list[str] = []
    for stmt in MIGRATIONS_IDEMPOTENT:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(stmt))
            ok.append(stmt[:80])
            logger.info(f"[migration] OK: {stmt[:80]}")
        except Exception as exc:
            skipped.append(f"{stmt[:80]} -> {exc}")
            logger.warning(f"[migration] SKIPPED: {stmt[:80]} -> {exc}")
    return {"ok": ok, "skipped": skipped}


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    logger.info("Boot: ensuring DB schema")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Boot: running idempotent migrations")
    result = await _run_migrations()
    logger.info(f"Boot: migrations ok={len(result['ok'])} skipped={len(result['skipped'])}")
    logger.info("Boot: resuming pending jobs")
    count = await resume_pending_jobs()
    logger.info(f"Boot: re-queued {count} jobs")
    yield
    logger.info("Shutdown")


app = FastAPI(
    title="Cobranzas Voicenter · Sudameris Seguros",
    version="0.1.0",
    description="Plataforma de análisis de cobranzas. Operado por Voicenter S.A.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.env}


@app.post("/api/v1/admin/migrate")
async def trigger_migrations(token: str | None = None) -> dict:
    """Endpoint de emergencia para re-correr las migraciones idempotentes.

    Auth simple: hay que pasar ?token=<SECRET_KEY> para evitar abuso.
    Devuelve cuáles ALTER pasaron y cuáles se saltaron (con el motivo).
    """
    from fastapi import HTTPException, status
    if token != settings.secret_key:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Token invalido")
    result = await _run_migrations()
    return {
        "ok_count": len(result["ok"]),
        "skipped_count": len(result["skipped"]),
        "ok": result["ok"],
        "skipped": result["skipped"],
    }


@app.get("/api/v1/admin/db-info")
async def db_info(token: str | None = None) -> dict:
    """Diagnóstico: cuántas filas hay en cada tabla principal."""
    from fastapi import HTTPException, status
    from sqlalchemy import text
    if token != settings.secret_key:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Token invalido")
    counts: dict = {}
    async with engine.begin() as conn:
        for table in ["users", "uploads", "reports", "call_uploads", "call_reports",
                      "gestion_uploads", "gestion_reports", "audit_log"]:
            try:
                r = await conn.execute(text(f"SELECT COUNT(*) FROM {table}"))
                counts[table] = r.scalar()
            except Exception as exc:
                counts[table] = f"ERROR: {exc}"
    return {"tables": counts}


# Mount routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(uploads.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
app.include_router(calls.router, prefix="/api/v1")
app.include_router(gestiones.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(audit.router, prefix="/api/v1")
