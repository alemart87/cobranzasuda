"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { PrintButton, PrintHeader } from "@/components/PrintButton";
import { InsightsPanel } from "@/components/televentas/InsightsPanel";
import { apiFetch } from "@/lib/api";
import { formatDate, formatInt, formatPct } from "@/lib/format";

interface Detail {
  id: string; period_month: string | null; generated_at: string;
  data: {
    kpis: any;
    por_vendedor: Array<any>;
    por_dia: Array<any>;
    por_hora: Array<{ hora: string; llamadas: number; contestadas: number }>;
    distribucion_duracion: Array<{ rango: string; cantidad: number; pct: number }>;
    insights: Array<any>;
  };
}

export default function TeleventasLlamadasDetailPage() {
  const params = useParams<{ id: string }>();
  const [report, setReport] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Detail>(`/api/v1/televentas/llamadas/reports/${params.id}`).then(setReport).catch((e) => setError(e.message));
  }, [params.id]);

  if (error) return <AppShell><div className="text-brand-primary">{error}</div></AppShell>;
  if (!report) return <AppShell><div className="text-brand-slate">Cargando…</div></AppShell>;
  const k = report.data.kpis;

  return (
    <AppShell>
      <PrintHeader titulo="Reporte de Llamadas · Televentas" subtitulo={`Período: ${report.period_month ?? "—"} · Generado: ${formatDate(report.generated_at)}`} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-brand-ink uppercase">Reporte de Llamadas</h1>
          <p className="text-sm text-brand-slate mt-1">Período: <b>{report.period_month ?? "—"}</b> · Generado: {formatDate(report.generated_at)}</p>
        </div>
        <PrintButton />
      </div>

      <InsightsPanel insights={report.data.insights} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KpiCard label="Total llamadas" value={formatInt(k.total_llamadas)} hint={`${formatInt(k.promedio_diario)} /día`} accent="primary" />
        <KpiCard label="Contestadas" value={formatInt(k.contestadas)} hint={`${formatPct(k.pct_contestadas)} contacto`} accent="cyan" />
        <KpiCard label="No contestadas" value={formatInt(k.no_contestadas)} accent="orange" />
        <KpiCard label="TMO (contestadas)" value={k.tmo_hms} accent="purple" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Prom. llamadas / asesor / día" value={formatInt(k.promedio_llamadas_asesor_dia)} hint="llamadas del día ÷ asesores activos" accent="primary" />
        <KpiCard label="Total hablado" value={`${k.total_talk_horas} hs`} accent="neutral" />
        <KpiCard label="Vendedores activos" value={formatInt(k.vendedores_activos)} accent="cyan" />
        <KpiCard label="Días operativos" value={formatInt(k.dias_operativos)} accent="neutral" />
      </div>

      <section className="card p-6 mb-6">
        <h2 className="font-display text-xl text-brand-ink uppercase mb-1">Llamadas por día</h2>
        <p className="text-xs text-brand-slate mb-4">Barras: contestadas / no contestadas. Línea: promedio de llamadas por asesor activo.</p>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={report.data.por_dia}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="fecha" fontSize={10} />
            <YAxis yAxisId="l" fontSize={11} />
            <YAxis yAxisId="r" orientation="right" fontSize={11} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="l" dataKey="contestadas" name="Contestadas" stackId="a" fill="#00B2BF" />
            <Bar yAxisId="l" dataKey="no_contestadas" name="No contestadas" stackId="a" fill="#F39200" radius={[3, 3, 0, 0]} />
            <Line yAxisId="r" dataKey="promedio_por_asesor" name="Prom./asesor" stroke="#662483" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </section>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <section className="card p-6">
          <h2 className="font-display text-xl text-brand-ink uppercase mb-4">Distribución de duración</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={report.data.distribucion_duracion} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" fontSize={11} />
              <YAxis type="category" dataKey="rango" fontSize={11} width={120} />
              <Tooltip formatter={(v: any, _n: any, p: any) => [`${formatInt(v as number)} (${p.payload.pct}%)`, "Llamadas"]} />
              <Bar dataKey="cantidad" fill="#00B2BF" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
        <section className="card p-6">
          <h2 className="font-display text-xl text-brand-ink uppercase mb-4">Curva horaria</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={report.data.por_hora}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hora" fontSize={10} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="contestadas" name="Contestadas" stackId="a" fill="#00B2BF" />
              <Bar dataKey="llamadas" name="Total" stackId="b" fill="#CBD5E1" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>

      <section className="card p-6">
        <h2 className="font-display text-xl text-brand-ink uppercase mb-4">Detalle por vendedor</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-bg">
              <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                <th className="px-3 py-2 text-left">Vendedor</th>
                <th className="px-3 py-2 text-right">Llamadas</th>
                <th className="px-3 py-2 text-right">Contest.</th>
                <th className="px-3 py-2 text-right">% Contacto</th>
                <th className="px-3 py-2 text-right">TMO</th>
                <th className="px-3 py-2 text-right">Días act.</th>
                <th className="px-3 py-2 text-right">Prom./día</th>
                <th className="px-3 py-2 text-left">Desde</th>
              </tr>
            </thead>
            <tbody>
              {report.data.por_vendedor.map((v) => (
                <tr key={v.vendedor} className="border-t border-brand-border hover:bg-brand-bg-soft">
                  <td className="px-3 py-2 font-medium text-brand-ink">{v.vendedor}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatInt(v.llamadas)}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{formatInt(v.contestadas)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatPct(v.pct_contestadas)}</td>
                  <td className="px-3 py-2 text-right font-mono">{v.tmo_hms}</td>
                  <td className="px-3 py-2 text-right">{formatInt(v.dias_activos)}</td>
                  <td className="px-3 py-2 text-right">{formatInt(v.promedio_diario)}</td>
                  <td className="px-3 py-2 text-brand-slate">{v.primer_dia ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
