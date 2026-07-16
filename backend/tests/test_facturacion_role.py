"""Rol 'facturacion' (Analista de Facturación · Televentas Claro):
acceso completo a Facturación y NADA de los otros módulos."""
from __future__ import annotations

import asyncio

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import Base, engine
from app.main import app


async def _ensure_schema() -> None:
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
async def test_rol_facturacion_scope():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        sa = await _login(ac, "admin@voicenter.com.py", "Test1234!")

        r = await ac.post("/api/v1/users", headers=sa, json={
            "email": "fact@suda.com", "password": "Fact1234!", "full_name": "Ana Fact", "role": "facturacion"})
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["role"] == "facturacion"
        assert body["granted_modules"] == ["televentas_claro"]
        assert body["allowed_modules"] == []

        h = await _login(ac, "fact@suda.com", "Fact1234!")
        me = (await ac.get("/api/v1/auth/me", headers=h)).json()
        assert me["role"] == "facturacion"
        assert me["can_view_facturacion"] is True

        # Facturación: acceso completo (lectura + agente).
        assert (await ac.get("/api/v1/facturacion/reports", headers=h)).status_code == 200
        assert (await ac.get("/api/v1/facturacion-agent/access", headers=h)).status_code == 200

        # Otros módulos: NO puede gestionar (require_analyst_or_admin → 403).
        assert (await ac.post("/api/v1/atencion/gestiones/reports/x/publish", headers=h,
                              json={"is_published": True})).status_code == 403
        assert (await ac.post("/api/v1/gestiones/reports/x/publish", headers=h,
                              json={"is_published": True})).status_code == 403
        # Agente de ventas: no habilitado.
        assert (await ac.get("/api/v1/televentas-agent/access", headers=h)).status_code == 403
