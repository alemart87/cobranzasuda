"""Parse del export "Detalle General de Monitoreo" (calidad de llamadas, Televentas Sudameris).

Columnas del archivo (.xls / .xlsx): id_monitoreo | nombre_cuenta | fecha monitoreo |
fecha llamada | monitoreador | operador | estado_operador | id_archivograv |
duracion_llamada ("2m 10s") | tipo de llamada | tipo de contacto | tipo de producto |
motivo de llamada | comentarios | sugerencias | compromiso | estado | total_precision |
critico | caso_puntual.

Devuelve un dict por monitoreo con tipos limpios: fechas como datetime/date, duración en
segundos, precisión como float 0..100, banderas como bool. Tolera columnas faltantes.
"""
from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any

from ._excel_loader import load_excel
from ._text import find_col, fix_text

_DUR_RE = re.compile(r"(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?", re.I)
_HMS_RE = re.compile(r"^(\d+):(\d+)(?::(\d+))?$")


def _duracion_seg(value: Any) -> int:
    """'2m 10s' · '15m 07s' · '0:02:10' · fracción de día de Excel → segundos."""
    if value is None or value == "" or isinstance(value, bool):
        return 0
    if isinstance(value, timedelta):
        return int(value.total_seconds())
    if isinstance(value, (time, datetime)):
        return value.hour * 3600 + value.minute * 60 + value.second
    if isinstance(value, (int, float)):
        return int(round(float(value) * 86400)) if float(value) < 1 else int(value)
    s = str(value).strip()
    m = _HMS_RE.match(s)
    if m:
        h, mi, se = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
        return h * 3600 + mi * 60 + se if m.group(3) else h * 60 + mi
    m = _DUR_RE.fullmatch(s)
    if m and any(m.groups()):
        return int(m.group(1) or 0) * 3600 + int(m.group(2) or 0) * 60 + int(m.group(3) or 0)
    return 0


def _fecha(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, time(0, 0))
    if isinstance(value, (int, float)) and not isinstance(value, bool) and value > 20000:
        # serial de Excel que xlrd no marcó como fecha
        return datetime(1899, 12, 30) + timedelta(days=float(value))
    if isinstance(value, str):
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y"):
            try:
                return datetime.strptime(value.strip(), fmt)
            except ValueError:
                continue
    return None


def _pct(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        v = float(str(value).replace("%", "").replace(",", ".").strip())
    except ValueError:
        return None
    if 0 < v <= 1:
        v *= 100
    return round(max(0.0, min(v, 100.0)), 1)


def _flag(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().upper() in ("SI", "SÍ", "S", "YES", "TRUE", "1", "X")


def _txt(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return fix_text(value).strip()


def _find_header(rows: list[list[Any]]) -> int | None:
    for i, row in enumerate(rows[:30]):
        cells = [str(c or "").strip().lower() for c in row]
        if any("id_monitoreo" in c or "monitoreador" in c for c in cells) and any("operador" in c for c in cells):
            return i
    return None


def parse_televentas_monitoreos(path: str | Path) -> list[dict[str, Any]]:
    sheets = load_excel(path)
    for _name, rows in sheets.items():
        h = _find_header(rows)
        if h is None:
            continue
        headers = [str(c or "") for c in rows[h]]
        col = {
            "id": find_col(headers, "id_monitoreo") if find_col(headers, "id_monitoreo") is not None else find_col(headers, "id", "monitoreo"),
            "cuenta": find_col(headers, "cuenta"),
            "fecha_monitoreo": find_col(headers, "fecha", "monitoreo"),
            "fecha_llamada": find_col(headers, "fecha", "llamada"),
            "monitoreador": find_col(headers, "monitoreador"),
            "operador": find_col(headers, "operador") if find_col(headers, "estado_operador") != find_col(headers, "operador") else None,
            "estado_operador": find_col(headers, "estado_operador"),
            "grabacion": find_col(headers, "archivo"),
            "duracion": find_col(headers, "duracion"),
            "tipo_llamada": find_col(headers, "tipo", "llamada"),
            "tipo_contacto": find_col(headers, "tipo", "contacto"),
            "tipo_producto": find_col(headers, "tipo", "producto"),
            "motivo": find_col(headers, "motivo"),
            "comentarios": find_col(headers, "comentario"),
            "sugerencias": find_col(headers, "sugerencia"),
            "compromiso": find_col(headers, "compromiso"),
            "estado": None,
            "precision": find_col(headers, "precision"),
            "critico": find_col(headers, "critico"),
            "caso_puntual": find_col(headers, "caso"),
        }
        # "operador" exacto (no "estado_operador") y "estado" exacto (no "estado_operador")
        norm = [str(x).strip().lower() for x in headers]
        if "operador" in norm:
            col["operador"] = norm.index("operador")
        if "estado" in norm:
            col["estado"] = norm.index("estado")
        if col["operador"] is None or col["precision"] is None:
            continue

        def g(row: list[Any], key: str) -> Any:
            i = col.get(key)
            return row[i] if i is not None and i < len(row) else None

        out: list[dict[str, Any]] = []
        for row in rows[h + 1:]:
            if not row or all(c in (None, "") for c in row):
                continue
            operador = _txt(g(row, "operador"))
            if not operador or operador.lower().startswith("reporte generado"):
                continue
            id_mon = _txt(g(row, "id"))
            out.append({
                "id_monitoreo": id_mon or None,
                "cuenta": _txt(g(row, "cuenta")),
                "fecha_monitoreo": _fecha(g(row, "fecha_monitoreo")),
                "fecha_llamada": _fecha(g(row, "fecha_llamada")),
                "monitoreador": _txt(g(row, "monitoreador")),
                "operador": operador,
                "estado_operador": _txt(g(row, "estado_operador")),
                "id_grabacion": _txt(g(row, "grabacion")),
                "duracion_seg": _duracion_seg(g(row, "duracion")),
                "tipo_llamada": _txt(g(row, "tipo_llamada")),
                "tipo_contacto": _txt(g(row, "tipo_contacto")),
                "tipo_producto": _txt(g(row, "tipo_producto")),
                "motivo_llamada": _txt(g(row, "motivo")),
                "comentarios": _txt(g(row, "comentarios")),
                "sugerencias": _txt(g(row, "sugerencias")),
                "compromiso": _txt(g(row, "compromiso")),
                "estado_evaluacion": _txt(g(row, "estado")),
                "precision": _pct(g(row, "precision")),
                "critico": _flag(g(row, "critico")),
                "caso_puntual": _flag(g(row, "caso_puntual")),
            })
        return out
    raise ValueError("No se encontró la hoja de monitoreos (columnas id_monitoreo / operador / total_precision).")
