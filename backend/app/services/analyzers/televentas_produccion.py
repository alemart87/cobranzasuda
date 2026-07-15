"""Análisis del Libro de Producción (ventas de pólizas — Televentas).

Emitida = prima > 0 ; Anulada = prima < 0 (importe = |prima|).
Métricas para el Gerente de Ventas: producción, ticket, días productivos,
mix por tipo de póliza, ranking por vendedor, canal y cobrador.
"""
from __future__ import annotations

import calendar
from collections import defaultdict
from typing import Any


def _pct(part: float, whole: float) -> float:
    return round(part / whole * 100, 1) if whole else 0.0


def analyze_televentas_produccion(rows: list[dict[str, Any]]) -> dict:
    emit = [r for r in rows if r["prima"] > 0]
    anul = [r for r in rows if r["prima"] < 0]
    prima_emitida = sum(r["prima"] for r in emit)
    prima_anulada = -sum(r["prima"] for r in anul)
    suma_asegurada = sum(r["suma_asegurada"] for r in emit)

    dias_emision = {r["fecha_emision"] for r in emit if r["fecha_emision"]}
    # días calendario del mes de emisión (para "días no productivos")
    dias_calendario = 0
    if dias_emision:
        any_d = next(iter(dias_emision))
        dias_calendario = calendar.monthrange(any_d.year, any_d.month)[1]

    def _dist(key: str, source: list[dict]) -> list[dict]:
        agg: dict[str, dict] = defaultdict(lambda: {"polizas": 0, "prima": 0.0, "suma": 0.0})
        for r in source:
            a = agg[r[key]]
            a["polizas"] += 1
            a["prima"] += r["prima"]
            a["suma"] += r["suma_asegurada"]
        out = [{key: k, "polizas": v["polizas"], "prima": round(v["prima"]),
                "suma_asegurada": round(v["suma"]), "pct": _pct(v["prima"], prima_emitida)}
               for k, v in agg.items()]
        out.sort(key=lambda x: -x["prima"])
        return out

    # por vendedor (emitidas + anuladas)
    pv: dict[str, dict] = defaultdict(lambda: {"polizas": 0, "prima_emitida": 0.0, "polizas_anuladas": 0,
                                               "prima_anulada": 0.0, "suma": 0.0})
    for r in rows:
        d = pv[r["vendedor"]]
        if r["prima"] > 0:
            d["polizas"] += 1
            d["prima_emitida"] += r["prima"]
            d["suma"] += r["suma_asegurada"]
        elif r["prima"] < 0:
            d["polizas_anuladas"] += 1
            d["prima_anulada"] += -r["prima"]
    por_vendedor = []
    for v, d in pv.items():
        por_vendedor.append({
            "vendedor": v,
            "polizas": d["polizas"],
            "prima_emitida": round(d["prima_emitida"]),
            "polizas_anuladas": d["polizas_anuladas"],
            "prima_anulada": round(d["prima_anulada"]),
            "prima_neta": round(d["prima_emitida"] - d["prima_anulada"]),
            "ticket": round(d["prima_emitida"] / d["polizas"]) if d["polizas"] else 0,
            "suma_asegurada": round(d["suma"]),
        })
    por_vendedor.sort(key=lambda x: -x["prima_emitida"])

    # por día (emitidas)
    pd: dict[Any, dict] = defaultdict(lambda: {"polizas": 0, "prima": 0.0})
    for r in emit:
        if r["fecha_emision"]:
            k = r["fecha_emision"].isoformat()
            pd[k]["polizas"] += 1
            pd[k]["prima"] += r["prima"]
    por_dia = [{"fecha": k, "polizas": v["polizas"], "prima": round(v["prima"])}
               for k, v in sorted(pd.items())]

    n_emit = len(emit)
    return {
        "kpis": {
            "polizas_emitidas": n_emit,
            "prima_emitida": round(prima_emitida),
            "polizas_anuladas": len(anul),
            "prima_anulada": round(prima_anulada),
            "prima_neta": round(prima_emitida - prima_anulada),
            "ticket_promedio": round(prima_emitida / n_emit) if n_emit else 0,
            "suma_asegurada_total": round(suma_asegurada),
            "dias_productivos": len(dias_emision),
            "dias_calendario": dias_calendario,
            "dias_no_productivos": max(dias_calendario - len(dias_emision), 0),
            "vendedores_activos": len([v for v in pv if pv[v]["polizas"] > 0]),
            "productos_distintos": len({r["producto"] for r in emit}),
        },
        "por_producto": _dist("producto", emit),
        "por_canal": _dist("canal", emit),
        "por_cobrador": _dist("cobrador", emit),
        "por_vendedor": por_vendedor,
        "por_dia": por_dia,
    }


def build_produccion_items(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Filas granulares para drilldown/CSV (una por póliza/movimiento)."""
    items = []
    for r in rows:
        items.append({
            "fecha": r.get("fecha_emision"),
            "poliza": (f"{r.get('secc','')}-{r.get('poliza','')}").strip("-")[:60] or None,
            "asegurado": (r.get("asegurado") or "")[:255] or None,
            "producto": (r.get("producto") or "")[:120] or None,
            "vendedor": (r.get("vendedor") or "")[:160] or None,
            "canal": (r.get("canal") or "")[:80] or None,
            "cobrador": (r.get("cobrador") or "")[:120] or None,
            "prima": round(r.get("prima") or 0),
            "suma_asegurada": round(r.get("suma_asegurada") or 0),
            "es_anulacion": bool(r.get("es_anulacion")),
        })
    return items
