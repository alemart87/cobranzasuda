"""Zona de STAFF del simulador convergente: rotación, reclutamiento, capacitación y ausentismo.

Es un escenario APARTE: no modifica la proyección. Toma las mismas variables, ventas planificadas, GPON y
meses afectados, arma la dotación de vendedores mes a mes con la dinámica de staff, calcula cuánto puede
vender esa dotación y corre el balance convergente con esas ventas y esos vendedores. Así se ve, mes a mes,
el margen en Gs y en % de la proyección contra el que deja la dotación real.

Dinámica de un mes (vendedores):

    staff al inicio
    − bajas por rotación         rotación × dotación inicial (o × staff consolidado del mes, según la base)
    − bajas de nuevos (90 días)  de los aprobados, (100 − calidad de reclutamiento)% se van en sus 3 primeros meses
    + aprobados que ingresan     postulantes × efectividad de la capacitación, al terminar la capacitación
    = staff al cierre

    staff productivo   = el que vende ese mes; los que ingresan venden solo los días que quedan tras la capacitación
    presentes          = staff productivo × (1 − ausentismo)
    ventas posibles    = presentes × ventas por vendedor presente   (pospago); un nuevo, en su primer mes vendiendo
                         (desde que termina la capacitación), vende como máximo el tope del nuevo ingreso (10)
    GPON posibles      = presentes × GPON por asesor
    dotación necesaria = ventas del plan ÷ (ventas por vendedor presente × (1 − ausentismo))

Costos propios de la zona: capacitación (días × salario diario × % pagado × cargas, por postulante) y
reclutamiento (Gs por postulante). El resto de la estructura (supervisores, backoffice, coordinación,
controllers) es la del plan; los vendedores son los de la dinámica.
"""
from __future__ import annotations

import math
from typing import Any

from .facturacion_convergente import simular_convergente
from .facturacion_simulador import horizonte_valido, parametros_con_defaults, simular_facturacion

STAFF_DEFAULT: dict[str, Any] = {
    "staff_inicial": None,                   # vendedores al arrancar; None = la dotación del mes 1 del plan
    "rotacion_pct": 10.0,                    # % mensual que se va
    "rotacion_base": "inicial",              # "inicial": % de la dotación inicial (20% sin reponer → 5 meses) · "actual": % del staff consolidado del mes
    "rotacion_por_mes": [],                  # override por mes (None = usa rotacion_pct)
    "postulantes_por_mes": 20,               # postulantes que entran a capacitación cada mes
    "postulantes_lista": [],                 # override por mes (None = usa postulantes_por_mes)
    "efectividad_capacitacion_pct": 50.0,    # calidad de capacitación: % de postulantes que aprueba
    "calidad_reclutamiento_90_pct": 70.0,    # % de los aprobados que sigue a los 90 días
    "dias_capacitacion": 10,                 # días hábiles de capacitación (no venden)
    "ausentismo_pct": 12.0,                  # ausentismo diario promedio
    "productividad_presente": None,          # ventas por vendedor presente en el mes; None = ventas por vendedor del mes 1
    "pago_capacitacion_pct": 100.0,          # % del salario diario que se paga durante la capacitación
    "costo_reclutamiento_postulante": 0,     # Gs por postulante (avisos, entrevistas, exámenes)
    "ventas_modo": "capacidad",              # "capacidad": vende lo que puede el staff · "tope_plan": como máximo las ventas del plan
    # Rampa del nuevo ingreso: en su primer mes vendiendo (los primeros `meses_rampa` × días del mes que vende,
    # contados desde que termina la capacitación) un nuevo vende como máximo `tope_ventas_nuevo` por mes.
    "tope_ventas_nuevo": 10,
    "meses_rampa": 1,
}


def staff_con_defaults(cfg: dict | None) -> dict:
    out = dict(STAFF_DEFAULT)
    for k, v in (cfg or {}).items():
        if k in out and v is not None:
            out[k] = v
    return out


def _pct(v: Any, d: float = 0.0) -> float:
    try:
        return min(max(float(v), 0.0), 100.0) / 100.0
    except (TypeError, ValueError):
        return d / 100.0


def _serie(lista: list | None, base: float, h: int) -> list[float]:
    out = []
    for t in range(h):
        v = (lista or [])[t] if t < len(lista or []) else None
        out.append(float(base) if v is None or v == "" else max(float(v), 0.0))
    return out


def dinamica_staff(cfg: dict, h: int, dias_mes: float, ventas_plan: list[float], staff_inicial: float,
                   productividad: float, gpon_por_asesor: list[float] | None = None) -> list[dict[str, Any]]:
    """Dotación de vendedores mes a mes (ver el docstring del módulo)."""
    dias = max(float(dias_mes or 23), 1.0)
    rot = [x / 100.0 for x in _serie(cfg.get("rotacion_por_mes"), float(cfg["rotacion_pct"]), h)]
    post = _serie(cfg.get("postulantes_lista"), float(cfg["postulantes_por_mes"]), h)
    e = _pct(cfg["efectividad_capacitacion_pct"], 50)
    q = _pct(cfg["calidad_reclutamiento_90_pct"], 70)
    aus = _pct(cfg["ausentismo_pct"], 12)
    d_cap = max(float(cfg["dias_capacitacion"] or 0), 0.0)
    base_inicial = (cfg.get("rotacion_base") or "inicial") != "actual"
    # Los postulantes del mes t terminan la capacitación en el mes t + j y venden f del mes en que ingresan.
    j = int(d_cap // dias) if d_cap > 0 else 0
    f = (dias - (d_cap - j * dias)) / dias if d_cap > 0 else 1.0
    if j > 0 and abs(d_cap - j * dias) < 1e-9:
        f = 1.0

    # Rampa: los primeros `rampa_dias` días que vende un nuevo, vende a razón de min(productividad, tope) por mes.
    rampa_dias = min(max(float(cfg.get("meses_rampa") or 0), 0.0), 3.0) * dias
    tope = float(cfg.get("tope_ventas_nuevo") or 0)
    venta_presente = productividad * (1 - aus)                       # lo que vende en el mes un vendedor (con ausentismo)
    venta_rampa = min(venta_presente, tope) if tope > 0 else venta_presente

    def ventas_nuevo(edad: int) -> tuple[float, float]:
        """(ventas de un nuevo en el mes de edad `edad` desde que ingresa, fracción del mes que vende)."""
        dias_mes_v = f * dias if edad == 0 else dias
        antes = 0.0 if edad == 0 else f * dias + (edad - 1) * dias
        en_rampa = min(max(rampa_dias - antes, 0.0), dias_mes_v)
        return (en_rampa * venta_rampa + (dias_mes_v - en_rampa) * venta_presente) / dias, dias_mes_v / dias

    consolidado = float(staff_inicial)
    cohortes: list[dict] = []      # nuevos en período de prueba: {ingreso, aprobados, restantes}
    filas: list[dict[str, Any]] = []
    for t in range(h):
        inicio = consolidado + sum(c["restantes"] for c in cohortes)
        r_bajas = min(rot[t] * (float(staff_inicial) if base_inicial else consolidado), consolidado)
        consolidado -= r_bajas
        aprob = sum(post[s] * e for s in range(t + 1) if s + j == t)
        if aprob > 0:
            cohortes.append({"ingreso": t, "aprobados": aprob, "restantes": aprob})
        b90_viejos = b90_nuevos = 0.0
        prueba_vieja = nuevos = 0.0
        ventas_nuevos = productivo_nuevos = 0.0
        for c in cohortes:
            edad = t - c["ingreso"]
            if 0 <= edad <= 2:
                baja = min(c["aprobados"] * (1 - q) / 3.0, c["restantes"])
                c["restantes"] -= baja
                if edad == 0:
                    b90_nuevos += baja
                    nuevos += c["restantes"]
                else:
                    b90_viejos += baja
                    prueba_vieja += c["restantes"]
                v1, frac = ventas_nuevo(edad)
                ventas_nuevos += c["restantes"] * v1
                productivo_nuevos += c["restantes"] * frac
        en_prueba = prueba_vieja + nuevos
        cierre = consolidado + en_prueba
        productivo = consolidado + productivo_nuevos
        presentes = productivo * (1 - aus)
        cap = consolidado * venta_presente + ventas_nuevos
        necesaria = ventas_plan[t] / (productividad * (1 - aus)) if productividad > 0 and aus < 1 else 0.0
        k = (gpon_por_asesor or [0.0])[min(t, len(gpon_por_asesor or [0.0]) - 1)] if gpon_por_asesor else 0.0
        filas.append({
            "mes": t + 1,
            "staff_inicio": round(inicio, 1),
            "bajas_rotacion": round(r_bajas, 1),
            "postulantes": round(post[t], 1),
            "aprobados": round(aprob, 1),
            "bajas_90": round(b90_viejos + b90_nuevos, 1),
            "staff_cierre": round(cierre, 1),
            "en_prueba": round(en_prueba, 1),
            "staff_productivo": round(productivo, 2),
            "presentes": round(presentes, 2),
            "dotacion_necesaria": round(necesaria, 1),
            "brecha": round(productivo - necesaria, 1),
            "ventas_plan": round(ventas_plan[t]),
            "ventas_capacidad": round(cap),
            "ventas_nuevos": round(ventas_nuevos, 1),
            "venta_por_nuevo": round(ventas_nuevos / en_prueba, 1) if en_prueba > 0 else None,
            "gpon_capacidad": round(presentes * k),
            "rotacion_pct": round(rot[t] * 100, 1),
        })
        # Las cohortes que cumplieron 90 días pasan al staff consolidado.
        for c in [c for c in cohortes if t - c["ingreso"] >= 2]:
            consolidado += c["restantes"]
            cohortes.remove(c)
    return filas


def simular_staff(params: dict | None, ventas_por_mes: list[float], horizonte: int = 12,
                  meses_afectados: dict | None = None, bonos_adicionales_por_mes: list[float] | None = None,
                  nombres_meses: list[str] | None = None, gpon: dict | None = None,
                  staff: dict | None = None, con_sensibilidad: bool = False) -> dict[str, Any]:
    base = parametros_con_defaults(params)
    h = horizonte_valido(horizonte)
    plan = [max(float(v or 0), 0) for v in (ventas_por_mes or [])][:h]
    while len(plan) < h:
        plan.append(plan[-1] if plan else float(base["ventas"]))
    cfg = staff_con_defaults(staff)
    c = base["costos"]
    vpv = max(float(c["ventas_por_vendedor"] or 0), 0.01)
    m1 = simular_facturacion({**base, "ventas": plan[0], "_sin_breakeven": True})
    hc_plan = dict(m1["costos"]["headcount"])
    staff_ini = float(cfg["staff_inicial"]) if cfg.get("staff_inicial") not in (None, "") else float(hc_plan["vendedores"])
    prod = float(cfg["productividad_presente"]) if cfg.get("productividad_presente") not in (None, "") else vpv
    gpon = dict(gpon or {})
    gpon_on = bool(gpon.get("activo", False))
    k = [max(float(x or 0), 0) for x in (gpon.get("por_asesor_por_mes") or [])][:h] if gpon_on else []
    while gpon_on and len(k) < h:
        k.append(k[-1] if k else 3.0)

    filas = dinamica_staff(cfg, h, float(c["dias_mes"]), plan, staff_ini, prod, k if gpon_on else None)
    tope = cfg.get("ventas_modo") == "tope_plan"
    ventas_staff = [float(min(f["ventas_capacidad"], f["ventas_plan"]) if tope else f["ventas_capacidad"]) for f in filas]
    res = simular_convergente(base, ventas_staff, h, meses_afectados, bonos_adicionales_por_mes, nombres_meses, gpon,
                              headcount_fijo=hc_plan, vendedores_por_mes=[f["staff_productivo"] for f in filas],
                              ventas_gpon_por_mes=[f["gpon_capacidad"] for f in filas] if gpon_on else None,
                              sin_equilibrio=True)

    # Costos propios de la zona: capacitación y reclutamiento, por los postulantes del mes.
    carga = 1 + float(c["ips_pct"]) / 100.0 + (1 / 12 if c.get("aguinaldo", True) else 0)
    salario_dia = float(c["salario_hora"]) * float(c["horas_dia"])
    dias_cap = max(float(cfg["dias_capacitacion"] or 0), 0.0)
    pago = _pct(cfg["pago_capacitacion_pct"], 100)
    rec = max(float(cfg["costo_reclutamiento_postulante"] or 0), 0.0)
    acum = 0
    tot_cap = tot_rec = 0
    for f, m in zip(filas, res["meses"]):
        cap = round(f["postulantes"] * dias_cap * salario_dia * pago * carga)
        rcl = round(f["postulantes"] * rec)
        tot_cap += cap
        tot_rec += rcl
        f["costo_capacitacion"], f["costo_reclutamiento"] = cap, rcl
        f["ventas"] = m["ventas"]
        f["ventas_gpon"] = m.get("ventas_gpon", 0)
        f["ingreso_neto"] = m["ingreso_neto"]
        f["costo_total"] = m["costo_total"] + cap + rcl
        f["resultado"] = f["ingreso_neto"] - f["costo_total"]
        # Sin ingreso positivo (mes sin staff: solo devoluciones) el margen % no tiene sentido.
        f["margen_pct"] = round(f["resultado"] / f["ingreso_neto"] * 100, 1) if f["ingreso_neto"] > 0 else None
        acum += f["resultado"]
        f["acumulado"] = acum
        f["bono_productividad_linea"] = m.get("monto_bono_productividad", 0)
        f["cumplimiento_pct"] = m.get("cumplimiento_pct", 0)
    a = res["anual"]
    extra = tot_cap + tot_rec
    resultado = a["resultado"] - extra
    final = a["resultado_con_cola"] - extra
    cola_total = (a.get("cola_post_12") or {}).get("total", 0)
    ingreso_final = a["ingreso_neto"] + cola_total
    e, q = _pct(cfg["efectividad_capacitacion_pct"], 50), _pct(cfg["calidad_reclutamiento_90_pct"], 70)
    rot_base = float(cfg["rotacion_pct"]) / 100.0 * staff_ini
    reposicion = math.ceil(rot_base / (e * q)) if e * q > 0 else None
    anual = {
        "ventas": a["ventas"], "ventas_gpon": a.get("ventas_gpon", 0), "ingreso_neto": a["ingreso_neto"],
        "costos": a["costos"] + extra, "costo_capacitacion": tot_cap, "costo_reclutamiento": tot_rec,
        "resultado": resultado, "margen_pct": round(resultado / a["ingreso_neto"] * 100, 1) if a["ingreso_neto"] > 0 else None,
        "resultado_con_cola": final,
        "margen_final_pct": round(final / ingreso_final * 100, 1) if ingreso_final > 0 else None,
        "staff_inicial": round(staff_ini, 1), "staff_final": filas[-1]["staff_cierre"],
        "staff_minimo": min(f["staff_cierre"] for f in filas),
        "mes_sin_staff": next((f["mes"] for f in filas if f["staff_cierre"] <= 0.5), None),
        "meses_bajo_necesidad": [f["mes"] for f in filas if f["brecha"] < -0.5],
        "postulantes": round(sum(f["postulantes"] for f in filas)),
        "aprobados": round(sum(f["aprobados"] for f in filas), 1),
        "incorporados_90": round(sum(f["aprobados"] for f in filas) * q, 1),
        "bajas_rotacion": round(sum(f["bajas_rotacion"] for f in filas), 1),
        "bajas_90": round(sum(f["bajas_90"] for f in filas), 1),
        "postulantes_reposicion": reposicion,     # postulantes por mes para reponer la rotación (base inicial)
        "dotacion_necesaria_mes1": filas[0]["dotacion_necesaria"],
        "productividad_presente": round(prod, 2), "ausentismo_pct": float(cfg["ausentismo_pct"]),
    }
    out = {"configuracion": {**cfg, "staff_inicial": round(staff_ini, 1), "productividad_presente": round(prod, 2)},
           "headcount_plan": hc_plan, "meses": filas, "anual": anual}
    if con_sensibilidad:
        # Cómo mueve el margen la duración de la capacitación (todo lo demás igual).
        actual = float(cfg["dias_capacitacion"] or 0)
        filas_s = []
        for d in sorted({0.0, 5.0, 10.0, 15.0, 20.0, 30.0, actual}):
            r = simular_staff(params, ventas_por_mes, horizonte, meses_afectados, bonos_adicionales_por_mes, nombres_meses,
                              gpon, {**cfg, "staff_inicial": staff_ini, "dias_capacitacion": d})
            ra = r["anual"]
            filas_s.append({"dias": d, "actual": abs(d - actual) < 1e-9, "ventas": ra["ventas"], "staff_final": ra["staff_final"],
                            "costo_capacitacion": ra["costo_capacitacion"], "resultado": ra["resultado"], "margen_pct": ra["margen_pct"],
                            "resultado_con_cola": ra["resultado_con_cola"], "margen_final_pct": ra["margen_final_pct"]})
        out["sensibilidad_dias"] = filas_s
    return out
