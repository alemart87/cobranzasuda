"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { apiFetch } from "@/lib/api";
import { formatDate, formatInt } from "@/lib/format";

interface GestionReportDetail {
  id: string;
  period_month: string | null;
  generated_at: string;
  total_gestiones: number;
  asesores_activos: number;
  promesas_totales: number;
  cobros_totales: number;
  promesas_cumplidas: number;
  pct_promesas_cumplidas: number;
  data: {
    kpis: any;
    subestados: Array<{ subestado: string; cantidad: number; pct: number }>;
    asesores: Array<any>;
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

  const k = report.data.kpis;
  const subPieData = report.data.subestados.map((s) => ({ name: s.subestado, value: s.cantidad }));

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-display text-3xl text-brand-ink uppercase">Reporte de Gestiones</h1>
        <p className="text-sm text-brand-slate mt-1">
          Período: <b>{report.period_month ?? "—"}</b> · Generado: {formatDate(report.generated_at)}
        </p>
      </div>

      {/* KPIs hero */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Total gestiones" value={formatInt(k.total_gestiones)} accent="primary" />
        <KpiCard label="Promesas obtenidas" value={formatInt(k.promesas_totales)} accent="cyan" />
        <KpiCard label="Cobros directos" value={formatInt(k.cobros_totales)} accent="orange" />
        <KpiCard
          label="% promesas cumplidas"
          value={`${k.pct_promesas_cumplidas} %`}
          hint={`${k.promesas_cumplidas} de ${k.leads_unicos_con_promesa}`}
          accent="purple"
        />
      </div>

      {/* 1. Distribución por subestado */}
      <section className="card p-6 mb-6">
        <h2 className="font-display text-xl text-brand-ink uppercase mb-1">1. Distribución por subestado</h2>
        <p className="text-xs text-brand-slate mb-4">Total {formatInt(k.total_gestiones)} gestiones en {k.asesores_activos} asesores.</p>
        <div className="grid md:grid-cols-2 gap-6 items-center">
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie data={subPieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={120} paddingAngle={2}>
                {subPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5">
            {report.data.subestados.map((s, i) => (
              <div key={s.subestado} className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                <span className="flex-1 text-brand-graphite">{s.subestado}</span>
                <span className="font-semibold text-brand-ink">{formatInt(s.cantidad)}</span>
                <span className="text-xs text-brand-slate w-12 text-right">{s.pct.toFixed(1)} %</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2. Gestiones por operador */}
      <section className="card p-6 mb-6">
        <h2 className="font-display text-xl text-brand-ink uppercase mb-4">2. Gestiones por operador</h2>
        <ResponsiveContainer width="100%" height={Math.max(report.data.asesores.length * 40 + 60, 200)}>
          <BarChart
            data={report.data.asesores.map((a) => ({ ...a, short: a.usuario.length > 30 ? a.usuario.slice(0, 28) + "…" : a.usuario }))}
            layout="vertical"
            margin={{ left: 10, right: 30 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" fontSize={11} />
            <YAxis type="category" dataKey="short" width={220} fontSize={11} />
            <Tooltip />
            <Bar dataKey="gestiones" fill="#0F1116" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* 3. Subestados por operador (apilado) */}
      <section className="card p-6 mb-6">
        <h2 className="font-display text-xl text-brand-ink uppercase mb-1">3. Subestados por operador</h2>
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

      {/* 4. Tabla detalle asesores */}
      <section className="card p-6 mb-6">
        <h2 className="font-display text-xl text-brand-ink uppercase mb-1">4. Detalle por asesor</h2>
        <p className="text-xs text-brand-slate mb-4">
          % promesas cumplidas = leads con promesa que fueron cobrados después / leads únicos con promesa.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-brand-bg">
              <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                <th className="px-3 py-2 text-left">Asesor</th>
                <th className="px-3 py-2 text-right">Gestiones</th>
                <th className="px-3 py-2 text-right">Contactos efect.</th>
                <th className="px-3 py-2 text-right">Promesas</th>
                <th className="px-3 py-2 text-right">% prom. cumpl.</th>
                <th className="px-3 py-2 text-right">Cobros</th>
                <th className="px-3 py-2 text-right">% cobros / contactos</th>
                <th className="px-3 py-2 text-right">% cierre</th>
              </tr>
            </thead>
            <tbody>
              {report.data.asesores.map((a) => (
                <tr key={a.usuario} className="border-b border-brand-border hover:bg-brand-bg-soft">
                  <td className="px-3 py-2 font-semibold text-brand-secondary">{a.usuario}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatInt(a.gestiones)}</td>
                  <td className="px-3 py-2 text-right">{formatInt(a.contactos_efectivos)}</td>
                  <td className="px-3 py-2 text-right text-brand-cyan font-semibold">{formatInt(a.promesas)}</td>
                  <td className="px-3 py-2 text-right font-mono">{a.pct_promesas_cumplidas.toFixed(1)} %</td>
                  <td className="px-3 py-2 text-right text-brand-primary font-semibold">{formatInt(a.cobrados)}</td>
                  <td className="px-3 py-2 text-right font-mono">{a.pct_cobros_sobre_contactos.toFixed(1)} %</td>
                  <td className="px-3 py-2 text-right font-mono">{a.pct_cierre.toFixed(1)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. Serie diaria */}
      {report.data.serie_diaria.length > 0 && (
        <section className="card p-6 mb-6">
          <h2 className="font-display text-xl text-brand-ink uppercase mb-4">5. Gestiones por día</h2>
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
