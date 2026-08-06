"""Análisis de llamadas de Televentas (voz saliente).

Contestada = duración >= UMBRAL_CONTESTADA_SEG (una llamada muy corta se asume
no atendida / buzón). TMO = tiempo medio de las contestadas (AHT).

Incluye análisis profundo: promedio de llamadas por asesor/día, distribución de
duración, curva horaria, profundidad por operador (días activos, ritmo, altas
nuevas) e insights automáticos (posibles problemas de base, operadores iniciando,
caídas de actividad).
"""
from __future__ import annotations

from collections import defaultdict
from statistics import median
from typing import Any


# Una llamada se cuenta como CONTESTADA (contacto efectivo) a partir de 34 segundos.
UMBRAL_CONTESTADA_SEG = 34


def _hms(seg: float) -> str:
    seg = int(round(seg))
    return f"{seg // 3600:02d}:{(seg % 3600) // 60:02d}:{seg % 60:02d}"


def _pct(part: float, whole: float) -> float:
    return round(part / whole * 100, 1) if whole else 0.0


# Buckets de duración para la distribución.
_BUCKETS = [
    ("No contestada (<34s)", 0, 34),
    ("34s – 1 min", 34, 60),
    ("1 – 2 min", 60, 120),
    ("2 – 5 min", 120, 300),
    ("+5 min", 300, 10 ** 9),
]


def analyze_televentas_llamadas(rows: list[dict[str, Any]], umbral: int = UMBRAL_CONTESTADA_SEG) -> dict:
    total = len(rows)
    contestadas = [r for r in rows if r["duracion_seg"] >= umbral]
    n_cont = len(contestadas)
    talk_total = sum(r["duracion_seg"] for r in rows)
    talk_cont = sum(r["duracion_seg"] for r in contestadas)
    fechas_all = [r["fecha"].date() for r in rows if r["fecha"]]
    dias = set(fechas_all)
    n_dias = len(dias)
    period_start = min(fechas_all) if fechas_all else None
    period_end = max(fechas_all) if fechas_all else None

    # ---- por vendedor (con profundidad) ----
    pv: dict[str, dict] = defaultdict(lambda: {
        "llamadas": 0, "contestadas": 0, "talk_seg": 0.0, "talk_cont_seg": 0.0, "dias": set(),
    })
    for r in rows:
        d = pv[r["usuario"]]
        d["llamadas"] += 1
        d["talk_seg"] += r["duracion_seg"]
        if r["fecha"]:
            d["dias"].add(r["fecha"].date())
        if r["duracion_seg"] >= umbral:
            d["contestadas"] += 1
            d["talk_cont_seg"] += r["duracion_seg"]

    por_vendedor = []
    for v, d in pv.items():
        no_cont = d["llamadas"] - d["contestadas"]
        tmo = d["talk_cont_seg"] / d["contestadas"] if d["contestadas"] else 0.0
        dias_v = sorted(d["dias"])
        dias_activos = len(dias_v)
        primer = dias_v[0] if dias_v else None
        ultimo = dias_v[-1] if dias_v else None
        arranca_tarde = bool(primer and period_start and (primer - period_start).days >= 7)
        por_vendedor.append({
            "vendedor": v,
            "llamadas": d["llamadas"],
            "contestadas": d["contestadas"],
            "no_contestadas": no_cont,
            "pct_contestadas": _pct(d["contestadas"], d["llamadas"]),
            "talk_seg": round(d["talk_seg"]),
            "tmo_seg": round(tmo),
            "tmo_hms": _hms(tmo),
            "dias_activos": dias_activos,
            "promedio_diario": round(d["llamadas"] / dias_activos) if dias_activos else 0,
            "primer_dia": primer.isoformat() if primer else None,
            "ultimo_dia": ultimo.isoformat() if ultimo else None,
            "_arranca_tarde": arranca_tarde,
        })
    por_vendedor.sort(key=lambda x: -x["llamadas"])

    # ---- por día (con asesores activos, promedio por asesor y TMO del día) ----
    pd: dict[str, dict] = defaultdict(lambda: {"llamadas": 0, "contestadas": 0, "talk_cont_seg": 0.0, "asesores": set()})
    for r in rows:
        if not r["fecha"]:
            continue
        k = r["fecha"].date().isoformat()
        pd[k]["llamadas"] += 1
        pd[k]["asesores"].add(r["usuario"])
        if r["duracion_seg"] >= umbral:
            pd[k]["contestadas"] += 1
            pd[k]["talk_cont_seg"] += r["duracion_seg"]
    por_dia = []
    total_asesor_dias = 0
    for k, v in sorted(pd.items()):
        n_ase = len(v["asesores"])
        total_asesor_dias += n_ase
        por_dia.append({
            "fecha": k, "llamadas": v["llamadas"], "contestadas": v["contestadas"],
            "no_contestadas": v["llamadas"] - v["contestadas"],
            "asesores_activos": n_ase,
            "promedio_por_asesor": round(v["llamadas"] / n_ase) if n_ase else 0,
            "tmo_seg": round(v["talk_cont_seg"] / v["contestadas"]) if v["contestadas"] else 0,
        })

    # ---- curva horaria ----
    ph: dict[int, dict] = defaultdict(lambda: {"llamadas": 0, "contestadas": 0})
    for r in rows:
        if not r["fecha"]:
            continue
        h = r["fecha"].hour
        ph[h]["llamadas"] += 1
        if r["duracion_seg"] >= umbral:
            ph[h]["contestadas"] += 1
    por_hora = [{"hora": f"{h:02d}:00", "llamadas": ph[h]["llamadas"], "contestadas": ph[h]["contestadas"]}
                for h in sorted(ph.keys())]

    # ---- distribución de duración ----
    dist = []
    for label, lo, hi in _BUCKETS:
        c = sum(1 for r in rows if lo <= r["duracion_seg"] < hi)
        dist.append({"rango": label, "cantidad": c, "pct": _pct(c, total)})

    # ---- serie diaria apilada por vendedor ----
    vendedores = [v["vendedor"] for v in por_vendedor]
    serie: dict[str, dict] = defaultdict(lambda: defaultdict(int))
    for r in rows:
        if r["fecha"]:
            serie[r["fecha"].date().isoformat()][r["usuario"]] += 1
    serie_diaria = []
    for fecha in sorted(serie.keys()):
        row = {"fecha": fecha}
        for v in vendedores:
            row[v] = serie[fecha].get(v, 0)
        serie_diaria.append(row)

    tmo_global = talk_cont / n_cont if n_cont else 0.0
    prom_asesor_dia = round(total / total_asesor_dias, 1) if total_asesor_dias else 0.0

    insights = _generar_insights(por_vendedor, _pct(n_cont, total), period_start, period_end)

    # Quitar campos internos.
    for v in por_vendedor:
        v.pop("_arranca_tarde", None)

    return {
        "kpis": {
            "total_llamadas": total,
            "contestadas": n_cont,
            "no_contestadas": total - n_cont,
            "pct_contestadas": _pct(n_cont, total),
            "nivel_contacto_pct": _pct(n_cont, total),  # contactabilidad (piso 34s)
            "total_talk_seg": round(talk_total),
            "total_talk_hms": _hms(talk_total),
            "total_talk_horas": round(talk_total / 3600, 1),
            "tmo_seg": round(tmo_global),
            "tmo_hms": _hms(tmo_global),
            "vendedores_activos": len(pv),
            "dias_operativos": n_dias,
            "promedio_diario": round(total / n_dias) if n_dias else 0,
            "promedio_llamadas_asesor_dia": prom_asesor_dia,
            "umbral_contestada_seg": umbral,
        },
        "por_vendedor": por_vendedor,
        "por_dia": por_dia,
        "por_hora": por_hora,
        "distribucion_duracion": dist,
        "insights": insights,
        "serie_diaria": serie_diaria,
        "vendedores": vendedores,
    }


def _generar_insights(por_vendedor, contact_equipo, period_start, period_end):
    """Hipótesis/alertas automáticas sobre la operación de llamadas (determinista)."""
    insights: list[dict] = []
    activos = [v for v in por_vendedor if v["llamadas"] > 0]
    if not activos:
        return insights

    med_contact = median([v["pct_contestadas"] for v in activos]) or 0
    med_llam = median([v["llamadas"] for v in activos]) or 0
    med_dias = median([v["dias_activos"] for v in activos]) or 0

    # 1) Contactabilidad del equipo baja → posible calidad de bases.
    if contact_equipo and contact_equipo < 45:
        insights.append({
            "tipo": "base_datos", "severidad": "alert",
            "titulo": "Contactabilidad del equipo baja",
            "detalle": (f"El nivel de contacto del equipo es {contact_equipo}%. "
                        "Sugiere revisar la calidad/segmentación de las bases o el horario de marcación."),
        })

    # 2) Operadores nuevos / iniciando.
    nuevos = [v for v in activos if v["_arranca_tarde"] or (med_dias and v["dias_activos"] <= max(1, med_dias * 0.4))]
    if nuevos:
        det = ", ".join(f"{v['vendedor']} (desde {v['primer_dia']}, {v['dias_activos']} días activos)" for v in nuevos[:6])
        insights.append({
            "tipo": "operador_nuevo", "severidad": "info",
            "titulo": f"{len(nuevos)} operador(es) iniciando",
            "detalle": f"Producción/contactabilidad aún no representativa: {det}.",
            "vendedores": [v["vendedor"] for v in nuevos],
        })

    # 3) Baja contactabilidad individual con volumen (posible base mala).
    sospechosos = [v for v in activos
                   if not v["_arranca_tarde"] and v["llamadas"] >= max(30, med_llam * 0.5)
                   and med_contact and v["pct_contestadas"] <= med_contact * 0.6]
    if sospechosos:
        det = ", ".join(f"{v['vendedor']} ({v['pct_contestadas']}%)" for v in sospechosos[:6])
        insights.append({
            "tipo": "base_datos", "severidad": "warning",
            "titulo": "Contactabilidad individual muy por debajo del equipo",
            "detalle": (f"Con la mediana del equipo en {med_contact}%, estos operadores están muy por debajo "
                        f"pese a marcar volumen: {det}. Posible base con datos desactualizados o mal asignada."),
            "vendedores": [v["vendedor"] for v in sospechosos],
        })

    # 4) Caídas de actividad (dejaron de marcar antes del cierre del período).
    if period_end:
        cortan = [v for v in activos if v["ultimo_dia"] and not v["_arranca_tarde"]
                  and (period_end.isoformat() > v["ultimo_dia"])
                  and (_days_between(v["ultimo_dia"], period_end) >= 5)]
        if cortan:
            det = ", ".join(f"{v['vendedor']} (última: {v['ultimo_dia']})" for v in cortan[:6])
            insights.append({
                "tipo": "caida_actividad", "severidad": "warning",
                "titulo": "Operadores que dejaron de registrar llamadas",
                "detalle": f"Sin actividad en los últimos días del período: {det}. Verificar ausencias/bajas.",
                "vendedores": [v["vendedor"] for v in cortan],
            })

    return insights


def _days_between(iso_a: str, date_b) -> int:
    from datetime import date
    y, m, d = (int(x) for x in iso_a.split("-"))
    return (date_b - date(y, m, d)).days
