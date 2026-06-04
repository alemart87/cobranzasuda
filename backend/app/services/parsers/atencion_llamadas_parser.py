"""Parsers del Reporte de Llamadas — módulo Atención al Cliente.

Cuatro archivos exportados de Genesys (contact center):
  1. Entrantes/Salientes por agente  → interacción por interacción (voz/mensaje).
  2. Estados por agente              → tiempos por estado (auxiliares).
  3. Llamadas por intervalo          → métricas de cola por intervalo de 30 min.
  4. Colas de atención               → idéntico a #3 + fila de totales del período.

Todos vienen como .xls con doble codificación (mojibake) que se repara con
`fix_text`. Las fechas las entrega el loader como `datetime`; las duraciones
vienen como string ' HH:MM:SS.sss' (las horas pueden superar 99).
"""
from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any

from ._excel_loader import load_excel
from ._text import find_col, fix_text

_DUR_RE = re.compile(r"(\d+):(\d+):(\d+(?:\.\d+)?)")


# --------------------------------------------------------------------------- #
# Helpers de valores
# --------------------------------------------------------------------------- #
def _to_float(value: Any) -> float | None:
    """Convierte a float. Soporta '563.0', '0,91', None, ''."""
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _parse_duration(value: Any, numeric_unit: str = "day") -> float:
    """Duración en segundos.

    Soporta string ' HH:MM:SS.sss', time, datetime y números. Para los números,
    `numeric_unit` define la interpretación:
      * "day" → fracción de día (formato Excel; ej. celdas de duración .xls).
      * "ms"  → milisegundos (métricas de cola por intervalo de Genesys).
      * "sec" → segundos.
    """
    if value is None or value == "" or isinstance(value, bool):
        return 0.0
    if isinstance(value, timedelta):
        return value.total_seconds()
    if isinstance(value, time):
        return value.hour * 3600 + value.minute * 60 + value.second + value.microsecond / 1e6
    if isinstance(value, datetime):
        return value.hour * 3600 + value.minute * 60 + value.second + value.microsecond / 1e6
    if isinstance(value, (int, float)):
        return _num_to_seconds(float(value), numeric_unit)
    # String: la fila de totales trae 'HH:MM:SS.sss'; las filas por intervalo
    # traen el número (ms) como texto cuando el promedio no es entero.
    s = str(value).strip()
    m = _DUR_RE.search(s)
    if m:
        return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    try:
        return _num_to_seconds(float(s.replace(",", ".")), numeric_unit)
    except ValueError:
        return 0.0


# Duración por encima de la cual asumimos que la celda está corrupta en el origen
# (el export .xls trae una minoría de promedios con valores e16 basura).
_MAX_PLAUSIBLE_SEG = 4 * 3600.0


def _num_to_seconds(value: float, unit: str) -> float:
    if unit == "ms":
        secs = value / 1000.0
    elif unit == "sec":
        secs = value
    else:
        secs = value * 86400.0
    # Saneamos valores absurdos (datos corruptos del export) para no contaminar promedios.
    return secs if 0 <= secs <= _MAX_PLAUSIBLE_SEG else 0.0


def _as_dt(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, time())
    if isinstance(value, str) and value.strip():
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%d/%m/%Y %H:%M", "%d/%m/%Y", "%Y-%m-%d"):
            try:
                return datetime.strptime(value.strip(), fmt)
            except ValueError:
                continue
    return None


def _pick_sheet(sheets: dict[str, list[list[Any]]], *required: str) -> list[list[Any]]:
    """Devuelve las filas de la primera hoja cuyo header contiene TODOS los keywords."""
    best: list[list[Any]] | None = None
    for rows in sheets.values():
        if not rows:
            continue
        headers = rows[0]
        if all(find_col(headers, k) is not None for k in required):
            return rows
        if best is None and len(rows) > 1:
            best = rows
    if best is None:
        raise ValueError(f"No se encontró hoja con columnas {required}. Hojas: {list(sheets)}")
    return best


# --------------------------------------------------------------------------- #
# 1) Entrantes / Salientes por agente
# --------------------------------------------------------------------------- #
def parse_entrantes(path: str | Path) -> list[dict[str, Any]]:
    """Una fila por interacción atribuida a un operador.

    Las filas sin usuario (IVR / abandonadas en cola) se descartan acá: para el
    detalle por operador necesitamos el agente. Las filas con varios usuarios
    (mensajes con varios participantes) se expanden una por usuario.
    """
    rows = _pick_sheet(load_excel(path), "usuario", "direccion")
    headers = rows[0]
    i_user = find_col(headers, "usuario")
    i_fecha = find_col(headers, "fecha")
    i_dur = find_col(headers, "duracion")
    i_dir_ini = find_col(headers, "direccion", "inicial")
    i_dir = find_col(headers, "direccion")
    i_medio = find_col(headers, "tipo", "medio")
    i_cola = find_col(headers, "cola")
    i_concl = find_col(headers, "conclusion")

    def get(r: list[Any], idx: int | None) -> Any:
        return r[idx] if idx is not None and idx < len(r) else None

    out: list[dict[str, Any]] = []
    for r in rows[1:]:
        raw_user = fix_text(get(r, i_user))
        if not raw_user:
            continue
        fecha = _as_dt(get(r, i_fecha))
        dur = _parse_duration(get(r, i_dur))
        # Dirección inicial distingue Entrante vs Saliente (la real del contacto).
        direccion = fix_text(get(r, i_dir_ini)) or fix_text(get(r, i_dir))
        medio = fix_text(get(r, i_medio)) or "voz"
        cola = fix_text(get(r, i_cola))
        concl = fix_text(get(r, i_concl))
        usuarios = [u.strip() for u in raw_user.split(";") if u.strip()] or [raw_user]
        for u in usuarios:
            out.append({
                "usuario": u,
                "fecha": fecha,
                "duracion_seg": dur,
                "direccion": direccion,
                "tipo_medio": medio,
                "cola": cola,
                "conclusion": concl,
            })
    return out


# --------------------------------------------------------------------------- #
# 2) Estados por agente (auxiliares)
# --------------------------------------------------------------------------- #
def parse_estados(path: str | Path) -> list[dict[str, Any]]:
    rows = _pick_sheet(load_excel(path), "estado", "duracion")
    headers = rows[0]
    i_ag = find_col(headers, "nombre", "agente") or find_col(headers, "agente")
    i_ini = find_col(headers, "hora", "inicio") or find_col(headers, "inicio")
    i_fin = find_col(headers, "hora", "finaliz") or find_col(headers, "fin")
    i_pri = find_col(headers, "estado", "principal")
    i_sec = find_col(headers, "estado", "secundario")
    i_dur = find_col(headers, "duracion")

    def get(r: list[Any], idx: int | None) -> Any:
        return r[idx] if idx is not None and idx < len(r) else None

    out: list[dict[str, Any]] = []
    for r in rows[1:]:
        agente = fix_text(get(r, i_ag))
        if not agente:
            continue
        out.append({
            "agente": agente,
            "estado_principal": fix_text(get(r, i_pri)),
            "estado_secundario": fix_text(get(r, i_sec)),
            "inicio": _as_dt(get(r, i_ini)),
            "fin": _as_dt(get(r, i_fin)),
            "duracion_seg": _parse_duration(get(r, i_dur)),
        })
    return out


# --------------------------------------------------------------------------- #
# 3) y 4) Métricas de cola por intervalo (intervalo / colas)
# --------------------------------------------------------------------------- #
def _parse_intervalos(rows: list[list[Any]]) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    """Devuelve (filas de intervalo con datos, fila de totales si existe).

    La fila de totales del export de Colas viene sin 'Nombre de cola' pero con
    Oferta cargada. El resto son intervalos de 30 min por cola.
    """
    headers = rows[0]
    i_ini = find_col(headers, "inicio", "intervalo") or find_col(headers, "inicio")
    i_medio = find_col(headers, "tipo", "medio")
    i_cola = find_col(headers, "nombre", "cola")
    i_of = find_col(headers, "oferta")
    i_cont = find_col(headers, "contestadas")
    i_aband = find_col(headers, "abandonadas")
    i_sla = find_col(headers, "nivel", "servicio")
    i_asa = find_col(headers, "velocidad", "respuesta") or find_col(headers, "asa")
    i_manejo = find_col(headers, "manejo", "medio")
    i_espera = find_col(headers, "espera", "media")
    i_conv = find_col(headers, "conversacion", "media")
    i_acw = find_col(headers, "trabajo", "despues")

    def get(r: list[Any], idx: int | None) -> Any:
        return r[idx] if idx is not None and idx < len(r) else None

    intervalos: list[dict[str, Any]] = []
    totales: dict[str, Any] | None = None

    for r in rows[1:]:
        oferta = _to_float(get(r, i_of))
        if oferta is None:
            continue  # intervalo sin actividad
        cola = fix_text(get(r, i_cola))
        rec = {
            "inicio": _as_dt(get(r, i_ini)),
            "tipo_medio": fix_text(get(r, i_medio)) or "voz",
            "cola": cola,
            "oferta": oferta,
            "contestadas": _to_float(get(r, i_cont)) or 0.0,
            "abandonadas": _to_float(get(r, i_aband)) or 0.0,
            "sla_pct": _to_float(get(r, i_sla)),
            # En filas por intervalo las duraciones vienen en milisegundos (float);
            # en la fila de totales vienen como string HH:MM:SS (el parser lo detecta).
            "asa_seg": _parse_duration(get(r, i_asa), numeric_unit="ms"),
            "manejo_seg": _parse_duration(get(r, i_manejo), numeric_unit="ms"),
            "espera_seg": _parse_duration(get(r, i_espera), numeric_unit="ms"),
            "conversacion_seg": _parse_duration(get(r, i_conv), numeric_unit="ms"),
            "acw_seg": _parse_duration(get(r, i_acw), numeric_unit="ms"),
        }
        if not cola:
            # Fila de totales del período (sin cola).
            totales = rec
        else:
            intervalos.append(rec)
    return intervalos, totales


def parse_intervalo(path: str | Path) -> list[dict[str, Any]]:
    """Métricas de cola por intervalo (archivo Llamadas_por_intervalo)."""
    rows = _pick_sheet(load_excel(path), "oferta", "contestadas")
    intervalos, _ = _parse_intervalos(rows)
    return intervalos


def parse_colas(path: str | Path) -> dict[str, Any]:
    """Archivo Colas_de_Atención: devuelve {intervalos, totales}."""
    rows = _pick_sheet(load_excel(path), "oferta", "contestadas")
    intervalos, totales = _parse_intervalos(rows)
    return {"intervalos": intervalos, "totales": totales}
