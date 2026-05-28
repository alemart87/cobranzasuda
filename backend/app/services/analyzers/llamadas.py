"""Analyze llamadas data: team totals + per-agent + daily series.

Umbrales:
- EFFECTIVE_THRESHOLD_SEC = 30 → llamadas >= 30s se cuentan como "efectivas"
- AHT_THRESHOLD_SEC = 45 → el AHT se calcula SOLO sobre llamadas >= 45s
  (descarta llamadas cortas de transición que distorsionan el promedio).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any


EFFECTIVE_THRESHOLD_SEC = 30  # llamadas >= 30s = "efectivas"
AHT_THRESHOLD_SEC = 45        # AHT se calcula solo sobre llamadas >= 45s


def _sec_to_hms(seconds: float) -> str:
    s = int(seconds)
    h, rem = divmod(s, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def analyze_llamadas(rows: list[dict[str, Any]]) -> dict[str, Any]:
    total_calls = len(rows)
    total_talk = sum(r["duracion_seg"] for r in rows)

    by_user: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "llamadas": 0,
        "talk_seg": 0.0,
        "efectivas": 0,
        "no_efectivas": 0,
        # Para AHT (>= 45s)
        "aht_count": 0,
        "aht_talk": 0.0,
    })

    by_user_day: dict[tuple[str, str], dict[str, Any]] = defaultdict(lambda: {
        "llamadas": 0,
        "talk_seg": 0.0,
    })

    by_day: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "llamadas": 0,
        "talk_seg": 0.0,
    })

    by_hour: dict[int, int] = defaultdict(int)

    fechas_set: set[str] = set()

    efectivas_total = 0
    no_efectivas_total = 0

    # Acumuladores para AHT (solo llamadas >= 45s)
    aht_count_total = 0
    aht_talk_total = 0.0

    for r in rows:
        user = r["usuario"]
        dur = r["duracion_seg"]
        fecha: datetime | None = r["fecha"]

        by_user[user]["llamadas"] += 1
        by_user[user]["talk_seg"] += dur

        if dur >= EFFECTIVE_THRESHOLD_SEC:
            by_user[user]["efectivas"] += 1
            efectivas_total += 1
        else:
            by_user[user]["no_efectivas"] += 1
            no_efectivas_total += 1

        # AHT solo sobre llamadas >= 45s
        if dur >= AHT_THRESHOLD_SEC:
            by_user[user]["aht_count"] += 1
            by_user[user]["aht_talk"] += dur
            aht_count_total += 1
            aht_talk_total += dur

        if fecha is not None:
            day_str = fecha.date().isoformat()
            fechas_set.add(day_str)
            by_day[day_str]["llamadas"] += 1
            by_day[day_str]["talk_seg"] += dur
            by_user_day[(user, day_str)]["llamadas"] += 1
            by_user_day[(user, day_str)]["talk_seg"] += dur
            by_hour[fecha.hour] += 1

    dias_operativos = len(fechas_set)
    asesores_activos = len(by_user)

    # AHT global: solo llamadas >= 45s
    aht = (aht_talk_total / aht_count_total) if aht_count_total else 0
    promedio_diario = (total_calls / dias_operativos) if dias_operativos else 0

    # Ranking por asesor
    asesores: list[dict[str, Any]] = []
    for user, data in sorted(by_user.items(), key=lambda kv: -kv[1]["llamadas"]):
        efect = data["efectivas"]
        nef = data["no_efectivas"]
        total = data["llamadas"]
        # AHT del asesor: solo sobre sus llamadas >= 45s
        aht_user = (data["aht_talk"] / data["aht_count"]) if data["aht_count"] else 0
        asesores.append({
            "usuario": user,
            "llamadas": total,
            "efectivas": efect,
            "no_efectivas": nef,
            "pct_efectivas": round(efect / total * 100, 1) if total else 0,
            "talk_seg": round(data["talk_seg"], 1),
            "talk_hms": _sec_to_hms(data["talk_seg"]),
            "talk_horas": round(data["talk_seg"] / 3600, 2),
            "aht_seg": round(aht_user, 1),
            "aht_hms": _sec_to_hms(aht_user),
        })

    # Serie diaria por asesor (para gráfico apilado)
    dias_ordenados = sorted(fechas_set)
    usuarios_ordenados = [a["usuario"] for a in asesores]
    serie_diaria: list[dict[str, Any]] = []
    for day in dias_ordenados:
        row: dict[str, Any] = {"fecha": day}
        for user in usuarios_ordenados:
            row[user] = by_user_day.get((user, day), {}).get("llamadas", 0)
        row["_total"] = by_day[day]["llamadas"]
        row["_talk_seg"] = round(by_day[day]["talk_seg"], 1)
        serie_diaria.append(row)

    # Talk time por día por asesor (minutos)
    serie_talk_diaria: list[dict[str, Any]] = []
    for day in dias_ordenados:
        row: dict[str, Any] = {"fecha": day}
        for user in usuarios_ordenados:
            row[user] = round(by_user_day.get((user, day), {}).get("talk_seg", 0) / 60, 1)
        serie_talk_diaria.append(row)

    franja_horaria = [{"hora": h, "llamadas": by_hour.get(h, 0)} for h in range(24)]

    return {
        "kpis": {
            "total_llamadas": total_calls,
            "total_talk_seg": round(total_talk, 1),
            "total_talk_horas": round(total_talk / 3600, 2),
            "total_talk_hms": _sec_to_hms(total_talk),
            "efectivas_total": efectivas_total,
            "no_efectivas_total": no_efectivas_total,
            "pct_efectivas": round(efectivas_total / total_calls * 100, 1) if total_calls else 0,
            "aht_seg": round(aht, 1),
            "aht_hms": _sec_to_hms(aht),
            "promedio_diario": round(promedio_diario, 1),
            "dias_operativos": dias_operativos,
            "asesores_activos": asesores_activos,
            "umbral_efectivo_seg": EFFECTIVE_THRESHOLD_SEC,
        },
        "asesores": asesores,
        "serie_diaria_llamadas": serie_diaria,
        "serie_diaria_talk": serie_talk_diaria,
        "franja_horaria": franja_horaria,
        "usuarios": usuarios_ordenados,
        "dias": dias_ordenados,
    }
