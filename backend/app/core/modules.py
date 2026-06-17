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
        "description": "Llamadas (entrantes/salientes, SLA, AHT, auxiliares) y gestiones (motivos, canales, estados).",
        "available": True,
        "color": "#00B2BF",
    },
    {
        "slug": "televentas_claro",
        "name": "Televentas Claro · Facturación",
        "description": "Liquidación de comisiones: detalle por concepto, drivers, comparativos.",
        "available": True,
        "color": "#662483",
        # Módulo RESTRINGIDO: solo superadmin + analistas explícitamente habilitados.
        # NUNCA visible para clientes.
        "restricted": True,
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

# Slugs de módulos restringidos: requieren grant explícito incluso para analistas,
# y jamás se exponen a clientes.
RESTRICTED_SLUGS = {m["slug"] for m in MODULES if m.get("restricted")}


def is_valid_slug(slug: str) -> bool:
    return slug in MODULE_SLUGS


def is_restricted(slug: str) -> bool:
    return slug in RESTRICTED_SLUGS


def filter_valid_slugs(slugs: list[str] | None) -> list[str] | None:
    """Devuelve solo los slugs válidos. None se preserva (= acceso total)."""
    if slugs is None:
        return None
    return [s for s in slugs if s in MODULE_SLUGS]


def filter_restricted_slugs(slugs: list[str] | None) -> list[str]:
    """Para `User.granted_modules`: solo slugs restringidos válidos (lista, nunca None)."""
    if not slugs:
        return []
    return [s for s in slugs if s in RESTRICTED_SLUGS]
