"use client";

import { AgentChat } from "@/components/agent/AgentChat";
import { apiFetch } from "@/lib/api";

export default function AgenteFacturacionPage() {
  return (
    <AgentChat
      apiBase="/api/v1/facturacion-agent"
      title="Agente de Facturación"
      emptyHeading="¿Qué querés analizar de la facturación?"
      emptyHint="Soy experto en la liquidación de comisiones de Televentas Claro (criterios del Manual TLMK Fijo PGY). Seleccioná uno o más archivos para que enfoque el análisis."
      placeholder="Preguntá sobre la facturación, conceptos, drivers o comparativos…"
      deniedMessage="No tenés acceso al Agente de Facturación. Pedile al administrador que te habilite el módulo Televentas Claro."
      focusLabel="Enfocar en liquidaciones"
      loadFocusOptions={async () => {
        const data = await apiFetch<{ items: { id: string; periodo: string | null; nro_liquidacion: string | null }[] }>(
          "/api/v1/facturacion/reports",
        );
        return data.items.map((r) => ({
          id: r.id,
          label: `${r.periodo || "—"} · Liq ${r.nro_liquidacion || "?"}`,
        }));
      }}
      suggestions={[
        "Analizá a fondo la liquidación seleccionada y sus drivers",
        "Compará los meses seleccionados y descomponé el cambio",
        "¿Por qué cae la facturación? Mostrame los débitos en un gráfico",
        "Suspensiones por PFI y documentación faltante por cohorte de venta",
      ]}
    />
  );
}
