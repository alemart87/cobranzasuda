"""Gestión de liderazgo y seguimiento — Televentas (Sudameris).

Dashboard semanal para la reunión de los viernes: qué acciones se tomaron en la
semana, cuántas mitigaciones se aplicaron y a qué asesor, quién las hizo, qué
alertas siguen sin atender y cómo van los compromisos de la reunión.

Fuentes:
- Compromisos de la reunión (TeleventasCompromiso): por semana, responsable y estado.
- Alertas de eficiencia (TeleventasAlerta): una por asesor fuera de objetivo, con
  flujo activa → en_mitigacion → mitigada / apagada y un seguimiento con autor,
  fecha, acción y comentario por cada paso. "Mitigación aplicada" = acción `mitigar`
  (se abre un plan) o `resolver` (se cierra con resultado) dentro del período.

Función pura sobre listas de dicts para poder testearla sin base de datos.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Optional

ACCIONES_MITIGACION = ("mitigar", "resolver")
ACCIONES_GESTION = ("mitigar", "resolver", "apagar", "reactivar", "comentar")
ESTADOS_ALERTA = ("activa", "en_mitigacion", "mitigada", "apagada")
ESTADOS_COMPROMISO = ("pendiente", "en_proceso", "cumplido")
ABIERTAS = ("activa", "en_mitigacion")

ACCION_LABEL = {
    "creada": "Alerta generada", "actualizada": "Alerta actualizada", "mitigar": "Mitigación iniciada",
    "resolver": "Resuelta", "apagar": "Apagada", "reactivar": "Reactivada", "comentar": "Comentario",
}


def _fecha(v: Any) -> Optional[date]:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00")).date()
    except ValueError:
        return None


def rango_semana(semana: str, dias: int = 7) -> tuple[Optional[date], Optional[date]]:
    """Rango [desde, hasta] de una semana por su clave de inicio 'YYYY-MM-DD'.
    Claves 'YYYY-Www' (formato viejo) → semana ISO."""
    try:
        if "-W" in semana:
            y, w = semana.split("-W")
            ini = date.fromisocalendar(int(y), int(w), 1)
        else:
            ini = date.fromisoformat(semana[:10])
    except (ValueError, TypeError):
        return None, None
    return ini, ini + timedelta(days=dias - 1)


def gestion_semanal(compromisos: list[dict], alertas: list[dict], semana: str,
                    desde: Optional[date] = None, hasta: Optional[date] = None,
                    hoy: Optional[date] = None, monitoreos: Optional[list[dict]] = None,
                    agentes_activos: Optional[float] = None) -> dict[str, Any]:
    """Arma el dashboard de gestión de la semana `semana` (clave de inicio).

    `desde`/`hasta` acotan las ACCIONES del seguimiento que cuentan como "de la
    semana"; si no vienen, se derivan de la clave (7 días)."""
    hoy = hoy or date.today()
    if desde is None or hasta is None:
        d0, d1 = rango_semana(semana)
        desde, hasta = desde or d0, hasta or d1
    en_semana = lambda f: bool(f) and desde is not None and hasta is not None and desde <= f <= hasta  # noqa: E731

    # ---------------- compromisos ----------------
    comp_sem = [c for c in compromisos if c.get("semana") == semana]
    comp_prev = [c for c in compromisos if (c.get("semana") or "") < semana and c.get("estado") != "cumplido"]

    def _resumen_comp(items: list[dict]) -> dict:
        out = {"total": len(items)}
        for e in ESTADOS_COMPROMISO:
            out[e] = sum(1 for c in items if c.get("estado") == e)
        out["cumplimiento_pct"] = round(out["cumplido"] / len(items) * 100, 1) if items else 0.0
        return out

    por_resp: dict[str, dict] = {}
    for r in ("Voicenter", "Sudameris"):
        por_resp[r] = _resumen_comp([c for c in comp_sem if c.get("responsable") == r])
    compromisos_out = {
        "semana": {**_resumen_comp(comp_sem), "por_responsable": por_resp,
                   "items": sorted(comp_sem, key=lambda c: (c.get("responsable") or "", c.get("created_at") or ""))},
        "arrastrados": {**_resumen_comp(comp_prev),
                        "items": sorted(comp_prev, key=lambda c: c.get("semana") or "")},
        "historico": _resumen_comp(compromisos),
    }

    # ---------------- alertas / mitigaciones ----------------
    estado_actual = {e: 0 for e in ESTADOS_ALERTA}
    acciones_semana: dict[str, int] = defaultdict(int)
    timeline: list[dict] = []
    por_asesor: dict[str, dict] = {}
    por_lider: dict[str, dict] = {}
    sin_atender: list[dict] = []

    for a in alertas:
        est = a.get("estado") or "activa"
        if est in estado_actual:
            estado_actual[est] += 1
        seg = list(a.get("seguimiento") or [])
        op = a.get("operador") or "—"
        asesor = por_asesor.setdefault(op, {
            "asesor": op, "alertas": 0, "abiertas": 0, "estado": None, "severidad": None, "mes": None,
            "indice": None, "motivo": None, "estado_operador": None,
            "mitigaciones_semana": 0, "mitigaciones_total": 0, "resueltas_semana": 0, "resueltas_total": 0,
            "apagadas_total": 0, "comentarios_semana": 0, "acciones_semana": 0,
            "ultima_accion": None, "dias_sin_accion": None,
        })
        asesor["alertas"] += 1
        if est in ABIERTAS:
            asesor["abiertas"] += 1
        # la alerta "vigente" del asesor: la abierta más reciente; si no hay, la más reciente
        creada = _fecha(a.get("created_at"))
        vig_key = (1 if est in ABIERTAS else 0, creada or date.min)
        if asesor.get("_vig_key") is None or vig_key > asesor["_vig_key"]:
            asesor["_vig_key"] = vig_key
            asesor["estado"] = est
            asesor["severidad"] = a.get("severidad")
            asesor["mes"] = a.get("mes")
            det = a.get("detalle") or {}
            asesor["indice"] = det.get("indice")
            asesor["motivo"] = det.get("motivo")
            asesor["estado_operador"] = a.get("estado_operador")

        ultima_gestion: Optional[date] = None
        for s in seg:
            f = _fecha(s.get("fecha"))
            acc = (s.get("accion") or "").lower()
            if acc in ACCIONES_GESTION and f and (ultima_gestion is None or f > ultima_gestion):
                ultima_gestion = f
            if acc == "mitigar":
                asesor["mitigaciones_total"] += 1
            elif acc == "resolver":
                asesor["resueltas_total"] += 1
            elif acc == "apagar":
                asesor["apagadas_total"] += 1
            ua = asesor.get("ultima_accion")
            if acc in ACCIONES_GESTION and f and (ua is None or (ua.get("_f") or date.min) < f):
                asesor["ultima_accion"] = {"_f": f, "fecha": s.get("fecha"), "autor": s.get("autor"),
                                          "accion": acc, "label": ACCION_LABEL.get(acc, acc),
                                          "estado": s.get("estado"), "comentario": s.get("comentario")}
            if not en_semana(f):
                continue
            acciones_semana[acc] += 1
            if acc in ACCIONES_GESTION:
                asesor["acciones_semana"] += 1
                lider = por_lider.setdefault(s.get("autor") or "—", {"lider": s.get("autor") or "—", "acciones": 0,
                                                                     "mitigar": 0, "resolver": 0, "apagar": 0,
                                                                     "reactivar": 0, "comentar": 0, "asesores": set()})
                lider["acciones"] += 1
                lider[acc] = lider.get(acc, 0) + 1
                lider["asesores"].add(op)
            if acc == "mitigar":
                asesor["mitigaciones_semana"] += 1
            elif acc == "resolver":
                asesor["resueltas_semana"] += 1
            elif acc == "comentar":
                asesor["comentarios_semana"] += 1
            timeline.append({"fecha": s.get("fecha"), "autor": s.get("autor"), "accion": acc,
                             "label": ACCION_LABEL.get(acc, acc), "estado": s.get("estado"),
                             "comentario": s.get("comentario"), "asesor": op, "alerta_id": a.get("id"),
                             "severidad": a.get("severidad")})

        # Sin atender = activa y SIN NINGUNA gestión en la semana (ni mitigación ni comentario):
        # un comentario del líder ya cuenta como caso gestionado.
        gestion_en_semana = any((x.get("accion") or "").lower() in ACCIONES_GESTION and en_semana(_fecha(x.get("fecha"))) for x in seg)
        if est == "activa" and not gestion_en_semana:
            ref = ultima_gestion or creada
            dias = (hoy - ref).days if ref else None
            sin_atender.append({"asesor": op, "alerta_id": a.get("id"), "severidad": a.get("severidad"),
                                "titulo": a.get("titulo"), "mes": a.get("mes"), "dias_sin_accion": dias,
                                "nunca_gestionada": ultima_gestion is None})

    for asesor in por_asesor.values():
        asesor.pop("_vig_key", None)
        ua = asesor.get("ultima_accion")
        if ua:
            f = ua.pop("_f", None)
            asesor["dias_sin_accion"] = (hoy - f).days if f else None
    asesores = sorted(por_asesor.values(),
                      key=lambda x: (-x["abiertas"], -(x["mitigaciones_semana"] + x["resueltas_semana"]), x["asesor"]))
    lideres = []
    for l in por_lider.values():
        l["asesores"] = sorted(l["asesores"])
        l["asesores_n"] = len(l["asesores"])
        lideres.append(l)
    lideres.sort(key=lambda x: (-x["acciones"], x["lider"]))
    timeline.sort(key=lambda x: x.get("fecha") or "", reverse=True)
    sin_atender.sort(key=lambda x: (-(x["dias_sin_accion"] or 0), x["asesor"]))

    # Un asesor con CUALQUIER acción registrada en la semana (mitigar, resolver, apagar,
    # reactivar o un comentario) es un caso GESTIONADO: el comentario también cuenta.
    gestionados = sorted(a["asesor"] for a in asesores if a["acciones_semana"] > 0)
    for a in asesores:
        a["gestionado_semana"] = a["acciones_semana"] > 0
    con_alerta_abierta = [a for a in asesores if a["abiertas"] > 0]
    abiertas_gestionadas = sum(1 for a in con_alerta_abierta if a["gestionado_semana"])

    # ---------------- monitoreos de calidad de la semana ----------------
    moni_sem = []
    for m in (monitoreos or []):
        f = _fecha(m.get("fecha_monitoreo"))
        if en_semana(f):
            moni_sem.append(m)
    ops_moni = sorted({m.get("operador") for m in moni_sem if m.get("operador")})
    devueltos = [m for m in moni_sem if (m.get("estado_devolucion") or "pendiente") == "devuelto"]
    precs = [float(m["precision"]) for m in moni_sem if m.get("precision") is not None]
    por_op_moni: dict[str, dict] = {}
    for m in moni_sem:
        o = por_op_moni.setdefault(m.get("operador") or "—", {"asesor": m.get("operador") or "—", "monitoreos": 0, "devueltos": 0, "precs": []})
        o["monitoreos"] += 1
        if (m.get("estado_devolucion") or "pendiente") == "devuelto":
            o["devueltos"] += 1
        if m.get("precision") is not None:
            o["precs"].append(float(m["precision"]))
    moni_por_asesor = sorted([{"asesor": o["asesor"], "monitoreos": o["monitoreos"], "devueltos": o["devueltos"],
                               "pendientes": o["monitoreos"] - o["devueltos"],
                               "precision_promedio": round(sum(o["precs"]) / len(o["precs"]), 1) if o["precs"] else None}
                              for o in por_op_moni.values()], key=lambda x: (x["precision_promedio"] if x["precision_promedio"] is not None else 999, x["asesor"]))
    denominador = float(agentes_activos) if agentes_activos else None
    monitoreos_out = {
        "monitoreos": len(moni_sem),
        "operadores_monitoreados": len(ops_moni),
        "operadores_monitoreados_lista": ops_moni,
        "agentes_activos": denominador,
        "pct_monitoreo": round(len(ops_moni) / denominador * 100, 1) if denominador else None,
        "devueltos": len(devueltos),
        "pendientes": len(moni_sem) - len(devueltos),
        "pct_devueltos": round(len(devueltos) / len(moni_sem) * 100, 1) if moni_sem else 0.0,
        "precision_promedio": round(sum(precs) / len(precs), 1) if precs else None,
        "criticos": sum(1 for m in moni_sem if m.get("critico")),
        "por_asesor": moni_por_asesor,
    }

    mitig_semana = acciones_semana.get("mitigar", 0) + acciones_semana.get("resolver", 0)
    asesores_mitigados = sorted({t["asesor"] for t in timeline if t["accion"] in ACCIONES_MITIGACION})
    total_gestion = sum(v for k, v in acciones_semana.items() if k in ACCIONES_GESTION)

    return {
        "semana": semana,
        "periodo": {"desde": desde.isoformat() if desde else None, "hasta": hasta.isoformat() if hasta else None},
        "resumen": {
            "acciones_semana": total_gestion,
            "mitigaciones_semana": mitig_semana,
            "asesores_mitigados": len(asesores_mitigados),
            "asesores_mitigados_lista": asesores_mitigados,
            "alertas_abiertas": estado_actual["activa"] + estado_actual["en_mitigacion"],
            "sin_atender": len(sin_atender),
            "sin_atender_nunca": sum(1 for s in sin_atender if s["nunca_gestionada"]),
            "casos_gestionados": len(gestionados),
            "casos_gestionados_lista": gestionados,
            "abiertas_gestionadas": abiertas_gestionadas,
            "abiertas_sin_gestion": len(con_alerta_abierta) - abiertas_gestionadas,
            "monitoreos_semana": monitoreos_out["monitoreos"],
            "operadores_monitoreados": monitoreos_out["operadores_monitoreados"],
            "pct_monitoreo": monitoreos_out["pct_monitoreo"],
            "monitoreos_devueltos": monitoreos_out["devueltos"],
            "compromisos_semana": compromisos_out["semana"]["total"],
            "compromisos_cumplidos": compromisos_out["semana"]["cumplido"],
            "arrastrados": compromisos_out["arrastrados"]["total"],
            "lideres_activos": len(lideres),
        },
        "compromisos": compromisos_out,
        "monitoreos": monitoreos_out,
        "alertas": {
            "estado_actual": estado_actual,
            "acciones_semana": {k: acciones_semana.get(k, 0) for k in ("creada", "actualizada", *ACCIONES_GESTION)},
            "por_asesor": asesores,
            "por_lider": lideres,
            "sin_atender": sin_atender,
            "timeline": timeline,
        },
    }
