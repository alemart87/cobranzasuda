"""Catálogo público de módulos operativos."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from ...core.modules import MODULES
from ..deps import CurrentUser, get_current_user


router = APIRouter(prefix="/modules", tags=["modules"])


@router.get("")
async def list_modules(user: CurrentUser = Depends(get_current_user)) -> list[dict]:
    """Lista los módulos del sistema. Disponible para todos los usuarios autenticados."""
    return MODULES
