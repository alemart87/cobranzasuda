"""Upload endpoint: receives 3 files, validates, enqueues background job."""
from __future__ import annotations

import hashlib
from datetime import datetime
from pathlib import Path
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
from ...jobs.runner import process_upload
from ...models.upload import Upload
from ...schemas.upload import UploadList, UploadRead
from ...services.audit_service import record_action
from ..deps import CurrentUser, client_ip, get_current_user, require_analyst_or_admin


router = APIRouter(prefix="/uploads", tags=["uploads"])


async def _save_file(file: UploadFile, kind: str, upload_id: str) -> tuple[str, str, str]:
    """Save file to disk and return (filename, path, sha256)."""
    if file.filename is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Archivo {kind} sin nombre")

    target_dir = settings.upload_path / upload_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{kind}_{file.filename}"

    sha = hashlib.sha256()
    content = await file.read()
    sha.update(content)

    if len(content) > settings.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Archivo {kind} excede {settings.max_upload_size_mb}MB",
        )

    target.write_bytes(content)
    return file.filename, str(target.resolve()), sha.hexdigest()


@router.post("", response_model=UploadRead, status_code=status.HTTP_202_ACCEPTED)
async def create_upload(
    background_tasks: BackgroundTasks,
    request: Request,
    dxp: UploadFile = File(..., description="DXP Voicenter XLSX"),
    boca: UploadFile = File(..., description="Boca de Cobranzas XLSX"),
    cobrado: UploadFile = File(..., description="Cobrado 186 Voicenter XLSX"),
    period_month: Optional[str] = Form(None, description="YYYY-MM-01 (opcional)"),
    user: CurrentUser = Depends(require_analyst_or_admin),
    db: AsyncSession = Depends(get_db),
) -> Upload:
    period_date = None
    if period_month:
        try:
            period_date = datetime.strptime(period_month, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "period_month debe ser YYYY-MM-DD")

    upload = Upload(uploaded_by=user.id, status="pending", period_month=period_date)
    db.add(upload)
    await db.commit()
    await db.refresh(upload)

    upload.dxp_filename, upload.dxp_path, upload.dxp_sha256 = await _save_file(dxp, "dxp", upload.id)
    upload.boca_filename, upload.boca_path, upload.boca_sha256 = await _save_file(boca, "boca", upload.id)
    upload.cobrado_filename, upload.cobrado_path, upload.cobrado_sha256 = await _save_file(
        cobrado, "cobrado", upload.id
    )
    await db.commit()

    await record_action(
        db,
        user_id=user.id,
        action="create_upload",
        resource_type="upload",
        resource_id=upload.id,
        ip=client_ip(request),
        extra={"period_month": period_month},
    )

    background_tasks.add_task(process_upload, upload.id)
    return upload


@router.get("", response_model=UploadList)
async def list_uploads(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UploadList:
    result = await db.execute(select(Upload).order_by(Upload.uploaded_at.desc()).limit(100))
    items = result.scalars().all()
    return UploadList(items=[UploadRead.model_validate(u) for u in items], total=len(items))


@router.get("/{upload_id}", response_model=UploadRead)
async def get_upload(
    upload_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Upload:
    upload = await db.get(Upload, upload_id)
    if not upload:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Upload no encontrado")
    return upload
