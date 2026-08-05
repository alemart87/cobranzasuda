"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { MonthNavigator } from "@/components/MonthNavigator";
import { apiFetch, getUser } from "@/lib/api";
import { formatGs, formatInt, formatPct } from "@/lib/format";
import { monthLabel } from "@/lib/month";

interface Overview {
  available_months: string[];
  month: string | null;
  overview: any | null;
  tiene_llamadas: boolean;
  tiene_produccion: boolean;
}

const MOTIVO_LABEL: Record<string, string> = {
  baja_produccion: "Baja producción",
  bajas_llamadas: "Bajas llamadas",
};

function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold mb-3">{children}</h2>;
}

export default function TeleventasHubPage() {
  const [user, setUser] = useState<any>(null);
  const [ov, setOv] = useState<Overview | null>(null);
  const [month, setMonthState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = (m?: string | null) => {
    setLoading(true);
    apiFetch<Overview>(`/api/v1/televentas/overview${m ? `?month=${m}` : ""}`)
      .then((d) => { setOv(d); setMonthState(d.month); })
      .finally(() => setLoading(false));
  };

  const [canUseAgent, setCanUseAgent] = useState(false);
  useEffect(() => {
    setUser(getUser());
    load();
    apiFetch<{ can_use_agent?: boolean }>("/api/v1/auth/me").then((me) => setCanUseAgent(!!me.can_use_agent)).catch(() => {});
  }, []);

  const role = user?.role;
  const canManage = role === "superadmin" || role === "analyst";
  const o = ov?.overview;
  const k = o?.kpis;

  return (
    <AppShell>
      <div className="mb-2 text-xs text-brand-slate">
        <Link href="/operativas" className="hover:text-brand-primary">Operativas</Link>
        <span className="mx-2">/</span>
        <span className="text-brand-ink font-semibold">Televentas</span>
      </div>
      <div className="mb-8 pb-5 border-b border-brand-border flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-brand-ink uppercase">Televentas</h1>
          <p className="text-sm text-brand-slate mt-1 max-w-2xl">
            Visión de la operación comercial: llamadas y producción, días productivos, ranking de vendedores,
            tipos de póliza más vendidos y alertas de bajo desempeño.
          </p>
        </div>
        {ov && ov.available_months.length > 0 && (
          <MonthNavigator months={ov.available_months} value={month} onChange={(m) => { setMonthState(m); load(m); }} />
        )}
      </div>

      {loading && <div className="text-brand-slate mb-8">Cargando panel…</div>}

      {!loading && (!ov || ov.available_months.length === 0) && (
        <div className="card p-8 text-center mb-10">
          <p className="text-brand-slate">Aún no hay datos publicados. Subí y publicá los reportes de Llamadas y Producción para ver el panel.</p>
        </div>
      )}

      {!loading && o && (
        <>
          <section className="mb-8">
            <SectionLabel>Resumen del mes {month ? `· ${monthLabel(month)}` : ""}</SectionLabel>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <KpiCard label="Prima emitida" value={formatGs(k.prima_emitida)} hint={`${formatInt(k.polizas_emitidas)} pólizas`} accent="primary" />
              <KpiCard label="Ticket promedio" value={formatGs(k.ticket_promedio)} accent="cyan" />
              <KpiCard label="Prima anulada" value={formatGs(k.prima_anulada)} hint={`${formatInt(k.polizas_anuladas)} anuladas`} accent="orange" />
              <KpiCard label="Conversión" value={formatPct(k.conversion_pct)} hint="pólizas / contestadas" accent="purple" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Llamadas" value={formatInt(k.total_llamadas)} hint={`${formatInt(k.contestadas)} contestadas`} accent="cyan" />
              <KpiCard label="% Contestadas" value={formatPct(k.pct_contestadas)} hint={`TMO ${k.tmo_hms}`} accent="neutral" />
              <KpiCard label="Días productivos" value={formatInt(k.dias_productivos)} hint={`${formatInt(k.dias_no_productivos)} sin ventas`} accent="primary" />
              <KpiCard label="Vendedores en alerta" value={formatInt(o.alertas.length)} accent={o.alertas.length ? "orange" : "neutral"} />
            </div>
            {(!ov.tiene_llamadas || !ov.tiene_produccion) && (
              <p className="text-xs text-brand-slate mt-3">
                {!ov.tiene_llamadas && "Falta publicar el reporte de Llamadas del mes. "}
                {!ov.tiene_produccion && "Falta publicar el reporte de Producción del mes."}
              </p>
            )}
          </section>

          {o.alertas.length > 0 && (
            <section className="mb-8">
              <SectionLabel>Alertas de vendedores</SectionLabel>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                {o.alertas.map((a: any) => (
                  <div key={a.vendedor} className="card p-4 border-l-4 border-brand-orange">
                    <div className="font-semibold text-brand-ink text-sm">{a.vendedor}</div>
                    <div className="flex flex-wrap gap-1.5 my-2">
                      {a.motivos.map((m: string) => (
                        <span key={m} className="text-[10px] uppercase tracking-wider2 font-bold px-1.5 py-0.5 rounded bg-brand-orange/10 text-brand-orange">{MOTIVO_LABEL[m] ?? m}</span>
                      ))}
                    </div>
                    <div className="text-xs text-brand-slate flex gap-4">
                      <span>Prima: <b className="text-brand-ink">{formatGs(a.prima_emitida)}</b></span>
                      <span>Llam.: <b className="text-brand-ink">{formatInt(a.llamadas)}</b></span>
                      <span>Conv.: <b className="text-brand-ink">{formatPct(a.conversion_pct)}</b></span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="grid lg:grid-cols-3 gap-6 mb-8">
            <section className="card p-6 lg:col-span-2">
              <h2 className="font-display text-xl text-brand-ink uppercase mb-4">Tendencia diaria</h2>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={mergeDaily(o.llam_por_dia, o.prod_por_dia)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="fecha" fontSize={10} />
                  <YAxis yAxisId="l" fontSize={10} />
                  <YAxis yAxisId="r" orientation="right" fontSize={10} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
                  <Tooltip formatter={(v: any, n: any) => (n === "Prima" ? formatGs(v as number) : v)} />
                  <Bar yAxisId="l" dataKey="llamadas" name="Llamadas" fill="#00B2BF" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="r" dataKey="prima" name="Prima" stroke="#F39200" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </section>

            <section className="card p-6">
              <h2 className="font-display text-xl text-brand-ink uppercase mb-4">Tipos de póliza</h2>
              <div className="space-y-2">
                {o.por_producto.map((p: any, i: number) => (
                  <div key={p.producto}>
                    <div className="flex items-baseline justify-between text-sm mb-1">
                      <span className="text-brand-graphite">{p.producto}</span>
                      <span className="font-semibold text-brand-ink">{formatInt(p.polizas)}</span>
                    </div>
                    <div className="h-2 bg-brand-bg rounded">
                      <div className="h-full rounded" style={{ width: `${p.pct}%`, background: ["#F39200", "#00B2BF", "#662483"][i % 3] }} />
                    </div>
                    <div className="text-[11px] text-brand-slate mt-0.5">{formatGs(p.prima)} · {formatPct(p.pct)}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="mb-10">
            <SectionLabel>Ranking por vendedor</SectionLabel>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="bg-brand-bg border-b border-brand-border">
                  <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                    <th className="px-3 py-2 text-left">Vendedor</th>
                    <th className="px-3 py-2 text-right">Llamadas</th>
                    <th className="px-3 py-2 text-right">Contest.</th>
                    <th className="px-3 py-2 text-right">Pólizas</th>
                    <th className="px-3 py-2 text-right">Prima emitida</th>
                    <th className="px-3 py-2 text-right">Anulada</th>
                    <th className="px-3 py-2 text-right">Conv.</th>
                  </tr>
                </thead>
                <tbody>
                  {o.por_vendedor.map((v: any) => (
                    <tr key={v.vendedor} className={`border-t border-brand-border ${v.es_equipo ? "" : "opacity-60"}`}>
                      <td className="px-3 py-2 font-medium text-brand-ink">{v.vendedor}{!v.es_equipo && <span className="ml-1 text-[10px] text-brand-mist">(sin llamadas)</span>}</td>
                      <td className="px-3 py-2 text-right">{formatInt(v.llamadas)}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{formatInt(v.contestadas)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatInt(v.polizas)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatGs(v.prima_emitida)}</td>
                      <td className="px-3 py-2 text-right text-brand-orange">{formatGs(v.prima_anulada)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatPct(v.conversion_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="mb-10">
        <SectionLabel>Ver reportes</SectionLabel>
        <div className="grid md:grid-cols-2 gap-4">
          <HubCard href="/televentas/llamadas/reports" title="Reportes de Llamadas" desc="Contactabilidad, TMO, distribución de duración, curva horaria e insights por operador." bar="bg-brand-cyan" />
          <HubCard href="/televentas/produccion/reports" title="Reportes de Producción" desc="Emisiones y anulaciones, ticket, mix de productos y ranking de vendedores." bar="bg-brand-orange" />
          <HubCard href="/televentas/crm/reports" title="Gestiones CRM" desc="Funnel de gestión, productividad por operador y la Voz del Cliente en Ventas (motivos de no-venta)." bar="bg-brand-purple" badge="Nuevo" />
          <HubCard href="/televentas/comparativo" title="Comparativo mensual" desc="Tendencias multi-mes y comparación de meses seleccionados por operador." bar="bg-brand-purple" />
          <HubCard href="/televentas/simulador" title="Simulador de Ventas" desc="¿Cuántos asesores y registros de base necesito para vender X? Proyección con tasas reales." bar="bg-brand-primary" badge="Nuevo" />
          {canUseAgent && (
            <HubCard href="/televentas/agente" title="Agente de Ventas" desc="Preguntá en lenguaje natural: conversión, ranking, alertas y gráficos al instante." bar="bg-brand-purple" badge="IA" />
          )}
        </div>
      </section>

      {canManage && (
        <section>
          <SectionLabel>Cargar datos · gestión</SectionLabel>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <HubCard href="/televentas/informe-general" title="Informe General" desc="Consolidá gerencial + llamadas + producción en un PDF corporativo." bar="bg-brand-primary" badge="Nuevo" />
            <HubCard href="/televentas/llamadas/upload" title="Subir Llamadas" desc="Procesar el export de voz saliente del período." bar="bg-brand-cyan" />
            <HubCard href="/televentas/produccion/upload" title="Subir Producción" desc="Procesar el Libro de Producción (ventas de pólizas)." bar="bg-brand-orange" />
            <HubCard href="/televentas/crm/upload" title="Subir Gestiones CRM" desc="Procesar el export de gestiones del CRM de ventas." bar="bg-brand-purple" />
            <HubCard href="/televentas/publicaciones" title="Publicaciones" desc="Publicar/despublicar reportes. Los clientes solo ven lo publicado." bar="bg-brand-primary" />
          </div>
        </section>
      )}
    </AppShell>
  );
}

function HubCard({ href, title, desc, bar, badge }: { href: string; title: string; desc: string; bar: string; badge?: string }) {
  return (
    <Link href={href} className="card group p-5 flex items-start gap-4 hover:shadow-elevated hover:-translate-y-0.5 transition-all relative overflow-hidden">
      <div className={`absolute top-0 bottom-0 left-0 w-1 ${bar}`} />
      <div className="flex-1 min-w-0">
        <h3 className="font-display text-lg text-brand-ink uppercase leading-tight inline-flex items-center gap-2">
          {title}
          {badge && <span className="rounded-full bg-brand-primary text-white text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 leading-none">{badge}</span>}
        </h3>
        <p className="text-sm text-brand-slate mt-1 leading-relaxed">{desc}</p>
        <div className="text-xs text-brand-primary font-semibold mt-3 inline-flex items-center gap-1">Abrir <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>→</span></div>
      </div>
    </Link>
  );
}

function mergeDaily(llam: any[] = [], prod: any[] = []) {
  const map: Record<string, any> = {};
  for (const d of llam) map[d.fecha] = { fecha: d.fecha, llamadas: d.llamadas, prima: 0 };
  for (const d of prod) map[d.fecha] = { ...(map[d.fecha] || { fecha: d.fecha, llamadas: 0 }), prima: d.prima };
  return Object.values(map).sort((a: any, b: any) => a.fecha.localeCompare(b.fecha));
}
