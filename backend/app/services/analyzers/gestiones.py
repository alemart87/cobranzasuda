"""Analyze gestiones data — funnel operativo.

Funnel (por equipo / por asesor / por base de datos):
    Total gestiones
       ↓ % contactos efectivos = contactos / gestiones
    Contactos efectivos
       ↓ % promesas obtenidas = promesas / contactos efectivos
    Promesas obtenidas
       ↓ % promesas cumplidas = cobrados / promesas
    Promesas cumplidas (= cobrados)

Una "promesa cumplida" se cuenta como cada gestión con subestado 'Cobrado'.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime
from typing import Any


# Subestados que NO son contacto efectivo (no se llegó a hablar con el cliente)
NO_CONTACTO_SUBESTADOS = {"No contesta", "Inubicables"}


def _pct(num: float, den: float, digits: int = 1) -> float:
    return round(num / den * 100, digits) if den else 0.0


def _funnel_metrics(gestiones: int, contactos: int, promesas: int, cobrados: int) -> dict[str, Any]:
    """Construye los % del funnel para un agregado (equipo, asesor o campaña)."""
    return {
        "gestiones": gestiones,
        "contactos_efectivos": contactos,
        "pct_contactos_efectivos": _pct(contactos, gestiones),
        "promesas": promesas,
        "pct_promesas_sobre_contactos": _pct(promesas, contactos),
        "promesas_cumplidas": cobrados,  # cada Cobrado = una promesa cumplida
        "pct_promesas_cumplidas": _pct(cobrados, promesas),
    }


def analyze_gestiones(rows: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(rows)

    # --- Identificación de póliza ---
    # "con_poliza_valor": la columna Póliza venía con algún dato (cualquier formato).
    # "con_poliza_normalizada": pudimos extraer (sec, pol) — listo para cruzar con DXP.
    con_poliza_valor = sum(1 for r in rows if r.get("has_value"))
    con_poliza_normalizada = sum(1 for r in rows if r.get("poliza_key"))
    con_poliza_num_solo = sum(
        1 for r in rows
        if r.get("has_value") and r.get("poliza_num") is not None and not r.get("poliza_key")
    )
    sin_poliza = total - con_poliza_valor
    polizas_unicas = len({r["poliza_key"] for r in rows if r.get("poliza_key")})
    polizas_num_unicas = len({
        r["poliza_num"] for r in rows
        if r.get("poliza_num") is not None and not r.get("poliza_key")
    })

    # --- Conteos globales por subestado y estado ---
    subestados_count = Counter(r["subestado"] for r in rows if r["subestado"])
    estados_count = Counter(r["estado"] for r in rows if r["estado"])

    # --- Por usuario ---
    by_user_sub: dict[str, Counter] = defaultdict(Counter)
    by_user_total: Counter = Counter()
    for r in rows:
        u = r["usuario"]
        s = r["subestado"]
        by_user_total[u] += 1
        if s:
            by_user_sub[u][s] += 1

    usuarios_set = sorted(by_user_total.keys(), key=lambda x: -by_user_total[x])

    # --- Por campaña (base de datos) ---
    by_camp_sub: dict[str, Counter] = defaultdict(Counter)
    by_camp_total: Counter = Counter()
    for r in rows:
        c = r.get("campana") or "Sin campaña"
        s = r["subestado"]
        by_camp_total[c] += 1
        if s:
            by_camp_sub[c][s] += 1

    # --- Funnel por equipo ---
    no_contacto = sum(subestados_count.get(s, 0) for s in NO_CONTACTO_SUBESTADOS)
    contactos_equipo = total - no_contacto
    promesas_equipo = subestados_count.get("Promesa de pago", 0)
    cobrados_equipo = subestados_count.get("Cobrado", 0)
    funnel_equipo = _funnel_metrics(total, contactos_equipo, promesas_equipo, cobrados_equipo)

    # --- Funnel por asesor ---
    asesores: list[dict[str, Any]] = []
    for u in usuarios_set:
        subs = by_user_sub[u]
        tot = by_user_total[u]
        no_cont = sum(subs.get(s, 0) for s in NO_CONTACTO_SUBESTADOS)
        contactos = tot - no_cont
        promesas = subs.get("Promesa de pago", 0)
        cobrados = subs.get("Cobrado", 0)
        asesores.append({
            "usuario": u,
            **_funnel_metrics(tot, contactos, promesas, cobrados),
            "subestados": dict(subs),
        })

    # --- Funnel por base de datos (campaña) — top 30 ---
    campanas: list[dict[str, Any]] = []
    for c in sorted(by_camp_total.keys(), key=lambda x: -by_camp_total[x])[:30]:
        subs = by_camp_sub[c]
        tot = by_camp_total[c]
        no_cont = sum(subs.get(s, 0) for s in NO_CONTACTO_SUBESTADOS)
        contactos = tot - no_cont
        promesas = subs.get("Promesa de pago", 0)
        cobrados = subs.get("Cobrado", 0)
        campanas.append({
            "campana": c,
            **_funnel_metrics(tot, contactos, promesas, cobrados),
        })

    # --- Serie diaria ---
    by_day: Counter = Counter()
    for r in rows:
        f = r["fecha"]
        if isinstance(f, datetime):
            by_day[f.date().isoformat()] += 1
    serie_diaria = [{"fecha": d, "gestiones": by_day[d]} for d in sorted(by_day.keys())]

    # --- Matrix subestados x asesor (gráfico apilado) ---
    subestados_top = [s for s, _ in subestados_count.most_common(10)]
    matrix = []
    for u in usuarios_set:
        row: dict[str, Any] = {"usuario": u}
        for s in subestados_top:
            row[s] = by_user_sub[u].get(s, 0)
        matrix.append(row)

    return {
        "kpis": {
            "total_gestiones": total,
            "asesores_activos": len(usuarios_set),
            "subestados_unicos": len(subestados_count),
            "campanas_unicas": len(by_camp_total),
            # Identificación de póliza (para diagnosticar archivos malformados
            # y dimensionar qué % se puede cruzar luego con cartera).
            "gestiones_con_poliza": con_poliza_valor,
            "pct_gestiones_con_poliza": _pct(con_poliza_valor, total, 1),
            "gestiones_sin_poliza": sin_poliza,
            "gestiones_poliza_normalizada": con_poliza_normalizada,
            "pct_gestiones_poliza_normalizada": _pct(con_poliza_normalizada, total, 1),
            "gestiones_poliza_solo_numero": con_poliza_num_solo,
            "polizas_unicas": polizas_unicas,
            "polizas_solo_numero_unicas": polizas_num_unicas,
            # Funnel del equipo
            **{f"equipo_{k}": v for k, v in funnel_equipo.items()},
            # Alias mantenidos para compatibilidad de modelos
            "promesas_totales": promesas_equipo,
            "cobros_totales": cobrados_equipo,
            "contactos_efectivos": contactos_equipo,
            "promesas_cumplidas": cobrados_equipo,
            "pct_promesas_cumplidas": funnel_equipo["pct_promesas_cumplidas"],
        },
        "funnel_equipo": funnel_equipo,
        "subestados": [
            {"subestado": s, "cantidad": n, "pct": _pct(n, total, 2)}
            for s, n in subestados_count.most_common()
        ],
        "estados": [{"estado": s, "cantidad": n} for s, n in estados_count.most_common()],
        "asesores": asesores,
        "campanas": campanas,
        "matrix_subestados": {
            "subestados": subestados_top,
            "data": matrix,
        },
        "serie_diaria": serie_diaria,
    }
