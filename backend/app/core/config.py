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

    superadmin_email: str = "admin@voicenter.com.py"
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

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def upload_path(self) -> Path:
        path = Path(self.upload_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path


settings = Settings()
