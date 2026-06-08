"""User model: viewer role in DB; superadmin lives in .env only."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    # Roles: 'analyst' (analista interno Voicenter), 'client' (cliente Sudameris solo lectura)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="analyst")
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    photo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # Solo aplica a clientes. None = acceso a todos los módulos.
    # Lista (puede ser []) = solo los slugs incluidos.
    allowed_modules: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    # Habilita el "Agente de Experiencia" (IA) para analistas y clientes.
    can_use_agent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
