"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
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
  const [tab, setTab] = useState<"tendencias" | "comparar">("tendencias");
  const [selMeses, setSelMeses] = useState<string[]>([]);
  const [cmp, setCmp] = useState<any>(null);
  const [cmpLoading, setCmpLoading] = useState(false);
  const [cmpError, setCmpError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<any>("/api/v1/televentas/tendencias").catch(() => null),
      apiFetch<any>("/api/v1/televentas/comparativo").catch(() => null),
    ]).then(([t, c]) => { setTend(t); setComp(c); }).finally(() => setLoading(false));
  }, []);

  const toggleMes = (m: string) => {
    setCmp(null); setCmpError(null);
    setSelMeses((prev) => prev.includes(m) ? prev.filter((x) => x !== m)
      : prev.length >= 3 ? [...prev.slice(1), m] : [...prev, m]);
  };

  const comparar = async () => {
    if (selMeses.length < 2) return;
    setCmpLoading(true); setCmpError(null);
    try {
      setCmp(await apiFetch<any>(`/api/v1/televentas/comparar?meses=${selMeses.join(",")}`));
    } catch (e: any) {
      setCmpError(e.message);
    } finally {
      setCmpLoading(false);
    }
  };

  const meses: any[] = tend?.meses ?? [];
  const mesesDisponibles: string[] = Array.from(new Set([
    ...meses.map((m: any) => m.mes),
    ...((comp?.available_months as string[]) ?? []),
  ])).sort();
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

      <div className="flex items-center gap-1 mb-6 border-b border-brand-border no-print">
        {([["tendencias", "Tendencias"], ["comparar", "Comparar meses"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === id ? "border-brand-primary text-brand-primary" : "border-transparent text-brand-slate hover:text-brand-ink"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "comparar" && (
        <CompararMeses
          disponibles={mesesDisponibles}
          seleccion={selMeses}
          onToggle={toggleMes}
          onComparar={comparar}
          cmp={cmp}
          loading={cmpLoading}
          error={cmpError}
        />
      )}

      {tab === "tendencias" && loading && <div className="text-brand-slate">Cargando…</div>}

      {tab === "tendencias" && !loading && meses.length < 2 && (
        <div className="card p-10 text-center text-brand-slate">
          Se necesitan al menos <b>dos meses publicados</b> para ver tendencias. Actualmente hay {meses.length}.
        </div>
      )}

      {tab === "tendencias" && !loading && meses.length >= 2 && (
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

function CompararMeses({ disponibles, seleccion, onToggle, onComparar, cmp, loading, error }: {
  disponibles: string[]; seleccion: string[]; onToggle: (m: string) => void;
  onComparar: () => void; cmp: any; loading: boolean; error: string | null;
}) {
  const [filtro, setFiltro] = useState("");
  const [estadoF, setEstadoF] = useState("all");
  const [soloEquipo, setSoloEquipo] = useState(false);
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 } | null>(null);

  const clickSort = (k: string) =>
    setSort((s) => (s?.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: k === "vendedor" ? 1 : -1 }));

  const sortVal = (o: any, k: string): any => {
    if (k === "vendedor") return o.vendedor?.toLowerCase() ?? "";
    if (k === "delta") return o.prima_delta_pct;
    const [, mes, campo] = k.split("|");  // "pm|2026-07|prima_emitida"
    return o.por_mes?.[mes]?.[campo];
  };

  const filas = (() => {
    let rows: any[] = cmp?.por_operador ?? [];
    if (filtro.trim()) {
      const q = filtro.trim().toLowerCase();
      rows = rows.filter((o) => o.vendedor?.toLowerCase().includes(q));
    }
    if (estadoF !== "all") rows = rows.filter((o) => o.estado === estadoF);
    if (soloEquipo) rows = rows.filter((o) => o.es_equipo);
    if (sort) {
      const { k, dir } = sort;
      rows = [...rows].sort((a, b) => {
        const va = sortVal(a, k), vb = sortVal(b, k);
        const na = va == null ? (dir === -1 ? -Infinity : Infinity) : va;  // vacíos siempre al final
        const nb = vb == null ? (dir === -1 ? -Infinity : Infinity) : vb;
        if (typeof na === "string" || typeof nb === "string") return String(na).localeCompare(String(nb)) * dir;
        return (na - nb) * dir;
      });
    }
    return rows;
  })();

  const SortTh = ({ k, children, className = "px-2 py-1.5 text-right" }: { k: string; children: React.ReactNode; className?: string }) => (
    <th onClick={() => clickSort(k)} className={`${className} cursor-pointer select-none hover:text-brand-ink whitespace-nowrap`}
      title="Ordenar por esta columna">
      {children}{sort?.k === k ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
    </th>
  );

  const delta = (cur: number, prev: number, inverso = false) => {
    if (!prev) return <span className="text-brand-mist">—</span>;
    const pct = ((cur - prev) / Math.abs(prev)) * 100;
    if (Math.abs(pct) < 0.05) return <span className="text-brand-slate">→ 0%</span>;
    const good = inverso ? pct < 0 : pct > 0;
    return <span className={good ? "text-emerald-600" : "text-brand-primary"}>{pct > 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%</span>;
  };

  const metricas: Array<{ key: string; label: string; fmt: (v: number) => string; inverso?: boolean }> = [
    { key: "total_llamadas", label: "Llamadas", fmt: formatInt },
    { key: "llamadas_prom_asesor_dia", label: "Prom. llamadas / asesor / día", fmt: formatInt },
    { key: "agentes_activos", label: "Agentes activos", fmt: formatInt },
    { key: "contactabilidad", label: "Contactabilidad %", fmt: (v) => formatPct(v) },
    { key: "polizas_emitidas", label: "Pólizas emitidas", fmt: formatInt },
    { key: "prima_emitida", label: "Prima emitida", fmt: formatGs },
    { key: "ticket_promedio", label: "Ticket promedio", fmt: formatGs },
    { key: "conversion_pct", label: "Conversión %", fmt: (v) => formatPct(v) },
    { key: "dias_productivos", label: "Días productivos", fmt: formatInt },
  ];

  return (
    <>
      <section className="card p-5 mb-6 no-print">
        <label className="label">Elegí 2 o 3 meses para comparar</label>
        <div className="flex flex-wrap gap-2 mb-4">
          {disponibles.map((m) => {
            const on = seleccion.includes(m);
            return (
              <button key={m} onClick={() => onToggle(m)}
                className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                  on ? "bg-brand-primary text-white border-brand-primary" : "border-brand-border text-brand-graphite hover:border-brand-primary"}`}>
                {monthLabel(m)}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onComparar} disabled={seleccion.length < 2 || loading} className="btn-primary disabled:opacity-50">
            {loading ? "Comparando…" : `Comparar${seleccion.length ? ` (${seleccion.length})` : ""}`}
          </button>
          {seleccion.length < 2 && <span className="text-xs text-brand-slate">Seleccioná al menos 2 meses.</span>}
          {error && <span className="text-xs text-brand-primary">{error}</span>}
        </div>
      </section>

      {cmp && (
        <>
          <InsightsPanel insights={cmp.insights} titulo={`Análisis del cambio · ${monthLabel(cmp.extremos.desde)} → ${monthLabel(cmp.extremos.hasta)}`} />

          <section className="card overflow-x-auto mb-6">
            <div className="px-4 pt-4">
              <h2 className="font-display text-xl text-brand-ink uppercase">Rendimiento general</h2>
              <p className="text-xs text-brand-slate mb-2">Δ = variación entre el primer y el último mes seleccionado.</p>
            </div>
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-brand-bg border-b border-brand-border">
                <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                  <th className="px-4 py-2 text-left">Métrica</th>
                  {cmp.meses.map((m: string) => <th key={m} className="px-4 py-2 text-right">{monthLabel(m)}</th>)}
                  <th className="px-4 py-2 text-right">Δ</th>
                </tr>
              </thead>
              <tbody>
                {metricas.map((mt) => {
                  const vals = cmp.meses.map((m: string) => (cmp.generales.find((g: any) => g.mes === m) || {})[mt.key] ?? 0);
                  return (
                    <tr key={mt.key} className="border-t border-brand-border hover:bg-brand-bg-soft">
                      <td className="px-4 py-2 font-medium text-brand-ink">{mt.label}</td>
                      {vals.map((v: number, i: number) => (
                        <td key={i} className={`px-4 py-2 text-right ${i === vals.length - 1 ? "font-semibold" : ""}`}>{mt.fmt(v)}</td>
                      ))}
                      <td className="px-4 py-2 text-right font-mono text-xs">{delta(vals[vals.length - 1], vals[0], mt.inverso)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="card overflow-x-auto">
            <div className="px-4 pt-4">
              <h2 className="font-display text-xl text-brand-ink uppercase">Rendimiento por operador</h2>
              <p className="text-xs text-brand-slate mb-3">Estado y Δ prima: primer vs último mes seleccionado. Clickeá un encabezado para ordenar.</p>
              <div className="flex flex-wrap items-center gap-3 mb-3 no-print">
                <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar operador…"
                  className="input max-w-[220px] !py-1.5 text-sm" />
                <select value={estadoF} onChange={(e) => setEstadoF(e.target.value)}
                  className="text-sm border border-brand-border rounded px-3 py-1.5 bg-white">
                  <option value="all">Todos los estados</option>
                  <option value="subio">Subió</option>
                  <option value="cayo">Cayó</option>
                  <option value="estable">Estable</option>
                  <option value="nuevo">Nuevo</option>
                  <option value="salio">Salió</option>
                </select>
                <label className="flex items-center gap-1.5 text-sm text-brand-graphite cursor-pointer">
                  <input type="checkbox" checked={soloEquipo} onChange={(e) => setSoloEquipo(e.target.checked)} className="accent-brand-primary" />
                  Solo equipo con llamadas
                </label>
                <span className="text-xs text-brand-slate ml-auto">{filas.length} de {cmp.por_operador.length} operadores</span>
              </div>
            </div>
            <table className="w-full text-sm" style={{ minWidth: `${360 + cmp.meses.length * 300}px` }}>
              <thead className="bg-brand-bg border-b border-brand-border">
                <tr className="text-[10px] uppercase tracking-wider2 text-brand-slate">
                  <SortTh k="vendedor" className="px-3 py-1.5 text-left">Operador</SortTh>
                  <th className="px-2 py-1.5 text-center" rowSpan={2}>Estado</th>
                  {cmp.meses.map((m: string) => (
                    <th key={m} className="px-2 py-1.5 text-center border-l border-brand-border" colSpan={4}>{monthLabel(m)}</th>
                  ))}
                  <SortTh k="delta" className="px-3 py-1.5 text-right">Δ Prima</SortTh>
                </tr>
                <tr className="text-[10px] uppercase tracking-wider2 text-brand-slate">
                  <th className="px-3 py-1.5" />
                  {cmp.meses.map((m: string) => (
                    <React.Fragment key={m}>
                      <SortTh k={`pm|${m}|llamadas`} className="px-2 py-1.5 text-right border-l border-brand-border">Llam.</SortTh>
                      <SortTh k={`pm|${m}|contacto_pct`}>Cont.%</SortTh>
                      <SortTh k={`pm|${m}|conversion_pct`}>Conv.%</SortTh>
                      <SortTh k={`pm|${m}|prima_emitida`}>Prima</SortTh>
                    </React.Fragment>
                  ))}
                  <th className="px-3 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {filas.map((o: any) => {
                  const e = ESTADO[o.estado] ?? { label: o.estado === "salio" ? "Salió" : o.estado, cls: "bg-brand-bg text-brand-slate" };
                  return (
                    <tr key={o.vendedor} className={`border-t border-brand-border hover:bg-brand-bg-soft ${o.es_equipo ? "" : "opacity-60"}`}>
                      <td className="px-3 py-2 font-medium text-brand-ink whitespace-nowrap">{o.vendedor}</td>
                      <td className="px-2 py-2 text-center"><span className={`text-[10px] uppercase tracking-wider2 font-bold px-1.5 py-0.5 rounded ${e.cls}`}>{e.label}</span></td>
                      {cmp.meses.map((m: string) => {
                        const d = o.por_mes[m];
                        return (
                          <React.Fragment key={m}>
                            <td className="px-2 py-2 text-right border-l border-brand-border">{d ? formatInt(d.llamadas) : <span className="text-brand-mist">—</span>}</td>
                            <td className="px-2 py-2 text-right font-mono text-xs">{d ? formatPct(d.contacto_pct) : "—"}</td>
                            <td className="px-2 py-2 text-right font-mono text-xs">{d ? formatPct(d.conversion_pct) : "—"}</td>
                            <td className="px-2 py-2 text-right">{d ? formatGs(d.prima_emitida) : "—"}</td>
                          </React.Fragment>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {o.prima_delta_pct == null ? <span className="text-brand-mist">—</span>
                          : <span className={o.prima_delta_pct >= 0 ? "text-emerald-600" : "text-brand-primary"}>{o.prima_delta_pct > 0 ? "▲" : o.prima_delta_pct < 0 ? "▼" : "→"} {Math.abs(o.prima_delta_pct)}%</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
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
