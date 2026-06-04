"""Tests unitarios del módulo Atención al Cliente (sin archivos fixture).

Cubren los puntos frágiles detectados con datos reales:
  * reparación de mojibake (UTF-8 → Latin-1) en headers/valores;
  * duraciones de cola en milisegundos (float y string) + saneo de basura;
  * agregación de KPIs de llamadas y distribución de gestiones.
"""
from __future__ import annotations

from datetime import datetime

from app.services.analyzers.atencion_gestiones import analyze_atencion_gestiones
from app.services.analyzers.atencion_llamadas import analyze_atencion_llamadas
from app.services.parsers._text import find_col, fix_text, strip_accents
from app.services.parsers.atencion_llamadas_parser import _parse_duration


def test_fix_text_repara_mojibake():
    assert fix_text("DuraciÃ³n") == "Duración"
    assert fix_text("AgÃ¼ero") == "Agüero"
    assert fix_text("ReuniÃ³n") == "Reunión"
    assert fix_text(None) == ""
    assert fix_text("  limpio  ") == "limpio"


def test_find_col_sin_acentos_y_mojibake():
    headers = ["Inicio", "DuraciÃ³n", "Nombre del agente"]
    assert find_col(headers, "duracion") == 1
    assert find_col(headers, "nombre", "agente") == 2
    assert find_col(headers, "inexistente") is None
    assert strip_accents("ConversaciÃ³n media") == "conversacion media"


def test_parse_duration_unidades():
    # string HH:MM:SS (fila de totales)
    assert abs(_parse_duration(" 00:04:31.204") - 271.204) < 1e-3
    # float en milisegundos (fila por intervalo)
    assert abs(_parse_duration(96080.0, numeric_unit="ms") - 96.08) < 1e-6
    # string numérico en ms
    assert abs(_parse_duration("205936.5", numeric_unit="ms") - 205.9365) < 1e-3
    # basura del export (e16) se sanea a 0
    assert _parse_duration(2.157e16, numeric_unit="ms") == 0.0
    # horas que superan 99 (auxiliares largos)
    assert _parse_duration(" 112:32:23.000") == 112 * 3600 + 32 * 60 + 23


def _iv(inicio, oferta, contestadas, abandonadas, manejo_ms=120000.0, sla=0.9):
    return {
        "inicio": inicio, "tipo_medio": "voz", "cola": "Seguros_ATC",
        "oferta": oferta, "contestadas": contestadas, "abandonadas": abandonadas,
        "sla_pct": sla, "asa_seg": 10.0, "manejo_seg": manejo_ms / 1000.0,
        "espera_seg": 5.0, "conversacion_seg": 90.0, "acw_seg": 20.0,
    }


def test_analyze_llamadas_kpis_y_operadores():
    intervalo = [
        _iv(datetime(2026, 5, 1, 9, 0), 10, 9, 1),
        _iv(datetime(2026, 5, 2, 10, 0), 6, 5, 1),
    ]
    colas = {"intervalos": intervalo, "totales": {
        "oferta": 16, "contestadas": 14, "abandonadas": 2,
        "sla_pct": 0.84, "manejo_seg": 271.0, "asa_seg": 10.7, "cola": "", "inicio": None,
    }}
    entrantes = [
        {"usuario": "Ana Pérez", "fecha": datetime(2026, 5, 1, 9), "duracion_seg": 100.0,
         "direccion": "Entrante", "tipo_medio": "voz", "cola": "", "conclusion": ""},
        {"usuario": "Ana Pérez", "fecha": datetime(2026, 5, 1, 10), "duracion_seg": 200.0,
         "direccion": "Saliente", "tipo_medio": "voz", "cola": "", "conclusion": ""},
        {"usuario": "Luis Gómez", "fecha": datetime(2026, 5, 2, 9), "duracion_seg": 60.0,
         "direccion": "Saliente", "tipo_medio": "voz", "cola": "", "conclusion": ""},
    ]
    estados = [
        {"agente": "Ana Pérez", "estado_principal": "Comida", "estado_secundario": "Comida",
         "inicio": None, "fin": None, "duracion_seg": 3600.0},
        {"agente": "Ana Pérez", "estado_principal": "Disponible", "estado_secundario": "Disponible",
         "inicio": None, "fin": None, "duracion_seg": 7200.0},  # no es auxiliar
    ]

    a = analyze_atencion_llamadas(entrantes, estados, intervalo, colas)
    k = a["kpis"]
    assert k["llamadas_ingresadas"] == 16
    assert k["contestadas"] == 14
    assert k["abandonadas"] == 2
    assert k["nivel_atencion_pct"] == 87.5          # 14/16
    assert k["sla_pct"] == 84.0                      # de la fila de totales
    assert k["aht_seg"] == 271.0                      # de la fila de totales
    assert k["dias_operativos"] == 2
    assert k["total_entrantes_op"] == 1
    assert k["total_salientes_op"] == 2

    # JSON serializable (sin datetime sueltos)
    import json
    json.dumps(a)

    ana = next(o for o in a["operadores"] if o["operador"] == "Ana Pérez")
    assert ana["entrantes"] == 1 and ana["salientes"] == 1 and ana["total"] == 2
    assert ana["aux_seg"] == 3600.0                  # solo "Comida", no "Disponible"
    # auxiliares de equipo: solo Comida (3600), no Disponible
    assert a["auxiliares_equipo"][0]["estado"] == "Comida"


def test_queue_claim_atomico_y_reset():
    """El worker reclama jobs de forma atómica y resetea los interrumpidos."""
    import asyncio

    async def _run():
        from sqlalchemy import delete
        from app.core.database import Base, engine, session_scope
        from app.jobs.atencion_queue import _claim_next, _reset_stale_processing
        from app.models.atencion_gestion_upload import AtencionGestionUpload

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        uid = "queue-test-claim"
        async with session_scope() as db:
            await db.execute(delete(AtencionGestionUpload).where(AtencionGestionUpload.id == uid))
            db.add(AtencionGestionUpload(id=uid, uploaded_by="u", status="processing",
                                         file_path="/inexistente.xlsx"))
            await db.commit()

        # Interrumpido (processing) -> pending al bootear.
        await _reset_stale_processing()
        async with session_scope() as db:
            assert (await db.get(AtencionGestionUpload, uid)).status == "pending"

        # Primer claim lo toma; el segundo no devuelve el mismo (ya no está pending).
        job = await _claim_next()
        assert job == ("gestiones", uid)
        assert await _claim_next() is None
        async with session_scope() as db:
            assert (await db.get(AtencionGestionUpload, uid)).status == "processing"
            await db.execute(delete(AtencionGestionUpload).where(AtencionGestionUpload.id == uid))
            await db.commit()

    asyncio.run(_run())


def test_analyze_gestiones_distribuciones():
    rows = [
        {"cliente": "A", "tipo_caso": "Consulta", "estado": "Cerrado",
         "motivo": "Estado de siniestro", "canal": "Telefonico",
         "departamento": "CX", "seccion": "Auto", "responsable": "x",
         "fecha_llamada_dt": datetime(2026, 5, 1)},
        {"cliente": "B", "tipo_caso": "Reclamo", "estado": "Pendiente",
         "motivo": "Cancelación", "canal": "Whatsapp",
         "departamento": "Retenciones", "seccion": "AP", "responsable": "y",
         "fecha_llamada_dt": datetime(2026, 5, 1)},
        {"cliente": "C", "tipo_caso": "Consulta", "estado": "Cerrado",
         "motivo": "Estado de siniestro", "canal": "Correo",
         "departamento": "CX", "seccion": "Auto", "responsable": "x",
         "fecha_llamada_dt": datetime(2026, 5, 2)},
    ]
    g = analyze_atencion_gestiones(rows)
    assert g["kpis"]["total_gestiones"] == 3
    assert g["kpis"]["cerrados"] == 2
    assert g["kpis"]["pendientes"] == 1
    assert g["por_tipo"][0] == {"label": "Consulta", "cantidad": 2, "pct": 66.7}
    canales = {c["label"] for c in g["por_canal"]}
    assert canales == {"Telefonico", "Whatsapp", "Correo"}
    assert g["top_motivos"][0]["label"] == "Estado de siniestro"
    assert len(g["por_dia"]) == 2

    import json
    json.dumps(g)
