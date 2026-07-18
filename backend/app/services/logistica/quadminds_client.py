"""Cliente HTTP de la API de QuadMinds v2.

Autenticación por header (`x-saas-apikey` por defecto, configurable). La API key
vive SOLO en el servidor (env `QUADMINDS_API_KEY`), nunca en el navegador.

Endpoints (GET) de la v2 usados: pois, pois/types, orders, orders/status,
routes, routes/consolidated, waypoints, drivers, vehicles, organizations, etc.
Paginación estándar por `limit` (≤10000) / `offset`.
"""
from __future__ import annotations

from typing import Any, Optional

import httpx

from ...core.config import settings
from ...core.logging import logger


class QuadMindsNotConfigured(RuntimeError):
    """Falta la API key de QuadMinds en el servidor."""


class QuadMindsError(RuntimeError):
    """Error devuelto por la API de QuadMinds."""


# Recursos GET permitidos para el passthrough / agente (whitelist de seguridad).
ALLOWED_RESOURCES = {
    "areas", "activitytypes", "notifications", "orderitems", "orders", "orders/status",
    "orderstatus", "constrainttypes", "ordermeasures", "collections", "organizations",
    "poitypes", "pois", "pois/types", "products", "routes", "routes/consolidated",
    "consolidatedroutes", "waypoints", "things", "drivers", "vehicles", "users", "merchants",
}


def _is_allowed(path: str) -> bool:
    p = path.strip("/").lower().split("?")[0]
    if p in ALLOWED_RESOURCES:
        return True
    # permitir "orders/{id}" y subrecursos conocidos
    head = p.split("/")[0]
    return head in {r.split("/")[0] for r in ALLOWED_RESOURCES}


def _extract_list(data: Any) -> list[dict]:
    """La API puede devolver una lista o un envelope {data|results|rows|items:[...]}."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("data", "results", "rows", "items", "docs", "content"):
            v = data.get(key)
            if isinstance(v, list):
                return v
    return []


class QuadMindsClient:
    def __init__(self) -> None:
        if not settings.quadminds_api_key:
            raise QuadMindsNotConfigured("Falta QUADMINDS_API_KEY en el servidor.")
        self.base = settings.quadminds_base_url.rstrip("/")
        self.headers = {
            settings.quadminds_auth_header: settings.quadminds_api_key,
            "accept": "application/json",
        }
        self.timeout = settings.quadminds_timeout_s

    async def get(self, path: str, params: Optional[dict] = None) -> Any:
        url = f"{self.base}/{path.strip('/')}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                r = await client.get(url, headers=self.headers, params=params or {})
            except httpx.HTTPError as exc:
                raise QuadMindsError(f"No se pudo conectar con QuadMinds: {exc}") from exc
        if r.status_code == 403:
            raise QuadMindsError("QuadMinds rechazó la petición (403). Revisá la API key o los permisos.")
        if r.status_code >= 400:
            raise QuadMindsError(f"QuadMinds devolvió {r.status_code}: {r.text[:300]}")
        try:
            return r.json()
        except ValueError:
            return {}

    async def get_all(self, path: str, params: Optional[dict] = None,
                      page_size: int = 1000, max_rows: int = 20000) -> list[dict]:
        """Trae todas las filas paginando con limit/offset (con tope de seguridad)."""
        out: list[dict] = []
        offset = 0
        while len(out) < max_rows:
            data = await self.get(path, {**(params or {}), "limit": page_size, "offset": offset})
            rows = _extract_list(data)
            if not rows:
                break
            out.extend(rows)
            if len(rows) < page_size:
                break
            offset += page_size
        return out[:max_rows]

    async def ping(self) -> dict:
        """Chequeo de conectividad barato (poitypes suele ser liviano)."""
        try:
            data = await self.get("pois/types", {"limit": 1, "offset": 0})
            return {"ok": True, "muestra": _extract_list(data)[:1]}
        except QuadMindsError as exc:
            return {"ok": False, "error": str(exc)}


def _fmt_fecha(d: str) -> str:
    """Convierte 'YYYY-MM-DD' al formato que espera la API de orders."""
    fmt = settings.quadminds_orders_date_format
    if fmt == "datetime":
        return f"{d}T00:00:00"
    if fmt == "epoch_ms":
        from datetime import datetime, timezone
        try:
            dt = datetime.strptime(d, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            return str(int(dt.timestamp() * 1000))
        except ValueError:
            return d
    return d  # 'date'


def orders_params(desde: Optional[str], hasta: Optional[str], extra: Optional[dict] = None) -> dict:
    """Arma los query params de /orders incluyendo el rango de fechas OBLIGATORIO.

    Los nombres de los parámetros y el formato de fecha son configurables por env
    (QUADMINDS_ORDERS_FROM_PARAM / _TO_PARAM / _DATE_TYPE / _DATE_FORMAT).
    """
    p = dict(extra or {})
    if desde:
        p[settings.quadminds_orders_from_param] = _fmt_fecha(desde)
    if hasta:
        p[settings.quadminds_orders_to_param] = _fmt_fecha(hasta)
    if settings.quadminds_orders_date_type:
        p.setdefault("dateType", settings.quadminds_orders_date_type)
    return p


def get_client() -> QuadMindsClient:
    return QuadMindsClient()
