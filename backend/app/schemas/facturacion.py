"""Schemas del módulo Facturación — Televentas Claro."""
from __future__ import annotations

from datetime import datetime, date
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class FacturacionUploadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    uploaded_by: str
    period_month: Optional[date] = None
    nro_liquidacion: Optional[str] = None
    filename: Optional[str] = None
    status: str
    retry_count: int = 0
    last_error: Optional[str] = None
    uploaded_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class FacturacionUploadList(BaseModel):
    items: List[FacturacionUploadRead]
    total: int


class FacturacionReportSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    upload_id: str
    period_month: Optional[date] = None
    nro_liquidacion: Optional[str] = None
    periodo: Optional[str] = None
    generated_at: datetime
    total: float = 0
    creditos: float = 0
    debitos: float = 0
    ventas_activaciones: int = 0
    is_published: bool = False
    published_at: Optional[datetime] = None
    title: Optional[str] = None


class FacturacionReportDetail(FacturacionReportSummary):
    data: dict[str, Any] = Field(default_factory=dict)


class FacturacionReportList(BaseModel):
    items: List[FacturacionReportSummary]
    total: int


class PublishRequest(BaseModel):
    is_published: bool
    title: Optional[str] = None


class CompareRequest(BaseModel):
    report_ids: List[str] = Field(min_length=2, max_length=24)


class CompareResponse(BaseModel):
    columnas: list[dict[str, Any]]
    conceptos: list[dict[str, Any]]
    totales: list[float]
    creditos: list[float]
    debitos: list[float]
    ventas: list[int]
    variaciones: list[Optional[float]]
    drivers: list[dict[str, Any]]
    descomposicion: list[dict[str, Any]] = []
    delta_total: float = 0
    hallazgos: list[str] = []
