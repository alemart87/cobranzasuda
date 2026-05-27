"""Cartera analysis: totals, tramos, top deudores, organizadores, secciones."""
from __future__ import annotations

from collections import defaultdict
from typing import Any

from ...utils.number_utils import num, norm


TRAMOS = [
    "Hasta 30 Días",
    "Hasta 60 Días",
    "Hasta 90 Días",
    "Hasta 120 Días",
    "Hasta 150 Días",
    "Más 150 Días",
]


def analyze_cartera(dxp_rows: list[dict[str, Any]]) -> dict[str, Any]:
    asegurados_set: set[str] = set()
    polizas_total = len(dxp_rows)
    saldo_total = 0.0
    a_vencer_total = 0.0
    vencido_total = 0.0
    aseg_mora: dict[str, float] = defaultdict(float)
    aseg_data: dict[str, dict] = defaultdict(lambda: {
        "saldo": 0.0,
        "vencido": 0.0,
        "polizas": 0,
        "organizador": "",
        "secciones": set(),
    })

    tramos_monto = {t: 0.0 for t in TRAMOS}
    tramos_clientes: dict[str, set] = {t: set() for t in TRAMOS}

    organizador_data: dict[str, dict] = defaultdict(lambda: {
        "polizas": 0,
        "asegurados": set(),
        "saldo": 0.0,
        "vencido": 0.0,
    })
    seccion_data: dict[str, dict] = defaultdict(lambda: {
        "polizas": 0,
        "saldo": 0.0,
        "vencido": 0.0,
    })

    for row in dxp_rows:
        aseg = norm(row.get("Asegurado"))
        if not aseg:
            continue
        asegurados_set.add(aseg)

        saldo = num(row.get("Saldo Total"))
        a_vencer = num(row.get("A Vencer"))
        venc = sum(num(row.get(t)) for t in TRAMOS)

        saldo_total += saldo
        a_vencer_total += a_vencer
        vencido_total += venc

        aseg_mora[aseg] += venc
        aseg_data[aseg]["saldo"] += saldo
        aseg_data[aseg]["vencido"] += venc
        aseg_data[aseg]["polizas"] += 1
        aseg_data[aseg]["organizador"] = row.get("Organizador") or ""
        if row.get("Nombre Sección"):
            aseg_data[aseg]["secciones"].add(row["Nombre Sección"])

        for t in TRAMOS:
            v = num(row.get(t))
            if v > 0:
                tramos_monto[t] += v
                tramos_clientes[t].add(aseg)

        org = row.get("Organizador") or "Sin dato"
        organizador_data[org]["polizas"] += 1
        organizador_data[org]["asegurados"].add(aseg)
        organizador_data[org]["saldo"] += saldo
        organizador_data[org]["vencido"] += venc

        sec = row.get("Nombre Sección") or "Sin dato"
        seccion_data[sec]["polizas"] += 1
        seccion_data[sec]["saldo"] += saldo
        seccion_data[sec]["vencido"] += venc

    asegurados_en_mora = {a: v for a, v in aseg_mora.items() if v > 0}

    # Top deudores por monto vencido
    top_deudores = []
    for aseg, data in sorted(aseg_data.items(), key=lambda kv: -kv[1]["vencido"])[:10]:
        if data["vencido"] <= 0:
            break
        top_deudores.append({
            "asegurado": aseg,
            "polizas": data["polizas"],
            "saldo_total": round(data["saldo"], 2),
            "vencido": round(data["vencido"], 2),
            "organizador": data["organizador"],
            "secciones": sorted(s for s in data["secciones"] if s),
            "pct_vencido_sobre_saldo": (
                round(data["vencido"] / data["saldo"] * 100, 1) if data["saldo"] else 0
            ),
        })

    tramos_list = [
        {
            "tramo": t,
            "monto": round(tramos_monto[t], 2),
            "clientes": len(tramos_clientes[t]),
            "pct_del_vencido": (
                round(tramos_monto[t] / vencido_total * 100, 2) if vencido_total else 0
            ),
        }
        for t in TRAMOS
    ]

    organizador_list = []
    for org, d in sorted(organizador_data.items(), key=lambda kv: -kv[1]["saldo"])[:15]:
        organizador_list.append({
            "organizador": org,
            "polizas": d["polizas"],
            "asegurados": len(d["asegurados"]),
            "saldo": round(d["saldo"], 2),
            "vencido": round(d["vencido"], 2),
        })

    seccion_list = []
    for sec, d in sorted(seccion_data.items(), key=lambda kv: -kv[1]["saldo"]):
        seccion_list.append({
            "seccion": sec,
            "polizas": d["polizas"],
            "saldo": round(d["saldo"], 2),
            "vencido": round(d["vencido"], 2),
        })

    return {
        "kpis": {
            "asegurados_total": len(asegurados_set),
            "polizas_total": polizas_total,
            "saldo_total": round(saldo_total, 2),
            "a_vencer_total": round(a_vencer_total, 2),
            "vencido_total": round(vencido_total, 2),
            "asegurados_en_mora": len(asegurados_en_mora),
        },
        "tramos": tramos_list,
        "top_deudores": top_deudores,
        "organizadores": organizador_list,
        "secciones": seccion_list,
    }
