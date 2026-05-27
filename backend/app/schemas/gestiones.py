from datetime import datetime, date
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict


class GestionUploadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    uploaded_by: str
    period_month: Optional[date]
    status: str
    filename: Optional[str]
    uploaded_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    last_error: Optional[str]


class GestionUploadList(BaseModel):
    items: List[GestionUploadRead]
    total: int


class GestionReportSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    upload_id: str
    period_month: Optional[date]
    generated_at: datetime
    total_gestiones: int
    asesores_activos: int
    promesas_totales: int
    cobros_totales: int
    promesas_cumplidas: int
    pct_promesas_cumplidas: float
    is_published: bool = False
    published_at: Optional[datetime] = None
    title: Optional[str] = None


class GestionReportDetail(GestionReportSummary):
    data: dict[str, Any]


class GestionReportList(BaseModel):
    items: List[GestionReportSummary]
    total: int
