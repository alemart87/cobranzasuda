"use client";

import { AgentChat } from "@/components/agent/AgentChat";

export default function AgenteLogisticaPage() {
  return (
    <AgentChat
      apiBase="/api/v1/logistica-agent"
      title="Agente de Logística"
      emptyHeading="¿Qué querés analizar de la operación de entregas?"
      emptyHint="Consulto la API de QuadMinds en vivo: entregas, rutas, choferes y flota. Puedo darte efectividad, fallidos, tendencia diaria y el detalle por recurso."
      placeholder="Preguntá sobre entregas, rutas, choferes o vehículos…"
      deniedMessage="No tenés acceso al Agente de Logística. Pedile al administrador que te habilite el módulo Logística."
      suggestions={[
        "¿Cómo viene la efectividad de entrega de los últimos días?",
        "Entregas por día: entregadas vs fallidas, con un gráfico",
        "¿Qué choferes y vehículos hay activos?",
        "Mostrame las rutas de hoy y sus paradas",
      ]}
    />
  );
}
