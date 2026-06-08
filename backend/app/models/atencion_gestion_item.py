"""Gestión de Atención a nivel fila (para drilldown del Agente de Experiencia).

Se persiste una fila por gestión al procesar el archivo, con el tema ya
clasificado. Permite al agente consultar casos individuales (no solo agregados).
"""
from __future__ import annotations

import uuid
from datetime import datetime, date
from typing import Optional

from sqlalchemy import DateTime, Date, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class AtencionGestionItem(Base):
    __tablename__ = "atencion_gestion_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    report_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    period_month: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    fecha: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)

    # PII: se guarda completo para nuestra UI; el agente lo recibe redactado.
    cliente: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    documento: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    telefono: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)

    tipo_caso: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)
    estado: Mapped[Optional[str]] = mapped_column(String(60), nullable=True, index=True)
    motivo: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    departamento: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    responsable: Mapped[Optional[str]] = mapped_column(String(160), nullable=True, index=True)
    canal: Mapped[Optional[str]] = mapped_column(String(60), nullable=True, index=True)
    seccion: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    tema: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)
    descripcion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
