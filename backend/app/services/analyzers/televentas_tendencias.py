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


def _dir(values: list[float]) -> str:
    """Dirección de la tendencia (primer vs último punto, tolerancia 5%)."""
    vals = [v for v in values if v is not None]
    if len(vals) < 2 or not vals[0]:
        return "estable"
    ch = (vals[-1] - vals[0]) / abs(vals[0])
    if ch >= 0.05:
        return "sube"
    if ch <= -0.05:
        return "baja"
    return "estable"


def _consec_baja(values: list[float]) -> int:
    """Cantidad de descensos consecutivos al final de la serie."""
    n = 0
    for i in range(len(values) - 1, 0, -1):
        if values[i] is not None and values[i - 1] is not None and values[i] < values[i - 1]:
            n += 1
        else:
            break
    return n


def analizar_tendencia_mensual(serie: list[dict]) -> list[dict]:
    """Insights sobre la evolución de varios meses (serie cronológica)."""
    if len(serie) < 2:
        return []
    out: list[dict] = []
    conv = [s.get("conversion_pct", 0) for s in serie]
    cont = [s.get("contactabilidad", 0) for s in serie]
    llam = [s.get("total_llamadas", 0) for s in serie]
    prom = [s.get("llamadas_prom_asesor_dia", 0) for s in serie]
    agentes = [s.get("agentes_activos", 0) for s in serie]
    m0, mN = serie[0]["mes"], serie[-1]["mes"]

    # Conversión
    d = _dir(conv); baja = _consec_baja(conv)
    if baja >= 2 or d == "baja":
        out.append({"tipo": "conversion", "severidad": "alert" if baja >= 2 else "warning",
                    "titulo": "Conversión a la baja",
                    "detalle": f"Pasó de {conv[0]}% ({m0}) a {conv[-1]}% ({mN})"
                               + (f", con {baja} meses seguidos de caída." if baja >= 2 else ".")})
    elif d == "sube":
        out.append({"tipo": "conversion", "severidad": "info", "titulo": "Conversión en mejora",
                    "detalle": f"Subió de {conv[0]}% ({m0}) a {conv[-1]}% ({mN})."})

    # Contactabilidad vs volumen (calidad de base)
    dc, dl = _dir(cont), _dir(prom)
    if dc == "baja" and dl in ("sube", "estable"):
        out.append({"tipo": "base_datos", "severidad": "warning",
                    "titulo": "Más marcación con peor contacto",
                    "detalle": f"La contactabilidad bajó ({cont[0]}%→{cont[-1]}%) mientras las llamadas por asesor "
                               f"no bajaron ({prom[0]}→{prom[-1]}). Señal de deterioro en la calidad/frescura de las bases."})
    elif dc == "baja":
        out.append({"tipo": "base_datos", "severidad": "warning", "titulo": "Contactabilidad en descenso",
                    "detalle": f"Bajó de {cont[0]}% ({m0}) a {cont[-1]}% ({mN}). Revisar bases y horarios de marcación."})

    # Agentes activos
    da = _dir(agentes)
    if da != "estable":
        out.append({"tipo": "dotacion", "severidad": "info",
                    "titulo": f"Dotación de agentes en {'aumento' if da == 'sube' else 'baja'}",
                    "detalle": f"Agentes activos: {agentes[0]} ({m0}) → {agentes[-1]} ({mN})."})

    return out


def comparativo_televentas(prev_ov: dict, curr_ov: dict, mes_prev: str, mes_curr: str) -> dict[str, Any]:
    """Comparativo completo mes vs mes anterior para la pestaña de UI:
    deltas de KPIs, tabla por operador (llamadas, contactabilidad, conversión, prima)
    e insights automáticos sobre el CAMBIO."""
    deltas = _kpi_deltas(prev_ov, curr_ov)["kpis"]
    prev_v = {v["vendedor"]: v for v in prev_ov.get("por_vendedor", [])}
    curr_v = {v["vendedor"]: v for v in curr_ov.get("por_vendedor", [])}

    por_operador = []
    for name, v in curr_v.items():
        p = prev_v.get(name)
        estado = "nuevo" if not p else "estable"
        prima_pct = _pct_delta(v.get("prima_emitida", 0), (p or {}).get("prima_emitida", 0))
        if p:
            if prima_pct is not None and prima_pct <= -25:
                estado = "cayo"
            elif prima_pct is not None and prima_pct >= 25:
                estado = "subio"
        por_operador.append({
            "vendedor": name, "estado": estado,
            "llamadas_act": v.get("llamadas", 0), "llamadas_prev": (p or {}).get("llamadas", 0),
            "llamadas_pct": _pct_delta(v.get("llamadas", 0), (p or {}).get("llamadas", 0)),
            "contacto_act": v.get("pct_contestadas", 0), "contacto_prev": (p or {}).get("pct_contestadas", 0),
            "conversion_act": v.get("conversion_pct", 0), "conversion_prev": (p or {}).get("conversion_pct", 0),
            "prima_act": v.get("prima_emitida", 0), "prima_prev": (p or {}).get("prima_emitida", 0),
            "prima_pct": prima_pct,
        })
    # operadores que salieron (estaban el mes previo, no este)
    salieron = [name for name in prev_v if name not in curr_v]
    por_operador.sort(key=lambda x: (x["prima_pct"] if x["prima_pct"] is not None else 999))

    # ---- insights del cambio ----
    insights = []
    kp = {d["metric"]: d for d in deltas}
    contact = kp.get("Conversión %")  # placeholder, se recalcula abajo
    ka, kb = prev_ov.get("kpis", {}), curr_ov.get("kpis", {})
    contact_prev, contact_act = ka.get("pct_contestadas", 0), kb.get("pct_contestadas", 0)
    dcontact = round(contact_act - contact_prev, 1)
    if abs(dcontact) >= 3:
        sev = "warning" if dcontact < 0 else "info"
        insights.append({"tipo": "base_datos", "severidad": sev,
                         "titulo": f"Contactabilidad del equipo {'cayó' if dcontact < 0 else 'subió'} {abs(dcontact)} pts",
                         "detalle": f"Pasó de {contact_prev}% a {contact_act}%. "
                                    + ("Posible deterioro en la calidad/frescura de las bases." if dcontact < 0
                                       else "Mejor calidad de contacto o marcación.")})
    conv_prev, conv_act = ka.get("conversion_pct", 0), kb.get("conversion_pct", 0)
    dconv = round(conv_act - conv_prev, 1)
    if abs(dconv) >= 0.5:
        insights.append({"tipo": "conversion", "severidad": "warning" if dconv < 0 else "info",
                         "titulo": f"Conversión {'cayó' if dconv < 0 else 'subió'} {abs(dconv)} pts",
                         "detalle": f"Pasó de {conv_prev}% a {conv_act}% (pólizas por llamada contestada)."})
    nuevos = [o["vendedor"] for o in por_operador if o["estado"] == "nuevo"]
    if nuevos:
        insights.append({"tipo": "operador_nuevo", "severidad": "info",
                         "titulo": f"{len(nuevos)} operador(es) nuevo(s) este mes",
                         "detalle": "No tenían actividad el mes anterior: " + ", ".join(nuevos[:6]) + ".",
                         "vendedores": nuevos})
    if salieron:
        insights.append({"tipo": "caida_actividad", "severidad": "warning",
                         "titulo": f"{len(salieron)} operador(es) sin actividad este mes",
                         "detalle": "Registraban llamadas el mes anterior y ahora no: " + ", ".join(salieron[:6]) + ".",
                         "vendedores": salieron})
    cayeron = [o for o in por_operador if o["prima_pct"] is not None and o["prima_pct"] <= -30 and o["estado"] != "nuevo"]
    if cayeron:
        det = ", ".join(f"{o['vendedor']} ({o['prima_pct']}%)" for o in cayeron[:6])
        insights.append({"tipo": "caida_produccion", "severidad": "alert",
                         "titulo": f"{len(cayeron)} operador(es) con caída fuerte de producción",
                         "detalle": f"Prima emitida vs mes anterior: {det}.",
                         "vendedores": [o["vendedor"] for o in cayeron]})

    return {"mes_previo": mes_prev, "mes_actual": mes_curr, "kpis": deltas,
            "por_operador": por_operador, "salieron": salieron, "insights": insights}


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
