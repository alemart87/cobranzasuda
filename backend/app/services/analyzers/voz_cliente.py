"""Análisis 'La Voz del Cliente' sobre la Descripción del problema (Gestiones).

NLP liviano en Python puro (sin dependencias externas): normaliza el texto en
español, filtra stopwords y muletillas de la narración del agente, clasifica
cada descripción en un tema (taxonomy de seguros), extrae palabras y frases
clave (n-gramas) y detecta señales de fricción.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from typing import Any

from ..parsers._text import fix_text, strip_accents


# Stopwords del español (genéricas).
_STOP = {
    "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al", "a",
    "ante", "con", "contra", "desde", "en", "entre", "hacia", "hasta", "para", "por",
    "segun", "sin", "so", "sobre", "tras", "y", "e", "o", "u", "que", "qué", "como",
    "cómo", "cuando", "cuándo", "donde", "dónde", "porque", "porqué", "pero", "mas",
    "más", "si", "sí", "no", "ni", "se", "su", "sus", "le", "les", "lo", "me", "te",
    "nos", "mi", "mis", "tu", "tus", "es", "son", "fue", "ser", "esta", "está", "este",
    "esta", "estos", "estas", "ese", "esa", "esos", "esas", "del", "ya", "muy", "tan",
    "the", "of", "para",
}

# Muletillas/verbos de la narración del agente (no son la voz del cliente).
_RUIDO = {
    "indico", "indica", "indicar", "indique", "indicando", "comunica", "comunico",
    "informa", "informo", "informar", "deriva", "derivar", "derivo", "procede",
    "procedo", "remito", "remite", "envia", "envio", "enviar", "envio", "llama",
    "llamar", "realizar", "realiza", "debe", "puede", "senor", "senora", "sr", "sra",
    "favor", "mismo", "misma", "dicha", "dicho", "cual", "sus", "nuevamente", "asi",
    "solo", "solicita", "solicito", "solicitando", "solicitud",
}

_FILTER = _STOP | _RUIDO

# Taxonomy de temas (orden = prioridad para el tema principal). Cada tema tiene
# patrones (ya normalizados: minúsculas, sin acentos) que se buscan como substring.
_TEMAS: list[tuple[str, list[str]]] = [
    ("Siniestros y denuncias", ["siniestro", "stro", "denuncia", "accidente", "choque",
                                 "parabrisas", "robo", "orden de trabajo"]),
    ("Asistencia y servicios", ["grua", "asistencia", "remolque", "auxilio", "mecanico"]),
    ("Cancelaciones", ["cancelacion", "cancelar", "anulacion", "anular", "dar de baja",
                        "baja de", "rescindir"]),
    ("Pagos y cobranzas", ["pago", "debito", "cobro", "cobranza", "imputacion",
                            "comprobante", "cuota", "deuda", "extracto", "transferencia",
                            "abonar", "abono", "qr", "saldo"]),
    ("Facturación", ["factura", "facturacion", "timbrado", "nota de credito", "recibo"]),
    ("Renovaciones y vigencia", ["renovacion", "renovar", "renueva", "vencimiento", "vto",
                                  "vigencia", "vencida", "vence"]),
    ("Pólizas y certificados", ["poliza", "endoso", "certificado", "copia de", "caratula"]),
    ("Acceso y portal", ["portal", "pin", "clave", "contrasena", "usuario", "plataforma",
                          "app", "ingresar", "acceso", "web"]),
    ("Actualización de datos", ["actualizacion", "actualizar", "modificar", "cambio de",
                                 "correo electronico", "telefono", "direccion"]),
    ("Comercial y ventas", ["comercial", "cotizacion", "cotizar", "contratar", "nueva poliza",
                            "alta de", "importacion", "caucion"]),
    ("Reclamos", ["reclamo", "reclama", "queja", "disconforme", "molesto", "falta retorno"]),
    ("Consultas generales", ["consulta", "informacion", "estado de"]),
]

# Léxico de fricción / insatisfacción.
# Palabras/raíces que por sí solas indican fricción.
_FRICCION_WORDS = [
    "reclam", "queja", "demora", "molest", "disconform", "intermitenc", "error",
    "falla", "problema", "insist", "reiter", "falta retorno", "sin respuesta",
    "mala atencion", "pesimo", "disgust", "no responde", "no anda",
]
# Negaciones de "recibir / poder / funcionar / acceder" (texto ya normalizado).
_FRICCION_RE = re.compile(
    r"no\s+(?:le\s+|me\s+|se\s+|lo\s+|nos\s+)?"
    r"(?:lleg|recib|reconoc|pud|pued|funcion|aparec|carg|ingres|acced|contest|resolv)"
)


def _tiene_friccion(text_norm: str) -> bool:
    if _FRICCION_RE.search(text_norm):
        return True
    return any(w in text_norm for w in _FRICCION_WORDS)

_WORD_RE = re.compile(r"[a-zñ]+")


def _norm(text: str) -> str:
    return strip_accents(text)


def _tokens(text_norm: str, *, filt: bool) -> list[str]:
    toks = _WORD_RE.findall(text_norm)
    if filt:
        return [t for t in toks if len(t) >= 4 and t not in _FILTER]
    return [t for t in toks if len(t) >= 2]


def _ngrams_significativos(tokens: list[str], n: int) -> list[tuple[str, ...]]:
    """n-gramas cuyos extremos no sean stopwords (preserva conectores internos)."""
    out = []
    for i in range(len(tokens) - n + 1):
        gram = tokens[i:i + n]
        if gram[0] in _FILTER or gram[-1] in _FILTER:
            continue
        if any(len(t) < 2 for t in (gram[0], gram[-1])):
            continue
        out.append(tuple(gram))
    return out


def _tema_principal(text_norm: str) -> str:
    for tema, patrones in _TEMAS:
        if any(p in text_norm for p in patrones):
            return tema
    return "Otros"


def analizar_voz_cliente(rows: list[dict[str, Any]]) -> dict[str, Any]:
    descripciones: list[tuple[str, str, dict]] = []  # (original, normalizado, row)
    for r in rows:
        d = fix_text(r.get("descripcion", ""))
        if d and len(d.strip()) >= 3:
            descripciones.append((d.strip(), _norm(d), r))

    total = len(descripciones)
    if total == 0:
        return {"disponible": False, "total_descripciones": 0}

    unigramas: Counter = Counter()
    bigramas: Counter = Counter()
    trigramas: Counter = Counter()
    tema_cnt: Counter = Counter()
    tema_ejemplos: dict[str, list[str]] = defaultdict(list)
    tema_estado: dict[str, Counter] = defaultdict(Counter)
    friccion = 0
    largo_total = 0

    for original, norm, r in descripciones:
        largo_total += len(original)
        unigramas.update(_tokens(norm, filt=True))
        toks_all = _tokens(norm, filt=False)
        bigramas.update(" ".join(g) for g in _ngrams_significativos(toks_all, 2))
        trigramas.update(" ".join(g) for g in _ngrams_significativos(toks_all, 3))

        tema = _tema_principal(norm)
        tema_cnt[tema] += 1
        estado = (r.get("estado") or "").strip() or "(sin estado)"
        tema_estado[tema][estado] += 1
        if len(tema_ejemplos[tema]) < 3 and 12 <= len(original) <= 160:
            tema_ejemplos[tema].append(original)

        if _tiene_friccion(norm):
            friccion += 1

    def _dist(counter: Counter, top: int) -> list[dict[str, Any]]:
        return [{"label": k, "cantidad": v,
                 "pct": round(v / total * 100, 1)} for k, v in counter.most_common(top)]

    temas = [
        {
            "tema": tema,
            "cantidad": cant,
            "pct": round(cant / total * 100, 1),
            "ejemplos": tema_ejemplos.get(tema, []),
            "por_estado": dict(tema_estado.get(tema, {})),
        }
        for tema, cant in tema_cnt.most_common()
    ]

    nube = [{"text": k, "weight": v} for k, v in unigramas.most_common(40)]

    return {
        "disponible": True,
        "total_descripciones": total,
        "largo_promedio": round(largo_total / total),
        "temas": temas,
        "palabras_clave": _dist(unigramas, 20),
        "nube": nube,
        "frases_bigramas": [{"frase": k, "cantidad": v} for k, v in bigramas.most_common(15)],
        "frases_trigramas": [{"frase": k, "cantidad": v} for k, v in trigramas.most_common(10)],
        "friccion_cantidad": friccion,
        "friccion_pct": round(friccion / total * 100, 1),
    }
