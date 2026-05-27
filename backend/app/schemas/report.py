from datetime import datetime, date
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict


class ReportSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    upload_id: str
    period_month: Optional[date]
    generated_at: datetime
    asegurados_total: int
    polizas_total: int
    saldo_total: float
    vencido_total: float
    asegurados_en_mora: int
    recupero_total: float
    asegurados_pagaron: int
    is_published: bool = False
    published_at: Optional[datetime] = None
    title: Optional[str] = None


class ReportDetail(ReportSummary):
    data: dict[str, Any]


class ReportList(BaseModel):
    items: List[ReportSummary]
    total: int
