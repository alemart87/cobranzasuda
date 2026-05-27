"""Smoke test: parser + analyzer + API end-to-end for gestiones."""
from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import Base, engine
from app.main import app
from app.services.analyzers import analyze_gestiones
from app.services.parsers import parse_gestiones


FIXTURES = Path(__file__).parent / "fixtures"


async def _ensure_schema() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)


def setup_module(module):
    asyncio.run(_ensure_schema())


@pytest.fixture(scope="module")
def gestiones_rows():
    f = FIXTURES / "reporte_gestiones.xlsx"
    if not f.exists():
        pytest.skip("Fixture no disponible")
    return parse_gestiones(f)


def test_parse_volume(gestiones_rows):
    assert len(gestiones_rows) >= 2900
    sample = gestiones_rows[0]
    assert "usuario" in sample and "subestado" in sample


def test_analyze_kpis(gestiones_rows):
    r = analyze_gestiones(gestiones_rows)
    k = r["kpis"]
    assert k["total_gestiones"] == 2976
    assert k["asesores_activos"] == 3
    assert k["promesas_totales"] == 707
    assert k["cobros_totales"] == 271

    # Funnel del equipo: cada % se calcula sobre el paso anterior
    f = r["funnel_equipo"]
    assert f["gestiones"] == 2976
    # Contactos = gestiones - No contesta - Inubicables = 2976 - 1452 - 254 = 1270
    assert f["contactos_efectivos"] == 1270
    assert f["pct_contactos_efectivos"] == 42.7
    assert f["promesas"] == 707
    assert f["pct_promesas_sobre_contactos"] == 55.7
    assert f["promesas_cumplidas"] == 271
    assert f["pct_promesas_cumplidas"] == 38.3

    assert len(r["asesores"]) == 3
    for a in r["asesores"]:
        assert "pct_contactos_efectivos" in a
        assert "pct_promesas_sobre_contactos" in a
        assert "pct_promesas_cumplidas" in a

    # Por base de datos (campañas)
    assert len(r["campanas"]) > 0
    for c in r["campanas"]:
        assert "campana" in c
        assert "pct_contactos_efectivos" in c


@pytest.mark.asyncio
async def test_api_upload_and_report():
    f = FIXTURES / "reporte_gestiones.xlsx"
    if not f.exists():
        pytest.skip("Fixture no disponible")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        r = await ac.post(
            "/api/v1/auth/login",
            json={"email": "admin@voicenter.com.py", "password": "Test1234!"},
        )
        assert r.status_code == 200, r.text
        token = r.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        with open(f, "rb") as fd:
            r = await ac.post(
                "/api/v1/gestiones/uploads",
                headers=headers,
                files={"file": ("reporte_gestiones.xlsx", fd,
                                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                data={"period_month": "2026-05-01"},
                timeout=120,
            )
        assert r.status_code == 202, r.text
        upload_id = r.json()["id"]

        for _ in range(120):
            r = await ac.get(f"/api/v1/gestiones/uploads/{upload_id}", headers=headers)
            status_ = r.json()["status"]
            if status_ in ("completed", "failed"):
                break
            await asyncio.sleep(1)
        assert status_ == "completed", f"Status: {status_}, error: {r.json().get('last_error')}"

        r = await ac.get("/api/v1/gestiones/reports", headers=headers)
        items = r.json()["items"]
        assert len(items) >= 1
        report_id = items[0]["id"]

        r = await ac.get(f"/api/v1/gestiones/reports/{report_id}", headers=headers)
        body = r.json()
        assert body["total_gestiones"] >= 2900
        assert body["promesas_totales"] == 707
        assert "asesores" in body["data"]
        assert "subestados" in body["data"]
