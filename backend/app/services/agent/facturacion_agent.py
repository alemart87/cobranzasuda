"""Agente de Facturación · Televentas Claro (OpenAI Agents SDK).

Reusa el motor de streaming del Agente de Experiencia (`core.stream_agent`) pero
con instrucciones EXPERTAS en liquidación de comisiones (criterios del Manual TLMK
Fijo PGY) y tools propias sobre los reportes de facturación.
"""
from __future__ import annotations

from typing import Any, Optional

from ...core.config import settings
from . import core
from .core import AgentNotConfigured
from .facturacion_tools import (
    fact_comparar_impl, fact_listar_reportes_impl, fact_obtener_reporte_impl,
)
from .tools import AgentContext

RunContextWrapper = None  # type: ignore  # se setea en _build_facturacion_agent


# Catálogo de criterios del Manual de Esquemas y Conceptos TLMK Fijo PGY (referencia).
CRITERIOS = {
    "chargeback": "Período de 180 días desde la activación. Las penalidades operan dentro de él.",
    "ACTIVACIONES (Upfront, concepto 1 cuota 1)": "1ª comisión por la instalación de la línea.",
    "DIFERIDO (concepto 1 cuota 2)": "2ª cuota; se paga si la línea sigue activa al día 60, si no, importe 0.",
    "LINEA CON DOCUMENTACION FALTANTE (concepto 10)": "Descuenta 50% (legajo incompleto/observado) o 100% (no presentado/rechazado) del upfront+diferido. Control a los 26 días.",
    "AJUSTE LEGAJO (concepto 21)": "Descuenta lo que el concepto 10 no pudo descontar por otra penalidad previa.",
    "REVERSO LINEA DOC FALTANTE (concepto 9)": "Revierte los conceptos 10 y 21 si Control Documental valida el reclamo.",
    "DEVOLUCION DESCUENTO DOCUMENTACION (concepto 56)": "Al día 365 devuelve lo descontado por documentación faltante.",
    "CAMBIO DE PLAN (concepto 3)": "Descuenta la diferencia si el plan destino comisiona menos que el de activación.",
    "CANCELACIONES (concepto 5)": "Por PFI (razón de fraude) descuenta TODA la comisión de activación; cancelación estándar = 0.",
    "SUSPENSIONES (concepto 11)": "Por PFI descuenta TODA la comisión (upfront, diferido, residuales); suspensión estándar = 0.",
    "RECONEXIONES (concepto 15)": "Revierte cancelaciones/suspensiones si la línea se reconecta dentro del chargeback.",
    "REVERSO ACTIVACION (concepto 6)": "Descuenta todo por cancelación tipo 'reverso de activación' o falta de tráfico.",
    "RECUPERO ACTIVACION (concepto 14)": "Revierte el concepto 6.",
    "PENALIZACION POR DEUDA (concepto 7)": "Presuspensión/cancelación por falta de pago o migración a prepago.",
    "REVERSO PENALIZACION POR DEUDA (concepto 13)": "Revierte el concepto 7 (monto 0).",
    "RESIDUAL (concepto 93)": "Comisión residual recurrente (% sobre la línea activa).",
    "INCENTIVO PRODUCTIVIDAD": "Bono por cumplimiento del objetivo de ventas. RECALCULO y DESCUENTO INCENTIVOS lo ajustan a la baja.",
    "PORTABILIDAD": "ACTIVACION PORTABILIDAD NUMERICA (crédito) y DESCUENTO PORTABILIDAD NUMERICA (débito asociado).",
}


_INSTRUCCIONES = """\
Sos el "Agente de Facturación", analista experto en la LIQUIDACIÓN DE COMISIONES del \
canal Telemarketing Fijo Paraguay (Claro), operación de Voicenter. Respondés SIEMPRE en \
español rioplatense, ejecutivo y determinista.

Tu marco de criterios (Manual de Esquemas y Conceptos TLMK Fijo PGY):
- La columna Importe es el MONTO AFECTADO. Créditos (+) = comisiones; Débitos (−) = \
penalidades/descuentos. Facturación neta = créditos − débitos.
- Período de chargeback: 180 días desde la activación; las penalidades maduran dentro de él.
- Conceptos clave (usá `fact_criterios` para el detalle): Activaciones (upfront) y Diferido; \
Documentación faltante (descuenta 50/100% del upfront+diferido, control a 26 días, reversible \
con el concepto 9 / devolución 56); Suspensiones y Cancelaciones por PFI (descuentan TODA la \
comisión) y Reconexiones (las revierten); Penalización por deuda; Cambio de plan; Incentivo de \
productividad (bono que depende del cumplimiento del objetivo de ventas).

Metodología de análisis (replicala):
- Separá SIEMPRE créditos vs débitos. Identificá los drivers operativos: bono/incentivo, \
suspensiones por PFI, documentación faltante y ventas (activaciones).
- Las penalidades (suspensiones por PFI, documentación faltante) maduran ~2 meses después de \
la venta: analizá su COHORTE por mes de venta (campo por_mes_venta) para ubicar el origen.
- El bono por venta = incentivo productividad ÷ activaciones del mes.
- Usá SIEMPRE el término "PFI" (no "fraude").
- Conclusiones DETERMINISTAS y operativas (drivers gestionables), sin hipótesis especulativas \
que generen dudas. Marco: si no se alcanza el objetivo de ventas se afecta el bono; la \
documentación se ordena con Logística y Claro; las suspensiones por PFI se controlan en el cierre.
- Para comparativos tomá MÍNIMO los últimos 3 meses (ideal 6).

Cómo trabajás:
- NO inventás datos. Consultás SIEMPRE las tools (read-only sobre los reportes reales) y razonás.
  · `fact_listar_reportes` para ver qué meses hay. · `fact_obtener_reporte` (por período YYYY-MM, \
  número de liquidación o 'ultimo') para el detalle con TODAS las descripciones de concepto y las \
  cohortes de suspensiones/documentación. · `fact_comparar` (2+ períodos) para variaciones y drivers. \
  · `fact_criterios` para citar la regla exacta de un concepto.
- Si no hay reportes, decílo y sugerí subir las liquidaciones .txt.
- Citá números concretos (Gs, %, cantidades). Para visualizar usá `emit_canvas` (panel derecho): \
barras/líneas para evolución y drivers, tabla para el detalle por concepto. No pegues tablas \
gigantes en el texto.
"""


def _build_facturacion_agent():
    try:
        from agents import Agent, function_tool, set_default_openai_key
        from agents import RunContextWrapper as _RCW
    except ImportError as exc:
        raise AgentNotConfigured("El SDK 'openai-agents' no está instalado en el servidor.") from exc

    globals()["RunContextWrapper"] = _RCW
    if not settings.openai_api_key:
        raise AgentNotConfigured("Falta OPENAI_API_KEY en la configuración del servidor.")
    set_default_openai_key(settings.openai_api_key)

    @function_tool
    async def fact_listar_reportes(ctx: RunContextWrapper[AgentContext]) -> dict:
        """Lista los reportes de facturación disponibles (período, liquidación, total, créditos,
        débitos, ventas, estado de publicación)."""
        return await fact_listar_reportes_impl()

    @function_tool
    async def fact_obtener_reporte(ctx: RunContextWrapper[AgentContext], referencia: Optional[str] = None) -> dict:
        """Detalle de un reporte: KPIs, TODAS las descripciones de concepto, ventas, suspensiones (PFI)
        y documentación faltante por cohorte de venta. `referencia`: período YYYY-MM, número de
        liquidación, id, o 'ultimo' (default: el más reciente)."""
        return await fact_obtener_reporte_impl(referencia)

    @function_tool(strict_mode=False)
    async def fact_comparar(ctx: RunContextWrapper[AgentContext], referencias: list[str]) -> dict:
        """Compara 2+ reportes (por período YYYY-MM, número de liquidación o id): matriz por concepto,
        panel de drivers, totales y variaciones mes a mes."""
        return await fact_comparar_impl(referencias)

    @function_tool
    async def fact_criterios(ctx: RunContextWrapper[AgentContext], concepto: Optional[str] = None) -> dict:
        """Devuelve los criterios del Manual TLMK Fijo PGY. Sin `concepto`: catálogo completo.
        Con `concepto`: las entradas que coincidan (para citar la regla exacta)."""
        if not concepto:
            return {"criterios": CRITERIOS}
        q = concepto.strip().lower()
        match = {k: v for k, v in CRITERIOS.items() if q in k.lower() or q in v.lower()}
        return {"criterios": match or CRITERIOS}

    @function_tool(strict_mode=False)
    async def emit_canvas(ctx: RunContextWrapper[AgentContext], tipo: str, titulo: str, datos: dict,
                          descripcion: Optional[str] = None) -> dict:
        """Dibuja un artefacto en el canvas (panel derecho). `tipo`: 'bar' | 'stacked-bar' | 'line' |
        'area' | 'donut' | 'table' | 'kpis' | 'markdown'. `datos` según el tipo (igual que el agente
        de Atención). Devuelve el id del artefacto."""
        artifact = {
            "id": f"art{len(ctx.context.canvas) + 1}",
            "tipo": tipo, "titulo": titulo, "descripcion": descripcion, "datos": datos,
        }
        ctx.context.canvas.append(artifact)
        return {"ok": True, "artifact_id": artifact["id"]}

    tools = [fact_listar_reportes, fact_obtener_reporte, fact_comparar, fact_criterios, emit_canvas]

    model_settings = None
    try:
        from agents import ModelSettings
        try:
            from openai.types.shared import Reasoning
            rkwargs: dict[str, Any] = {"effort": settings.agent_reasoning_effort}
            if settings.agent_reasoning_summary:
                rkwargs["summary"] = settings.agent_reasoning_summary
            model_settings = ModelSettings(reasoning=Reasoning(**rkwargs))
        except Exception:
            model_settings = ModelSettings()
    except Exception:
        model_settings = None

    kwargs: dict[str, Any] = dict(
        name="Agente de Facturación",
        instructions=_INSTRUCCIONES,
        model=settings.agent_model,
        tools=tools,
    )
    if model_settings is not None:
        kwargs["model_settings"] = model_settings
    return Agent(**kwargs)


async def stream_facturacion_agent(messages: list[dict], context: AgentContext):
    """Streaming del Agente de Facturación (reusa el loop de `core.stream_agent`)."""
    async for ev in core.stream_agent(messages, context, build_fn=_build_facturacion_agent):
        yield ev
