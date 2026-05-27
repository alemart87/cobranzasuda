"""Analyze gestiones data: totales, subestados, breakdown por operador, KPIs.

Métricas clave por asesor:
- Promesas obtenidas (count subestado == 'Promesa de pago')
- % de promesas cumplidas: porcentaje de leads (asegurados) que recibieron una
  promesa Y luego fueron Cobrados. Si un lead nunca recibió promesa pero
  está Cobrado no cuenta como "promesa cumplida".
- Cobros directos (count subestado == 'Cobrado')
- % de cobros sobre contactos efectivos
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime
from typing import Any


# Subestados que cuentan como "contacto efectivo" (el cliente atendió)
NO_CONTACTO = {"No contesta", "Inubicables"}


def analyze_gestiones(rows: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(rows)

    # --- 1. Conteos globales por subestado ---
    subestados_count = Counter(r["subestado"] for r in rows if r["subestado"])
    estados_count = Counter(r["estado"] for r in rows if r["estado"])

    # --- 2. Por usuario ---
    usuarios_set = sorted({r["usuario"] for r in rows if r["usuario"]})
    by_user_sub: dict[str, Counter] = defaultdict(Counter)
    by_user_lead_sub: dict[str, dict[str, set]] = defaultdict(lambda: defaultdict(set))
    by_user_total: Counter = Counter()
    for r in rows:
        u = r["usuario"]
        s = r["subestado"]
        lead = r["lead"]
        by_user_total[u] += 1
        if s:
            by_user_sub[u][s] += 1
            if lead:
                by_user_lead_sub[u][s].add(lead)

    # --- 3. Métricas por asesor ---
    asesores: list[dict[str, Any]] = []
    for u in sorted(usuarios_set, key=lambda x: -by_user_total[x]):
        subs = by_user_sub[u]
        leads_promesa = by_user_lead_sub[u].get("Promesa de pago", set())
        leads_cobrado = by_user_lead_sub[u].get("Cobrado", set())
        total_gest = by_user_total[u]
        promesas = subs.get("Promesa de pago", 0)
        cobrados = subs.get("Cobrado", 0)
        contactos_efectivos = total_gest - subs.get("No contesta", 0) - subs.get("Inubicables", 0)

        # Promesas cumplidas: leads con promesa que también fueron cobrados
        promesas_cumplidas = len(leads_promesa & leads_cobrado)
        pct_cumplidas = (
            round(promesas_cumplidas / len(leads_promesa) * 100, 1) if leads_promesa else 0
        )

        pct_promesas_sobre_contactos = (
            round(promesas / contactos_efectivos * 100, 1) if contactos_efectivos else 0
        )
        pct_cobros_sobre_contactos = (
            round(cobrados / contactos_efectivos * 100, 1) if contactos_efectivos else 0
        )
        pct_cierre = round(cobrados / total_gest * 100, 2) if total_gest else 0

        asesores.append({
            "usuario": u,
            "gestiones": total_gest,
            "contactos_efectivos": contactos_efectivos,
            "promesas": promesas,
            "promesas_cumplidas": promesas_cumplidas,
            "pct_promesas_cumplidas": pct_cumplidas,
            "cobrados": cobrados,
            "pct_promesas_sobre_contactos": pct_promesas_sobre_contactos,
            "pct_cobros_sobre_contactos": pct_cobros_sobre_contactos,
            "pct_cierre": pct_cierre,
            "subestados": dict(subs),
        })

    # --- 4. KPIs equipo ---
    leads_promesa_global = set()
    leads_cobrado_global = set()
    for r in rows:
        if r["subestado"] == "Promesa de pago" and r["lead"]:
            leads_promesa_global.add(r["lead"])
        elif r["subestado"] == "Cobrado" and r["lead"]:
            leads_cobrado_global.add(r["lead"])
    promesas_cumplidas_global = len(leads_promesa_global & leads_cobrado_global)
    pct_cumplidas_global = (
        round(promesas_cumplidas_global / len(leads_promesa_global) * 100, 1)
        if leads_promesa_global else 0
    )

    contactos_global = total - subestados_count.get("No contesta", 0) - subestados_count.get("Inubicables", 0)

    # --- 5. Serie diaria de gestiones ---
    by_day: Counter = Counter()
    for r in rows:
        f = r["fecha"]
        if isinstance(f, datetime):
            by_day[f.date().isoformat()] += 1
    serie_diaria = [{"fecha": d, "gestiones": by_day[d]} for d in sorted(by_day.keys())]

    # --- 6. Subestados x asesor (matrix para gráfico apilado) ---
    subestados_top = [s for s, _ in subestados_count.most_common(10)]
    matrix = []
    for u in usuarios_set:
        row: dict[str, Any] = {"usuario": u}
        for s in subestados_top:
            row[s] = by_user_sub[u].get(s, 0)
        matrix.append(row)

    return {
        "kpis": {
            "total_gestiones": total,
            "asesores_activos": len(usuarios_set),
            "subestados_unicos": len(subestados_count),
            "promesas_totales": subestados_count.get("Promesa de pago", 0),
            "cobros_totales": subestados_count.get("Cobrado", 0),
            "contactos_efectivos": contactos_global,
            "leads_unicos_con_promesa": len(leads_promesa_global),
            "leads_unicos_cobrados": len(leads_cobrado_global),
            "promesas_cumplidas": promesas_cumplidas_global,
            "pct_promesas_cumplidas": pct_cumplidas_global,
            "pct_cobros_sobre_contactos": (
                round(subestados_count.get("Cobrado", 0) / contactos_global * 100, 2)
                if contactos_global else 0
            ),
        },
        "subestados": [
            {"subestado": s, "cantidad": n, "pct": round(n / total * 100, 2) if total else 0}
            for s, n in subestados_count.most_common()
        ],
        "estados": [{"estado": s, "cantidad": n} for s, n in estados_count.most_common()],
        "asesores": asesores,
        "matrix_subestados": {
            "subestados": subestados_top,
            "data": matrix,
        },
        "serie_diaria": serie_diaria,
    }
