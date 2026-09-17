"""Dashboard de gestión de liderazgo y seguimiento (Televentas Sudameris):
acciones de la semana, mitigaciones por asesor, líderes, sin atender y compromisos."""
from __future__ import annotations

from datetime import date

from app.services.analyzers.televentas_gestion import gestion_semanal, rango_semana


def _seg(fecha, autor, accion, estado, comentario="ok"):
    return {"fecha": f"{fecha}T10:00:00", "autor": autor, "accion": accion, "estado": estado, "comentario": comentario}


def test_rango_semana():
    assert rango_semana("2026-09-11") == (date(2026, 9, 11), date(2026, 9, 17))
    assert rango_semana("2026-W37")[0].isocalendar()[1] == 37
    assert rango_semana("basura") == (None, None)


def test_gestion_semanal_cuenta_mitigaciones_por_asesor_y_lider():
    semana = "2026-09-11"   # viernes 11 → jueves 17
    compromisos = [
        {"id": "c1", "semana": semana, "descripcion": "Reponer 4 vendedores", "responsable": "Voicenter", "estado": "cumplido"},
        {"id": "c2", "semana": semana, "descripcion": "Enviar base BPM", "responsable": "Sudameris", "estado": "pendiente"},
        {"id": "c3", "semana": "2026-09-04", "descripcion": "Arrastrado", "responsable": "Sudameris", "estado": "en_proceso"},
        {"id": "c4", "semana": "2026-08-28", "descripcion": "Viejo cumplido", "responsable": "Voicenter", "estado": "cumplido"},
    ]
    alertas = [
        {"id": "a1", "operador": "ANA", "mes": "2026-08", "estado": "en_mitigacion", "severidad": "alta",
         "estado_operador": "baja", "created_at": "2026-09-08T09:00:00", "detalle": {"indice": 0.6, "motivo": "conversión baja"},
         "seguimiento": [_seg("2026-09-08", "Sistema", "creada", "activa"),
                         _seg("2026-09-12", "Líder 1", "mitigar", "en_mitigacion", "Coaching de speech"),
                         _seg("2026-09-15", "Líder 1", "comentar", "en_mitigacion", "Va mejorando")]},
        {"id": "a2", "operador": "BETO", "mes": "2026-08", "estado": "mitigada", "severidad": "media",
         "estado_operador": "critico", "created_at": "2026-09-01T09:00:00", "detalle": {},
         "seguimiento": [_seg("2026-09-01", "Sistema", "creada", "activa"),
                         _seg("2026-09-05", "Líder 2", "mitigar", "en_mitigacion"),
                         _seg("2026-09-14", "Líder 2", "resolver", "mitigada", "Volvió al objetivo")]},
        {"id": "a3", "operador": "CARLA", "mes": "2026-08", "estado": "activa", "severidad": "alta",
         "estado_operador": "baja", "created_at": "2026-09-02T09:00:00", "detalle": {},
         "seguimiento": [_seg("2026-09-02", "Sistema", "creada", "activa")]},
        {"id": "a4", "operador": "ANA", "mes": "2026-07", "estado": "apagada", "severidad": "media",
         "estado_operador": "critico", "created_at": "2026-08-05T09:00:00", "detalle": {},
         "seguimiento": [_seg("2026-08-05", "Sistema", "creada", "activa"),
                         _seg("2026-08-20", "Líder 1", "apagar", "apagada", "Licencia")]},
    ]
    g = gestion_semanal(compromisos, alertas, semana, hoy=date(2026, 9, 17))

    r = g["resumen"]
    assert g["periodo"] == {"desde": "2026-09-11", "hasta": "2026-09-17"}
    assert r["acciones_semana"] == 3          # mitigar ANA, comentar ANA, resolver BETO (la de BETO del 05/09 no cuenta)
    assert r["mitigaciones_semana"] == 2 and r["asesores_mitigados"] == 2
    assert r["asesores_mitigados_lista"] == ["ANA", "BETO"]
    assert r["alertas_abiertas"] == 2 and r["sin_atender"] == 1 and r["sin_atender_nunca"] == 1
    assert r["compromisos_semana"] == 2 and r["compromisos_cumplidos"] == 1 and r["arrastrados"] == 1
    assert r["lideres_activos"] == 2

    al = g["alertas"]
    assert al["estado_actual"] == {"activa": 1, "en_mitigacion": 1, "mitigada": 1, "apagada": 1}
    assert al["acciones_semana"]["mitigar"] == 1 and al["acciones_semana"]["resolver"] == 1 and al["acciones_semana"]["comentar"] == 1

    ana = next(x for x in al["por_asesor"] if x["asesor"] == "ANA")
    assert ana["alertas"] == 2 and ana["abiertas"] == 1 and ana["estado"] == "en_mitigacion"
    assert ana["mitigaciones_semana"] == 1 and ana["mitigaciones_total"] == 1 and ana["apagadas_total"] == 1
    assert ana["ultima_accion"]["accion"] == "comentar" and ana["dias_sin_accion"] == 2
    assert ana["indice"] == 0.6 and ana["motivo"] == "conversión baja"
    beto = next(x for x in al["por_asesor"] if x["asesor"] == "BETO")
    assert beto["resueltas_semana"] == 1 and beto["mitigaciones_semana"] == 0 and beto["mitigaciones_total"] == 1
    carla = next(x for x in al["por_asesor"] if x["asesor"] == "CARLA")
    assert carla["ultima_accion"] is None and carla["abiertas"] == 1
    assert al["por_asesor"][0]["asesor"] == "ANA"   # abiertas + mitigaciones primero

    assert al["sin_atender"][0]["asesor"] == "CARLA" and al["sin_atender"][0]["dias_sin_accion"] == 15
    lid = {l["lider"]: l for l in al["por_lider"]}
    assert lid["Líder 1"]["acciones"] == 2 and lid["Líder 1"]["asesores"] == ["ANA"]
    assert lid["Líder 2"]["resolver"] == 1
    assert [t["accion"] for t in al["timeline"]] == ["comentar", "resolver", "mitigar"]   # más reciente primero

    c = g["compromisos"]
    assert c["semana"]["cumplimiento_pct"] == 50.0 and c["semana"]["por_responsable"]["Sudameris"]["pendiente"] == 1
    assert [x["id"] for x in c["arrastrados"]["items"]] == ["c3"]
    assert c["historico"]["cumplido"] == 2


# ---- endpoint ----
import asyncio  # noqa: E402

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.core.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


async def _ensure_schema() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)


def setup_module(module):
    asyncio.run(_ensure_schema())


@pytest.mark.asyncio
async def test_endpoint_gestion_semanal():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.post("/api/v1/auth/login", json={"email": "admin@voicenter.com.py", "password": "Test1234!"})
        assert r.status_code == 200, r.text
        h = {"Authorization": f"Bearer {r.json()['access_token']}"}
        semana = "2026-09-11"
        r = await ac.post("/api/v1/televentas/semanal/compromisos", headers=h,
                          json={"semana": semana, "descripcion": "Reponer vendedores", "responsable": "Voicenter"})
        assert r.status_code == 201, r.text
        r = await ac.get(f"/api/v1/televentas/semanal/gestion?semana={semana}&desde=2026-09-11&hasta=2026-09-17", headers=h)
        assert r.status_code == 200, r.text
        g = r.json()
        assert g["periodo"] == {"desde": "2026-09-11", "hasta": "2026-09-17"}
        assert g["resumen"]["compromisos_semana"] == 1 and g["resumen"]["acciones_semana"] == 0
        assert g["alertas"]["por_asesor"] == [] and g["compromisos"]["semana"]["por_responsable"]["Voicenter"]["pendiente"] == 1
        assert (await ac.get(f"/api/v1/televentas/semanal/gestion?semana={semana}&desde=xx", headers=h)).status_code == 400
