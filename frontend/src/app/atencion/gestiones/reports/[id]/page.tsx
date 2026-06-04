"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { DistBar, type DistItem } from "@/components/charts/atencion/DistBar";
import { SerieDia } from "@/components/charts/atencion/SerieDia";
import { apiFetch } from "@/lib/api";
import { formatDate, formatInt, formatPct } from "@/lib/format";

interface GestionDetail {
  id: string;
  period_month: string | null;
  generated_at: string;
  data: {
    kpis: {
      total_gestiones: number;
      cerrados: number;
      pendientes: number;
      pct_cerrados: number;
      tipos_distintos: number;
      canales_distintos: number;
      motivos_distintos: number;
    };
    por_tipo: DistItem[];
    por_estado: DistItem[];
    top_motivos: DistItem[];
    por_canal: DistItem[];
    por_departamento: DistItem[];
    por_seccion: DistItem[];
    por_responsable: DistItem[];
    por_dia: Array<{ dia: string; cantidad: number }>;
  };
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-6 mb-6">
      <h2 className="font-display text-lg text-brand-ink uppercase mb-1">{title}</h2>
      {hint && <p className="text-xs text-brand-slate mb-4">{hint}</p>}
      {children}
    </section>
  );
}

export default function AtencionGestionDetailPage() {
  const params = useParams<{ id: string }>();
  const [report, setReport] = useState<GestionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<GestionDetail>(`/api/v1/atencion/gestiones/reports/${params.id}`)
      .then(setReport)
      .catch((e) => setError(e.message));
  }, [params.id]);

  if (error) return <AppShell><div className="text-brand-primary">{error}</div></AppShell>;
  if (!report) return <AppShell><div>Cargando reporte…</div></AppShell>;

  const k = report.data.kpis;
  const d = report.data;

  return (
    <AppShell>
      <div className="mb-2 text-xs text-brand-slate">
        <Link href="/atencion" className="hover:text-brand-primary">Atención</Link>
        <span className="mx-2">/</span>
        <Link href="/atencion/gestiones/reports" className="hover:text-brand-primary">Gestiones</Link>
        <span className="mx-2">/</span>
        <span className="text-brand-ink font-semibold">{report.period_month ?? "Reporte"}</span>
      </div>
      <div className="mb-6">
        <h1 className="font-display text-3xl text-brand-ink uppercase">Reporte de Gestiones</h1>
        <p className="text-sm text-brand-slate mt-1">
          Período: <b>{report.period_month ?? "—"}</b> · Generado: {formatDate(report.generated_at)} · Registros de contacto
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Gestiones" value={formatInt(k.total_gestiones)} accent="purple" />
        <KpiCard label="Cerrados" value={formatInt(k.cerrados)} hint={formatPct(k.pct_cerrados)} accent="cyan" />
        <KpiCard label="Pendientes" value={formatInt(k.pendientes)} accent="orange" />
        <KpiCard label="Motivos distintos" value={`${k.motivos_distintos}`} accent="secondary" />
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <Section title="Por tipo de caso" hint="Consulta, Reclamo, Solicitud.">
          <DistBar data={d.por_tipo} palette={["#00B2BF", "#E6332A", "#662483", "#F39200"]} />
        </Section>
        <Section title="Por estado" hint="Cerrado, Pendiente, En proceso.">
          <DistBar data={d.por_estado} palette={["#10b981", "#F39200", "#94a3b8", "#E6332A"]} />
        </Section>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <Section title="Por canal de contacto" hint="Telefónico, Whatsapp, Correo.">
          <DistBar data={d.por_canal} palette={["#662483", "#00B2BF", "#F39200", "#E6332A"]} />
        </Section>
        <Section title="Top motivos de contacto">
          <DistBar data={d.top_motivos.slice(0, 10)} color="#E6332A" />
        </Section>
      </div>

      {d.por_departamento.filter((x) => x.label).length > 0 && (
        <Section title="Por departamento destino">
          <DistBar data={d.por_departamento} color="#662483" />
        </Section>
      )}

      {d.por_dia.length > 0 && (
        <Section title="Gestiones por día" hint="Cantidad de registros por fecha de contacto.">
          <SerieDia data={d.por_dia} bars={[{ key: "cantidad", name: "Gestiones", color: "#662483" }]} />
        </Section>
      )}
    </AppShell>
  );
}
