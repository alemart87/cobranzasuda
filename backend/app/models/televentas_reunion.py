"""Conclusión de la reunión semanal (viernes) Voicenter ↔ Sudameris.

Una por semana (clave = fecha de inicio de la semana operativa, o "YYYY-Www").
Cierra la reunión: qué se concluyó, qué se decidió, con autor y fecha. Los
compromisos viven aparte (TeleventasCompromiso); esta es la lectura de conjunto.
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


class TeleventasReunionSemanal(Base):
    __tablename__ = "televentas_reuniones_semanales"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    semana: Mapped[str] = mapped_column(String(12), nullable=False, unique=True, index=True)
    conclusion: Mapped[str] = mapped_column(Text, nullable=False)

    created_by: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_nombre: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    updated_by_nombre: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )
