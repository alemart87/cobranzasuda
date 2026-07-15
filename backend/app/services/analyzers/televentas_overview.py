"""Overview combinado de Televentas para el Gerente de Ventas.

Cruza el reporte de llamadas con el de producción (por vendedor, matcheando
nombres con formatos distintos) y genera KPIs consolidados, tabla por vendedor,
conversión y alertas de baja producción / bajas llamadas.
"""
from __future__ import annotations

from statistics import median
from typing import Any

from ._nombres import best_match


def _conv(polizas: int, contestadas: int) -> float:
    return round(polizas / contestadas * 100, 1) if contestadas else 0.0


def combine_televentas(ll_data: dict | None, pr_data: dict | None) -> dict:
    """ll_data / pr_data = campo `data` de los reportes publicados (o None)."""
    ll_vend = {v["vendedor"]: v for v in (ll_data or {}).get("por_vendedor", [])}
    pr_vend = {v["vendedor"]: v for v in (pr_data or {}).get("por_vendedor", [])}
    pr_names = list(pr_vend.keys())

    # Unificar por el nombre de llamadas (formato lindo). Cada vendedor de llamadas
    # se matchea a un vendedor de producción; los de producción sin llamada se agregan aparte.
    filas: list[dict] = []
    usados_prod: set[str] = set()
    for lname, lv in ll_vend.items():
        pmatch = best_match(lname, pr_names)
        pv = pr_vend.get(pmatch) if pmatch else None
        if pmatch:
            usados_prod.add(pmatch)
        polizas = pv["polizas"] if pv else 0
        filas.append({
            "vendedor": lname,
            "es_equipo": True,
            "llamadas": lv["llamadas"],
            "contestadas": lv["contestadas"],
            "pct_contestadas": lv["pct_contestadas"],
            "tmo_hms": lv["tmo_hms"],
            "polizas": polizas,
            "prima_emitida": pv["prima_emitida"] if pv else 0,
            "prima_anulada": pv["prima_anulada"] if pv else 0,
            "conversion_pct": _conv(polizas, lv["contestadas"]),
        })
    # vendedores con producción pero sin llamadas registradas (referidos / otros agentes)
    for pname, pv in pr_vend.items():
        if pname in usados_prod:
            continue
        filas.append({
            "vendedor": pname,
            "es_equipo": False,
            "llamadas": 0, "contestadas": 0, "pct_contestadas": 0.0, "tmo_hms": "00:00:00",
            "polizas": pv["polizas"], "prima_emitida": pv["prima_emitida"],
            "prima_anulada": pv["prima_anulada"], "conversion_pct": 0.0,
        })
    filas.sort(key=lambda x: -x["prima_emitida"])

    # ----- Alertas (solo equipo de televentas; umbral relativo a la mediana) -----
    equipo = [f for f in filas if f["es_equipo"]]
    primas = [f["prima_emitida"] for f in equipo if f["prima_emitida"] > 0]
    llam = [f["llamadas"] for f in equipo if f["llamadas"] > 0]
    med_prima = median(primas) if primas else 0
    med_llam = median(llam) if llam else 0
    umbral_prima = med_prima * 0.5
    umbral_llam = med_llam * 0.5

    alertas: list[dict] = []
    for f in equipo:
        motivos = []
        if med_prima and f["prima_emitida"] < umbral_prima:
            motivos.append("baja_produccion")
        if med_llam and f["llamadas"] < umbral_llam:
            motivos.append("bajas_llamadas")
        if motivos:
            alertas.append({
                "vendedor": f["vendedor"],
                "prima_emitida": f["prima_emitida"],
                "polizas": f["polizas"],
                "llamadas": f["llamadas"],
                "conversion_pct": f["conversion_pct"],
                "motivos": motivos,
            })
    alertas.sort(key=lambda x: (len(x["motivos"]) * -1, x["prima_emitida"]))

    ll_k = (ll_data or {}).get("kpis", {})
    pr_k = (pr_data or {}).get("kpis", {})
    conv_global = _conv(pr_k.get("polizas_emitidas", 0), ll_k.get("contestadas", 0))

    return {
        "kpis": {
            "total_llamadas": ll_k.get("total_llamadas", 0),
            "contestadas": ll_k.get("contestadas", 0),
            "no_contestadas": ll_k.get("no_contestadas", 0),
            "pct_contestadas": ll_k.get("pct_contestadas", 0.0),
            "tmo_hms": ll_k.get("tmo_hms", "00:00:00"),
            "polizas_emitidas": pr_k.get("polizas_emitidas", 0),
            "prima_emitida": pr_k.get("prima_emitida", 0),
            "polizas_anuladas": pr_k.get("polizas_anuladas", 0),
            "prima_anulada": pr_k.get("prima_anulada", 0),
            "ticket_promedio": pr_k.get("ticket_promedio", 0),
            "dias_productivos": pr_k.get("dias_productivos", 0),
            "dias_no_productivos": pr_k.get("dias_no_productivos", 0),
            "conversion_pct": conv_global,
            "umbral_prima": round(umbral_prima),
            "umbral_llamadas": round(umbral_llam),
        },
        "por_vendedor": filas,
        "alertas": alertas,
        "por_producto": (pr_data or {}).get("por_producto", []),
        "prod_por_dia": (pr_data or {}).get("por_dia", []),
        "llam_por_dia": (ll_data or {}).get("por_dia", []),
    }
