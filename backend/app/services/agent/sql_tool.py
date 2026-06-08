"""Tool de consulta SQL con guardas (text-to-SQL read-only) · Atención.

El agente puede escribir un SELECT para agregaciones ad-hoc no cubiertas por las
tools curadas. Capas de seguridad (defensa en profundidad):
  * solo SELECT/WITH, una sola sentencia;
  * tokens destructivos prohibidos (INSERT/UPDATE/DELETE/DDL/…);
  * whitelist de tablas (solo Atención; nunca users/audit/uploads);
  * LIMIT forzado + statement_timeout + transacción READ ONLY (Postgres);
  * PII enmascarada en los resultados.

Recomendación de hardening adicional: un rol de Postgres con solo SELECT.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import text

from ...core.database import engine, session_scope
from .pii import redactar_row


# Tablas que el agente puede consultar (scope Atención).
WHITELIST = {
    "atencion_gestion_items",
    "atencion_gestion_reports",
    "atencion_llamadas_reports",
}

_FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|attach|"
    r"copy|merge|replace|vacuum|analyze|reindex|call|do|begin|commit|rollback|"
    r"pg_sleep|pg_read|lo_import|lo_export|set\s+role|into\s+outfile)\b",
    re.IGNORECASE,
)
_TABLES_RE = re.compile(r"\b(?:from|join)\s+([a-zA-Z_][a-zA-Z0-9_]*)", re.IGNORECASE)
_CTE_RE = re.compile(r"(?:\bwith|,)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+as\b", re.IGNORECASE)
_LIMIT_RE = re.compile(r"\blimit\s+(\d+)", re.IGNORECASE)

_MAX_ROWS = 200
_DEFAULT_LIMIT = 100
_MAX_CELL = 600


SCHEMA_DOC = {
    "atencion_gestion_items": {
        "descripcion": "Una fila por gestión/caso de atención (granular).",
        "columnas": {
            "period_month": "date (mes del reporte, día 1)",
            "fecha": "date (fecha de la gestión)",
            "tipo_caso": "text (Consulta | Reclamo | Solicitud)",
            "estado": "text (Cerrado | Pendiente | En proceso)",
            "motivo": "text (motivo de la llamada)",
            "departamento": "text",
            "responsable": "text (email del responsable)",
            "canal": "text (Telefonico | Whatsapp | Correo)",
            "seccion": "text",
            "tema": "text (tema clasificado: Siniestros y denuncias, Cancelaciones, "
                    "Pagos y cobranzas, Pólizas y certificados, etc.)",
            "descripcion": "text (descripción del problema; PII redactada en el resultado)",
            "cliente": "text (PII: se devuelve enmascarado)",
        },
    },
    "atencion_gestion_reports": {
        "descripcion": "Un reporte de gestiones por período (agregados en columna data JSON).",
        "columnas": {
            "period_month": "date", "total_gestiones": "int", "cerrados": "int",
            "pendientes": "int", "pct_cerrados": "numeric", "generated_at": "timestamp",
        },
    },
    "atencion_llamadas_reports": {
        "descripcion": "Un reporte de llamadas por período (agregados en columna data JSON).",
        "columnas": {
            "period_month": "date", "llamadas_ingresadas": "int", "contestadas": "int",
            "abandonadas": "int", "nivel_atencion_pct": "numeric", "sla_pct": "numeric",
            "aht_seg": "numeric", "operadores_activos": "int", "generated_at": "timestamp",
        },
    },
}


def describe_schema_impl() -> dict[str, Any]:
    return {
        "tablas": SCHEMA_DOC,
        "notas": [
            "Solo se permiten SELECT/WITH de una sola sentencia sobre estas tablas.",
            "Siempre se aplica un LIMIT (máx 200). Las columnas con PII vienen enmascaradas.",
            "Para JSON de los reports usá operadores de Postgres (data->'kpis'->>'...').",
        ],
    }


def validar_select(sql: str) -> tuple[bool, str]:
    """Valida y normaliza el SELECT. Devuelve (sql_listo) o lanza ValueError."""
    s = (sql or "").strip().rstrip(";").strip()
    if not s:
        raise ValueError("Consulta vacía.")
    if ";" in s:
        raise ValueError("Solo se permite una única sentencia (sin ';').")
    low = s.lower()
    if not (low.startswith("select") or low.startswith("with")):
        raise ValueError("Solo se permiten consultas SELECT (o WITH ... SELECT).")
    if _FORBIDDEN.search(s):
        raise ValueError("La consulta contiene operaciones no permitidas (solo lectura).")

    ctes = {c.lower() for c in _CTE_RE.findall(s)}
    referenced = {t.lower() for t in _TABLES_RE.findall(s)}
    no_permitidas = referenced - WHITELIST - ctes
    if no_permitidas:
        raise ValueError(
            f"Tablas no permitidas: {sorted(no_permitidas)}. "
            f"Permitidas: {sorted(WHITELIST)}."
        )

    m = _LIMIT_RE.search(s)
    if m:
        if int(m.group(1)) > _MAX_ROWS:
            s = _LIMIT_RE.sub(f"LIMIT {_MAX_ROWS}", s, count=1)
    else:
        s = f"{s} LIMIT {_DEFAULT_LIMIT}"
    return True, s


def _jsonable(v: Any) -> Any:
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (bytes, bytearray)):
        return "<bytes>"
    if isinstance(v, str) and len(v) > _MAX_CELL:
        return v[:_MAX_CELL] + "…"
    return v


async def run_select_impl(sql: str) -> dict[str, Any]:
    try:
        _, query = validar_select(sql)
    except ValueError as exc:
        return {"error": str(exc)}

    is_pg = engine.dialect.name == "postgresql"
    try:
        async with session_scope() as db:
            if is_pg:
                await db.execute(text("SET TRANSACTION READ ONLY"))
                await db.execute(text("SET LOCAL statement_timeout = '5000'"))
            result = await db.execute(text(query))
            mappings = result.mappings().all()
    except Exception as exc:  # noqa: BLE001
        return {"error": f"Error ejecutando la consulta: {str(exc)[:200]}"}

    truncated = len(mappings) > _MAX_ROWS
    rows = []
    for row in mappings[:_MAX_ROWS]:
        red = redactar_row(dict(row))
        rows.append({k: _jsonable(v) for k, v in red.items()})

    columns = list(rows[0].keys()) if rows else []
    return {
        "sql_ejecutado": query,
        "columnas": columns,
        "filas": rows,
        "cantidad": len(rows),
        "truncado": truncated,
    }
