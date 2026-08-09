"""Analizador de Televentas — diagnóstico por método científico.

Estructura del análisis (determinista y auditable):

  1. HIPÓTESIS   — siempre: "la producción del mes alcanza el objetivo".
                   La consulta del usuario se incorpora como parte de la hipótesis.
  2. OBSERVACIÓN — producción real (prima neta) vs objetivo: brecha en Gs y %.
  3. VERIFICACIÓN— cada eslabón del funnel se contrasta contra la referencia
                   (los meses previos seleccionados, pooled): volumen, contacto,
                   conversión, ticket, dotación efectiva, ritmo, anulación, CRM.
  4. DESCOMPOSICIÓN — cuánto aportó cada factor a la variación de producción,
                   con descomposición LMDI (log-mean Divisia, exacta):
                   neta = contestadas × conversión × ticket × (1 − anulación).
  5. CONCLUSIÓN  — causas ordenadas por peso, en lenguaje ejecutivo.
  6. ACCIONES    — recomendaciones ligadas al factor dominante.
"""
from __future__ import annotations

import math
from typing import Any, Optional


def _pct(part: float, whole: float) -> float:
    return round(part / whole * 100, 1) if whole else 0.0


def _lmdi_pesos(neta_act: float, neta_ref: float) -> float:
    """Peso log-mean L(a,b) = (a−b)/ln(a/b); con él, aporte_i = L·ln(f_i/f_i_ref)
    y la suma de aportes reproduce EXACTAMENTE la variación total."""
    if neta_act <= 0 or neta_ref <= 0:
        return 0.0
    if abs(neta_act - neta_ref) < 1e-9:
        return neta_act
    return (neta_act - neta_ref) / math.log(neta_act / neta_ref)


def _factores(g: dict) -> Optional[dict]:
    """Factores multiplicativos del mes: neta = contestadas × conv × ticket × (1−anul)."""
    cont = float(g.get("contestadas") or 0)
    pol = float(g.get("polizas_emitidas") or 0)
    emit = float(g.get("prima_emitida") or 0)
    neta = float(g.get("prima_neta") or 0)
    if not (cont > 0 and pol > 0 and emit > 0 and neta > 0):
        return None
    return {
        "contestadas": cont,
        "conversion": pol / cont,
        "ticket": emit / pol,
        "retencion": neta / emit,  # 1 − tasa de anulación
        "neta": neta,
    }


_FACTOR_LABEL = {
    "contestadas": "Volumen de contactos (llamadas atendidas)",
    "conversion": "Conversión (pólizas por contacto)",
    "ticket": "Ticket promedio (Gs por póliza)",
    "retencion": "Retención (efecto de anulaciones)",
}

_ACCIONES_POR_FACTOR = {
    "contestadas": [
        "Renovar/ampliar las bases de datos: el volumen de contactos cayó y sin registros frescos la contactabilidad seguirá bajando.",
        "Revisar dotación efectiva y ausentismo: menos asesores marcando o menos días operativos reducen el volumen directamente.",
        "Auditar horarios de marcación contra la curva horaria de contacto del reporte de llamadas.",
    ],
    "conversion": [
        "Escuchar llamadas de los operadores con conversión más baja del comparativo e identificar objeciones sin respuesta.",
        "Revisar los motivos de no-venta de la Voz del Cliente en Ventas (CRM) del período y ajustar el argumentario.",
        "Coaching de cierre focalizado: el comparativo por operador muestra en quiénes se concentra la caída.",
        "Verificar la calidad/segmentación de las bases asignadas: una base fría baja la conversión de todo el equipo.",
    ],
    "ticket": [
        "Revisar el mix de productos vendidos (tipos de póliza): un corrimiento a pólizas de menor prima baja el ticket.",
        "Evaluar venta cruzada / upgrade de coberturas en el guion.",
    ],
    "retencion": [
        "Analizar las causas de anulación (arrepentimiento, débito rechazado, datos mal cargados) y montar retención temprana.",
        "Verificar la calidad de la venta: anulaciones tempranas suelen indicar ventas forzadas o mal explicadas.",
    ],
}


def analizar_cientifico(generales: list[dict], objetivo_prima: float,
                        consulta: Optional[str] = None,
                        etiqueta_produccion: str = "prima neta",
                        unidad: str = "mes") -> dict[str, Any]:
    """`generales`: métricas por período (ordenadas cronológicamente; meses del
    comparativo o semanas del reporte semanal). El período ANALIZADO es el último;
    los previos son la referencia. `objetivo_prima`: objetivo de producción (Gs).
    `consulta`: pregunta del usuario, incorporada a la hipótesis."""
    if len(generales) < 2:
        return {"disponible": False,
                "mensaje": f"El analizador necesita al menos 2 {unidad}es con datos."}
    objetivo = float(objetivo_prima or 0)
    if objetivo <= 0:
        return {"disponible": False, "mensaje": "Cargá un objetivo de producción (Gs) mayor a cero."}

    gs = sorted(generales, key=lambda g: g.get("mes", ""))
    actual, previos = gs[-1], gs[:-1]
    mes = actual.get("mes", "")

    # ---------- 1. HIPÓTESIS ----------
    hipotesis = (f"La producción de {mes} ({etiqueta_produccion}) alcanza el objetivo de "
                 f"Gs {objetivo:,.0f}.".replace(",", "."))
    if consulta and consulta.strip():
        hipotesis += f' Consulta incorporada del usuario: "{consulta.strip()}"'

    # ---------- 2. OBSERVACIÓN ----------
    neta = float(actual.get("prima_neta") or 0)
    brecha = neta - objetivo
    alcanzado = neta >= objetivo
    observacion = {
        "mes": mes,
        "prima_neta": round(neta),
        "objetivo": round(objetivo),
        "brecha_gs": round(brecha),
        "brecha_pct": round(brecha / objetivo * 100, 1),
        "alcanzado": alcanzado,
        "cumplimiento_pct": _pct(neta, objetivo),
    }

    # ---------- 3. VERIFICACIÓN de datos (funnel completo vs referencia) ----------
    # Referencia pooled de los meses previos: totales sobre totales.
    ref_cont = sum(float(g.get("contestadas") or 0) for g in previos)
    ref_pol = sum(float(g.get("polizas_emitidas") or 0) for g in previos)
    ref_emit = sum(float(g.get("prima_emitida") or 0) for g in previos)
    ref_neta = sum(float(g.get("prima_neta") or 0) for g in previos)
    ref_llam = sum(float(g.get("total_llamadas") or 0) for g in previos)
    n_prev = len(previos)

    def _prom(key: str) -> float:
        vals = [float(g.get(key) or 0) for g in previos if g.get(key)]
        return sum(vals) / len(vals) if vals else 0.0

    checks_def = [
        ("total_llamadas", "Llamadas realizadas", float(actual.get("total_llamadas") or 0), ref_llam / n_prev, "int"),
        ("contestadas", "Llamadas atendidas (≥34s)", float(actual.get("contestadas") or 0), ref_cont / n_prev, "int"),
        ("contactabilidad", "Contactabilidad %", float(actual.get("contactabilidad") or 0), _pct(ref_cont, ref_llam), "pct"),
        ("conversion_pct", "Conversión %", float(actual.get("conversion_pct") or 0), _pct(ref_pol, ref_cont), "pct"),
        ("ticket_promedio", "Ticket promedio (Gs)", float(actual.get("ticket_promedio") or 0),
         (ref_emit / ref_pol) if ref_pol else 0.0, "gs"),
        ("agentes_efectivos", "Agentes efectivos por día", float(actual.get("agentes_efectivos") or 0), _prom("agentes_efectivos"), "int"),
        ("llamadas_prom_asesor_dia", "Ritmo (llamadas/asesor/día)", float(actual.get("llamadas_prom_asesor_dia") or 0),
         _prom("llamadas_prom_asesor_dia"), "int"),
        ("dias_operativos", "Días operativos", float(actual.get("dias_operativos") or 0), _prom("dias_operativos"), "int"),
        ("anulacion_pct", "Anulación % (prima)", _pct(float(actual.get("prima_emitida") or 0) - neta,
                                                      float(actual.get("prima_emitida") or 0)),
         _pct(ref_emit - ref_neta, ref_emit), "pct"),
    ]
    if actual.get("tiene_crm"):
        checks_def.append(("tasa_contacto_crm", "Tasa de contacto CRM %",
                           float(actual.get("tasa_contacto_crm") or 0), _prom("tasa_contacto_crm"), "pct"))
        checks_def.append(("tasa_aceptacion_crm", "Tasa de aceptación CRM %",
                           float(actual.get("tasa_aceptacion_crm") or 0), _prom("tasa_aceptacion_crm"), "pct"))

    verificaciones = []
    for key, label, act, ref, fmt in checks_def:
        if ref <= 0 and act <= 0:
            continue
        delta_pct = round((act - ref) / ref * 100, 1) if ref else None
        # anulación: subir es malo; el resto: bajar es malo.
        malo = (delta_pct is not None) and ((delta_pct > 15) if key == "anulacion_pct" else (delta_pct < -15))
        atencion = (delta_pct is not None) and not malo and (
            (delta_pct > 5) if key == "anulacion_pct" else (delta_pct < -5))
        verificaciones.append({
            "clave": key, "factor": label, "formato": fmt,
            "actual": round(act, 1), "referencia": round(ref, 1),
            "delta_pct": delta_pct,
            "veredicto": "causa" if malo else ("atencion" if atencion else "ok"),
        })

    # ---------- 4. DESCOMPOSICIÓN LMDI (exacta) ----------
    f_act = _factores(actual)
    f_ref = _factores({
        "contestadas": ref_cont / n_prev, "polizas_emitidas": ref_pol / n_prev,
        "prima_emitida": ref_emit / n_prev, "prima_neta": ref_neta / n_prev,
    })
    descomposicion: list[dict] = []
    if f_act and f_ref:
        L = _lmdi_pesos(f_act["neta"], f_ref["neta"])
        for k in ("contestadas", "conversion", "ticket", "retencion"):
            if f_act[k] > 0 and f_ref[k] > 0:
                aporte = L * math.log(f_act[k] / f_ref[k])
                descomposicion.append({
                    "clave": k, "factor": _FACTOR_LABEL[k], "aporte_gs": round(aporte),
                    "actual": round(f_act[k], 4), "referencia": round(f_ref[k], 4),
                })
        descomposicion.sort(key=lambda d: d["aporte_gs"])

    # ---------- 5. CONCLUSIÓN ----------
    partes: list[str] = []
    if alcanzado:
        partes.append(f"HIPÓTESIS CONFIRMADA: {mes} produjo Gs {neta:,.0f} de {etiqueta_produccion}, "
                      f"{observacion['cumplimiento_pct']}% del objetivo.".replace(",", "."))
    else:
        partes.append(f"HIPÓTESIS RECHAZADA: {mes} produjo Gs {neta:,.0f} de {etiqueta_produccion}, "
                      f"{observacion['cumplimiento_pct']}% del objetivo — brecha de "
                      f"Gs {abs(brecha):,.0f}.".replace(",", "."))
    causas = [v for v in verificaciones if v["veredicto"] == "causa"]
    # Solo aportes MATERIALES cuentan como causa (≥1% del objetivo/referencia):
    # una variación trivial no debe presentarse como explicación.
    material = 0.01 * max(objetivo, (f_ref or {}).get("neta", 0) or 0, 1.0)
    negativos = [d for d in descomposicion if d["aporte_gs"] < -material]
    positivos = [d for d in descomposicion if d["aporte_gs"] > material]
    objetivo_excedido = False
    if negativos:
        peor = negativos[0]
        partes.append(f"La variación de producción vs el período de referencia se explica sobre todo por: "
                      + "; ".join(f"{d['factor']} ({'−' if d['aporte_gs'] < 0 else '+'}Gs {abs(d['aporte_gs']):,.0f})".replace(",", ".")
                                  for d in descomposicion) + ".")
        partes.append(f"El factor dominante es {peor['factor'].lower()}.")
    elif positivos and alcanzado:
        partes.append("Todos los factores del funnel aportaron positivamente frente a la referencia; "
                      "el resultado es consistente con la mejora de "
                      + " y ".join(d["factor"].lower() for d in positivos[-2:]) + ".")
    if causas:
        partes.append("Verificación de datos: los eslabones con deterioro significativo (>15%) son "
                      + ", ".join(c["factor"].lower() for c in causas) + ".")
    if not alcanzado:
        total_neg = sum(-d["aporte_gs"] for d in negativos)
        if not negativos and not causas:
            objetivo_excedido = True
            partes.append("Verificación de datos: ningún eslabón muestra deterioro significativo vs la referencia — "
                          "la brecha no responde a una caída operativa: el objetivo excede la capacidad demostrada "
                          "del período; validar el dimensionamiento con el Simulador (modo meta).")
        elif abs(brecha) > 2 * total_neg:
            objetivo_excedido = True
            partes.append("Además, aun revirtiendo por completo los factores caídos no se cierra la brecha "
                          f"(explican Gs {total_neg:,.0f} de Gs {abs(brecha):,.0f}): el objetivo excede la capacidad "
                          "demostrada del período de referencia; validar el dimensionamiento con el Simulador.".replace(",", "."))
    conclusion = " ".join(partes)

    # ---------- 6. ACCIONES ----------
    acciones: list[str] = []
    for d in negativos[:2]:
        acciones.extend(_ACCIONES_POR_FACTOR.get(d["clave"], [])[:3])
    for c in causas:
        if c["clave"] in ("agentes_efectivos", "dias_operativos") and \
                "Revisar dotación efectiva y ausentismo: menos asesores marcando o menos días operativos reducen el volumen directamente." not in acciones:
            acciones.append("Revisar dotación efectiva y ausentismo: menos asesores marcando o menos días operativos reducen el volumen directamente.")
    if objetivo_excedido:
        acciones.append("Dimensionar el objetivo con el Simulador de Ventas (modo meta): la capacidad demostrada no llega al objetivo con las tasas actuales.")
        acciones.append("Definir con qué palanca cerrar la brecha: dotación, conversión (coaching/bases) o base de datos — el simulador cuantifica cada una.")
    if alcanzado and not acciones:
        acciones.append("Documentar qué se hizo distinto este mes (bases, guion, dotación) para replicarlo.")
        acciones.append("Subir el objetivo gradualmente con el Simulador para validar la capacidad de crecimiento.")

    # ---------- 7. ANÁLISIS ADICIONALES sugeridos (promueven la siguiente pregunta) ----------
    claves_neg = {d["clave"] for d in negativos}
    claves_causa = {c["clave"] for c in causas}
    sugeridos: list[dict] = []
    if "conversion" in claves_neg or "conversion_pct" in claves_causa:
        sugeridos.append({"titulo": "Localizar la caída de conversión por operador",
                          "detalle": "En el comparativo por operador, filtrar por conversión baja del último mes para ver en quiénes se concentra.",
                          "ruta": "/televentas/comparativo"})
        sugeridos.append({"titulo": "Voz del Cliente en Ventas (motivos de no-venta)",
                          "detalle": "Revisar qué dice el cliente al rechazar en las gestiones CRM del período: precio, cobertura, momento.",
                          "ruta": "/televentas/crm/reports"})
    if "contestadas" in claves_neg or {"total_llamadas", "contactabilidad", "agentes_efectivos",
                                       "llamadas_prom_asesor_dia", "dias_operativos"} & claves_causa:
        sugeridos.append({"titulo": "Profundizar el volumen: reporte de llamadas del mes",
                          "detalle": "Curva horaria, ritmo por asesor y días caídos — para separar problema de bases, de dotación o de marcación.",
                          "ruta": "/televentas/llamadas/reports"})
    if "ticket" in claves_neg:
        sugeridos.append({"titulo": "Mix de productos del mes",
                          "detalle": "En el reporte de producción, comparar el mix de tipos de póliza: un corrimiento a pólizas chicas explica el ticket.",
                          "ruta": "/televentas/produccion/reports"})
    if "retencion" in claves_neg or "anulacion_pct" in claves_causa:
        sugeridos.append({"titulo": "Anulaciones del período",
                          "detalle": "Revisar las pólizas anuladas del reporte de producción: concentración por operador o por producto.",
                          "ruta": "/televentas/produccion/reports"})
    if objetivo_excedido or not alcanzado:
        sugeridos.append({"titulo": "Dimensionar la meta con el Simulador",
                          "detalle": "Correr el modo 'Por meta de prima' con este objetivo para cuantificar dotación, ritmo y base necesarios.",
                          "ruta": "/televentas/simulador"})
    sugeridos.append({"titulo": "Repetir el análisis con otra referencia",
                      "detalle": "Si algún mes de referencia fue atípico, volver a correr el analizador con otros meses seleccionados.",
                      "ruta": None})
    sugeridos.append({"titulo": "Profundizar con el Agente IA",
                      "detalle": "El agente dispone de este mismo analizador y de todos los reportes: puede responder la siguiente pregunta en lenguaje natural.",
                      "ruta": "/televentas/agente"})

    return {
        "disponible": True,
        "hipotesis": hipotesis,
        "consulta": (consulta or "").strip() or None,
        "observacion": observacion,
        "verificaciones": verificaciones,
        "descomposicion": descomposicion,
        "conclusion": conclusion,
        "acciones": acciones,
        "analisis_sugeridos": sugeridos,
        "metodo": ("Método: hipótesis (producción vs objetivo) → observación → verificación de cada eslabón del "
                   "funnel contra la referencia pooled de los meses previos → descomposición LMDI exacta de la "
                   "variación (volumen × conversión × ticket × retención) → conclusión y acciones."),
        "series": {
            "meses": [{"mes": g.get("mes"), "prima_neta": round(float(g.get("prima_neta") or 0)),
                       "prima_emitida": round(float(g.get("prima_emitida") or 0)),
                       "objetivo": round(objetivo) if g is gs[-1] else None} for g in gs],
        },
    }
