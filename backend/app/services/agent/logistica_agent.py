"""Agente de Logística (OpenAI Agents SDK) — consulta la API de QuadMinds v2.

Reusa el motor de streaming del Agente de Experiencia con instrucciones de analista
de logística/distribución y tools que llaman la API real (read-only).
"""
from __future__ import annotations

from typing import Any, Optional

from ...core.config import settings
from . import core
from .core import AgentNotConfigured
from .logistica_tools import logi_entregas_impl, logi_gerencial_impl, logi_get_impl, logi_recursos_impl
from .tools import AgentContext

RunContextWrapper = None  # type: ignore


_INSTRUCCIONES = """\
Sos el "Agente de Logística", analista SENIOR de distribución y última milla. Trabajás sobre los datos \
de QuadMinds (plataforma de ruteo y entregas). Respondés SIEMPRE en español rioplatense, ejecutivo y \
determinista, con foco en la operación de ENTREGAS: efectividad, rutas, flota y choferes.

Datos y herramientas (todo LECTURA sobre la API real):
- `logi_recursos`: lista los recursos disponibles (orders, routes, drivers, vehicles, waypoints, pois, …).
- `logi_get(recurso, params)`: consulta cualquier recurso GET con filtros (paginan con limit/offset). \
Usalo para responder consultas puntuales llamando a la API (choferes, vehículos, rutas de un día, etc.).
- `logi_entregas(desde, hasta)`: estadísticas de entrega ya agregadas (total, por estado, por categoría \
entregado/fallido/en_curso/pendiente, efectividad y serie diaria).
- `logi_gerencial(desde, hasta)`: VISIÓN DE GESTIÓN — cruza entregas + rutas + flota y devuelve ALERTAS \
por umbral (efectividad baja, fallidos altos, rutas atrasadas/overdue, desvío de km, choferes con atraso). \
Es tu mejor punto de partida para "cómo viene la operación" o preguntas gerenciales.

Metodología:
1. Para el estado de la operación, empezá por `logi_entregas` del período pedido (o los últimos días). \
Reportá total, % entregado, % fallido y efectividad sobre cerradas, y la tendencia diaria.
2. Para el detalle (qué chofer, qué ruta, qué zona), usá `logi_get` sobre el recurso adecuado con filtros. \
Si no sabés el nombre del recurso o del filtro, mirá primero `logi_recursos` y explorá con un `limit` chico.
3. Cruzá entregas con rutas/choferes/vehículos para explicar POR QUÉ (rutas largas, zonas con más fallos, \
choferes con baja efectividad). Cerrá con acciones concretas.
4. Si la API no está configurada (sin_configurar) o devuelve error, decilo claramente y no inventes datos.

NUNCA inventes números: si un dato no vino de una tool, no lo afirmes. Los campos de estado/fecha de las \
órdenes pueden variar; el resumen ya los normaliza (categorías entregado/fallido/…). Si una categoría \
queda como "otro", aclarar que ese estado no se pudo clasificar y sugerí revisar el mapeo.

Visualización con `emit_canvas` (panel derecho) — usá EXACTAMENTE estas formas de `datos`:
- KPIs: tipo="kpis", datos={"kpis":[{"label":"Entregado","valor":"92%"},{"label":"Órdenes","valor":"1.240"}]}
- Barras: tipo="bar", datos={"items":[{"label":"Entregado","valor":1140},{"label":"Fallido","valor":100}]}
- Líneas (serie diaria): tipo="line", datos={"items":[{"label":"2026-07-01","Entregado":120,"Fallido":8}]}
- Tabla: tipo="table", datos={"columnas":["Chofer","Entregas"],"filas":[["Juan","48"]]}
Los valores numéricos de barras/líneas van como NÚMERO. Mandá el detalle al canvas y resumí los hallazgos.
"""


def _build_logistica_agent():
    try:
        from agents import Agent, function_tool, set_default_openai_key
        from agents import RunContextWrapper as _RCW
    except ImportError as exc:
        raise AgentNotConfigured("El SDK 'openai-agents' no está instalado en el servidor.") from exc

    globals()["RunContextWrapper"] = _RCW
    if not settings.openai_api_key:
        raise AgentNotConfigured("Falta OPENAI_API_KEY en la configuración del servidor.")
    set_default_openai_key(settings.openai_api_key)

    from datetime import date, timedelta
    hoy = date.today()
    ayer = (hoy - timedelta(days=1)).isoformat()
    hace7 = (hoy - timedelta(days=6)).isoformat()
    contexto_fecha = (
        f"FECHA ACTUAL: hoy es {hoy.isoformat()} ({hoy.strftime('%A')}). "
        f"Ayer fue {ayer}. La última semana va de {hace7} a {hoy.isoformat()}. "
        "Cuando el usuario diga 'hoy', 'del día', 'ayer', 'esta semana', usá estas fechas "
        "concretas al llamar las tools (recordá que /orders y /routes limitan a 7 días por consulta).\n\n"
    )

    @function_tool
    async def logi_recursos(ctx: RunContextWrapper[AgentContext]) -> dict:
        """Lista los recursos GET disponibles de la API de QuadMinds."""
        return await logi_recursos_impl()

    @function_tool(strict_mode=False)
    async def logi_get(ctx: RunContextWrapper[AgentContext], recurso: str,
                       params: Optional[dict] = None, limite: int = 50) -> dict:
        """Consulta un recurso GET de QuadMinds (orders, routes, drivers, vehicles, waypoints, pois, …)
        con filtros opcionales (`params`, se reenvían tal cual; paginan con limit/offset). Devuelve una
        muestra (cap `limite`) + el total leído."""
        return await logi_get_impl(recurso, params, limite)

    @function_tool(strict_mode=False)
    async def logi_entregas(ctx: RunContextWrapper[AgentContext], desde: Optional[str] = None,
                            hasta: Optional[str] = None, filtros: Optional[dict] = None) -> dict:
        """Estadísticas de entrega agregadas: total, por estado, por categoría (entregado/fallido/
        en_curso/pendiente), efectividad y serie diaria. `desde`/`hasta` = YYYY-MM-DD."""
        return await logi_entregas_impl(desde, hasta, filtros)

    @function_tool(strict_mode=False)
    async def logi_gerencial(ctx: RunContextWrapper[AgentContext], desde: Optional[str] = None,
                             hasta: Optional[str] = None) -> dict:
        """Panel GERENCIAL: cruza entregas + rutas + flota y devuelve ALERTAS por umbral
        (efectividad baja, fallidos altos, rutas atrasadas, desvío de km, choferes con atraso).
        Es tu mejor punto de partida para una visión de gestión. `desde`/`hasta` YYYY-MM-DD."""
        return await logi_gerencial_impl(desde, hasta)

    @function_tool(strict_mode=False)
    async def emit_canvas(ctx: RunContextWrapper[AgentContext], tipo: str, titulo: str, datos: dict,
                          descripcion: Optional[str] = None) -> dict:
        """Dibuja un artefacto en el canvas. `tipo`: 'bar' | 'stacked-bar' | 'line' | 'area' | 'donut' |
        'table' | 'kpis' | 'markdown'. Devuelve el id del artefacto."""
        artifact = {"id": f"art{len(ctx.context.canvas) + 1}", "tipo": tipo, "titulo": titulo,
                    "descripcion": descripcion, "datos": datos}
        ctx.context.canvas.append(artifact)
        return {"ok": True, "artifact_id": artifact["id"]}

    tools = [logi_recursos, logi_get, logi_entregas, logi_gerencial, emit_canvas]

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

    kwargs: dict[str, Any] = dict(name="Agente de Logística", instructions=contexto_fecha + _INSTRUCCIONES,
                                  model=settings.agent_model, tools=tools)
    if model_settings is not None:
        kwargs["model_settings"] = model_settings
    return Agent(**kwargs)


async def stream_logistica_agent(messages: list[dict], context: AgentContext):
    async for ev in core.stream_agent(messages, context, build_fn=_build_logistica_agent):
        yield ev
