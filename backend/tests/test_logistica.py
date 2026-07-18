"""Logística: clasificación de estados de entrega + rol 'logistica' acotado."""
from __future__ import annotations

import asyncio

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import Base, engine
from app.main import app
from app.services.logistica.stats import resumen_ordenes, clasificar_estado
from app.services.logistica.quadminds_client import _is_allowed, _extract_list


def test_clasificar_estado_y_acentos():
    assert clasificar_estado("Entregado") == "entregado"
    assert clasificar_estado("No entregado") == "fallido"
    assert clasificar_estado("Cancelado") == "fallido"
    assert clasificar_estado("En tránsito") == "en_curso"   # con acento
    assert clasificar_estado("Pendiente") == "pendiente"


def test_resumen_ordenes_detecta_campos():
    orders = [
        {"status": "Entregado", "deliveryDate": "2026-07-01T10:00:00"},
        {"status": "Entregado", "deliveryDate": "2026-07-01"},
        {"status": "No entregado", "deliveryDate": "2026-07-01"},
        {"estado": {"name": "Pendiente"}, "fecha": "2026-07-02"},
    ]
    r = resumen_ordenes(orders)
    assert r["total_ordenes"] == 4
    assert r["resumen"]["entregado"] == 2 and r["resumen"]["fallido"] == 1
    assert r["resumen"]["efectividad_sobre_cerradas"] == 66.7
    assert r["por_dia"][0]["fecha"] == "2026-07-01" and r["por_dia"][0]["entregado"] == 2


def test_whitelist_passthrough():
    assert _is_allowed("orders") and _is_allowed("orders/123") and _is_allowed("routes")
    assert not _is_allowed("secretos") and not _is_allowed("admin")
    assert _extract_list({"data": [1, 2]}) == [1, 2]


async def _ensure_schema():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)


def setup_module(module):
    asyncio.run(_ensure_schema())


async def _login(ac, email, pwd):
    r = await ac.post("/api/v1/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.mark.asyncio
async def test_rol_logistica_scope():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        sa = await _login(ac, "admin@voicenter.com.py", "Test1234!")
        r = await ac.post("/api/v1/users", headers=sa, json={
            "email": "logi@suda.com", "password": "Logi1234!", "full_name": "Ana Logi", "role": "logistica"})
        assert r.status_code == 201, r.text
        assert r.json()["granted_modules"] == ["logistica"] and r.json()["allowed_modules"] == []

        h = await _login(ac, "logi@suda.com", "Logi1234!")
        me = (await ac.get("/api/v1/auth/me", headers=h)).json()
        assert me["role"] == "logistica" and me["can_view_logistica"] is True
        assert me.get("can_view_facturacion") is False

        # Accede a Logística.
        assert (await ac.get("/api/v1/logistica/config", headers=h)).status_code == 200
        assert (await ac.get("/api/v1/logistica-agent/access", headers=h)).status_code == 200
        # No gestiona otros módulos ni ve Facturación.
        assert (await ac.get("/api/v1/facturacion/reports", headers=h)).status_code == 403
        assert (await ac.post("/api/v1/gestiones/reports/x/publish", headers=h,
                              json={"is_published": True})).status_code == 403
