"""Analyzer del Reporte de Llamadas — Atención al Cliente.

Combina los 4 archivos:
  * Métricas generales de cola (ingresadas, contestadas, abandono, SLA, AHT) y
    series por día / por hora / por cola  → desde Intervalo (+ Colas como ref).
  * Detalle por operador (entrantes, salientes, AHT) → desde Entrantes.
  * Auxiliares (tiempo por estado, equipo y por operador) → desde Estados.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any

from ..parsers._text import strip_accents


# Estados que NO cuentan como "auxiliar" (productivos u offline).
_NO_AUX = {"disponible", "en la cola", "ocupado", "desconectado"}


def _pct(part: float, whole: float) -> float:
    return round(part / whole * 100, 1) if whole else 0.0


def _weighted(pairs: list[tuple[float | None, float]]) -> float:
    """Promedio ponderado: pairs = [(valor, peso)]. Ignora valores None."""
    num = sum(v * w for v, w in pairs if v is not None)
    den = sum(w for v, w in pairs if v is not None)
    return num / den if den else 0.0


def _norm_pct(value: float | None) -> float | None:
    """Normaliza un % a escala 0-100. La fuente lo trae como fracción (0.84)."""
    if value is None:
        return None
    return value * 100 if value <= 1.0 else value


def analyze_atencion_llamadas(
    entrantes: list[dict[str, Any]],
    estados: list[dict[str, Any]],
    intervalo: list[dict[str, Any]],
    colas: dict[str, Any],
) -> dict[str, Any]:
    # Fuente de métricas de cola: Intervalo; si viene vacío, usar el detalle de Colas.
    iv = intervalo or colas.get("intervalos") or []
    totales_ref = colas.get("totales")

    # ----------------------------- Métricas generales de cola -----------------------------
    oferta = sum(r["oferta"] for r in iv)
    contestadas = sum(r["contestadas"] for r in iv)
    abandonadas = sum(r["abandonadas"] for r in iv)

    # SLA y AHT: preferimos la fila de totales del archivo Colas (exacta); si no, ponderado.
    if totales_ref and totales_ref.get("sla_pct") is not None:
        sla_pct = round(_norm_pct(totales_ref["sla_pct"]) or 0.0, 1)
    else:
        sla_pct = round(_weighted([(_norm_pct(r["sla_pct"]), r["oferta"]) for r in iv]), 1)

    if totales_ref and totales_ref.get("manejo_seg"):
        aht_seg = round(totales_ref["manejo_seg"], 1)
        asa_seg = round(totales_ref.get("asa_seg", 0.0), 1)
    else:
        aht_seg = round(_weighted([(r["manejo_seg"], r["contestadas"]) for r in iv]), 1)
        asa_seg = round(_weighted([(r["asa_seg"], r["oferta"]) for r in iv]), 1)

    # ----------------------------- Series temporales -----------------------------
    por_dia_acc: dict[Any, dict[str, float]] = defaultdict(lambda: {"oferta": 0.0, "contestadas": 0.0, "abandonadas": 0.0, "_aht_num": 0.0, "_aht_w": 0.0})
    por_hora_acc: dict[int, dict[str, float]] = defaultdict(lambda: {"oferta": 0.0, "contestadas": 0.0, "abandonadas": 0.0})
    por_cola_acc: dict[str, dict[str, float]] = defaultdict(lambda: {"oferta": 0.0, "contestadas": 0.0, "abandonadas": 0.0})

    for r in iv:
        ini: datetime | None = r["inicio"]
        if ini:
            d = ini.date().isoformat()
            por_dia_acc[d]["oferta"] += r["oferta"]
            por_dia_acc[d]["contestadas"] += r["contestadas"]
            por_dia_acc[d]["abandonadas"] += r["abandonadas"]
            if r["manejo_seg"] > 0 and r["contestadas"] > 0:
                por_dia_acc[d]["_aht_num"] += r["manejo_seg"] * r["contestadas"]
                por_dia_acc[d]["_aht_w"] += r["contestadas"]
            por_hora_acc[ini.hour]["oferta"] += r["oferta"]
            por_hora_acc[ini.hour]["contestadas"] += r["contestadas"]
            por_hora_acc[ini.hour]["abandonadas"] += r["abandonadas"]
        cola = r["cola"] or "(sin cola)"
        por_cola_acc[cola]["oferta"] += r["oferta"]
        por_cola_acc[cola]["contestadas"] += r["contestadas"]
        por_cola_acc[cola]["abandonadas"] += r["abandonadas"]

    por_dia = []
    for d in sorted(por_dia_acc):
        a = por_dia_acc[d]
        por_dia.append({
            "dia": d,
            "oferta": int(a["oferta"]),
            "contestadas": int(a["contestadas"]),
            "abandonadas": int(a["abandonadas"]),
            "nivel_atencion_pct": _pct(a["contestadas"], a["oferta"]),
            "abandono_pct": _pct(a["abandonadas"], a["oferta"]),
            "aht_seg": round(a["_aht_num"] / a["_aht_w"], 1) if a["_aht_w"] else 0.0,
        })

    por_hora = []
    for h in sorted(por_hora_acc):
        a = por_hora_acc[h]
        por_hora.append({
            "hora": f"{h:02d}:00",
            "oferta": int(a["oferta"]),
            "contestadas": int(a["contestadas"]),
            "abandonadas": int(a["abandonadas"]),
        })

    por_cola = []
    for c in sorted(por_cola_acc, key=lambda k: -por_cola_acc[k]["oferta"]):
        a = por_cola_acc[c]
        por_cola.append({
            "cola": c,
            "oferta": int(a["oferta"]),
            "contestadas": int(a["contestadas"]),
            "abandonadas": int(a["abandonadas"]),
            "nivel_atencion_pct": _pct(a["contestadas"], a["oferta"]),
            "abandono_pct": _pct(a["abandonadas"], a["oferta"]),
        })

    # ----------------------------- Detalle por operador (Entrantes) -----------------------------
    op_acc: dict[str, dict[str, Any]] = {}

    def _op(name: str) -> dict[str, Any]:
        key = strip_accents(name)
        if key not in op_acc:
            op_acc[key] = {"operador": name, "entrantes": 0, "salientes": 0,
                           "_dur_total": 0.0, "_dur_cont": 0, "aux_seg": 0.0,
                           "aux_detalle": defaultdict(float)}
        return op_acc[key]

    for r in entrantes:
        op = _op(r["usuario"])
        direccion = strip_accents(r["direccion"])
        if direccion.startswith("entrante"):
            op["entrantes"] += 1
        else:
            op["salientes"] += 1
        if r["duracion_seg"] > 0:
            op["_dur_total"] += r["duracion_seg"]
            op["_dur_cont"] += 1

    # Auxiliares por operador (Estados) + breakdown de equipo.
    aux_equipo: dict[str, float] = defaultdict(float)
    estado_equipo: dict[str, float] = defaultdict(float)
    for r in estados:
        estado = r["estado_principal"] or "(sin estado)"
        dur = r["duracion_seg"]
        estado_equipo[estado] += dur
        if strip_accents(estado) not in _NO_AUX:
            aux_equipo[estado] += dur
            op = _op(r["agente"])
            op["aux_seg"] += dur
            op["aux_detalle"][estado] += dur

    operadores = []
    for v in op_acc.values():
        total = v["entrantes"] + v["salientes"]
        operadores.append({
            "operador": v["operador"],
            "entrantes": v["entrantes"],
            "salientes": v["salientes"],
            "total": total,
            "aht_seg": round(v["_dur_total"] / v["_dur_cont"], 1) if v["_dur_cont"] else 0.0,
            "aux_seg": round(v["aux_seg"], 1),
            "aux_detalle": {k: round(s, 1) for k, s in v["aux_detalle"].items()},
        })
    operadores.sort(key=lambda o: -o["total"])

    total_aux = sum(aux_equipo.values())
    auxiliares_equipo = [
        {"estado": k, "seg": round(s, 1), "pct": _pct(s, total_aux)}
        for k, s in sorted(aux_equipo.items(), key=lambda kv: -kv[1])
    ]
    estados_equipo = [
        {"estado": k, "seg": round(s, 1)}
        for k, s in sorted(estado_equipo.items(), key=lambda kv: -kv[1])
    ]

    total_entrantes_op = sum(o["entrantes"] for o in operadores)
    total_salientes_op = sum(o["salientes"] for o in operadores)

    # Referencia (fila de totales del archivo Colas), solo campos serializables.
    totales_ref_clean = None
    if totales_ref:
        totales_ref_clean = {
            "oferta": int(totales_ref.get("oferta") or 0),
            "contestadas": int(totales_ref.get("contestadas") or 0),
            "abandonadas": int(totales_ref.get("abandonadas") or 0),
            "sla_pct": round(_norm_pct(totales_ref.get("sla_pct")) or 0.0, 1),
            "aht_seg": round(totales_ref.get("manejo_seg") or 0.0, 1),
            "asa_seg": round(totales_ref.get("asa_seg") or 0.0, 1),
        }

    kpis = {
        "llamadas_ingresadas": int(oferta),
        "contestadas": int(contestadas),
        "abandonadas": int(abandonadas),
        "nivel_atencion_pct": _pct(contestadas, oferta),
        "abandono_pct": _pct(abandonadas, oferta),
        "sla_pct": sla_pct,
        "aht_seg": aht_seg,
        "asa_seg": asa_seg,
        "dias_operativos": len(por_dia),
        "colas": [c["cola"] for c in por_cola],
        "operadores_activos": len([o for o in operadores if o["total"] > 0]),
        "total_entrantes_op": total_entrantes_op,
        "total_salientes_op": total_salientes_op,
        "aux_total_seg": round(total_aux, 1),
    }

    return {
        "kpis": kpis,
        "por_dia": por_dia,
        "por_hora": por_hora,
        "por_cola": por_cola,
        "operadores": operadores,
        "auxiliares_equipo": auxiliares_equipo,
        "estados_equipo": estados_equipo,
        "totales_ref": totales_ref_clean,
    }
