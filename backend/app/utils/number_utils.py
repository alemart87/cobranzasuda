"""Helpers for numeric and string normalization shared across parsers."""
from __future__ import annotations


def num(value) -> float:
    if value is None or value == "":
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def norm(value) -> str:
    """Normalize names for cross-referencing (uppercase, trimmed, no quotes)."""
    if value is None:
        return ""
    return str(value).strip().upper().replace('"', "").replace("'", "")


def sec_to_hms(seconds: int | float) -> str:
    s = int(seconds)
    h, rem = divmod(s, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"
