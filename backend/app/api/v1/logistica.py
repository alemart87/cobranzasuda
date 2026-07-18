"""Endpoints del módulo Logística (integración con QuadMinds API v2).

La API key vive en el servidor. Todos los endpoints requieren acceso al módulo
restringido 'logistica' (superadmin, analista habilitado o analista de logística).
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from ...core.config import settings
from ...core.logging import logger
from ...services.logistica.quadminds_client import (
    QuadMindsError, QuadMindsNotConfigured, _extract_list, _is_allowed, get_client,
)
from ...services.logistica.stats import resumen_ordenes, _date_str
from ..deps import CurrentUser, require_logistica_access


router = APIRouter(prefix="/logistica", tags=["logistica"])


@router.get("/config")
async def logistica_config(user: CurrentUser = Depends(require_logistica_access)) -> dict:
    """Estado de la integración (sin exponer la API key)."""
    return {
        "configurado": settings.logistica_enabled,
        "base_url": settings.quadminds_base_url,
        "auth_header": settings.quadminds_auth_header,
    }


@router.get("/ping")
async def logistica_ping(user: CurrentUser = Depends(require_logistica_access)) -> dict:
    """Chequea la conectividad con QuadMinds."""
    if not settings.logistica_enabled:
        return {"ok": False, "configurado": False,
                "mensaje": "Falta cargar QUADMINDS_API_KEY en el servidor."}
    try:
        return {"configurado": True, **await get_client().ping()}
    except QuadMindsNotConfigured as exc:
        return {"ok": False, "configurado": False, "mensaje": str(exc)}


@router.get("/recurso/{resource:path}")
async def logistica_recurso(
    resource: str, request: Request,
    limit: int = Query(100, ge=1, le=10000),
    offset: int = Query(0, ge=0),
    user: CurrentUser = Depends(require_logistica_access),
) -> dict:
    """Passthrough de LECTURA a un recurso GET whitelisteado de QuadMinds.
    Reenvía los query params (filtros) tal cual. Devuelve la respuesta cruda + conteo."""
    if not _is_allowed(resource):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Recurso no permitido: {resource}")
    if not settings.logistica_enabled:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Logística no configurada (falta API key).")
    params = {k: v for k, v in request.query_params.items()}
    params.setdefault("limit", limit)
    params.setdefault("offset", offset)
    try:
        data = await get_client().get(resource, params)
    except QuadMindsError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc))
    filas = _extract_list(data)
    return {"recurso": resource, "cantidad": len(filas), "data": data}


@router.get("/entregas")
async def logistica_entregas(
    request: Request,
    desde: Optional[str] = Query(None, description="YYYY-MM-DD (filtra por fecha detectada)"),
    hasta: Optional[str] = Query(None, description="YYYY-MM-DD"),
    max_ordenes: int = Query(10000, ge=1, le=20000),
    user: CurrentUser = Depends(require_logistica_access),
) -> dict:
    """Estadísticas de entrega: totales, por estado, por categoría (entregado/fallido/…)
    y serie diaria. Reenvía filtros extra a QuadMinds y filtra por fecha del lado del server."""
    if not settings.logistica_enabled:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Logística no configurada (falta API key).")
    extra = {k: v for k, v in request.query_params.items()
             if k not in ("desde", "hasta", "max_ordenes")}
    try:
        orders = await get_client().get_all("orders", params=extra, max_rows=max_ordenes)
    except QuadMindsError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc))

    if desde or hasta:
        def _in_range(o: dict) -> bool:
            d = _date_str(o)
            if not d:
                return False
            if desde and d < desde:
                return False
            if hasta and d > hasta:
                return False
            return True
        orders = [o for o in orders if _in_range(o)]

    return {"desde": desde, "hasta": hasta, **resumen_ordenes(orders)}
