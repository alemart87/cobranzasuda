"""Tools del Agente de Logística: consultan la API de QuadMinds v2 (read-only).

La tool `logi_get` permite al agente llamar cualquier recurso GET whitelisteado
(orders, routes, drivers, vehicles, waypoints, pois, …) con filtros; `logi_entregas`
devuelve estadísticas de entrega ya agregadas. Sin mutaciones.
"""
from __future__ import annotations

from typing import Any, Optional

from ...services.logistica.quadminds_client import (
    ALLOWED_RESOURCES, QuadMindsError, QuadMindsNotConfigured, _extract_list, _is_allowed, get_client,
)
from ...services.logistica.stats import resumen_ordenes, _date_str


async def logi_recursos_impl() -> dict[str, Any]:
    """Recursos GET disponibles en la API de QuadMinds."""
    return {"recursos": sorted(ALLOWED_RESOURCES),
            "nota": "Usá logi_get(recurso, params) para consultarlos. Paginan con limit/offset."}


async def logi_get_impl(recurso: str, params: Optional[dict] = None, limite: int = 50) -> dict[str, Any]:
    """GET a un recurso de QuadMinds. Devuelve una muestra (cap `limite`) + total leído."""
    if not _is_allowed(recurso):
        return {"error": f"Recurso no permitido: {recurso}. Usá logi_recursos para ver los válidos."}
    p = dict(params or {})
    p.setdefault("limit", min(max(limite, 1), 1000))
    p.setdefault("offset", 0)
    try:
        data = await get_client().get(recurso, p)
    except QuadMindsNotConfigured as exc:
        return {"sin_configurar": True, "mensaje": str(exc)}
    except QuadMindsError as exc:
        return {"error": str(exc)}
    filas = _extract_list(data)
    return {"recurso": recurso, "cantidad": len(filas), "muestra": filas[:limite]}


async def logi_entregas_impl(desde: Optional[str] = None, hasta: Optional[str] = None,
                             filtros: Optional[dict] = None) -> dict[str, Any]:
    """Estadísticas de entrega: totales, por estado, por categoría (entregado/fallido/…)
    y serie diaria. `desde`/`hasta` = YYYY-MM-DD (filtro por fecha). `filtros` = query params
    extra para la API de orders."""
    try:
        orders = await get_client().get_all("orders", params=dict(filtros or {}), max_rows=20000)
    except QuadMindsNotConfigured as exc:
        return {"sin_configurar": True, "mensaje": str(exc)}
    except QuadMindsError as exc:
        return {"error": str(exc)}
    if desde or hasta:
        def _ok(o: dict) -> bool:
            d = _date_str(o)
            if not d:
                return False
            if desde and d < desde:
                return False
            if hasta and d > hasta:
                return False
            return True
        orders = [o for o in orders if _ok(o)]
    return {"desde": desde, "hasta": hasta, **resumen_ordenes(orders)}
