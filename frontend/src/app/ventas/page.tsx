import { AppShell } from "@/components/AppShell";
import { ComingSoon } from "@/components/ComingSoon";

export default function VentasPage() {
  return (
    <AppShell>
      <ComingSoon
        module="Ventas"
        description="Gestión comercial integral. Pipeline, performance por canal y asesor, conversión de leads, evolución mensual y comparativos por producto. Próximamente integrado con CRM y reportes de campañas."
        badges={["Pipeline", "Conversión", "Ranking comercial", "Cross-sell", "Campañas"]}
        color="#F39200"
        bgGradient="linear-gradient(135deg, #C57400 0%, #F39200 100%)"
      />
    </AppShell>
  );
}
