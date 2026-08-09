"""Reporte SEMANAL de Televentas — agregación por semana ISO y análisis inter-semanal.

Las semanas (lunes a domingo, clave "YYYY-Www") se construyen desde las series
DIARIAS de los reportes publicados: llamadas (por_dia con asesores efectivos y
TMO), producción (pólizas/prima emitida por día) y gestiones CRM. Una semana
puede cruzar dos meses: se arma cruzando todos los reportes publicados.

Producción semanal = prima EMITIDA (la anulación no tiene fecha diaria y se
gestiona en el análisis mensual). Conversión = pólizas ÷ contestadas de la semana.

Incluye:
- `agrupar_semanas`: métricas por semana.
- `evaluar_semana`: mejoras / desmejoras / datos llamativos vs la semana previa
  y vs la historia (récords).
- `analizar_semana`: el MISMO método científico del analizador mensual
  (hipótesis producción-vs-objetivo, verificación del funnel, descomposición
  LMDI, conclusión y acciones), con la semana como período.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Optional

from .televentas_analizador import analizar_cientifico


def _semana_key(fecha_iso: str) -> Optional[str]:
    try:
        y, w, _ = date.fromisoformat(fecha_iso).isocalendar()
        return f"{y}-W{w:02d}"
    except Exception:
        return None


def _pct(part: float, whole: float) -> float:
    return round(part / whole * 100, 1) if whole else 0.0


def agrupar_semanas(dias_llamadas: list[dict], dias_prod: list[dict],
                    dias_crm: list[dict]) -> list[dict]:
    """Agrega las series diarias en semanas ISO (ascendente)."""
    sem: dict[str, dict] = {}

    def slot(k: str) -> dict:
        return sem.setdefault(k, {
            "semana": k, "fechas": set(), "llamadas": 0, "contestadas": 0,
            "asesores_dias": [], "ritmo_dias": [], "tmo_dias": [],
            "polizas": 0, "prima": 0.0,
            "gestiones": 0, "contactos_crm": 0, "aceptas_crm": 0, "agendados_crm": 0,
            "dias_llamadas": 0,
        })

    for d in dias_llamadas:
        k = _semana_key(d.get("fecha", ""))
        if not k:
            continue
        s = slot(k)
        s["fechas"].add(d["fecha"])
        s["llamadas"] += d.get("llamadas", 0)
        s["contestadas"] += d.get("contestadas", 0)
        s["dias_llamadas"] += 1
        if d.get("asesores_efectivos"):
            s["asesores_dias"].append(d["asesores_efectivos"])
        if d.get("promedio_por_asesor"):
            s["ritmo_dias"].append(d["promedio_por_asesor"])
        if d.get("tmo_seg"):
            s["tmo_dias"].append(d["tmo_seg"])

    for d in dias_prod:
        k = _semana_key(d.get("fecha", ""))
        if not k:
            continue
        s = slot(k)
        s["fechas"].add(d["fecha"])
        s["polizas"] += d.get("polizas", 0)
        s["prima"] += float(d.get("prima", 0) or 0)

    for d in dias_crm:
        k = _semana_key(d.get("fecha", ""))
        if not k:
            continue
        s = slot(k)
        s["fechas"].add(d["fecha"])
        s["gestiones"] += d.get("gestiones", 0)
        s["contactos_crm"] += d.get("contactos", 0)
        s["aceptas_crm"] += d.get("aceptas", 0)
        s["agendados_crm"] += d.get("agendados", 0)

    out = []
    for k in sorted(sem.keys()):
        s = sem[k]
        fechas = sorted(s["fechas"])
        n_ase = len(s["asesores_dias"])
        contactos = s["contactos_crm"]
        out.append({
            "semana": k,
            "fecha_inicio": fechas[0] if fechas else None,
            "fecha_fin": fechas[-1] if fechas else None,
            "dias_operativos": s["dias_llamadas"],
            "completa": s["dias_llamadas"] >= 4,  # tolera feriados
            "llamadas": s["llamadas"],
            "contestadas": s["contestadas"],
            "contactabilidad": _pct(s["contestadas"], s["llamadas"]),
            "polizas": s["polizas"],
            "prima": round(s["prima"]),
            "conversion_pct": round(s["polizas"] / s["contestadas"] * 100, 2) if s["contestadas"] else 0.0,
            "ticket_promedio": round(s["prima"] / s["polizas"]) if s["polizas"] else 0,
            "agentes_efectivos": round(sum(s["asesores_dias"]) / n_ase, 1) if n_ase else 0,
            "llamadas_prom_asesor_dia": round(sum(s["ritmo_dias"]) / len(s["ritmo_dias"]), 1) if s["ritmo_dias"] else 0,
            "tmo_seg": round(sum(s["tmo_dias"]) / len(s["tmo_dias"])) if s["tmo_dias"] else 0,
            "gestiones_crm": s["gestiones"],
            "tasa_contacto_crm": _pct(contactos, s["gestiones"]),
            "tasa_aceptacion_crm": _pct(s["aceptas_crm"], contactos),
            "aceptas_crm": s["aceptas_crm"],
            "tiene_crm": s["gestiones"] > 0,
        })
    return out


# Métricas evaluadas semana a semana: (clave, etiqueta, más-es-mejor, formato)
_METRICAS_EVAL = [
    ("prima", "Prima emitida", True, "gs"),
    ("polizas", "Pólizas emitidas", True, "int"),
    ("conversion_pct", "Conversión %", True, "pct"),
    ("llamadas", "Llamadas realizadas", True, "int"),
    ("contestadas", "Llamadas atendidas", True, "int"),
    ("contactabilidad", "Contactabilidad %", True, "pct"),
    ("ticket_promedio", "Ticket promedio", True, "gs"),
    ("agentes_efectivos", "Agentes efectivos/día", True, "int"),
    ("llamadas_prom_asesor_dia", "Ritmo (llam/asesor/día)", True, "int"),
    ("gestiones_crm", "Gestiones CRM", True, "int"),
    ("tasa_contacto_crm", "Tasa de contacto CRM %", True, "pct"),
    ("tasa_aceptacion_crm", "Tasa de aceptación CRM %", True, "pct"),
]


def evaluar_semana(semanas: list[dict], semana_key: str) -> dict[str, Any]:
    """Mejoras / desmejoras / datos llamativos de la semana vs la previa y la historia."""
    idx = next((i for i, s in enumerate(semanas) if s["semana"] == semana_key), None)
    if idx is None:
        return {"mejoras": [], "desmejoras": [], "llamativos": []}
    actual = semanas[idx]
    previa = semanas[idx - 1] if idx > 0 else None
    historicas = [s for s in semanas[:idx] if s.get("completa")]

    mejoras, desmejoras, llamativos = [], [], []
    for key, label, mas_mejor, fmt in _METRICAS_EVAL:
        act = float(actual.get(key) or 0)
        if previa is None:
            continue
        prev = float(previa.get(key) or 0)
        if prev == 0 and act == 0:
            continue
        delta = round((act - prev) / prev * 100, 1) if prev else None
        row = {"clave": key, "metrica": label, "actual": act, "previa": prev,
               "delta_pct": delta, "formato": fmt}
        if delta is None:
            continue
        mejora = delta > 0 if mas_mejor else delta < 0
        if abs(delta) >= 5:
            (mejoras if mejora else desmejoras).append(row)
        if abs(delta) >= 25:
            llamativos.append({**row, "tipo": "salto",
                               "detalle": f"{label}: variación de {delta:+.1f}% vs la semana previa."})

    # Récords históricos (sobre semanas completas previas + actual).
    if historicas and actual.get("completa"):
        for key, label, mas_mejor, fmt in (("prima", "Prima emitida", True, "gs"),
                                           ("conversion_pct", "Conversión %", True, "pct"),
                                           ("contestadas", "Llamadas atendidas", True, "int")):
            vals = [float(s.get(key) or 0) for s in historicas]
            act = float(actual.get(key) or 0)
            if act > max(vals):
                llamativos.append({"clave": key, "metrica": label, "actual": act, "formato": fmt,
                                   "tipo": "record_alto",
                                   "detalle": f"{label}: mejor semana de la serie ({len(historicas) + 1} semanas)."})
            elif act < min(vals):
                llamativos.append({"clave": key, "metrica": label, "actual": act, "formato": fmt,
                                   "tipo": "record_bajo",
                                   "detalle": f"{label}: peor semana de la serie ({len(historicas) + 1} semanas)."})

    mejoras.sort(key=lambda r: -abs(r["delta_pct"] or 0))
    desmejoras.sort(key=lambda r: -abs(r["delta_pct"] or 0))
    return {"mejoras": mejoras, "desmejoras": desmejoras, "llamativos": llamativos}


def _como_general(s: dict) -> dict:
    """Mapea una semana al formato 'generales' que consume analizar_cientifico.
    Producción semanal = prima emitida (sin anulación diaria → retención neutra)."""
    return {
        "mes": s["semana"],
        "total_llamadas": s["llamadas"],
        "contestadas": s["contestadas"],
        "contactabilidad": s["contactabilidad"],
        "polizas_emitidas": s["polizas"],
        "prima_emitida": s["prima"],
        "prima_neta": s["prima"],
        "conversion_pct": s["conversion_pct"],
        "ticket_promedio": s["ticket_promedio"],
        "agentes_efectivos": s["agentes_efectivos"],
        "llamadas_prom_asesor_dia": s["llamadas_prom_asesor_dia"],
        "dias_operativos": s["dias_operativos"],
        "tiene_crm": s["tiene_crm"],
        "tasa_contacto_crm": s["tasa_contacto_crm"],
        "tasa_aceptacion_crm": s["tasa_aceptacion_crm"],
    }


def analizar_semana(semanas: list[dict], semana_key: str, objetivo_prima: float,
                    consulta: Optional[str] = None) -> dict[str, Any]:
    """Análisis científico de la semana: objetivo semanal vs producción, con las
    semanas completas previas (hasta 3) como referencia + evaluación inter-semanal."""
    idx = next((i for i, s in enumerate(semanas) if s["semana"] == semana_key), None)
    if idx is None:
        return {"disponible": False, "mensaje": f"No hay datos para la semana {semana_key}."}
    actual = semanas[idx]
    referencia = [s for s in semanas[:idx] if s.get("completa")][-3:]
    if not referencia:
        return {"disponible": False,
                "mensaje": "Se necesita al menos una semana completa previa como referencia."}

    generales = [_como_general(s) for s in referencia] + [_como_general(actual)]
    resultado = analizar_cientifico(generales, objetivo_prima, consulta,
                                    etiqueta_produccion="prima emitida de la semana",
                                    unidad="semana")
    if not resultado.get("disponible"):
        return resultado

    resultado["evaluacion"] = evaluar_semana(semanas, semana_key)
    resultado["semana"] = {k: actual.get(k) for k in
                           ("semana", "fecha_inicio", "fecha_fin", "dias_operativos", "completa")}
    resultado["semanas_referencia"] = [s["semana"] for s in referencia]
    if not actual.get("completa"):
        resultado["conclusion"] += (" ADVERTENCIA: la semana analizada tiene solo "
                                    f"{actual.get('dias_operativos', 0)} día(s) con datos — "
                                    "el resultado es parcial y puede cambiar al completarse la semana.")
    return resultado
