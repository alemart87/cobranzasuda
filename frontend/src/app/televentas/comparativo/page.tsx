"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { InsightsPanel } from "@/components/televentas/InsightsPanel";
import { apiFetch } from "@/lib/api";
import { formatGs, formatInt, formatPct } from "@/lib/format";
import { monthLabel } from "@/lib/month";

const ESTADO: Record<string, { label: string; cls: string }> = {
  nuevo: { label: "Nuevo", cls: "bg-brand-cyan/10 text-brand-cyan" },
  cayo: { label: "Cayó", cls: "bg-brand-primary/10 text-brand-primary" },
  subio: { label: "Subió", cls: "bg-emerald-100 text-emerald-700" },
  estable: { label: "Estable", cls: "bg-brand-bg text-brand-slate" },
};

export default function TeleventasTendenciasPage() {
  const [tend, setTend] = useState<any>(null);
  const [comp, setComp] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<any>("/api/v1/televentas/tendencias").catch(() => null),
      apiFetch<any>("/api/v1/televentas/comparativo").catch(() => null),
    ]).then(([t, c]) => { setTend(t); setComp(c); }).finally(() => setLoading(false));
  }, []);

  const meses: any[] = tend?.meses ?? [];
  const chartData = meses.map((m) => ({ ...m, label: m.mes }));
  const pctLbl = (v: any) => `${v}%`;
  const intLbl = (v: any) => formatInt(v as number);
  const mLbl = (v: any) => { const n = Number(v); return n >= 1e6 ? `${Math.round(n / 1e6)}M` : formatInt(n); };

  return (
    <AppShell>
      <div className="mb-2 text-xs text-brand-slate">
        <Link href="/televentas" className="hover:text-brand-primary">Televentas</Link>
        <span className="mx-2">/</span><span className="text-brand-ink font-semibold">Comparativo y tendencias</span>
      </div>
      <div className="mb-6">
        <h1 className="font-display text-3xl sm:text-4xl text-brand-ink uppercase">Comparativo y tendencias</h1>
        <p className="text-sm text-brand-slate mt-1">Evolución de varios meses: conversión, llamadas (total y promedio), agentes activos, contactabilidad y producción.</p>
      </div>

      {loading && <div className="text-brand-slate">Cargando…</div>}

      {!loading && meses.length < 2 && (
        <div className="card p-10 text-center text-brand-slate">
          Se necesitan al menos <b>dos meses publicados</b> para ver tendencias. Actualmente hay {meses.length}.
        </div>
      )}

      {!loading && meses.length >= 2 && (
        <>
          <InsightsPanel insights={tend?.insights} titulo="Tendencias detectadas" />

          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <ChartCard title="Conversión mensual (%)">
              <LineChart data={chartData} margin={{ top: 22, right: 16, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" fontSize={11} /><YAxis fontSize={11} />
                <Tooltip formatter={pctLbl} />
                <Line dataKey="conversion_pct" name="Conversión" stroke="#662483" strokeWidth={2.5} dot={{ r: 3 }}>
                  <LabelList dataKey="conversion_pct" position="top" formatter={pctLbl} fontSize={11} fontWeight={700} fill="#662483" />
                </Line>
              </LineChart>
            </ChartCard>

            <ChartCard title="Contactabilidad mensual (%)">
              <LineChart data={chartData} margin={{ top: 22, right: 16, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" fontSize={11} /><YAxis fontSize={11} />
                <Tooltip formatter={pctLbl} />
                <Line dataKey="contactabilidad" name="Contactabilidad" stroke="#00B2BF" strokeWidth={2.5} dot={{ r: 3 }}>
                  <LabelList dataKey="contactabilidad" position="top" formatter={pctLbl} fontSize={11} fontWeight={700} fill="#0891a3" />
                </Line>
              </LineChart>
            </ChartCard>

            <ChartCard title="Llamadas: total y promedio por asesor/día">
              <ComposedChart data={chartData} margin={{ top: 22, right: 8, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" fontSize={11} />
                <YAxis yAxisId="l" fontSize={11} /><YAxis yAxisId="r" orientation="right" fontSize={11} />
                <Tooltip />
                <Bar yAxisId="l" dataKey="total_llamadas" name="Total llamadas" fill="#CBD5E1" radius={[3, 3, 0, 0]}>
                  <LabelList dataKey="total_llamadas" position="top" formatter={intLbl} fontSize={10} fontWeight={600} fill="#64748b" />
                </Bar>
                <Line yAxisId="r" dataKey="llamadas_prom_asesor_dia" name="Prom./asesor/día" stroke="#E6332A" strokeWidth={2.5} dot={{ r: 3 }}>
                  <LabelList dataKey="llamadas_prom_asesor_dia" position="top" formatter={intLbl} fontSize={11} fontWeight={700} fill="#E6332A" />
                </Line>
              </ComposedChart>
            </ChartCard>

            <ChartCard title="Agentes activos y prima emitida">
              <ComposedChart data={chartData} margin={{ top: 22, right: 8, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" fontSize={11} />
                <YAxis yAxisId="l" fontSize={11} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
                <YAxis yAxisId="r" orientation="right" fontSize={11} />
                <Tooltip formatter={(v: any, n: any) => (n === "Prima emitida" ? formatGs(v as number) : v)} />
                <Bar yAxisId="l" dataKey="prima_emitida" name="Prima emitida" fill="#F39200" radius={[3, 3, 0, 0]}>
                  <LabelList dataKey="prima_emitida" position="top" formatter={mLbl} fontSize={10} fontWeight={600} fill="#b06f00" />
                </Bar>
                <Line yAxisId="r" dataKey="agentes_activos" name="Agentes activos" stroke="#0F1116" strokeWidth={2.5} dot={{ r: 3 }}>
                  <LabelList dataKey="agentes_activos" position="top" formatter={intLbl} fontSize={11} fontWeight={700} fill="#0F1116" />
                </Line>
              </ComposedChart>
            </ChartCard>
          </div>

          <section className="card overflow-x-auto mb-8">
            <table className="w-full text-sm min-w-[820px]">
              <thead className="bg-brand-bg border-b border-brand-border">
                <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                  <th className="px-3 py-2 text-left">Mes</th>
                  <th className="px-3 py-2 text-right">Llamadas</th>
                  <th className="px-3 py-2 text-right">Prom./día</th>
                  <th className="px-3 py-2 text-right">Prom./asesor</th>
                  <th className="px-3 py-2 text-right">Agentes</th>
                  <th className="px-3 py-2 text-right">Contacto %</th>
                  <th className="px-3 py-2 text-right">Pólizas</th>
                  <th className="px-3 py-2 text-right">Prima emitida</th>
                  <th className="px-3 py-2 text-right">Conversión %</th>
                </tr>
              </thead>
              <tbody>
                {meses.map((m) => (
                  <tr key={m.mes} className="border-t border-brand-border hover:bg-brand-bg-soft">
                    <td className="px-3 py-2 font-semibold text-brand-ink">{monthLabel(m.mes)}</td>
                    <td className="px-3 py-2 text-right">{formatInt(m.total_llamadas)}</td>
                    <td className="px-3 py-2 text-right">{formatInt(m.llamadas_prom_dia)}</td>
                    <td className="px-3 py-2 text-right">{formatInt(m.llamadas_prom_asesor_dia)}</td>
                    <td className="px-3 py-2 text-right">{formatInt(m.agentes_activos)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatPct(m.contactabilidad)}</td>
                    <td className="px-3 py-2 text-right">{formatInt(m.polizas_emitidas)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatGs(m.prima_emitida)}</td>
                    <td className="px-3 py-2 text-right font-mono text-brand-purple">{formatPct(m.conversion_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {comp?.disponible && (
            <section className="card p-6">
              <h2 className="font-display text-xl text-brand-ink uppercase mb-1">Por operador · {monthLabel(comp.mes_actual)} vs {monthLabel(comp.mes_previo)}</h2>
              <p className="text-xs text-brand-slate mb-4">Último mes contra el anterior.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead className="bg-brand-bg">
                    <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                      <th className="px-3 py-2 text-left">Operador</th>
                      <th className="px-3 py-2 text-center">Estado</th>
                      <th className="px-3 py-2 text-right">Llamadas</th>
                      <th className="px-3 py-2 text-right">Contacto %</th>
                      <th className="px-3 py-2 text-right">Conversión %</th>
                      <th className="px-3 py-2 text-right">Prima emitida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comp.por_operador.map((o: any) => {
                      const e = ESTADO[o.estado] ?? ESTADO.estable;
                      return (
                        <tr key={o.vendedor} className="border-t border-brand-border hover:bg-brand-bg-soft">
                          <td className="px-3 py-2 font-medium text-brand-ink">{o.vendedor}</td>
                          <td className="px-3 py-2 text-center"><span className={`text-[10px] uppercase tracking-wider2 font-bold px-1.5 py-0.5 rounded ${e.cls}`}>{e.label}</span></td>
                          <td className="px-3 py-2 text-right">{formatInt(o.llamadas_act)} <span className="text-brand-mist text-xs">/ {formatInt(o.llamadas_prev)}</span></td>
                          <td className="px-3 py-2 text-right font-mono">{formatPct(o.contacto_act)} <span className="text-brand-mist text-xs">/ {formatPct(o.contacto_prev)}</span></td>
                          <td className="px-3 py-2 text-right font-mono">{formatPct(o.conversion_act)} <span className="text-brand-mist text-xs">/ {formatPct(o.conversion_prev)}</span></td>
                          <td className="px-3 py-2 text-right font-semibold">{formatGs(o.prima_act)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <section className="card p-6">
      <h2 className="font-display text-lg text-brand-ink uppercase mb-4">{title}</h2>
      <ResponsiveContainer width="100%" height={240}>{children}</ResponsiveContainer>
    </section>
  );
}
