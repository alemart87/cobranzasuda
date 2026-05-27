"""Project end-of-month recupero based on current run-rate + 30% boost last 3 days."""
from __future__ import annotations

from calendar import monthrange
from datetime import date


def project_recupero(
    recupero_actual: float,
    dias_transcurridos: int,
    period_month: date | None = None,
    boost_last_days: int = 3,
    boost_factor: float = 1.30,
) -> dict[str, float]:
    if period_month is None:
        period_month = date.today()

    total_days = monthrange(period_month.year, period_month.month)[1]
    dias_restantes = max(total_days - dias_transcurridos, 0)

    if dias_transcurridos <= 0:
        return {
            "ejecutado": recupero_actual,
            "proyectado_total": recupero_actual,
            "dias_transcurridos": dias_transcurridos,
            "dias_totales": total_days,
        }

    ritmo_diario = recupero_actual / dias_transcurridos
    dias_boost = min(boost_last_days, dias_restantes)
    dias_normal = max(dias_restantes - dias_boost, 0)

    adicional_normal = ritmo_diario * dias_normal
    adicional_boost = ritmo_diario * dias_boost * boost_factor
    proyectado_total = recupero_actual + adicional_normal + adicional_boost

    return {
        "ejecutado": round(recupero_actual, 2),
        "ritmo_diario": round(ritmo_diario, 2),
        "dias_transcurridos": dias_transcurridos,
        "dias_totales": total_days,
        "dias_restantes": dias_restantes,
        "dias_normal": dias_normal,
        "dias_boost": dias_boost,
        "adicional_normal": round(adicional_normal, 2),
        "adicional_boost": round(adicional_boost, 2),
        "proyectado_total": round(proyectado_total, 2),
    }
