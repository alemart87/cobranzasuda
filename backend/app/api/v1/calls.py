"""Call report endpoints: upload + list + detail."""
from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import settings
from ...core.database import get_db
from ...jobs.call_runner import process_call_upload
from ...models.call_report import CallReport
from ...models.call_upload import CallUpload
from ...schemas.calls import (
    CallReportDetail,
    CallReportList,
    CallReportSummary,
    CallUploadList,
    CallUploadRead,
)
from ...services.audit_service import record_action
from ..deps import CurrentUser, client_ip, get_current_user


router = APIRouter(prefix="/calls", tags=["calls"])


async def _save_call_file(file: UploadFile, upload_id: str) -> tuple[str, str, str]:
    if not file.filename:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Archivo sin nombre")
    target_dir = settings.upload_path / "calls" / upload_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / file.filename

    sha = hashlib.sha256()
    content = await file.read()
    sha.update(content)

    if len(content) > settings.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Archivo excede {settings.max_upload_size_mb}MB",
        )

    target.write_bytes(content)
    return file.filename, str(target.resolve()), sha.hexdigest()


@router.post("/uploads", response_model=CallUploadRead, status_code=status.HTTP_202_ACCEPTED)
async def create_call_upload(
    background_tasks: BackgroundTasks,
    request: Request,
    file: UploadFile = File(..., description="Reporte Cobranzas XLSX con hoja 'Bsse de llamadas'"),
    period_month: Optional[str] = Form(None),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CallUpload:
    period_date = None
    if period_month:
        try:
            period_date = datetime.strptime(period_month, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "period_month debe ser YYYY-MM-DD")

    upload = CallUpload(uploaded_by=user.id, status="pending", period_month=period_date)
    db.add(upload)
    await db.commit()
    await db.refresh(upload)

    upload.filename, upload.file_path, upload.file_sha256 = await _save_call_file(file, upload.id)
    await db.commit()

    await record_action(
        db,
        user_id=user.id,
        action="create_call_upload",
        resource_type="call_upload",
        resource_id=upload.id,
        ip=client_ip(request),
        extra={"period_month": period_month},
    )

    background_tasks.add_task(process_call_upload, upload.id)
    return upload


@router.get("/uploads", response_model=CallUploadList)
async def list_call_uploads(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CallUploadList:
    result = await db.execute(select(CallUpload).order_by(CallUpload.uploaded_at.desc()).limit(100))
    items = result.scalars().all()
    return CallUploadList(items=[CallUploadRead.model_validate(u) for u in items], total=len(items))


@router.get("/uploads/{upload_id}", response_model=CallUploadRead)
async def get_call_upload(
    upload_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CallUpload:
    upload = await db.get(CallUpload, upload_id)
    if not upload:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Upload no encontrado")
    return upload


@router.get("/reports", response_model=CallReportList)
async def list_call_reports(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CallReportList:
    result = await db.execute(select(CallReport).order_by(CallReport.generated_at.desc()).limit(100))
    items = result.scalars().all()
    return CallReportList(items=[CallReportSummary.model_validate(r) for r in items], total=len(items))


@router.get("/reports/{report_id}", response_model=CallReportDetail)
async def get_call_report(
    report_id: str,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CallReport:
    report = await db.get(CallReport, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reporte no encontrado")
    await record_action(
        db,
        user_id=user.id,
        action="view_call_report",
        resource_type="call_report",
        resource_id=report_id,
        ip=client_ip(request),
    )
    return report
