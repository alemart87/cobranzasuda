"""Tools del Agente de Logística: consultan la API de QuadMinds v2 (read-only).

La tool `logi_get` permite al agente llamar cualquier recurso GET whitelisteado
(orders, routes, drivers, vehicles, waypoints, pois, …) con filtros; `logi_entregas`
devuelve estadísticas de entrega ya agregadas. Sin mutaciones.
"""
from __future__ import annotations

from typing import Any, Optional

from ...core.config import settings
from ...services.logistica.quadminds_client import (
    ALLOWED_HEADS, RESOURCE_PATHS, QuadMindsError, QuadMindsNotConfigured, _extract_list, _is_allowed,
    fetch_order_status_map, fetch_orders, fetch_routes, get_client,
)
from ...services.logistica.stats import resumen_ordenes, resumen_rutas, generar_alertas, _date_str


async def logi_recursos_impl() -> dict[str, Any]:
    """Recursos GET disponibles en la API de QuadMinds (con el path exacto)."""
    return {
        "recursos": sorted(ALLOWED_HEADS),
        "paths_utiles": RESOURCE_PATHS,
        "nota": ("Usá logi_get(recurso, params). Los listados paginan con limit/offset y responden "
                 "{meta,data}. OJO: rutas es 'routes/search', pois es 'pois/search', productos "
                 "'products/search', estados 'order-status'. /orders, /routes/search y /vehicles-routes "
                 "piden 'from' y 'to' (YYYY-MM-DD) con intervalo máximo de 7 días."),
    }


async def logi_get_impl(recurso: str, params: Optional[dict] = None, limite: int = 50) -> dict[str, Any]:
    """GET a un recurso de QuadMinds. Devuelve una muestra (cap `limite`) + total leído."""
    if not _is_allowed(recurso):
        return {"error": f"Recurso no permitido: {recurso}. Usá logi_recursos para ver los válidos."}
    # Si pidió el nombre corto (orders/routes/pois/products), resolver al path real.
    recurso = RESOURCE_PATHS.get(recurso.strip("/").lower(), recurso)
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
    y serie diaria. `desde`/`hasta` = YYYY-MM-DD (rango OBLIGATORIO para /orders; si no se
    pasan, se usan los últimos 30 días). `filtros` = query params extra para /orders."""
    from datetime import date, timedelta
    if not hasta:
        hasta = date.today().isoformat()
    if not desde:
        desde = (date.today() - timedelta(days=30)).isoformat()
    try:
        status_map = await fetch_order_status_map()
        orders, esquema = await fetch_orders(desde, hasta, dict(filtros or {}), max_rows=20000)
    except QuadMindsNotConfigured as exc:
        return {"sin_configurar": True, "mensaje": str(exc)}
    except QuadMindsError as exc:
        return {"error": str(exc)}
    return {"desde": desde, "hasta": hasta, "esquema_fecha": esquema, **resumen_ordenes(orders, status_map)}


async def logi_gerencial_impl(desde: Optional[str] = None, hasta: Optional[str] = None) -> dict[str, Any]:
    """Panel gerencial: entregas + rutas + ALERTAS por umbral (efectividad, fallidos,
    rutas atrasadas, desvío de km, choferes). Cruza órdenes y rutas. `desde`/`hasta` YYYY-MM-DD."""
    from datetime import date, timedelta
    if not hasta:
        hasta = date.today().isoformat()
    if not desde:
        desde = (date.today() - timedelta(days=30)).isoformat()
    try:
        status_map = await fetch_order_status_map()
        orders, _ = await fetch_orders(desde, hasta, {}, max_rows=20000)
        routes = await fetch_routes(desde, hasta)
    except QuadMindsNotConfigured as exc:
        return {"sin_configurar": True, "mensaje": str(exc)}
    except QuadMindsError as exc:
        return {"error": str(exc)}
    ord_res = resumen_ordenes(orders, status_map)
    rutas_res = resumen_rutas(routes)
    return {"desde": desde, "hasta": hasta, "entregas": ord_res, "rutas": rutas_res,
            "alertas": generar_alertas(ord_res, rutas_res, settings.logistica_alert_cfg)}
