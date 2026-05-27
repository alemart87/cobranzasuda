"""Smoke test: parse + analyze using the real Excel files provided."""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.services.analyzers import analyze_cartera, analyze_recupero, project_recupero
from app.services.parsers import parse_boca, parse_cobrado, parse_dxp


FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="module")
def files():
    dxp = FIXTURES_DIR / "dxp.xlsx"
    boca = FIXTURES_DIR / "boca.xlsx"
    cobrado = FIXTURES_DIR / "cobrado.xlsx"
    if not (dxp.exists() and boca.exists() and cobrado.exists()):
        pytest.skip("Fixtures no disponibles en backend/tests/fixtures/")
    return dxp, boca, cobrado


def test_parsers(files):
    dxp_path, boca_path, cobrado_path = files
    dxp = parse_dxp(dxp_path)
    boca = parse_boca(boca_path)
    cobrado = parse_cobrado(cobrado_path)
    assert len(dxp) > 1000
    assert len(boca) > 500
    assert len(cobrado) > 20


def test_cartera_kpis(files):
    dxp_path, _, _ = files
    dxp = parse_dxp(dxp_path)
    result = analyze_cartera(dxp)
    k = result["kpis"]
    assert k["asegurados_total"] == 1091
    assert k["polizas_total"] == 1340
    assert int(k["saldo_total"]) == 3_120_968_593
    assert int(k["vencido_total"]) == 300_531_200
    assert k["asegurados_en_mora"] == 369
    assert len(result["tramos"]) == 6
    assert len(result["top_deudores"]) == 10


def test_recupero_kpis(files):
    dxp_path, boca_path, cobrado_path = files
    dxp = parse_dxp(dxp_path)
    boca = parse_boca(boca_path)
    cobrado = parse_cobrado(cobrado_path)
    result = analyze_recupero(dxp, boca, cobrado)
    k = result["kpis"]
    # Validamos los valores del documento .md ya validado
    assert k["asegurados_pagaron"] >= 250
    assert k["recupero_total"] > 80_000_000
    assert k["recupero_sobre_mora"] > 10_000_000
    assert k["recupero_sobre_mora"] < 25_000_000


def test_proyeccion_basic():
    from datetime import date
    proj = project_recupero(92_102_944, dias_transcurridos=20, period_month=date(2026, 5, 1))
    assert proj["dias_totales"] == 31
    assert proj["dias_restantes"] == 11
    assert proj["dias_boost"] == 3
    assert proj["proyectado_total"] > 92_102_944
    assert proj["proyectado_total"] < 200_000_000
