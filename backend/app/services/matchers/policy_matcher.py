"""Cross-reference payments with DXP cartera by name + policy number.

Concepto format in Boca/Cobrado is `N-SEC-POL-END`. Some payments are recorded
with the buyer's name while the policy belongs to the intermediary agent — so
cross by both keys captures those.
"""
from __future__ import annotations

import re
from collections import defaultdict
from typing import Any, Optional

from ...utils.number_utils import norm


CONCEPTO_RE = re.compile(r"N-(\d+)-(\d+)-(\d+)")


def parse_concepto(concepto: Any) -> Optional[tuple[str, str, str]]:
    if not concepto:
        return None
    match = CONCEPTO_RE.match(str(concepto).strip())
    if not match:
        return None
    sec = match.group(1).lstrip("0") or "0"
    pol = match.group(2).lstrip("0") or "0"
    end = match.group(3)
    return sec, pol, end


def build_policy_index(dxp_rows: list[dict[str, Any]]) -> dict[tuple[str, str], list[dict]]:
    """Returns {(sec, pol): [dxp_row, ...]}."""
    index: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in dxp_rows:
        sec_raw = row.get("Sec.")
        pol_raw = row.get("Pol.")
        if not sec_raw or not pol_raw:
            continue
        sec = str(sec_raw).strip().lstrip("0") or "0"
        pol = str(pol_raw).strip().lstrip("0") or "0"
        index[(sec, pol)].append(row)
    return index


def find_asegurado_for_pago(
    descripcion: Any,
    concepto: Any,
    dxp_aseg_set: set[str],
    policy_index: dict[tuple[str, str], list[dict]],
) -> Optional[str]:
    """Return normalized 'Asegurado' from DXP if match found by name or policy."""
    name = norm(descripcion)
    if name in dxp_aseg_set:
        return name

    pkey = parse_concepto(concepto)
    if pkey:
        candidates = policy_index.get((pkey[0], pkey[1]), [])
        if candidates:
            return norm(candidates[0].get("Asegurado"))

    return None
