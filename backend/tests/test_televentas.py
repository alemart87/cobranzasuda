"""Tests unitarios del módulo Televentas (sin archivos fixture)."""
from __future__ import annotations

from datetime import datetime

from app.services.analyzers._nombres import best_match, name_tokens
from app.services.analyzers.televentas_llamadas import analyze_televentas_llamadas
from app.services.analyzers.televentas_produccion import analyze_televentas_produccion, build_produccion_items
from app.services.analyzers.televentas_overview import combine_televentas


def _llam(usuario, fecha, dur):
    return {"usuario": usuario, "fecha": fecha, "duracion_seg": dur,
            "direccion": "Saliente", "cola": "", "conclusion": "", "tipo_medio": "voz"}


def test_llamadas_contestadas_por_umbral():
    rows = [
        _llam("Ana Pérez", datetime(2026, 6, 1, 9, 0), 5),    # < 10 → no contestada
        _llam("Ana Pérez", datetime(2026, 6, 1, 9, 5), 60),   # contestada
        _llam("Ana Pérez", datetime(2026, 6, 2, 9, 0), 120),  # contestada
    ]
    a = analyze_televentas_llamadas(rows, umbral=10)
    assert a["kpis"]["total_llamadas"] == 3
    assert a["kpis"]["contestadas"] == 2
    assert a["kpis"]["no_contestadas"] == 1
    assert a["kpis"]["dias_operativos"] == 2
    assert a["kpis"]["tmo_seg"] == 90  # (60+120)/2
    assert a["por_vendedor"][0]["vendedor"] == "Ana Pérez"


def _prod(vendedor, prima, producto="VIDA", suma=1_000_000, fecha=None):
    return {"secc": "0104", "poliza": "1", "endoso": "", "asegurado": "X",
            "fecha_emision": fecha or datetime(2026, 6, 1).date(), "suma_asegurada": suma,
            "prima": prima, "premio": prima, "tipo_registro": "POLIZA", "vendedor": vendedor,
            "producto": producto, "canal": "CENTRAL", "cobrador": "BANCARD", "es_anulacion": prima < 0}


def test_produccion_emitida_vs_anulada_por_signo():
    rows = [
        _prod("A", 1000), _prod("A", 3000), _prod("B", 2000),
        _prod("A", -500),  # anulación
    ]
    a = analyze_televentas_produccion(rows)
    k = a["kpis"]
    assert k["polizas_emitidas"] == 3
    assert k["prima_emitida"] == 6000
    assert k["polizas_anuladas"] == 1
    assert k["prima_anulada"] == 500
    assert k["prima_neta"] == 5500
    assert k["ticket_promedio"] == 2000
    # ranking por prima emitida
    assert a["por_vendedor"][0]["vendedor"] == "A"
    assert a["por_vendedor"][0]["prima_anulada"] == 500


def test_produccion_items_marca_anulacion():
    items = build_produccion_items([_prod("A", 1000), _prod("A", -500)])
    assert len(items) == 2
    assert items[0]["es_anulacion"] is False
    assert items[1]["es_anulacion"] is True


def test_matching_nombres_formatos_distintos():
    cands = ["BENITEZ ALVARENGA, VANIA GISSEL", "RIVAS BARRIOS, OLGA CELESTE"]
    assert best_match("Vania Gissel Benítez Alvarenga", cands) == "BENITEZ ALVARENGA, VANIA GISSEL"
    assert best_match("Olga Celeste Rivas Barrios", cands) == "RIVAS BARRIOS, OLGA CELESTE"
    assert best_match("Nombre Inexistente Xyz", cands) is None
    assert "vania" in name_tokens("Vania Gissel Benítez")


def test_overview_combina_y_alerta():
    ll = analyze_televentas_llamadas([
        *[_llam("Ana Pérez", datetime(2026, 6, 1, 9, i), 60) for i in range(40)],
        *[_llam("Beto Sosa", datetime(2026, 6, 1, 10, i), 60) for i in range(5)],  # pocas llamadas
    ], umbral=10)
    pr = analyze_televentas_produccion([
        *[_prod("PEREZ, ANA", 1000) for _ in range(10)],
        _prod("SOSA, BETO", 500),  # baja producción
    ])
    o = combine_televentas(ll, pr)
    assert o["kpis"]["total_llamadas"] == 45
    assert o["kpis"]["polizas_emitidas"] == 11
    # Beto debería estar en alertas (bajas llamadas y/o baja producción)
    alertados = {a["vendedor"] for a in o["alertas"]}
    assert "Beto Sosa" in alertados
    # las alertas solo cubren al equipo (con llamadas), no producción-only
    assert all(any(f["vendedor"] == a["vendedor"] and f["es_equipo"] for f in o["por_vendedor"]) for a in o["alertas"])
