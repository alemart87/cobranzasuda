"""Simulador de ventas (gerencial) — proyección de dotación y base de datos.

Cadena del modelo (tasas históricas reales, ajustables por el usuario):

  Meta de prima → pólizas (÷ ticket) → contactos (÷ conversión)
               → llamadas (÷ contactabilidad) → asesores (÷ llamadas/asesor/día × días)
               → registros de base (÷ intentos de marcación por registro)

También en sentido inverso: con N asesores, cuánta prima se puede proyectar.
La prima efectiva descuenta la tasa histórica de anulación.
"""
from __future__ import annotations

import math
from typing import Any, Optional


def simular(params: dict[str, Any], meta_prima: Optional[float] = None,
            asesores: Optional[float] = None) -> dict[str, Any]:
    """`params` (todas > 0 salvo anulación):
      ticket_promedio, conversion_pct, contactabilidad_pct, llamadas_asesor_dia,
      dias_habiles, intentos_por_registro, tasa_anulacion_pct (0-100).
    Pasar `meta_prima` (Gs) O `asesores` (dotación disponible)."""
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

    return {"error": "Indicá meta_prima (Gs) o asesores (dotación)."}


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
