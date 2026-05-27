"""Parse 'Reporte de Gestiones' XLSX (CRM export).

Columnas esperadas: ID, Lead - Asegurado, Campaña, Usuario, Estado, Subestado,
Fecha Gestión, Observación, Prima, Estado Trámite, Número Trámite,
Fecha Compromiso, Teléfono, Email Lead, Creado el.
"""
from __future__ import annotations

from datetime import date, datetime, time
from pathlib import Path
from typing import Any

from ._excel_loader import load_excel


REQUIRED = ["Usuario", "Estado", "Subestado"]


def _parse_fecha(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, time())
    if isinstance(value, str):
        for fmt in (
            "%d/%m/%Y %H:%M",
            "%d/%m/%Y %H:%M:%S",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d",
            "%d/%m/%Y",
        ):
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue
    return None


def parse_gestiones(path: str | Path) -> list[dict[str, Any]]:
    sheets = load_excel(path)
    # Tomar la primera hoja con datos
    sheet_rows = None
    for name, rows in sheets.items():
        if len(rows) > 1 and rows[0]:
            sheet_rows = rows
            break
    if not sheet_rows:
        raise ValueError(f"Archivo vacío. Hojas: {list(sheets.keys())}")

    headers = [str(h or "").strip() for h in sheet_rows[0]]
    missing = [c for c in REQUIRED if c not in headers]
    if missing:
        raise ValueError(f"Reporte de Gestiones: faltan columnas {missing}. Headers: {headers}")

    def idx(name: str) -> int:
        for i, h in enumerate(headers):
            if h == name:
                return i
        return -1

    i_id = idx("ID")
    i_lead = idx("Lead - Asegurado")
    i_camp = idx("Campaña")
    i_user = idx("Usuario")
    i_estado = idx("Estado")
    i_sub = idx("Subestado")
    i_fecha = idx("Fecha Gestión")
    i_obs = idx("Observación")

    def get(row: list[Any], i: int) -> Any:
        if i < 0 or i >= len(row):
            return None
        return row[i]

    rows: list[dict[str, Any]] = []
    for raw in sheet_rows[1:]:
        usuario = get(raw, i_user)
        if not usuario:
            continue
        rows.append({
            "id": get(raw, i_id),
            "lead": str(get(raw, i_lead) or "").strip().upper(),
            "campana": str(get(raw, i_camp) or "").strip(),
            "usuario": str(usuario).strip(),
            "estado": str(get(raw, i_estado) or "").strip(),
            "subestado": str(get(raw, i_sub) or "").strip(),
            "fecha": _parse_fecha(get(raw, i_fecha)),
            "observacion": str(get(raw, i_obs) or "").strip(),
        })
    return rows
