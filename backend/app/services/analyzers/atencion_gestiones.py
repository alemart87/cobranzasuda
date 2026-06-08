"""Analyzer del Reporte de Gestiones — Atención al Cliente.

Registros de contacto: por tipo de caso, por estado, top motivos, por canal.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

from ..parsers._text import strip_accents
from .voz_cliente import analizar_voz_cliente

# Estados que se consideran "resueltos/cerrados" para el % de resolución.
_CERRADO = {"cerrado", "resuelto", "finalizado"}

# Orden preferido de estados en tablas/series (el resto va después, alfabético).
_ESTADO_ORDEN = ["Cerrado", "En proceso", "Pendiente"]
_SIN_ESTADO = "(sin estado)"


def _dist(values: list[str], top: int | None = None) -> list[dict[str, Any]]:
    total = sum(1 for v in values if v)
    cnt = Counter(v for v in values if v)
    items = cnt.most_common(top)
    return [
        {"label": k, "cantidad": n, "pct": round(n / total * 100, 1) if total else 0.0}
        for k, n in items
    ]


def _orden_estados(presentes: dict[str, str]) -> list[str]:
    """Devuelve los estados presentes con `_ESTADO_ORDEN` primero, resto alfabético.

    `presentes`: {clave_normalizada: etiqueta_original}.
    """
    ordered: list[str] = []
    seen: set[str] = set()
    for pref in _ESTADO_ORDEN:
        key = strip_accents(pref)
        if key in presentes and key not in seen:
            ordered.append(presentes[key])
            seen.add(key)
    for key in sorted(presentes):
        if key not in seen:
            ordered.append(presentes[key])
            seen.add(key)
    return ordered


def analyze_atencion_gestiones(rows: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(rows)

    tipos = _dist([r.get("tipo_caso", "") for r in rows])
    estados = _dist([r.get("estado", "") for r in rows])
    motivos = _dist([r.get("motivo", "") for r in rows], top=15)
    canales = _dist([r.get("canal", "") for r in rows])
    departamentos = _dist([r.get("departamento", "") for r in rows], top=12)
    secciones = _dist([r.get("seccion", "") for r in rows], top=12)
    responsables = _dist([r.get("responsable", "") for r in rows], top=15)

    cerrados = sum(1 for r in rows if strip_accents(r.get("estado", "")) in _CERRADO)
    pendientes = total - cerrados

    # --- Lista canónica de estados presentes (etiqueta de cada fila) ---
    def estado_label(r: dict[str, Any]) -> str:
        return (r.get("estado") or "").strip() or _SIN_ESTADO

    presentes: dict[str, str] = {}
    for r in rows:
        e = estado_label(r)
        presentes.setdefault(strip_accents(e), e)
    estados_lista = _orden_estados(presentes)

    # --- Cruce Responsable × Estado (tabla dinámica) ---
    resp_acc: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    resp_total: dict[str, int] = defaultdict(int)
    for r in rows:
        resp = (r.get("responsable") or "").strip() or "(sin responsable)"
        resp_acc[resp][estado_label(r)] += 1
        resp_total[resp] += 1

    responsables_estado = [
        {
            "responsable": resp,
            "por_estado": {e: resp_acc[resp].get(e, 0) for e in estados_lista},
            "total": resp_total[resp],
        }
        for resp in sorted(resp_acc, key=lambda x: -resp_total[x])
    ]
    totales_estado = {e: sum(resp_acc[r].get(e, 0) for r in resp_acc) for e in estados_lista}
    por_responsable_estado = {
        "estados": estados_lista,
        "responsables": responsables_estado,
        "totales": {**totales_estado, "total": total},
    }

    # --- Serie por día (total) + serie por día partida por estado ---
    por_dia_acc: dict[str, int] = defaultdict(int)
    dia_estado_acc: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for r in rows:
        dt = r.get("fecha_llamada_dt")
        if dt:
            d = dt.date().isoformat()
            por_dia_acc[d] += 1
            dia_estado_acc[d][estado_label(r)] += 1
    por_dia = [{"dia": d, "cantidad": n} for d, n in sorted(por_dia_acc.items())]
    serie_estado_dia = [
        {"dia": d, **{e: dia_estado_acc[d].get(e, 0) for e in estados_lista}}
        for d in sorted(dia_estado_acc)
    ]

    kpis = {
        "total_gestiones": total,
        "cerrados": cerrados,
        "pendientes": pendientes,
        "pct_cerrados": round(cerrados / total * 100, 1) if total else 0.0,
        "tipos_distintos": len([t for t in tipos if t["label"]]),
        "canales_distintos": len([c for c in canales if c["label"]]),
        "motivos_distintos": len([m for m in motivos if m["label"]]),
    }

    return {
        "kpis": kpis,
        "por_tipo": tipos,
        "por_estado": estados,
        "estados_lista": estados_lista,
        "por_responsable_estado": por_responsable_estado,
        "serie_estado_dia": serie_estado_dia,
        "top_motivos": motivos,
        "por_canal": canales,
        "por_departamento": departamentos,
        "por_seccion": secciones,
        "por_responsable": responsables,
        "por_dia": por_dia,
        "voz_cliente": analizar_voz_cliente(rows),
    }
