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
import { downloadCsv } from "@/lib/csv";
import { formatDate, formatInt } from "@/lib/format";

interface DrillCliente {
  cliente: string | null; poliza: string | null; campana: string | null;
  asesor: string | null; estado: string | null; subestado: string | null; fecha: string | null;
}

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
  const [drill, setDrill] = useState<{ subestado: string; clientes: DrillCliente[]; loading: boolean; error?: string } | null>(null);

  useEffect(() => {
    apiFetch<GestionReportDetail>(`/api/v1/gestiones/reports/${params.id}`)
      .then(setReport)
      .catch((e) => setError(e.message));
  }, [params.id]);

  const openDrill = async (subestado: string) => {
    if (!subestado) return;
    setDrill({ subestado, clientes: [], loading: true });
    try {
      const d = await apiFetch<{ clientes: DrillCliente[] }>(
        `/api/v1/gestiones/reports/${params.id}/clientes?subestado=${encodeURIComponent(subestado)}`,
      );
      setDrill({ subestado, clientes: d.clientes, loading: false });
    } catch (e: any) {
      setDrill({ subestado, clientes: [], loading: false, error: e.message });
    }
  };

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
          <span className="text-brand-cyan font-medium"> Clickeá un subestado para ver y descargar los clientes.</span>
        </p>
        <div className="grid md:grid-cols-2 gap-6 items-center">
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie data={subPieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={120} paddingAngle={2}
                onClick={(d: any) => openDrill(d?.name)} className="cursor-pointer">
                {subPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {report.data.subestados.map((s, i) => (
              <button key={s.subestado} onClick={() => openDrill(s.subestado)}
                className="w-full flex items-center gap-2 text-sm text-left px-2 py-1.5 rounded hover:bg-brand-bg transition-colors group">
                <span className="w-3 h-3 rounded shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                <span className="flex-1 text-brand-graphite group-hover:text-brand-cyan">{s.subestado}</span>
                <span className="font-semibold text-brand-ink">{formatInt(s.cantidad)}</span>
                <span className="text-xs text-brand-slate w-12 text-right">{s.pct.toFixed(1)} %</span>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-brand-mist group-hover:text-brand-cyan"><path d="m9 18 6-6-6-6" /></svg>
              </button>
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

      {/* Modal drilldown de clientes por subestado */}
      {drill && (
        <div className="no-print fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setDrill(null)}>
          <div className="card w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-brand-border">
              <div>
                <h3 className="font-display text-lg text-brand-ink uppercase leading-tight">Clientes · {drill.subestado}</h3>
                <p className="text-xs text-brand-slate">{drill.loading ? "Cargando…" : `${formatInt(drill.clientes.length)} gestión(es)`}</p>
              </div>
              <div className="flex items-center gap-2">
                {drill.clientes.length > 0 && (
                  <button
                    onClick={() => downloadCsv(
                      `clientes_${drill.subestado.replace(/[^a-z0-9]+/gi, "_")}_${report.period_month ?? ""}`,
                      drill.clientes,
                      [
                        { key: "cliente", label: "Cliente" }, { key: "poliza", label: "Póliza" },
                        { key: "campana", label: "Campaña" }, { key: "asesor", label: "Asesor" },
                        { key: "estado", label: "Estado" }, { key: "subestado", label: "Subestado" },
                        { key: "fecha", label: "Fecha" },
                      ],
                    )}
                    className="btn-primary text-xs inline-flex items-center gap-1.5"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></svg>
                    Descargar CSV
                  </button>
                )}
                <button onClick={() => setDrill(null)} className="text-brand-mist hover:text-brand-ink text-xl leading-none px-1">×</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {drill.error && <p className="p-6 text-brand-primary text-sm">{drill.error}</p>}
              {!drill.loading && !drill.error && drill.clientes.length === 0 && (
                <p className="p-8 text-center text-brand-slate text-sm">
                  Sin detalle de clientes para este subestado. Si el reporte se procesó con una versión anterior, volvé a subir el archivo de Gestiones.
                </p>
              )}
              {drill.clientes.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="bg-brand-bg border-b border-brand-border sticky top-0">
                    <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                      <th className="px-4 py-2.5 text-left">Cliente</th>
                      <th className="px-4 py-2.5 text-left">Póliza</th>
                      <th className="px-4 py-2.5 text-left">Campaña</th>
                      <th className="px-4 py-2.5 text-left">Asesor</th>
                      <th className="px-4 py-2.5 text-left">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drill.clientes.map((c, i) => (
                      <tr key={i} className="border-t border-brand-border hover:bg-brand-bg-soft">
                        <td className="px-4 py-2 font-medium text-brand-ink">{c.cliente || "—"}</td>
                        <td className="px-4 py-2 text-brand-slate">{c.poliza || "—"}</td>
                        <td className="px-4 py-2 text-brand-slate">{c.campana || "—"}</td>
                        <td className="px-4 py-2 text-brand-slate">{c.asesor || "—"}</td>
                        <td className="px-4 py-2 text-brand-slate">{c.fecha || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
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
