"""Parse 'Libro de Producción' (ventas de pólizas — Televentas).

El export trae 46 columnas. Cada fila es una emisión o una anulación:
  * **Prima > 0  → EMISIÓN**  (póliza/endoso emitido)
  * **Prima < 0  → ANULACIÓN** (importe anulado = |Prima|)

El vendedor es la columna **'Nombre Referencia'** (formato "APELLIDOS, NOMBRES").
El tipo de póliza es **'Descripción Producto'**.

Resolvemos las columnas por header EXACTO normalizado (sin acentos/mojibake) y con
fallback a "contiene", para evitar ambigüedades como 'Asegurado' vs 'Código
Asegurado' o 'Póliza' vs 'Póliza Automática'.
"""
from __future__ import annotations

from datetime import date, datetime, time
from pathlib import Path
from typing import Any

from ._excel_loader import load_excel
from ._text import fix_text, strip_accents


# canonical -> header exacto (normalizado). El primero que matchee gana.
_EXACT = {
    "secc": "secc.",
    "poliza": "poliza",
    "endoso": "end.",
    "asegurado": "asegurado",
    "f_emision": "f/emision",
    "suma_asegurada": "suma asegurada",
    "prima": "prima",
    "premio": "premio",
    "tipo_registro": "tipo registro",
    "vendedor": "nombre referencia",
    "producto": "descripcion producto",
    "canal": "descripcion canal",
    "cobrador": "nom. cobrador",
    "sucursal": "sucursal",
}
# fallback "contiene" (por si el header cambia levemente)
_CONTAINS = {
    "asegurado": ("asegurado",),
    "f_emision": ("emision",),
    "vendedor": ("nombre", "referencia"),
    "producto": ("descripcion", "producto"),
    "canal": ("descripcion", "canal"),
    "cobrador": ("cobrador",),
}


def _to_float(value: Any) -> float:
    if value is None or value == "":
        return 0.0
    if isinstance(value, bool):
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(".", "").replace(",", ".")
    # los importes vienen sin separador de miles en el export (enteros de guaraníes),
    # pero por las dudas soportamos ambos. Intentamos parse directo primero.
    try:
        return float(str(value).strip())
    except (ValueError, TypeError):
        pass
    try:
        return float(text)
    except (ValueError, TypeError):
        return 0.0


def _to_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y", "%d/%m/%Y %H:%M"):
            try:
                return datetime.strptime(value.strip(), fmt).date()
            except ValueError:
                continue
    return None


def _build_index(headers: list[Any]) -> dict[str, int]:
    norm = [strip_accents(h) for h in headers]
    idx: dict[str, int] = {}
    for canonical, exact in _EXACT.items():
        for i, h in enumerate(norm):
            if h == exact:
                idx[canonical] = i
                break
    # fallback "contiene"
    for canonical, keys in _CONTAINS.items():
        if canonical in idx:
            continue
        for i, h in enumerate(norm):
            if all(k in h for k in keys):
                idx[canonical] = i
                break
    return idx


def parse_televentas_produccion(path: str | Path) -> list[dict[str, Any]]:
    sheets = load_excel(path)
    sheet_rows: list[list[Any]] | None = None
    for _name, rows in sheets.items():
        if len(rows) > 1 and rows[0]:
            headers = [strip_accents(h) for h in rows[0]]
            if any("prima" == h or "nombre referencia" == h for h in headers):
                sheet_rows = rows
                break
    if sheet_rows is None:
        # fallback: primera hoja con datos
        for _name, rows in sheets.items():
            if len(rows) > 1 and rows[0]:
                sheet_rows = rows
                break
    if not sheet_rows or len(sheet_rows) < 2:
        raise ValueError(f"Libro de Producción vacío. Hojas: {list(sheets.keys())}")

    headers = list(sheet_rows[0])
    idx = _build_index(headers)
    if "prima" not in idx or "vendedor" not in idx:
        raise ValueError(
            f"Libro de Producción: faltan columnas requeridas (Prima, Nombre Referencia). "
            f"Headers: {[str(h) for h in headers]}"
        )

    def get(row: list[Any], canonical: str) -> Any:
        i = idx.get(canonical, -1)
        if i < 0 or i >= len(row):
            return None
        return row[i]

    out: list[dict[str, Any]] = []
    for raw in sheet_rows[1:]:
        prima = _to_float(get(raw, "prima"))
        vendedor = fix_text(get(raw, "vendedor"))
        if not vendedor and prima == 0:
            continue
        out.append({
            "secc": fix_text(get(raw, "secc")),
            "poliza": fix_text(get(raw, "poliza")),
            "endoso": fix_text(get(raw, "endoso")),
            "asegurado": fix_text(get(raw, "asegurado")).upper(),
            "fecha_emision": _to_date(get(raw, "f_emision")),
            "suma_asegurada": _to_float(get(raw, "suma_asegurada")),
            "prima": prima,
            "premio": _to_float(get(raw, "premio")),
            "tipo_registro": fix_text(get(raw, "tipo_registro")),
            "vendedor": vendedor,
            "producto": fix_text(get(raw, "producto")) or "(sin producto)",
            "canal": fix_text(get(raw, "canal")) or "(sin canal)",
            "cobrador": fix_text(get(raw, "cobrador")) or "(sin cobrador)",
            "es_anulacion": prima < 0,
        })
    return out
