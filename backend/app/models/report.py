"""Report model: snapshot of an analysis."""
from __future__ import annotations

import uuid
from datetime import datetime, date
from typing import Optional

from sqlalchemy import Boolean, DateTime, Date, Integer, Numeric, String, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    upload_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    period_month: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    published_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    asegurados_total: Mapped[int] = mapped_column(Integer, default=0)
    polizas_total: Mapped[int] = mapped_column(Integer, default=0)
    saldo_total: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    vencido_total: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    asegurados_en_mora: Mapped[int] = mapped_column(Integer, default=0)

    recupero_total: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    # NOTA: recupero_sobre_mora removido del cálculo. La columna se conserva en DB
    # por compatibilidad con reportes históricos (default 0); no se popula en uploads nuevos.
    recupero_sobre_mora: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    asegurados_pagaron: Mapped[int] = mapped_column(Integer, default=0)

    data: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
