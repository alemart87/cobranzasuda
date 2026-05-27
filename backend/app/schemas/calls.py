from datetime import datetime, date
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict


class CallUploadRead(BaseModel):
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


class CallUploadList(BaseModel):
    items: List[CallUploadRead]
    total: int


class CallReportSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    upload_id: str
    period_month: Optional[date]
    generated_at: datetime
    total_llamadas: int
    total_talk_seg: float
    asesores_activos: int
    dias_operativos: int
    efectivas_total: int
    aht_seg: float


class CallReportDetail(CallReportSummary):
    data: dict[str, Any]


class CallReportList(BaseModel):
    items: List[CallReportSummary]
    total: int
