"use client";

import { AgentChat } from "@/components/agent/AgentChat";

export default function AgenteFacturacionPage() {
  return (
    <AgentChat
      apiBase="/api/v1/facturacion-agent"
      title="Agente de Facturación"
      emptyHeading="¿Qué querés analizar de la facturación?"
      emptyHint="Soy experto en la liquidación de comisiones de Televentas Claro (criterios del Manual TLMK Fijo PGY)."
      placeholder="Preguntá sobre la facturación, conceptos, drivers o comparativos…"
      deniedMessage="No tenés acceso al Agente de Facturación. Pedile al administrador que te habilite el módulo Televentas Claro."
      suggestions={[
        "Analizá la última liquidación y sus drivers",
        "Compará los últimos 3 meses de facturación",
        "¿Por qué cae la facturación? Mostrame los débitos en un gráfico",
        "Explicá las suspensiones por PFI por cohorte de venta",
      ]}
    />
  );
}
