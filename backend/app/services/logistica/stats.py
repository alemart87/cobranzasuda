"""Agregación de estadísticas de entrega a partir de las órdenes de QuadMinds.

El shape exacto de la orden se confirma al conectar la API real; por eso la
detección de los campos de ESTADO y FECHA es tolerante (prueba varios nombres
habituales y estructuras anidadas).
"""
from __future__ import annotations

import unicodedata
from collections import Counter, defaultdict
from typing import Any, Optional


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s.lower())
    return "".join(c for c in s if not unicodedata.combining(c))

_STATUS_KEYS = ["status", "estado", "orderStatus", "deliveryStatus", "state", "orderStatusName", "statusName"]
_DATE_KEYS = ["deliveryDate", "scheduledDate", "plannedDate", "date", "fecha", "assignedDate",
              "estimatedDeliveryDate", "closedDate", "createdAt", "created_at"]

# Palabras clave para clasificar el estado en categorías de negocio.
_ENTREGADO = ("entreg", "deliver", "complet", "finaliz", "cerrad", "done", "success", "ok")
_FALLIDO = ("fall", "fail", "rechaz", "no entreg", "not_deliver", "cancel", "anul", "reject", "devuel", "return")
_EN_CURSO = ("curso", "transit", "en camino", "on_route", "onroute", "dispatch", "assigned", "asignad", "en ruta")
_PENDIENTE = ("pend", "pending", "planific", "nuevo", "created", "creado", "sin asignar", "unassigned")


def _first(row: dict, keys: list[str]) -> Any:
    for k in keys:
        if k in row and row[k] not in (None, ""):
            return row[k]
    # búsqueda case-insensitive
    low = {str(kk).lower(): vv for kk, vv in row.items()}
    for k in keys:
        v = low.get(k.lower())
        if v not in (None, ""):
            return v
    return None


def _status_str(row: dict, status_map: Optional[dict] = None) -> str:
    v = _first(row, _STATUS_KEYS)
    if isinstance(v, dict):
        v = v.get("description") or v.get("name") or v.get("label") or v.get("status") or v.get("code") or v.get("id")
    if v in (None, ""):
        return "(sin estado)"
    # Si el estado viene como código numérico, traducirlo con el catálogo /order-status.
    if status_map and str(v) in status_map:
        return status_map[str(v)]
    return str(v).strip()


def _date_str(row: dict) -> Optional[str]:
    v = _first(row, _DATE_KEYS)
    if v is None:
        return None
    s = str(v)
    # normalizar ISO 'YYYY-MM-DDT...' → 'YYYY-MM-DD'
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return s[:10]
    return s[:10]


def clasificar_estado(status: str) -> str:
    s = _norm(status)
    if any(w in s for w in _FALLIDO):
        return "fallido"
    if any(w in s for w in _ENTREGADO):
        return "entregado"
    if any(w in s for w in _EN_CURSO):
        return "en_curso"
    if any(w in s for w in _PENDIENTE):
        return "pendiente"
    return "otro"


def _pct(part: int, whole: int) -> float:
    return round(part / whole * 100, 1) if whole else 0.0


def resumen_ordenes(orders: list[dict], status_map: Optional[dict] = None) -> dict:
    """Resumen de entregas: totales, por estado, por categoría, por día.
    `status_map` (de /order-status) traduce códigos numéricos a descripción."""
    total = len(orders)
    por_estado_raw: Counter = Counter()
    por_categoria: Counter = Counter()
    por_dia: dict[str, dict] = defaultdict(lambda: defaultdict(int))

    for o in orders:
        st = _status_str(o, status_map)
        cat = clasificar_estado(st)
        por_estado_raw[st] += 1
        por_categoria[cat] += 1
        d = _date_str(o)
        if d:
            por_dia[d]["total"] += 1
            por_dia[d][cat] += 1

    entregado = por_categoria.get("entregado", 0)
    fallido = por_categoria.get("fallido", 0)
    cerradas = entregado + fallido
    serie = []
    for d in sorted(por_dia.keys()):
        row = por_dia[d]
        serie.append({
            "fecha": d, "total": row["total"],
            "entregado": row.get("entregado", 0), "fallido": row.get("fallido", 0),
            "en_curso": row.get("en_curso", 0), "pendiente": row.get("pendiente", 0),
            "otro": row.get("otro", 0),
        })

    return {
        "total_ordenes": total,
        "por_estado": [{"estado": e, "cantidad": c, "pct": _pct(c, total)}
                       for e, c in por_estado_raw.most_common()],
        "resumen": {
            "entregado": entregado, "fallido": fallido,
            "en_curso": por_categoria.get("en_curso", 0),
            "pendiente": por_categoria.get("pendiente", 0),
            "otro": por_categoria.get("otro", 0),
            "pct_entregado": _pct(entregado, total),
            "pct_fallido": _pct(fallido, total),
            "efectividad_sobre_cerradas": _pct(entregado, cerradas),  # entregado / (entregado+fallido)
        },
        "por_dia": serie,
        "dias": len(serie),
    }
