"""Análisis semántico de monitoreos de calidad (Televentas Sudameris).

Determinista y explicable: un léxico de TEMAS DE MEJORA se busca en las sugerencias
del monitoreador (qué le falta a la llamada) y un CHECKLIST DE PROTOCOLO se busca en
los comentarios (qué hizo bien el asesor). Sobre eso se arman los % de calidad:
precisión promedio, bandas, temas más frecuentes, cumplimiento del protocolo, por
operador / monitoreador / producto, y hallazgos en texto para la reunión.

Todo se calcula sobre dicts (los que devuelve el parser + los campos de devolución
que agrega la base), así se testea sin base de datos.
"""
from __future__ import annotations

import re
import unicodedata
from collections import Counter, defaultdict
from statistics import median
from typing import Any, Optional

# ---- temas de mejora (se buscan en SUGERENCIAS; si no hay, en comentarios) ----
TEMAS: list[dict[str, Any]] = [
    {"key": "sondeo", "label": "Sondeo", "grupo": "Técnica de venta",
     "desc": "No indaga necesidades, seguros que ya posee ni motivo del rechazo.",
     "kw": ["sondeo", "sondear", "consultar si posee", "motivo de rechazo", "si tiene dudas", "consultar el motivo", "indagar"]},
    {"key": "rebatimiento", "label": "Rebatimiento de objeciones", "grupo": "Técnica de venta",
     "desc": "No rebate el 'no me interesa' / 'quiero pensarlo'.",
     "kw": ["rebat", "objecion"]},
    {"key": "recontacto", "label": "Recontacto / seguimiento", "grupo": "Técnica de venta",
     "desc": "No agenda un próximo contacto ni hace la llamada de seguimiento.",
     "kw": ["recontacto", "rellamar", "seguimiento", "agendar", "coordinar", "insistir con el contacto", "proximo contacto", "próximo contacto"]},
    {"key": "aprovechar", "label": "Aprovechar el contacto", "grupo": "Técnica de venta",
     "desc": "Tiene la atención del cliente y no la usa para avanzar.",
     "kw": ["aprovechar el contacto", "aprovechar la atencion", "aprovechar la atención"]},
    {"key": "beneficios", "label": "Beneficios y comparativa", "grupo": "Argumentación",
     "desc": "No enfatiza beneficios, importes de cobertura ni compara con lo que el cliente tiene.",
     "kw": ["comparativa", "comparar", "enfatizar", "mencion de beneficios", "mención de beneficios", "importes de la cobertura", "falta la mencion de beneficios"]},
    {"key": "oferta", "label": "Oferta adecuada", "grupo": "Argumentación",
     "desc": "Ofrece la misma cobertura que el cliente ya posee o no diferencia los productos.",
     "kw": ["misma categoria", "misma categoría", "cobertura igual", "mismo seguro", "cuotas por separado", "son 2 polizas", "son 2 pólizas"]},
    {"key": "exclusiones", "label": "Exclusiones y consultas de salud", "grupo": "Cumplimiento",
     "desc": "No menciona exclusiones ni consulta enfermedades críticas.",
     "kw": ["exclusion", "exclusión", "enfermedades", "consultas de salud"]},
    {"key": "aceptacion", "label": "Aceptación explícita / cierre", "grupo": "Cumplimiento",
     "desc": "No pide la aceptación expresa de la cobertura.",
     "kw": ["acepta la cobertura", "consulta explicita", "consulta explícita", "aceptacion", "aceptación", "cierre"]},
    {"key": "datos", "label": "Confirmación de datos", "grupo": "Cumplimiento",
     "desc": "No confirma mail / datos de contacto.",
     "kw": ["confirma dato", "confirmar dato", "dato de mail", "correo"]},
    {"key": "presentacion", "label": "Presentación", "grupo": "Protocolo",
     "desc": "No se presenta o no identifica correctamente al titular.",
     "kw": ["no se presenta", "debe presentarse", "presentarse", "identificar al titular"]},
    {"key": "escucha", "label": "Escucha activa y manejo de la llamada", "grupo": "Habilidades",
     "desc": "Lee el speech, no hace pausas, no ordena la llamada.",
     "kw": ["escucha activa", "pausas", "ordenar", "manejo de llamada", "lee el speech", "desenvuelta", "enfoque", "abordaje"]},
    {"key": "actitud", "label": "Tono y seguridad", "grupo": "Habilidades",
     "desc": "Tono bajo, inseguridad ('creo'), desgano o insistencia.",
     "kw": ["tono de voz", "desganad", "falta de interes", "falta de interés", "seguridad en la informacion", "seguridad en la información", "insistente", "creo"]},
]

# ---- checklist de protocolo (se busca en COMENTARIOS del monitoreador) ----
PROTOCOLO: list[dict[str, Any]] = [
    {"key": "identifica", "label": "Identifica al titular", "kw": ["identifica a titular", "identifica al titular", "consulta por tt", "identifica titular"]},
    {"key": "presenta", "label": "Se presenta", "kw": ["se presenta", "menciona que se comunica de"]},
    {"key": "beneficios", "label": "Menciona beneficios y características", "kw": ["beneficios", "caracteristicas", "características"]},
    {"key": "importe", "label": "Menciona cuota / importe", "kw": ["cuota", "importe", "costo", "precio", "monto"]},
    {"key": "grabada", "label": "Avisa que la llamada es grabada", "kw": ["grabada", "grabad"]},
    {"key": "confirma", "label": "Confirma datos", "kw": ["confirma datos", "confirma dato", "confirma correo", "confirma beneficiarios", "confirma herederos"]},
    {"key": "salud", "label": "Consultas de salud / laborales", "kw": ["consultas de salud", "preguntas de salud", "consulta de salud", "laborales"]},
    {"key": "exclusiones", "label": "Menciona exclusiones", "kw": ["exclusiones", "exclusion", "exclusión"]},
    {"key": "renovacion", "label": "Renovación automática / cláusula de mora", "kw": ["renovacion", "renovación", "clausula de mora", "cláusula de mora", "retractacion", "retractación"]},
    {"key": "despedida", "label": "Despedida cordial", "kw": ["forma cordial", "despide"]},
]
VENTA_KW = ["cierra venta", "cierra la venta", "confirma poliza", "confirma póliza", "cierran venta", "acepta poliza", "acepta póliza", "cliente acepta", "activacion del seguro", "activación del seguro", "consulta si acepta el seguro, cliente menciona que si", "dar inicio a la poliza", "dar inicio a la póliza", "autoriza", "venta cerrada", "cierre de venta"]

BANDAS = [
    {"key": "excelente", "label": "Excelente (≥ 90)", "min": 90, "color": "#10B981"},
    {"key": "bueno", "label": "Bueno (80–89)", "min": 80, "color": "#0EA5E9"},
    {"key": "regular", "label": "Regular (70–79)", "min": 70, "color": "#F39200"},
    {"key": "critico", "label": "Crítico (< 70)", "min": 0, "color": "#E6332A"},
]


def _norm(s: Any) -> str:
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", s.lower()).strip()


def banda_de(p: Optional[float]) -> str:
    if p is None:
        return "sin_dato"
    for b in BANDAS:
        if p >= b["min"]:
            return b["key"]
    return "critico"


def analizar_monitoreo(m: dict) -> dict[str, Any]:
    """Anotación semántica de UN monitoreo: temas de mejora, protocolo cumplido, venta."""
    sug = _norm(m.get("sugerencias"))
    com = _norm(m.get("comentarios"))
    fuente = sug or ""
    temas = [t["key"] for t in TEMAS if any(_norm(k) in fuente for k in t["kw"])]
    protocolo = {p["key"]: any(_norm(k) in com for k in p["kw"]) for p in PROTOCOLO}
    cumplidos = sum(1 for v in protocolo.values() if v)
    venta = any(_norm(k) in com for k in VENTA_KW)
    return {
        "temas": temas,
        "protocolo": protocolo,
        "protocolo_pct": round(cumplidos / len(PROTOCOLO) * 100, 1) if PROTOCOLO else 0.0,
        "venta_cerrada": venta,
        "banda": banda_de(m.get("precision")),
        "sin_observaciones": not sug,
    }


def _prom(xs: list[float]) -> Optional[float]:
    return round(sum(xs) / len(xs), 1) if xs else None


def analizar_monitoreos(monitoreos: list[dict]) -> dict[str, Any]:
    """Análisis de conjunto: % de calidad, bandas, temas, protocolo, por operador /
    monitoreador / producto y hallazgos. Cada monitoreo puede traer `analisis`
    (anotación guardada) o se calcula acá; y `estado_devolucion` (pendiente|devuelto)."""
    items = []
    for m in monitoreos:
        an = m.get("analisis") or analizar_monitoreo(m)
        items.append({**m, "analisis": an})
    n = len(items)
    precs = [float(m["precision"]) for m in items if m.get("precision") is not None]
    bandas = Counter(m["analisis"]["banda"] for m in items)
    temas_c: dict[str, dict] = {}
    for m in items:
        for k in m["analisis"]["temas"]:
            t = temas_c.setdefault(k, {"n": 0, "operadores": set(), "precs": [], "ejemplos": []})
            t["n"] += 1
            t["operadores"].add(m.get("operador"))
            if m.get("precision") is not None:
                t["precs"].append(float(m["precision"]))
            if len(t["ejemplos"]) < 2 and m.get("sugerencias"):
                t["ejemplos"].append({"operador": m.get("operador"), "texto": str(m["sugerencias"])[:220]})
    temas = []
    for t in TEMAS:
        c = temas_c.get(t["key"])
        if not c:
            continue
        temas.append({"key": t["key"], "label": t["label"], "grupo": t["grupo"], "desc": t["desc"], "n": c["n"],
                      "pct": round(c["n"] / n * 100, 1) if n else 0.0, "operadores": sorted(o for o in c["operadores"] if o),
                      "operadores_n": len(c["operadores"]), "precision_promedio": _prom(c["precs"]), "ejemplos": c["ejemplos"]})
    temas.sort(key=lambda x: (-x["n"], x["label"]))

    protocolo = []
    for p in PROTOCOLO:
        cumple = sum(1 for m in items if m["analisis"]["protocolo"].get(p["key"]))
        protocolo.append({"key": p["key"], "label": p["label"], "n": cumple, "pct": round(cumple / n * 100, 1) if n else 0.0})

    # ---- por operador ----
    por_op: dict[str, dict] = {}
    for m in items:
        op = m.get("operador") or "—"
        o = por_op.setdefault(op, {"operador": op, "n": 0, "precs": [], "criticos": 0, "casos_puntuales": 0, "ventas": 0,
                                   "temas": Counter(), "protocolo": [], "pendientes": 0, "devueltos": 0, "ultimo": None,
                                   "sin_observaciones": 0})
        o["n"] += 1
        if m.get("precision") is not None:
            o["precs"].append(float(m["precision"]))
        o["criticos"] += 1 if m.get("critico") else 0
        o["casos_puntuales"] += 1 if m.get("caso_puntual") else 0
        o["ventas"] += 1 if m["analisis"]["venta_cerrada"] else 0
        o["sin_observaciones"] += 1 if m["analisis"]["sin_observaciones"] else 0
        for k in m["analisis"]["temas"]:
            o["temas"][k] += 1
        o["protocolo"].append(m["analisis"]["protocolo_pct"])
        if (m.get("estado_devolucion") or "pendiente") == "devuelto":
            o["devueltos"] += 1
        else:
            o["pendientes"] += 1
        f = m.get("fecha_monitoreo")
        fs = f.isoformat() if hasattr(f, "isoformat") else (str(f) if f else None)
        if fs and (o["ultimo"] is None or fs > o["ultimo"]):
            o["ultimo"] = fs
    label_tema = {t["key"]: t["label"] for t in TEMAS}
    operadores = []
    for o in por_op.values():
        operadores.append({
            "operador": o["operador"], "n": o["n"], "precision_promedio": _prom(o["precs"]),
            "precision_min": min(o["precs"]) if o["precs"] else None, "precision_max": max(o["precs"]) if o["precs"] else None,
            "banda": banda_de(_prom(o["precs"])), "criticos": o["criticos"], "casos_puntuales": o["casos_puntuales"],
            "ventas": o["ventas"], "protocolo_pct": _prom(o["protocolo"]), "sin_observaciones": o["sin_observaciones"],
            "temas": [{"key": k, "label": label_tema.get(k, k), "n": v} for k, v in o["temas"].most_common(3)],
            "pendientes": o["pendientes"], "devueltos": o["devueltos"], "ultimo": o["ultimo"],
        })
    operadores.sort(key=lambda x: (x["precision_promedio"] if x["precision_promedio"] is not None else 999, x["operador"]))

    def _grupo(campo: str) -> list[dict]:
        g: dict[str, dict] = defaultdict(lambda: {"n": 0, "precs": []})
        for m in items:
            k = m.get(campo) or "—"
            g[k]["n"] += 1
            if m.get("precision") is not None:
                g[k]["precs"].append(float(m["precision"]))
        return sorted([{"nombre": k, "n": v["n"], "precision_promedio": _prom(v["precs"])} for k, v in g.items()],
                      key=lambda x: -x["n"])

    devueltos = sum(1 for m in items if (m.get("estado_devolucion") or "pendiente") == "devuelto")
    ventas = sum(1 for m in items if m["analisis"]["venta_cerrada"])
    resumen = {
        "monitoreos": n,
        "operadores": len(por_op),
        "monitoreadores": len({m.get("monitoreador") for m in items if m.get("monitoreador")}),
        "precision_promedio": _prom(precs),
        "precision_mediana": round(median(precs), 1) if precs else None,
        "precision_min": min(precs) if precs else None,
        "precision_max": max(precs) if precs else None,
        "pct_calidad": _prom(precs),   # % de calidad = precisión promedio de los monitoreos
        "pct_excelente": round(bandas.get("excelente", 0) / n * 100, 1) if n else 0.0,
        "pct_bajo_80": round(sum(1 for p in precs if p < 80) / n * 100, 1) if n else 0.0,
        "criticos": sum(1 for m in items if m.get("critico")),
        "casos_puntuales": sum(1 for m in items if m.get("caso_puntual")),
        "ventas_cerradas": ventas,
        "pct_venta": round(ventas / n * 100, 1) if n else 0.0,
        "sin_observaciones": sum(1 for m in items if m["analisis"]["sin_observaciones"]),
        "protocolo_pct": _prom([m["analisis"]["protocolo_pct"] for m in items]),
        "duracion_promedio_seg": round(sum(int(m.get("duracion_seg") or 0) for m in items) / n) if n else 0,
        "devueltos": devueltos, "pendientes_devolucion": n - devueltos,
        "pct_devueltos": round(devueltos / n * 100, 1) if n else 0.0,
    }
    bandas_out = [{**b, "n": bandas.get(b["key"], 0), "pct": round(bandas.get(b["key"], 0) / n * 100, 1) if n else 0.0} for b in BANDAS]

    hallazgos: list[str] = []
    if n:
        hallazgos.append(f"{n} monitoreos a {len(por_op)} asesores: calidad promedio {resumen['precision_promedio']}% "
                         f"({resumen['pct_excelente']}% excelentes, {resumen['pct_bajo_80']}% por debajo de 80).")
        if temas:
            t0 = temas[0]
            hallazgos.append(f"El tema de mejora más repetido es {t0['label'].lower()}: aparece en {t0['n']} de {n} monitoreos "
                             f"({t0['pct']}%) y afecta a {t0['operadores_n']} asesor(es).")
        if len(temas) > 1:
            hallazgos.append("Siguen: " + ", ".join(f"{t['label'].lower()} ({t['n']})" for t in temas[1:4]) + ".")
        peor = [o for o in operadores if o["precision_promedio"] is not None]
        if peor:
            p0 = peor[0]
            hallazgos.append(f"Asesor con menor calidad: {p0['operador']} ({p0['precision_promedio']}% en {p0['n']} monitoreo(s)"
                             + (", temas: " + ", ".join(t["label"].lower() for t in p0["temas"]) if p0["temas"] else "") + ").")
            mejor = peor[-1]
            if mejor is not p0:
                hallazgos.append(f"Mejor calidad: {mejor['operador']} ({mejor['precision_promedio']}%).")
        prot_bajo = sorted(protocolo, key=lambda x: x["pct"])[:2]
        if prot_bajo:
            hallazgos.append("Protocolo menos cumplido: " + " · ".join(f"{p['label'].lower()} {p['pct']}%" for p in prot_bajo) + ".")
        if resumen["criticos"]:
            hallazgos.append(f"{resumen['criticos']} monitoreo(s) marcados como CRÍTICOS por el monitoreador.")
        hallazgos.append(f"Devolución: {devueltos} de {n} monitoreos devueltos al asesor ({resumen['pct_devueltos']}%); "
                         f"{n - devueltos} pendiente(s).")

    return {
        "resumen": resumen, "bandas": bandas_out, "temas": temas, "protocolo": protocolo,
        "por_operador": operadores, "por_monitoreador": _grupo("monitoreador"),
        "por_producto": _grupo("tipo_producto"), "por_motivo": _grupo("motivo_llamada"),
        "hallazgos": hallazgos,
        "catalogo_temas": [{"key": t["key"], "label": t["label"], "grupo": t["grupo"], "desc": t["desc"]} for t in TEMAS],
    }
