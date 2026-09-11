"""Reunión semanal Televentas (Sudameris): conclusión de la semana y edición /
eliminación de compromisos."""
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
async def test_conclusion_de_la_semana_y_edicion_de_compromisos():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        h = await _login(ac, "admin@voicenter.com.py", "Test1234!")
        semana = "2026-09-04"

        # --- conclusión: no existe, se crea, se edita (queda autor y fecha), se borra ---
        r = await ac.get(f"/api/v1/televentas/semanal/reunion?semana={semana}", headers=h)
        assert r.status_code == 200 and r.json()["reunion"] is None

        r = await ac.put("/api/v1/televentas/semanal/reunion", headers=h,
                         json={"semana": semana, "conclusion": "Semana con conversión en alza; foco en base BPM."})
        assert r.status_code == 200, r.text
        reu = r.json()["reunion"]
        assert reu["semana"] == semana and reu["created_by_nombre"] and reu["created_at"]
        assert reu["updated_at"] is None

        r = await ac.put("/api/v1/televentas/semanal/reunion", headers=h,
                         json={"semana": semana, "conclusion": "Editada: se suma capacitación de 4 personas."})
        assert r.status_code == 200
        reu2 = r.json()["reunion"]
        assert reu2["id"] == reu["id"] and reu2["conclusion"].startswith("Editada")
        assert reu2["updated_by_nombre"] and reu2["updated_at"]

        r = await ac.put("/api/v1/televentas/semanal/reunion", headers=h, json={"semana": semana, "conclusion": "   "})
        assert r.status_code == 400

        r = await ac.get(f"/api/v1/televentas/semanal/reunion?semana={semana}", headers=h)
        assert r.json()["reunion"]["conclusion"].startswith("Editada")

        assert (await ac.delete(f"/api/v1/televentas/semanal/reunion?semana={semana}", headers=h)).status_code == 200
        assert (await ac.get(f"/api/v1/televentas/semanal/reunion?semana={semana}", headers=h)).json()["reunion"] is None
        assert (await ac.delete(f"/api/v1/televentas/semanal/reunion?semana={semana}", headers=h)).status_code == 404

        # --- compromisos: crear, editar texto + responsable + nota, cambiar estado, eliminar ---
        r = await ac.post("/api/v1/televentas/semanal/compromisos", headers=h,
                          json={"semana": semana, "descripcion": "Asignación de base BPM", "responsable": "Voicenter"})
        assert r.status_code == 201, r.text
        cid = r.json()["id"]

        r = await ac.patch(f"/api/v1/televentas/semanal/compromisos/{cid}", headers=h,
                           json={"descripcion": "Asignación de base BPM desde el 02/09", "responsable": "Sudameris",
                                 "nota": "Confirmar volumen"})
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["descripcion"].endswith("02/09") and c["responsable"] == "Sudameris" and c["nota"] == "Confirmar volumen"

        r = await ac.patch(f"/api/v1/televentas/semanal/compromisos/{cid}", headers=h, json={"responsable": "Otro"})
        assert r.status_code == 400

        r = await ac.patch(f"/api/v1/televentas/semanal/compromisos/{cid}", headers=h, json={"estado": "en_proceso"})
        assert r.status_code == 200 and r.json()["estado"] == "en_proceso"

        lst = (await ac.get(f"/api/v1/televentas/semanal/compromisos?semana={semana}", headers=h)).json()["compromisos"]
        assert [x["id"] for x in lst] == [cid]

        assert (await ac.delete(f"/api/v1/televentas/semanal/compromisos/{cid}", headers=h)).status_code == 200
        lst = (await ac.get(f"/api/v1/televentas/semanal/compromisos?semana={semana}", headers=h)).json()["compromisos"]
        assert lst == []
