"""Tests unitarios del módulo Televentas (sin archivos fixture)."""
from __future__ import annotations

from datetime import datetime

from app.services.analyzers._nombres import best_match, name_tokens
from app.services.analyzers.televentas_llamadas import analyze_televentas_llamadas
from app.services.analyzers.televentas_produccion import analyze_televentas_produccion, build_produccion_items
from app.services.analyzers.televentas_overview import combine_televentas
from app.services.analyzers.televentas_tendencias import (
    proyeccion_cierre, comparar_meses, caidas_vendedores, comparativo_televentas,
    analizar_tendencia_mensual,
)


def test_tendencia_multimes():
    serie = [
        {"mes": "2026-04", "conversion_pct": 4.2, "contactabilidad": 60, "total_llamadas": 7000, "llamadas_prom_asesor_dia": 30, "agentes_activos": 12},
        {"mes": "2026-05", "conversion_pct": 3.8, "contactabilidad": 57, "total_llamadas": 8000, "llamadas_prom_asesor_dia": 33, "agentes_activos": 14},
        {"mes": "2026-06", "conversion_pct": 3.0, "contactabilidad": 53, "total_llamadas": 8980, "llamadas_prom_asesor_dia": 37, "agentes_activos": 15},
    ]
    ins = analizar_tendencia_mensual(serie)
    tipos = {i["tipo"] for i in ins}
    assert "conversion" in tipos    # conversión a la baja
    assert "base_datos" in tipos    # más marcación con peor contacto
    assert "dotacion" in tipos      # agentes en aumento
    # con un solo mes no hay tendencia
    assert analizar_tendencia_mensual(serie[:1]) == []


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
    # TMO por día (insumo del gráfico de TMO del simulador).
    assert a["por_dia"][0]["tmo_seg"] == 60   # día 1: solo la de 60s contestada
    assert a["por_dia"][1]["tmo_seg"] == 120  # día 2


def test_llamadas_asesores_efectivos_no_promedia_marginales():
    # 3 asesores plenos (80 llamadas) + 1 rotado con 2 llamadas residuales el mismo día:
    # el rotado NO debe entrar al promedio por asesor ni a la dotación efectiva.
    rows = []
    for _ in range(80):
        for op in ("Ana", "Beto", "Carla"):
            rows.append(_llam(op, datetime(2026, 6, 1, 9, 0), 60))
    rows += [_llam("Rotado", datetime(2026, 6, 1, 9, 0), 60) for _ in range(2)]
    a = analyze_televentas_llamadas(rows, umbral=34)
    d = a["por_dia"][0]
    assert d["asesores_activos"] == 4          # nombres con registro
    assert d["asesores_efectivos"] == 3        # actividad significativa
    assert d["promedio_por_asesor"] == 80      # sin la regla daría 61 (242/4)
    assert a["kpis"]["promedio_llamadas_asesor_dia"] == 80.0
    assert a["kpis"]["promedio_llamadas_asesor_dia_bruto"] == 60.5
    assert a["kpis"]["asesores_efectivos_mediana_dia"] == 3


def test_llamadas_profundidad_y_insights():
    # Ana marca 2 días desde el 1; "Nuevo" arranca el día 15 (arranca tarde).
    rows = []
    for d in (1, 2):
        rows += [_llam("Ana Perez", datetime(2026, 6, d, 9, 0), 60) for _ in range(10)]
    rows += [_llam("Nuevo Juan", datetime(2026, 6, 15, 10, 0), 60) for _ in range(5)]
    a = analyze_televentas_llamadas(rows, umbral=34)
    k = a["kpis"]
    assert k["promedio_llamadas_asesor_dia"] > 0
    assert a["por_dia"][0]["asesores_activos"] == 1
    assert "promedio_por_asesor" in a["por_dia"][0]
    assert len(a["distribucion_duracion"]) == 5
    ana = next(v for v in a["por_vendedor"] if v["vendedor"] == "Ana Perez")
    assert ana["dias_activos"] == 2 and ana["primer_dia"] == "2026-06-01"
    # Debe detectar operador iniciando.
    assert any(i["tipo"] == "operador_nuevo" for i in a["insights"])


def test_comparativo_televentas():
    prev = _ov(200_000_000, 100, [
        {"vendedor": "Luis", "es_equipo": True, "prima_emitida": 100_000_000, "polizas": 50, "llamadas": 1000, "contestadas": 600, "pct_contestadas": 60, "conversion_pct": 4.0},
        {"vendedor": "Ana", "es_equipo": True, "prima_emitida": 100_000_000, "polizas": 50, "llamadas": 900, "contestadas": 500, "pct_contestadas": 55, "conversion_pct": 3.8},
    ])
    prev["kpis"].update({"pct_contestadas": 58.0, "conversion_pct": 3.9})
    curr = _ov(150_000_000, 70, [
        {"vendedor": "Luis", "es_equipo": True, "prima_emitida": 130_000_000, "polizas": 55, "llamadas": 1100, "contestadas": 660, "pct_contestadas": 60, "conversion_pct": 4.1},
        {"vendedor": "Ana", "es_equipo": True, "prima_emitida": 20_000_000, "polizas": 15, "llamadas": 300, "contestadas": 120, "pct_contestadas": 40, "conversion_pct": 1.0},
        {"vendedor": "Nuevo", "es_equipo": True, "prima_emitida": 5_000_000, "polizas": 3, "llamadas": 100, "contestadas": 50, "pct_contestadas": 50, "conversion_pct": 2.0},
    ])
    curr["kpis"].update({"pct_contestadas": 52.0, "conversion_pct": 3.0})
    c = comparativo_televentas(prev, curr, "2026-05", "2026-06")
    tipos = {i["tipo"] for i in c["insights"]}
    assert "operador_nuevo" in tipos          # apareció "Nuevo"
    assert "base_datos" in tipos              # contactabilidad cayó
    assert any(o["vendedor"] == "Ana" and o["estado"] == "cayo" for o in c["por_operador"])


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


def test_proyeccion_media_de_mes():
    # 5 días hábiles con venta (lun-vie 1ª semana de junio 2026), run-rate lineal
    prod = {"kpis": {"prima_emitida": 50_000_000, "polizas_emitidas": 50},
            "por_dia": [{"fecha": f"2026-06-0{d}", "prima": 10_000_000, "polizas": 10} for d in range(1, 6)]}
    p = proyeccion_cierre(prod)
    assert p["mes"] == "2026-06"
    assert p["dias_habiles_transcurridos"] == 5
    assert p["mes_completo"] is False
    # proyección = run-rate * días hábiles del mes (>= lo actual)
    assert p["proyeccion_prima_cierre"] > p["prima_emitida_actual"]


def _ov(prima, polizas, vendedores):
    return {"kpis": {"prima_emitida": prima, "polizas_emitidas": polizas, "conversion_pct": 3.0,
                     "total_llamadas": 1000, "contestadas": 900, "prima_anulada": 0,
                     "ticket_promedio": prima // max(polizas, 1), "dias_productivos": 15},
            "por_vendedor": vendedores, "por_producto": []}


def test_comparar_meses_y_caidas():
    prev = _ov(200_000_000, 100, [
        {"vendedor": "Luis", "es_equipo": True, "prima_emitida": 100_000_000, "polizas": 50, "llamadas": 1000, "contestadas": 900},
        {"vendedor": "Ana", "es_equipo": True, "prima_emitida": 100_000_000, "polizas": 50, "llamadas": 1000, "contestadas": 900},
    ])
    curr = _ov(150_000_000, 70, [
        {"vendedor": "Luis", "es_equipo": True, "prima_emitida": 120_000_000, "polizas": 55, "llamadas": 1100, "contestadas": 990},
        {"vendedor": "Ana", "es_equipo": True, "prima_emitida": 30_000_000, "polizas": 15, "llamadas": 300, "contestadas": 250},
    ])
    cmp = comparar_meses(prev, curr, "2026-05", "2026-06")
    prima_kpi = next(k for k in cmp["kpis"] if k["metric"] == "Prima emitida")
    assert prima_kpi["delta"] == -50_000_000 and prima_kpi["pct"] == -25.0
    # Ana debe ser la mayor caída (orden ascendente por delta)
    assert cmp["por_vendedor"][0]["vendedor"] == "Ana"

    cd = caidas_vendedores(prev, curr, "2026-05", "2026-06", umbral_pct=30.0)
    nombres = {c["vendedor"] for c in cd["caidas"]}
    assert "Ana" in nombres and "Luis" not in nombres  # Luis subió, Ana cayó 70%


def test_gestiones_crm_funnel():
    """Funnel CRM: contacto = subestado ≠ 'No contesta'; tasa aceptación sobre contactos."""
    from datetime import datetime as _dt
    from app.services.analyzers.televentas_crm import analyze_televentas_crm

    def g(sub, user="Ana", dia=1, obs=""):
        return {"usuario": user, "subestado": sub, "estado": "Gestionado", "campana": "Base X",
                "lead": "CLIENTE", "observacion": obs, "fecha": _dt(2026, 8, dia, 9, 0)}

    rows = ([g("No contesta")] * 6 + [g("No acepta", obs="no le interesa")] * 2
            + [g("Agendado")] + [g("Acepta", dia=2)])
    a = analyze_televentas_crm(rows)
    k = a["kpis"]
    assert k["total_gestiones"] == 10
    assert k["contactos"] == 4 and k["tasa_contacto_pct"] == 40.0
    assert k["aceptas"] == 1 and k["tasa_aceptacion_pct"] == 25.0
    assert a["por_dia"][-1]["acumulado"] == 10
    op = a["por_operador"][0]
    assert op["operador"] == "Ana" and op["gestiones"] == 10 and op["dias_activos"] == 2


def test_voz_ventas_motivos_noventa():
    """Voz en ventas: clasificación de motivos y separación de no-venta."""
    from app.services.analyzers.voz_ventas import analizar_voz_ventas, clasificar_motivo
    assert clasificar_motivo("NO INTERESADO") == "No interesado / rechaza"
    assert clasificar_motivo("No lo quiere") == "No interesado / rechaza"
    assert clasificar_motivo("no cuenta  con numero de celular") == "Sin datos de contacto"
    assert clasificar_motivo("cuenta con seguro en otra compañia") == "Ya tiene cobertura"
    assert clasificar_motivo("no cuenta con tc ni cuenta bancaria") == "Sin medio de pago"
    rows = [
        {"subestado": "No acepta", "observacion": "no está interesado"},
        {"subestado": "No acepta", "observacion": "ya tiene seguro"},
        {"subestado": "No contesta", "observacion": "buzon de voz"},
        {"subestado": "Acepta", "observacion": "acepta la propuesta"},
    ]
    v = analizar_voz_ventas(rows)
    assert v["disponible"] and v["total_observaciones"] == 4
    assert v["no_venta"]["total"] == 2  # solo los 'No acepta' con observación


def test_simulador_meta_y_dotacion():
    """El simulador debe ser consistente en ambos sentidos (meta ↔ dotación)."""
    from app.services.analyzers.televentas_simulador import simular, escenarios
    P = {"ticket_promedio": 1_000_000, "conversion_pct": 5.0, "contactabilidad_pct": 50.0,
         "llamadas_asesor_dia": 40, "dias_habiles": 20, "intentos_por_registro": 2.0,
         "tasa_anulacion_pct": 0.0}
    r = simular(P, meta_prima=100_000_000)
    assert r["polizas_necesarias"] == 100          # 100M / 1M
    assert r["contactos_necesarios"] == 2000       # 100 / 5%
    assert r["llamadas_necesarias"] == 4000        # 2000 / 50%
    assert r["asesores_necesarios_redondeo"] == 5  # 4000 / (40*20)
    assert r["registros_base_necesarios"] == 2000  # 4000 / 2
    # inverso: 5 asesores producen la meta
    r2 = simular(P, asesores=5)
    assert r2["prima_neta_proyectada"] == 100_000_000
    # anulación: para neta igual hay que emitir más
    P2 = {**P, "tasa_anulacion_pct": 20.0}
    r3 = simular(P2, meta_prima=100_000_000)
    assert r3["prima_a_emitir"] == 125_000_000
    # escenarios: conservador requiere más asesores que optimista
    esc = escenarios(P, 100_000_000)
    assert esc[0]["asesores_necesarios"] >= esc[2]["asesores_necesarios"]
    # modo base: el insumo cierra el triángulo (2000 registros → la misma meta)
    r4 = simular(P, registros=2000)
    assert r4["modo"] == "base"
    assert r4["llamadas_posibles"] == 4000         # 2000 × 2 intentos
    assert r4["contactos_proyectados"] == 2000
    assert r4["polizas_proyectadas"] == 100
    assert r4["prima_neta_proyectada"] == 100_000_000
    assert r4["asesores_para_trabajarla_redondeo"] == 5


def test_analizador_metodo_cientifico():
    """Hipótesis producción-vs-objetivo: la descomposición LMDI debe ser exacta y
    el factor dominante correcto; un objetivo irreal sin caída operativa se detecta."""
    from app.services.analyzers.televentas_analizador import analizar_cientifico

    def mes(m, llam, cont, pol, emit, neta):
        return {"mes": m, "total_llamadas": llam, "contestadas": cont, "polizas_emitidas": pol,
                "prima_emitida": emit, "prima_neta": neta, "contactabilidad": round(cont / llam * 100, 1),
                "conversion_pct": round(pol / cont * 100, 1), "ticket_promedio": round(emit / pol),
                "agentes_efectivos": 15, "llamadas_prom_asesor_dia": 45, "dias_operativos": 21,
                "tiene_crm": False, "tiene_llamadas": True, "tiene_produccion": True}

    prev = mes("2026-05", 17000, 9000, 510, 320_000_000, 300_000_000)
    caida = mes("2026-07", 16500, 8800, 380, 240_000_000, 215_000_000)

    r = analizar_cientifico([prev, caida], 300_000_000, "¿El problema son las bases?")
    assert r["disponible"] and not r["observacion"]["alcanzado"]
    assert "consulta incorporada" in r["hipotesis"].lower()
    # LMDI exacta: los aportes suman la variación real de prima neta
    assert abs(sum(d["aporte_gs"] for d in r["descomposicion"]) - (215_000_000 - 300_000_000)) <= 2
    assert r["descomposicion"][0]["clave"] == "conversion"  # factor dominante correcto
    assert r["acciones"]

    ok = analizar_cientifico([prev, mes("2026-07", 18000, 9600, 560, 350_000_000, 330_000_000)], 300_000_000)
    assert ok["observacion"]["alcanzado"] and "CONFIRMADA" in ok["conclusion"]

    irreal = analizar_cientifico([prev, mes("2026-07", 17200, 9100, 515, 322_000_000, 302_000_000)], 500_000_000)
    assert "excede la capacidad demostrada" in irreal["conclusion"]


def test_regresion_origen_recupera_pendiente():
    """La regresión OLS por el origen recupera la tasa real dentro del IC 95%."""
    import random
    from app.services.analyzers.televentas_simulador import regresion_origen, regresion_diaria
    random.seed(3)
    xs, ys = [], []
    for _ in range(30):
        c = random.randint(100, 500)
        xs.append(float(c))
        ys.append(max(0.0, c * 0.05 + random.gauss(0, 2)))
    r = regresion_origen(xs, ys)
    assert r["disponible"] and r["n"] == 30
    assert r["ic95"][0] <= 0.05 <= r["ic95"][1]      # la tasa real cae en el IC
    assert 0 <= r["r2"] <= 1
    # pocos puntos → no disponible (honestidad estadística)
    assert regresion_origen([1, 2, 3], [1, 2, 3])["disponible"] is False
    # regresion_diaria arma ambas regresiones
    pts = [{"fecha": f"2026-07-{i+1:02d}", "contestadas": x, "polizas": y, "prima": y * 1_000_000}
           for i, (x, y) in enumerate(zip(xs, ys))]
    d = regresion_diaria(pts)
    assert "conversion" in d and "prima_por_contacto" in d
