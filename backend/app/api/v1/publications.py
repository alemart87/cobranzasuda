"""Centro de Publicaciones: lista unificada de todos los reportes para
gestionar (publicar / despublicar / eliminar) desde un solo lugar.

Solo lectura aquí (lista agregada). Las acciones de publish/unpublish/delete
reusan los endpoints por tipo existentes (reports, calls, gestiones,
bases-adicionales) — el frontend mapea `kind` → ruta.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.database import get_db
from ...models.base_adicional_report import BaseAdicionalReport
from ...models.call_report import CallReport
from ...models.gestion_report import GestionReport
from ...models.report import Report
from ..deps import CurrentUser, require_analyst_or_admin


router = APIRouter(prefix="/publications", tags=["publications"])


# kind canónico → etiqueta legible. Las bases adicionales se diferencian por `tipo`.
KIND_LABELS = {
    "cartera": "Cartera DXP",
    "base_debitos_automaticos": "Base Débitos Automáticos",
    "base_bancard": "Base Bancard",
    "llamadas": "Reporte de Llamadas",
    "gestiones": "Reporte de Gestiones",
}


class PublicationItem(BaseModel):
    kind: str            # cartera | base_debitos_automaticos | base_bancard | llamadas | gestiones
    kind_label: str
    id: str
    title: Optional[str] = None
    period_month: Optional[date] = None
    generated_at: datetime
    is_published: bool
    published_at: Optional[datetime] = None


class PublicationList(BaseModel):
    items: list[PublicationItem]
    total: int


def _item(kind: str, rep) -> PublicationItem:
    return PublicationItem(
        kind=kind,
        kind_label=KIND_LABELS.get(kind, kind),
        id=rep.id,
        title=getattr(rep, "title", None),
        period_month=rep.period_month,
        generated_at=rep.generated_at,
        is_published=rep.is_published,
        published_at=rep.published_at,
    )


@router.get("", response_model=PublicationList)
async def list_publications(
    kind: Optional[str] = Query(None, description="Filtrar por kind"),
    status_filter: Optional[str] = Query(None, alias="status", description="published|draft"),
    user: CurrentUser = Depends(require_analyst_or_admin),
    db: AsyncSession = Depends(get_db),
) -> PublicationList:
    items: list[PublicationItem] = []

    carteras = (await db.execute(
        select(Report).order_by(Report.generated_at.desc()).limit(200)
    )).scalars().all()
    items.extend(_item("cartera", r) for r in carteras)

    bases = (await db.execute(
        select(BaseAdicionalReport).order_by(BaseAdicionalReport.generated_at.desc()).limit(200)
    )).scalars().all()
    items.extend(_item(f"base_{r.tipo}", r) for r in bases)

    llamadas = (await db.execute(
        select(CallReport).order_by(CallReport.generated_at.desc()).limit(200)
    )).scalars().all()
    items.extend(_item("llamadas", r) for r in llamadas)

    gestiones = (await db.execute(
        select(GestionReport).order_by(GestionReport.generated_at.desc()).limit(200)
    )).scalars().all()
    items.extend(_item("gestiones", r) for r in gestiones)

    if kind:
        items = [i for i in items if i.kind == kind]
    if status_filter == "published":
        items = [i for i in items if i.is_published]
    elif status_filter == "draft":
        items = [i for i in items if not i.is_published]

    # Orden global por fecha de generación (lo más nuevo primero).
    items.sort(key=lambda i: i.generated_at, reverse=True)

    return PublicationList(items=items, total=len(items))
