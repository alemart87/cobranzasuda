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


async def _run_migrations() -> None:
    from sqlalchemy import text
    async with engine.begin() as conn:
        for stmt in MIGRATIONS_IDEMPOTENT:
            try:
                await conn.execute(text(stmt))
            except Exception as exc:
                # SQLite/old PG no soportan ALTER ... ADD COLUMN IF NOT EXISTS; ignorar
                logger.debug(f"migration skipped: {stmt[:50]}... -> {exc}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    logger.info("Boot: ensuring DB schema")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _run_migrations()
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


# Mount routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(uploads.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
app.include_router(calls.router, prefix="/api/v1")
app.include_router(gestiones.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(audit.router, prefix="/api/v1")
