"""Bajas de operadores (Televentas Sudameris).

Un operador dado de baja deja de ser "pendiente": al marcarlo se apagan sus alertas de
eficiencia abiertas (con constancia en el seguimiento) y los análisis siguientes no le
generan alertas nuevas. Se puede reincorporar (queda la fecha) y desde ahí vuelve a
entrar al circuito normal.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class TeleventasOperadorBaja(Base):
    __tablename__ = "televentas_operador_bajas"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    operador: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    fecha_baja: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    motivo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    alertas_apagadas: Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # ids de alertas apagadas al dar la baja (coma)

    created_by: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_nombre: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    reincorporado_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reincorporado_por: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
