"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { apiFetch } from "@/lib/api";
import { formatDate, formatGs, formatInt } from "@/lib/format";

interface Cartera {
  nombre: string;
  fuente: string;
  polizas: number;
  asegurados: number;
  asegurados_mora: number;
  saldo_total: number;
  saldo_mora: number;
  tramos: {
    a_vencer: number; h_30: number; h_60: number; h_90: number;
    h_120: number; h_150: number; m_150: number;
  };
  recibe_pagos: boolean;
  period_month: string | null;
  report_id: string | null;
  generated_at: string | null;
}

interface Response {
  period_month: string | null;
  carteras: Cartera[];
  totales: {
    polizas: number; asegurados: number; asegurados_mora: number;
    saldo_total: number; saldo_mora: number;
    a_vencer: number; h_30: number; h_60: number; h_90: number;
    h_120: number; h_150: number; m_150: number;
  };
}

const TRAMO_KEYS = ["a_vencer", "h_30", "h_60", "h_90", "h_120", "h_150", "m_150"] as const;
const TRAMO_LABELS: Record<string, string> = {
  a_vencer: "A vencer",
  h_30: "Hasta 30 d",
  h_60: "Hasta 60 d",
  h_90: "Hasta 90 d",
  h_120: "Hasta 120 d",
  h_150: "Hasta 150 d",
  m_150: "Más 150 d",
};

const FUENTE_COLOR: Record<string, string> = {
  dxp: "#E6332A",
  debitos_automaticos: "#00B2BF",
  bancard: "#662483",
};

const FUENTE_BADGE: Record<string, string> = {
  dxp: "bg-brand-primary-light text-brand-primary-dark",
  debitos_automaticos: "bg-brand-cyan/10 text-brand-cyan",
  bancard: "bg-brand-purple/10 text-brand-purple",
};

export default function CarterasTotalesPage() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periods, setPeriods] = useState<string[]>([]);
  const [period, setPeriod] = useState<string>(""); // "" = último cargado por cartera

  useEffect(() => {
    apiFetch<{ periods: string[] }>("/api/v1/bases-adicionales/carteras-totales/periods")
      .then((d) => setPeriods(d.periods))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const qs = period ? `?period_month=${encodeURIComponent(period)}` : "";
    apiFetch<Response>(`/api/v1/bases-adicionales/carteras-totales${qs}`)
      .then(setData)
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, [period]);

  // Selector de período: la fecha elegida acá decide qué reporte toma cada
  // cartera. "" = el último cargado por cada cartera (puede mezclar meses).
  const periodSelector = (
    <div className="flex items-center gap-2 mt-3">
      <label className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold">
        Período
      </label>
      <select
        value={period}
        onChange={(e) => setPeriod(e.target.value)}
        className="text-sm border border-brand-border rounded px-3 py-1.5 bg-white"
      >
        <option value="">Último cargado por cartera</option>
        {periods.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
    </div>
  );

  if (loading) {
    return (
      <AppShell>
        <div className="text-brand-slate">Cargando…</div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="card p-8">
          <p className="text-brand-primary">{error}</p>
        </div>
      </AppShell>
    );
  }

  if (!data || data.carteras.length === 0) {
    return (
      <AppShell>
        <div className="mb-2 text-xs text-brand-slate">
          <Link href="/operativas" className="hover:text-brand-primary">Operativas</Link>
          <span className="mx-2">/</span>
          <Link href="/cobranzas" className="hover:text-brand-primary">Cobranzas</Link>
          <span className="mx-2">/</span>
          <span className="text-brand-ink font-semibold">Carteras Totales</span>
        </div>
        <h1 className="font-display text-4xl text-brand-ink uppercase mb-1">Carteras Totales</h1>
        {periods.length > 0 && periodSelector}
        <div className="card p-8 text-center mt-4">
          <p className="text-brand-slate">
            {period
              ? `No hay reportes para el período ${period}. Elegí otro período.`
              : "No hay reportes cargados aún. Subí al menos un reporte de DXP, Débitos Automáticos o Bancard."}
          </p>
        </div>
      </AppShell>
    );
  }

  // Datos para gráfico de barras agrupado: una serie por cartera, X = tramo.
  const tramoChart = TRAMO_KEYS.map((k) => {
    const row: Record<string, any> = { tramo: TRAMO_LABELS[k] };
    for (const c of data.carteras) {
      row[c.nombre] = c.tramos[k];
    }
    return row;
  });

  return (
    <AppShell>
      <div className="mb-2 text-xs text-brand-slate">
        <Link href="/operativas" className="hover:text-brand-primary">Operativas</Link>
        <span className="mx-2">/</span>
        <Link href="/cobranzas" className="hover:text-brand-primary">Cobranzas</Link>
        <span className="mx-2">/</span>
        <span className="text-brand-ink font-semibold">Carteras Totales</span>
      </div>

      <div className="mb-8">
        <h1 className="font-display text-4xl text-brand-ink uppercase">Carteras Totales</h1>
        <p className="text-sm text-brand-slate mt-1 max-w-3xl">
          Vista gerencial consolidada de todas las carteras gestionadas. Cada cartera
          se reporta por separado; sin mezclar números.
        </p>
        {periods.length > 0 && periodSelector}
      </div>

      {/* Totales agregados */}
      <section className="mb-8">
        <h2 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold mb-3">
          Totales consolidados
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard
            label="Pólizas totales"
            value={formatInt(data.totales.polizas)}
            hint={`${data.carteras.length} carteras`}
            accent="secondary"
          />
          <KpiCard
            label="Asegurados (suma)"
            value={formatInt(data.totales.asegurados)}
            hint="agregado por cartera"
            accent="cyan"
          />
          <KpiCard
            label="Clientes en mora"
            value={formatInt(data.totales.asegurados_mora)}
            hint={
              data.totales.asegurados > 0
                ? `${((data.totales.asegurados_mora / data.totales.asegurados) * 100).toFixed(1)}% de asegurados`
                : "con saldo vencido"
            }
            accent="orange"
          />
          <KpiCard
            label="Saldo total operado"
            value={formatGs(data.totales.saldo_total)}
            accent="primary"
          />
          <KpiCard
            label="Saldo en mora"
            value={formatGs(data.totales.saldo_mora)}
            hint={
              data.totales.saldo_total > 0
                ? `${((data.totales.saldo_mora / data.totales.saldo_total) * 100).toFixed(1)}% del total`
                : "vencido (excl. a vencer)"
            }
            accent="orange"
          />
        </div>
      </section>

      {/* Carteras lado a lado */}
      <section className="mb-8">
        <h2 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold mb-3">
          Carteras individuales
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          {data.carteras.map((c) => (
            <div
              key={c.fuente}
              className="card p-5 relative overflow-hidden"
            >
              <div
                className="absolute top-0 left-0 right-0 h-1.5"
                style={{ background: FUENTE_COLOR[c.fuente] ?? "#5B6275" }}
              />
              <div className="flex items-start justify-between mb-2 mt-1">
                <div>
                  <h3 className="font-display text-xl text-brand-ink uppercase">{c.nombre}</h3>
                  <div className="text-[10px] uppercase tracking-wider2 text-brand-slate mt-0.5">
                    {c.period_month ?? "—"} · {c.generated_at ? formatDate(c.generated_at) : "—"}
                  </div>
                </div>
                <span
                  className={`text-[10px] uppercase tracking-wider2 font-semibold px-2 py-1 rounded ${
                    c.recibe_pagos
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {c.recibe_pagos ? "Recibe pagos" : "Sin pagos"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider2 text-brand-slate">Pólizas</div>
                  <div className="font-display text-2xl text-brand-ink">{formatInt(c.polizas)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider2 text-brand-slate">Asegurados</div>
                  <div className="font-display text-2xl text-brand-ink">{formatInt(c.asegurados)}</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider2 text-brand-slate">Saldo total</div>
                  <div className="font-display text-2xl text-brand-primary">{formatGs(c.saldo_total)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider2 text-brand-slate">En mora</div>
                  <div className="font-display text-2xl text-brand-orange">{formatGs(c.saldo_mora)}</div>
                  <div className="text-[10px] text-brand-slate mt-0.5">{formatInt(c.asegurados_mora)} clientes</div>
                </div>
              </div>
              {c.report_id && (
                <div className="mt-3 pt-3 border-t border-brand-border">
                  <Link
                    href={
                      c.fuente === "dxp"
                        ? `/reports/${c.report_id}`
                        : `/cobranzas/bases-adicionales/reports/${c.report_id}`
                    }
                    className="text-xs text-brand-primary font-semibold hover:underline"
                  >
                    Ver detalle →
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Gráfico comparativo por tramo */}
      <section className="mb-8 card p-5">
        <h3 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold mb-3">
          Comparativa por tramo de mora
        </h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={tramoChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="tramo" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`}
            />
            <Tooltip
              formatter={(v: any) => formatGs(Number(v))}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {data.carteras.map((c) => (
              <Bar
                key={c.fuente}
                dataKey={c.nombre}
                fill={FUENTE_COLOR[c.fuente] ?? "#5B6275"}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* Tabla detalle por tramo */}
      <section className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-brand-border">
          <h3 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold">
            Detalle numérico por tramo
          </h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-brand-bg border-b border-brand-border">
            <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
              <th className="px-4 py-3 text-left">Tramo</th>
              {data.carteras.map((c) => (
                <th key={c.fuente} className="px-4 py-3 text-right">
                  {c.nombre}
                </th>
              ))}
              <th className="px-4 py-3 text-right font-bold">Total</th>
            </tr>
          </thead>
          <tbody>
            {TRAMO_KEYS.map((k) => {
              const total = (data.totales as any)[k] as number;
              return (
                <tr key={k} className="border-t border-brand-border hover:bg-brand-bg-soft">
                  <td className="px-4 py-2.5 font-semibold text-brand-ink">{TRAMO_LABELS[k]}</td>
                  {data.carteras.map((c) => (
                    <td key={c.fuente} className="px-4 py-2.5 text-right">
                      {formatGs(c.tramos[k])}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right font-bold text-brand-primary">
                    {formatGs(total)}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t border-brand-border bg-brand-bg-soft/60">
              <td className="px-4 py-2.5 font-semibold text-brand-orange">Saldo en mora</td>
              {data.carteras.map((c) => (
                <td key={c.fuente} className="px-4 py-2.5 text-right font-semibold text-brand-orange">
                  {formatGs(c.saldo_mora)}
                </td>
              ))}
              <td className="px-4 py-2.5 text-right font-bold text-brand-orange">
                {formatGs(data.totales.saldo_mora)}
              </td>
            </tr>
            <tr className="border-t border-brand-border">
              <td className="px-4 py-2.5 font-semibold text-brand-ink">Clientes en mora</td>
              {data.carteras.map((c) => (
                <td key={c.fuente} className="px-4 py-2.5 text-right">
                  {formatInt(c.asegurados_mora)}
                </td>
              ))}
              <td className="px-4 py-2.5 text-right font-bold text-brand-ink">
                {formatInt(data.totales.asegurados_mora)}
              </td>
            </tr>
            <tr className="border-t-2 border-brand-ink bg-brand-bg-soft">
              <td className="px-4 py-3 font-display uppercase text-brand-ink">Saldo total</td>
              {data.carteras.map((c) => (
                <td key={c.fuente} className="px-4 py-3 text-right font-bold">
                  {formatGs(c.saldo_total)}
                </td>
              ))}
              <td className="px-4 py-3 text-right font-bold text-brand-primary text-base">
                {formatGs(data.totales.saldo_total)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
