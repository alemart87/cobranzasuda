"""Agente de Televentas (OpenAI Agents SDK).

Reusa el motor de streaming del Agente de Experiencia (`core.stream_agent`) con
instrucciones de GERENTE DE VENTAS y tools propias sobre los reportes de llamadas
y producción de televentas.
"""
from __future__ import annotations

from typing import Any, Optional

from ...core.config import settings
from . import core
from .core import AgentNotConfigured
from .televentas_tools import (
    tv_buscar_polizas_impl, tv_caidas_vendedores_impl, tv_comparar_meses_impl, tv_focus_impl,
    tv_listar_periodos_impl, tv_llamadas_impl, tv_overview_impl, tv_produccion_impl,
    tv_proyeccion_impl, tv_ranking_vendedores_impl, tv_tendencias_impl,
)
from .tools import AgentContext

RunContextWrapper = None  # type: ignore  # se setea en _build_televentas_agent


_INSTRUCCIONES = """\
Sos el "Agente de Ventas", analista SENIOR de televentas de seguros (operación de Voicenter para \
Sudameris Seguros). Respondés SIEMPRE en español rioplatense, ejecutivo y determinista. Tu estándar \
es gerencial: no describís KPIs sueltos, explicás POR QUÉ se mueve la producción y QUÉ hacer.

Modelo de datos (dos fuentes que se cruzan por vendedor):
- LLAMADAS (voz saliente): total, contestadas (duración ≥ umbral), TMO, por vendedor y por día.
- PRODUCCIÓN (pólizas): EMITIDA = prima > 0; ANULADA = prima < 0 (importe = |prima|). Prima emitida, \
prima anulada, ticket promedio, días productivos, mix por tipo de póliza, ranking por vendedor, canal \
y medio de cobro.
- CONVERSIÓN = pólizas emitidas ÷ llamadas contestadas. Es el KPI comercial clave.

Metodología de análisis PROFUNDO (replicala cuando haya datos):
1. Empezá por `tv_overview` del mes: leé prima emitida/neta, pólizas, ticket, conversión, días \
productivos y las ALERTAS. Es tu foto gerencial.
2. Ranking de vendedores (`tv_ranking_vendedores`): identificá top y cola. Cruzá esfuerzo (llamadas/ \
contestadas) contra resultado (pólizas/prima) y CONVERSIÓN. Un vendedor con muchas llamadas y baja \
conversión tiene problema de calidad de contacto o cierre; con pocas llamadas, problema de actividad.
3. Alertas: explicá cada vendedor en alerta (baja producción y/o bajas llamadas) con su número y una \
acción concreta (más marcaciones, coaching de cierre, revisar base asignada).
4. Días productivos vs no productivos: si hay muchos días sin ventas, marcá el patrón (¿inicio de mes \
lento? ¿caídas puntuales?) usando la producción por día.
5. Anulaciones: prima anulada alta erosiona la producción neta. Mirá qué vendedores/productos concentran \
anulaciones (prima_anulada por vendedor). Distinguí SIEMPRE prima emitida de prima NETA.
6. Mix de productos (`tv_produccion` → por_producto): separá el producto MÁS vendido (volumen) del de \
MAYOR prima/ticket. Recomendá dónde empujar.
7. Tendencia: usá llamadas por día y producción por día para detectar concentraciones o caídas.
8. Proyección de cierre: si preguntan cómo va a cerrar el mes o el ritmo, usá `tv_proyeccion` \
(run-rate por día hábil). Aclarar el % de avance y que es lineal; si el mes está completo, decilo.
9. Comparativo mensual: para "¿cómo venimos vs el mes pasado?" usá `tv_comparar_meses` (deltas de \
KPIs, por vendedor y por producto). Comentá los drivers del cambio (quién/qué producto explica el delta).
9b. TENDENCIA multi-mes: para "cómo viene evolucionando", "compará los últimos meses" o detectar \
deterioros sostenidos, usá `tv_tendencias` (serie de conversión, llamadas totales/promedio, agentes \
activos, contactabilidad, prima). Leé sus insights (ej. conversión cayendo N meses, más marcación con \
peor contacto = base deteriorada) y graficá la evolución con `emit_canvas` (tipo 'line').
10. Caídas de vendedores: usá `tv_caidas_vendedores` para señalar quién bajó fuerte (prima, pólizas o \
llamadas) vs el mes anterior, con el % de caída y una acción. Requiere 2+ meses; si hay uno solo, decilo.

FOCO del usuario: llamá `tv_focus` PRIMERO. Si seleccionó reportes, centrá el análisis en ellos.

Datos: NO inventás. Si falta una fuente (solo llamadas o solo producción), decilo y trabajá con lo que hay. \
Si no hay nada, sugerí subir y publicar los reportes. La identidad de los asegurados está enmascarada \
([cliente]): no la pidas ni la inventes; el análisis es de performance comercial, no de clientes.

Tools: `tv_focus`, `tv_listar_periodos`, `tv_overview`, `tv_ranking_vendedores`, `tv_produccion`, \
`tv_llamadas`, `tv_buscar_polizas`, `tv_proyeccion`, `tv_comparar_meses`, `tv_caidas_vendedores`.

Visualización con `emit_canvas` (panel derecho) — usá EXACTAMENTE estas formas de `datos`:
- KPIs: tipo="kpis", datos={"kpis":[{"label":"Prima emitida","valor":"Gs 300.362.597"},{"label":"Conversión","valor":"3,0 %"}]}
- Barras: tipo="bar", datos={"items":[{"label":"VIDA MULTIRRIESGO","valor":248267597},{"label":"AP PREMIUM","valor":52095000}]}
- Líneas (tendencia): tipo="line", datos={"items":[{"label":"2026-06-01","Prima":24334098},{"label":"2026-06-02","Prima":8767591}]}
- Tabla: tipo="table", datos={"columnas":["Vendedor","Prima","Pólizas"],"filas":[["Luis Jara","Gs 50.036.932","26"]]}
Los valores numéricos de barras/líneas van como NÚMERO (sin "Gs" ni puntos); los de KPIs/tabla pueden ir \
formateados como texto. No pegues tablas gigantes en el texto: mandá el detalle al canvas y resumí los hallazgos.
"""


def _build_televentas_agent():
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
    async def tv_focus(ctx: RunContextWrapper[AgentContext]) -> dict:
        """Reportes que el usuario SELECCIONÓ como foco. Llamala PRIMERO: si hay foco, centrá ahí el análisis."""
        return await tv_focus_impl(ctx.context.focus_refs)

    @function_tool
    async def tv_listar_periodos(ctx: RunContextWrapper[AgentContext]) -> dict:
        """Meses con datos y qué fuentes (llamadas/producción) hay en cada uno."""
        return await tv_listar_periodos_impl()

    @function_tool(strict_mode=False)
    async def tv_overview(ctx: RunContextWrapper[AgentContext], mes: Optional[str] = None) -> dict:
        """Overview COMBINADO del mes: KPIs de llamadas + producción, conversión, ranking por vendedor y
        alertas. `mes` YYYY-MM; sin `mes` usa el más reciente. Es la mejor tool para la visión gerencial."""
        return await tv_overview_impl(mes)

    @function_tool(strict_mode=False)
    async def tv_ranking_vendedores(ctx: RunContextWrapper[AgentContext], mes: Optional[str] = None) -> dict:
        """Ranking por vendedor (llamadas + producción + conversión) y las alertas del mes."""
        return await tv_ranking_vendedores_impl(mes)

    @function_tool(strict_mode=False)
    async def tv_produccion(ctx: RunContextWrapper[AgentContext], mes: Optional[str] = None) -> dict:
        """Detalle de producción del mes: KPIs, mix por tipo de póliza, ranking por vendedor, canal,
        medio de cobro y producción por día."""
        return await tv_produccion_impl(mes)

    @function_tool(strict_mode=False)
    async def tv_llamadas(ctx: RunContextWrapper[AgentContext], mes: Optional[str] = None) -> dict:
        """Detalle de llamadas del mes: KPIs, ranking por vendedor y llamadas por día."""
        return await tv_llamadas_impl(mes)

    @function_tool(strict_mode=False)
    async def tv_buscar_polizas(ctx: RunContextWrapper[AgentContext], mes: Optional[str] = None,
                                vendedor: Optional[str] = None, producto: Optional[str] = None,
                                tipo: Optional[str] = None, limite: int = 50) -> dict:
        """Lista pólizas del mes filtrables por `vendedor`, `producto` y `tipo` ('emitidas'|'anuladas').
        La identidad del asegurado está enmascarada. `limite` máx 200."""
        return await tv_buscar_polizas_impl(mes, vendedor, producto, tipo, limite)

    @function_tool(strict_mode=False)
    async def tv_proyeccion(ctx: RunContextWrapper[AgentContext], mes: Optional[str] = None) -> dict:
        """Proyección de CIERRE de mes: prima y pólizas emitidas proyectadas al fin de mes según el
        run-rate por día hábil (usa el último día con venta como referencia). Incluye % de avance."""
        return await tv_proyeccion_impl(mes)

    @function_tool(strict_mode=False)
    async def tv_comparar_meses(ctx: RunContextWrapper[AgentContext], mes: Optional[str] = None,
                                mes_previo: Optional[str] = None) -> dict:
        """Compara un mes vs el anterior: deltas de KPIs (prima, pólizas, conversión, llamadas…),
        por vendedor y por producto. Sin argumentos usa los dos meses más recientes con datos."""
        return await tv_comparar_meses_impl(mes, mes_previo)

    @function_tool(strict_mode=False)
    async def tv_tendencias(ctx: RunContextWrapper[AgentContext], meses: int = 12) -> dict:
        """TENDENCIA multi-mes (varios meses juntos): serie de conversión, llamadas totales y
        promedio (por día y por asesor), agentes activos, contactabilidad, prima y pólizas, con
        insights de tendencia. Usala para 'cómo viene evolucionando', comparar varios meses o
        detectar deterioros sostenidos. `meses` = cantidad máxima (default 12)."""
        return await tv_tendencias_impl(meses)

    @function_tool(strict_mode=False)
    async def tv_caidas_vendedores(ctx: RunContextWrapper[AgentContext], mes: Optional[str] = None,
                                   mes_previo: Optional[str] = None, umbral_pct: float = 30.0) -> dict:
        """Detecta vendedores del equipo con CAÍDA significativa (prima, pólizas o llamadas) vs el mes
        anterior. `umbral_pct` = caída mínima para alertar (default 30%)."""
        return await tv_caidas_vendedores_impl(mes, mes_previo, umbral_pct)

    @function_tool(strict_mode=False)
    async def emit_canvas(ctx: RunContextWrapper[AgentContext], tipo: str, titulo: str, datos: dict,
                          descripcion: Optional[str] = None) -> dict:
        """Dibuja un artefacto en el canvas (panel derecho). `tipo`: 'bar' | 'stacked-bar' | 'line' |
        'area' | 'donut' | 'table' | 'kpis' | 'markdown'. Devuelve el id del artefacto."""
        artifact = {
            "id": f"art{len(ctx.context.canvas) + 1}",
            "tipo": tipo, "titulo": titulo, "descripcion": descripcion, "datos": datos,
        }
        ctx.context.canvas.append(artifact)
        return {"ok": True, "artifact_id": artifact["id"]}

    tools = [tv_focus, tv_listar_periodos, tv_overview, tv_ranking_vendedores, tv_produccion,
             tv_llamadas, tv_buscar_polizas, tv_proyeccion, tv_comparar_meses, tv_tendencias,
             tv_caidas_vendedores, emit_canvas]

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
        name="Agente de Ventas",
        instructions=_INSTRUCCIONES,
        model=settings.agent_model,
        tools=tools,
    )
    if model_settings is not None:
        kwargs["model_settings"] = model_settings
    return Agent(**kwargs)


async def stream_televentas_agent(messages: list[dict], context: AgentContext):
    """Streaming del Agente de Televentas (reusa el loop de `core.stream_agent`)."""
    async for ev in core.stream_agent(messages, context, build_fn=_build_televentas_agent):
        yield ev
