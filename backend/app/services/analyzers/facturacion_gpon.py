"""Negocio GPON (fibra + TV) de Claro — modelo de liquidación y proyección.

Calibrado fila por fila con las liquidaciones GPON 385–389 (entidad 300383, ene–may 2026,
1.100 activaciones, 7.927 filas). Estructura distinta a móvil (pospago):

  Cuota 1        al activar, por plan (Fibra 60: 400.000 · Fibra 30: 325.000 · TV: 120.000).
  Cuota 2        entre el día 59 y 91 (mediana 73 → liquidación del mes 2): Fibra 60 280.000,
                 Fibra 30 200.000, TV 120.000. Con legajo incompleto la mitad; en ~6–10% se paga 0.
                 Cobra el 86–97% de las líneas (real: 85% del monto completo de la cohorte).
  Bono fijo      (INCENTIVO PRODUCTIVIDAD 1771) por línea según cumplimiento del objetivo:
                 escala vigente ≥110 130.000 · ≥105 125.000 · ≥100 120.000 · ≥95 40.000.
                 Historial ene–may 2026: 100.000 (ene, mar), 50.000 (abr), 0 (feb, may). Se paga
                 en el 91% de las activaciones.
  Recálculo      (1871) al día 150–180 (mes 6): 100% del bono de las líneas caídas, 23–26% de
                 las líneas de la cohorte.
  Legajos        (documentación faltante, mes 1): 50% de la cuota 1 en el 11% de las líneas.
  Mora           PENALIZACION POR DEUDA / REVERSO: penalidad tabulada por plan cuando el cliente
                 entra en mora, revertida si paga (75% se revierte en la misma liquidación). Lo que
                 queda sin revertir es la pérdida real: 26% de las líneas de una cohorte a los 5–6
                 meses, ~406.000 por línea en mora (Fibra 60: 630.000 / 350.000 / 315.000;
                 Fibra 30: 475.000; TV: 190.000). Primera penalización: p25 día 65, mediana 93,
                 p75 132, máximo 180. Neto por cohorte: 15,6% de lo cobrado.
  Chargeback     180 días exactos. Después del mes 6 no hay más débitos.
  Sin residual, sin plus de portabilidad, sin bono efectividad.

Unidad económica real (cohorte ene-26 a 5 meses): 515.000 por línea = 1,46 × cuota 1.
Reutiliza la estructura de costos del motor móvil (misma función de costos y margen).
"""
from __future__ import annotations

import copy
import math
from typing import Any

from .facturacion_simulador import _costos_y_margen, _escala

PLANES_GPON_DEFAULT = [
    {"nombre": "Fibra 60 (IF60 / BAF7)", "cuota1": 400000, "cuota2": 280000, "penalidad_mora": 520000, "mix_pct": 70.0},
    {"nombre": "Fibra 30 (IF30 / BAF3)", "cuota1": 325000, "cuota2": 200000, "penalidad_mora": 430000, "mix_pct": 18.0},
    {"nombre": "TV (TVP / TVA)", "cuota1": 120000, "cuota2": 120000, "penalidad_mora": 160000, "mix_pct": 12.0},
]

# Curva acumulada de la mora NETA (líneas que quedan penalizadas sin reverso) por mes de
# antigüedad, como % del total final: sale de la distribución de la primera penalización
# (p25 día 65, mediana 93, p75 132, máx 180) → a los 6 meses está el 100%.
MORA_CURVA_DEFAULT = [0.0, 3.0, 22.0, 52.0, 78.0, 95.0, 100.0]

PARAMETROS_GPON_DEFAULT: dict[str, Any] = {
    "negocio": "GPON",
    "ventas": 230,                       # activaciones del mes (real ene–may: 188–239)
    "objetivo": 230,                     # objetivo mensual de líneas para el bono fijo
    "pct_estado_a": 100.0,               # activaciones que cuentan para el objetivo
    "planes": copy.deepcopy(PLANES_GPON_DEFAULT),
    # ---- cuota 2 y legajos ----
    "cuota2_mes": 2,                     # liquidación del mes 2 (día 59–91, mediana 73)
    "cuota2_pct_lineas": 90.0,           # líneas que cobran cuota 2 (real 86–97%)
    "cuota2_pct_completa": 82.0,         # de las que cobran, % con importe completo; el resto cobra la mitad
    "legajo_pct": 11.0,                  # líneas con documentación faltante (mes 1)
    "legajo_pct_cuota1": 50.0,           # descuento = % de la cuota 1
    # ---- bono fijo (escala vigente comunicada por Claro) ----
    "escala_bono": [
        {"desde_pct": 110, "monto": 130000}, {"desde_pct": 105, "monto": 125000},
        {"desde_pct": 100, "monto": 120000}, {"desde_pct": 95, "monto": 40000},
    ],
    "pct_bono_cobrado": 91.0,            # activaciones que cobran el bono (real 218/239, 215/238)
    "recalculo_mes": 6,
    "pct_recalculo": 25.0,               # líneas caídas al día 180 que devuelven el 100% del bono (real 23–26%)
    "bonos_activos": True,
    "bono_adicional": 0,
    # ---- mora (penalización por deuda neta de reversos) ----
    "mora_pct_lineas": 26.0,             # líneas de la cohorte que quedan con deuda neta a los 6 meses
    "mora_curva_pct": list(MORA_CURVA_DEFAULT),
    "mora_penalidad_pct": 100.0,         # % de la penalidad tabulada que se pierde (100 = tabla completa)
    "chargeback_meses": 6,
    "otros_pct": 0.5,                    # reversos de activación y cancelaciones (0,5% de las activaciones × cuota 1)
    "ajuste_comisiones_pct": 0.0,        # renegociación de cuota 1 y 2 con Claro
    # ---- costos: estructura GPON (mismas reglas que móvil; logística de SIM no aplica) ----
    "costos": {
        "ventas_por_vendedor": 20, "supervisor_cada_vendedores": 12, "backoffice_cada_ventas": 120,
        "coordinadores": 0, "controllers": 1,
        "salario_hora": 14635, "horas_dia": 7, "dias_mes": 23,
        "comision_por_venta": 102000, "plus_por_venta": 32000,
        "supervisor_salario": 4180000, "supervisor_premio": 1500000,
        "coordinador_salario": 6000000, "coordinador_premio": 2500000,
        "backoffice_salario": 3044000, "controller_salario": 3600000, "controller_premio": 750000,
        "subgerencia_salario": 0, "ips_pct": 16.5, "aguinaldo": True,
        "logistica_central": 0, "logistica_interior": 0, "logistica_interior_pct": 0.0, "logistica_premios": 0,
        "operativo_por_venta": 12500,
    },
}


def parametros_gpon(overrides: dict | None) -> dict:
    p = copy.deepcopy(PARAMETROS_GPON_DEFAULT)
    for k, v in (overrides or {}).items():
        if v is None or k not in p:
            if k == "_sin_breakeven":
                p[k] = v
            continue
        if k == "costos" and isinstance(v, dict):
            p["costos"] = {**p["costos"], **{ck: cv for ck, cv in v.items() if cv is not None}}
        else:
            p[k] = v
    return p


def _pct(v: Any, default: float = 0.0) -> float:
    try:
        return min(max(float(v), 0.0), 100.0) / 100.0
    except (TypeError, ValueError):
        return default / 100.0


def simular_gpon(params: dict | None = None) -> dict[str, Any]:
    """UNA cohorte GPON: facturación del mes 0 y flujos de los meses 1..12."""
    p = parametros_gpon(params)
    act = max(float(p["ventas"] or 0), 0)
    act_a = act * _pct(p["pct_estado_a"], 100)
    objetivo = max(float(p["objetivo"] or 0), 1)
    cumplimiento = act_a / objetivo * 100.0
    planes = [pl for pl in p["planes"] if float(pl.get("mix_pct") or 0) > 0]
    mix_total = sum(float(pl["mix_pct"]) for pl in planes) or 1.0
    w = lambda key: sum(float(pl.get(key) or 0) * float(pl["mix_pct"]) / mix_total for pl in planes)  # noqa: E731
    ajuste = 1 + float(p.get("ajuste_comisiones_pct") or 0) / 100.0
    cuota1_w, cuota2_w, pen_w = w("cuota1") * ajuste, w("cuota2") * ajuste, w("penalidad_mora")

    bonos_activos = bool(p.get("bonos_activos", True))
    monto_bono, esc = _escala(p["escala_bono"], cumplimiento) if bonos_activos else (0.0, None)
    pct_bono = _pct(p["pct_bono_cobrado"], 91)

    mes0 = {
        "activaciones_cuota1": act * cuota1_w,
        "bono_fijo": act_a * pct_bono * monto_bono,
        "bono_adicional": max(float(p.get("bono_adicional") or 0), 0),
    }
    bruto_mes0 = sum(mes0.values())

    curva = [_pct(x) for x in (p.get("mora_curva_pct") or MORA_CURVA_DEFAULT)]
    while len(curva) < 13:
        curva.append(curva[-1] if curva else 1.0)
    chb = int(p["chargeback_meses"])
    mora_lineas = act * _pct(p["mora_pct_lineas"], 26)
    mora_por_linea = pen_w * _pct(p["mora_penalidad_pct"], 100)
    c2_lineas = _pct(p["cuota2_pct_lineas"], 90)
    c2_completa = _pct(p["cuota2_pct_completa"], 82)
    cuota2_factor = c2_lineas * (c2_completa + (1 - c2_completa) * 0.5)

    meses = [{"mes": 0, "cuota2": 0.0, "legajos": 0.0, "mora": 0.0, "recalculo": 0.0, "otros": 0.0,
              "neto_mes": bruto_mes0, "acumulado": bruto_mes0, "lineas_en_mora": 0.0}]
    acum = bruto_mes0
    for k in range(1, 13):
        row = {"mes": k, "cuota2": 0.0, "legajos": 0.0, "mora": 0.0, "recalculo": 0.0, "otros": 0.0}
        if k == 1:
            row["legajos"] = -act * _pct(p["legajo_pct"], 11) * cuota1_w * _pct(p["legajo_pct_cuota1"], 50)
            row["otros"] = -act * _pct(p["otros_pct"], 0.5) * cuota1_w
        if k == int(p["cuota2_mes"]):
            row["cuota2"] = act * cuota2_factor * cuota2_w
        if k <= chb:
            nuevas = mora_lineas * max(0.0, curva[k] - curva[k - 1])
            row["mora"] = -nuevas * mora_por_linea
        if k == int(p["recalculo_mes"]) and bonos_activos:
            row["recalculo"] = -act_a * pct_bono * monto_bono * _pct(p["pct_recalculo"], 25)
        row["lineas_en_mora"] = mora_lineas * curva[min(k, len(curva) - 1)]
        row["neto_mes"] = row["cuota2"] + row["legajos"] + row["mora"] + row["recalculo"] + row["otros"]
        acum += row["neto_mes"]
        row["acumulado"] = acum
        meses.append(row)
    for m in meses:
        for k2 in ("cuota2", "legajos", "mora", "recalculo", "otros", "neto_mes", "acumulado", "lineas_en_mora"):
            m[k2] = round(m[k2])
    neto_6 = sum(m["neto_mes"] for m in meses[:7])
    neto_12 = sum(m["neto_mes"] for m in meses[:13])
    costos, margen = _costos_y_margen(p["costos"], act, mes0, bruto_mes0, neto_6, neto_12)
    dev_12 = sum(m["legajos"] + m["mora"] + m["recalculo"] + m["otros"] for m in meses[1:])
    cob_12 = sum(m["cuota2"] for m in meses[1:])
    por_linea = {
        "cuota1": round(cuota1_w), "cuota2_esperada": round(cuota2_factor * cuota2_w), "bono": round(pct_bono * monto_bono),
        "legajos": round(meses[1]["legajos"] / act) if act else 0, "mora": round(sum(m["mora"] for m in meses) / act) if act else 0,
        "recalculo": round(sum(m["recalculo"] for m in meses) / act) if act else 0,
        "neto_12": round(neto_12 / act) if act else 0, "costo": costos["costo_por_venta"],
        "margen": round((neto_12 - costos["total"]) / act) if act else 0,
        "multiplo_cuota1": round(neto_12 / act / cuota1_w, 2) if act and cuota1_w else 0,
    }
    return {
        "negocio": "GPON",
        "parametros": p,
        "derivados": {"activaciones": round(act), "cumplimiento_pct": round(cumplimiento, 2), "monto_bono": monto_bono,
                      "escalon_bono": esc["desde_pct"] if esc else None, "cuota1_ponderada": round(cuota1_w),
                      "cuota2_ponderada": round(cuota2_w), "penalidad_ponderada": round(pen_w),
                      "lineas_en_mora_final": round(mora_lineas), "mora_por_linea": round(mora_por_linea)},
        "mes0": {k: round(v) for k, v in mes0.items()},
        "bruto_mes0": round(bruto_mes0),
        "meses": meses,
        "neto_6": round(neto_6), "neto_12": round(neto_12),
        "pct_retenido_6": round(neto_6 / bruto_mes0 * 100, 1) if bruto_mes0 else 0.0,
        "pct_retenido_12": round(neto_12 / bruto_mes0 * 100, 1) if bruto_mes0 else 0.0,
        "costos": costos, "margen": margen, "por_linea": por_linea,
        "cierre": {"devoluciones_12": round(dev_12), "cobros_12": round(cob_12), "ultimo_mes_caidas": max(chb, int(p["recalculo_mes"])),
                   "resultado_final": margen["meses12"], "gana": margen["meses12"] >= 0},
    }


_FLUJOS = ("cuota2", "legajos", "mora", "recalculo", "otros")


def simular_gpon_anual(params: dict | None, ventas_por_mes: list[float], horizonte: int = 12,
                       bonos_adicionales_por_mes: list[float] | None = None, nombres_meses: list[str] | None = None) -> dict[str, Any]:
    """Proyección ANUAL GPON, igual que pospago: el mes 1 fija la estructura (headcount) y cada
    mes se superponen los flujos de todas las cohortes anteriores (cuota 2, legajos, mora,
    recálculo). Aditiva al guaraní. Después del horizonte queda la cola (cuota 2 por cobrar,
    mora y recálculo por devolver)."""
    base = parametros_gpon(params)
    h = int(horizonte) if int(horizonte) in (12, 18, 24) else 12
    ventas = [max(float(v or 0), 0) for v in (ventas_por_mes or [])][:h]
    while len(ventas) < h:
        ventas.append(ventas[-1] if ventas else float(base["ventas"]))
    bonos_ad = [max(float(x or 0), 0) for x in (bonos_adicionales_por_mes or [])][:h]
    while len(bonos_ad) < h:
        bonos_ad.append(0.0)
    nombres = list(nombres_meses or [])[:h]
    while len(nombres) < h:
        nombres.append("")

    cohortes = [simular_gpon({**base, "ventas": ventas[t], "bono_adicional": bonos_ad[t]}) for t in range(h)]
    headcount = cohortes[0]["costos"]["headcount"]
    filas: list[dict] = []
    acum = 0
    for t in range(h):
        c = cohortes[t]
        fila = {"mes": t + 1, "nombre": nombres[t].strip() or f"Mes {t + 1}", "ventas": round(ventas[t]),
                "cumplimiento_pct": c["derivados"]["cumplimiento_pct"], "monto_bono": c["derivados"]["monto_bono"],
                "activaciones_cuota1": c["mes0"]["activaciones_cuota1"], "bono_fijo": c["mes0"]["bono_fijo"],
                "bono_adicional": c["mes0"]["bono_adicional"], "facturacion_bruta": c["bruto_mes0"]}
        for f in _FLUJOS:
            fila[f] = sum(cohortes[s]["meses"][t - s][f] for s in range(t) if t - s < len(cohortes[s]["meses"]))
        fila["ajustes"] = sum(fila[f] for f in _FLUJOS)
        fila["ingreso_neto"] = fila["facturacion_bruta"] + fila["ajustes"]
        cst, _ = _costos_y_margen(c["parametros"]["costos"], ventas[t], c["mes0"], c["bruto_mes0"], c["neto_6"], c["neto_12"], headcount=headcount)
        fila["costo_total"] = cst["total"]
        fila["costos"] = cst
        fila["resultado"] = fila["ingreso_neto"] - fila["costo_total"]
        fila["margen_pct"] = round(fila["resultado"] / fila["ingreso_neto"] * 100, 1) if fila["ingreso_neto"] else 0.0
        fila["acumulado_anterior"] = acum
        acum += fila["resultado"]
        fila["acumulado"] = acum
        fila["ola_devoluciones"] = fila["legajos"] + fila["mora"] + fila["recalculo"] + fila["otros"]
        fila["lineas_en_mora"] = round(sum(cohortes[s]["meses"][t - s]["lineas_en_mora"] for s in range(t + 1) if t - s < len(cohortes[s]["meses"])))
        filas.append(fila)

    tot = lambda k: sum(f[k] for f in filas)  # noqa: E731
    cola = {f: 0 for f in _FLUJOS}
    for s in range(h):
        for k in range(h - s, 13):
            if k < len(cohortes[s]["meses"]):
                for f in _FLUJOS:
                    cola[f] += cohortes[s]["meses"][k][f]
    cola_cobros = cola["cuota2"]
    cola_dev = cola["legajos"] + cola["mora"] + cola["recalculo"] + cola["otros"]
    resultado = tot("resultado")
    anual = {
        "ventas": round(sum(ventas)), "facturacion_bruta": tot("facturacion_bruta"), "ajustes": tot("ajustes"),
        "ingreso_neto": tot("ingreso_neto"), "costos": tot("costo_total"), "resultado": resultado,
        "margen_pct": round(resultado / tot("ingreso_neto") * 100, 1) if tot("ingreso_neto") else 0.0,
        "bonos": tot("bono_fijo"), "bonos_adicionales": tot("bono_adicional"),
        "cuota2": tot("cuota2"), "legajos": tot("legajos"), "mora": tot("mora"), "recalculo": tot("recalculo"), "otros": tot("otros"),
        "costos_fijos_mes": filas[0]["costo_total"] - filas[0]["costos"]["rrhh"]["operadores_comisiones"] - filas[0]["costos"]["plus_vendedores"] - filas[0]["costos"]["operativos"] - filas[0]["costos"]["logistica_entregas"],
        "horizonte": h, "meses_negativos": sum(1 for f in filas if f["resultado"] < 0),
        "mejor_mes": max(filas, key=lambda f: f["resultado"])["mes"], "peor_mes": min(filas, key=lambda f: f["resultado"])["mes"],
        "cola_post": {"cobros": round(cola_cobros), "devoluciones": round(cola_dev), "total": round(cola_cobros + cola_dev),
                      "ultimo_mes_caidas": h + max(int(base["chargeback_meses"]), int(base["recalculo_mes"])),
                      "ultimo_mes_cobros": h + int(base["cuota2_mes"])},
        "resultado_con_cola": round(resultado + cola_cobros + cola_dev),
        "regimen": {"resultado_mes": filas[-1]["resultado"], "margen_pct": filas[-1]["margen_pct"],
                    "ingreso_neto_mes": filas[-1]["ingreso_neto"], "ola_devoluciones_mes": filas[-1]["ola_devoluciones"]},
    }
    gs = lambda v: "Gs " + f"{round(v):,}".replace(",", ".")  # noqa: E731
    n = lambda v: f"{round(v):,}".replace(",", ".")  # noqa: E731
    conclusion = (f"{h} meses GPON con estructura fija del mes 1 ({headcount['vendedores']} vendedores, {headcount['supervisores']} supervisores, "
                  f"{headcount['backoffice']} backoffice) y objetivo {n(float(base['objetivo']))} líneas. Activaciones del período: {n(anual['ventas'])}. "
                  f"Facturación bruta {gs(anual['facturacion_bruta'])}; con cuota 2, legajos, mora y recálculo el ingreso neto es {gs(anual['ingreso_neto'])}. "
                  f"Costos {gs(anual['costos'])}. Resultado {gs(resultado)} ({anual['margen_pct']}%). "
                  f"Cola después del mes {h}: {gs(cola_cobros)} de cuota 2 por cobrar y {gs(abs(cola_dev))} por devolver (mora y recálculo hasta el mes {anual['cola_post']['ultimo_mes_caidas']}). "
                  f"Con la cola el negocio {'GANA' if anual['resultado_con_cola'] >= 0 else 'PIERDE'} {gs(abs(anual['resultado_con_cola']))}.")
    return {"negocio": "GPON", "parametros": base, "horizonte": h, "ventas_por_mes": ventas, "nombres_meses": nombres,
            "headcount": headcount, "meses": filas, "anual": anual, "cohorte_mes1": cohortes[0], "conclusion": conclusion}
