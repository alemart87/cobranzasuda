"""Simulador de facturación (Televentas Claro): invariantes del motor."""
from app.services.analyzers.facturacion_simulador import PARAMETROS_DEFAULT, simular_facturacion


def test_mes0_y_retencion_a_6_y_12_meses():
    r = simular_facturacion({"ventas": 1950, "objetivo_co": 1750})
    d = r["derivados"]
    assert d["activaciones"] == 1950  # las ventas cargadas ya son efectivas: no se descuentan
    # 1.940 en estado A ÷ 1.750 = 110,9% → escalón 110% (105.000); efectividad 89% → 50.000
    assert d["monto_bono_productividad"] == 105000 and d["monto_bono_efectividad"] == 50000
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
    alto = simular_facturacion({"ventas": 1720, "objetivo_co": 1700})  # 100,7%
    assert alto["derivados"]["monto_bono_productividad"] == 95000
    bajo = simular_facturacion({"ventas": 1500, "objetivo_co": 1750})  # 85,3% < 90%
    assert bajo["derivados"]["monto_bono_productividad"] == 0
    assert "ALERTA" in bajo["conclusion"]
    # efectividad (de entregas): elige el escalón pero NO cambia las activaciones
    r84 = simular_facturacion({"efectividad_pct": 84})
    assert r84["derivados"]["monto_bono_efectividad"] == 45000 and r84["derivados"]["activaciones"] == 1950
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


def test_costos_estructura_y_margen():
    """Costos: ventas por vendedor genera la dotación; supervisores, backoffice, IPS,
    aguinaldo, logística y operativos; margen contra mes 0 y contra lo que queda a 6 meses."""
    r = simular_facturacion({"ventas": 1900, "objetivo_co": 1750})
    c, m = r["costos"], r["margen"]
    assert c["headcount"] == {"vendedores": 95, "supervisores": 7, "backoffice": 11,
                              "coordinadores": 1, "controllers": 2, "total": 116}
    assert c["salario_operador_mes"] == round(14635 * 7 * 23)
    assert c["rrhh"]["operadores_salario"] == round(95 * 14635 * 7 * 23)
    assert c["rrhh"]["operadores_comisiones"] == round(r["bruto_mes0"] * 0.25)
    assert c["rrhh"]["supervisores"] == 7 * (4180000 + 1500000)
    assert c["rrhh"]["controllers"] == 2 * (3600000 + 750000)
    assert c["ips"] == round(c["rrhh_base"] * 0.165)
    assert c["aguinaldo"] == round((c["rrhh_base"] + c["rrhh_base"] * 0.165) / 12)
    assert c["logistica_entregas"] == round(1900 * (0.6 * 80000 + 0.4 * 55000))
    assert c["operativos"] == 1900 * 12500
    assert c["total"] == c["rrhh_base"] + c["ips"] + c["aguinaldo"] + c["logistica_entregas"] + c["logistica_premios"] + c["operativos"]
    assert m["mes0"] == r["bruto_mes0"] - c["total"]
    assert m["meses6"] == r["neto_6"] - c["total"]
    # con la estructura por defecto el negocio no cierra a 6 meses → alerta y sin punto de equilibrio
    assert m["meses6"] < 0 and m.get("breakeven_ventas_6") is None
    assert r["recomendaciones"][0]["severidad"] == "alert"
    # variables editables: más ventas por vendedor y comisión sin bonos mejoran el margen
    mejor = simular_facturacion({"ventas": 1900, "objetivo_co": 1750,
                                 "costos": {"ventas_por_vendedor": 30, "comision_incluye_bonos": False}})
    assert mejor["costos"]["headcount"]["vendedores"] == 64
    assert mejor["margen"]["meses6"] > m["meses6"]


def test_simulacion_sin_bonos():
    con = simular_facturacion({"ventas": 1950, "objetivo_co": 1750})
    sin = simular_facturacion({"ventas": 1950, "objetivo_co": 1750, "bonos_activos": False})
    assert sin["mes0"]["bono_productividad"] == 0 and sin["mes0"]["bono_efectividad"] == 0
    assert sin["bruto_mes0"] == con["bruto_mes0"] - con["bonos"]["mes0"]
    assert sin["meses"][6]["recalculo_productividad"] == 0  # sin bono no hay recálculo
    assert "SIN BONOS" in sin["conclusion"] and "ALERTA" not in sin["conclusion"]
    assert sin["margen"]["meses6"] < con["margen"]["meses6"]


def test_sin_bonos_con_escalon_siguiente_no_rompe():
    # Escenario real del usuario: 1.700 ventas, objetivo 1.700, 100% en estado A, bonos desactivados
    # → cumplimiento 100% tiene un escalón siguiente (105%) pero no hay escalón activo: no debe fallar.
    r = simular_facturacion({"ventas": 1700, "objetivo_co": 1700, "pct_estado_a": 100, "bonos_activos": False})
    assert r["derivados"]["monto_bono_productividad"] == 0
    assert "SIN BONOS" in r["conclusion"]
    assert not any("escalón" in x["titulo"] for x in r["recomendaciones"])
    # y con bonos activos el mismo escenario sí informa el escalón
    con = simular_facturacion({"ventas": 1700, "objetivo_co": 1700, "pct_estado_a": 100})
    assert con["derivados"]["monto_bono_productividad"] == 95000


def test_remuneracion_promedio_del_vendedor():
    r = simular_facturacion({"ventas": 1900, "objetivo_co": 1750})
    c = r["costos"]; v = c["vendedor"]
    assert v["salario_fijo"] == c["salario_operador_mes"]
    assert v["comision_promedio"] == round(c["rrhh"]["operadores_comisiones"] / 95)
    assert v["comision_por_venta"] == round(c["rrhh"]["operadores_comisiones"] / 1900)
    assert v["ingreso_promedio"] == round(c["salario_operador_mes"] + c["rrhh"]["operadores_comisiones"] / 95)
    assert v["ventas_promedio"] == 20.0


def test_simulacion_anual_estructura_fija():
    from app.services.analyzers.facturacion_simulador import simular_anual
    ventas = [1900, 1700, 1800, 2000, 1900, 1600, 1900, 2100, 1900, 1900, 1750, 1900]
    r = simular_anual({"objetivo_co": 1750}, ventas)
    assert len(r["meses"]) == 12 and r["headcount"]["vendedores"] == 95  # fijado por el mes 1 (1.900 ÷ 20)
    m1, m2 = r["meses"][0], r["meses"][1]
    # mes 1: sin cohortes previas → sin ajustes; mes 2: ya recibe ajustes de la cohorte 1
    assert m1["ajustes"] == 0 and m2["ajustes"] != 0
    assert m2["clawbacks"] < 0 and m2["residual"] > 0
    # la estructura fija no cambia con las ventas: mismos salarios en todos los meses
    assert all(f["costos"]["rrhh"]["operadores_salario"] == m1["costos"]["rrhh"]["operadores_salario"] for f in r["meses"])
    assert all(f["costos"]["headcount"]["vendedores"] == 95 for f in r["meses"])
    # lo variable sí cambia: comisiones y logística del mes 2 (1.700 ventas) < mes 1 (1.900)
    assert m2["costos"]["rrhh"]["operadores_comisiones"] < m1["costos"]["rrhh"]["operadores_comisiones"]
    assert m2["costos"]["logistica_entregas"] < m1["costos"]["logistica_entregas"]
    # mes 6 (1.600 ventas = 91% del objetivo) baja de escalón; mes 8 (2.100 = 119%) llega al máximo
    assert r["meses"][5]["escalon_productividad"] == 90 and r["meses"][7]["escalon_productividad"] == 110
    # consistencia anual
    a = r["anual"]
    assert a["ventas"] == sum(ventas)
    assert a["resultado"] == sum(f["resultado"] for f in r["meses"])
    assert r["meses"][-1]["acumulado"] == a["resultado"]
    assert a["cola_post_12"]["total"] != 0


def test_simulacion_a_18_meses():
    from app.services.analyzers.facturacion_simulador import simular_anual
    r12 = simular_anual({"objetivo_co": 1750}, [1900] * 12, 12)
    r18 = simular_anual({"objetivo_co": 1750}, [1900] * 18, 18)
    assert len(r18["meses"]) == 18 and r18["horizonte"] == 18 and r12["horizonte"] == 12
    # los primeros 12 meses son idénticos en ambos horizontes
    assert [m["resultado"] for m in r18["meses"][:12]] == [m["resultado"] for m in r12["meses"]]
    # el mes 13 sigue recibiendo residual de cohortes recientes y ajustes
    m13 = r18["meses"][12]
    assert m13["residual"] > 0 and m13["ajustes"] != 0
    # a 18 meses queda menos cola pendiente que a 12 (más flujos entran en el período)
    assert abs(r18["anual"]["cola_post_12"]["total"]) <= abs(r12["anual"]["cola_post_12"]["total"]) + 1
    assert "18 meses simulados" in r18["conclusion"]
