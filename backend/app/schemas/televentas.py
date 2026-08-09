"""Schemas del módulo Televentas: Reporte de Llamadas + Producción/Ventas."""
from datetime import datetime, date
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict


# ----------------------------- Llamadas -----------------------------
class TeleventasLlamadasUploadRead(BaseModel):
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


class TeleventasLlamadasUploadList(BaseModel):
    items: List[TeleventasLlamadasUploadRead]
    total: int


class TeleventasLlamadasReportSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    upload_id: str
    period_month: Optional[date]
    generated_at: datetime
    total_llamadas: int
    contestadas: int
    no_contestadas: int
    pct_contestadas: float
    tmo_seg: float
    vendedores_activos: int
    dias_operativos: int
    is_published: bool = False
    published_at: Optional[datetime] = None
    title: Optional[str] = None


class TeleventasLlamadasReportDetail(TeleventasLlamadasReportSummary):
    data: dict[str, Any]


class TeleventasLlamadasReportList(BaseModel):
    items: List[TeleventasLlamadasReportSummary]
    total: int


# ----------------------------- Producción -----------------------------
class TeleventasProduccionUploadRead(BaseModel):
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


class TeleventasProduccionUploadList(BaseModel):
    items: List[TeleventasProduccionUploadRead]
    total: int


class TeleventasProduccionReportSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    upload_id: str
    period_month: Optional[date]
    generated_at: datetime
    polizas_emitidas: int
    prima_emitida: float
    polizas_anuladas: int
    prima_anulada: float
    ticket_promedio: float
    dias_productivos: int
    is_published: bool = False
    published_at: Optional[datetime] = None
    title: Optional[str] = None


class TeleventasProduccionReportDetail(TeleventasProduccionReportSummary):
    data: dict[str, Any]


class TeleventasProduccionReportList(BaseModel):
    items: List[TeleventasProduccionReportSummary]
    total: int


# ----------------------------- Gestiones CRM -----------------------------
class TeleventasCrmUploadRead(BaseModel):
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


class TeleventasCrmUploadList(BaseModel):
    items: List[TeleventasCrmUploadRead]
    total: int


class TeleventasCrmReportSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    upload_id: str
    period_month: Optional[date]
    generated_at: datetime
    total_gestiones: int
    contactos: int
    aceptas: int
    agendados: int
    no_acepta: int
    tasa_contacto_pct: float
    operadores_activos: int
    dias_operativos: int
    is_published: bool = False
    published_at: Optional[datetime] = None
    title: Optional[str] = None


class TeleventasCrmReportDetail(TeleventasCrmReportSummary):
    data: dict[str, Any]


class TeleventasCrmReportList(BaseModel):
    items: List[TeleventasCrmReportSummary]
    total: int


class PublishRequest(BaseModel):
    is_published: bool
    title: Optional[str] = None


class AnalizadorRequest(BaseModel):
    """Ejecución del Analizador (método científico) sobre los meses del comparativo."""
    meses: list[str]                      # 2-3 meses YYYY-MM (los del comparativo)
    objetivo_prima: float                 # objetivo de prima NETA del mes analizado (Gs)
    consulta: Optional[str] = None        # pregunta del usuario — se incorpora a la hipótesis


class SemanalAnalizadorRequest(BaseModel):
    """Analizador SEMANAL: misma hipótesis producción-vs-objetivo, período semana ISO."""
    semana: str                           # "2026-W32"
    objetivo_prima: float                 # objetivo de prima EMITIDA de la semana (Gs)
    consulta: Optional[str] = None


class CompromisoCreate(BaseModel):
    """Compromiso de la reunión semanal (viernes) — lo cargan ambas partes."""
    semana: str                           # "2026-W32"
    descripcion: str
    responsable: str                      # "Voicenter" | "Sudameris"


class CompromisoUpdate(BaseModel):
    estado: Optional[str] = None          # pendiente | en_proceso | cumplido
    nota: Optional[str] = None
    descripcion: Optional[str] = None
