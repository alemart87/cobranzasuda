"""Catálogo de módulos operativos de la plataforma.

`slug` es el identificador estable que se guarda en User.allowed_modules.
Agregar un nuevo módulo: append a esta lista + crear sus rutas frontend.
"""
from __future__ import annotations


MODULES: list[dict] = [
    {
        "slug": "cobranzas",
        "name": "Cobranzas",
        "description": "Cartera, recupero, llamadas y gestiones.",
        "available": True,
        "color": "#E6332A",
    },
    {
        "slug": "atencion",
        "name": "Atención al Cliente",
        "description": "NPS, detractores, motivos de consulta.",
        "available": False,
        "color": "#00B2BF",
    },
    {
        "slug": "ventas",
        "name": "Ventas",
        "description": "Pipeline, conversión, performance comercial.",
        "available": False,
        "color": "#F39200",
    },
]


MODULE_SLUGS = {m["slug"] for m in MODULES}


def is_valid_slug(slug: str) -> bool:
    return slug in MODULE_SLUGS


def filter_valid_slugs(slugs: list[str] | None) -> list[str] | None:
    """Devuelve solo los slugs válidos. None se preserva (= acceso total)."""
    if slugs is None:
        return None
    return [s for s in slugs if s in MODULE_SLUGS]
