"""Parser de archivos de liquidación de comisiones — Televentas Claro Fijo PGY.

Archivo: .txt delimitado por `;`, encoding cp1252, ~48 columnas.
- `Importe` (col 17) usa PUNTO como separador decimal (formato US): float() directo.
- Hay `;` embebidos en campos de texto posteriores a `Importe`; las columnas clave
  (0..20) se extraen por índice, sin romper.

Devuelve AGREGADOS (no filas crudas): se ejecuta en subproceso aislado y el
resultado debe ser pequeño. Todas las descripciones de concepto se incluyen.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any

# Índices de columna (estables en el layout del archivo)
_COL_LIQUIDACION = 0
_COL_DESCRIPCONCEPTO = 5
_COL_FECHA_ACTIVACION = 14
_COL_IMPORTE = 17
_COL_CUOTA = 19
_COL_OBS = 20

_DESC_ACTIVACIONES = "ACTIVACIONES"
_DESC_SUSPENSIONES = "SUSPENSIONES"
_DESC_DOC_FALTANTE = "LINEA CON DOCUMENTACION FALTANTE"

_MAX_ROWS = 500_000  # guarda de seguridad


def _to_float(raw: str) -> float:
    raw = raw.strip().strip('"')
    if not raw:
        return 0.0
    try:
        return float(raw)  # punto = decimal
    except ValueError:
        try:
            return float(raw.replace(".", "").replace(",", "."))
        except ValueError:
            return 0.0


def _year_month(fecha: str) -> str | None:
    """`dd/mm/yyyy hh:mm` -> `yyyy-mm`."""
    fecha = fecha.strip()
    if len(fecha) >= 10 and fecha[2] == "/" and fecha[5] == "/":
        return f"{fecha[6:10]}-{fecha[3:5]}"
    return None


def _motivo_doc(obs: str) -> str:
    o = obs.strip().strip('"').upper()
    if not o:
        return "(sin dato)"
    if "NO PRESENTADO" in o:
        return "Legajo no presentado"
    if "INCOMPLETO" in o or "OBSERVADO" in o:
        return "Legajo incompleto u observado"
    if "RECHAZ" in o:
        return "Legajo rechazado"
    return obs.strip().strip('"')[:80]


def _top(d: dict[str, list], total_monto: float, limit: int = 12) -> list[dict[str, Any]]:
    out = []
    for mes in sorted(d.keys(), key=lambda k: abs(d[k][1]), reverse=True)[:limit]:
        reg, monto = d[mes]
        out.append({
            "mes": mes,
            "registros": reg,
            "monto": round(monto, 2),
            "pct": round(monto / total_monto * 100, 1) if total_monto else 0.0,
        })
    return out


def parse_facturacion(path: str) -> dict[str, Any]:
    """Parsea una liquidación y devuelve agregados por concepto + cohortes clave."""
    conceptos: dict[str, list] = defaultdict(lambda: [0, 0.0])  # desc -> [registros, importe]
    liquidacion = None
    total_rows = 0

    ventas_por_mes: dict[str, list] = defaultdict(lambda: [0, 0.0])
    ventas_n = 0
    ventas_monto = 0.0
    mes_counter: dict[str, int] = defaultdict(int)  # para período dominante

    susp_por_mes: dict[str, list] = defaultdict(lambda: [0, 0.0])
    susp_n = 0
    susp_monto = 0.0

    doc_por_mes: dict[str, list] = defaultdict(lambda: [0, 0.0])
    doc_por_motivo: dict[str, list] = defaultdict(lambda: [0, 0.0])
    doc_n = 0
    doc_monto = 0.0

    with open(path, encoding="cp1252", errors="replace") as fh:
        header = fh.readline()  # descartar cabecera
        if ";" not in header:
            raise ValueError("El archivo no parece tener el formato esperado (sin ';' en la cabecera).")
        for line in fh:
            parts = line.rstrip("\n").split(";")
            if len(parts) < 18:
                continue
            total_rows += 1
            if total_rows > _MAX_ROWS:
                raise ValueError("El archivo supera el máximo de filas admitido.")

            if liquidacion is None:
                liquidacion = parts[_COL_LIQUIDACION].strip()
            desc = parts[_COL_DESCRIPCONCEPTO].strip()
            importe = _to_float(parts[_COL_IMPORTE])
            conceptos[desc][0] += 1
            conceptos[desc][1] += importe

            cuota = parts[_COL_CUOTA].strip() if len(parts) > _COL_CUOTA else ""
            fa = parts[_COL_FECHA_ACTIVACION].strip() if len(parts) > _COL_FECHA_ACTIVACION else ""
            ym = _year_month(fa)

            if desc == _DESC_ACTIVACIONES and cuota == "1":
                ventas_n += 1
                ventas_monto += importe
                if ym:
                    ventas_por_mes[ym][0] += 1
                    ventas_por_mes[ym][1] += importe
                    mes_counter[ym] += 1

            if desc == _DESC_SUSPENSIONES and importe < 0:
                susp_n += 1
                susp_monto += importe
                if ym:
                    susp_por_mes[ym][0] += 1
                    susp_por_mes[ym][1] += importe

            if desc == _DESC_DOC_FALTANTE:
                doc_n += 1
                doc_monto += importe
                if ym:
                    doc_por_mes[ym][0] += 1
                    doc_por_mes[ym][1] += importe
                motivo = _motivo_doc(parts[_COL_OBS]) if len(parts) > _COL_OBS else "(sin dato)"
                doc_por_motivo[motivo][0] += 1
                doc_por_motivo[motivo][1] += importe

    if total_rows == 0:
        raise ValueError("El archivo no contiene filas de datos.")

    # Concepto: todas las descripciones, ordenadas por |importe| desc
    conceptos_list = [
        {"descripcion": desc, "importe": round(v[1], 2), "registros": v[0]}
        for desc, v in conceptos.items()
    ]
    conceptos_list.sort(key=lambda c: abs(c["importe"]), reverse=True)

    total = round(sum(c["importe"] for c in conceptos_list), 2)
    creditos = round(sum(c["importe"] for c in conceptos_list if c["importe"] > 0), 2)
    debitos = round(sum(c["importe"] for c in conceptos_list if c["importe"] < 0), 2)

    periodo = max(mes_counter, key=mes_counter.get) if mes_counter else None

    doc_motivo_list = [
        {"motivo": m, "registros": v[0], "monto": round(v[1], 2)}
        for m, v in sorted(doc_por_motivo.items(), key=lambda kv: abs(kv[1][1]), reverse=True)
    ]

    return {
        "nro_liquidacion": liquidacion,
        "total_rows": total_rows,
        "periodo": periodo,
        "conceptos": conceptos_list,
        "total": total,
        "creditos": creditos,
        "debitos": debitos,
        "ventas": {
            "activaciones": ventas_n,
            "prima_upfront": round(ventas_monto, 2),
            "ticket": round(ventas_monto / ventas_n, 2) if ventas_n else 0.0,
            "por_mes_venta": _top(ventas_por_mes, ventas_monto),
        },
        "suspensiones": {
            "registros": susp_n,
            "monto": round(susp_monto, 2),
            "por_mes_venta": _top(susp_por_mes, susp_monto),
        },
        "doc_faltante": {
            "registros": doc_n,
            "monto": round(doc_monto, 2),
            "promedio": round(doc_monto / doc_n, 2) if doc_n else 0.0,
            "por_mes_venta": _top(doc_por_mes, doc_monto),
            "por_motivo": doc_motivo_list,
        },
    }
