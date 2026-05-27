"""Recupero analysis: cross DXP × Boca × Cobrado, total + sobre mora."""
from __future__ import annotations

from typing import Any

from ...utils.number_utils import num, norm
from ..matchers import build_policy_index, find_asegurado_for_pago


TRAMOS = [
    "Hasta 30 Días",
    "Hasta 60 Días",
    "Hasta 90 Días",
    "Hasta 120 Días",
    "Hasta 150 Días",
    "Más 150 Días",
]


def analyze_recupero(
    dxp_rows: list[dict[str, Any]],
    boca_rows: list[dict[str, Any]],
    cobrado_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    dxp_aseg_set = {norm(r.get("Asegurado")) for r in dxp_rows if r.get("Asegurado")}
    policy_index = build_policy_index(dxp_rows)

    # vencido por asegurado
    vencido_por_aseg: dict[str, float] = {}
    for r in dxp_rows:
        a = norm(r.get("Asegurado"))
        if not a:
            continue
        venc = sum(num(r.get(t)) for t in TRAMOS)
        vencido_por_aseg[a] = vencido_por_aseg.get(a, 0.0) + venc

    aseg_en_mora = {a: v for a, v in vencido_por_aseg.items() if v > 0}

    # unique payments
    recibos_vistos: set[tuple[str, float]] = set()
    pagos: list[dict[str, Any]] = []

    for row in boca_rows:
        aseg = find_asegurado_for_pago(
            row.get("Descripción"),
            row.get("Cod. Concepto"),
            dxp_aseg_set,
            policy_index,
        )
        if aseg is None:
            continue
        importe = num(row.get("Importe"))
        key = (str(row.get("Recibo")), importe)
        if key in recibos_vistos:
            continue
        recibos_vistos.add(key)
        pagos.append({
            "aseg": aseg,
            "monto": importe,
            "fuente": "Boca",
            "cobrador": row.get("Cobrador"),
        })

    for row in cobrado_rows:
        aseg = find_asegurado_for_pago(
            row.get("Descripción"),
            row.get("Concepto"),
            dxp_aseg_set,
            policy_index,
        )
        if aseg is None:
            continue
        importe = num(row.get("Importe"))
        key = (str(row.get("Recibo")), importe)
        if key in recibos_vistos:
            continue
        recibos_vistos.add(key)
        pagos.append({
            "aseg": aseg,
            "monto": importe,
            "fuente": "Cobrado",
            "cobrador": row.get("Cobrador"),
        })

    aseg_pagaron = {p["aseg"] for p in pagos}
    monto_total = sum(p["monto"] for p in pagos)

    # Segmentación: pagos de asegurados que estaban en mora
    pagos_en_mora = [p for p in pagos if p["aseg"] in aseg_en_mora]
    pagos_no_mora = [p for p in pagos if p["aseg"] not in aseg_en_mora]
    monto_en_mora = sum(p["monto"] for p in pagos_en_mora)
    monto_no_mora = sum(p["monto"] for p in pagos_no_mora)
    aseg_pagaron_en_mora = {p["aseg"] for p in pagos_en_mora}

    # por tramo
    tramo_recup = {t: {"venc_total": 0.0, "venc_pag": 0.0} for t in TRAMOS}
    for r in dxp_rows:
        a = norm(r.get("Asegurado"))
        if not a:
            continue
        for t in TRAMOS:
            v = num(r.get(t))
            if v > 0:
                tramo_recup[t]["venc_total"] += v
                if a in aseg_pagaron_en_mora:
                    tramo_recup[t]["venc_pag"] += v

    tramos_list = [
        {
            "tramo": t,
            "monto_en_mora": round(tramo_recup[t]["venc_total"], 2),
            "monto_recuperado": round(tramo_recup[t]["venc_pag"], 2),
            "pct_regularizado": (
                round(tramo_recup[t]["venc_pag"] / tramo_recup[t]["venc_total"] * 100, 2)
                if tramo_recup[t]["venc_total"]
                else 0
            ),
        }
        for t in TRAMOS
    ]

    vencido_total = sum(aseg_en_mora.values())

    return {
        "kpis": {
            "vencido_total": round(vencido_total, 2),
            "asegurados_en_mora": len(aseg_en_mora),
            "recupero_total": round(monto_total, 2),
            "recupero_sobre_mora": round(monto_en_mora, 2),
            "recupero_cuotas_vigentes": round(monto_no_mora, 2),
            "asegurados_pagaron": len(aseg_pagaron),
            "asegurados_pagaron_en_mora": len(aseg_pagaron_en_mora),
            "total_pagos": len(pagos),
            "pagos_en_mora": len(pagos_en_mora),
            "pagos_cuotas_vigentes": len(pagos_no_mora),
            "pct_recupero_total_vs_vencido": (
                round(monto_total / vencido_total * 100, 2) if vencido_total else 0
            ),
            "pct_recupero_sobre_mora": (
                round(monto_en_mora / vencido_total * 100, 2) if vencido_total else 0
            ),
        },
        "tramos_recupero": tramos_list,
    }
