"""FastAPI app entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.v1 import audit, auth, reports, uploads, users
from .core.config import settings
from .core.database import Base, engine
from .core.logging import configure_logging, logger
from .jobs import resume_pending_jobs


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    logger.info("Boot: ensuring DB schema")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
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
app.include_router(users.router, prefix="/api/v1")
app.include_router(audit.router, prefix="/api/v1")
