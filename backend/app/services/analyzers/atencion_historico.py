"""Histórico del tablero de Atención al Cliente.

Serie mensual a partir de los reportes ya generados (llamadas + gestiones): un punto por
mes con los indicadores principales, la relación llamadas contestadas ↔ registros
(gestiones), el top de tipos de consulta y su evolución, los auxiliares del equipo y las
variaciones contra el mes anterior. Función pura sobre dicts (testeable sin base).
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Optional

from ..parsers._text import strip_accents
from .atencion_llamadas import OBJETIVO_AUX_PCT, _es_reunion


def _es_offline(estado: str) -> bool:
    return strip_accents(estado) == "desconectado"


def _mes(pm: Any) -> Optional[str]:
    if not pm:
        return None
    s = pm.isoformat() if hasattr(pm, "isoformat") else str(pm)
    return s[:7]


def _elegir(reports: list[dict]) -> dict[str, dict]:
    """Un reporte por mes: el publicado más reciente; si no hay publicado, el último generado."""
    por_mes: dict[str, dict] = {}
    for r in reports:
        m = _mes(r.get("period_month"))
        if not m:
            continue
        actual = por_mes.get(m)
        key = (1 if r.get("is_published") else 0, str(r.get("generated_at") or ""))
        if actual is None or key > actual["_key"]:
            por_mes[m] = {**r, "_key": key}
    return por_mes


def _delta(actual: Optional[float], previo: Optional[float]) -> Optional[float]:
    if actual is None or previo in (None, 0):
        return None
    return round((float(actual) - float(previo)) / float(previo) * 100, 1)


def historico_atencion(llamadas: list[dict], gestiones: list[dict], top_tipos: int = 6) -> dict[str, Any]:
    ll = _elegir(llamadas)
    ge = _elegir(gestiones)
    meses = sorted(set(ll) | set(ge))
    serie: list[dict] = []
    tipos_mes: dict[str, dict[str, int]] = defaultdict(dict)   # tipo -> mes -> cantidad
    tipos_total: dict[str, int] = defaultdict(int)
    aux_mes: dict[str, dict[str, float]] = defaultdict(dict)   # estado -> mes -> seg
    prev: Optional[dict] = None

    for m in meses:
        l, g = ll.get(m), ge.get(m)
        ld = (l or {}).get("data") or {}
        gd = (g or {}).get("data") or {}
        lk = ld.get("kpis") or {}
        contestadas = int((l or {}).get("contestadas") or lk.get("contestadas") or 0)
        ingresadas = int((l or {}).get("llamadas_ingresadas") or lk.get("llamadas_ingresadas") or 0)
        registros = int((g or {}).get("total_gestiones") or (gd.get("kpis") or {}).get("total_gestiones") or 0)
        por_tipo = list(gd.get("por_tipo") or [])
        for t in por_tipo:
            if t.get("label"):
                tipos_mes[t["label"]][m] = int(t.get("cantidad") or 0)
                tipos_total[t["label"]] += int(t.get("cantidad") or 0)
        aux_total = 0.0
        aux_sin_reunion = 0.0
        for a in ld.get("auxiliares_equipo") or []:
            aux_mes[a["estado"]][m] = float(a.get("seg") or 0)
            aux_total += float(a.get("seg") or 0)
            if not _es_reunion(a["estado"]):
                aux_sin_reunion += float(a.get("seg") or 0)
        # tiempo conectado del equipo: kpis nuevos, o suma de estados menos desconectado (reportes viejos)
        tiempo_total = float(lk.get("tiempo_total_seg") or 0) or sum(
            float(e.get("seg") or 0) for e in (ld.get("estados_equipo") or []) if not _es_offline(e.get("estado") or ""))
        aux_pct = round(aux_sin_reunion / tiempo_total * 100, 1) if tiempo_total else None
        punto = {
            "mes": m,
            "llamadas": {
                "report_id": (l or {}).get("id"), "publicado": bool((l or {}).get("is_published")),
                "ingresadas": ingresadas, "contestadas": contestadas,
                "abandonadas": int((l or {}).get("abandonadas") or lk.get("abandonadas") or 0),
                "nivel_atencion_pct": float((l or {}).get("nivel_atencion_pct") or lk.get("nivel_atencion_pct") or 0),
                "sla_pct": float((l or {}).get("sla_pct") or lk.get("sla_pct") or 0),
                "abandono_pct": float((l or {}).get("abandono_pct") or lk.get("abandono_pct") or 0),
                "aht_seg": float((l or {}).get("aht_seg") or lk.get("aht_seg") or 0),
                "operadores_activos": int((l or {}).get("operadores_activos") or lk.get("operadores_activos") or 0),
                "dias_operativos": int((l or {}).get("dias_operativos") or lk.get("dias_operativos") or 0),
                "aux_total_seg": round(aux_total, 1),
                "aux_sin_reunion_seg": round(aux_sin_reunion, 1),
                "tiempo_total_seg": round(tiempo_total, 1),
                "aux_pct": aux_pct,                       # sin reunión, sobre tiempo conectado
                "aux_objetivo_pct": OBJETIVO_AUX_PCT,
            } if l else None,
            "gestiones": {
                "report_id": (g or {}).get("id"), "publicado": bool((g or {}).get("is_published")),
                "total": registros,
                "cerrados": int((g or {}).get("cerrados") or 0), "pendientes": int((g or {}).get("pendientes") or 0),
                "pct_cerrados": float((g or {}).get("pct_cerrados") or 0),
                "por_tipo": por_tipo[:top_tipos],
                "top_motivos": list(gd.get("top_motivos") or [])[:5],
            } if g else None,
            "registros_por_100_contestadas": round(registros / contestadas * 100, 1) if (contestadas and g) else None,
            "llamadas_por_operador": round(contestadas / int((l or {}).get("operadores_activos") or 1), 1) if l and (l.get("operadores_activos") or 0) else None,
        }
        # variaciones contra el mes anterior con datos
        d: dict[str, Optional[float]] = {}
        if prev:
            pl, pg = prev.get("llamadas") or {}, prev.get("gestiones") or {}
            cl, cg = punto.get("llamadas") or {}, punto.get("gestiones") or {}
            d["ingresadas"] = _delta(cl.get("ingresadas"), pl.get("ingresadas"))
            d["contestadas"] = _delta(cl.get("contestadas"), pl.get("contestadas"))
            d["registros"] = _delta(cg.get("total"), pg.get("total"))
            d["aht_seg"] = _delta(cl.get("aht_seg"), pl.get("aht_seg"))
            d["nivel_atencion_pts"] = round(cl["nivel_atencion_pct"] - pl["nivel_atencion_pct"], 1) if cl.get("nivel_atencion_pct") is not None and pl.get("nivel_atencion_pct") is not None else None
            d["abandono_pts"] = round(cl["abandono_pct"] - pl["abandono_pct"], 1) if cl.get("abandono_pct") is not None and pl.get("abandono_pct") is not None else None
            d["aux_total_seg"] = _delta(cl.get("aux_total_seg"), pl.get("aux_total_seg"))
            d["aux_pct_pts"] = round(cl["aux_pct"] - pl["aux_pct"], 1) if cl.get("aux_pct") is not None and pl.get("aux_pct") is not None else None
        punto["vs_mes_anterior"] = d
        serie.append(punto)
        prev = punto

    top = sorted(tipos_total.items(), key=lambda kv: -kv[1])[:top_tipos]
    tipos_out = [{"tipo": t, "total": n, "por_mes": {m: tipos_mes[t].get(m, 0) for m in meses}} for t, n in top]
    otros = [{"mes": m, "cantidad": sum(v.get(m, 0) for t, v in tipos_mes.items() if t not in {x[0] for x in top})} for m in meses]
    aux_top = sorted(aux_mes.items(), key=lambda kv: -sum(kv[1].values()))[:6]
    aux_out = [{"estado": e, "total_seg": round(sum(v.values()), 1), "por_mes": {m: round(v.get(m, 0.0), 1) for m in meses}} for e, v in aux_top]

    ultimo = serie[-1] if serie else None
    resumen = {
        "meses": len(meses), "desde": meses[0] if meses else None, "hasta": meses[-1] if meses else None,
        "ultimo_mes": ultimo["mes"] if ultimo else None,
        "llamadas_promedio_mes": round(sum((p.get("llamadas") or {}).get("contestadas", 0) for p in serie) / max(1, sum(1 for p in serie if p.get("llamadas"))), 1) if serie else 0,
        "registros_promedio_mes": round(sum((p.get("gestiones") or {}).get("total", 0) for p in serie) / max(1, sum(1 for p in serie if p.get("gestiones"))), 1) if serie else 0,
        "tipo_mas_frecuente": top[0][0] if top else None,
    }
    resumen["aux_objetivo_pct"] = OBJETIVO_AUX_PCT
    return {"resumen": resumen, "meses": meses, "serie": serie, "tipos": tipos_out, "otros_tipos": otros, "auxiliares": aux_out}
