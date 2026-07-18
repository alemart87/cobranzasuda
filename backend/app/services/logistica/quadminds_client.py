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

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


# Segmentos raíz permitidos para el passthrough / agente (whitelist de seguridad).
# Paths reales de QuadMinds v2 (algunos son .../search): orders, order-status,
# routes/search, pois/search, products/search, vehicles-routes, etc.
ALLOWED_HEADS = {
    "orders", "order-status", "orderitems", "ordermeasures", "constrainttypes",
    "routes", "consolidated-routes", "consolidatedroutes", "waypoints",
    "pois", "poitypes", "products", "areas", "activitytypes", "notifications",
    "collections", "organizations", "things", "drivers", "vehicles", "vehicles-routes",
    "users", "merchants",
}
# Sugerencias de path completo por recurso (para el agente).
RESOURCE_PATHS = {
    "orders": "orders/search", "order-status": "order-status", "routes": "routes/search",
    "pois": "pois/search", "poitypes": "pois/types", "products": "products/search",
    "drivers": "drivers", "vehicles": "vehicles", "vehicles-routes": "vehicles-routes",
    "waypoints": "waypoints", "areas": "areas", "organizations": "organizations",
}
ALLOWED_RESOURCES = ALLOWED_HEADS  # alias retro-compat


def _is_allowed(path: str) -> bool:
    head = path.strip("/").lower().split("?")[0].split("/")[0]
    return head in ALLOWED_HEADS


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
            raise QuadMindsError("QuadMinds rechazó la petición (403). Revisá la API key o los permisos.", 403)
        if r.status_code >= 400:
            raise QuadMindsError(f"QuadMinds devolvió {r.status_code}: {r.text[:300]}", r.status_code)
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


# Variantes de rango de fechas para /orders (se prueban hasta que una funcione).
# (from_key, to_key, formato)
_ORDER_DATE_CANDIDATES = [
    ("from", "to", "date"),
    ("dateFrom", "dateTo", "date"),
    ("startDate", "endDate", "date"),
    ("fromDate", "toDate", "date"),
    ("from", "to", "datetime"),
    ("dateFrom", "dateTo", "datetime"),
    ("startDate", "endDate", "datetime"),
    ("from", "to", "epoch_ms"),
    ("dateFrom", "dateTo", "epoch_ms"),
]

# Esquema que funcionó (cache en memoria del proceso).
_ORDERS_SCHEME: Optional[tuple[str, str, str]] = None


def _fmt_with(d: str, fmt: str) -> str:
    if fmt == "datetime":
        return f"{d}T00:00:00"
    if fmt == "epoch_ms":
        from datetime import datetime, timezone
        try:
            dt = datetime.strptime(d, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            return str(int(dt.timestamp() * 1000))
        except ValueError:
            return d
    return d


def _date_windows(desde: str, hasta: str, max_days: int = 7) -> list[tuple[str, str]]:
    """Parte [desde, hasta] en ventanas de a lo sumo `max_days` días (QuadMinds limita
    /orders y /routes a intervalos de 7 días)."""
    from datetime import date, timedelta
    try:
        d0 = date.fromisoformat(desde[:10])
        d1 = date.fromisoformat(hasta[:10])
    except ValueError:
        return [(desde, hasta)]
    if d1 < d0:
        d0, d1 = d1, d0
    out: list[tuple[str, str]] = []
    cur = d0
    while cur <= d1:
        end = min(cur + timedelta(days=max_days - 1), d1)
        out.append((cur.isoformat(), end.isoformat()))
        cur = end + timedelta(days=1)
    return out


def _scheme_params(scheme: tuple[str, str, str], w0: str, w1: str, extra: Optional[dict]) -> dict:
    fk, tk, fmt = scheme
    p = dict(extra or {})
    p[fk] = _fmt_with(w0, fmt)
    p[tk] = _fmt_with(w1, fmt)
    if settings.quadminds_orders_date_type:
        p.setdefault("dateType", settings.quadminds_orders_date_type)
    return p


async def fetch_orders(desde: str, hasta: str, extra: Optional[dict] = None,
                       max_rows: int = 20000, path: Optional[str] = None) -> tuple[list[dict], dict]:
    """Lista órdenes de /orders/search en el rango [desde, hasta].

    1) Intenta filtrar por fecha del lado del servidor (from/to en ventanas de ≤7 días,
       como /routes/search). Auto-detecta el nombre del parámetro.
    2) Si el endpoint no acepta el filtro de fechas (400), cae a traer sin filtro y
       filtrar del lado nuestro por el campo de fecha detectado. Siempre devuelve datos.
    """
    global _ORDERS_SCHEME
    from .stats import _date_str
    client = QuadMindsClient()
    path = path or settings.quadminds_orders_path
    windows = _date_windows(desde, hasta, 7)

    candidatos: list[tuple[str, str, str]] = []
    if _ORDERS_SCHEME:
        candidatos.append(_ORDERS_SCHEME)
    cfgd = (settings.quadminds_orders_from_param, settings.quadminds_orders_to_param,
            settings.quadminds_orders_date_format)
    if cfgd not in candidatos:
        candidatos.append(cfgd)
    for c in _ORDER_DATE_CANDIDATES:
        if c not in candidatos:
            candidatos.append(c)

    scheme: Optional[tuple[str, str, str]] = None
    all_rows: list[dict] = []
    try:
        for (w0, w1) in windows:
            if scheme is None:
                last_err: Optional[QuadMindsError] = None
                for cand in candidatos:
                    try:
                        rows = await client.get_all(path, params=_scheme_params(cand, w0, w1, extra), max_rows=max_rows)
                        scheme = cand
                        _ORDERS_SCHEME = cand
                        all_rows.extend(rows)
                        break
                    except QuadMindsError as exc:
                        last_err = exc
                        if exc.status_code != 400:
                            raise
                if scheme is None:
                    raise last_err or QuadMindsError("bad request", 400)
            else:
                all_rows.extend(await client.get_all(path, params=_scheme_params(scheme, w0, w1, extra), max_rows=max_rows))
            if len(all_rows) >= max_rows:
                break
        fk, tk, fmt = scheme  # type: ignore
        return all_rows[:max_rows], {"modo": "filtro_servidor", "from_param": fk, "to_param": tk,
                                     "formato": fmt, "ventanas": len(windows)}
    except QuadMindsError as exc:
        if exc.status_code != 400:
            raise
        # Fallback: sin filtro de fechas → traer y filtrar del lado nuestro.
        rows = await client.get_all(path, params=dict(extra or {}), max_rows=max_rows)
        filtradas = [o for o in rows
                     if (_date_str(o) is None) or (desde <= (_date_str(o) or "") <= hasta)]
        return filtradas, {"modo": "filtro_local", "ventanas": len(windows),
                           "traidas": len(rows), "en_rango": len(filtradas)}


async def fetch_order_status_map() -> dict:
    """Catálogo de estados de /order-status → {code|status|_id (str): description}."""
    try:
        rows = await QuadMindsClient().get_all("order-status", max_rows=1000)
    except (QuadMindsError, QuadMindsNotConfigured):
        return {}
    m: dict[str, str] = {}
    for r in rows:
        desc = (r.get("description") or r.get("name") or "").strip()
        if not desc:
            continue
        for k in ("status", "code", "_id"):
            if r.get(k) is not None:
                m[str(r[k])] = desc
    return m


def get_client() -> QuadMindsClient:
    return QuadMindsClient()
