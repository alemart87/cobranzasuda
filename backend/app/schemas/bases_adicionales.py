from datetime import datetime, date
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field


VALID_TIPOS = {"debitos_automaticos", "bancard"}


class BaseAdicionalUploadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    tipo: str
    uploaded_by: str
    period_month: Optional[date]
    status: str
    filename: Optional[str]
    uploaded_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    last_error: Optional[str]


class BaseAdicionalUploadList(BaseModel):
    items: List[BaseAdicionalUploadRead]
    total: int


class BaseAdicionalReportSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    upload_id: str
    tipo: str
    period_month: Optional[date]
    generated_at: datetime
    polizas: int
    asegurados: int
    saldo_total: float
    is_published: bool = False
    published_at: Optional[datetime] = None
    title: Optional[str] = None


class BaseAdicionalReportDetail(BaseAdicionalReportSummary):
    data: dict[str, Any]


class BaseAdicionalReportList(BaseModel):
    items: List[BaseAdicionalReportSummary]
    total: int


class CarteraResumen(BaseModel):
    """Una cartera dentro del agregado de Carteras Totales."""
    nombre: str
    fuente: str  # 'dxp' | 'debitos_automaticos' | 'bancard'
    polizas: int
    asegurados: int
    asegurados_mora: int  # clientes con saldo vencido (vencido > 0)
    saldo_total: float
    saldo_mora: float  # vencido = suma de todos los tramos excepto "a vencer"
    tramos: dict[str, float]  # a_vencer, h_30, h_60, h_90, h_120, h_150, m_150
    recibe_pagos: bool
    period_month: Optional[date] = None
    report_id: Optional[str] = None
    generated_at: Optional[datetime] = None


class CarterasTotalesResponse(BaseModel):
    period_month: Optional[date] = None
    carteras: List[CarteraResumen]
    totales: dict[str, float]  # polizas, asegurados, saldo_total + tramos
