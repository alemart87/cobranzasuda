"""Análisis de Gestiones CRM (Televentas) — funnel de gestión comercial.

Subestados del CRM de ventas: No contesta / No acepta / Agendado / Acepta.
- CONTACTO = gestión con respuesta del cliente (subestado ≠ 'No contesta').
- TASA DE ACEPTACIÓN = aceptas ÷ contactos (sobre los que atendieron).
Incluye serie diaria con acumulado, productividad por operador y por campaña,
y 'La Voz del Cliente en Ventas' sobre las observaciones.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

from ..parsers._text import strip_accents
from .voz_ventas import analizar_voz_ventas, clasificar_motivo


def _pct(part: float, whole: float) -> float:
    return round(part / whole * 100, 1) if whole else 0.0


def _cat(subestado: str) -> str:
    s = strip_accents(subestado or "")
    if "no contesta" in s:
        return "no_contesta"
    if "no acepta" in s:
        return "no_acepta"
    if "agend" in s:
        return "agendado"
    if "acepta" in s:
        return "acepta"
    return "otro"


def analyze_televentas_crm(rows: list[dict[str, Any]]) -> dict:
    total = len(rows)
    cats = Counter(_cat(r.get("subestado", "")) for r in rows)
    contactos = total - cats.get("no_contesta", 0)
    aceptas = cats.get("acepta", 0)
    agendados = cats.get("agendado", 0)
    no_acepta = cats.get("no_acepta", 0)

    dias = {r["fecha"].date() for r in rows if r.get("fecha")}
    n_dias = len(dias)

    # ---- por día (con acumulado y prom/operador) ----
    pd: dict[str, dict] = defaultdict(lambda: {"gestiones": 0, "contactos": 0, "aceptas": 0,
                                               "agendados": 0, "operadores": set()})
    for r in rows:
        if not r.get("fecha"):
            continue
        k = r["fecha"].date().isoformat()
        c = _cat(r.get("subestado", ""))
        pd[k]["gestiones"] += 1
        pd[k]["operadores"].add(r.get("usuario", ""))
        if c != "no_contesta":
            pd[k]["contactos"] += 1
        if c == "acepta":
            pd[k]["aceptas"] += 1
        if c == "agendado":
            pd[k]["agendados"] += 1
    por_dia = []
    acumulado = 0
    for k in sorted(pd.keys()):
        v = pd[k]
        acumulado += v["gestiones"]
        n_ops = len(v["operadores"])
        por_dia.append({
            "fecha": k, "gestiones": v["gestiones"], "acumulado": acumulado,
            "contactos": v["contactos"], "aceptas": v["aceptas"], "agendados": v["agendados"],
            "operadores_activos": n_ops,
            "prom_por_operador": round(v["gestiones"] / n_ops, 1) if n_ops else 0,
        })

    # ---- por operador (productividad) ----
    po: dict[str, dict] = defaultdict(lambda: {"gestiones": 0, "no_contesta": 0, "no_acepta": 0,
                                               "agendados": 0, "aceptas": 0, "otro": 0, "dias": set()})
    for r in rows:
        u = (r.get("usuario") or "").strip() or "(sin usuario)"
        d = po[u]
        d["gestiones"] += 1
        c = _cat(r.get("subestado", ""))
        key = {"no_contesta": "no_contesta", "no_acepta": "no_acepta",
               "agendado": "agendados", "acepta": "aceptas"}.get(c, "otro")
        d[key] += 1
        if r.get("fecha"):
            d["dias"].add(r["fecha"].date())
    por_operador = []
    for u, d in po.items():
        cont = d["gestiones"] - d["no_contesta"]
        nd = len(d["dias"])
        por_operador.append({
            "operador": u,
            "gestiones": d["gestiones"],
            "no_contesta": d["no_contesta"],
            "contactos": cont,
            "pct_contacto": _pct(cont, d["gestiones"]),
            "no_acepta": d["no_acepta"],
            "agendados": d["agendados"],
            "aceptas": d["aceptas"],
            "tasa_aceptacion_pct": _pct(d["aceptas"], cont),
            "dias_activos": nd,
            "prom_diario": round(d["gestiones"] / nd, 1) if nd else 0,
        })
    por_operador.sort(key=lambda x: -x["gestiones"])

    # ---- por campaña ----
    pc: dict[str, dict] = defaultdict(lambda: {"gestiones": 0, "contactos": 0, "aceptas": 0})
    for r in rows:
        k = (r.get("campana") or "").strip() or "(sin campaña)"
        c = _cat(r.get("subestado", ""))
        pc[k]["gestiones"] += 1
        if c != "no_contesta":
            pc[k]["contactos"] += 1
        if c == "acepta":
            pc[k]["aceptas"] += 1
    por_campana = [{"campana": k, "gestiones": v["gestiones"], "contactos": v["contactos"],
                    "pct_contacto": _pct(v["contactos"], v["gestiones"]), "aceptas": v["aceptas"]}
                   for k, v in sorted(pc.items(), key=lambda kv: -kv[1]["gestiones"])]

    # ---- subestados crudos (funnel visible) ----
    sub_raw = Counter((r.get("subestado") or "").strip() or "(sin subestado)" for r in rows)
    por_subestado = [{"subestado": k, "cantidad": v, "pct": _pct(v, total)}
                     for k, v in sub_raw.most_common()]

    total_ops = len(po)
    return {
        "kpis": {
            "total_gestiones": total,
            "contactos": contactos,
            "tasa_contacto_pct": _pct(contactos, total),
            "no_contesta": cats.get("no_contesta", 0),
            "no_acepta": no_acepta,
            "agendados": agendados,
            "aceptas": aceptas,
            "tasa_aceptacion_pct": _pct(aceptas, contactos),
            "operadores_activos": total_ops,
            "dias_operativos": n_dias,
            "prom_gestiones_dia": round(total / n_dias) if n_dias else 0,
            "prom_gestiones_operador_dia": round(
                sum(d["gestiones"] for d in po.values())
                / max(sum(len(d["dias"]) for d in po.values()), 1), 1),
        },
        "por_subestado": por_subestado,
        "por_dia": por_dia,
        "por_operador": por_operador,
        "por_campana": por_campana,
        "voz_ventas": analizar_voz_ventas(rows),
    }


def build_crm_items(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Filas granulares para drilldown/agente (una por gestión)."""
    items = []
    for r in rows:
        f = r.get("fecha")
        items.append({
            "fecha": f.date() if f else None,
            "usuario": (r.get("usuario") or "")[:160] or None,
            "subestado": (r.get("subestado") or "")[:120] or None,
            "campana": (r.get("campana") or "")[:160] or None,
            "cliente": (r.get("lead") or "")[:255] or None,
            "observacion": (r.get("observacion") or "") or None,
            "motivo": clasificar_motivo(r.get("observacion", ""))[:80],
        })
    return items
