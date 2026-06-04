"""Parser del Reporte de Gestiones — módulo Atención al Cliente.

Archivo Gestiones.xlsx (CRM de atención, distinto al CRM de cobranzas).
Una fila por gestión/caso registrado.
"""
from __future__ import annotations

from datetime import date, datetime, time
from pathlib import Path
from typing import Any

from ._excel_loader import load_excel
from ._text import find_col, fix_text


def _as_dt(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, time())
    if isinstance(value, str) and value.strip():
        s = value.strip()
        for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S",
                    "%Y-%m-%d %H:%M", "%d/%m/%Y %H:%M", "%d/%m/%Y", "%Y-%m-%d"):
            try:
                return datetime.strptime(s, fmt)
            except ValueError:
                continue
    return None


def parse_atencion_gestiones(path: str | Path) -> list[dict[str, Any]]:
    sheets = load_excel(path)
    # Hoja con la columna CLIENTE / Tipo de Caso.
    rows: list[list[Any]] | None = None
    for r in sheets.values():
        if r and (find_col(r[0], "tipo", "caso") is not None or find_col(r[0], "cliente") is not None):
            rows = r
            break
    if rows is None:
        rows = next(iter(sheets.values()), [])
    if not rows or len(rows) < 2:
        raise ValueError(f"Gestiones: sin datos. Hojas: {list(sheets)}")

    headers = rows[0]
    cols = {
        "cliente": find_col(headers, "cliente"),
        "documento": find_col(headers, "documento"),
        "telefono": find_col(headers, "telefono"),
        "tipo_caso": find_col(headers, "tipo", "caso"),
        "estado": find_col(headers, "estado"),
        "motivo": find_col(headers, "motivo", "llamada") or find_col(headers, "motivo"),
        "departamento": find_col(headers, "departamento"),
        "responsable": find_col(headers, "responsable"),
        "descripcion": find_col(headers, "descripcion"),
        "fecha_llamada": find_col(headers, "fecha", "llamada"),
        "fecha_resolucion": find_col(headers, "fecha", "resolucion"),
        "canal": find_col(headers, "canal", "contacto"),
        "resultado": find_col(headers, "resultado"),
        "canal_venta": find_col(headers, "canal", "venta"),
        "seccion": find_col(headers, "seccion"),
        "analista": find_col(headers, "analista"),
        "clasificacion": find_col(headers, "clasificacion"),
        "creado": find_col(headers, "creado"),
    }

    def get(r: list[Any], idx: int | None) -> Any:
        return r[idx] if idx is not None and idx < len(r) else None

    out: list[dict[str, Any]] = []
    for r in rows[1:]:
        # Ignorar filas totalmente vacías.
        if not any(c not in (None, "") for c in r):
            continue
        rec: dict[str, Any] = {}
        for key, idx in cols.items():
            rec[key] = fix_text(get(r, idx))
        if not rec.get("cliente") and not rec.get("tipo_caso") and not rec.get("motivo"):
            continue
        rec["fecha_llamada_dt"] = _as_dt(get(r, cols["fecha_llamada"]))
        rec["fecha_resolucion_dt"] = _as_dt(get(r, cols["fecha_resolucion"]))
        out.append(rec)
    return out
