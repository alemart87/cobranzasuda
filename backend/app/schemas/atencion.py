"""Schemas del módulo Atención al Cliente: Reporte de Llamadas + Gestiones."""
from datetime import datetime, date
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict


# ----------------------------- Llamadas -----------------------------
class AtencionLlamadasUploadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    uploaded_by: str
    period_month: Optional[date]
    status: str
    entrantes_filename: Optional[str] = None
    estados_filename: Optional[str] = None
    intervalo_filename: Optional[str] = None
    colas_filename: Optional[str] = None
    uploaded_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    last_error: Optional[str]


class AtencionLlamadasUploadList(BaseModel):
    items: List[AtencionLlamadasUploadRead]
    total: int


class AtencionLlamadasReportSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    upload_id: str
    period_month: Optional[date]
    generated_at: datetime
    llamadas_ingresadas: int
    contestadas: int
    abandonadas: int
    nivel_atencion_pct: float
    sla_pct: float
    abandono_pct: float
    aht_seg: float
    operadores_activos: int
    dias_operativos: int
    is_published: bool = False
    published_at: Optional[datetime] = None
    title: Optional[str] = None


class AtencionLlamadasReportDetail(AtencionLlamadasReportSummary):
    data: dict[str, Any]


class AtencionLlamadasReportList(BaseModel):
    items: List[AtencionLlamadasReportSummary]
    total: int


# ----------------------------- Gestiones -----------------------------
class AtencionGestionUploadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    uploaded_by: str
    period_month: Optional[date]
    status: str
    filename: Optional[str] = None
    uploaded_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    last_error: Optional[str]


class AtencionGestionUploadList(BaseModel):
    items: List[AtencionGestionUploadRead]
    total: int


class AtencionGestionReportSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    upload_id: str
    period_month: Optional[date]
    generated_at: datetime
    total_gestiones: int
    cerrados: int
    pendientes: int
    pct_cerrados: float
    is_published: bool = False
    published_at: Optional[datetime] = None
    title: Optional[str] = None


class AtencionGestionReportDetail(AtencionGestionReportSummary):
    data: dict[str, Any]


class AtencionGestionReportList(BaseModel):
    items: List[AtencionGestionReportSummary]
    total: int


class PublishRequest(BaseModel):
    is_published: bool
    title: Optional[str] = None
