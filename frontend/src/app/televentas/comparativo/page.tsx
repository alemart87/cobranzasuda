"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { MonthNavigator } from "@/components/MonthNavigator";
import { InsightsPanel } from "@/components/televentas/InsightsPanel";
import { apiFetch } from "@/lib/api";
import { formatGs, formatInt, formatPct } from "@/lib/format";
import { monthLabel } from "@/lib/month";

const INVERSO = new Set(["Prima anulada"]); // métricas donde bajar es bueno

const ESTADO: Record<string, { label: string; cls: string }> = {
  nuevo: { label: "Nuevo", cls: "bg-brand-cyan/10 text-brand-cyan" },
  cayo: { label: "Cayó", cls: "bg-brand-primary/10 text-brand-primary" },
  subio: { label: "Subió", cls: "bg-emerald-100 text-emerald-700" },
  estable: { label: "Estable", cls: "bg-brand-bg text-brand-slate" },
};

export default function TeleventasComparativoPage() {
  const [data, setData] = useState<any>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = (m?: string | null) => {
    setLoading(true);
    apiFetch<any>(`/api/v1/televentas/comparativo${m ? `?month=${m}` : ""}`)
      .then((d) => { setData(d); setMonth(d.mes_actual ?? m ?? null); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const deltaTxt = (metric: string, pct: number | null, delta: number) => {
    if (pct === null) return "—";
    const good = INVERSO.has(metric) ? delta < 0 : delta > 0;
    const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "→";
    return <span className={delta === 0 ? "text-brand-slate" : good ? "text-emerald-600" : "text-brand-primary"}>{arrow} {Math.abs(pct)}%</span>;
  };

  return (
    <AppShell>
      <div className="mb-2 text-xs text-brand-slate">
        <Link href="/televentas" className="hover:text-brand-primary">Televentas</Link>
        <span className="mx-2">/</span><span className="text-brand-ink font-semibold">Comparativo</span>
      </div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-brand-ink uppercase">Comparativo mensual</h1>
          <p className="text-sm text-brand-slate mt-1">Mes vs mes anterior: KPIs, conversión, llamadas por operador y análisis del cambio.</p>
        </div>
        {data?.available_months?.length > 1 && (
          <MonthNavigator months={data.available_months} value={month} onChange={(m) => { setMonth(m); load(m); }} />
        )}
      </div>

      {loading && <div className="text-brand-slate">Cargando…</div>}

      {!loading && data && !data.disponible && (
        <div className="card p-10 text-center text-brand-slate">
          {data.mensaje || "Se necesitan al menos dos meses publicados para comparar."}
        </div>
      )}

      {!loading && data?.disponible && (
        <>
          <div className="mb-6 text-sm text-brand-slate">
            Comparando <b className="text-brand-ink">{monthLabel(data.mes_actual)}</b> vs <b className="text-brand-ink">{monthLabel(data.mes_previo)}</b>
          </div>

          <InsightsPanel insights={data.insights} titulo="Análisis del cambio" />

          <section className="mb-6">
            <h2 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold mb-3">Indicadores</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {data.kpis.map((d: any) => {
                const isGs = ["Prima emitida", "Prima anulada", "Ticket promedio"].includes(d.metric);
                const isPct = d.metric.includes("%");
                const fmt = (v: number) => (isGs ? formatGs(v) : isPct ? formatPct(v) : formatInt(v));
                return (
                  <div key={d.metric} className="card p-4">
                    <div className="text-[11px] uppercase tracking-wider2 text-brand-slate">{d.metric}</div>
                    <div className="text-xl font-display text-brand-ink mt-1">{fmt(d.actual)}</div>
                    <div className="text-xs mt-0.5 flex items-center gap-2">
                      {deltaTxt(d.metric, d.pct, d.delta)}
                      <span className="text-brand-mist">antes {fmt(d.previo)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card p-6">
            <h2 className="font-display text-xl text-brand-ink uppercase mb-4">Por operador</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[780px]">
                <thead className="bg-brand-bg">
                  <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                    <th className="px-3 py-2 text-left">Operador</th>
                    <th className="px-3 py-2 text-center">Estado</th>
                    <th className="px-3 py-2 text-right">Llamadas</th>
                    <th className="px-3 py-2 text-right">Contacto %</th>
                    <th className="px-3 py-2 text-right">Conversión %</th>
                    <th className="px-3 py-2 text-right">Prima emitida</th>
                    <th className="px-3 py-2 text-right">Δ Prima</th>
                  </tr>
                </thead>
                <tbody>
                  {data.por_operador.map((o: any) => {
                    const e = ESTADO[o.estado] ?? ESTADO.estable;
                    return (
                      <tr key={o.vendedor} className="border-t border-brand-border hover:bg-brand-bg-soft">
                        <td className="px-3 py-2 font-medium text-brand-ink">{o.vendedor}</td>
                        <td className="px-3 py-2 text-center"><span className={`text-[10px] uppercase tracking-wider2 font-bold px-1.5 py-0.5 rounded ${e.cls}`}>{e.label}</span></td>
                        <td className="px-3 py-2 text-right">{formatInt(o.llamadas_act)} <span className="text-brand-mist text-xs">/ {formatInt(o.llamadas_prev)}</span></td>
                        <td className="px-3 py-2 text-right font-mono">{formatPct(o.contacto_act)} <span className="text-brand-mist text-xs">/ {formatPct(o.contacto_prev)}</span></td>
                        <td className="px-3 py-2 text-right font-mono">{formatPct(o.conversion_act)} <span className="text-brand-mist text-xs">/ {formatPct(o.conversion_prev)}</span></td>
                        <td className="px-3 py-2 text-right font-semibold">{formatGs(o.prima_act)}</td>
                        <td className="px-3 py-2 text-right font-mono">{deltaTxt("Prima emitida", o.prima_pct, o.prima_pct ?? 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
