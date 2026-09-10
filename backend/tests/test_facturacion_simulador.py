"""Simulador de facturación (Televentas Claro): invariantes del motor."""
from app.services.analyzers.facturacion_simulador import PARAMETROS_DEFAULT, simular_facturacion


def test_mes0_y_retencion_a_6_y_12_meses():
    r = simular_facturacion({"ventas": 1950, "objetivo_co": 1750})
    d = r["derivados"]
    assert d["activaciones"] == round(1950 * 0.89)
    # cumplimiento 99,2% → escalón 95% (50.000); efectividad 89% → 50.000
    assert d["monto_bono_productividad"] == 50000 and d["monto_bono_efectividad"] == 50000
    assert r["bruto_mes0"] == sum(r["mes0"].values())
    # A los 6 meses queda menos que lo facturado (chargebacks) y a 12 se recupera parte con residual
    assert r["neto_6"] < r["bruto_mes0"]
    assert r["neto_12"] > r["neto_6"]
    assert 0 < r["pct_retenido_6"] < 100
    # proyección: 13 meses, acumulado consistente
    assert len(r["meses"]) == 13
    assert r["meses"][6]["acumulado"] == r["neto_6"]
    assert r["meses"][3]["cuota2"] > 0 and r["meses"][6]["recalculo_productividad"] < 0
    assert r["meses"][1]["clawbacks"] < 0 and r["meses"][7]["clawbacks"] == 0  # fuera del chargeback
    # peso de los bonos se genera con cada simulación
    b = r["bonos"]
    assert b["mes0"] == r["mes0"]["bono_productividad"] + r["mes0"]["bono_efectividad"]
    assert 0 < b["peso_mes0_pct"] < 100 and b["sin_bonos_mes0"] == r["bruto_mes0"] - b["mes0"]


def test_escalas_de_bonos_y_acantilado():
    # ≥100% del objetivo → 95.000; <90% → 0
    alto = simular_facturacion({"ventas": 2000, "objetivo_co": 1700})
    assert alto["derivados"]["monto_bono_productividad"] == 95000
    bajo = simular_facturacion({"ventas": 1600, "objetivo_co": 1750})
    assert bajo["derivados"]["monto_bono_productividad"] == 0
    assert "ALERTA" in bajo["conclusion"]
    # efectividad: 84% → 45.000; 79% → 0
    assert simular_facturacion({"efectividad_pct": 84})["derivados"]["monto_bono_efectividad"] == 45000
    assert simular_facturacion({"efectividad_pct": 79})["derivados"]["monto_bono_efectividad"] == 0
    # distancia al siguiente escalón informada en activaciones
    dist = alto["bonos"]["distancia_productividad"]
    assert dist["escalon_actual"]["desde_pct"] == 100 and dist["siguiente_escalon"]["desde_pct"] == 105
    assert dist["faltan_unidades"] > 0


def test_variables_editables_cambian_el_resultado():
    base = simular_facturacion({})
    # zafra plana al 100%: sin caídas → sin clawbacks y más residual
    sin_caidas = simular_facturacion({"zafra_pct": [100.0] * 13})
    assert all(m["clawbacks"] == 0 for m in sin_caidas["meses"])
    assert sin_caidas["neto_12"] > base["neto_12"]
    # escala editada: bono productividad 120.000 en el escalón alcanzado
    esc = [{"desde_pct": 90, "monto": 120000}]
    r = simular_facturacion({"escala_productividad": esc})
    assert r["derivados"]["monto_bono_productividad"] == 120000
    # el mix de planes cambia la cuota 1 ponderada
    solo30 = simular_facturacion({"planes": [{**PARAMETROS_DEFAULT["planes"][1], "mix_pct": 100}]})
    assert solo30["derivados"]["cuota1_ponderada"] == 245455
