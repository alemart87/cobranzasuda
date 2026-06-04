"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { DistBar } from "@/components/charts/atencion/DistBar";
import { SerieDia } from "@/components/charts/atencion/SerieDia";
import { apiFetch } from "@/lib/api";
import { formatDate, formatInt, formatPct } from "@/lib/format";

interface Operador {
  operador: string;
  entrantes: number;
  salientes: number;
  total: number;
  aht_seg: number;
  aux_seg: number;
}

interface LlamadasDetail {
  id: string;
  period_month: string | null;
  generated_at: string;
  data: {
    kpis: {
      llamadas_ingresadas: number;
      contestadas: number;
      abandonadas: number;
      nivel_atencion_pct: number;
      abandono_pct: number;
      sla_pct: number;
      aht_seg: number;
      asa_seg: number;
      dias_operativos: number;
      colas: string[];
      operadores_activos: number;
      total_entrantes_op: number;
      total_salientes_op: number;
      aux_total_seg: number;
    };
    por_dia: Array<Record<string, any>>;
    por_hora: Array<Record<string, any>>;
    por_cola: Array<{ cola: string; oferta: number; contestadas: number; abandonadas: number; nivel_atencion_pct: number; abandono_pct: number }>;
    operadores: Operador[];
    auxiliares_equipo: Array<{ estado: string; seg: number; pct: number }>;
  };
}

function fmtMinSeg(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = Math.round(seg % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function fmtHoras(seg: number): string {
  return `${(seg / 3600).toFixed(1)} hs`;
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

export default function AtencionLlamadasDetailPage() {
  const params = useParams<{ id: string }>();
  const [report, setReport] = useState<LlamadasDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<LlamadasDetail>(`/api/v1/atencion/llamadas/reports/${params.id}`)
      .then(setReport)
      .catch((e) => setError(e.message));
  }, [params.id]);

  if (error) return <AppShell><div className="text-brand-primary">{error}</div></AppShell>;
  if (!report) return <AppShell><div>Cargando reporte…</div></AppShell>;

  const k = report.data.kpis;
  const ops = [...report.data.operadores].sort((a, b) => b.total - a.total);
  const auxData = report.data.auxiliares_equipo.map((a) => ({
    label: a.estado,
    cantidad: Number((a.seg / 3600).toFixed(1)),
    pct: a.pct,
  }));

  return (
    <AppShell>
      <div className="mb-2 text-xs text-brand-slate">
        <Link href="/atencion" className="hover:text-brand-primary">Atención</Link>
        <span className="mx-2">/</span>
        <Link href="/atencion/llamadas/reports" className="hover:text-brand-primary">Llamadas</Link>
        <span className="mx-2">/</span>
        <span className="text-brand-ink font-semibold">{report.period_month ?? "Reporte"}</span>
      </div>
      <div className="mb-6">
        <h1 className="font-display text-3xl text-brand-ink uppercase">Reporte de Llamadas</h1>
        <p className="text-sm text-brand-slate mt-1">
          Período: <b>{report.period_month ?? "—"}</b> · Generado: {formatDate(report.generated_at)} ·
          {" "}{k.dias_operativos} días operativos · Colas: {k.colas.join(", ") || "—"}
        </p>
      </div>

      {/* Datos de llamada Gral */}
      <h2 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold mb-3">Datos de llamada · general</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <KpiCard label="Ingresadas" value={formatInt(k.llamadas_ingresadas)} accent="cyan" />
        <KpiCard label="Contestadas" value={formatInt(k.contestadas)} hint={`${formatInt(k.abandonadas)} abandonadas`} accent="primary" />
        <KpiCard label="Nivel de Atención" value={formatPct(k.nivel_atencion_pct)} hint="contestadas / ingresadas" accent="cyan" />
        <KpiCard label="Nivel de Servicio" value={formatPct(k.sla_pct)} hint="SLA" accent="purple" />
        <KpiCard label="Abandono" value={formatPct(k.abandono_pct)} hint={`${formatInt(k.abandonadas)} llamadas`} accent="orange" />
        <KpiCard label="AHT" value={`${fmtMinSeg(k.aht_seg)} min`} hint={`ASA ${fmtMinSeg(k.asa_seg)}`} accent="secondary" />
      </div>

      {/* Evolución diaria */}
      <Section title="Evolución diaria" hint="Ingresadas, contestadas y abandonadas por día; línea = nivel de atención (%).">
        <SerieDia
          data={report.data.por_dia}
          bars={[
            { key: "oferta", name: "Ingresadas", color: "#00B2BF" },
            { key: "contestadas", name: "Contestadas", color: "#662483" },
            { key: "abandonadas", name: "Abandonadas", color: "#F39200" },
          ]}
          line={{ key: "nivel_atencion_pct", name: "Nivel atención %", color: "#E6332A" }}
        />
      </Section>

      {/* Distribución por hora */}
      <Section title="Distribución por franja horaria" hint="Llamadas ingresadas y contestadas por hora del día (acumulado del período).">
        <SerieDia
          data={report.data.por_hora}
          xKey="hora"
          bars={[
            { key: "oferta", name: "Ingresadas", color: "#00B2BF" },
            { key: "contestadas", name: "Contestadas", color: "#662483" },
          ]}
        />
      </Section>

      {/* Por cola (si hay más de una) */}
      {report.data.por_cola.length > 1 && (
        <Section title="Por cola de atención">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-brand-bg border-b border-brand-border">
                <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                  <th className="px-4 py-2.5 text-left">Cola</th>
                  <th className="px-4 py-2.5 text-right">Ingresadas</th>
                  <th className="px-4 py-2.5 text-right">Contestadas</th>
                  <th className="px-4 py-2.5 text-right">Abandonadas</th>
                  <th className="px-4 py-2.5 text-right">Atención</th>
                  <th className="px-4 py-2.5 text-right">Abandono</th>
                </tr>
              </thead>
              <tbody>
                {report.data.por_cola.map((c) => (
                  <tr key={c.cola} className="border-t border-brand-border">
                    <td className="px-4 py-2.5 font-semibold text-brand-ink">{c.cola}</td>
                    <td className="px-4 py-2.5 text-right">{formatInt(c.oferta)}</td>
                    <td className="px-4 py-2.5 text-right text-brand-cyan font-semibold">{formatInt(c.contestadas)}</td>
                    <td className="px-4 py-2.5 text-right text-brand-orange">{formatInt(c.abandonadas)}</td>
                    <td className="px-4 py-2.5 text-right">{formatPct(c.nivel_atencion_pct)}</td>
                    <td className="px-4 py-2.5 text-right">{formatPct(c.abandono_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Datos por operador */}
      <h2 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold mb-3">Datos de llamadas por operador</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Operadores activos" value={`${k.operadores_activos}`} accent="secondary" />
        <KpiCard label="Entrantes (total)" value={formatInt(k.total_entrantes_op)} accent="cyan" />
        <KpiCard label="Salientes (total)" value={formatInt(k.total_salientes_op)} accent="purple" />
        <KpiCard label="Auxiliares (total)" value={fmtHoras(k.aux_total_seg)} accent="orange" />
      </div>

      <Section title="Detalle por operador" hint="Entrantes, salientes, AHT promedio por interacción y tiempo en estados auxiliares.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-brand-bg border-b border-brand-border">
              <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                <th className="px-4 py-2.5 text-left">Operador</th>
                <th className="px-4 py-2.5 text-right">Entrantes</th>
                <th className="px-4 py-2.5 text-right">Salientes</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-right">AHT</th>
                <th className="px-4 py-2.5 text-right">Auxiliares</th>
              </tr>
            </thead>
            <tbody>
              {ops.map((o) => (
                <tr key={o.operador} className="border-t border-brand-border hover:bg-brand-bg-soft">
                  <td className="px-4 py-2.5 font-semibold text-brand-ink">{o.operador}</td>
                  <td className="px-4 py-2.5 text-right text-brand-cyan">{formatInt(o.entrantes)}</td>
                  <td className="px-4 py-2.5 text-right text-brand-purple">{formatInt(o.salientes)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">{formatInt(o.total)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmtMinSeg(o.aht_seg)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtHoras(o.aux_seg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Auxiliares */}
      {auxData.length > 0 && (
        <Section title="Auxiliares · tiempo por estado (equipo)" hint="Horas totales del equipo en cada estado auxiliar (no productivo).">
          <DistBar data={auxData} palette={["#F39200", "#E6332A", "#662483", "#00B2BF", "#94a3b8", "#0f172a"]} />
        </Section>
      )}
    </AppShell>
  );
}
