"""Endpoints del Agente de Experiencia: conversaciones, mensajes y chat (SSE)."""
from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import settings
from ...core.database import get_db, session_scope
from ...core.logging import logger
from ...models.agent import AgentConversation, AgentMessage
from ...models.user import User
from ...services.agent.core import AgentNotConfigured, current_month, stream_agent
from ...services.agent.pricing import compute_cost_usd, pricing_info
from ...services.agent.tools import AgentContext
from ...services.audit_service import record_action
from ..deps import CurrentUser, client_ip, require_agent_access, require_superadmin


router = APIRouter(prefix="/agent", tags=["agent"])


class ConversationCreate(BaseModel):
    title: Optional[str] = None


class ConversationRename(BaseModel):
    title: str


class MessageCreate(BaseModel):
    content: str


class ConversationRead(BaseModel):
    id: str
    title: Optional[str]
    scope: str
    created_at: datetime
    last_message_at: Optional[datetime]


class MessageRead(BaseModel):
    id: str
    role: str
    content: str
    reasoning: str = ""
    artifacts: list
    created_at: datetime


async def _own_conversation(conv_id: str, user: CurrentUser, db: AsyncSession) -> AgentConversation:
    conv = await db.get(AgentConversation, conv_id)
    if not conv or conv.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversación no encontrada")
    return conv


@router.get("/access")
async def agent_access(user: CurrentUser = Depends(require_agent_access)) -> dict:
    """Estado del agente para el usuario: habilitado + si el servidor está configurado."""
    return {
        "enabled": True,
        "configured": settings.agent_enabled,
        "model": settings.agent_model,
        "default_month": current_month(),
    }


@router.get("/costs")
async def agent_costs(
    user: CurrentUser = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Consumo de tokens y costo del Agente por usuario (solo superadmin)."""
    rows = (await db.execute(
        select(
            AgentConversation.user_id,
            func.count(AgentMessage.id),
            func.coalesce(func.sum(AgentMessage.input_tokens), 0),
            func.coalesce(func.sum(AgentMessage.cached_tokens), 0),
            func.coalesce(func.sum(AgentMessage.output_tokens), 0),
            func.coalesce(func.sum(AgentMessage.total_tokens), 0),
            func.coalesce(func.sum(AgentMessage.cost_usd), 0),
            func.max(AgentMessage.created_at),
        )
        .join(AgentConversation, AgentMessage.conversation_id == AgentConversation.id)
        .where(AgentMessage.role == "assistant")
        .group_by(AgentConversation.user_id)
    )).all()

    # Resolver nombres/emails de los usuarios (superadmin es sintético).
    ids = [r[0] for r in rows if r[0] and r[0] != "superadmin"]
    users_by_id: dict[str, User] = {}
    if ids:
        for u in (await db.execute(select(User).where(User.id.in_(ids)))).scalars().all():
            users_by_id[u.id] = u

    items = []
    for (uid, queries, t_in, t_cached, t_out, t_total, cost, last_at) in rows:
        if uid == "superadmin":
            name, email, role = settings.superadmin_name, settings.superadmin_email, "superadmin"
        else:
            u = users_by_id.get(uid)
            name = u.full_name if u else "(usuario eliminado)"
            email = u.email if u else uid
            role = u.role if u else "—"
        q = int(queries or 0)
        cost = float(cost or 0)
        items.append({
            "user_id": uid, "name": name, "email": email, "role": role,
            "queries": q,
            "input_tokens": int(t_in or 0), "cached_tokens": int(t_cached or 0),
            "output_tokens": int(t_out or 0), "total_tokens": int(t_total or 0),
            "cost_usd": round(cost, 6),
            "avg_cost_usd": round(cost / q, 6) if q else 0.0,
            "last_at": last_at.isoformat() if last_at else None,
        })
    items.sort(key=lambda x: -x["cost_usd"])

    totals = {
        "queries": sum(i["queries"] for i in items),
        "input_tokens": sum(i["input_tokens"] for i in items),
        "cached_tokens": sum(i["cached_tokens"] for i in items),
        "output_tokens": sum(i["output_tokens"] for i in items),
        "total_tokens": sum(i["total_tokens"] for i in items),
        "cost_usd": round(sum(i["cost_usd"] for i in items), 6),
    }
    return {"pricing": pricing_info(), "items": items, "totals": totals}


@router.get("/conversations", response_model=list[ConversationRead])
async def list_conversations(
    user: CurrentUser = Depends(require_agent_access),
    db: AsyncSession = Depends(get_db),
) -> list[AgentConversation]:
    rows = await db.execute(
        select(AgentConversation)
        .where(AgentConversation.user_id == user.id)
        .order_by(AgentConversation.last_message_at.desc().nullslast(),
                  AgentConversation.created_at.desc())
        .limit(100)
    )
    return rows.scalars().all()


@router.post("/conversations", response_model=ConversationRead, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    payload: ConversationCreate,
    user: CurrentUser = Depends(require_agent_access),
    db: AsyncSession = Depends(get_db),
) -> AgentConversation:
    conv = AgentConversation(user_id=user.id, scope="atencion", title=payload.title)
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return conv


@router.patch("/conversations/{conv_id}", response_model=ConversationRead)
async def rename_conversation(
    conv_id: str,
    payload: ConversationRename,
    user: CurrentUser = Depends(require_agent_access),
    db: AsyncSession = Depends(get_db),
) -> AgentConversation:
    conv = await _own_conversation(conv_id, user, db)
    conv.title = payload.title.strip()[:255]
    await db.commit()
    await db.refresh(conv)
    return conv


@router.delete("/conversations/{conv_id}")
async def delete_conversation(
    conv_id: str,
    user: CurrentUser = Depends(require_agent_access),
    db: AsyncSession = Depends(get_db),
) -> dict:
    conv = await _own_conversation(conv_id, user, db)
    await db.execute(delete(AgentMessage).where(AgentMessage.conversation_id == conv_id))
    await db.delete(conv)
    await db.commit()
    return {"status": "deleted", "id": conv_id}


@router.get("/conversations/{conv_id}/messages", response_model=list[MessageRead])
async def list_messages(
    conv_id: str,
    user: CurrentUser = Depends(require_agent_access),
    db: AsyncSession = Depends(get_db),
) -> list[AgentMessage]:
    await _own_conversation(conv_id, user, db)
    rows = await db.execute(
        select(AgentMessage).where(AgentMessage.conversation_id == conv_id)
        .order_by(AgentMessage.created_at.asc())
    )
    return rows.scalars().all()


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("/conversations/{conv_id}/messages")
async def post_message(
    conv_id: str,
    payload: MessageCreate,
    request: Request,
    user: CurrentUser = Depends(require_agent_access),
    db: AsyncSession = Depends(get_db),
):
    conv = await _own_conversation(conv_id, user, db)
    text = (payload.content or "").strip()
    if not text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mensaje vacío")

    # Persistir el mensaje del usuario y (si hace falta) titular la conversación.
    now = datetime.utcnow()
    db.add(AgentMessage(conversation_id=conv_id, role="user", content=text))
    if not conv.title:
        conv.title = text[:60]
    conv.last_message_at = now
    await db.commit()

    # Cargar historial (últimos N) como contexto.
    rows = await db.execute(
        select(AgentMessage).where(AgentMessage.conversation_id == conv_id)
        .order_by(AgentMessage.created_at.desc()).limit(settings.agent_max_history)
    )
    history = list(reversed(rows.scalars().all()))
    messages = [{"role": m.role, "content": m.content} for m in history if m.content]

    context = AgentContext(user_id=user.id, default_month=current_month())
    uid = user.id

    async def event_stream():
        final_content = ""
        final_reasoning = ""
        artifacts: list = []
        tool_trace: list = []
        usage: dict = {}
        try:
            async for ev in stream_agent(messages, context):
                if ev["type"] == "done":
                    final_content = ev.get("content", "")
                    final_reasoning = ev.get("reasoning", "")
                    artifacts = ev.get("artifacts", [])
                    tool_trace = ev.get("tool_trace", [])
                    usage = ev.get("usage", {}) or {}
                yield _sse(ev)
        except AgentNotConfigured as exc:
            yield _sse({"type": "error", "message": str(exc)})
            return
        except Exception as exc:  # noqa: BLE001
            logger.exception(f"[agent] error en conversación {conv_id}: {exc}")
            yield _sse({"type": "error", "message": "Ocurrió un error procesando la consulta."})
            return

        # Persistir la respuesta del asistente.
        try:
            async with session_scope() as s:
                cost = compute_cost_usd(
                    usage.get("input_tokens", 0), usage.get("output_tokens", 0),
                    usage.get("cached_tokens", 0),
                )
                s.add(AgentMessage(
                    conversation_id=conv_id, role="assistant",
                    content=final_content, reasoning=final_reasoning,
                    artifacts=artifacts, tool_trace=tool_trace,
                    input_tokens=usage.get("input_tokens", 0),
                    cached_tokens=usage.get("cached_tokens", 0),
                    output_tokens=usage.get("output_tokens", 0),
                    reasoning_tokens=usage.get("reasoning_tokens", 0),
                    total_tokens=usage.get("total_tokens", 0),
                    cost_usd=cost,
                ))
                c = await s.get(AgentConversation, conv_id)
                if c:
                    c.last_message_at = datetime.utcnow()
                await s.commit()
                await record_action(
                    s, user_id=uid, action="agent_message", resource_type="agent_conversation",
                    resource_id=conv_id, extra={"tools": [t.get("tool") for t in tool_trace]},
                )
        except Exception as exc:  # noqa: BLE001
            logger.exception(f"[agent] no se pudo persistir respuesta: {exc}")

    return StreamingResponse(event_stream(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache", "X-Accel-Buffering": "no",
    })
