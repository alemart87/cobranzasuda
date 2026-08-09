"""Alertas de eficiencia (Televentas) — control de costos con flujo de estados.

Se generan automáticamente al correr el análisis de eficiencia para cada
operador fuera de objetivo. Flujo: activa → en_mitigacion → mitigada, o
apagada (descartada con justificación). Cada transición exige comentario y
queda en el seguimiento (autor + fecha): el costo por hora se controla con
alertas que alguien tiene que atender, no con reportes que nadie mira.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, String, Text, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class TeleventasAlerta(Base):
    __tablename__ = "televentas_alertas"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    analisis_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)  # análisis de eficiencia origen
    mes: Mapped[str] = mapped_column(String(7), nullable=False, index=True)           # "2026-07"
    operador: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    estado_operador: Mapped[str] = mapped_column(String(32), nullable=False)          # critico | baja | nuevo_critico
    severidad: Mapped[str] = mapped_column(String(16), nullable=False)                # alta | media
    titulo: Mapped[str] = mapped_column(Text, nullable=False)

    estado: Mapped[str] = mapped_column(String(24), default="activa", nullable=False, index=True)
    # activa | en_mitigacion | mitigada | apagada

    detalle: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)         # métricas + motivo del análisis
    seguimiento: Mapped[list] = mapped_column(JSON, default=list, nullable=False)     # [{fecha, autor, accion, estado, comentario}]

    created_by: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )
