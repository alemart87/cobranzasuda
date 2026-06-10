"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { PrintButton, PrintHeader } from "@/components/PrintButton";
import { apiFetch } from "@/lib/api";
import { formatDate, formatInt } from "@/lib/format";

interface FunnelMetrics {
  gestiones: number;
  contactos_efectivos: number;
  pct_contactos_efectivos: number;
  promesas: number;
  pct_promesas_sobre_contactos: number;
  promesas_cumplidas: number;
  pct_promesas_cumplidas: number;
}

interface GestionReportDetail {
  id: string;
  period_month: string | null;
  generated_at: string;
  total_gestiones: number;
  data: {
    kpis: any;
    funnel_equipo: FunnelMetrics;
    subestados: Array<{ subestado: string; cantidad: number; pct: number }>;
    asesores: Array<FunnelMetrics & { usuario: string; subestados: Record<string, number> }>;
    campanas: Array<FunnelMetrics & { campana: string }>;
    matrix_subestados: { subestados: string[]; data: Array<Record<string, any>> };
    serie_diaria: Array<{ fecha: string; gestiones: number }>;
  };
}

const PIE_COLORS = [
  "#9CA3AF", "#00B2BF", "#E6332A", "#F39200", "#662483",
  "#0F1116", "#10B981", "#EC4899", "#8B5CF6", "#FB923C",
];

export default function GestionReportDetailPage() {
  const params = useParams<{ id: string }>();
  const [report, setReport] = useState<GestionReportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<GestionReportDetail>(`/api/v1/gestiones/reports/${params.id}`)
      .then(setReport)
      .catch((e) => setError(e.message));
  }, [params.id]);

  if (error) return <AppShell><div className="text-brand-primary">{error}</div></AppShell>;
  if (!report) return <AppShell><div className="text-brand-slate">Cargando…</div></AppShell>;

  const f = report.data.funnel_equipo;
  const subPieData = report.data.subestados.map((s) => ({ name: s.subestado, value: s.cantidad }));

  return (
    <AppShell>
      <PrintHeader titulo="Reporte de Gestiones" subtitulo={`Período: ${report.period_month ?? "—"} · Generado: ${formatDate(report.generated_at)}`} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-brand-ink uppercase">Reporte de Gestiones</h1>
          <p className="text-sm text-brand-slate mt-1">
            Período: <b>{report.period_month ?? "—"}</b> · Generado: {formatDate(report.generated_at)}
          </p>
        </div>
        <PrintButton />
      </div>

      {/* KPIs hero del funnel */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Total gestiones" value={formatInt(f.gestiones)} accent="secondary" />
        <KpiCard
          label="Contactos efectivos"
          value={formatInt(f.contactos_efectivos)}
          hint={`${f.pct_contactos_efectivos} % sobre gestiones`}
          accent="primary"
        />
        <KpiCard
          label="Promesas obtenidas"
          value={formatInt(f.promesas)}
          hint={`${f.pct_promesas_sobre_contactos} % sobre contactos`}
          accent="cyan"
        />
        <KpiCard
          label="Promesas cumplidas"
          value={formatInt(f.promesas_cumplidas)}
          hint={`${f.pct_promesas_cumplidas} % sobre promesas`}
          accent="orange"
        />
      </div>

      {/* Funnel visual */}
      <section className="card p-6 mb-6">
        <h2 className="font-display text-xl text-brand-ink uppercase mb-1">Funnel del equipo</h2>
        <p className="text-xs text-brand-slate mb-5">
          Gestiones → Contactos efectivos → Promesas obtenidas → Promesas cumplidas
        </p>
        <FunnelBars metrics={f} />
      </section>

      {/* Distribución por subestado */}
      <section className="card p-6 mb-6">
        <h2 className="font-display text-xl text-brand-ink uppercase mb-1">Distribución por subestado</h2>
        <p className="text-xs text-brand-slate mb-4">
          Composición de las {formatInt(f.gestiones)} gestiones del período.
        </p>
        <div className="grid md:grid-cols-2 gap-6 items-center">
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie data={subPieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={120} paddingAngle={2}>
                {subPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {report.data.subestados.map((s, i) => (
              <div key={s.subestado} className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                <span className="flex-1 text-brand-graphite">{s.subestado}</span>
                <span className="font-semibold text-brand-ink">{formatInt(s.cantidad)}</span>
                <span className="text-xs text-brand-slate w-12 text-right">{s.pct.toFixed(1)} %</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Subestados por operador (apilado) */}
      <section className="card p-6 mb-6">
        <h2 className="font-display text-xl text-brand-ink uppercase mb-1">Subestados por operador</h2>
        <p className="text-xs text-brand-slate mb-4">Composición de cada gestión por tipo de resultado.</p>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={report.data.matrix_subestados.data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="usuario" fontSize={11} interval={0} />
            <YAxis fontSize={11} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {report.data.matrix_subestados.subestados.map((s, i) => (
              <Bar key={s} dataKey={s} stackId="a" fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* Detalle por asesor — funnel completo */}
      <section className="card p-6 mb-6">
        <h2 className="font-display text-xl text-brand-ink uppercase mb-1">Funnel por asesor</h2>
        <p className="text-xs text-brand-slate mb-4">
          Cada % se calcula sobre el paso anterior del funnel.
        </p>
        <FunnelTable rows={report.data.asesores.map((a) => ({ ...a, label: a.usuario }))} labelHeader="Asesor" />
      </section>

      {/* Detalle por base de datos / campaña */}
      <section className="card p-6 mb-6">
        <h2 className="font-display text-xl text-brand-ink uppercase mb-1">Funnel por base de datos</h2>
        <p className="text-xs text-brand-slate mb-4">
          Comparativo de performance por base / campaña asignada.
        </p>
        <FunnelTable rows={report.data.campanas.map((c) => ({ ...c, label: c.campana }))} labelHeader="Base de datos / Campaña" />
      </section>

      {/* Serie diaria */}
      {report.data.serie_diaria.length > 0 && (
        <section className="card p-6 mb-6">
          <h2 className="font-display text-xl text-brand-ink uppercase mb-4">Gestiones por día</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={report.data.serie_diaria}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="fecha" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Bar dataKey="gestiones" fill="#E6332A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}
    </AppShell>
  );
}

function FunnelBars({ metrics: f }: { metrics: FunnelMetrics }) {
  const max = Math.max(f.gestiones, 1);
  const w = (v: number) => `${Math.max((v / max) * 100, 6)}%`;
  const rows = [
    { label: "Total gestiones", value: f.gestiones, pct: 100, hint: "Base del funnel", color: "bg-brand-ink" },
    { label: "Contactos efectivos", value: f.contactos_efectivos, pct: f.pct_contactos_efectivos, hint: `${f.pct_contactos_efectivos} % sobre gestiones`, color: "bg-brand-primary" },
    { label: "Promesas obtenidas", value: f.promesas, pct: f.pct_promesas_sobre_contactos, hint: `${f.pct_promesas_sobre_contactos} % sobre contactos`, color: "bg-brand-cyan" },
    { label: "Promesas cumplidas", value: f.promesas_cumplidas, pct: f.pct_promesas_cumplidas, hint: `${f.pct_promesas_cumplidas} % sobre promesas`, color: "bg-brand-orange" },
  ];
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-sm font-medium text-brand-graphite">{r.label}</span>
            <span className="text-sm font-bold text-brand-ink">{r.value.toLocaleString("es-PY")}</span>
          </div>
          <div className="h-7 bg-brand-bg rounded">
            <div className={`h-full rounded flex items-center justify-end px-3 text-xs text-white ${r.color}`} style={{ width: w(r.value) }}>
              {r.hint}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FunnelTable({
  rows,
  labelHeader,
}: {
  rows: Array<FunnelMetrics & { label: string }>;
  labelHeader: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-brand-bg">
          <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
            <th className="px-3 py-2 text-left">{labelHeader}</th>
            <th className="px-3 py-2 text-right">Gestiones</th>
            <th className="px-3 py-2 text-right">Contactos Efect.</th>
            <th className="px-3 py-2 text-right">% Contact.</th>
            <th className="px-3 py-2 text-right">Promesas</th>
            <th className="px-3 py-2 text-right">% Promesas</th>
            <th className="px-3 py-2 text-right">Cumplidas</th>
            <th className="px-3 py-2 text-right">% Cumpl.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-brand-border hover:bg-brand-bg-soft">
              <td className="px-3 py-2 font-semibold text-brand-ink max-w-md truncate" title={r.label}>{r.label}</td>
              <td className="px-3 py-2 text-right font-semibold">{r.gestiones.toLocaleString("es-PY")}</td>
              <td className="px-3 py-2 text-right">{r.contactos_efectivos.toLocaleString("es-PY")}</td>
              <td className="px-3 py-2 text-right font-mono text-brand-primary">{r.pct_contactos_efectivos.toFixed(1)} %</td>
              <td className="px-3 py-2 text-right text-brand-cyan font-semibold">{r.promesas.toLocaleString("es-PY")}</td>
              <td className="px-3 py-2 text-right font-mono text-brand-cyan">{r.pct_promesas_sobre_contactos.toFixed(1)} %</td>
              <td className="px-3 py-2 text-right text-brand-orange font-semibold">{r.promesas_cumplidas.toLocaleString("es-PY")}</td>
              <td className="px-3 py-2 text-right font-mono text-brand-orange">{r.pct_promesas_cumplidas.toFixed(1)} %</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
