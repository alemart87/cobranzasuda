import { AppShell } from "@/components/AppShell";
import { ComingSoon } from "@/components/ComingSoon";

export default function AtencionPage() {
  return (
    <AppShell>
      <ComingSoon
        module="Atención al Cliente"
        description="Análisis de NPS, gestión de detractores, calidad de la atención y motivos de consulta más frecuentes. Próximamente integrado con WhatsApp, llamadas inbound y encuestas post-contacto."
        badges={["NPS", "Detractores", "Motivos de consulta", "Calidad", "Tiempos de respuesta"]}
        color="#00B2BF"
        bgGradient="linear-gradient(135deg, #007680 0%, #00B2BF 100%)"
      />
    </AppShell>
  );
}
