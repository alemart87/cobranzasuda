"""Matching de nombres de vendedores entre fuentes con formatos distintos.

Llamadas: "Nombres Apellidos" (ej. "Vania Gissel Benítez Alvarenga").
Producción: "APELLIDOS, NOMBRES" (ej. "BENITEZ ALVARENGA, VANIA GISSEL").

Se comparan por conjunto de tokens normalizados (sin acentos, minúsculas,
tokens de >2 caracteres). Un overlap de >=2 tokens se considera la misma persona.
"""
from __future__ import annotations

import unicodedata


def name_tokens(name: str | None) -> frozenset[str]:
    s = (name or "")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    out = []
    for tok in "".join(c if c.isalpha() or c == " " else " " for c in s).split():
        if len(tok) > 2:
            out.append(tok)
    return frozenset(out)


def best_match(name: str, candidates: list[str], min_overlap: int = 2) -> str | None:
    """Devuelve el candidato con mayor overlap de tokens (>= min_overlap), o None."""
    target = name_tokens(name)
    best: str | None = None
    best_score = 0
    for cand in candidates:
        score = len(target & name_tokens(cand))
        if score > best_score:
            best_score = score
            best = cand
    return best if best_score >= min_overlap else None
