"""Eficiencia del Negocio (Televentas) — análisis mensual persistido + notas.

Cada ejecución del análisis de eficiencia queda registrada (sobre esto se toman
decisiones de dotación). Las notas permiten dejar registro de lo conversado y
decidido sobre cada análisis.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Numeric, String, Text, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class TeleventasEficiencia(Base):
    __tablename__ = "televentas_eficiencia"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    mes: Mapped[str] = mapped_column(String(7), nullable=False, index=True)      # "2026-07"
    objetivo_prima: Mapped[float] = mapped_column(Numeric(18, 0), nullable=False)
    created_by: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    data: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)       # análisis completo


class TeleventasEficienciaNota(Base):
    __tablename__ = "televentas_eficiencia_notas"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    analisis_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    texto: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_nombre: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
