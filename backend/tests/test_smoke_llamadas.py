"""Smoke test: parse + analyze 'Bsse de llamadas' fixture."""
from pathlib import Path

import pytest

from app.services.parsers import parse_llamadas
from app.services.analyzers import analyze_llamadas


FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="module")
def llamadas_rows():
    f = FIXTURES / "reporte_cobranzas.xlsx"
    if not f.exists():
        pytest.skip("Fixture reporte_cobranzas.xlsx no disponible")
    return parse_llamadas(f)


def test_parse_volume(llamadas_rows):
    assert len(llamadas_rows) > 2000
    # Cada fila debe tener los campos
    sample = llamadas_rows[0]
    assert "usuario" in sample
    assert "fecha" in sample
    assert "duracion_seg" in sample


def test_analyze_kpis(llamadas_rows):
    result = analyze_llamadas(llamadas_rows)
    k = result["kpis"]
    assert k["total_llamadas"] == 2753
    assert k["asesores_activos"] == 3
    assert k["dias_operativos"] == 9
    assert k["total_talk_seg"] > 0
    assert len(result["asesores"]) == 3
    assert len(result["serie_diaria_llamadas"]) == 9
    # Cada fila de serie debe tener una key por cada usuario
    sample_day = result["serie_diaria_llamadas"][0]
    for user in result["usuarios"]:
        assert user in sample_day
