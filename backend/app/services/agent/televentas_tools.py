"""Tools curadas (read-only) del Agente de Televentas.

Consultan los reportes ya procesados (llamadas + producción) y el overview
combinado. NO ejecutan SQL libre ni mutaciones. Reutilizan `AgentContext`.
La identidad del asegurado se enmascara antes de enviarla al modelo.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import select

from ...core.database import session_scope
from ...models.televentas_llamadas_report import TeleventasLlamadasReport
from ...models.televentas_produccion_report import TeleventasProduccionReport
from ...models.televentas_produccion_item import TeleventasProduccionItem
from ...services.analyzers.televentas_overview import combine_televentas


def _bounds(month: str) -> tuple[date, date]:
    start = datetime.strptime(month, "%Y-%m").date().replace(day=1)
    end = start.replace(year=start.year + 1, month=1) if start.month == 12 else start.replace(month=start.month + 1)
    return start, end


async def _periodos() -> list[str]:
    async with session_scope() as db:
        months: set[str] = set()
        for Model in (TeleventasLlamadasReport, TeleventasProduccionReport):
            for (pm,) in (await db.execute(select(Model.period_month).where(Model.period_month.isnot(None)))).all():
                if pm:
                    months.add(pm.strftime("%Y-%m"))
    return sorted(months, reverse=True)


async def _resolve_month(mes: Optional[str]) -> Optional[str]:
    mes = (mes or "").strip()
    periodos = await _periodos()
    if mes and mes in periodos:
        return mes
    return periodos[0] if periodos else None


async def _latest(Model, month: str):
    start, end = _bounds(month)
    async with session_scope() as db:
        return (await db.execute(
            select(Model).where(Model.period_month >= start, Model.period_month < end)
            .order_by(Model.generated_at.desc()).limit(1)
        )).scalars().first()


async def tv_listar_periodos_impl() -> dict[str, Any]:
    """Meses con datos y qué fuentes están disponibles en cada uno."""
    periodos = await _periodos()
    if not periodos:
        return {"sin_datos": True, "mensaje": "No hay reportes de televentas cargados todavía."}
    out = []
    for m in periodos:
        ll = await _latest(TeleventasLlamadasReport, m)
        pr = await _latest(TeleventasProduccionReport, m)
        out.append({"mes": m, "tiene_llamadas": ll is not None, "tiene_produccion": pr is not None,
                    "publicado_llamadas": bool(ll and ll.is_published), "publicado_produccion": bool(pr and pr.is_published)})
    return {"periodos": out, "total": len(out)}


async def tv_overview_impl(mes: Optional[str] = None) -> dict[str, Any]:
    """Overview COMBINADO del mes: KPIs (llamadas + producción), conversión, ranking por vendedor
    y ALERTAS de bajo desempeño. Es la mejor tool para una visión gerencial del mes."""
    month = await _resolve_month(mes)
    if not month:
        return {"sin_datos": True, "mensaje": "No hay datos de televentas cargados."}
    ll = await _latest(TeleventasLlamadasReport, month)
    pr = await _latest(TeleventasProduccionReport, month)
    ov = combine_televentas(ll.data if ll else None, pr.data if pr else None)
    return {"mes": month, "tiene_llamadas": ll is not None, "tiene_produccion": pr is not None, "overview": ov}


async def tv_produccion_impl(mes: Optional[str] = None) -> dict[str, Any]:
    """Detalle de PRODUCCIÓN del mes: KPIs (emitidas/anuladas, prima, ticket, días productivos),
    mix por tipo de póliza, ranking por vendedor, por canal y por medio de cobro, y producción por día."""
    month = await _resolve_month(mes)
    pr = await _latest(TeleventasProduccionReport, month) if month else None
    if not pr:
        return {"sin_datos": True, "mensaje": f"No hay reporte de producción para {month or 'ningún mes'}."}
    d = pr.data or {}
    return {"mes": month, "kpis": d.get("kpis", {}), "por_producto": d.get("por_producto", []),
            "por_vendedor": d.get("por_vendedor", []), "por_canal": d.get("por_canal", []),
            "por_cobrador": d.get("por_cobrador", []), "por_dia": d.get("por_dia", [])}


async def tv_llamadas_impl(mes: Optional[str] = None) -> dict[str, Any]:
    """Detalle de LLAMADAS del mes: KPIs (total, contestadas, TMO, días operativos), ranking por
    vendedor y llamadas por día."""
    month = await _resolve_month(mes)
    ll = await _latest(TeleventasLlamadasReport, month) if month else None
    if not ll:
        return {"sin_datos": True, "mensaje": f"No hay reporte de llamadas para {month or 'ningún mes'}."}
    d = ll.data or {}
    return {"mes": month, "kpis": d.get("kpis", {}), "por_vendedor": d.get("por_vendedor", []),
            "por_dia": d.get("por_dia", [])}


async def tv_ranking_vendedores_impl(mes: Optional[str] = None) -> dict[str, Any]:
    """Ranking combinado por vendedor (llamadas + producción + conversión) y las alertas del mes."""
    month = await _resolve_month(mes)
    if not month:
        return {"sin_datos": True, "mensaje": "No hay datos de televentas cargados."}
    ll = await _latest(TeleventasLlamadasReport, month)
    pr = await _latest(TeleventasProduccionReport, month)
    ov = combine_televentas(ll.data if ll else None, pr.data if pr else None)
    return {"mes": month, "por_vendedor": ov.get("por_vendedor", []), "alertas": ov.get("alertas", [])}


async def tv_buscar_polizas_impl(mes: Optional[str] = None, vendedor: Optional[str] = None,
                                 producto: Optional[str] = None, tipo: Optional[str] = None,
                                 limite: int = 50) -> dict[str, Any]:
    """Lista pólizas del mes filtrables por vendedor / producto / tipo (emitidas|anuladas).
    La identidad del asegurado se enmascara. `limite` acotado a 200."""
    month = await _resolve_month(mes)
    pr = await _latest(TeleventasProduccionReport, month) if month else None
    if not pr:
        return {"sin_datos": True, "mensaje": f"No hay producción para {month or 'ningún mes'}."}
    limite = max(1, min(limite, 200))
    async with session_scope() as db:
        stmt = select(TeleventasProduccionItem).where(TeleventasProduccionItem.report_id == pr.id)
        if vendedor:
            stmt = stmt.where(TeleventasProduccionItem.vendedor == vendedor)
        if producto:
            stmt = stmt.where(TeleventasProduccionItem.producto == producto)
        if tipo == "emitidas":
            stmt = stmt.where(TeleventasProduccionItem.es_anulacion == False)  # noqa: E712
        elif tipo == "anuladas":
            stmt = stmt.where(TeleventasProduccionItem.es_anulacion == True)  # noqa: E712
        rows = (await db.execute(stmt.order_by(TeleventasProduccionItem.prima.desc()).limit(limite))).scalars().all()
    polizas = [{"poliza": r.poliza, "asegurado": "[cliente]", "producto": r.producto,
                "vendedor": r.vendedor, "canal": r.canal, "prima": float(r.prima or 0),
                "tipo": "anulada" if r.es_anulacion else "emitida",
                "fecha": r.fecha.isoformat() if r.fecha else None} for r in rows]
    return {"mes": month, "cantidad": len(polizas), "polizas": polizas}


async def tv_focus_impl(focus_refs: Optional[list[str]]) -> dict[str, Any]:
    """Reportes que el usuario seleccionó como foco (por id o mes YYYY-MM)."""
    refs = focus_refs or []
    if not refs:
        return {"en_foco": [], "mensaje": "El usuario no seleccionó reportes; usá el mes más reciente o lo que pida."}
    async with session_scope() as db:
        out = []
        for ref in refs:
            ref = (ref or "").strip()
            for Model, kind in ((TeleventasLlamadasReport, "llamadas"), (TeleventasProduccionReport, "produccion")):
                r = await db.get(Model, ref)
                if r:
                    out.append({"id": r.id, "tipo": kind, "mes": r.period_month.strftime("%Y-%m") if r.period_month else None, "titulo": r.title})
    return {"en_foco": out, "total": len(out)}
