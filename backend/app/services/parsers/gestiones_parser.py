"""Parse 'Reporte de Gestiones' XLSX (CRM export).

Columnas esperadas: ID, Lead - Asegurado, Póliza, Campaña, Usuario, Estado,
Subestado, Fecha Gestión, Observación, Prima, Estado Trámite, Número Trámite,
Fecha Compromiso, Teléfono, Email Lead, Creado el.

Notas de implementación:

* Los headers que vienen del CRM a veces tienen acentos corrompidos (U+FFFD).
  Por eso el match se hace por "slug" (sin acentos, lowercase, sin espacios
  extra) para tolerar 'Póliza' / 'P�liza' / 'POLIZA' indistintamente.
* La columna 'Póliza' viene como string con padding tipo '0201   27810 0' que
  representa Sec. + Pol. + Endoso. Se parsea y se expone como campos separados
  más una clave canónica `poliza_key` ('SSSS-PPPPPP') usada para cruzar con la
  cartera DXP (columnas 'Sec.' + 'Pol.').
"""
from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime, time
from pathlib import Path
from typing import Any

from ._excel_loader import load_excel


# Slugs requeridos (en formato canónico).
REQUIRED_SLUGS = {"usuario", "estado", "subestado"}


def _slug(s: Any) -> str:
    """Normaliza un header para comparación tolerante a encoding/acentos."""
    if s is None:
        return ""
    text = str(s)
    # Reemplazar U+FFFD por nada (el char "replacement" que aparece en headers rotos)
    text = text.replace("�", "")
    # Quitar acentos
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().strip()
    # Colapsar separadores a un solo espacio para luego matchear flexible
    text = re.sub(r"[\s\-_\.]+", " ", text).strip()
    return text


# Mapa de slug → nombre canónico interno
HEADER_SLUG_MAP = {
    "id": "id",
    "lead asegurado": "lead",
    "lead": "lead",
    "asegurado": "lead",
    "poliza": "poliza",
    "pol": "poliza",
    "nro poliza": "poliza",
    "numero poliza": "poliza",
    "campana": "campana",
    "campania": "campana",
    "usuario": "usuario",
    "estado": "estado",
    "subestado": "subestado",
    "fecha gestion": "fecha",
    "fecha": "fecha",
    "observacion": "observacion",
    "obs": "observacion",
    "prima": "prima",
    "fecha compromiso": "fecha_compromiso",
    "creado el": "creado_el",
}


def _parse_fecha(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, time())
    if isinstance(value, str):
        for fmt in (
            "%d/%m/%Y %H:%M",
            "%d/%m/%Y %H:%M:%S",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d",
            "%d/%m/%Y",
        ):
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue
    return None


_POLIZA_SPLIT_RE = re.compile(r"[\s\.\-/]+")
# Secciones conocidas (4 dígitos). Cualquier valor pegado sin separador que
# arranque con uno de éstos se asume que tiene esa sección.
_KNOWN_SEC_PREFIXES = (
    "0101", "0104", "0201", "0301", "0401", "0501", "0601", "0701",
    "0801", "0901", "1001", "1006", "1021", "1101", "1110", "1201",
    "1301", "1401",
)


def parse_poliza(raw: Any) -> dict[str, Any]:
    """Parsea una póliza heterogénea → componentes normalizados.

    El CRM exporta el mismo dato en al menos 5 formatos distintos:

    1. Entero suelto:                 27810
    2. 3 tokens con espacios:         '0201   27810 0'
    3. 3 tokens con puntos:           '0501.162382.0'
    4. Sin separador, sección + resto:'01049601084'  (0104 + 960 + 1084)
    5. Entero como string corto:      '1496'  (solo nro de póliza, sin sección)

    Devuelve siempre el mismo shape; valores None si no se pudo identificar.
    `has_value` indica si el campo venía con algo (haya sido parseable o no).
    """
    out: dict[str, Any] = {
        "poliza_raw": None,
        "poliza_sec": None,
        "poliza_num": None,
        "poliza_end": None,
        "poliza_key": None,
        "has_value": False,
    }

    # Caso 1: entero suelto (Excel guardó como número).
    if isinstance(raw, int) and not isinstance(raw, bool):
        out["poliza_raw"] = str(raw)
        out["poliza_num"] = int(raw)
        out["has_value"] = True
        # Sin sección no se puede construir key segura. Queda en poliza_num
        # y el cruce con DXP debe matchear por Pol. solo (puede haber colisión
        # entre secciones, se decide a nivel cruce).
        return out

    if raw is None:
        return out
    text = str(raw).strip()
    if not text:
        return out

    out["poliza_raw"] = text
    out["has_value"] = True

    # Caso 2/3: separadores (espacios, puntos, guiones, slashes).
    parts = [p for p in _POLIZA_SPLIT_RE.split(text) if p]

    sec: str | None = None
    num: int | None = None
    end: int | None = None

    if len(parts) >= 2:
        sec_raw = parts[0]
        if sec_raw.isdigit() and len(sec_raw) <= 4:
            sec = sec_raw.zfill(4)
        try:
            num = int(parts[1])
        except (ValueError, TypeError):
            num = None
        if len(parts) >= 3:
            try:
                end = int(parts[2])
            except (ValueError, TypeError):
                end = None
    elif len(parts) == 1:
        single = parts[0]
        if single.isdigit():
            # Caso 5 (sin sección — entero corto) o caso 4 (pegado).
            # Caso 4: empieza con prefijo de sección conocido (>=8 chars).
            if len(single) >= 8 and single.startswith(_KNOWN_SEC_PREFIXES):
                sec = single[:4]
                rest = single[4:]
                # No sabemos dónde corta pol vs end en el pegado. Guardamos
                # `rest` como póliza_num "ampliada" para que el cruce decida.
                try:
                    num = int(rest)
                except (ValueError, TypeError):
                    num = None
            else:
                # Caso 5: solo número.
                try:
                    num = int(single)
                except (ValueError, TypeError):
                    num = None

    out["poliza_sec"] = sec
    out["poliza_num"] = num
    out["poliza_end"] = end
    if sec and num is not None:
        out["poliza_key"] = f"{sec}-{num}"
    return out


def _build_header_index(headers: list[str]) -> dict[str, int]:
    """Mapea nombre canónico interno → índice de columna."""
    idx: dict[str, int] = {}
    for i, h in enumerate(headers):
        slug = _slug(h)
        canonical = HEADER_SLUG_MAP.get(slug)
        if canonical and canonical not in idx:
            idx[canonical] = i
    return idx


def parse_gestiones(path: str | Path) -> list[dict[str, Any]]:
    sheets = load_excel(path)
    # Tomar la primera hoja con datos
    sheet_rows = None
    for name, rows in sheets.items():
        if len(rows) > 1 and rows[0]:
            sheet_rows = rows
            break
    if not sheet_rows:
        raise ValueError(f"Archivo vacío. Hojas: {list(sheets.keys())}")

    headers = [str(h or "").strip() for h in sheet_rows[0]]
    index = _build_header_index(headers)

    missing = [s for s in REQUIRED_SLUGS if s not in index]
    if missing:
        raise ValueError(
            f"Reporte de Gestiones: faltan columnas {missing}. "
            f"Headers leídos: {headers}"
        )

    def get(row: list[Any], canonical: str) -> Any:
        i = index.get(canonical, -1)
        if i < 0 or i >= len(row):
            return None
        return row[i]

    rows: list[dict[str, Any]] = []
    for raw in sheet_rows[1:]:
        usuario = get(raw, "usuario")
        if not usuario:
            continue
        poliza = parse_poliza(get(raw, "poliza"))
        rows.append({
            "id": get(raw, "id"),
            "lead": str(get(raw, "lead") or "").strip().upper(),
            "campana": str(get(raw, "campana") or "").strip(),
            "usuario": str(usuario).strip(),
            "estado": str(get(raw, "estado") or "").strip(),
            "subestado": str(get(raw, "subestado") or "").strip(),
            "fecha": _parse_fecha(get(raw, "fecha")),
            "observacion": str(get(raw, "observacion") or "").strip(),
            **poliza,
        })
    return rows
