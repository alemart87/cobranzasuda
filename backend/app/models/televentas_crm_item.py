"""Gestiones CRM de Televentas a nivel fila (drilldown, voz en ventas y agente)."""
from __future__ import annotations

import uuid
from datetime import datetime, date
from typing import Optional

from sqlalchemy import DateTime, Date, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class TeleventasCrmItem(Base):
    __tablename__ = "televentas_crm_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    report_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    period_month: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    fecha: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    usuario: Mapped[Optional[str]] = mapped_column(String(160), nullable=True, index=True)
    subestado: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    campana: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    cliente: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    observacion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    motivo: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)  # clasificación voz-ventas

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
