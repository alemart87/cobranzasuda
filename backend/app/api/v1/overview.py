"""Overview gerencial: panel consolidado del mes, de un vistazo.

Reglas de fuente (definidas con el cliente):
* Carteras (DXP + Bases Adicionales): SOLO reportes publicados por el superadmin.
* Llamadas y Gestiones: cualquier reporte publicado.
* Se toma el MES más reciente que tenga datos publicados.

Rendimiento estimativo = total_gestiones / pólizas_totales_cartera * 100.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.database import get_db
from ...models.base_adicional_report import BaseAdicionalReport
from ...models.call_report import CallReport
from ...models.gestion_report import GestionReport
from ...models.report import Report
from ..deps import CurrentUser, get_current_user


router = APIRouter(prefix="/overview", tags=["overview"])

SUPERADMIN_ID = "superadmin"
_MORA_KEYS = ("h_30", "h_60", "h_90", "h_120", "h_150", "m_150")
_BASE_LABELS = {"debitos_automaticos": "Base Débitos Automáticos", "bancard": "Base Bancard"}


# ----------------------------- schemas -----------------------------
class CarteraItem(BaseModel):
    nombre: str
    fuente: str
    polizas: int
    asegurados: int
    saldo_total: float
    saldo_mora: float
    asegurados_mora: int
    recupero: float       # saldo recuperado del mes (0 si la cartera no recibe pagos)
    recibe_pagos: bool


class CarterasBlock(BaseModel):
    items: list[CarteraItem]
    polizas: int
    asegurados: int
    saldo_total: float
    saldo_mora: float
    asegurados_mora: int
    recupero: float  # saldo recuperado del mes (solo DXP recibe pagos)


class LlamadasBlock(BaseModel):
    total_llamadas: int
    total_talk_seg: float
    aht_seg: float
    efectivas_total: int
    asesores_activos: int


class GestionesBlock(BaseModel):
    total_gestiones: int
    contactos_efectivos: int
    pct_contactos_efectivos: float
    promesas_totales: int
    pct_promesas: float          # promesas sobre contactos efectivos
    cobros_totales: int
    pct_promesas_cumplidas: float
    asesores_activos: int


class RendimientoBlock(BaseModel):
    pct: float
    gestiones: int
    asegurados: int


class OverviewResponse(BaseModel):
    period_month: Optional[date] = None
    available_months: list[str] = []  # YYYY-MM con datos publicados, desc
    carteras: Optional[CarterasBlock] = None
    # Motivo por el que el bloque de carteras viene vacío (falla NO silenciosa).
    carteras_alerta: Optional[str] = None
    llamadas: Optional[LlamadasBlock] = None
    gestiones: Optional[GestionesBlock] = None
    rendimiento: Optional[RendimientoBlock] = None


# ----------------------------- helpers -----------------------------
def _month_range(d: date) -> tuple[date, date]:
    start = d.replace(day=1)
    end = (start.replace(year=start.year + 1, month=1)
           if start.month == 12 else start.replace(month=start.month + 1))
    return start, end


def _cartera_from_dxp(rep: Report) -> CarteraItem:
    kpis = ((rep.data or {}).get("cartera") or {}).get("kpis") or {}
    return CarteraItem(
        nombre="Cartera DXP",
        fuente="dxp",
        polizas=int(rep.polizas_total or kpis.get("polizas_total", 0) or 0),
        asegurados=int(rep.asegurados_total or kpis.get("asegurados_total", 0) or 0),
        saldo_total=float(rep.saldo_total or kpis.get("saldo_total", 0) or 0),
        saldo_mora=float(rep.vencido_total or kpis.get("vencido_total", 0) or 0),
        asegurados_mora=int(rep.asegurados_en_mora or kpis.get("asegurados_en_mora", 0) or 0),
        recupero=float(rep.recupero_total or 0),
        recibe_pagos=True,
    )


def _cartera_from_base(rep: BaseAdicionalReport) -> CarteraItem:
    kpis = (rep.data or {}).get("kpis") or {}
    vencido = sum(float(kpis.get(f"tramo_{k}", 0) or 0) for k in _MORA_KEYS)
    return CarteraItem(
        nombre=_BASE_LABELS.get(rep.tipo, rep.tipo),
        fuente=rep.tipo,
        polizas=int(rep.polizas or 0),
        asegurados=int(rep.asegurados or 0),
        saldo_total=float(rep.saldo_total or 0),
        saldo_mora=vencido,
        asegurados_mora=int(kpis.get("asegurados_en_mora", 0) or 0),
        recupero=0.0,
        recibe_pagos=False,
    )


@router.get("", response_model=OverviewResponse)
async def get_overview(
    month: Optional[str] = Query(None, description="YYYY-MM; default = mes más reciente con datos"),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OverviewResponse:
    # --- 1) Meses con datos publicados (para el navegador) + mes objetivo ---
    months: list[date] = []

    async def _collect(stmt) -> None:
        for (pm,) in (await db.execute(stmt)).all():
            if pm is not None:
                months.append(pm)

    # Carteras: para el NAVEGADOR de meses cuenta cualquier publicada (si no,
    # un mes con cartera publicada por un analista desaparecería del selector);
    # el BLOQUE de carteras del panel sigue exigiendo publicación del superadmin.
    await _collect(
        select(Report.period_month).where(Report.is_published == True)  # noqa: E712
    )
    await _collect(
        select(BaseAdicionalReport.period_month).where(
            BaseAdicionalReport.is_published == True,  # noqa: E712
        )
    )
    # Llamadas / Gestiones: cualquier publicado.
    await _collect(select(CallReport.period_month).where(CallReport.is_published == True))  # noqa: E712
    await _collect(select(GestionReport.period_month).where(GestionReport.is_published == True))  # noqa: E712

    available = sorted({d.strftime("%Y-%m") for d in months}, reverse=True)
    if not months and not month:
        return OverviewResponse(available_months=[])

    # Mes objetivo: el pedido (si es válido) o el más reciente disponible.
    if month:
        try:
            target = datetime.strptime(month, "%Y-%m").date()
        except ValueError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "month debe ser YYYY-MM")
    else:
        target = max(months)
    start, end = _month_range(target)

    # --- 2) Carteras del mes (publicadas por superadmin) ---
    items: list[CarteraItem] = []

    dxp = (await db.execute(
        select(Report)
        .where(
            Report.is_published == True,  # noqa: E712
            Report.published_by == SUPERADMIN_ID,
            Report.period_month >= start, Report.period_month < end,
        )
        .order_by(Report.generated_at.desc())
        .limit(1)
    )).scalar_one_or_none()
    if dxp:
        items.append(_cartera_from_dxp(dxp))

    for tipo in ("debitos_automaticos", "bancard"):
        base = (await db.execute(
            select(BaseAdicionalReport)
            .where(
                BaseAdicionalReport.tipo == tipo,
                BaseAdicionalReport.is_published == True,  # noqa: E712
                BaseAdicionalReport.published_by == SUPERADMIN_ID,
                BaseAdicionalReport.period_month >= start, BaseAdicionalReport.period_month < end,
            )
            .order_by(BaseAdicionalReport.generated_at.desc())
            .limit(1)
        )).scalar_one_or_none()
        if base:
            items.append(_cartera_from_base(base))

    carteras: Optional[CarterasBlock] = None
    carteras_alerta: Optional[str] = None
    if items:
        # Recupero del mes: solo la cartera DXP recibe pagos.
        recupero = float(dxp.recupero_total or 0) if dxp else 0.0
        carteras = CarterasBlock(
            items=items,
            polizas=sum(c.polizas for c in items),
            asegurados=sum(c.asegurados for c in items),
            saldo_total=sum(c.saldo_total for c in items),
            saldo_mora=sum(c.saldo_mora for c in items),
            asegurados_mora=sum(c.asegurados_mora for c in items),
            recupero=recupero,
        )
    else:
        # Falla NO silenciosa: explicar por qué el bloque viene vacío.
        otros = (await db.execute(
            select(Report.id).where(
                Report.is_published == True,  # noqa: E712
                Report.published_by != SUPERADMIN_ID,
                Report.period_month >= start, Report.period_month < end,
            ).limit(1)
        )).first() or (await db.execute(
            select(BaseAdicionalReport.id).where(
                BaseAdicionalReport.is_published == True,  # noqa: E712
                BaseAdicionalReport.published_by != SUPERADMIN_ID,
                BaseAdicionalReport.period_month >= start, BaseAdicionalReport.period_month < end,
            ).limit(1)
        )).first()
        if otros:
            carteras_alerta = (
                "Hay reportes de cartera de este mes publicados por un analista. "
                "El panel gerencial solo muestra carteras publicadas por el superadmin: "
                "despublicá y volvé a publicarlos con el usuario superadmin desde el Centro de Publicaciones."
            )
        else:
            carteras_alerta = "No hay reporte de cartera publicado para este mes."

    # --- 3) Llamadas del mes (cualquier publicado) ---
    call = (await db.execute(
        select(CallReport)
        .where(
            CallReport.is_published == True,  # noqa: E712
            CallReport.period_month >= start, CallReport.period_month < end,
        )
        .order_by(CallReport.generated_at.desc())
        .limit(1)
    )).scalar_one_or_none()
    llamadas = LlamadasBlock(
        total_llamadas=int(call.total_llamadas or 0),
        total_talk_seg=float(call.total_talk_seg or 0),
        aht_seg=float(call.aht_seg or 0),
        efectivas_total=int(call.efectivas_total or 0),
        asesores_activos=int(call.asesores_activos or 0),
    ) if call else None

    # --- 4) Gestiones del mes (cualquier publicado) ---
    gest = (await db.execute(
        select(GestionReport)
        .where(
            GestionReport.is_published == True,  # noqa: E712
            GestionReport.period_month >= start, GestionReport.period_month < end,
        )
        .order_by(GestionReport.generated_at.desc())
        .limit(1)
    )).scalar_one_or_none()
    gestiones = None
    if gest:
        gk = (gest.data or {}).get("kpis") or {}
        gestiones = GestionesBlock(
            total_gestiones=int(gest.total_gestiones or 0),
            contactos_efectivos=int(gk.get("contactos_efectivos", gk.get("equipo_contactos_efectivos", 0)) or 0),
            pct_contactos_efectivos=float(gk.get("equipo_pct_contactos_efectivos", 0) or 0),
            promesas_totales=int(gest.promesas_totales or 0),
            pct_promesas=float(gk.get("equipo_pct_promesas_sobre_contactos", 0) or 0),
            cobros_totales=int(gest.cobros_totales or 0),
            pct_promesas_cumplidas=float(gest.pct_promesas_cumplidas or 0),
            asesores_activos=int(gest.asesores_activos or 0),
        )

    # --- 5) Rendimiento estimativo: avance de gestión sobre los clientes ---
    # Indicador de cobertura: total de gestiones / asegurados de la cartera * 100.
    # Es un estimativo (no deduplica gestiones por cliente); usa datos ya guardados.
    rendimiento: Optional[RendimientoBlock] = None
    if carteras and gestiones and carteras.asegurados > 0:
        rendimiento = RendimientoBlock(
            pct=round(gestiones.total_gestiones / carteras.asegurados * 100, 1),
            gestiones=gestiones.total_gestiones,
            asegurados=carteras.asegurados,
        )

    return OverviewResponse(
        period_month=start,
        available_months=available,
        carteras=carteras,
        carteras_alerta=carteras_alerta,
        llamadas=llamadas,
        gestiones=gestiones,
        rendimiento=rendimiento,
    )
