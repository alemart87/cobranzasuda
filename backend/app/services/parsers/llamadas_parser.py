"""Parse 'Bsse de llamadas' sheet from Reporte Cobranzas.

Soporta tanto .xls como .xlsx — el loader detecta el formato por magic bytes.
"""
from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any

from ._excel_loader import load_excel


SHEET_CANDIDATES = ["Bsse de llamadas", "Base de llamadas", "Bsse_de_llamadas"]
DUR_RE = re.compile(r"(\d+):(\d+):(\d+(?:\.\d+)?)")


def _parse_duration(value: Any) -> float:
    """Returns duration in seconds (float)."""
    if value is None or value == "":
        return 0.0
    if isinstance(value, bool):
        return 0.0
    if isinstance(value, (int, float)):
        # Excel almacena duración como fracción de día
        return float(value) * 86400.0
    if isinstance(value, timedelta):
        return value.total_seconds()
    if isinstance(value, time):
        return value.hour * 3600 + value.minute * 60 + value.second + value.microsecond / 1e6
    if isinstance(value, datetime):
        return value.hour * 3600 + value.minute * 60 + value.second + value.microsecond / 1e6
    text = str(value).strip()
    m = DUR_RE.search(text)
    if m:
        return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    return 0.0


def _parse_fecha(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, time(0, 0))
    if isinstance(value, str):
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%d/%m/%Y %H:%M", "%d/%m/%Y"):
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue
    return None


def parse_llamadas(path: str | Path) -> list[dict[str, Any]]:
    sheets = load_excel(path)

    # Buscar la hoja correcta
    sheet_rows: list[list[Any]] | None = None
    for name in SHEET_CANDIDATES:
        if name in sheets:
            sheet_rows = sheets[name]
            break
    if sheet_rows is None:
        # Fallback: cualquier hoja con >100 filas y columna "Usuario/Operador"
        for name, rows in sheets.items():
            if len(rows) > 100 and rows:
                headers = [str(h or "").lower() for h in rows[0]]
                if any("usuario" in h or "operador" in h for h in headers):
                    sheet_rows = rows
                    break

    if sheet_rows is None or len(sheet_rows) < 2:
        raise ValueError(
            f"No se encontró hoja con datos de llamadas. Hojas disponibles: {list(sheets.keys())}"
        )

    headers = [str(h or "").strip() for h in sheet_rows[0]]

    def col_idx(*keywords: str) -> int | None:
        for i, h in enumerate(headers):
            low = h.lower()
            if all(k.lower() in low for k in keywords):
                return i
        return None

    idx_user = col_idx("usuario") or col_idx("operador") or col_idx("agente")
    idx_fecha = col_idx("fecha")
    idx_dur = col_idx("duraci")
    idx_dir = col_idx("direcci")
    idx_cola = col_idx("cola")
    idx_concl = col_idx("conclu")

    if idx_user is None or idx_fecha is None or idx_dur is None:
        raise ValueError(
            f"Faltan columnas requeridas (Usuario, Fecha, Duración). Headers: {headers}"
        )

    rows: list[dict[str, Any]] = []
    for raw in sheet_rows[1:]:
        # Asegurar índices válidos
        def get(i: int | None) -> Any:
            if i is None or i >= len(raw):
                return None
            return raw[i]

        usuario = get(idx_user)
        if not usuario:
            continue
        fecha = _parse_fecha(get(idx_fecha))
        dur_sec = _parse_duration(get(idx_dur))
        rows.append({
            "usuario": str(usuario).strip(),
            "fecha": fecha,
            "duracion_seg": dur_sec,
            "direccion": (str(get(idx_dir)).strip() if get(idx_dir) else "Saliente"),
            "cola": (str(get(idx_cola)).strip() if get(idx_cola) else ""),
            "conclusion": (str(get(idx_concl)).strip() if get(idx_concl) else ""),
        })

    return rows
