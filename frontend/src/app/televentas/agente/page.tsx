"use client";

import { AgentChat } from "@/components/agent/AgentChat";
import { apiFetch } from "@/lib/api";

export default function AgenteTeleventasPage() {
  return (
    <AgentChat
      apiBase="/api/v1/televentas-agent"
      title="Agente de Ventas"
      emptyHeading="¿Qué querés analizar de Televentas?"
      emptyHint="Analizo llamadas y producción: conversión, ranking de vendedores, mix de productos, anulaciones, días productivos y alertas. Por defecto trabajo con el mes más reciente."
      placeholder="Preguntá sobre ventas, conversión, vendedores o productos…"
      deniedMessage="No tenés acceso al Agente de Ventas. Pedile al administrador que te habilite el uso del agente."
      focusLabel="Enfocar en un reporte"
      loadFocusOptions={async () => {
        const data = await apiFetch<{
          items: { id: string; period_month: string | null; prima_emitida: number; polizas_emitidas: number; is_published: boolean }[];
        }>("/api/v1/televentas/produccion/reports");
        const gsM = (v: number) => {
          const a = Math.abs(v || 0);
          if (a >= 1e9) return "Gs " + (v / 1e9).toFixed(1).replace(".", ",") + " MM";
          if (a >= 1e6) return "Gs " + Math.round(v / 1e6) + " M";
          return "Gs " + Math.round(v).toLocaleString("es-PY");
        };
        return data.items.map((r) => ({
          id: r.id,
          label: r.period_month || "Sin período",
          sublabel: `${r.polizas_emitidas} pólizas`,
          badge: gsM(r.prima_emitida),
          published: r.is_published,
        }));
      }}
      suggestions={[
        "¿Cuántos asesores necesito para vender Gs 800 millones netos?",
        "¿Por qué no compran? Motivos de no-venta del CRM con ejemplos",
        "Productividad de gestiones CRM por operador este mes",
        "Mostrame la tendencia de conversión y contactabilidad de los últimos meses",
        "¿Cómo vienen evolucionando las llamadas y los agentes activos?",
        "¿Hay señales de deterioro de las bases entre meses?",
        "¿Cómo va a cerrar el mes? Proyectá prima y pólizas",
        "¿Qué vendedores cayeron vs el mes pasado?",
      ]}
    />
  );
}
