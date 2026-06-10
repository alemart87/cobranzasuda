"""Gestiones de Cobranzas a nivel fila (para drilldown por subestado).

Una fila por gestión, con el subestado, para poder listar/descargar los clientes
que cayeron en cada subestado sin inflar el JSON del reporte.
"""
from __future__ import annotations

import uuid
from datetime import datetime, date
from typing import Optional

from sqlalchemy import DateTime, Date, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class GestionItem(Base):
    __tablename__ = "gestion_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    report_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    period_month: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    fecha: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    subestado: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    estado: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    usuario: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    campana: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    cliente: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    poliza: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    poliza_key: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
