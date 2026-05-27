"""Recupero analysis: cross DXP × Boca × Cobrado.

Reporta el recupero total del mes (todos los pagos cruzados con la cartera
asignada). NO segmenta entre "pagos de asegurados en mora" vs "cuotas
vigentes" — ese criterio fue revisado y removido.
"""
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

    # Total en mora (para contexto en el funnel/KPIs)
    vencido_total = 0.0
    asegurados_en_mora: set[str] = set()
    for r in dxp_rows:
        a = norm(r.get("Asegurado"))
        if not a:
            continue
        venc = sum(num(r.get(t)) for t in TRAMOS)
        if venc > 0:
            asegurados_en_mora.add(a)
            vencido_total += venc

    # Unique payments — cruzados con la cartera DXP
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

    return {
        "kpis": {
            "vencido_total": round(vencido_total, 2),
            "asegurados_en_mora": len(asegurados_en_mora),
            "recupero_total": round(monto_total, 2),
            "asegurados_pagaron": len(aseg_pagaron),
            "total_pagos": len(pagos),
            "pct_recupero_total_vs_vencido": (
                round(monto_total / vencido_total * 100, 2) if vencido_total else 0
            ),
        },
    }
