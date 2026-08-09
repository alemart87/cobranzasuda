"""Compromisos de la reunión semanal (viernes) Voicenter ↔ Sudameris.

Cada compromiso queda registrado con su semana, responsable (cualquiera de las
dos partes), estado y trazabilidad — es el insumo del informe de reunión y del
seguimiento semana a semana.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class TeleventasCompromiso(Base):
    __tablename__ = "televentas_compromisos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    semana: Mapped[str] = mapped_column(String(12), nullable=False, index=True)   # "2026-W32"
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    responsable: Mapped[str] = mapped_column(String(32), nullable=False)          # "Voicenter" | "Sudameris"
    estado: Mapped[str] = mapped_column(String(16), default="pendiente", nullable=False, index=True)
    nota: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_by: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )
