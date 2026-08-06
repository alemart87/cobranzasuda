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
from ...models.televentas_crm_report import TeleventasCrmReport
from ...models.televentas_llamadas_report import TeleventasLlamadasReport
from ...models.televentas_produccion_report import TeleventasProduccionReport
from ...models.televentas_produccion_item import TeleventasProduccionItem
from ...services.analyzers.televentas_overview import combine_televentas
from ...services.analyzers.televentas_tendencias import (
    caidas_vendedores, comparar_meses, proyeccion_cierre, analizar_tendencia_mensual,
)


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
            "por_dia": d.get("por_dia", []), "distribucion_duracion": d.get("distribucion_duracion", []),
            "por_hora": d.get("por_hora", []), "insights": d.get("insights", [])}


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


async def _overview_for(month: str) -> dict:
    ll = await _latest(TeleventasLlamadasReport, month)
    pr = await _latest(TeleventasProduccionReport, month)
    return combine_televentas(ll.data if ll else None, pr.data if pr else None)


async def _dos_meses(mes: Optional[str], mes_previo: Optional[str]) -> Optional[tuple[str, str]]:
    """Resuelve (mes_previo, mes_actual). Sin args usa los dos meses más recientes con datos."""
    periodos = await _periodos()  # desc
    if mes and mes_previo and mes in periodos and mes_previo in periodos:
        a, b = sorted([mes, mes_previo])
        return a, b
    if mes and mes in periodos:
        anteriores = [p for p in periodos if p < mes]
        if anteriores:
            return anteriores[0], mes
        return None
    if len(periodos) >= 2:
        return periodos[1], periodos[0]
    return None


async def tv_proyeccion_impl(mes: Optional[str] = None) -> dict[str, Any]:
    """Proyección de cierre de mes (prima y pólizas emitidas) con run-rate por día hábil."""
    month = await _resolve_month(mes)
    pr = await _latest(TeleventasProduccionReport, month) if month else None
    if not pr:
        return {"sin_datos": True, "mensaje": f"No hay producción para {month or 'ningún mes'}."}
    return proyeccion_cierre(pr.data or {})


async def tv_comparar_meses_impl(mes: Optional[str] = None, mes_previo: Optional[str] = None) -> dict[str, Any]:
    """Comparativo mes vs mes anterior: deltas de KPIs, por vendedor y por producto."""
    par = await _dos_meses(mes, mes_previo)
    if not par:
        return {"sin_datos": True, "mensaje": "Necesito al menos 2 meses con datos para comparar."}
    prev, curr = par
    return comparar_meses(await _overview_for(prev), await _overview_for(curr), prev, curr)


async def tv_caidas_vendedores_impl(mes: Optional[str] = None, mes_previo: Optional[str] = None,
                                    umbral_pct: float = 30.0) -> dict[str, Any]:
    """Vendedores con caída significativa (prima/pólizas/llamadas) vs el mes anterior."""
    par = await _dos_meses(mes, mes_previo)
    if not par:
        return {"sin_datos": True, "mensaje": "Necesito al menos 2 meses con datos para detectar caídas."}
    prev, curr = par
    return caidas_vendedores(await _overview_for(prev), await _overview_for(curr), prev, curr, umbral_pct)


async def tv_tendencias_impl(meses: int = 12) -> dict[str, Any]:
    """Serie multi-mes: conversión, llamadas totales/promedio, agentes activos,
    contactabilidad, prima, pólizas — con insights de tendencia."""
    periodos = sorted(await _periodos())  # ascendente
    meses = max(2, min(meses, 24))
    sel = periodos[-meses:]
    serie = []
    for m in sel:
        ll = await _latest(TeleventasLlamadasReport, m)
        pr = await _latest(TeleventasProduccionReport, m)
        llk = (ll.data or {}).get("kpis", {}) if ll else {}
        prk = (pr.data or {}).get("kpis", {}) if pr else {}
        contestadas = llk.get("contestadas", 0)
        polizas = prk.get("polizas_emitidas", 0)
        serie.append({
            "mes": m,
            "total_llamadas": llk.get("total_llamadas", 0),
            "llamadas_prom_dia": llk.get("promedio_diario", 0),
            "llamadas_prom_asesor_dia": llk.get("promedio_llamadas_asesor_dia", 0),
            "agentes_activos": llk.get("vendedores_activos", 0),
            "contactabilidad": llk.get("pct_contestadas", 0),
            "tmo_hms": llk.get("tmo_hms", "00:00:00"),
            "polizas_emitidas": polizas,
            "prima_emitida": prk.get("prima_emitida", 0),
            "prima_neta": prk.get("prima_neta", 0),
            "conversion_pct": round(polizas / contestadas * 100, 1) if contestadas else 0.0,
        })
    if len(serie) < 2:
        return {"sin_datos": True, "mensaje": "Se necesitan al menos 2 meses con datos para ver tendencias.",
                "meses": serie}
    return {"meses": serie, "insights": analizar_tendencia_mensual(serie), "total_meses": len(serie)}


async def tv_gestiones_crm_impl(mes: Optional[str] = None) -> dict[str, Any]:
    """Gestiones CRM del mes: KPIs del funnel (contacto/no acepta/agendado/acepta),
    productividad por operador, por campaña y la Voz del Cliente en Ventas
    (motivos generales + motivos de NO-VENTA con lo que dice el cliente)."""
    periodos = await _periodos()
    # meses con CRM (puede diferir de llamadas/producción)
    async with session_scope() as db:
        crm_meses = sorted({pm.strftime("%Y-%m") for (pm,) in (await db.execute(
            select(TeleventasCrmReport.period_month).where(TeleventasCrmReport.period_month.isnot(None))
        )).all() if pm}, reverse=True)
    mes = (mes or "").strip()
    month = mes if mes in crm_meses else (crm_meses[0] if crm_meses else None)
    crm = await _latest(TeleventasCrmReport, month) if month else None
    if not crm:
        return {"sin_datos": True, "mensaje": f"No hay reporte de Gestiones CRM para {month or 'ningún mes'}."}
    d = crm.data or {}
    voz = d.get("voz_ventas", {}) or {}
    return {
        "mes": month, "kpis": d.get("kpis", {}),
        "por_subestado": d.get("por_subestado", []),
        "por_operador": d.get("por_operador", []),
        "por_campana": d.get("por_campana", [])[:15],
        "por_dia": d.get("por_dia", []),
        "voz_ventas": {
            "total_observaciones": voz.get("total_observaciones", 0),
            "motivos": voz.get("motivos", []),
            "no_venta": voz.get("no_venta", {}),
            "frases": voz.get("frases", [])[:10],
        },
    }


async def tv_simulador_impl(meta_prima: Optional[float] = None, asesores: Optional[float] = None,
                            registros: Optional[float] = None,
                            overrides: Optional[dict] = None,
                            meses: Optional[list[str]] = None) -> dict[str, Any]:
    """Simulador gerencial: con las tasas REALES (últimos meses completos publicados)
    proyecta cuántos asesores y registros de base hacen falta para una meta de prima,
    cuánta prima produce una dotación, o la capacidad total de producción de una
    base/insumo disponible (`registros`). `overrides` permite ajustar parámetros
    (ticket_promedio, conversion_pct, contactabilidad_pct, llamadas_asesor_dia,
    dias_habiles, intentos_por_registro, tasa_anulacion_pct)."""
    from ...services.analyzers import simular, escenarios
    from ...api.v1.televentas import _parametros_simulador
    async with session_scope() as db:
        params = await _parametros_simulador(db, meses)
    if not params.get("disponible"):
        return {"sin_datos": True, "mensaje": params.get("mensaje", "Sin meses completos publicados.")}
    if overrides:
        params = {**params, **{k: v for k, v in overrides.items() if v is not None}}
    out: dict[str, Any] = {"parametros": params}
    if meta_prima is None and asesores is None and registros is None:
        out["nota"] = "Pasá meta_prima (Gs netos), asesores o registros (base disponible) para simular."
        return out
    out["resultado"] = simular(params, meta_prima=meta_prima, asesores=asesores, registros=registros)
    if meta_prima is not None:
        out["escenarios"] = escenarios(params, meta_prima)
    return out


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
