"""Application settings loaded from environment."""
from __future__ import annotations

from pathlib import Path
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: str = "development"
    secret_key: str = "change-me"

    database_url: str = "sqlite+aiosqlite:///./local.db"

    @field_validator("database_url")
    @classmethod
    def normalize_database_url(cls, v: str) -> str:
        """Render gives `postgresql://` — convertir a `postgresql+asyncpg://` para SQLAlchemy async."""
        if v.startswith("postgres://"):
            v = v.replace("postgres://", "postgresql://", 1)
        if v.startswith("postgresql://"):
            v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
        # Render incluye `?sslmode=require` que asyncpg no entiende; lo removemos
        if "?sslmode=" in v and "+asyncpg" in v:
            v = v.split("?sslmode=")[0]
        return v

    superadmin_email: str = "admin@voicenter.com.py"
    # Opción simple: setear password en plano (Render Env > SUPERADMIN_PASSWORD)
    superadmin_password: str = ""
    # Opción avanzada: setear directamente el hash bcrypt
    superadmin_password_hash: str = ""
    superadmin_name: str = "Administrador Voicenter"

    jwt_algorithm: str = "HS256"
    jwt_access_expire_minutes: int = 60
    jwt_refresh_expire_days: int = 7

    upload_dir: str = "./uploads"
    max_upload_size_mb: int = 20

    log_level: str = "INFO"
    audit_retention_days: int = 365

    cors_origins: str = "http://localhost:3000,http://localhost:8080"

    brand_primary_color: str = "#0066B3"
    brand_logo_path: str = "/logo-voicenter-color.png"

    # --- Agente de Experiencia (OpenAI Agents SDK) ---
    openai_api_key: str = ""
    agent_model: str = "gpt-5.4"
    agent_reasoning_effort: str = "medium"  # minimal | low | medium | high
    # Resumen del razonamiento ("auto" | "detailed" | "" para desactivar).
    agent_reasoning_summary: str = "auto"
    agent_max_history: int = 20             # mensajes de contexto por conversación
    agent_max_tool_turns: int = 8           # iteraciones máximas de tools por respuesta

    # Precios del modelo (USD por 1M tokens). Default = gpt-5.4 (oficial OpenAI).
    agent_price_input_per_mtok: float = 2.50
    agent_price_cached_input_per_mtok: float = 0.25
    agent_price_output_per_mtok: float = 15.00

    @property
    def agent_enabled(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def upload_path(self) -> Path:
        path = Path(self.upload_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path


settings = Settings()
