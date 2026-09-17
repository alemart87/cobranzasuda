"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart } from "recharts";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { PrintButton, PrintCover } from "@/components/PrintButton";
import { apiFetch } from "@/lib/api";
import { formatInt } from "@/lib/format";
import { monthLabel } from "@/lib/month";

/** Histórico de Atención al Cliente: evolución mensual de los indicadores principales,
 *  llamadas por mes vs registros (gestiones) y el top de tipos de consulta. */

const PALETA = ["#00B2BF", "#E6332A", "#F39200", "#662483", "#0EA5E9", "#10B981", "#94a3b8"];
const mm = (ym: string) => { const [y, m] = ym.split("-"); return `${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][Number(m) - 1]} ${y.slice(2)}`; };
const hms = (seg: number) => `${Math.floor(seg / 60)}:${String(Math.round(seg % 60)).padStart(2, "0")}`;
const hs = (seg: number) => `${(seg / 3600).toFixed(1)} hs`;
const Delta = ({ v, pts = false, invertir = false }: { v?: number | null; pts?: boolean; invertir?: boolean }) => {
  if (v == null) return <span className="text-brand-mist">—</span>;
  const bueno = invertir ? v <= 0 : v >= 0;
  return <span className={`font-mono text-xs ${v === 0 ? "text-brand-slate" : bueno ? "text-emerald-600" : "text-brand-primary"}`}>{v > 0 ? "▲ +" : v < 0 ? "▼ " : "→ "}{v}{pts ? " pts" : "%"}</span>;
};

export default function AtencionHistoricoPage() {
  const [h, setH] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [desde, setDesde] = useState<string>("");

  useEffect(() => {
    apiFetch<any>("/api/v1/atencion/historico").then((d) => { setH(d); if (d.meses?.length > 12) setDesde(d.meses[d.meses.length - 12]); }).catch((e) => setError(e.message));
  }, []);

  const serie: any[] = useMemo(() => (h?.serie ?? []).filter((p: any) => !desde || p.mes >= desde), [h, desde]);
  const meses = serie.map((p) => p.mes);
  const dataLlamadas = serie.map((p) => ({
    mes: mm(p.mes), Ingresadas: p.llamadas?.ingresadas ?? 0, Contestadas: p.llamadas?.contestadas ?? 0,
    Registros: p.gestiones?.total ?? 0, "Registros por 100 contestadas": p.registros_por_100_contestadas ?? null,
  }));
  const tipos: any[] = h?.tipos ?? [];
  const dataTipos = serie.map((p) => {
    const row: any = { mes: mm(p.mes) };
    tipos.forEach((t) => { row[t.tipo] = t.por_mes[p.mes] ?? 0; });
    row["Otros"] = (h?.otros_tipos ?? []).find((o: any) => o.mes === p.mes)?.cantidad ?? 0;
    return row;
  });
  const dataAux = serie.map((p) => {
    const row: any = { mes: mm(p.mes) };
    (h?.auxiliares ?? []).forEach((a: any) => { row[a.estado] = Number(((a.por_mes[p.mes] ?? 0) / 3600).toFixed(1)); });
    return row;
  });
  const ultimo = serie[serie.length - 1];
  const ul = ultimo?.llamadas, ug = ultimo?.gestiones, uv = ultimo?.vs_mes_anterior ?? {};

  return (
    <AppShell>
      <PrintCover titulo="Histórico de Atención al Cliente" periodo={h?.resumen?.desde ? `${monthLabel(h.resumen.desde)} a ${monthLabel(h.resumen.hasta)}` : undefined} />
      <div className="mb-2 text-xs text-brand-slate no-print">
        <Link href="/atencion" className="hover:text-brand-primary">Atención</Link><span className="mx-2">/</span><span className="text-brand-ink font-semibold">Histórico</span>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-3xl text-brand-ink uppercase">Histórico</h1>
          <p className="text-sm text-brand-slate mt-1 max-w-3xl">Comparativo mes a mes de los indicadores principales del tablero: llamadas por mes vs cantidad de registros, top de tipos de consulta y auxiliares del equipo. Se toma el reporte publicado de cada mes (o el último generado si no hay publicado).</p>
        </div>
        <div className="flex items-center gap-3 no-print">
          {h?.meses?.length > 1 && (
            <label className="text-xs text-brand-slate">Desde
              <select value={desde} onChange={(e) => setDesde(e.target.value)} className="input mt-1">
                <option value="">Todo el histórico</option>
                {h.meses.map((m: string) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </label>
          )}
          <PrintButton />
        </div>
      </div>

      {error && <div className="card p-4 text-sm text-brand-primary mb-4">{error}</div>}
      {!h && !error && <div className="card p-6 text-sm text-brand-slate">Cargando histórico…</div>}
      {h && serie.length === 0 && <div className="card p-10 text-center text-brand-slate">Todavía no hay reportes de llamadas ni de gestiones con período. Generá y publicá reportes mensuales para ver el histórico.</div>}

      {ultimo && (
        <>
          <h2 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold mb-2">Último mes · {monthLabel(ultimo.mes)} vs mes anterior</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
            <KpiCard label="Llamadas ingresadas" value={formatInt(ul?.ingresadas ?? 0)} hint={uv.ingresadas != null ? `${uv.ingresadas > 0 ? "+" : ""}${uv.ingresadas}% vs mes anterior` : "sin mes anterior"} accent="neutral" />
            <KpiCard label="Contestadas" value={formatInt(ul?.contestadas ?? 0)} hint={`nivel de atención ${ul?.nivel_atencion_pct ?? "—"}%${uv.nivel_atencion_pts != null ? ` (${uv.nivel_atencion_pts > 0 ? "+" : ""}${uv.nivel_atencion_pts} pts)` : ""}`} accent="cyan" />
            <KpiCard label="Registros (gestiones)" value={formatInt(ug?.total ?? 0)} hint={uv.registros != null ? `${uv.registros > 0 ? "+" : ""}${uv.registros}% vs mes anterior` : "sin mes anterior"} accent="purple" />
            <KpiCard label="Registros por 100 contestadas" value={ultimo.registros_por_100_contestadas != null ? String(ultimo.registros_por_100_contestadas) : "—"} hint="cuántas llamadas terminan en un registro" accent="secondary" />
            <KpiCard label="AHT" value={ul ? hms(ul.aht_seg) : "—"} hint={uv.aht_seg != null ? `${uv.aht_seg > 0 ? "+" : ""}${uv.aht_seg}% vs mes anterior` : "min:seg"} accent="orange" />
            <KpiCard label="Tipo más frecuente" value={ug?.por_tipo?.[0]?.label ?? h.resumen.tipo_mas_frecuente ?? "—"} hint={ug?.por_tipo?.[0] ? `${formatInt(ug.por_tipo[0].cantidad)} · ${ug.por_tipo[0].pct}% de los registros` : "del histórico"} accent="primary" />
          </div>

          <section className="card p-6 mb-6">
            <h2 className="font-display text-lg text-brand-ink uppercase mb-1">Llamadas por mes vs registros</h2>
            <p className="text-xs text-brand-slate mb-3">Barras: llamadas ingresadas y contestadas. Línea: registros (gestiones) del mes. Línea punteada (eje derecho): registros cada 100 llamadas contestadas.</p>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={dataLlamadas} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="mes" fontSize={11} />
                <YAxis yAxisId="l" fontSize={10} tickFormatter={(v) => formatInt(v)} />
                <YAxis yAxisId="r" orientation="right" fontSize={10} tickFormatter={(v) => `${v}`} />
                <Tooltip formatter={(v: any, n: any) => [n.startsWith("Registros por") ? `${v}` : formatInt(Number(v)), n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="l" dataKey="Ingresadas" fill="#94a3b8" fillOpacity={0.6} radius={[3, 3, 0, 0]} />
                <Bar yAxisId="l" dataKey="Contestadas" fill="#00B2BF" radius={[3, 3, 0, 0]} />
                <Line yAxisId="l" dataKey="Registros" stroke="#662483" strokeWidth={3} dot={{ r: 4 }} />
                <Line yAxisId="r" dataKey="Registros por 100 contestadas" stroke="#E6332A" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </section>

          <div className="grid xl:grid-cols-2 gap-6 mb-6">
            <section className="card p-6">
              <h2 className="font-display text-lg text-brand-ink uppercase mb-1">Top de tipos de consulta · evolución</h2>
              <p className="text-xs text-brand-slate mb-3">Registros por tipo de caso en cada mes. Los {tipos.length} tipos más frecuentes del período; el resto en "Otros".</p>
              {tipos.length === 0 ? <p className="text-sm text-brand-slate">Sin reportes de gestiones con tipo de caso.</p> : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={dataTipos} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="mes" fontSize={11} />
                    <YAxis fontSize={10} tickFormatter={(v) => formatInt(v)} />
                    <Tooltip formatter={(v: any) => formatInt(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {tipos.map((t, i) => <Bar key={t.tipo} dataKey={t.tipo} stackId="t" fill={PALETA[i % PALETA.length]} />)}
                    <Bar dataKey="Otros" stackId="t" fill="#d1d5db" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </section>
            <section className="card p-6">
              <h2 className="font-display text-lg text-brand-ink uppercase mb-1">Auxiliares del equipo por mes</h2>
              <p className="text-xs text-brand-slate mb-3">Horas totales del equipo en cada estado auxiliar (no productivo), según el reporte de llamadas de cada mes.</p>
              {(h.auxiliares ?? []).length === 0 ? <p className="text-sm text-brand-slate">Sin datos de estados auxiliares.</p> : (
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={dataAux} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="mes" fontSize={11} />
                    <YAxis fontSize={10} tickFormatter={(v) => `${v} hs`} />
                    <Tooltip formatter={(v: any) => `${v} hs`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {h.auxiliares.map((a: any, i: number) => <Area key={a.estado} dataKey={a.estado} stackId="a" stroke={PALETA[i % PALETA.length]} fill={PALETA[i % PALETA.length]} fillOpacity={0.35} type="monotone" />)}
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </section>
          </div>

          <section className="card overflow-x-auto mb-6">
            <div className="px-5 pt-4 pb-2"><h2 className="font-display text-lg text-brand-ink uppercase">Comparativo mensual</h2><p className="text-xs text-brand-slate">Variaciones contra el mes anterior. Verde = mejora, rojo = desmejora.</p></div>
            <table className="w-full text-sm min-w-[980px]">
              <thead className="bg-brand-bg border-b border-brand-border">
                <tr className="text-[10px] uppercase tracking-wider2 text-brand-slate">
                  <th className="px-3 py-2 text-left">Mes</th>
                  <th className="px-3 py-2 text-right">Ingresadas</th><th className="px-3 py-2 text-right">Contestadas</th><th className="px-3 py-2 text-right">Var.</th>
                  <th className="px-3 py-2 text-right">Nivel at.</th><th className="px-3 py-2 text-right">Abandono</th><th className="px-3 py-2 text-right">SLA</th><th className="px-3 py-2 text-right">AHT</th>
                  <th className="px-3 py-2 text-right">Operadores</th><th className="px-3 py-2 text-right">Auxiliares</th>
                  <th className="px-3 py-2 text-right">Registros</th><th className="px-3 py-2 text-right">Var.</th><th className="px-3 py-2 text-right">Reg./100 cont.</th>
                  <th className="px-3 py-2 text-left">Top tipos</th>
                </tr>
              </thead>
              <tbody>
                {[...serie].reverse().map((p) => {
                  const l = p.llamadas, g = p.gestiones, v = p.vs_mes_anterior ?? {};
                  return (
                    <tr key={p.mes} className="border-t border-brand-border hover:bg-brand-bg-soft">
                      <td className="px-3 py-2 font-semibold text-brand-ink">{monthLabel(p.mes)}<div className="text-[10px] text-brand-slate font-normal">{l ? (l.publicado ? "llamadas publicado" : "llamadas borrador") : "sin llamadas"} · {g ? (g.publicado ? "gestiones publicado" : "gestiones borrador") : "sin gestiones"}</div></td>
                      <td className="px-3 py-2 text-right">{l ? formatInt(l.ingresadas) : "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-brand-cyan">{l ? formatInt(l.contestadas) : "—"}</td>
                      <td className="px-3 py-2 text-right"><Delta v={v.contestadas} /></td>
                      <td className="px-3 py-2 text-right">{l ? `${l.nivel_atencion_pct}%` : "—"} {v.nivel_atencion_pts != null && <Delta v={v.nivel_atencion_pts} pts />}</td>
                      <td className="px-3 py-2 text-right">{l ? `${l.abandono_pct}%` : "—"} {v.abandono_pts != null && <Delta v={v.abandono_pts} pts invertir />}</td>
                      <td className="px-3 py-2 text-right">{l ? `${l.sla_pct}%` : "—"}</td>
                      <td className="px-3 py-2 text-right font-mono">{l ? hms(l.aht_seg) : "—"} {v.aht_seg != null && <Delta v={v.aht_seg} invertir />}</td>
                      <td className="px-3 py-2 text-right">{l ? l.operadores_activos : "—"}{p.llamadas_por_operador != null && <div className="text-[10px] text-brand-slate">{p.llamadas_por_operador} cont./op.</div>}</td>
                      <td className="px-3 py-2 text-right">{l ? hs(l.aux_total_seg) : "—"} {v.aux_total_seg != null && <Delta v={v.aux_total_seg} invertir />}</td>
                      <td className="px-3 py-2 text-right font-semibold text-brand-purple">{g ? formatInt(g.total) : "—"}</td>
                      <td className="px-3 py-2 text-right"><Delta v={v.registros} /></td>
                      <td className="px-3 py-2 text-right font-mono">{p.registros_por_100_contestadas ?? "—"}</td>
                      <td className="px-3 py-2 text-[11px] text-brand-graphite">{g?.por_tipo?.slice(0, 3).map((t: any) => `${t.label} ${t.pct}%`).join(" · ") || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
    </AppShell>
  );
}
