"""Tendencias de Televentas: proyección de cierre, comparativo mensual y caídas.

Todo determinista y basado en los datos ya procesados (sin usar la fecha real del
servidor): la proyección se calcula a partir de los propios días con venta del mes.
"""
from __future__ import annotations

import calendar
from datetime import date, datetime
from typing import Any, Optional


def _business_days(year: int, month: int, upto_day: Optional[int] = None) -> int:
    ndays = calendar.monthrange(year, month)[1]
    last = min(upto_day or ndays, ndays)
    return sum(1 for d in range(1, last + 1) if date(year, month, d).weekday() < 5)


def _pct_delta(cur: float, prev: float) -> Optional[float]:
    if not prev:
        return None
    return round((cur - prev) / abs(prev) * 100, 1)


def proyeccion_cierre(prod_data: dict | None) -> dict[str, Any]:
    """Proyecta prima y pólizas emitidas al cierre del mes, con run-rate por día hábil.

    Usa el último día con venta como "hoy" (proyección determinista sobre los datos).
    """
    d = prod_data or {}
    por_dia = d.get("por_dia", [])
    kpis = d.get("kpis", {})
    if not por_dia:
        return {"sin_datos": True, "mensaje": "No hay producción diaria para proyectar."}
    fechas = []
    for row in por_dia:
        try:
            fechas.append(datetime.strptime(row["fecha"], "%Y-%m-%d").date())
        except (ValueError, KeyError):
            continue
    if not fechas:
        return {"sin_datos": True, "mensaje": "Fechas de producción inválidas."}
    y, m = fechas[0].year, fechas[0].month
    last_day = max(f.day for f in fechas)
    bd_elapsed = max(_business_days(y, m, last_day), 1)
    bd_total = _business_days(y, m)
    prima = float(kpis.get("prima_emitida", sum(r.get("prima", 0) for r in por_dia)))
    polizas = int(kpis.get("polizas_emitidas", sum(r.get("polizas", 0) for r in por_dia)))
    rr_prima = prima / bd_elapsed
    rr_pol = polizas / bd_elapsed
    completo = bd_elapsed >= bd_total
    return {
        "mes": f"{y}-{m:02d}",
        "prima_emitida_actual": round(prima),
        "polizas_actuales": polizas,
        "ultimo_dia_con_venta": max(fechas).isoformat(),
        "dias_habiles_transcurridos": bd_elapsed,
        "dias_habiles_mes": bd_total,
        "pct_avance_mes": round(bd_elapsed / bd_total * 100, 1) if bd_total else 100.0,
        "run_rate_diario_prima": round(rr_prima),
        "run_rate_diario_polizas": round(rr_pol, 1),
        "proyeccion_prima_cierre": round(rr_prima * bd_total),
        "proyeccion_polizas_cierre": round(rr_pol * bd_total),
        "mes_completo": completo,
        "nota": ("El mes parece completo; la proyección coincide con lo emitido." if completo
                 else "Proyección lineal por run-rate de día hábil (sin ajustar feriados PY)."),
    }


def _kpi_deltas(a: dict, b: dict) -> dict:
    """a = mes previo, b = mes actual. Deltas de los KPIs combinados."""
    ka, kb = a.get("kpis", {}), b.get("kpis", {})
    campos = [
        ("prima_emitida", "Prima emitida"), ("prima_anulada", "Prima anulada"),
        ("polizas_emitidas", "Pólizas emitidas"), ("ticket_promedio", "Ticket promedio"),
        ("total_llamadas", "Llamadas"), ("contestadas", "Contestadas"),
        ("conversion_pct", "Conversión %"), ("dias_productivos", "Días productivos"),
    ]
    out = []
    for key, label in campos:
        cur, prev = float(kb.get(key, 0) or 0), float(ka.get(key, 0) or 0)
        out.append({"metric": label, "actual": cur, "previo": prev,
                    "delta": round(cur - prev, 1), "pct": _pct_delta(cur, prev)})
    return {"kpis": out}


def comparar_meses(prev_ov: dict, curr_ov: dict, mes_prev: str, mes_curr: str) -> dict[str, Any]:
    """Compara dos overviews combinados (mes previo vs actual): KPIs, por vendedor y por producto."""
    deltas = _kpi_deltas(prev_ov, curr_ov)

    # por vendedor (nombre de llamadas, consistente en el overview combinado)
    prev_v = {v["vendedor"]: v for v in prev_ov.get("por_vendedor", [])}
    filas = []
    for v in curr_ov.get("por_vendedor", []):
        p = prev_v.get(v["vendedor"], {})
        filas.append({
            "vendedor": v["vendedor"],
            "prima_actual": v.get("prima_emitida", 0), "prima_previo": p.get("prima_emitida", 0),
            "prima_delta": round(v.get("prima_emitida", 0) - p.get("prima_emitida", 0)),
            "prima_pct": _pct_delta(v.get("prima_emitida", 0), p.get("prima_emitida", 0)),
            "polizas_actual": v.get("polizas", 0), "polizas_previo": p.get("polizas", 0),
            "llamadas_actual": v.get("llamadas", 0), "llamadas_previo": p.get("llamadas", 0),
        })
    filas.sort(key=lambda x: x["prima_delta"])  # mayores caídas primero

    # por producto (desde la producción del overview)
    prev_p = {p["producto"]: p for p in prev_ov.get("por_producto", [])}
    prods = []
    for p in curr_ov.get("por_producto", []):
        pp = prev_p.get(p["producto"], {})
        prods.append({"producto": p["producto"], "prima_actual": p.get("prima", 0),
                      "prima_previo": pp.get("prima", 0),
                      "prima_delta": round(p.get("prima", 0) - pp.get("prima", 0)),
                      "prima_pct": _pct_delta(p.get("prima", 0), pp.get("prima", 0))})

    return {"mes_previo": mes_prev, "mes_actual": mes_curr, **deltas,
            "por_vendedor": filas, "por_producto": prods}


def caidas_vendedores(prev_ov: dict, curr_ov: dict, mes_prev: str, mes_curr: str,
                      umbral_pct: float = 30.0) -> dict[str, Any]:
    """Vendedores del equipo con caída significativa vs el mes anterior (prima, pólizas o llamadas)."""
    prev_v = {v["vendedor"]: v for v in prev_ov.get("por_vendedor", [])}
    caidas = []
    for v in curr_ov.get("por_vendedor", []):
        if not v.get("es_equipo"):
            continue
        p = prev_v.get(v["vendedor"])
        if not p:
            continue
        prima_pct = _pct_delta(v.get("prima_emitida", 0), p.get("prima_emitida", 0))
        pol_pct = _pct_delta(v.get("polizas", 0), p.get("polizas", 0))
        llam_pct = _pct_delta(v.get("llamadas", 0), p.get("llamadas", 0))
        motivos = []
        if prima_pct is not None and prima_pct <= -umbral_pct:
            motivos.append("prima")
        if pol_pct is not None and pol_pct <= -umbral_pct:
            motivos.append("polizas")
        if llam_pct is not None and llam_pct <= -umbral_pct:
            motivos.append("llamadas")
        if motivos:
            caidas.append({
                "vendedor": v["vendedor"], "motivos": motivos,
                "prima_actual": v.get("prima_emitida", 0), "prima_previo": p.get("prima_emitida", 0),
                "prima_pct": prima_pct, "polizas_pct": pol_pct, "llamadas_pct": llam_pct,
            })
    caidas.sort(key=lambda x: (x["prima_pct"] if x["prima_pct"] is not None else 0))
    return {"mes_previo": mes_prev, "mes_actual": mes_curr, "umbral_pct": umbral_pct,
            "caidas": caidas, "total": len(caidas)}
