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


# ---- Rutas ----
_RUTA_OK = ("finished", "closed")
_RUTA_MAL = ("overdue",)
_RUTA_CURSO = ("ongoing", "extended")
_RUTA_PEND = ("pending",)


def _num(v: Any) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def resumen_rutas(routes: list[dict]) -> dict:
    """Resumen de rutas: por estado, km estimado/ejecutado, por chofer."""
    total = len(routes)
    por_estado: Counter = Counter()
    km_est = km_eje = 0.0
    por_driver: dict[str, dict] = defaultdict(lambda: {"rutas": 0, "overdue": 0, "finished": 0,
                                                       "km_est": 0.0, "km_eje": 0.0})
    for r in routes:
        st = str(r.get("status") or "").lower().strip() or "(sin estado)"
        por_estado[st] += 1
        pred = r.get("routePrediction") or {}
        e = _num(pred.get("estimatedKms")); x = _num(pred.get("executedKms"))
        km_est += e; km_eje += x
        drv = r.get("driverId")
        if drv is not None:
            d = por_driver[str(drv)]
            d["rutas"] += 1
            d["km_est"] += e; d["km_eje"] += x
            if st in _RUTA_MAL:
                d["overdue"] += 1
            if st in _RUTA_OK:
                d["finished"] += 1
    return {
        "total_rutas": total,
        "por_estado": [{"estado": e, "cantidad": c, "pct": _pct(c, total)} for e, c in por_estado.most_common()],
        "overdue": sum(por_estado.get(s, 0) for s in _RUTA_MAL),
        "pending": sum(por_estado.get(s, 0) for s in _RUTA_PEND),
        "finished": sum(por_estado.get(s, 0) for s in _RUTA_OK),
        "km_estimado": round(km_est), "km_ejecutado": round(km_eje),
        "km_desvio_pct": round((km_eje - km_est) / km_est * 100, 1) if km_est else 0.0,
        "por_driver": [{"driver": k, **v, "km_eje": round(v["km_eje"]), "km_est": round(v["km_est"])}
                       for k, v in sorted(por_driver.items(), key=lambda kv: -kv[1]["rutas"])],
    }


def generar_alertas(ord_res: dict, rutas_res: dict, cfg: dict) -> list[dict]:
    """Alertas gerenciales por umbrales (config)."""
    al: list[dict] = []
    r = ord_res.get("resumen", {})
    efect = r.get("efectividad_sobre_cerradas", 0)
    if r.get("entregado", 0) + r.get("fallido", 0) > 0 and efect < cfg["efectividad_min"]:
        al.append({"tipo": "efectividad", "severidad": "alert",
                   "titulo": f"Efectividad de entrega baja ({efect}%)",
                   "detalle": f"Por debajo del objetivo de {cfg['efectividad_min']}%. "
                              f"{r.get('fallido',0)} fallidas de {r.get('entregado',0)+r.get('fallido',0)} cerradas."})
    if ord_res.get("total_ordenes", 0) and r.get("pct_fallido", 0) > cfg["fallidos_max_pct"]:
        al.append({"tipo": "fallidos", "severidad": "warning",
                   "titulo": f"Fallidos por encima del umbral ({r.get('pct_fallido')}%)",
                   "detalle": f"Umbral {cfg['fallidos_max_pct']}%. Revisar zonas/choferes con más no-entregas."})
    if rutas_res.get("overdue", 0) > 0:
        al.append({"tipo": "rutas", "severidad": "warning",
                   "titulo": f"{rutas_res['overdue']} ruta(s) atrasada(s) (overdue)",
                   "detalle": "Rutas que superaron su ventana. Revisar planificación/carga."})
    if abs(rutas_res.get("km_desvio_pct", 0)) > cfg["km_desvio_max_pct"] and rutas_res.get("km_estimado", 0):
        al.append({"tipo": "km", "severidad": "info",
                   "titulo": f"Desvío de km {rutas_res['km_desvio_pct']}% (ejecutado vs estimado)",
                   "detalle": f"Umbral ±{cfg['km_desvio_max_pct']}%. Posible optimización de rutas o desvíos."})
    # choferes con rutas atrasadas
    malos = [d for d in rutas_res.get("por_driver", []) if d.get("overdue", 0) > 0]
    if malos:
        det = ", ".join(f"{d['driver']} ({d['overdue']})" for d in malos[:8])
        al.append({"tipo": "drivers", "severidad": "warning",
                   "titulo": f"{len(malos)} chofer(es) con rutas atrasadas",
                   "detalle": f"Choferes (rutas overdue): {det}."})
    return al


def _coord(o: dict) -> Optional[tuple[float, float]]:
    """Extrae (lat, lng) de una orden/waypoint tolerando distintas estructuras."""
    for latk, lngk in (("latitude", "longitude"), ("lat", "lng"), ("lat", "lon")):
        if o.get(latk) not in (None, "") and o.get(lngk) not in (None, ""):
            try:
                return float(o[latk]), float(o[lngk])
            except (TypeError, ValueError):
                pass
    loc = o.get("location") or o.get("geo") or o.get("coordinates")
    if isinstance(loc, dict):
        c = loc.get("coordinates")
        if isinstance(c, (list, tuple)) and len(c) == 2:  # GeoJSON [lng, lat]
            try:
                return float(c[1]), float(c[0])
            except (TypeError, ValueError):
                pass
    if isinstance(loc, (list, tuple)) and len(loc) == 2:
        try:
            return float(loc[1]), float(loc[0])
        except (TypeError, ValueError):
            pass
    return None


def puntos_entrega(orders: list[dict], status_map: Optional[dict] = None,
                   pois_coords: Optional[dict] = None) -> list[dict]:
    """Puntos (lat/lng + categoría) para el mapa de calor. Usa coords de la orden;
    si no tiene, intenta enriquecer por código de PoI (`pois_coords`)."""
    pts = []
    for o in orders:
        c = _coord(o)
        if c is None and pois_coords:
            code = o.get("poiCode") or o.get("code") or o.get("poi") or o.get("clientCode")
            if code is not None and str(code) in pois_coords:
                c = pois_coords[str(code)]
        if c is None:
            continue
        pts.append({"lat": c[0], "lng": c[1], "categoria": clasificar_estado(_status_str(o, status_map))})
    return pts


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
