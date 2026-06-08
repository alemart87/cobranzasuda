"""Redacción de PII antes de enviar datos al modelo (OpenAI).

Se enmascaran nombre de cliente, documento y teléfono. El análisis de motivos /
voz del cliente no necesita la identidad. Los datos completos siguen en nuestra
DB para la UI; solo se redacta en el límite tool→modelo.
"""
from __future__ import annotations

import re
from typing import Any

# Teléfonos: secuencias largas con separadores típicos.
_TEL_RE = re.compile(r"\+?\d[\d\s().\-]{6,}\d")
# Documentos: corridas largas de dígitos con puntos (ej. 8.297.729 / 80.151.262).
_DOC_RE = re.compile(r"\b\d{1,3}(?:\.\d{3}){1,3}\b")


def _scrub_texto(texto: str, nombre: str | None) -> str:
    if not texto:
        return texto
    out = _TEL_RE.sub("[tel]", texto)
    out = _DOC_RE.sub("[doc]", out)
    if nombre:
        # Quitar el nombre del cliente si aparece dentro de la descripción.
        for parte in [nombre] + nombre.split():
            p = parte.strip()
            if len(p) >= 4:
                out = re.sub(re.escape(p), "[cliente]", out, flags=re.IGNORECASE)
    return out


def redactar_item(item: dict[str, Any]) -> dict[str, Any]:
    """Copia del item con la PII enmascarada, lista para enviar al modelo."""
    nombre = item.get("cliente")
    red = dict(item)
    red.pop("documento", None)
    red.pop("telefono", None)
    red.pop("cliente", None)
    if "descripcion" in red:
        red["descripcion"] = _scrub_texto(red.get("descripcion") or "", nombre)
    return red


_PII_COLS = {"cliente", "documento", "telefono"}


def redactar_row(row: dict[str, Any]) -> dict[str, Any]:
    """Redacta una fila de resultado SQL SIN quitar columnas (enmascara valores).

    Útil cuando el agente hace SELECT y elige las columnas: conservamos los
    nombres de columna pero ocultamos el contenido sensible.
    """
    nombre = row.get("cliente")
    out: dict[str, Any] = {}
    for k, v in row.items():
        kl = str(k).lower()
        if kl == "cliente":
            out[k] = "[cliente]" if v else v
        elif kl == "documento":
            out[k] = "[doc]" if v else v
        elif kl in ("telefono", "teléfono"):
            out[k] = "[tel]" if v else v
        elif kl == "descripcion" and isinstance(v, str):
            out[k] = _scrub_texto(v, nombre)
        else:
            out[k] = v
    return out
