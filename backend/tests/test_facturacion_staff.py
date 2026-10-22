"""Zona de staff: rotación, reclutamiento, capacitación, calidad a 90 días y ausentismo (escenario aparte)."""
from app.services.analyzers.facturacion_convergente import simular_convergente
from app.services.analyzers.facturacion_staff import dinamica_staff, simular_staff, staff_con_defaults

PLAN = [1900] * 12


def test_rotacion_sin_reponer_acaba_el_equipo_en_5_meses():
    cfg = staff_con_defaults({"rotacion_pct": 20, "postulantes_por_mes": 0})
    f = dinamica_staff(cfg, 8, 23, [1900] * 8, 95, 20)
    assert [r["staff_cierre"] for r in f[:5]] == [76, 57, 38, 19, 0]
    assert all(r["staff_cierre"] == 0 and r["bajas_rotacion"] == 0 for r in f[5:])
    # base "actual": 20 % del staff del mes (decrece pero no llega a cero)
    act = dinamica_staff(staff_con_defaults({"rotacion_pct": 20, "postulantes_por_mes": 0, "rotacion_base": "actual"}), 5, 23, [1900] * 5, 100, 20)
    assert [r["staff_cierre"] for r in act] == [80, 64, 51.2, 41, 32.8]


def test_postulantes_capacitacion_y_calidad_90_dias():
    cfg = staff_con_defaults({"rotacion_pct": 0, "postulantes_por_mes": 20, "efectividad_capacitacion_pct": 50,
                              "calidad_reclutamiento_90_pct": 70, "dias_capacitacion": 0, "ausentismo_pct": 0})
    f = dinamica_staff(cfg, 6, 23, [1900] * 6, 95, 20)
    assert all(r["aprobados"] == 10 for r in f)                 # 20 × 50 %
    assert [r["bajas_90"] for r in f[:3]] == [1, 2, 3]          # 30 % de cada cohorte se va en sus 3 primeros meses
    assert f[3]["staff_cierre"] - f[2]["staff_cierre"] == 7     # en régimen cada mes suma 7 (10 × 70 %)
    # 10 días de capacitación sobre 23: los que ingresan venden 13/23 del mes
    cap = dinamica_staff(staff_con_defaults({"rotacion_pct": 0, "postulantes_por_mes": 20, "dias_capacitacion": 10,
                                             "calidad_reclutamiento_90_pct": 100, "ausentismo_pct": 0}), 2, 23, [1900] * 2, 95, 20)
    assert abs(cap[0]["staff_productivo"] - (95 + 10 * 13 / 23)) < 0.01
    assert abs(cap[1]["staff_productivo"] - (105 + 10 * 13 / 23)) < 0.01
    # capacitación más larga que el mes: ingresan el mes siguiente
    largo = dinamica_staff(staff_con_defaults({"rotacion_pct": 0, "postulantes_por_mes": 20, "dias_capacitacion": 30,
                                               "calidad_reclutamiento_90_pct": 100, "ausentismo_pct": 0}), 3, 23, [1900] * 3, 95, 20)
    assert largo[0]["aprobados"] == 0 and largo[1]["aprobados"] == 10


def test_ausentismo_y_dotacion_necesaria():
    cfg = staff_con_defaults({"rotacion_pct": 0, "postulantes_por_mes": 0, "ausentismo_pct": 12})
    f = dinamica_staff(cfg, 1, 23, [1900], 95, 20)[0]
    assert f["presentes"] == round(95 * 0.88, 2) and f["ventas_capacidad"] == round(95 * 0.88 * 20)
    assert f["dotacion_necesaria"] == round(1900 / (20 * 0.88), 1)            # 108 vendedores para el plan


def test_escenario_staff_no_toca_la_proyeccion_y_mide_el_margen():
    params = {"objetivo_co": 1900, "costos": {"ventas_por_vendedor": 20}}
    gpon = {"activo": True, "por_asesor_por_mes": [3], "parametros": {"objetivo": 285}}
    antes = simular_convergente(params, PLAN, 12, gpon=gpon)
    neutro = simular_staff(params, PLAN, 12, gpon=gpon, staff={"rotacion_pct": 0, "postulantes_por_mes": 0, "ausentismo_pct": 0})
    despues = simular_convergente(params, PLAN, 12, gpon=gpon)
    assert [m["resultado"] for m in antes["meses"]] == [m["resultado"] for m in despues["meses"]]   # la proyección no cambia
    # sin rotación, sin postulantes y sin ausentismo, el escenario de staff reproduce la proyección
    assert [m["ventas"] for m in neutro["meses"]] == PLAN
    assert [m["ventas_gpon"] for m in neutro["meses"]] == [m["ventas_gpon"] for m in antes["meses"]]
    assert all(abs(n["resultado"] - a["resultado"]) <= 1 for n, a in zip(neutro["meses"], antes["meses"]))
    # incorporar más gente (con rotación) da más ventas que no reponer
    sin = simular_staff(params, PLAN, 12, gpon=gpon, staff={"rotacion_pct": 10, "postulantes_por_mes": 0})
    con = simular_staff(params, PLAN, 12, gpon=gpon, staff={"rotacion_pct": 10, "postulantes_por_mes": 40})
    assert con["anual"]["ventas"] > sin["anual"]["ventas"] and con["anual"]["staff_final"] > sin["anual"]["staff_final"]
    assert con["anual"]["costo_capacitacion"] > 0 == sin["anual"]["costo_capacitacion"]
    # el margen del escenario incluye el costo de capacitación y es aditivo
    m = con["meses"][0]
    assert m["resultado"] == m["ingreso_neto"] - m["costo_total"]
    assert con["anual"]["resultado"] == sum(x["resultado"] for x in con["meses"])
    # tope de plan: nunca vende más que el plan
    tope = simular_staff(params, PLAN, 12, gpon=gpon, staff={"rotacion_pct": 0, "postulantes_por_mes": 60, "ausentismo_pct": 0, "ventas_modo": "tope_plan"})
    assert all(x["ventas"] <= 1900 for x in tope["meses"])
    # postulantes por mes para reponer: 10 % de 95 ÷ (50 % × 70 %) = 27,1 → 28
    assert sin["anual"]["postulantes_reposicion"] == 28


def test_tope_del_nuevo_ingreso_y_dias_de_capacitacion():
    """Un nuevo vende como máximo 10 en su primer mes vendiendo (desde que termina la capacitación); más días de
    capacitación = menos días vendiendo el mes que ingresa y más costo."""
    base = {"rotacion_pct": 0, "postulantes_por_mes": 20, "efectividad_capacitacion_pct": 50,
            "calidad_reclutamiento_90_pct": 100, "ausentismo_pct": 0}
    f0 = dinamica_staff(staff_con_defaults({**base, "dias_capacitacion": 0}), 3, 23, [1900] * 3, 95, 18)
    assert f0[0]["ventas_nuevos"] == 100 and f0[0]["venta_por_nuevo"] == 10            # 10 nuevos × 10 (tope)
    assert f0[1]["ventas_nuevos"] == 10 * 18 + 10 * 10                                 # la 1ª cohorte ya vende 18
    f10 = dinamica_staff(staff_con_defaults({**base, "dias_capacitacion": 10}), 2, 23, [1900] * 2, 95, 18)
    assert abs(f10[0]["ventas_nuevos"] - 10 * 10 * 13 / 23) < 0.1                      # 13 días vendiendo, al tope
    assert abs(f10[1]["ventas_nuevos"] - (10 * (10 * 10 + 13 * 18) / 23 + 10 * 10 * 13 / 23)) < 0.2
    sin_tope = dinamica_staff(staff_con_defaults({**base, "dias_capacitacion": 0, "tope_ventas_nuevo": 0}), 1, 23, [1900], 95, 18)
    assert sin_tope[0]["ventas_nuevos"] == 180
    # sensibilidad: más días de capacitación → más costo de capacitación
    params = {"objetivo_co": 1900, "costos": {"ventas_por_vendedor": 20}}
    r = simular_staff(params, PLAN, 12, gpon={"activo": False}, staff={}, con_sensibilidad=True)
    sens = {x["dias"]: x for x in r["sensibilidad_dias"]}
    assert sens[30]["costo_capacitacion"] > sens[10]["costo_capacitacion"] > sens[0]["costo_capacitacion"] == 0
    assert sens[0]["ventas"] >= sens[10]["ventas"] >= sens[30]["ventas"]
    assert any(x["actual"] for x in r["sensibilidad_dias"])
    assert r["anual"]["margen_final_pct"] is not None
