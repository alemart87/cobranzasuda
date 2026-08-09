"""Eficiencia del Negocio — clasificación mensual de operadores para decisiones de dotación.

Sudameris Seguros paga el servicio POR HORA: un operador improductivo debe
detectarse y resolverse rápido. Este algoritmo es determinista y auditable —
sobre su salida se toman decisiones — y sus reglas son públicas (se muestran
en la pestaña y en el informe PDF).

ÍNDICE DE EFICIENCIA (100 = la media del equipo establecido):
    índice = 100 × ( 0,60 × prima_por_día_activo / media_equipo
                   + 0,25 × conversión           / media_equipo
                   + 0,15 × llamadas_por_día     / media_equipo )
  La producción por día activo pesa 60% porque es lo que Sudameris paga (horas
  trabajadas); la conversión 25% (calidad de la gestión) y el ritmo 15% (esfuerzo).
  La media se calcula SOLO sobre operadores establecidos (no distorsionan los nuevos).

ESTADOS (operadores establecidos, antigüedad > 60 días):
    Óptimo                        índice ≥ 100 (en o sobre la media)
    A mejorar                     70 ≤ índice < 100
    Crítico                       45 ≤ índice < 70
    Se recomienda baja            índice < 45, o índice < 60 por segundo mes consecutivo

NUEVOS ASESORES:
    < 15 días de antigüedad       EN OBSERVACIÓN — no se clasifica (mínimo 15 días de datos)
    15–60 días ("nuevo"):
        Nuevo sobresaliente       índice ≥ 90 (ya rinde casi como la media del equipo)
        Nuevo en desarrollo       55 ≤ índice < 90 (despegando, con curva normal)
        Nuevo crítico             índice < 55 (muy por debajo aun con la curva a favor)

La antigüedad se mide desde el PRIMER registro de llamadas del operador en toda
la historia publicada, hasta el fin del mes analizado.
"""
from __future__ import annotations

import calendar
from datetime import date
from typing import Any, Optional

from ._nombres import best_match

# ---- Reglas del algoritmo (públicas; cambiarlas requiere decisión de negocio) ----
MIN_DIAS_ANALISIS = 15      # mínimo de antigüedad para clasificar
NUEVO_MAX_DIAS = 60         # hasta acá el asesor se considera "nuevo"
PESO_PRIMA, PESO_CONV, PESO_RITMO = 0.60, 0.25, 0.15
UMBRAL_OPTIMO = 100
UMBRAL_A_MEJORAR = 70
UMBRAL_CRITICO = 45         # debajo → se recomienda baja directa
BAJA_PERSISTENTE = 60       # < 60 dos meses consecutivos → se recomienda baja
NUEVO_SOBRESALIENTE = 90
NUEVO_DESARROLLO = 55

ESTADOS = {
    "optimo": "Óptimo",
    "a_mejorar": "A mejorar",
    "critico": "Crítico",
    "baja": "Se recomienda baja del servicio",
    "nuevo_sobresaliente": "Nuevo sobresaliente",
    "nuevo_desarrollo": "Nuevo en desarrollo",
    "nuevo_critico": "Nuevo crítico",
    "observacion": "En observación (< 15 días)",
}


def _fin_de_mes(mes: str) -> date:
    y, m = int(mes[:4]), int(mes[5:7])
    return date(y, m, calendar.monthrange(y, m)[1])


def _metricas_operadores(ll_data: dict, pr_data: dict) -> list[dict]:
    """Cruza llamadas y producción por vendedor (equipo de marcación únicamente)."""
    pr_vend = {v["vendedor"]: v for v in (pr_data or {}).get("por_vendedor", [])}
    pr_names = list(pr_vend.keys())
    out = []
    for lv in (ll_data or {}).get("por_vendedor", []):
        pmatch = best_match(lv["vendedor"], pr_names)
        pv = pr_vend.get(pmatch) if pmatch else None
        dias = lv.get("dias_activos", 0) or 0
        prima = float((pv or {}).get("prima_emitida", 0) or 0)
        polizas = (pv or {}).get("polizas", 0) or 0
        contestadas = lv.get("contestadas", 0) or 0
        out.append({
            "vendedor": lv["vendedor"],
            "llamadas": lv.get("llamadas", 0),
            "contestadas": contestadas,
            "dias_activos": dias,
            "primer_dia": lv.get("primer_dia"),
            "prima": round(prima),
            "polizas": polizas,
            "conversion_pct": round(polizas / contestadas * 100, 2) if contestadas else 0.0,
            "prima_dia": round(prima / dias) if dias else 0,
            "llamadas_dia": round(lv.get("llamadas", 0) / dias, 1) if dias else 0.0,
        })
    return out


def _indice(op: dict, medias: dict) -> Optional[float]:
    """Índice de eficiencia vs la media del equipo establecido (100 = media)."""
    comps, pesos = [], []
    if medias.get("prima_dia"):
        comps.append(op["prima_dia"] / medias["prima_dia"]); pesos.append(PESO_PRIMA)
    if medias.get("conversion_pct"):
        comps.append(op["conversion_pct"] / medias["conversion_pct"]); pesos.append(PESO_CONV)
    if medias.get("llamadas_dia"):
        comps.append(op["llamadas_dia"] / medias["llamadas_dia"]); pesos.append(PESO_RITMO)
    if not comps:
        return None
    total = sum(pesos)
    return round(sum(c * p for c, p in zip(comps, pesos)) / total * 100, 1)


def indices_del_mes(ll_data: dict, pr_data: dict, historia: dict[str, str], mes: str) -> dict[str, float]:
    """Solo los índices por operador (para la regla de persistencia del mes previo)."""
    r = analizar_eficiencia(ll_data, pr_data, historia, mes, objetivo_prima=1)
    return {o["vendedor"]: o["indice"] for o in r.get("operadores", []) if o.get("indice") is not None}


def analizar_eficiencia(ll_data: dict, pr_data: dict, historia: dict[str, str],
                        mes: str, objetivo_prima: float,
                        indices_prev: Optional[dict[str, float]] = None) -> dict[str, Any]:
    """Análisis de eficiencia del mes. `historia`: vendedor → primer día histórico
    (ISO) en llamadas publicadas. `indices_prev`: índice del mes anterior por
    vendedor (regla de baja por crítico persistente)."""
    ops = _metricas_operadores(ll_data, pr_data)
    if not ops:
        return {"disponible": False, "mensaje": "El mes no tiene reporte de llamadas publicado con operadores."}
    fin_mes = _fin_de_mes(mes)
    indices_prev = indices_prev or {}

    # Antigüedad: primer registro HISTÓRICO (no del mes) hasta fin del mes analizado.
    for o in ops:
        primero = historia.get(o["vendedor"]) or o.get("primer_dia")
        try:
            o["antiguedad_dias"] = (fin_mes - date.fromisoformat(primero)).days + 1 if primero else None
        except Exception:
            o["antiguedad_dias"] = None

    establecidos = [o for o in ops if (o["antiguedad_dias"] or 0) > NUEVO_MAX_DIAS and o["dias_activos"] > 0]
    base_media = establecidos or [o for o in ops if (o["antiguedad_dias"] or 0) >= MIN_DIAS_ANALISIS and o["dias_activos"] > 0]
    medias = {}
    if base_media:
        for k in ("prima_dia", "conversion_pct", "llamadas_dia"):
            vals = [o[k] for o in base_media]
            medias[k] = round(sum(vals) / len(vals), 2)

    operadores, en_observacion = [], []
    for o in ops:
        ant = o["antiguedad_dias"]
        idx = _indice(o, medias)
        o["indice"] = idx
        if ant is not None and ant < MIN_DIAS_ANALISIS:
            o["estado"] = "observacion"
            o["motivo"] = (f"Antigüedad {ant} día(s): aún no se clasifica — el algoritmo exige un mínimo de "
                           f"{MIN_DIAS_ANALISIS} días de datos para evaluar con justicia.")
            en_observacion.append(o)
            continue
        es_nuevo = ant is not None and ant <= NUEVO_MAX_DIAS
        o["es_nuevo"] = es_nuevo
        if idx is None:
            o["estado"] = "observacion"
            o["motivo"] = "Sin datos suficientes para calcular el índice."
            en_observacion.append(o)
            continue

        vs_media = round(idx - 100, 1)
        detalle = (f"Índice {idx} ({vs_media:+.1f} pts vs la media). Produce Gs {o['prima_dia']:,} por día activo "
                   f"(media Gs {int(medias.get('prima_dia', 0)):,}), conversión {o['conversion_pct']}% "
                   f"(media {medias.get('conversion_pct', 0)}%), {o['llamadas_dia']} llamadas/día "
                   f"(media {medias.get('llamadas_dia', 0)}).").replace(",", ".")

        if es_nuevo:
            if idx >= NUEVO_SOBRESALIENTE:
                o["estado"] = "nuevo_sobresaliente"
                o["motivo"] = f"Nuevo ({ant} días) y ya rinde al nivel del equipo. {detalle}"
            elif idx >= NUEVO_DESARROLLO:
                o["estado"] = "nuevo_desarrollo"
                o["motivo"] = f"Nuevo ({ant} días), despegando con curva de aprendizaje normal. {detalle}"
            else:
                o["estado"] = "nuevo_critico"
                o["motivo"] = (f"Nuevo ({ant} días) muy por debajo aun considerando la curva de aprendizaje. "
                               f"Requiere acompañamiento inmediato o decisión temprana. {detalle}")
        else:
            prev = indices_prev.get(o["vendedor"])
            if idx < UMBRAL_CRITICO:
                o["estado"] = "baja"
                o["motivo"] = (f"Índice {idx} — por debajo del umbral de baja ({UMBRAL_CRITICO}). El servicio se paga "
                               f"por hora y la producción no lo justifica. {detalle}")
            elif idx < BAJA_PERSISTENTE and prev is not None and prev < BAJA_PERSISTENTE:
                o["estado"] = "baja"
                o["motivo"] = (f"Índice {idx} y el mes anterior {prev}: segundo mes consecutivo bajo "
                               f"{BAJA_PERSISTENTE} — improductividad sostenida. {detalle}")
            elif idx < UMBRAL_A_MEJORAR:
                o["estado"] = "critico"
                o["motivo"] = (f"Muy por debajo de la media: plan de recuperación inmediato (escuchas, bases, "
                               f"acompañamiento) con revisión al mes siguiente. {detalle}")
            elif idx < UMBRAL_OPTIMO:
                o["estado"] = "a_mejorar"
                o["motivo"] = f"Por debajo de la media del equipo: hay margen con coaching puntual. {detalle}"
            else:
                o["estado"] = "optimo"
                o["motivo"] = f"En o sobre la media del equipo. {detalle}"
        o["indice_prev"] = indices_prev.get(o["vendedor"])
        operadores.append(o)

    operadores.sort(key=lambda x: -(x["indice"] or 0))

    # ---- comportamiento del EQUIPO vs objetivo del mes ----
    prk = (pr_data or {}).get("kpis", {})
    prima_mes = float(prk.get("prima_emitida", 0) or sum(o["prima"] for o in operadores))
    objetivo = float(objetivo_prima or 0)
    cumplimiento = round(prima_mes / objetivo * 100, 1) if objetivo else None
    clasificados = len(operadores)
    cuota = round(objetivo / clasificados) if objetivo and clasificados else None

    resumen = {e: sum(1 for o in operadores if o["estado"] == e) for e in
               ("optimo", "a_mejorar", "critico", "baja", "nuevo_sobresaliente",
                "nuevo_desarrollo", "nuevo_critico")}
    resumen["observacion"] = len(en_observacion)

    # ---- serie acumulada del mes vs objetivo prorrateado (comportamiento) ----
    serie, acum = [], 0.0
    dias_prod = (pr_data or {}).get("por_dia", []) or []
    n = len(dias_prod)
    for i, d in enumerate(dias_prod):
        acum += float(d.get("prima", 0) or 0)
        serie.append({"fecha": d.get("fecha"), "prima": round(float(d.get("prima", 0) or 0)),
                      "acumulado": round(acum),
                      "objetivo_lineal": round(objetivo * (i + 1) / n) if objetivo and n else None})

    bajas = [o["vendedor"] for o in operadores if o["estado"] == "baja"]
    criticos = [o["vendedor"] for o in operadores if o["estado"] in ("critico", "nuevo_critico")]
    partes = []
    if objetivo:
        partes.append(f"El equipo produjo Gs {prima_mes:,.0f} de prima emitida: {cumplimiento}% del objetivo "
                      f"de Gs {objetivo:,.0f}.".replace(",", "."))
    partes.append(f"De {clasificados} operadores clasificados: {resumen['optimo']} en Óptimo, "
                  f"{resumen['a_mejorar']} A mejorar, {resumen['critico']} Críticos y "
                  f"{resumen['baja']} con recomendación de baja"
                  + (f" ({', '.join(bajas)})" if bajas else "") + ".")
    nuevos_total = resumen["nuevo_sobresaliente"] + resumen["nuevo_desarrollo"] + resumen["nuevo_critico"]
    if nuevos_total:
        partes.append(f"Nuevos asesores evaluados: {nuevos_total} "
                      f"({resumen['nuevo_sobresaliente']} sobresaliente(s), "
                      f"{resumen['nuevo_desarrollo']} en desarrollo, {resumen['nuevo_critico']} crítico(s)).")
    if en_observacion:
        partes.append(f"{len(en_observacion)} asesor(es) en observación (menos de {MIN_DIAS_ANALISIS} días): "
                      "se clasifican recién con datos suficientes.")
    if criticos:
        partes.append("Los casos críticos requieren plan de recuperación con revisión el mes próximo; "
                      "las bajas recomendadas, decisión inmediata — el servicio se paga por hora.")

    return {
        "disponible": True,
        "mes": mes,
        "objetivo_prima": round(objetivo),
        "equipo": {
            "prima_emitida": round(prima_mes),
            "cumplimiento_pct": cumplimiento,
            "brecha_gs": round(prima_mes - objetivo) if objetivo else None,
            "cuota_por_operador": cuota,
            "medias": medias,
            "operadores_clasificados": clasificados,
        },
        "operadores": operadores,
        "en_observacion": en_observacion,
        "resumen": resumen,
        "serie_acumulada": serie,
        "conclusion": " ".join(partes),
        "reglas": {
            "min_dias_analisis": MIN_DIAS_ANALISIS, "nuevo_max_dias": NUEVO_MAX_DIAS,
            "pesos": {"prima_dia": PESO_PRIMA, "conversion": PESO_CONV, "ritmo": PESO_RITMO},
            "umbrales": {"optimo": UMBRAL_OPTIMO, "a_mejorar": UMBRAL_A_MEJORAR,
                         "critico": UMBRAL_CRITICO, "baja_persistente": BAJA_PERSISTENTE,
                         "nuevo_sobresaliente": NUEVO_SOBRESALIENTE, "nuevo_desarrollo": NUEVO_DESARROLLO},
        },
    }
