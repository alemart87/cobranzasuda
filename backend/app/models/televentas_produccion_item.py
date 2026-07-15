"""Producción de Televentas a nivel póliza (para drilldown/CSV).

Una fila por movimiento (emisión o anulación), para poder listar/descargar las
pólizas por vendedor, producto o día sin inflar el JSON del reporte.
"""
from __future__ import annotations

import uuid
from datetime import datetime, date
from typing import Optional

from sqlalchemy import Boolean, DateTime, Date, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class TeleventasProduccionItem(Base):
    __tablename__ = "televentas_produccion_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    report_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    period_month: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    fecha: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    poliza: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    asegurado: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    producto: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    vendedor: Mapped[Optional[str]] = mapped_column(String(160), nullable=True, index=True)
    canal: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    cobrador: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    prima: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    suma_asegurada: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    es_anulacion: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
