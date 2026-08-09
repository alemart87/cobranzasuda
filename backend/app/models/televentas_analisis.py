"""Log del Analizador de Televentas (método científico).

Cada ejecución del analizador queda registrada: hipótesis (producción vs
objetivo + consulta del usuario), datos verificados, conclusión y acciones.
El registro permite el análisis posterior de qué se preguntó, qué se
diagnosticó y con qué datos.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Numeric, String, Text, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class TeleventasAnalisis(Base):
    __tablename__ = "televentas_analisis"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    created_by: Mapped[str] = mapped_column(String(64), nullable=False, index=True)  # user id o "agente-ia"
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    meses: Mapped[str] = mapped_column(String(64), nullable=False)          # "2026-05,2026-07"
    objetivo_prima: Mapped[float] = mapped_column(Numeric(18, 0), nullable=False)
    consulta: Mapped[Optional[str]] = mapped_column(Text, nullable=True)    # pregunta del usuario (parte de la hipótesis)

    hipotesis: Mapped[str] = mapped_column(Text, nullable=False)
    alcanzado: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    brecha_pct: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)
    conclusion: Mapped[str] = mapped_column(Text, default="", nullable=False)

    data: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)  # análisis completo estructurado
