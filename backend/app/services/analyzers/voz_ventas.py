"""'La Voz del Cliente en Ventas' — análisis del campo Observación del CRM de ventas.

Clasifica cada observación en un MOTIVO (taxonomy de televentas de seguros),
con foco en los motivos de NO-VENTA (subestado 'No acepta'): qué dice el cliente
al rechazar. Reutiliza el NLP liviano de voz_cliente (stopwords, n-gramas, nube).
"""
from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

from ..parsers._text import fix_text, strip_accents
from .voz_cliente import _FILTER, _ngrams_significativos, _tokens


# Taxonomy de motivos (orden = prioridad). Patrones normalizados (minúsculas, sin
# acentos, espacios colapsados). Calibrada con observaciones reales del CRM.
_MOTIVOS: list[tuple[str, list[str]]] = [
    ("No interesado / rechaza", ["no interesad", "no le interesa", "sin interes", "no desea",
                                  "no quiere", "no lo quiere", "no acepta", "no llamar",
                                  "desinteres", "rechaza", "no va a tomar"]),
    ("Precio / costo", ["precio", "costo", "caro", "no puede pagar", "sin presupuesto",
                         "economic", "no llega", "monto alto"]),
    ("Ya tiene cobertura", ["ya tiene", "ya cuenta con", "ya posee", "otra aseguradora",
                             "otro seguro", "otra compania", "ya esta asegurad", "tiene seguro",
                             "cuenta con seguro", "ya renovo"]),
    ("Sin medio de pago", ["no cuenta con tc", "sin tarjeta", "no posee tarjeta",
                            "medios para el debito", "cuenta bancaria", "sin debito"]),
    ("Sin datos de contacto", ["sin telefono", "no tiene numero", "sin numero", "linea baja",
                                "no cuenta con numero", "numero equivocado", "no corresponde",
                                "dato erroneo", "sin datos"]),
    ("Buzón / no atiende", ["buzon", "no contesta", "no atiende", "no responde", "casilla",
                             "apagado", "fuera de servicio", "corta la llamada",
                             "corto la llamada", "cuelga"]),
    ("Reagendar / volver a llamar", ["volver a llamar", "reagendar", "agendar", "otro momento",
                                      "otro horario", "mas tarde", "llamar luego", "ocupado",
                                      "reunion", "trabajando", "agendado", "mas adelante",
                                      "por ahora"]),
    ("Propuesta enviada", ["propuesta", "cotizacion enviada", "envio de cotizacion",
                            "correo enviado", "whatsapp enviado", "se envia informacion",
                            "informacion enviada"]),
    ("Consultará / lo pensará", ["lo va a pensar", "lo pensara", "consultara", "consultar con",
                                  "va a evaluar", "lo evaluara", "decidir"]),
]

_SPACES = __import__("re").compile(r"\s+")


def clasificar_motivo(observacion: str) -> str:
    if not observacion or not observacion.strip():
        return "Sin observación"
    norm = _SPACES.sub(" ", strip_accents(fix_text(observacion)))
    for motivo, patrones in _MOTIVOS:
        if any(p in norm for p in patrones):
            return motivo
    return "Otros"


def _dist(counter: Counter, total: int, top: int | None = None) -> list[dict[str, Any]]:
    items = counter.most_common(top)
    return [{"label": k, "cantidad": v, "pct": round(v / total * 100, 1)} for k, v in items]


def analizar_voz_ventas(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """`rows`: dicts con observacion, subestado. Devuelve motivos generales, motivos
    de NO-VENTA (subestado 'No acepta'), nube y frases."""
    con_obs = []
    for r in rows:
        o = fix_text(r.get("observacion", ""))
        if o and len(o.strip()) >= 3:
            con_obs.append((o.strip(), strip_accents(o), r))

    total = len(con_obs)
    if total == 0:
        return {"disponible": False, "total_observaciones": 0}

    unigramas: Counter = Counter()
    bigramas: Counter = Counter()
    motivos: Counter = Counter()
    ejemplos: dict[str, list[str]] = defaultdict(list)

    # No-venta: observaciones de los "No acepta" (qué dice el cliente al rechazar).
    noventa: Counter = Counter()
    noventa_ejemplos: dict[str, list[str]] = defaultdict(list)
    total_noventa = 0

    for original, norm, r in con_obs:
        unigramas.update(_tokens(norm, filt=True))
        toks = _tokens(norm, filt=False)
        bigramas.update(" ".join(g) for g in _ngrams_significativos(toks, 2))

        motivo = clasificar_motivo(original)
        motivos[motivo] += 1
        if len(ejemplos[motivo]) < 3 and 12 <= len(original) <= 160:
            ejemplos[motivo].append(original)

        sub = strip_accents(r.get("subestado") or "")
        if "no acepta" in sub:
            total_noventa += 1
            noventa[motivo] += 1
            if len(noventa_ejemplos[motivo]) < 3 and 10 <= len(original) <= 160:
                noventa_ejemplos[motivo].append(original)

    return {
        "disponible": True,
        "version": 1,
        "total_observaciones": total,
        "pct_con_observacion": round(total / len(rows) * 100, 1) if rows else 0.0,
        "motivos": [{"label": m, "cantidad": c, "pct": round(c / total * 100, 1),
                     "ejemplos": ejemplos.get(m, [])} for m, c in motivos.most_common()],
        "no_venta": {
            "total": total_noventa,
            "motivos": [{"label": m, "cantidad": c,
                         "pct": round(c / total_noventa * 100, 1) if total_noventa else 0.0,
                         "ejemplos": noventa_ejemplos.get(m, [])} for m, c in noventa.most_common()],
        },
        "nube": [{"text": k, "weight": v} for k, v in unigramas.most_common(40)],
        "frases": [{"frase": k, "cantidad": v} for k, v in bigramas.most_common(15)],
    }
