"""Helpers de normalización de texto para exports de contact center.

Los .xls de Genesys vienen con doble codificación (mojibake): bytes UTF-8
interpretados como Latin-1. Ej.: 'DuraciÃ³n' → 'Duración', 'SÃ\x8d' → 'SÍ',
'AgÃ¼ero' → 'Agüero'. `fix_text` revierte ese daño de forma segura.
"""
from __future__ import annotations

import unicodedata
from typing import Any


# Marcadores típicos del mojibake UTF-8→Latin-1. Si aparecen, intentamos reparar.
_MOJIBAKE_HINTS = ("Ã", "Â", "â\x80", "\x8d", "\x9d")


def fix_text(value: Any) -> str:
    """Devuelve el texto reparado y stripeado. Tolerante a None/no-strings."""
    if value is None:
        return ""
    if not isinstance(value, str):
        return str(value).strip()
    s = value
    if any(h in s for h in _MOJIBAKE_HINTS):
        try:
            s = s.encode("latin-1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            # No se pudo reparar; dejamos el original.
            pass
    return s.strip()


def strip_accents(value: Any) -> str:
    """minúsculas + sin acentos + sin espacios extra. Útil para matchear headers."""
    s = fix_text(value).lower()
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).strip()


def find_col(headers: list[Any], *keywords: str) -> int | None:
    """Índice de la primera columna cuyo header (normalizado) contiene TODOS
    los keywords (también normalizados). Tolerante a acentos y mojibake.
    """
    norm = [strip_accents(h) for h in headers]
    keys = [strip_accents(k) for k in keywords]
    for i, h in enumerate(norm):
        if all(k in h for k in keys):
            return i
    return None
