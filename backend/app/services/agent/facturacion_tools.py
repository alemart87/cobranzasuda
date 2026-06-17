"""Tools curadas (read-only) del Agente de Facturación · Televentas Claro.

Consultan los reportes de facturación ya procesados (tabla `facturacion_reports`)
y recortan el payload. NO ejecutan SQL libre ni mutaciones. Reutilizan
`AgentContext` del agente de Atención.
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import select

from ...core.database import session_scope
from ...models.facturacion_report import FacturacionReport
from ...services.analyzers.facturacion_compare import compare_facturacion


def _summary(r: FacturacionReport) -> dict[str, Any]:
    return {
        "id": r.id,
        "periodo": r.periodo,
        "nro_liquidacion": r.nro_liquidacion,
        "total": float(r.total or 0),
        "creditos": float(r.creditos or 0),
        "debitos": float(r.debitos or 0),
        "ventas_activaciones": int(r.ventas_activaciones or 0),
        "publicado": bool(r.is_published),
        "titulo": r.title,
    }


async def fact_listar_reportes_impl() -> dict[str, Any]:
    """Lista los reportes de facturación disponibles, del más reciente al más antiguo."""
    async with session_scope() as db:
        rows = (await db.execute(
            select(FacturacionReport).order_by(FacturacionReport.periodo.desc().nullslast(),
                                                FacturacionReport.generated_at.desc()).limit(60)
        )).scalars().all()
    items = [_summary(r) for r in rows]
    if not items:
        return {"sin_datos": True, "mensaje": "No hay reportes de facturación cargados todavía."}
    return {"reportes": items, "total": len(items)}


async def _resolve(ref: Optional[str]) -> Optional[FacturacionReport]:
    """Resuelve un reporte por id, período (YYYY-MM) o número de liquidación.
    Si `ref` es None/'ultimo', devuelve el más reciente."""
    ref = (ref or "").strip()
    async with session_scope() as db:
        if not ref or ref.lower() in ("ultimo", "último", "reciente", "actual"):
            return (await db.execute(
                select(FacturacionReport).order_by(FacturacionReport.periodo.desc().nullslast(),
                                                    FacturacionReport.generated_at.desc()).limit(1)
            )).scalars().first()
        # por período YYYY-MM
        if len(ref) == 7 and ref[4] == "-":
            r = (await db.execute(
                select(FacturacionReport).where(FacturacionReport.periodo == ref)
                .order_by(FacturacionReport.generated_at.desc()).limit(1)
            )).scalars().first()
            if r:
                return r
        # por nro de liquidación
        r = (await db.execute(
            select(FacturacionReport).where(FacturacionReport.nro_liquidacion == ref)
            .order_by(FacturacionReport.generated_at.desc()).limit(1)
        )).scalars().first()
        if r:
            return r
        # por id
        return await db.get(FacturacionReport, ref)


async def fact_obtener_reporte_impl(referencia: Optional[str] = None) -> dict[str, Any]:
    """Devuelve el detalle de un reporte: KPIs, TODAS las descripciones de concepto,
    ventas, suspensiones (PFI) y documentación faltante por cohorte de venta."""
    r = await _resolve(referencia)
    if not r:
        return {"sin_datos": True, "mensaje": f"No encontré un reporte para '{referencia}'. Usá fact_listar_reportes."}
    d = r.data or {}
    return {
        "resumen": _summary(r),
        "kpis": d.get("kpis", {}),
        "conceptos": d.get("conceptos", []),         # TODAS las descripciones
        "ventas": d.get("ventas", {}),
        "suspensiones": d.get("suspensiones", {}),
        "doc_faltante": d.get("doc_faltante", {}),
        "analisis_rapido": d.get("analisis_rapido", []),
    }


async def fact_comparar_impl(referencias: list[str]) -> dict[str, Any]:
    """Compara 2+ reportes (por período/liquidación/id): matriz por concepto, drivers y variaciones."""
    if not referencias or len(referencias) < 2:
        return {"error": "Indicá al menos 2 referencias (períodos YYYY-MM o números de liquidación)."}
    resolved = []
    for ref in referencias[:24]:
        r = await _resolve(ref)
        if r:
            resolved.append(r)
    # dedup por id
    uniq = {r.id: r for r in resolved}
    if len(uniq) < 2:
        return {"error": "No pude resolver al menos 2 reportes distintos para comparar."}
    payload = [{
        "id": r.id, "title": r.title, "periodo": r.periodo,
        "nro_liquidacion": r.nro_liquidacion,
        "generated_at": r.generated_at.isoformat() if r.generated_at else "",
        "data": r.data or {},
    } for r in uniq.values()]
    return compare_facturacion(payload)
