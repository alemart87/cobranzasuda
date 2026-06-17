"""Comparación de N liquidaciones de Televentas Claro (Facturación).

Recibe varios reportes ya procesados (su `data` de `analyze_facturacion`) y arma:
- matriz Concepto × mes (todas las descripciones),
- totales/créditos/débitos/ventas por mes,
- variaciones mes a mes,
- panel de drivers clave,
- hallazgos automáticos.

Solo trabaja sobre datos ya persistidos (liviano): no re-parsea archivos.
"""
from __future__ import annotations

from typing import Any

# Drivers operativos clave a destacar en el panel
_DRIVERS = [
    ("INCENTIVO PRODUCTIVIDAD", "Bono (incentivo productividad)"),
    ("SUSPENSIONES", "Suspensiones"),
    ("LINEA CON DOCUMENTACION FALTANTE", "Documentación faltante"),
    ("ACTIVACIONES", "Activaciones (ventas)"),
]


def _label(rep: dict[str, Any]) -> str:
    return rep.get("title") or rep.get("periodo") or f"Liq {rep.get('nro_liquidacion') or '?'}"


def _sort_key(rep: dict[str, Any]):
    return (rep.get("periodo") or "", rep.get("generated_at") or "")


def compare_facturacion(reports: list[dict[str, Any]]) -> dict[str, Any]:
    """`reports`: lista de {id, title, periodo, nro_liquidacion, generated_at, data}."""
    reps = sorted(reports, key=_sort_key)
    cols = [
        {
            "id": r["id"],
            "label": _label(r),
            "periodo": r.get("periodo"),
            "nro_liquidacion": r.get("nro_liquidacion"),
        }
        for r in reps
    ]

    # Mapa concepto -> {col_id: importe} (todas las descripciones)
    conceptos_union: dict[str, dict[str, float]] = {}
    for r in reps:
        for c in (r.get("data") or {}).get("conceptos", []):
            conceptos_union.setdefault(c["descripcion"], {})[r["id"]] = c["importe"]

    def row_for(desc: str) -> dict[str, Any]:
        valores = conceptos_union.get(desc, {})
        return {
            "descripcion": desc,
            "valores": [round(valores.get(col["id"], 0.0), 2) for col in cols],
        }

    # Orden de conceptos por |importe| del último mes
    last_id = cols[-1]["id"] if cols else None
    conceptos_orden = sorted(
        conceptos_union.keys(),
        key=lambda d: abs(conceptos_union[d].get(last_id, 0.0)),
        reverse=True,
    )
    conceptos_matrix = [row_for(d) for d in conceptos_orden]

    # Totales por mes
    def kpi(r: dict, key: str) -> float:
        return (r.get("data") or {}).get("kpis", {}).get(key, 0.0)

    totales = [round(kpi(r, "total"), 2) for r in reps]
    creditos = [round(kpi(r, "creditos"), 2) for r in reps]
    debitos = [round(kpi(r, "debitos"), 2) for r in reps]
    ventas = [int(kpi(r, "ventas_activaciones") or 0) for r in reps]

    # Variaciones mes a mes (sobre el total)
    variaciones = [None]
    for i in range(1, len(totales)):
        prev, cur = totales[i - 1], totales[i]
        variaciones.append(round((cur / prev - 1) * 100, 1) if prev else None)

    # Panel de drivers
    drivers = []
    for desc, nombre in _DRIVERS:
        vals = conceptos_union.get(desc)
        if not vals:
            continue
        drivers.append({
            "concepto": desc,
            "nombre": nombre,
            "valores": [round(vals.get(col["id"], 0.0), 2) for col in cols],
        })

    # Hallazgos automáticos (deterministas)
    hallazgos: list[str] = []
    if len(totales) >= 2:
        promedio = sum(totales) / len(totales)
        ultimo = totales[-1]
        delta = ultimo - promedio
        hallazgos.append(
            f"Promedio del período: Gs {promedio:,.0f}. Último mes ({cols[-1]['label']}): "
            f"Gs {ultimo:,.0f} ({delta:+,.0f} vs promedio).".replace(",", ".")
        )
        # Mayor variación mes a mes
        var_validas = [(i, v) for i, v in enumerate(variaciones) if v is not None]
        if var_validas:
            i_max = max(var_validas, key=lambda x: abs(x[1]))
            hallazgos.append(
                f"Mayor variación: {cols[i_max[0]]['label']} ({i_max[1]:+.1f}% vs mes previo)."
            )

    return {
        "columnas": cols,
        "conceptos": conceptos_matrix,   # matriz completa (todas las descripciones)
        "totales": totales,
        "creditos": creditos,
        "debitos": debitos,
        "ventas": ventas,
        "variaciones": variaciones,
        "drivers": drivers,
        "hallazgos": hallazgos,
    }
