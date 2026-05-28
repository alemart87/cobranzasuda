"""Analyzer para Bases Adicionales (Débitos Automáticos / Bancard).

Estas bases tienen estructura idéntica al DXP pero NO reciben pagos, por lo
tanto NO se calcula recupero ni proyección. Solo se reporta:

* Composición de la cartera: total pólizas, total asegurados, saldo total.
* Distribución por tramo de mora (a vencer + 6 tramos de mora).
* Top 20 deudores.
* Listado de pólizas guardado tal cual (sec, pol, asegurado, saldo) para
  cruzar más adelante con la base de gestiones.
"""
from __future__ import annotations

import re
from collections import defaultdict
from typing import Any


_NUM_RE = re.compile(r"\d+")


def _norm(s: Any) -> str:
    """Normaliza un header: quita acentos, replacement chars, espacios, lowercase."""
    return re.sub(r"[^a-z0-9]+", "", str(s or "").replace("�", "").lower())


# Headers DXP — los acentos vienen rotos (U+FFFD) en algunos exports.
# Usamos un acceso tolerante por slug.
def _get(row: dict, *candidates: str) -> Any:
    for c in candidates:
        if c in row and row[c] is not None:
            return row[c]
    # Si los headers vienen con replacement char (D�as / M�s), buscar tolerante
    for k, v in row.items():
        if v is None:
            continue
        ks = str(k).replace("�", "").lower()
        for c in candidates:
            cs = c.replace("í", "i").replace("á", "a").replace("ñ", "n").lower()
            if ks == cs.replace("í", "i").replace("á", "a"):
                return v
    return None


def _num(v: Any) -> float:
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(".", "").replace(",", "."))
    except (ValueError, TypeError):
        return 0.0


def analyze_base_adicional(rows: list[dict[str, Any]]) -> dict[str, Any]:
    polizas_count = len(rows)
    asegurados_set = set()
    saldo_total = 0.0
    tramos = {
        "a_vencer": 0.0,
        "h_30": 0.0,
        "h_60": 0.0,
        "h_90": 0.0,
        "h_120": 0.0,
        "h_150": 0.0,
        "m_150": 0.0,
    }

    def _key_exact(target_normalized: str, sample_row: dict) -> str | None:
        """Busca un header cuya forma normalizada == target_normalized."""
        for k in sample_row.keys():
            if _norm(k) == target_normalized:
                return k
        return None

    def _key_tramo(prefix: str, days: int | None, sample_row: dict) -> str | None:
        """Busca header tipo 'Hasta 30 Días' / 'Más 150 Días' / 'A Vencer'
        tolerando encoding roto (Hasta 30 D�as -> 'hasta30das').
        Match por prefix (hasta/mas/avencer) + número de días.
        """
        for k in sample_row.keys():
            n = _norm(k)
            if not n.startswith(prefix):
                continue
            if days is None:
                return k
            nums = _NUM_RE.findall(n)
            if nums and int(nums[0]) == days:
                return k
        return None

    if not rows:
        return {
            "kpis": {
                "polizas": 0, "asegurados": 0, "saldo_total": 0.0,
                **{f"tramo_{k}": 0.0 for k in tramos},
            },
            "tramos": [],
            "top_deudores": [],
            "polizas_detalle": [],
        }

    sample = rows[0]
    k_aseg = _key_exact("asegurado", sample)
    k_sec = _key_exact("sec", sample)
    k_pol = _key_exact("pol", sample)
    k_end = _key_exact("end", sample)
    k_saldo = _key_exact("saldototal", sample)
    k_avencer = _key_tramo("avencer", None, sample)
    k_30 = _key_tramo("hasta", 30, sample)
    k_60 = _key_tramo("hasta", 60, sample)
    k_90 = _key_tramo("hasta", 90, sample)
    k_120 = _key_tramo("hasta", 120, sample)
    k_150 = _key_tramo("hasta", 150, sample)
    k_m150 = _key_tramo("mas", 150, sample) or _key_tramo("m", 150, sample)

    # Top deudores: agrupar por asegurado, sumar saldo.
    saldo_por_asegurado: dict[str, float] = defaultdict(float)
    polizas_detalle: list[dict[str, Any]] = []

    for row in rows:
        aseg = str(row.get(k_aseg) or "").strip() if k_aseg else ""
        if aseg:
            asegurados_set.add(aseg)
        saldo = _num(row.get(k_saldo)) if k_saldo else 0.0
        saldo_total += saldo
        saldo_por_asegurado[aseg] += saldo

        tramos["a_vencer"] += _num(row.get(k_avencer)) if k_avencer else 0
        tramos["h_30"] += _num(row.get(k_30)) if k_30 else 0
        tramos["h_60"] += _num(row.get(k_60)) if k_60 else 0
        tramos["h_90"] += _num(row.get(k_90)) if k_90 else 0
        tramos["h_120"] += _num(row.get(k_120)) if k_120 else 0
        tramos["h_150"] += _num(row.get(k_150)) if k_150 else 0
        tramos["m_150"] += _num(row.get(k_m150)) if k_m150 else 0

        # Detalle para cruce futuro con gestiones
        sec = row.get(k_sec) if k_sec else None
        pol = row.get(k_pol) if k_pol else None
        end = row.get(k_end) if k_end else None
        poliza_key = None
        if sec is not None and pol is not None:
            try:
                poliza_key = f"{str(sec).zfill(4)}-{int(pol)}"
            except (ValueError, TypeError):
                poliza_key = None
        polizas_detalle.append({
            "asegurado": aseg,
            "sec": str(sec).zfill(4) if sec is not None else None,
            "pol": int(pol) if isinstance(pol, (int, float)) else pol,
            "end": int(end) if isinstance(end, (int, float)) else end,
            "poliza_key": poliza_key,
            "saldo_total": saldo,
        })

    top_deudores = [
        {"asegurado": a, "saldo": s}
        for a, s in sorted(saldo_por_asegurado.items(), key=lambda x: -x[1])[:20]
    ]

    tramos_list = [
        {"tramo": "A vencer",      "monto": tramos["a_vencer"]},
        {"tramo": "Hasta 30 días", "monto": tramos["h_30"]},
        {"tramo": "Hasta 60 días", "monto": tramos["h_60"]},
        {"tramo": "Hasta 90 días", "monto": tramos["h_90"]},
        {"tramo": "Hasta 120 días","monto": tramos["h_120"]},
        {"tramo": "Hasta 150 días","monto": tramos["h_150"]},
        {"tramo": "Más 150 días",  "monto": tramos["m_150"]},
    ]

    return {
        "kpis": {
            "polizas": polizas_count,
            "asegurados": len(asegurados_set),
            "saldo_total": round(saldo_total, 2),
            "tramo_a_vencer": round(tramos["a_vencer"], 2),
            "tramo_h_30": round(tramos["h_30"], 2),
            "tramo_h_60": round(tramos["h_60"], 2),
            "tramo_h_90": round(tramos["h_90"], 2),
            "tramo_h_120": round(tramos["h_120"], 2),
            "tramo_h_150": round(tramos["h_150"], 2),
            "tramo_m_150": round(tramos["m_150"], 2),
        },
        "tramos": tramos_list,
        "top_deudores": top_deudores,
        "polizas_detalle": polizas_detalle,
    }
