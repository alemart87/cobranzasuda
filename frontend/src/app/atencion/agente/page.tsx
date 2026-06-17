"use client";

import { AgentChat } from "@/components/agent/AgentChat";

export default function AgentePage() {
  return (
    <AgentChat
      apiBase="/api/v1/agent"
      title="Agente de Experiencia"
      emptyHeading="¿Qué querés analizar?"
      emptyHint="Analizo los datos de Atención al Cliente. Por defecto, el mes actual."
      placeholder="Preguntá sobre la atención al cliente…"
      deniedMessage="No tenés acceso al Agente de Experiencia. Pedile al administrador que te habilite."
      suggestions={[
        "Resumí la atención del mes actual",
        "¿Cuáles son los principales motivos de contacto?",
        "Mostrame la Voz del Cliente en un gráfico",
        "¿Qué temas tienen más fricción?",
      ]}
    />
  );
}
