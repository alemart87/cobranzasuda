"""Simulador de FACTURACIÓN — Televentas Claro (liquidación de comisiones).

El usuario carga la cantidad de VENTAS del mes y el simulador genera la
facturación del mes (mes 0) y cuánto de esa facturación queda realmente a los
6 meses (fin del chargeback) y a los 12 (fin del residual), proyectando las
caídas de líneas con la ZAFRA (curva de líneas activas por mes de antigüedad).

TODAS las variables de negocio y componentes de facturación son editables
(`PARAMETROS_DEFAULT` son los valores sembrados con las liquidaciones reales):

  Ventas × efectividad → activaciones (cuota 1)
  Mes 0  = cuota 1 por plan + plus de portabilidad + bono productividad + bono efectividad
  Mes 1  = − legajos faltantes/incompletos
  Mes k  = + residual (14,5% del abono acreditado × líneas activas según zafra)
           − clawbacks por caídas dentro del chargeback (cuota 1 + residual +
             portabilidad + bono efectividad), neto de recuperos por reconexión
  Mes 3  = + cuota 2 (líneas activas al día 90; legajo incompleto = mitad)
  Mes 6  = − recálculo del bono productividad (líneas no activas al día 180)

Criterios Claro (editables):
  Bono productividad (1771): por línea en estado A; % cumplimiento = activaciones
    netas ÷ objetivo; escala ≥110% 105.000 · ≥105% 100.000 · ≥100% 95.000 ·
    ≥95% 50.000 · ≥90% 40.000 · <90% 0. Recálculo al 6º mes (1871).
  Bono efectividad distribución (1891): por venta entregada según efectividad
    (activaciones ÷ ventas): ≥85% 50.000 · ≥82% 45.000 · ≥80% 35.000 · <80% 0.
  Cuota 2: mes +3, línea activa al día 90 y legajo completo (incompleto = 50%).
"""
from __future__ import annotations

import copy
from typing import Any

# Zafra tipo del negocio (% líneas nuevas activas por mes de antigüedad),
# promedio de las cohortes 2025-07 … 2026-01 informadas por Claro.
ZAFRA_DEFAULT = [99.9, 82.6, 58.5, 53.8, 53.1, 49.2, 51.1, 46.2, 41.9, 40.7, 40.1, 40.4, 41.8]

PARAMETROS_DEFAULT: dict[str, Any] = {
    # ---- entrada principal ----
    "ventas": 1950,                 # ventas del mes (entregadas a Claro)
    "efectividad_pct": 89.0,        # activaciones ÷ ventas (liquidaciones reales: 88,5–89,1%)
    "objetivo_co": 1750,            # objetivo mensual de líneas CO (lo comunica Claro)
    "pct_estado_a": 99.5,           # activaciones en estado A (no S/P/C) al liquidar
    # ---- tarifas por plan (Gs sin IVA) y mix ----
    "planes": [
        {"plan": "CG15G", "mix_pct": 68.0, "cuota1": 204545, "cuota2": 34091, "porta_plus": 218182, "abono": 170455},
        {"plan": "CG30G", "mix_pct": 29.0, "cuota1": 245455, "cuota2": 81818, "porta_plus": 245455, "abono": 204545},
        {"plan": "CG50B", "mix_pct": 2.5, "cuota1": 272727, "cuota2": 109091, "porta_plus": 327273, "abono": 272727},
        {"plan": "C100X", "mix_pct": 0.5, "cuota1": 272727, "cuota2": 136364, "porta_plus": 409091, "abono": 340909},
    ],
    "porta_pct": 45.0,              # % de activaciones con portabilidad numérica
    # ---- cuota 2 y legajos ----
    "cuota2_mes": 3,
    "legajo_incompleto_pct": 5.0,   # cobra cuota 2 al 50% y descuento de media cuota 1
    "legajo_no_presentado_pct": 3.0,  # descuento de la cuota 1 completa
    # ---- residual ----
    "residual_pct": 14.5,           # sobre el abono ACREDITADO
    "pct_abono_acreditado": 40.0,   # abono acreditado ÷ abono del plan (real: 68.181/170.455)
    "residual_meses": 12,
    # ---- bonos (escalas editables) ----
    "escala_productividad": [
        {"desde_pct": 110, "monto": 105000}, {"desde_pct": 105, "monto": 100000},
        {"desde_pct": 100, "monto": 95000}, {"desde_pct": 95, "monto": 50000},
        {"desde_pct": 90, "monto": 40000},
    ],
    "recalculo_productividad_mes": 6,
    "escala_efectividad": [
        {"desde_pct": 85, "monto": 50000}, {"desde_pct": 82, "monto": 45000},
        {"desde_pct": 80, "monto": 35000},
    ],
    # ---- zafra y chargeback ----
    "zafra_pct": list(ZAFRA_DEFAULT),
    "chargeback_meses": 6,
    "pct_caidas_penalizables": 100.0,   # caídas dentro del chargeback que Claro descuenta
    "recupero_pct": 25.0,               # parte de los descuentos que se recupera por reconexión
    "clawback_incluye_residual": True,  # suspensión penalizable = cuota 1 + 1 residual (214.431)
}


def _escala(escala: list[dict], valor_pct: float) -> tuple[float, dict | None]:
    """Monto de la escala para un % (el escalón más alto cuyo 'desde' se alcanza)."""
    for e in sorted(escala, key=lambda x: -float(x["desde_pct"])):
        if valor_pct >= float(e["desde_pct"]):
            return float(e["monto"]), e
    return 0.0, None


def parametros_con_defaults(overrides: dict | None) -> dict:
    p = copy.deepcopy(PARAMETROS_DEFAULT)
    for k, v in (overrides or {}).items():
        if v is not None and k in p:
            p[k] = v
    return p


def simular_facturacion(params: dict | None = None) -> dict[str, Any]:
    p = parametros_con_defaults(params)
    ventas = max(float(p["ventas"] or 0), 0)
    efect = max(float(p["efectividad_pct"] or 0), 0)
    act = ventas * efect / 100.0
    act_a = act * max(float(p["pct_estado_a"] or 0), 0) / 100.0
    objetivo = max(float(p["objetivo_co"] or 0), 1)
    cumplimiento = act_a / objetivo * 100.0
    porta = min(max(float(p["porta_pct"] or 0), 0), 100) / 100.0

    # ---- valores ponderados por mix ----
    planes = [pl for pl in p["planes"] if float(pl.get("mix_pct") or 0) > 0]
    mix_total = sum(float(pl["mix_pct"]) for pl in planes) or 1.0
    def w(key: str) -> float:
        return sum(float(pl.get(key) or 0) * float(pl["mix_pct"]) / mix_total for pl in planes)
    cuota1_w, cuota2_w, porta_w, abono_w = w("cuota1"), w("cuota2"), w("porta_plus"), w("abono")
    residual_linea = abono_w * float(p["pct_abono_acreditado"]) / 100.0 * float(p["residual_pct"]) / 100.0

    monto_prod, esc_prod = _escala(p["escala_productividad"], cumplimiento)
    monto_efect, esc_efect = _escala(p["escala_efectividad"], efect)

    # ---- MES 0: facturación del mes ----
    mes0 = {
        "activaciones_cuota1": act * cuota1_w,
        "portabilidad": act * porta * porta_w,
        "bono_productividad": act_a * monto_prod,
        "bono_efectividad": act * monto_efect,
    }
    bruto_mes0 = sum(mes0.values())

    # ---- MESES 1..12: residual, cuota 2, clawbacks, recálculos ----
    z = [min(max(float(v), 0), 100) / 100.0 for v in p["zafra_pct"]]
    while len(z) < 13:
        z.append(z[-1] if z else 0.0)
    chb = int(p["chargeback_meses"])
    pen = min(max(float(p["pct_caidas_penalizables"]), 0), 100) / 100.0
    recupero = min(max(float(p["recupero_pct"]), 0), 100) / 100.0
    leg_inc = float(p["legajo_incompleto_pct"]) / 100.0
    leg_np = float(p["legajo_no_presentado_pct"]) / 100.0
    clawback_linea_base = cuota1_w + (residual_linea if p["clawback_incluye_residual"] else 0) + porta * porta_w

    meses = [{"mes": 0, "residual": 0.0, "cuota2": 0.0, "legajos": 0.0, "clawbacks": 0.0,
              "clawback_bonos": 0.0, "recalculo_productividad": 0.0, "neto_mes": bruto_mes0,
              "acumulado": bruto_mes0, "lineas_activas": act * z[0], "caidas": 0.0}]
    acumulado = bruto_mes0
    for k in range(1, 13):
        row = {"mes": k, "residual": 0.0, "cuota2": 0.0, "legajos": 0.0, "clawbacks": 0.0,
               "clawback_bonos": 0.0, "recalculo_productividad": 0.0, "caidas": 0.0}
        if k <= int(p["residual_meses"]):
            row["residual"] = act * z[k] * residual_linea
        if k == 1:
            row["legajos"] = -act * (leg_np * cuota1_w + leg_inc * cuota1_w / 2)
        if k <= chb:
            caidas = act * max(0.0, z[k - 1] - z[k]) * pen
            row["caidas"] = caidas
            row["clawbacks"] = -caidas * clawback_linea_base * (1 - recupero)
            row["clawback_bonos"] = -caidas * monto_efect * (1 - recupero)
        if k == int(p["cuota2_mes"]):
            row["cuota2"] = act * z[k] * (cuota2_w * (1 - leg_inc) + cuota2_w / 2 * leg_inc)
        if k == int(p["recalculo_productividad_mes"]):
            row["recalculo_productividad"] = -act_a * monto_prod * (1 - z[k])
        row["neto_mes"] = (row["residual"] + row["cuota2"] + row["legajos"] + row["clawbacks"]
                           + row["clawback_bonos"] + row["recalculo_productividad"])
        acumulado += row["neto_mes"]
        row["acumulado"] = acumulado
        row["lineas_activas"] = act * z[k]
        meses.append(row)

    neto_6 = meses[min(6, 12)]["acumulado"]
    neto_12 = meses[12]["acumulado"]

    # ---- peso de los bonos sobre la facturación neta ----
    bonos_mes0 = mes0["bono_productividad"] + mes0["bono_efectividad"]
    bonos_devueltos_6 = sum(m["clawback_bonos"] + m["recalculo_productividad"] for m in meses[1:7])
    bonos_netos_6 = bonos_mes0 + bonos_devueltos_6
    sin_bonos_mes0 = bruto_mes0 - bonos_mes0
    sin_bonos_6 = neto_6 - bonos_netos_6

    # Distancia al acantilado: siguiente escalón y margen sobre el actual (en activaciones).
    def _distancias(escala: list[dict], valor_pct: float, base: float, unidad: str) -> dict:
        ordenada = sorted(escala, key=lambda x: float(x["desde_pct"]))
        actual = [e for e in ordenada if valor_pct >= float(e["desde_pct"])]
        siguiente = [e for e in ordenada if valor_pct < float(e["desde_pct"])]
        out: dict[str, Any] = {"valor_pct": round(valor_pct, 2), "unidad": unidad}
        if actual:
            e = actual[-1]
            out["escalon_actual"] = e
            out["margen_pct"] = round(valor_pct - float(e["desde_pct"]), 2)
            out["margen_unidades"] = int((valor_pct - float(e["desde_pct"])) / 100.0 * base)
        else:
            out["escalon_actual"] = None
        if siguiente:
            e = siguiente[0]
            out["siguiente_escalon"] = e
            out["faltan_pct"] = round(float(e["desde_pct"]) - valor_pct, 2)
            out["faltan_unidades"] = int(-(-(float(e["desde_pct"]) - valor_pct) / 100.0 * base // 1))
        return out

    dist_prod = _distancias(p["escala_productividad"], cumplimiento, objetivo, "activaciones")
    dist_efect = _distancias(p["escala_efectividad"], efect, ventas, "activaciones")

    # ---- conclusión ejecutiva ----
    def gs(v: float) -> str:
        return f"Gs {v:,.0f}".replace(",", ".")
    partes = [
        f"Con {ventas:,.0f} ventas y {efect:.1f}% de efectividad se activan {act:,.0f} líneas. "
        f"Facturación del mes: {gs(bruto_mes0)}.".replace(",", "."),
        f"A los 6 meses (fin del chargeback) de esa facturación quedan {gs(neto_6)} — el {neto_6 / bruto_mes0 * 100 if bruto_mes0 else 0:.0f}% — "
        f"y a los 12 meses, sumando el residual completo, {gs(neto_12)} ({neto_12 / bruto_mes0 * 100 if bruto_mes0 else 0:.0f}%).",
        f"Los bonos pesan {bonos_mes0 / bruto_mes0 * 100 if bruto_mes0 else 0:.0f}% de la facturación del mes y "
        f"{bonos_netos_6 / neto_6 * 100 if neto_6 else 0:.0f}% de lo que queda a 6 meses: sin bonos el mes sería "
        f"{gs(sin_bonos_mes0)}.",
    ]
    if esc_prod is None:
        partes.append(f"ALERTA: el cumplimiento del objetivo CO es {cumplimiento:.1f}% — por debajo de la escala mínima, "
                      "el bono productividad liquida 0.")
    elif dist_prod.get("siguiente_escalon"):
        partes.append(f"Bono productividad: escalón {esc_prod['desde_pct']}% ({gs(monto_prod)}/línea); "
                      f"faltan {dist_prod['faltan_unidades']} activaciones para el escalón {dist_prod['siguiente_escalon']['desde_pct']}% "
                      f"({gs(float(dist_prod['siguiente_escalon']['monto']))}/línea) y hay {dist_prod['margen_unidades']} de margen antes de caer al escalón inferior.")
    if esc_efect is None:
        partes.append(f"ALERTA: efectividad {efect:.1f}% por debajo del 80% — el bono efectividad liquida 0.")
    conclusion = " ".join(partes)

    recomendaciones: list[dict] = []
    if dist_prod.get("siguiente_escalon") and dist_prod["faltan_unidades"] <= max(30, act * 0.03):
        e = dist_prod["siguiente_escalon"]
        ganancia = act_a * (float(e["monto"]) - monto_prod)
        recomendaciones.append({"severidad": "alert", "titulo": f"A {dist_prod['faltan_unidades']} activaciones del escalón {e['desde_pct']}%",
                                "detalle": f"Sumar {dist_prod['faltan_unidades']} activaciones netas vale {gs(ganancia)} adicionales de bono productividad este mes (todas las líneas pasan a {gs(float(e['monto']))})."})
    if esc_prod is not None and dist_prod.get("margen_unidades", 0) <= max(30, act * 0.03):
        inferior = [x for x in sorted(p["escala_productividad"], key=lambda x: -float(x["desde_pct"])) if float(x["desde_pct"]) < float(esc_prod["desde_pct"])]
        perdida = act_a * (monto_prod - (float(inferior[0]["monto"]) if inferior else 0))
        recomendaciones.append({"severidad": "warning", "titulo": f"Acantilado del bono: solo {dist_prod['margen_unidades']} activaciones de margen",
                                "detalle": f"Si el mes cierra {dist_prod['margen_unidades'] + 1} activaciones abajo, el bono productividad cae a "
                                           f"{gs(float(inferior[0]['monto'])) if inferior else 'Gs 0'}/línea: {gs(perdida)} menos de facturación."})
    caida_1 = 1 - z[1]
    if caida_1 > 0.12:
        valor_pt = act * 0.01 * clawback_linea_base * (1 - recupero)
        recomendaciones.append({"severidad": "alert", "titulo": f"La primera factura se lleva el {caida_1 * 100:.0f}% de las líneas",
                                "detalle": f"Cada punto de retención en el mes 1 vale {gs(valor_pt)} de clawbacks evitados. La palanca: calidad de venta y cobranza de la primera factura (P9-735)."})
    exp_porta = act * porta * porta_w * (1 - z[chb]) * pen * (1 - recupero)
    recomendaciones.append({"severidad": "info", "titulo": f"Portabilidad: {gs(mes0['portabilidad'])} en el mes, {gs(exp_porta)} vuelven en chargeback",
                            "detalle": f"Con {porta * 100:.0f}% de portación, el plus de portabilidad es el componente con mayor exposición al chargeback: "
                                       f"se devuelve el de cada línea que cae antes del mes {chb}."})
    recomendaciones.append({"severidad": "info", "titulo": f"Residual: {gs(sum(m['residual'] for m in meses))} en 12 meses",
                            "detalle": f"Cada línea activa deja {gs(residual_linea)}/mes durante {int(p['residual_meses'])} meses; subir la zafra del mes 6 un punto vale {gs(act * 0.01 * residual_linea * 6)} de residual futuro."})

    return {
        "parametros": p,
        "derivados": {
            "activaciones": round(act), "activaciones_estado_a": round(act_a),
            "cumplimiento_pct": round(cumplimiento, 2), "monto_bono_productividad": monto_prod,
            "escalon_productividad": esc_prod, "monto_bono_efectividad": monto_efect, "escalon_efectividad": esc_efect,
            "cuota1_ponderada": round(cuota1_w), "cuota2_ponderada": round(cuota2_w),
            "porta_plus_ponderado": round(porta_w), "residual_por_linea": round(residual_linea),
            "clawback_por_linea": round(clawback_linea_base),
        },
        "mes0": {k: round(v) for k, v in mes0.items()},
        "bruto_mes0": round(bruto_mes0),
        "neto_6": round(neto_6), "neto_12": round(neto_12),
        "pct_retenido_6": round(neto_6 / bruto_mes0 * 100, 1) if bruto_mes0 else 0.0,
        "pct_retenido_12": round(neto_12 / bruto_mes0 * 100, 1) if bruto_mes0 else 0.0,
        "meses": [{k: (round(v) if isinstance(v, float) else v) for k, v in m.items()} for m in meses],
        "bonos": {
            "mes0": round(bonos_mes0),
            "peso_mes0_pct": round(bonos_mes0 / bruto_mes0 * 100, 1) if bruto_mes0 else 0.0,
            "devueltos_6": round(bonos_devueltos_6),
            "netos_6": round(bonos_netos_6),
            "peso_neto_6_pct": round(bonos_netos_6 / neto_6 * 100, 1) if neto_6 else 0.0,
            "sin_bonos_mes0": round(sin_bonos_mes0),
            "sin_bonos_6": round(sin_bonos_6),
            "distancia_productividad": dist_prod,
            "distancia_efectividad": dist_efect,
        },
        "conclusion": conclusion,
        "recomendaciones": recomendaciones,
    }
