"""Bajas de operadores (Televentas): dar de baja apaga las alertas abiertas, saca al
operador de pendientes y evita alertas nuevas; reincorporar lo devuelve al circuito."""
from __future__ import annotations

import asyncio

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import AsyncSessionLocal, Base, engine
from app.main import app
from app.models.televentas_alerta import TeleventasAlerta


async def _ensure_schema() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)


def setup_module(module):
    asyncio.run(_ensure_schema())


async def _alerta(operador: str, estado: str = "activa") -> str:
    async with AsyncSessionLocal() as s:
        a = TeleventasAlerta(analisis_id="an1", mes="2026-08", operador=operador, estado_operador="baja", severidad="alta",
                             titulo=f"{operador}: baja producción", estado=estado, detalle={}, created_by="u",
                             seguimiento=[{"fecha": "2026-09-01T09:00:00", "autor": "Sistema", "accion": "creada", "estado": "activa", "comentario": "auto"}])
        s.add(a)
        await s.commit()
        return a.id


@pytest.mark.asyncio
async def test_baja_apaga_alertas_y_reincorporacion():
    a1 = await _alerta("Carla Ruíz", "activa")
    a2 = await _alerta("CARLA RUIZ", "en_mitigacion")     # mismo operador, otra grafía
    a3 = await _alerta("Otro Asesor", "activa")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.post("/api/v1/auth/login", json={"email": "admin@voicenter.com.py", "password": "Test1234!"})
        h = {"Authorization": f"Bearer {r.json()['access_token']}"}

        r = await ac.post("/api/v1/televentas/eficiencia/bajas", headers=h,
                          json={"operador": "Carla Ruiz", "motivo": "Renuncia", "fecha_baja": "2026-09-15"})
        assert r.status_code == 201, r.text
        b = r.json()
        assert b["alertas_apagadas_n"] == 2 and set(b["alertas_apagadas"]) == {a1, a2} and b["activa"]

        r = await ac.get("/api/v1/televentas/eficiencia/alertas", headers=h)
        por_id = {a["id"]: a for a in r.json()["alertas"]}
        assert por_id[a1]["estado"] == "apagada" and por_id[a2]["estado"] == "apagada" and por_id[a3]["estado"] == "activa"
        assert por_id[a1]["operador_baja"] is True and por_id[a3]["operador_baja"] is False
        assert "dado de baja" in por_id[a1]["seguimiento"][-1]["comentario"] and "Renuncia" in por_id[a1]["seguimiento"][-1]["comentario"]

        # duplicado
        assert (await ac.post("/api/v1/televentas/eficiencia/bajas", headers=h, json={"operador": "carla ruiz"})).status_code == 400

        # gestión semanal: el operador dado de baja no aparece en el seguimiento por asesor ni en sin atender
        r = await ac.get("/api/v1/televentas/semanal/gestion?semana=2026-09-11&desde=2026-09-11&hasta=2026-09-17", headers=h)
        g = r.json()
        assert [x["asesor"] for x in g["alertas"]["por_asesor"]] == ["Otro Asesor"]
        assert g["resumen"]["sin_atender"] == 1 and g["resumen"]["operadores_baja"] == ["Carla Ruiz"]

        # reincorporar
        r = await ac.delete(f"/api/v1/televentas/eficiencia/bajas/{b['id']}", headers=h)
        assert r.status_code == 200 and r.json()["reincorporado_at"] and not r.json()["activa"]
        r = await ac.get("/api/v1/televentas/eficiencia/bajas", headers=h)
        assert r.json()["bajas"] == []
        r = await ac.get("/api/v1/televentas/eficiencia/bajas?todas=true", headers=h)
        assert len(r.json()["bajas"]) == 1
        r = await ac.get("/api/v1/televentas/eficiencia/alertas", headers=h)
        assert all(a["operador_baja"] is False for a in r.json()["alertas"])
