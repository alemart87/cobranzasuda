"""Monitoreos de calidad (Televentas Sudameris): parser del export, análisis semántico,
carga por API, flujo de devolución y su reflejo en la gestión semanal."""
from __future__ import annotations

import asyncio
from datetime import date, datetime
from pathlib import Path

import openpyxl
import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import Base, engine
from app.main import app
from app.services.analyzers.televentas_gestion import gestion_semanal
from app.services.analyzers.televentas_monitoreos import analizar_monitoreo, analizar_monitoreos
from app.services.parsers.televentas_monitoreos_parser import parse_televentas_monitoreos

HEADERS = ["id_monitoreo", "nombre_cuenta", "fecha monitoreo", "fecha llamada", "monitoreador", "operador",
           "estado_operador", "id_archivograv", "duracion_llamada", "tipo de llamada", "tipo de contacto",
           "tipo de producto", "motivo de llamada", "comentarios", "sugerencias", "compromiso", "estado",
           "total_precision", "critico", "caso_puntual"]
FILAS = [
    [403147, "sudameris seguros ventas", datetime(2026, 9, 8, 12, 33), datetime(2026, 9, 7), "Moni Uno", "ASESOR A", "Activo",
     "26ed11b6", "2m 10s", "Saliente", "Titular", "Seguro de Vida", "Ofrecimiento",
     "Asesor identifica a titular, se presenta, menciona beneficios y características, cliente menciona que no se encuentra interesado.",
     "Falta sondeo de manera a obtener herramientas para el rebatimiento", "", "Evaluado", 75, "NO", "NO"],
    [403573, "sudameris seguros ventas", datetime(2026, 9, 15, 17, 13), datetime(2026, 9, 15), "Moni Uno", "ASESOR B", "Activo",
     "a8b486be", "15m 07s", "Saliente", "Titular", "Seguro de AP", "Ofrecimiento",
     "Asesor identifica a titular y se presenta, menciona que la llamada es grabada, confirma datos, realiza consultas de salud, menciona exclusiones y cláusula de mora, cierra venta y se despide de forma cordial.",
     "", "", "Evaluado", 100, "NO", "NO"],
    [403120, "sudameris seguros ventas", datetime(2026, 9, 16, 10, 0), datetime(2026, 9, 16), "Moni Dos", "ASESOR A", "Activo",
     "0dc0598c", "0:03:49", "Saliente", "Titular", "Seguro de Vida", "Ofrecimiento",
     "Asesor consulta por TT, lee el speech, cliente solicita envío por WhatsApp, se despide.",
     "No se visualiza llamada de seguimiento, debe agendar un recontacto; tono de voz bajo", "", "Evaluado", 62, "SI", "NO"],
]


def _xlsx(tmp_path: Path) -> Path:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "reporte_Detalle General de Moni"
    ws.append(HEADERS)
    for f in FILAS:
        ws.append(f)
    ws.append([])
    ws.append(["Reporte generado en fecha: 17:09:26 10:09:01"])
    p = tmp_path / "monitoreos.xlsx"
    wb.save(p)
    return p


def test_parser_monitoreos(tmp_path):
    rows = parse_televentas_monitoreos(_xlsx(tmp_path))
    assert len(rows) == 3
    r = rows[0]
    assert r["id_monitoreo"] == "403147" and r["operador"] == "ASESOR A" and r["precision"] == 75.0
    assert r["fecha_monitoreo"] == datetime(2026, 9, 8, 12, 33) and r["duracion_seg"] == 130
    assert rows[1]["duracion_seg"] == 907 and rows[2]["duracion_seg"] == 229
    assert rows[2]["critico"] is True and rows[0]["critico"] is False
    assert rows[1]["sugerencias"] == ""


def test_analisis_semantico():
    a1 = analizar_monitoreo({"sugerencias": FILAS[0][14], "comentarios": FILAS[0][13], "precision": 75})
    assert {"sondeo", "rebatimiento"} <= set(a1["temas"]) and a1["banda"] == "regular" and not a1["venta_cerrada"]
    a2 = analizar_monitoreo({"sugerencias": "", "comentarios": FILAS[1][13], "precision": 100})
    assert a2["temas"] == [] and a2["venta_cerrada"] and a2["sin_observaciones"] and a2["banda"] == "excelente"
    assert a2["protocolo"]["grabada"] and a2["protocolo"]["exclusiones"] and a2["protocolo_pct"] >= 80
    a3 = analizar_monitoreo({"sugerencias": FILAS[2][14], "comentarios": FILAS[2][13], "precision": 62})
    assert {"recontacto", "actitud"} <= set(a3["temas"]) and a3["banda"] == "critico"

    monis = [{"operador": f[5], "monitoreador": f[4], "tipo_producto": f[11], "motivo_llamada": f[12], "precision": f[17],
              "critico": f[18] == "SI", "caso_puntual": False, "comentarios": f[13], "sugerencias": f[14],
              "fecha_monitoreo": f[2], "duracion_seg": 100, "estado_devolucion": "devuelto" if i == 1 else "pendiente"}
             for i, f in enumerate(FILAS)]
    g = analizar_monitoreos(monis)
    r = g["resumen"]
    assert r["monitoreos"] == 3 and r["operadores"] == 2 and r["precision_promedio"] == 79.0
    assert r["pct_excelente"] == 33.3 and r["criticos"] == 1 and r["ventas_cerradas"] == 1
    assert r["devueltos"] == 1 and r["pendientes_devolucion"] == 2
    assert g["temas"][0]["key"] in ("sondeo", "recontacto", "rebatimiento", "actitud")
    a = next(o for o in g["por_operador"] if o["operador"] == "ASESOR A")
    assert a["n"] == 2 and a["precision_promedio"] == 68.5 and a["criticos"] == 1 and a["banda"] == "critico"
    assert g["por_operador"][0]["operador"] == "ASESOR A"   # peor primero
    assert any("sondeo" in h.lower() or "recontacto" in h.lower() for h in g["hallazgos"])


def test_gestion_semanal_cuenta_comentario_como_gestion_y_monitoreos():
    semana = "2026-09-11"
    alertas = [
        {"id": "a1", "operador": "ASESOR A", "estado": "activa", "severidad": "alta", "created_at": "2026-09-01T09:00:00", "detalle": {},
         "seguimiento": [{"fecha": "2026-09-01T09:00:00", "autor": "Sistema", "accion": "creada", "estado": "activa"},
                         {"fecha": "2026-09-14T09:00:00", "autor": "Líder", "accion": "comentar", "estado": "activa", "comentario": "Hablé con él"}]},
        {"id": "a2", "operador": "ASESOR B", "estado": "activa", "severidad": "alta", "created_at": "2026-09-01T09:00:00", "detalle": {},
         "seguimiento": [{"fecha": "2026-09-01T09:00:00", "autor": "Sistema", "accion": "creada", "estado": "activa"}]},
    ]
    monis = [{"operador": "ASESOR A", "fecha_monitoreo": "2026-09-12T10:00:00", "precision": 80, "estado_devolucion": "devuelto"},
             {"operador": "ASESOR A", "fecha_monitoreo": "2026-09-16T10:00:00", "precision": 60, "estado_devolucion": "pendiente", "critico": True},
             {"operador": "ASESOR C", "fecha_monitoreo": "2026-09-13T10:00:00", "precision": 90, "estado_devolucion": "pendiente"},
             {"operador": "ASESOR D", "fecha_monitoreo": "2026-09-03T10:00:00", "precision": 90, "estado_devolucion": "pendiente"}]  # fuera de la semana
    g = gestion_semanal([], alertas, semana, hoy=date(2026, 9, 17), monitoreos=monis, agentes_activos=20)
    r = g["resumen"]
    assert r["mitigaciones_semana"] == 0                      # ningún mitigar/resolver…
    assert r["casos_gestionados"] == 1 and r["casos_gestionados_lista"] == ["ASESOR A"]   # …pero el comentario cuenta
    assert r["abiertas_gestionadas"] == 1 and r["abiertas_sin_gestion"] == 1
    assert r["sin_atender"] == 1 and g["alertas"]["sin_atender"][0]["asesor"] == "ASESOR B"
    m = g["monitoreos"]
    assert m["monitoreos"] == 3 and m["operadores_monitoreados"] == 2 and m["pct_monitoreo"] == 10.0
    assert m["devueltos"] == 1 and m["pendientes"] == 2 and m["pct_devueltos"] == 33.3 and m["criticos"] == 1
    assert m["por_asesor"][0]["asesor"] == "ASESOR A" and m["por_asesor"][0]["precision_promedio"] == 70.0
    assert r["monitoreos_semana"] == 3 and r["pct_monitoreo"] == 10.0 and r["monitoreos_devueltos"] == 1


async def _ensure_schema() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)


def setup_module(module):
    asyncio.run(_ensure_schema())


@pytest.mark.asyncio
async def test_api_carga_analisis_y_devolucion(tmp_path):
    path = _xlsx(tmp_path)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.post("/api/v1/auth/login", json={"email": "admin@voicenter.com.py", "password": "Test1234!"})
        assert r.status_code == 200, r.text
        h = {"Authorization": f"Bearer {r.json()['access_token']}"}

        with open(path, "rb") as fh:
            r = await ac.post("/api/v1/televentas/monitoreos/uploads", headers=h,
                              files={"file": ("monitoreos.xlsx", fh, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
        assert r.status_code == 201, r.text
        assert r.json()["filas"] == 3 and r.json()["nuevos"] == 3 and r.json()["actualizados"] == 0

        r = await ac.get("/api/v1/televentas/monitoreos", headers=h)
        monis = r.json()["monitoreos"]
        assert len(monis) == 3 and all(m["estado_devolucion"] == "pendiente" for m in monis)
        assert monis[0]["analisis"]["banda"]   # análisis guardado al cargar
        m_a = next(m for m in monis if m["id_monitoreo"] == "403147")

        # devolución: el líder devuelve con comentario → devuelto; el asesor comenta
        r = await ac.post(f"/api/v1/televentas/monitoreos/{m_a['id']}/devolucion", headers=h,
                          json={"accion": "devolver", "comentario": "Revisamos la llamada, trabajar el sondeo."})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["estado_devolucion"] == "devuelto" and d["comentario_lider"].startswith("Revisamos") and d["devuelto_por"]
        r = await ac.post(f"/api/v1/televentas/monitoreos/{m_a['id']}/devolucion", headers=h,
                          json={"accion": "comentar_operador", "comentario": "Entendido, voy a preguntar por otros seguros."})
        assert r.json()["comentario_operador"].startswith("Entendido") and len(r.json()["seguimiento"]) == 3
        assert (await ac.post(f"/api/v1/televentas/monitoreos/{m_a['id']}/devolucion", headers=h,
                              json={"accion": "devolver", "comentario": "  "})).status_code == 400

        r = await ac.get("/api/v1/televentas/monitoreos/analisis?desde=2026-09-01&hasta=2026-09-30", headers=h)
        assert r.status_code == 200
        an = r.json()
        assert an["resumen"]["monitoreos"] == 3 and an["resumen"]["devueltos"] == 1 and an["resumen"]["pendientes_devolucion"] == 2
        assert an["por_operador"][0]["operador"] == "ASESOR A"

        r = await ac.get("/api/v1/televentas/monitoreos?estado=pendiente", headers=h)
        assert len(r.json()["monitoreos"]) == 2

        # recarga del mismo archivo: actualiza la evaluación, NO pierde la devolución
        with open(path, "rb") as fh:
            r = await ac.post("/api/v1/televentas/monitoreos/uploads", headers=h, files={"file": ("monitoreos.xlsx", fh, "application/octet-stream")})
        assert r.json()["nuevos"] == 0 and r.json()["actualizados"] == 3
        r = await ac.get(f"/api/v1/televentas/monitoreos/{m_a['id']}", headers=h)
        assert r.json()["estado_devolucion"] == "devuelto" and r.json()["comentario_operador"]

        # gestión semanal con monitoreos y % de monitoreo
        r = await ac.get("/api/v1/televentas/semanal/gestion?semana=2026-09-11&desde=2026-09-11&hasta=2026-09-17&agentes=10", headers=h)
        g = r.json()
        assert g["monitoreos"]["monitoreos"] == 2 and g["monitoreos"]["operadores_monitoreados"] == 2 and g["monitoreos"]["pct_monitoreo"] == 20.0
        assert g["resumen"]["monitoreos_devueltos"] == 0   # el devuelto (403147) es del 08/09, fuera de la semana
