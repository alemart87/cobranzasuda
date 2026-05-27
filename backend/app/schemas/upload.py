from datetime import datetime, date
from typing import Optional, List

from pydantic import BaseModel, ConfigDict


class UploadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    uploaded_by: str
    period_month: Optional[date]
    status: str
    dxp_filename: Optional[str]
    boca_filename: Optional[str]
    cobrado_filename: Optional[str]
    uploaded_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    last_error: Optional[str]


class UploadList(BaseModel):
    items: List[UploadRead]
    total: int
