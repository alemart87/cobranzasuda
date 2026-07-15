"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Bar, Cell, ComposedChart, CartesianGrid, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { PrintButton, PrintHeader } from "@/components/PrintButton";
import { apiFetch } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { formatDate, formatGs, formatInt, formatPct } from "@/lib/format";

const PIE = ["#F39200", "#00B2BF", "#E6332A", "#662483", "#10B981", "#0F1116", "#EC4899", "#8B5CF6"];

interface Poliza { poliza: string | null; asegurado: string | null; producto: string | null; vendedor: string | null; canal: string | null; prima: number; suma_asegurada: number; tipo: string; fecha: string | null; }
interface Detail {
  id: string; period_month: string | null; generated_at: string;
  data: { kpis: any; por_producto: any[]; por_vendedor: any[]; por_canal: any[]; por_cobrador: any[]; por_dia: any[]; };
}

export default function TeleventasProduccionDetailPage() {
  const params = useParams<{ id: string }>();
  const [report, setReport] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drill, setDrill] = useState<{ titulo: string; q: string; polizas: Poliza[]; loading: boolean } | null>(null);

  useEffect(() => {
    apiFetch<Detail>(`/api/v1/televentas/produccion/reports/${params.id}`).then(setReport).catch((e) => setError(e.message));
  }, [params.id]);

  const openDrill = async (titulo: string, q: string) => {
    setDrill({ titulo, q, polizas: [], loading: true });
    try {
      const d = await apiFetch<{ polizas: Poliza[] }>(`/api/v1/televentas/produccion/reports/${params.id}/polizas?${q}`);
      setDrill({ titulo, q, polizas: d.polizas, loading: false });
    } catch {
      setDrill({ titulo, q, polizas: [], loading: false });
    }
  };

  if (error) return <AppShell><div className="text-brand-primary">{error}</div></AppShell>;
  if (!report) return <AppShell><div className="text-brand-slate">Cargando…</div></AppShell>;
  const k = report.data.kpis;
  const pieProducto = report.data.por_producto.map((p) => ({ name: p.producto, value: p.prima }));

  return (
    <AppShell>
      <PrintHeader titulo="Reporte de Producción · Televentas" subtitulo={`Período: ${report.period_month ?? "—"} · Generado: ${formatDate(report.generated_at)}`} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-brand-ink uppercase">Reporte de Producción</h1>
          <p className="text-sm text-brand-slate mt-1">Período: <b>{report.period_month ?? "—"}</b> · Generado: {formatDate(report.generated_at)}</p>
        </div>
        <PrintButton />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KpiCard label="Pólizas emitidas" value={formatInt(k.polizas_emitidas)} accent="primary" />
        <KpiCard label="Prima emitida" value={formatGs(k.prima_emitida)} accent="cyan" />
        <KpiCard label="Ticket promedio" value={formatGs(k.ticket_promedio)} accent="purple" />
        <KpiCard label="Suma asegurada" value={formatGs(k.suma_asegurada_total)} accent="neutral" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Pólizas anuladas" value={formatInt(k.polizas_anuladas)} hint={formatGs(k.prima_anulada)} accent="orange" />
        <KpiCard label="Prima neta" value={formatGs(k.prima_neta)} accent="cyan" />
        <KpiCard label="Días productivos" value={`${k.dias_productivos} / ${k.dias_calendario}`} hint={`${k.dias_no_productivos} sin ventas`} accent="primary" />
        <KpiCard label="Vendedores activos" value={formatInt(k.vendedores_activos)} accent="neutral" />
      </div>

      <section className="card p-6 mb-6">
        <h2 className="font-display text-xl text-brand-ink uppercase mb-4">Producción por día</h2>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={report.data.por_dia}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="fecha" fontSize={11} />
            <YAxis yAxisId="l" fontSize={11} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
            <YAxis yAxisId="r" orientation="right" fontSize={11} />
            <Tooltip formatter={(v: any, n: any) => (n === "Prima" ? formatGs(v as number) : v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="l" dataKey="prima" name="Prima" fill="#F39200" radius={[3, 3, 0, 0]} />
            <Line yAxisId="r" dataKey="polizas" name="Pólizas" stroke="#0F1116" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </section>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <section className="card p-6">
          <h2 className="font-display text-xl text-brand-ink uppercase mb-1">Tipos de póliza vendidos</h2>
          <p className="text-xs text-brand-slate mb-4">Clickeá un producto para ver/descargar las pólizas.</p>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pieProducto} dataKey="value" nameKey="name" innerRadius={55} outerRadius={110} paddingAngle={2}
                onClick={(d: any) => openDrill(`Producto · ${d?.name}`, `producto=${encodeURIComponent(d?.name)}&tipo=emitidas`)} className="cursor-pointer">
                {pieProducto.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
              </Pie>
              <Tooltip formatter={(v: any) => formatGs(v as number)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-2">
            {report.data.por_producto.map((p, i) => (
              <button key={p.producto} onClick={() => openDrill(`Producto · ${p.producto}`, `producto=${encodeURIComponent(p.producto)}&tipo=emitidas`)}
                className="w-full flex items-center gap-2 text-sm text-left px-2 py-1.5 rounded hover:bg-brand-bg group">
                <span className="w-3 h-3 rounded shrink-0" style={{ background: PIE[i % PIE.length] }} />
                <span className="flex-1 text-brand-graphite group-hover:text-brand-primary">{p.producto}</span>
                <span className="font-semibold text-brand-ink">{formatInt(p.polizas)}</span>
                <span className="text-xs text-brand-slate w-28 text-right">{formatGs(p.prima)}</span>
                <span className="text-xs text-brand-slate w-12 text-right">{formatPct(p.pct)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="card p-6">
          <h2 className="font-display text-xl text-brand-ink uppercase mb-4">Producción por canal / cobrador</h2>
          <h3 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold mb-1">Canal</h3>
          <div className="space-y-1 mb-4">
            {report.data.por_canal.map((c) => (
              <div key={c.canal} className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-brand-graphite">{c.canal}</span>
                <span className="font-semibold text-brand-ink">{formatInt(c.polizas)}</span>
                <span className="text-xs text-brand-slate w-28 text-right">{formatGs(c.prima)}</span>
              </div>
            ))}
          </div>
          <h3 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold mb-1">Medio de cobro</h3>
          <div className="space-y-1">
            {report.data.por_cobrador.map((c) => (
              <div key={c.cobrador} className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-brand-graphite">{c.cobrador}</span>
                <span className="font-semibold text-brand-ink">{formatInt(c.polizas)}</span>
                <span className="text-xs text-brand-slate w-28 text-right">{formatGs(c.prima)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card p-6">
        <h2 className="font-display text-xl text-brand-ink uppercase mb-1">Ranking por vendedor</h2>
        <p className="text-xs text-brand-slate mb-4">Clickeá un vendedor para ver/descargar sus pólizas.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-bg">
              <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                <th className="px-3 py-2 text-left">Vendedor</th>
                <th className="px-3 py-2 text-right">Pólizas</th>
                <th className="px-3 py-2 text-right">Prima emitida</th>
                <th className="px-3 py-2 text-right">Ticket</th>
                <th className="px-3 py-2 text-right">Anuladas</th>
                <th className="px-3 py-2 text-right">Prima anulada</th>
              </tr>
            </thead>
            <tbody>
              {report.data.por_vendedor.map((v) => (
                <tr key={v.vendedor} onClick={() => openDrill(`Vendedor · ${v.vendedor}`, `vendedor=${encodeURIComponent(v.vendedor)}`)}
                  className="border-t border-brand-border hover:bg-brand-bg-soft cursor-pointer">
                  <td className="px-3 py-2 font-medium text-brand-ink">{v.vendedor}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatInt(v.polizas)}</td>
                  <td className="px-3 py-2 text-right text-emerald-700 font-semibold">{formatGs(v.prima_emitida)}</td>
                  <td className="px-3 py-2 text-right">{formatGs(v.ticket)}</td>
                  <td className="px-3 py-2 text-right text-brand-orange">{formatInt(v.polizas_anuladas)}</td>
                  <td className="px-3 py-2 text-right text-brand-orange">{formatGs(v.prima_anulada)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {drill && (
        <div className="no-print fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setDrill(null)}>
          <div className="card w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-brand-border">
              <div>
                <h3 className="font-display text-lg text-brand-ink uppercase leading-tight">{drill.titulo}</h3>
                <p className="text-xs text-brand-slate">{drill.loading ? "Cargando…" : `${formatInt(drill.polizas.length)} póliza(s)`}</p>
              </div>
              <div className="flex items-center gap-2">
                {drill.polizas.length > 0 && (
                  <button onClick={() => downloadCsv(`polizas_${drill.titulo.replace(/[^a-z0-9]+/gi, "_")}`, drill.polizas, [
                    { key: "poliza", label: "Póliza" }, { key: "asegurado", label: "Asegurado" }, { key: "producto", label: "Producto" },
                    { key: "vendedor", label: "Vendedor" }, { key: "canal", label: "Canal" }, { key: "prima", label: "Prima" },
                    { key: "tipo", label: "Tipo" }, { key: "fecha", label: "Fecha" },
                  ])} className="btn-primary text-xs">Descargar CSV</button>
                )}
                <button onClick={() => setDrill(null)} className="text-brand-mist hover:text-brand-ink text-xl leading-none px-1">×</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {!drill.loading && drill.polizas.length === 0 && <p className="p-8 text-center text-brand-slate text-sm">Sin pólizas para este filtro.</p>}
              {drill.polizas.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="bg-brand-bg border-b border-brand-border sticky top-0">
                    <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                      <th className="px-4 py-2.5 text-left">Póliza</th>
                      <th className="px-4 py-2.5 text-left">Asegurado</th>
                      <th className="px-4 py-2.5 text-left">Producto</th>
                      <th className="px-4 py-2.5 text-right">Prima</th>
                      <th className="px-4 py-2.5 text-left">Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drill.polizas.map((p, i) => (
                      <tr key={i} className="border-t border-brand-border hover:bg-brand-bg-soft">
                        <td className="px-4 py-2 text-brand-slate">{p.poliza || "—"}</td>
                        <td className="px-4 py-2 font-medium text-brand-ink">{p.asegurado || "—"}</td>
                        <td className="px-4 py-2 text-brand-slate">{p.producto || "—"}</td>
                        <td className={`px-4 py-2 text-right font-mono ${p.tipo === "anulada" ? "text-brand-orange" : ""}`}>{formatGs(p.prima)}</td>
                        <td className="px-4 py-2">{p.tipo === "anulada" ? <span className="badge-neutral">Anulada</span> : <span className="badge-success">Emitida</span>}</td>
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
