"""Parse export de llamadas de Televentas (voz saliente, formato Voicenter/Genesys).

Columnas: Exportación completa | Marca de hora | Filtros | Tipo de medios |
Usuarios | Remoto | Fecha | Duración | Dirección | Cola | Conclusión.

Mismo criterio que el módulo de llamadas de Cobranzas, pero reparando el mojibake
de los nombres (`Vania Gissel BenÃ­tez` → `Vania Gissel Benítez`) para poder
cruzar el vendedor con el Libro de Producción.
"""
from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any

from ._excel_loader import load_excel
from ._text import fix_text, find_col


_DUR_RE = re.compile(r"(\d+):(\d+):(\d+(?:\.\d+)?)")


def _parse_duration(value: Any) -> float:
    if value is None or value == "" or isinstance(value, bool):
        return 0.0
    if isinstance(value, (int, float)):
        return float(value) * 86400.0  # Excel: fracción de día
    if isinstance(value, timedelta):
        return value.total_seconds()
    if isinstance(value, (time, datetime)):
        return value.hour * 3600 + value.minute * 60 + value.second + value.microsecond / 1e6
    m = _DUR_RE.search(str(value).strip())
    if m:
        return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    return 0.0


def _parse_fecha(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, time(0, 0))
    if isinstance(value, str):
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y"):
            try:
                return datetime.strptime(value.strip(), fmt)
            except ValueError:
                continue
    return None


def parse_televentas_llamadas(path: str | Path) -> list[dict[str, Any]]:
    sheets = load_excel(path)
    sheet_rows: list[list[Any]] | None = None
    for _name, rows in sheets.items():
        if len(rows) > 1 and rows[0]:
            if find_col(rows[0], "usuario") is not None or find_col(rows[0], "operador") is not None:
                sheet_rows = rows
                break
    if sheet_rows is None:
        for _name, rows in sheets.items():
            if len(rows) > 1 and rows[0]:
                sheet_rows = rows
                break
    if not sheet_rows or len(sheet_rows) < 2:
        raise ValueError(f"Export de llamadas vacío. Hojas: {list(sheets.keys())}")

    headers = list(sheet_rows[0])
    i_user = find_col(headers, "usuario") or find_col(headers, "operador") or find_col(headers, "agente")
    i_fecha = find_col(headers, "fecha")
    i_dur = find_col(headers, "duracion")
    i_dir = find_col(headers, "direccion")
    i_cola = find_col(headers, "cola")
    i_concl = find_col(headers, "conclusion")
    i_medio = find_col(headers, "tipo", "medios")
    if i_user is None or i_fecha is None or i_dur is None:
        raise ValueError(
            f"Faltan columnas requeridas (Usuarios, Fecha, Duración). "
            f"Headers: {[str(h) for h in headers]}"
        )

    def get(row: list[Any], i: int | None) -> Any:
        if i is None or i >= len(row):
            return None
        return row[i]

    out: list[dict[str, Any]] = []
    for raw in sheet_rows[1:]:
        usuario = fix_text(get(raw, i_user))
        if not usuario:
            continue
        out.append({
            "usuario": usuario,
            "fecha": _parse_fecha(get(raw, i_fecha)),
            "duracion_seg": _parse_duration(get(raw, i_dur)),
            "direccion": fix_text(get(raw, i_dir)) or "Saliente",
            "cola": fix_text(get(raw, i_cola)),
            "conclusion": fix_text(get(raw, i_concl)),
            "tipo_medio": fix_text(get(raw, i_medio)) or "voz",
        })
    return out
