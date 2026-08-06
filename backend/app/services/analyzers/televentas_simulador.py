"""Simulador de ventas (gerencial) — proyección de dotación y base de datos.

Cadena del modelo (tasas históricas reales, ajustables por el usuario):

  Meta de prima → pólizas (÷ ticket) → contactos (÷ conversión)
               → llamadas (÷ contactabilidad) → asesores (÷ llamadas/asesor/día × días)
               → registros de base (÷ intentos de marcación por registro)

También en sentido inverso: con N asesores, cuánta prima se puede proyectar; y
desde el insumo: con N registros de base disponibles, cuál es la capacidad total
de producción (llamadas posibles → contactos → pólizas → prima) y cuánta dotación
hace falta para trabajarla en el mes.
La prima efectiva descuenta la tasa histórica de anulación.
"""
from __future__ import annotations

import math
from typing import Any, Optional


def simular(params: dict[str, Any], meta_prima: Optional[float] = None,
            asesores: Optional[float] = None,
            registros: Optional[float] = None) -> dict[str, Any]:
    """`params` (todas > 0 salvo anulación):
      ticket_promedio, conversion_pct, contactabilidad_pct, llamadas_asesor_dia,
      dias_habiles, intentos_por_registro, tasa_anulacion_pct (0-100).
    Pasar `meta_prima` (Gs), `asesores` (dotación) O `registros` (base disponible)."""
    ticket = max(float(params.get("ticket_promedio") or 0), 1.0)
    conv = max(float(params.get("conversion_pct") or 0), 0.01) / 100.0
    contact = max(float(params.get("contactabilidad_pct") or 0), 0.01) / 100.0
    lpd = max(float(params.get("llamadas_asesor_dia") or 0), 1.0)
    dias = max(float(params.get("dias_habiles") or 0), 1.0)
    intentos = max(float(params.get("intentos_por_registro") or 1), 0.1)
    anul = min(max(float(params.get("tasa_anulacion_pct") or 0), 0.0), 90.0) / 100.0

    cap_llamadas_asesor_mes = lpd * dias

    if meta_prima is not None:
        # La meta es prima NETA deseada → hay que emitir más para cubrir anulaciones.
        prima_emitir = float(meta_prima) / (1.0 - anul) if anul < 1 else float(meta_prima)
        polizas = prima_emitir / ticket
        contactos = polizas / conv
        llamadas = contactos / contact
        asesores_nec = llamadas / cap_llamadas_asesor_mes
        registros = llamadas / intentos
        return {
            "modo": "meta",
            "meta_prima_neta": round(float(meta_prima)),
            "prima_a_emitir": round(prima_emitir),
            "polizas_necesarias": math.ceil(polizas),
            "contactos_necesarios": math.ceil(contactos),
            "llamadas_necesarias": math.ceil(llamadas),
            "asesores_necesarios": round(asesores_nec, 1),
            "asesores_necesarios_redondeo": math.ceil(asesores_nec),
            "registros_base_necesarios": math.ceil(registros),
            "llamadas_por_asesor_mes": round(cap_llamadas_asesor_mes),
            "parametros": params,
        }

    if asesores is not None:
        llamadas = float(asesores) * cap_llamadas_asesor_mes
        contactos = llamadas * contact
        polizas = contactos * conv
        prima_emitida = polizas * ticket
        prima_neta = prima_emitida * (1.0 - anul)
        registros = llamadas / intentos
        return {
            "modo": "dotacion",
            "asesores": float(asesores),
            "llamadas_proyectadas": round(llamadas),
            "contactos_proyectados": round(contactos),
            "polizas_proyectadas": round(polizas, 1),
            "prima_emitida_proyectada": round(prima_emitida),
            "prima_neta_proyectada": round(prima_neta),
            "registros_base_necesarios": math.ceil(registros),
            "llamadas_por_asesor_mes": round(cap_llamadas_asesor_mes),
            "parametros": params,
        }

    if registros is not None:
        # Capacidad desde el INSUMO: la base disponible limita las llamadas posibles.
        llamadas = float(registros) * intentos
        contactos = llamadas * contact
        polizas = contactos * conv
        prima_emitida = polizas * ticket
        prima_neta = prima_emitida * (1.0 - anul)
        asesores_nec = llamadas / cap_llamadas_asesor_mes
        return {
            "modo": "base",
            "registros_base": round(float(registros)),
            "llamadas_posibles": round(llamadas),
            "contactos_proyectados": round(contactos),
            "polizas_proyectadas": round(polizas, 1),
            "prima_emitida_proyectada": round(prima_emitida),
            "prima_neta_proyectada": round(prima_neta),
            "asesores_para_trabajarla": round(asesores_nec, 1),
            "asesores_para_trabajarla_redondeo": math.ceil(asesores_nec),
            "llamadas_por_asesor_mes": round(cap_llamadas_asesor_mes),
            "parametros": params,
        }

    return {"error": "Indicá meta_prima (Gs), asesores (dotación) o registros (base disponible)."}


def regresion_origen(x: list[float], y: list[float]) -> dict[str, Any]:
    """Regresión lineal por el origen y = β·x (mínimos cuadrados ordinarios).

    Es el modelo correcto para el funnel (0 llamadas → 0 ventas). Devuelve la
    pendiente β, su error estándar, IC 95% (t de Student aproximada), y R².
    Nota: el estimador pooled (Σy/Σx) es la versión ponderada de esta misma
    regresión; acá se reporta la OLS diaria para validar la relación y dar IC.
    """
    n = len(x)
    if n < 5:
        return {"disponible": False, "n": n, "mensaje": "Se necesitan al menos 5 días con datos."}
    sxx = sum(a * a for a in x)
    if sxx <= 0:
        return {"disponible": False, "n": n, "mensaje": "Sin variación en la variable independiente."}
    sxy = sum(a * b for a, b in zip(x, y))
    beta = sxy / sxx
    resid = [yi - beta * xi for xi, yi in zip(x, y)]
    sse = sum(r * r for r in resid)
    df = n - 1
    s2 = sse / df if df > 0 else 0.0
    se = (s2 / sxx) ** 0.5
    ybar = sum(y) / n
    sst = sum((yi - ybar) ** 2 for yi in y)
    r2 = max(0.0, 1 - sse / sst) if sst > 0 else 0.0
    # t crítico 95% aproximado según grados de libertad.
    t = 2.78 if df <= 4 else 2.26 if df <= 9 else 2.09 if df <= 19 else 2.02 if df <= 39 else 1.98
    return {
        "disponible": True, "n": n,
        "pendiente": beta, "se": se,
        "ic95": [max(0.0, beta - t * se), beta + t * se],
        "r2": round(r2, 3),
    }


def regresion_diaria(puntos: list[dict[str, Any]]) -> dict[str, Any]:
    """Regresiones sobre los DÍAS reales de operación (contestadas → pólizas y → prima).

    `puntos`: [{fecha, contestadas, polizas, prima}]. Devuelve las dos regresiones
    (pendiente = conversión marginal y Gs por contacto) con IC 95% y R².
    """
    xs = [float(p.get("contestadas") or 0) for p in puntos]
    y_pol = [float(p.get("polizas") or 0) for p in puntos]
    y_pri = [float(p.get("prima") or 0) for p in puntos]
    rp = regresion_origen(xs, y_pol)
    rg = regresion_origen(xs, y_pri)
    out: dict[str, Any] = {"puntos": puntos, "n_dias": len(puntos)}
    if rp.get("disponible"):
        out["conversion"] = {
            "pct": round(rp["pendiente"] * 100, 2),
            "ic95_pct": [round(rp["ic95"][0] * 100, 2), round(rp["ic95"][1] * 100, 2)],
            "r2": rp["r2"], "n": rp["n"],
        }
    if rg.get("disponible"):
        out["prima_por_contacto"] = {
            "gs": round(rg["pendiente"]),
            "ic95_gs": [round(rg["ic95"][0]), round(rg["ic95"][1])],
            "r2": rg["r2"], "n": rg["n"],
        }
    return out


def escenarios(params: dict[str, Any], meta_prima: float,
               variacion_pct: float = 15.0) -> list[dict[str, Any]]:
    """Sensibilidad: conservador / base / optimista variando la conversión ±variacion_pct%."""
    out = []
    for nombre, factor in (("conservador", 1 - variacion_pct / 100),
                           ("base", 1.0),
                           ("optimista", 1 + variacion_pct / 100)):
        p = dict(params)
        p["conversion_pct"] = float(params.get("conversion_pct") or 0.01) * factor
        r = simular(p, meta_prima=meta_prima)
        out.append({"escenario": nombre, "conversion_pct": round(p["conversion_pct"], 2),
                    "asesores_necesarios": r["asesores_necesarios_redondeo"],
                    "llamadas_necesarias": r["llamadas_necesarias"],
                    "registros_base_necesarios": r["registros_base_necesarios"]})
    return out
