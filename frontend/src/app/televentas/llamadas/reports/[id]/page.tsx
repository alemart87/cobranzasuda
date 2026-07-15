"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { PrintButton, PrintHeader } from "@/components/PrintButton";
import { apiFetch } from "@/lib/api";
import { formatDate, formatInt, formatPct } from "@/lib/format";

interface Detail {
  id: string; period_month: string | null; generated_at: string;
  data: {
    kpis: any;
    por_vendedor: Array<any>;
    por_dia: Array<{ fecha: string; llamadas: number; contestadas: number; no_contestadas: number }>;
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KpiCard label="Total llamadas" value={formatInt(k.total_llamadas)} hint={`${formatInt(k.promedio_diario)} /día`} accent="primary" />
        <KpiCard label="Contestadas" value={formatInt(k.contestadas)} hint={`${formatPct(k.pct_contestadas)}`} accent="cyan" />
        <KpiCard label="No contestadas" value={formatInt(k.no_contestadas)} accent="orange" />
        <KpiCard label="TMO (contestadas)" value={k.tmo_hms} accent="purple" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Total hablado" value={`${k.total_talk_horas} hs`} accent="neutral" />
        <KpiCard label="Vendedores activos" value={formatInt(k.vendedores_activos)} accent="cyan" />
        <KpiCard label="Días operativos" value={formatInt(k.dias_operativos)} accent="neutral" />
        <KpiCard label="Umbral contestada" value={`${k.umbral_contestada_seg}s`} accent="neutral" />
      </div>

      <section className="card p-6 mb-6">
        <h2 className="font-display text-xl text-brand-ink uppercase mb-4">Llamadas por día</h2>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={report.data.por_dia}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="fecha" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="contestadas" name="Contestadas" stackId="a" fill="#00B2BF" radius={[0, 0, 0, 0]} />
            <Bar dataKey="no_contestadas" name="No contestadas" stackId="a" fill="#F39200" radius={[3, 3, 0, 0]} />
            <Line dataKey="llamadas" name="Total" stroke="#0F1116" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </section>

      <section className="card p-6">
        <h2 className="font-display text-xl text-brand-ink uppercase mb-4">Detalle por vendedor</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-bg">
              <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                <th className="px-3 py-2 text-left">Vendedor</th>
                <th className="px-3 py-2 text-right">Llamadas</th>
                <th className="px-3 py-2 text-right">Contestadas</th>
                <th className="px-3 py-2 text-right">No contest.</th>
                <th className="px-3 py-2 text-right">% Contest.</th>
                <th className="px-3 py-2 text-right">TMO</th>
              </tr>
            </thead>
            <tbody>
              {report.data.por_vendedor.map((v) => (
                <tr key={v.vendedor} className="border-t border-brand-border hover:bg-brand-bg-soft">
                  <td className="px-3 py-2 font-medium text-brand-ink">{v.vendedor}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatInt(v.llamadas)}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{formatInt(v.contestadas)}</td>
                  <td className="px-3 py-2 text-right text-brand-orange">{formatInt(v.no_contestadas)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatPct(v.pct_contestadas)}</td>
                  <td className="px-3 py-2 text-right font-mono">{v.tmo_hms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
