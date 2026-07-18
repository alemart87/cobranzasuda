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
        "Dame el panel gerencial de hoy con las alertas",
        "¿Cómo viene la efectividad de entrega esta semana?",
        "¿Qué choferes tienen rutas atrasadas hoy?",
        "Entregas de hoy: entregadas vs fallidas, con un gráfico",
      ]}
    />
  );
}
