"""Smoke test: spin up the FastAPI app and hit endpoints.

Env vars are set in conftest.py BEFORE any app import.
"""
from __future__ import annotations

import asyncio
from pathlib import Path

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


async def _login_admin(ac: AsyncClient) -> str:
    r = await ac.post(
        "/api/v1/auth/login",
        json={"email": "admin@voicenter.com.py", "password": "Test1234!"},
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.mark.asyncio
async def test_health():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        r = await ac.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_login_superadmin_and_create_users():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await _login_admin(ac)
        headers = {"Authorization": f"Bearer {token}"}

        r = await ac.get("/api/v1/auth/me", headers=headers)
        assert r.status_code == 200
        assert r.json()["role"] == "superadmin"

        # Crear analista
        r = await ac.post(
            "/api/v1/users",
            json={
                "email": "analyst@voicenter.com.py",
                "password": "Analyst1234!",
                "full_name": "Analista Demo",
                "role": "analyst",
            },
            headers=headers,
        )
        assert r.status_code == 201, r.text

        # Crear cliente
        r = await ac.post(
            "/api/v1/users",
            json={
                "email": "client@sudameris.com.py",
                "password": "Client1234!",
                "full_name": "Cliente Demo",
                "role": "client",
            },
            headers=headers,
        )
        assert r.status_code == 201, r.text

        # Login analista
        r = await ac.post(
            "/api/v1/auth/login",
            json={"email": "analyst@voicenter.com.py", "password": "Analyst1234!"},
        )
        assert r.status_code == 200
        analyst_token = r.json()["access_token"]
        assert r.json()["user_role"] == "analyst"

        # Analista NO puede crear usuarios
        r = await ac.post(
            "/api/v1/users",
            json={"email": "x@x.com", "password": "Xxxxxxxx1!", "full_name": "X", "role": "client"},
            headers={"Authorization": f"Bearer {analyst_token}"},
        )
        assert r.status_code == 403

        # Cliente NO puede subir archivos
        r = await ac.post(
            "/api/v1/auth/login",
            json={"email": "client@sudameris.com.py", "password": "Client1234!"},
        )
        client_token = r.json()["access_token"]
        r = await ac.post(
            "/api/v1/uploads",
            headers={"Authorization": f"Bearer {client_token}"},
            files={
                "dxp": ("d.xlsx", b"x", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
                "boca": ("b.xlsx", b"x", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
                "cobrado": ("c.xlsx", b"x", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            },
        )
        assert r.status_code == 403


@pytest.mark.asyncio
async def test_upload_and_process():
    fixtures = Path(__file__).parent / "fixtures"
    if not (fixtures / "dxp.xlsx").exists():
        pytest.skip("Fixtures no disponibles")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await _login_admin(ac)
        headers = {"Authorization": f"Bearer {token}"}

        with open(fixtures / "dxp.xlsx", "rb") as fd, \
             open(fixtures / "boca.xlsx", "rb") as fb, \
             open(fixtures / "cobrado.xlsx", "rb") as fc:
            r = await ac.post(
                "/api/v1/uploads",
                headers=headers,
                files={
                    "dxp": ("dxp.xlsx", fd, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
                    "boca": ("boca.xlsx", fb, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
                    "cobrado": ("cobrado.xlsx", fc, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
                },
                data={"period_month": "2026-05-01"},
                timeout=60,
            )
        assert r.status_code == 202, r.text
        upload_id = r.json()["id"]

        # Polling
        for _ in range(120):
            r = await ac.get(f"/api/v1/uploads/{upload_id}", headers=headers)
            status_ = r.json()["status"]
            if status_ in ("completed", "failed"):
                break
            await asyncio.sleep(1)
        assert status_ == "completed", f"Status final: {status_}, error: {r.json().get('last_error')}"

        r = await ac.get("/api/v1/reports", headers=headers)
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 1
        report_id = items[0]["id"]

        r = await ac.get(f"/api/v1/reports/{report_id}", headers=headers)
        assert r.status_code == 200
        body = r.json()
        assert body["asegurados_total"] == 1091
        assert body["polizas_total"] == 1340
        assert "cartera" in body["data"]
        assert "recupero" in body["data"]
        assert "proyeccion_total" in body["data"]
