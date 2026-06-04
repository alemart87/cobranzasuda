"""Analyzer del Reporte de Gestiones — Atención al Cliente.

Registros de contacto: por tipo de caso, por estado, top motivos, por canal.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

from ..parsers._text import strip_accents

# Estados que se consideran "resueltos/cerrados" para el % de resolución.
_CERRADO = {"cerrado", "resuelto", "finalizado"}


def _dist(values: list[str], top: int | None = None) -> list[dict[str, Any]]:
    total = sum(1 for v in values if v)
    cnt = Counter(v for v in values if v)
    items = cnt.most_common(top)
    return [
        {"label": k, "cantidad": n, "pct": round(n / total * 100, 1) if total else 0.0}
        for k, n in items
    ]


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

    # Serie por día (fecha de llamada).
    por_dia_acc: dict[str, int] = defaultdict(int)
    for r in rows:
        dt = r.get("fecha_llamada_dt")
        if dt:
            por_dia_acc[dt.date().isoformat()] += 1
    por_dia = [{"dia": d, "cantidad": n} for d, n in sorted(por_dia_acc.items())]

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
        "top_motivos": motivos,
        "por_canal": canales,
        "por_departamento": departamentos,
        "por_seccion": secciones,
        "por_responsable": responsables,
        "por_dia": por_dia,
    }
