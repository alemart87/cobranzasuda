"""Reporte de Llamadas (Televentas) — KPIs + data JSON."""
from __future__ import annotations

import uuid
from datetime import datetime, date
from typing import Optional

from sqlalchemy import Boolean, DateTime, Date, Integer, Numeric, String, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class TeleventasLlamadasReport(Base):
    __tablename__ = "televentas_llamadas_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    upload_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    period_month: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    total_llamadas: Mapped[int] = mapped_column(Integer, default=0)
    contestadas: Mapped[int] = mapped_column(Integer, default=0)
    no_contestadas: Mapped[int] = mapped_column(Integer, default=0)
    pct_contestadas: Mapped[float] = mapped_column(Numeric(6, 2), default=0)
    tmo_seg: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    vendedores_activos: Mapped[int] = mapped_column(Integer, default=0)
    dias_operativos: Mapped[int] = mapped_column(Integer, default=0)

    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    published_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    data: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
