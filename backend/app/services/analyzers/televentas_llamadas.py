"""Análisis de llamadas de Televentas (voz saliente).

Contestada = duración >= UMBRAL_CONTESTADA_SEG (una llamada muy corta se asume
no atendida / buzón). TMO = tiempo medio de las contestadas (AHT).
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any


UMBRAL_CONTESTADA_SEG = 10


def _hms(seg: float) -> str:
    seg = int(round(seg))
    return f"{seg // 3600:02d}:{(seg % 3600) // 60:02d}:{seg % 60:02d}"


def _pct(part: float, whole: float) -> float:
    return round(part / whole * 100, 1) if whole else 0.0


def analyze_televentas_llamadas(rows: list[dict[str, Any]], umbral: int = UMBRAL_CONTESTADA_SEG) -> dict:
    total = len(rows)
    contestadas = [r for r in rows if r["duracion_seg"] >= umbral]
    n_cont = len(contestadas)
    talk_total = sum(r["duracion_seg"] for r in rows)
    talk_cont = sum(r["duracion_seg"] for r in contestadas)
    dias = {r["fecha"].date() for r in rows if r["fecha"]}
    n_dias = len(dias)

    # por vendedor
    pv: dict[str, dict] = defaultdict(lambda: {"llamadas": 0, "contestadas": 0, "talk_seg": 0.0, "talk_cont_seg": 0.0})
    for r in rows:
        d = pv[r["usuario"]]
        d["llamadas"] += 1
        d["talk_seg"] += r["duracion_seg"]
        if r["duracion_seg"] >= umbral:
            d["contestadas"] += 1
            d["talk_cont_seg"] += r["duracion_seg"]
    por_vendedor = []
    for v, d in pv.items():
        no_cont = d["llamadas"] - d["contestadas"]
        tmo = d["talk_cont_seg"] / d["contestadas"] if d["contestadas"] else 0.0
        por_vendedor.append({
            "vendedor": v,
            "llamadas": d["llamadas"],
            "contestadas": d["contestadas"],
            "no_contestadas": no_cont,
            "pct_contestadas": _pct(d["contestadas"], d["llamadas"]),
            "talk_seg": round(d["talk_seg"]),
            "tmo_seg": round(tmo),
            "tmo_hms": _hms(tmo),
        })
    por_vendedor.sort(key=lambda x: -x["llamadas"])

    # por día
    pd: dict[Any, dict] = defaultdict(lambda: {"llamadas": 0, "contestadas": 0})
    for r in rows:
        if not r["fecha"]:
            continue
        k = r["fecha"].date().isoformat()
        pd[k]["llamadas"] += 1
        if r["duracion_seg"] >= umbral:
            pd[k]["contestadas"] += 1
    por_dia = [{"fecha": k, "llamadas": v["llamadas"], "contestadas": v["contestadas"],
                "no_contestadas": v["llamadas"] - v["contestadas"]} for k, v in sorted(pd.items())]

    # serie diaria apilada por vendedor (para gráfico)
    vendedores = [v["vendedor"] for v in por_vendedor]
    serie: dict[str, dict] = defaultdict(lambda: defaultdict(int))
    for r in rows:
        if r["fecha"]:
            serie[r["fecha"].date().isoformat()][r["usuario"]] += 1
    serie_diaria = []
    for fecha in sorted(serie.keys()):
        row = {"fecha": fecha}
        for v in vendedores:
            row[v] = serie[fecha].get(v, 0)
        serie_diaria.append(row)

    tmo_global = talk_cont / n_cont if n_cont else 0.0
    return {
        "kpis": {
            "total_llamadas": total,
            "contestadas": n_cont,
            "no_contestadas": total - n_cont,
            "pct_contestadas": _pct(n_cont, total),
            "total_talk_seg": round(talk_total),
            "total_talk_hms": _hms(talk_total),
            "total_talk_horas": round(talk_total / 3600, 1),
            "tmo_seg": round(tmo_global),
            "tmo_hms": _hms(tmo_global),
            "vendedores_activos": len(pv),
            "dias_operativos": n_dias,
            "promedio_diario": round(total / n_dias) if n_dias else 0,
            "umbral_contestada_seg": umbral,
        },
        "por_vendedor": por_vendedor,
        "por_dia": por_dia,
        "serie_diaria": serie_diaria,
        "vendedores": vendedores,
    }
