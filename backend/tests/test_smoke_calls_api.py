"""End-to-end smoke test for /api/v1/calls/..."""
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


async def _login(ac: AsyncClient) -> str:
    r = await ac.post(
        "/api/v1/auth/login",
        json={"email": "admin@voicenter.com.py", "password": "Test1234!"},
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.mark.asyncio
async def test_call_upload_and_report():
    fixture = Path(__file__).parent / "fixtures" / "reporte_cobranzas.xlsx"
    if not fixture.exists():
        pytest.skip("Fixture no disponible")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await _login(ac)
        headers = {"Authorization": f"Bearer {token}"}

        with open(fixture, "rb") as f:
            r = await ac.post(
                "/api/v1/calls/uploads",
                headers=headers,
                files={
                    "file": (
                        "reporte_cobranzas.xlsx",
                        f,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    )
                },
                data={"period_month": "2026-05-01"},
                timeout=120,
            )
        assert r.status_code == 202, r.text
        upload_id = r.json()["id"]

        # Polling
        for _ in range(120):
            r = await ac.get(f"/api/v1/calls/uploads/{upload_id}", headers=headers)
            status_ = r.json()["status"]
            if status_ in ("completed", "failed"):
                break
            await asyncio.sleep(1)
        assert status_ == "completed", f"Status: {status_}, error: {r.json().get('last_error')}"

        # Listar reportes
        r = await ac.get("/api/v1/calls/reports", headers=headers)
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 1
        report_id = items[0]["id"]

        # Detalle
        r = await ac.get(f"/api/v1/calls/reports/{report_id}", headers=headers)
        assert r.status_code == 200
        body = r.json()
        assert body["total_llamadas"] == 2753
        assert body["asesores_activos"] == 3
        assert body["dias_operativos"] == 9
        assert "asesores" in body["data"]
        assert "serie_diaria_llamadas" in body["data"]
        assert len(body["data"]["asesores"]) == 3
