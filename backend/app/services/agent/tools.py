"""Tools curadas (read-only, no destructivas) del Agente de Experiencia · Atención.

Cada tool consulta analytics ya calculados o las filas granulares de gestiones,
recorta el payload (presupuesto de tokens) y redacta PII antes de devolver datos
al modelo. NO ejecutan SQL libre ni mutaciones.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import select

from ...core.database import session_scope
from ...models.atencion_gestion_item import AtencionGestionItem
from ...models.atencion_gestion_report import AtencionGestionReport
from ...models.atencion_llamadas_report import AtencionLlamadasReport
from .pii import redactar_item


@dataclass
class AgentContext:
    """Contexto compartido por las tools durante un turno del agente."""
    user_id: str
    default_month: str                         # YYYY-MM (mes por defecto = actual)
    canvas: list[dict] = field(default_factory=list)      # artefactos emitidos
    tool_trace: list[dict] = field(default_factory=list)  # auditoría de tools


def _bounds(month: str) -> tuple[date, date]:
    start = datetime.strptime(month, "%Y-%m").date().replace(day=1)
    end = (start.replace(year=start.year + 1, month=1)
           if start.month == 12 else start.replace(month=start.month + 1))
    return start, end


def _resolve_month(month: Optional[str], ctx: AgentContext) -> str:
    if not month or month.strip().lower() in ("actual", "current", "este mes", ""):
        return ctx.default_month
    return month.strip()[:7]


async def _periodos() -> list[str]:
    async with session_scope() as db:
        months: set[str] = set()
        for Model in (AtencionGestionReport, AtencionLlamadasReport):
            for (pm,) in (await db.execute(select(Model.period_month))).all():
                if pm:
                    months.add(pm.strftime("%Y-%m"))
    return sorted(months, reverse=True)


async def _latest(Model, month: str):
    start, end = _bounds(month)
    async with session_scope() as db:
        return (await db.execute(
            select(Model)
            .where(Model.period_month >= start, Model.period_month < end)
            .order_by(Model.generated_at.desc())
            .limit(1)
        )).scalar_one_or_none()


# --------------------------- implementaciones ---------------------------
async def listar_periodos_impl() -> dict[str, Any]:
    periodos = await _periodos()
    return {"periodos": periodos, "total": len(periodos)}


async def resumen_gestiones_impl(ctx: AgentContext, month: Optional[str]) -> dict[str, Any]:
    m = _resolve_month(month, ctx)
    rep = await _latest(AtencionGestionReport, m)
    if not rep:
        return {"sin_datos": True, "mes": m, "periodos_disponibles": await _periodos()}
    d = rep.data or {}
    pre = d.get("por_responsable_estado", {})
    return {
        "mes": m,
        "kpis": d.get("kpis"),
        "por_tipo": d.get("por_tipo"),
        "por_estado": d.get("por_estado"),
        "por_canal": d.get("por_canal"),
        "top_motivos": (d.get("top_motivos") or [])[:10],
        "por_responsable_estado": {
            "estados": pre.get("estados"),
            "responsables": pre.get("responsables"),
            "totales": pre.get("totales"),
        },
        "serie_estado_dia": d.get("serie_estado_dia"),
    }


async def voz_del_cliente_impl(ctx: AgentContext, month: Optional[str]) -> dict[str, Any]:
    m = _resolve_month(month, ctx)
    rep = await _latest(AtencionGestionReport, m)
    if not rep:
        return {"sin_datos": True, "mes": m, "periodos_disponibles": await _periodos()}
    v = (rep.data or {}).get("voz_cliente") or {}
    if not v.get("disponible"):
        return {"sin_datos": True, "mes": m, "motivo": "sin descripciones"}
    # Los ejemplos pueden contener PII (nombres/teléfonos): redactar.
    temas = []
    for t in v.get("temas", []):
        ejemplos = [redactar_item({"descripcion": e})["descripcion"] for e in t.get("ejemplos", [])]
        temas.append({**{k: t[k] for k in ("tema", "cantidad", "pct", "por_estado") if k in t},
                      "ejemplos": ejemplos})
    return {
        "mes": m,
        "total_descripciones": v.get("total_descripciones"),
        "friccion_pct": v.get("friccion_pct"),
        "friccion_cantidad": v.get("friccion_cantidad"),
        "temas": temas,
        "palabras_clave": (v.get("palabras_clave") or [])[:15],
        "frases_trigramas": v.get("frases_trigramas"),
        "frases_bigramas": v.get("frases_bigramas"),
    }


async def resumen_llamadas_impl(ctx: AgentContext, month: Optional[str]) -> dict[str, Any]:
    m = _resolve_month(month, ctx)
    rep = await _latest(AtencionLlamadasReport, m)
    if not rep:
        return {"sin_datos": True, "mes": m, "periodos_disponibles": await _periodos()}
    d = rep.data or {}
    operadores = sorted(d.get("operadores", []), key=lambda o: -o.get("total", 0))[:15]
    return {
        "mes": m,
        "kpis": d.get("kpis"),
        "por_cola": d.get("por_cola"),
        "por_dia": d.get("por_dia"),
        "operadores": operadores,
        "auxiliares_equipo": d.get("auxiliares_equipo"),
    }


_CAMPOS_ITEM = {
    "tema": AtencionGestionItem.tema,
    "estado": AtencionGestionItem.estado,
    "canal": AtencionGestionItem.canal,
    "tipo_caso": AtencionGestionItem.tipo_caso,
    "responsable": AtencionGestionItem.responsable,
    "motivo": AtencionGestionItem.motivo,
}


async def buscar_gestiones_impl(
    ctx: AgentContext, month: Optional[str], tema: Optional[str], estado: Optional[str],
    canal: Optional[str], responsable: Optional[str], texto: Optional[str], limit: int,
) -> dict[str, Any]:
    m = _resolve_month(month, ctx)
    start, end = _bounds(m)
    limit = max(1, min(limit or 20, 50))
    async with session_scope() as db:
        stmt = select(AtencionGestionItem).where(
            AtencionGestionItem.period_month >= start, AtencionGestionItem.period_month < end)
        if tema:
            stmt = stmt.where(AtencionGestionItem.tema == tema)
        if estado:
            stmt = stmt.where(AtencionGestionItem.estado.ilike(f"%{estado}%"))
        if canal:
            stmt = stmt.where(AtencionGestionItem.canal.ilike(f"%{canal}%"))
        if responsable:
            stmt = stmt.where(AtencionGestionItem.responsable.ilike(f"%{responsable}%"))
        if texto:
            stmt = stmt.where(AtencionGestionItem.descripcion.ilike(f"%{texto}%"))
        rows = (await db.execute(stmt.limit(limit))).scalars().all()

    items = [redactar_item({
        "fecha": r.fecha.isoformat() if r.fecha else None,
        "cliente": r.cliente, "documento": r.documento, "telefono": r.telefono,
        "tipo_caso": r.tipo_caso, "estado": r.estado, "motivo": r.motivo,
        "canal": r.canal, "responsable": r.responsable, "tema": r.tema,
        "descripcion": r.descripcion,
    }) for r in rows]
    return {"mes": m, "cantidad": len(items), "limite": limit, "gestiones": items}


async def contar_gestiones_impl(ctx: AgentContext, month: Optional[str], agrupar_por: str) -> dict[str, Any]:
    m = _resolve_month(month, ctx)
    start, end = _bounds(m)
    col = _CAMPOS_ITEM.get(agrupar_por)
    if col is None:
        return {"error": f"agrupar_por debe ser uno de {list(_CAMPOS_ITEM)}"}
    from sqlalchemy import func
    async with session_scope() as db:
        rows = (await db.execute(
            select(col, func.count()).where(
                AtencionGestionItem.period_month >= start, AtencionGestionItem.period_month < end
            ).group_by(col).order_by(func.count().desc())
        )).all()
    total = sum(n for _, n in rows)
    return {
        "mes": m, "agrupar_por": agrupar_por, "total": total,
        "conteo": [{"valor": v or "(vacío)", "cantidad": n,
                    "pct": round(n / total * 100, 1) if total else 0.0} for v, n in rows],
    }
