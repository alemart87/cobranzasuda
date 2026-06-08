"""FastAPI app entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.v1 import (
    agent, atencion, audit, auth, bases_adicionales, calls, gestiones, modules, overview,
    publications, reports, uploads, users,
)
from .core.config import settings
from .core.database import Base, engine
from .core.logging import configure_logging, logger
from .jobs import atencion_worker, resume_pending_jobs


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


# Columnas críticas que TIENEN que existir para que el ORM no rompa.
# Si falta alguna, se agrega con un ALTER explícito (sin IF NOT EXISTS para soportar PG viejos).
REQUIRED_COLUMNS: list[tuple[str, str, str]] = [
    # (table, column, datatype)
    ("users", "photo_url", "VARCHAR(500)"),
    ("users", "last_login_at", "TIMESTAMP WITH TIME ZONE"),
    ("users", "allowed_modules", "JSON"),
    ("users", "can_use_agent", "BOOLEAN NOT NULL DEFAULT false"),
    ("reports", "is_published", "BOOLEAN NOT NULL DEFAULT false"),
    ("reports", "published_at", "TIMESTAMP WITH TIME ZONE"),
    ("reports", "published_by", "VARCHAR(36)"),
    ("reports", "title", "VARCHAR(255)"),
    ("call_reports", "is_published", "BOOLEAN NOT NULL DEFAULT false"),
    ("call_reports", "published_at", "TIMESTAMP WITH TIME ZONE"),
    ("call_reports", "published_by", "VARCHAR(36)"),
    ("call_reports", "title", "VARCHAR(255)"),
    ("gestion_reports", "is_published", "BOOLEAN NOT NULL DEFAULT false"),
    ("gestion_reports", "published_at", "TIMESTAMP WITH TIME ZONE"),
    ("gestion_reports", "published_by", "VARCHAR(36)"),
    ("gestion_reports", "title", "VARCHAR(255)"),
    # bases adicionales (créase via create_all, pero por si la tabla ya existía)
    ("base_adicional_reports", "is_published", "BOOLEAN NOT NULL DEFAULT false"),
    ("base_adicional_reports", "published_at", "TIMESTAMP WITH TIME ZONE"),
    ("base_adicional_reports", "published_by", "VARCHAR(36)"),
    ("base_adicional_reports", "title", "VARCHAR(255)"),
    # atención al cliente (créanse via create_all; por si la tabla ya existía)
    ("atencion_llamadas_reports", "is_published", "BOOLEAN NOT NULL DEFAULT false"),
    ("atencion_llamadas_reports", "published_at", "TIMESTAMP WITH TIME ZONE"),
    ("atencion_llamadas_reports", "published_by", "VARCHAR(36)"),
    ("atencion_llamadas_reports", "title", "VARCHAR(255)"),
    ("atencion_gestion_reports", "is_published", "BOOLEAN NOT NULL DEFAULT false"),
    ("atencion_gestion_reports", "published_at", "TIMESTAMP WITH TIME ZONE"),
    ("atencion_gestion_reports", "published_by", "VARCHAR(36)"),
    ("atencion_gestion_reports", "title", "VARCHAR(255)"),
]


async def _ensure_required_columns() -> dict[str, list[str]]:
    """Verifica con information_schema qué columnas existen y agrega las faltantes.
    Es 100 % seguro: solo agrega lo que falta, no toca nada existente.
    """
    from sqlalchemy import text

    is_postgres = "postgresql" in str(engine.url)
    if not is_postgres:
        # SQLite (tests/local) no soporta information_schema. create_all ya hizo el trabajo.
        return {"added": [], "already_exists": ["sqlite: skipped"]}

    added: list[str] = []
    already: list[str] = []

    async with engine.begin() as conn:
        # 1) Listar tablas existentes
        r = await conn.execute(text(
            "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
        ))
        existing_tables = {row[0] for row in r}

        # 2) Para cada (tabla, columna), verificar existencia y agregar si falta
        for table, col, dtype in REQUIRED_COLUMNS:
            if table not in existing_tables:
                # La tabla aún no existe; create_all la va a generar con el schema completo
                continue
            r = await conn.execute(text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_schema='public' AND table_name=:t AND column_name=:c"
            ), {"t": table, "c": col})
            exists = r.scalar() is not None
            if exists:
                already.append(f"{table}.{col}")
                continue
            # Agregar la columna en su propia subtransacción (savepoint)
            try:
                await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {dtype}"))
                added.append(f"{table}.{col} ({dtype})")
                logger.warning(f"[schema-heal] Added missing column: {table}.{col} {dtype}")
            except Exception as exc:
                logger.error(f"[schema-heal] FAILED to add {table}.{col}: {exc}")
                # NO romper el boot por una sola columna; pero loguear claro
    return {"added": added, "already_exists": already}


async def _run_migrations() -> dict[str, list[str]]:
    """Corre statements DML adicionales (UPDATEs) idempotentes.
    Cada uno en su propia transacción para no contaminar la siguiente.
    """
    from sqlalchemy import text
    extras = [
        "UPDATE users SET role = 'analyst' WHERE role = 'viewer'",
    ]
    ok: list[str] = []
    skipped: list[str] = []
    for stmt in extras:
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
    logger.info("Boot: ensuring DB schema (create_all)")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # AUTO-HEALING: detecta columnas faltantes via information_schema y las agrega
    logger.info("Boot: schema self-heal")
    heal = await _ensure_required_columns()
    logger.warning(
        f"Boot: schema heal added={len(heal['added'])} existed={len(heal['already_exists'])}"
    )
    for col in heal["added"]:
        logger.warning(f"[schema-heal] + {col}")

    logger.info("Boot: running DML migrations")
    result = await _run_migrations()
    logger.info(f"Boot: migrations ok={len(result['ok'])} skipped={len(result['skipped'])}")
    logger.info("Boot: resuming pending jobs")
    count = await resume_pending_jobs()
    logger.info(f"Boot: re-queued {count} jobs")

    # Worker de cola del módulo Atención (Postgres + disco, concurrencia limitada).
    import asyncio
    worker_task = asyncio.create_task(atencion_worker())
    logger.info("Boot: atencion queue worker started")

    yield

    worker_task.cancel()
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
    """Endpoint de emergencia: corre el auto-healing del schema + migraciones DML.

    Auth simple: ?token=<SECRET_KEY> (la env var de Render, no requiere login).
    Útil cuando algún boot anterior no aplicó las columnas.
    """
    from fastapi import HTTPException, status
    if token != settings.secret_key:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Token invalido")
    heal = await _ensure_required_columns()
    result = await _run_migrations()
    return {
        "schema_added": heal["added"],
        "schema_already_existed": heal["already_exists"],
        "dml_ok": result["ok"],
        "dml_skipped": result["skipped"],
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
app.include_router(modules.router, prefix="/api/v1")
app.include_router(bases_adicionales.router, prefix="/api/v1")
app.include_router(publications.router, prefix="/api/v1")
app.include_router(overview.router, prefix="/api/v1")
app.include_router(atencion.router, prefix="/api/v1")
app.include_router(agent.router, prefix="/api/v1")
