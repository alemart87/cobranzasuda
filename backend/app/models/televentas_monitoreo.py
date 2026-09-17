"""Monitoreos de calidad de llamadas (Televentas Sudameris).

Se cargan desde el export "Detalle General de Monitoreo" (un monitoreo por fila,
con la evaluación del monitoreador: comentarios, sugerencias, % de precisión,
crítico / caso puntual). Sobre cada uno corre el análisis semántico (temas de
mejora + protocolo) y el FLUJO DE DEVOLUCIÓN: el líder devuelve el monitoreo al
asesor con su comentario, el asesor deja el suyo; estados `pendiente` → `devuelto`.
Todo queda en el seguimiento con autor y fecha.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class TeleventasMonitoreoUpload(Base):
    __tablename__ = "televentas_monitoreo_uploads"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    file_sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    filas: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    nuevos: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    actualizados: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    uploaded_by: Mapped[str] = mapped_column(String(64), nullable=False)
    uploaded_by_nombre: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class TeleventasMonitoreo(Base):
    __tablename__ = "televentas_monitoreos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    id_monitoreo: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, unique=True, index=True)
    upload_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)

    cuenta: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    fecha_monitoreo: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True, index=True)
    fecha_llamada: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    monitoreador: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    operador: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    estado_operador: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    id_grabacion: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    duracion_seg: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tipo_llamada: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    tipo_contacto: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    tipo_producto: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    motivo_llamada: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    comentarios: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sugerencias: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    compromiso: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    estado_evaluacion: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    precision: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    critico: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    caso_puntual: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    analisis: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)          # temas, protocolo, banda, venta

    # ---- flujo de devolución al asesor ----
    estado_devolucion: Mapped[str] = mapped_column(String(16), default="pendiente", nullable=False, index=True)  # pendiente | devuelto
    comentario_lider: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    comentario_operador: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    devuelto_por: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    devuelto_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    seguimiento: Mapped[list] = mapped_column(JSON, default=list, nullable=False)       # [{fecha, autor, accion, comentario}]

    created_by: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
