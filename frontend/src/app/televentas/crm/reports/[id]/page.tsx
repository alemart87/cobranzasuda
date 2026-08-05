"use client";

import { useParams } from "next/navigation";
import React, { useEffect, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { PrintButton, PrintHeader } from "@/components/PrintButton";
import { DistBar } from "@/components/charts/atencion/DistBar";
import { TagCloud } from "@/components/charts/atencion/TagCloud";
import { apiFetch } from "@/lib/api";
import { formatDate, formatInt, formatPct } from "@/lib/format";

const SUB_COLORS: Record<string, string> = {
  "No contesta": "#94a3b8", "No acepta": "#E6332A", "Agendado": "#00B2BF", "Acepta": "#10B981",
};

interface Detail {
  id: string; period_month: string | null; generated_at: string;
  data: {
    kpis: any;
    por_subestado: Array<{ subestado: string; cantidad: number; pct: number }>;
    por_dia: Array<any>;
    por_operador: Array<any>;
    por_campana: Array<any>;
    voz_ventas: any;
  };
}

export default function TeleventasCrmDetailPage() {
  const params = useParams<{ id: string }>();
  const [report, setReport] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: "gestiones", dir: -1 });

  useEffect(() => {
    apiFetch<Detail>(`/api/v1/televentas/crm/reports/${params.id}`).then(setReport).catch((e) => setError(e.message));
  }, [params.id]);

  if (error) return <AppShell><div className="text-brand-primary">{error}</div></AppShell>;
  if (!report) return <AppShell><div className="text-brand-slate">Cargando…</div></AppShell>;
  const k = report.data.kpis;
  const v = report.data.voz_ventas;

  const clickSort = (key: string) =>
    setSort((s) => (s.k === key ? { k: key, dir: (s.dir * -1) as 1 | -1 } : { k: key, dir: -1 }));
  const ops = [...report.data.por_operador].sort((a, b) => {
    const va = a[sort.k] ?? 0, vb = b[sort.k] ?? 0;
    return (typeof va === "string" ? String(va).localeCompare(String(vb)) : va - vb) * sort.dir;
  });
  const Th = ({ k: key, children }: { k: string; children: React.ReactNode }) => (
    <th onClick={() => clickSort(key)} className="px-3 py-2 text-right cursor-pointer select-none hover:text-brand-ink whitespace-nowrap">
      {children}{sort.k === key ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
    </th>
  );

  return (
    <AppShell>
      <PrintHeader titulo="Gestiones CRM · Televentas" subtitulo={`Período: ${report.period_month ?? "—"} · Generado: ${formatDate(report.generated_at)}`} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-brand-ink uppercase">Gestiones CRM</h1>
          <p className="text-sm text-brand-slate mt-1">Período: <b>{report.period_month ?? "—"}</b> · Generado: {formatDate(report.generated_at)}</p>
        </div>
        <PrintButton />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KpiCard label="Gestiones" value={formatInt(k.total_gestiones)} hint={`${formatInt(k.prom_gestiones_dia)} /día`} accent="primary" />
        <KpiCard label="Contactos" value={formatInt(k.contactos)} hint={`${formatPct(k.tasa_contacto_pct)} tasa de contacto`} accent="cyan" />
        <KpiCard label="Agendados" value={formatInt(k.agendados)} accent="purple" />
        <KpiCard label="Aceptas" value={formatInt(k.aceptas)} hint={`${formatPct(k.tasa_aceptacion_pct)} sobre contactos`} accent="secondary" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="No contesta" value={formatInt(k.no_contesta)} accent="neutral" />
        <KpiCard label="No acepta" value={formatInt(k.no_acepta)} accent="orange" />
        <KpiCard label="Prom. gestiones / operador / día" value={formatInt(k.prom_gestiones_operador_dia)} accent="primary" />
        <KpiCard label="Operadores · Días" value={`${formatInt(k.operadores_activos)} · ${formatInt(k.dias_operativos)}`} accent="neutral" />
      </div>

      <section className="card p-6 mb-6">
        <h2 className="font-display text-xl text-brand-ink uppercase mb-1">Gestiones por día</h2>
        <p className="text-xs text-brand-slate mb-4">Barras: gestiones del día. Líneas: acumulado del período y promedio por operador.</p>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={report.data.por_dia}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="fecha" fontSize={10} />
            <YAxis yAxisId="l" fontSize={11} />
            <YAxis yAxisId="r" orientation="right" fontSize={11} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="l" dataKey="gestiones" name="Gestiones" fill="#F39200" radius={[3, 3, 0, 0]} />
            <Bar yAxisId="l" dataKey="contactos" name="Contactos" fill="#00B2BF" radius={[3, 3, 0, 0]} />
            <Line yAxisId="r" dataKey="acumulado" name="Acumulado" stroke="#0F1116" strokeWidth={2} dot={false} />
            <Line yAxisId="l" dataKey="prom_por_operador" name="Prom./operador" stroke="#662483" strokeWidth={2} dot={{ r: 2.5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </section>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <section className="card p-6">
          <h2 className="font-display text-xl text-brand-ink uppercase mb-4">Funnel por subestado</h2>
          <DistBar data={report.data.por_subestado.map((s) => ({ label: s.subestado, cantidad: s.cantidad, pct: s.pct }))}
            palette={report.data.por_subestado.map((s) => SUB_COLORS[s.subestado] ?? "#662483")} />
        </section>
        <section className="card p-6">
          <h2 className="font-display text-xl text-brand-ink uppercase mb-4">Por campaña / base</h2>
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {report.data.por_campana.map((c) => (
              <div key={c.campana} className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-brand-graphite truncate" title={c.campana}>{c.campana}</span>
                <span className="font-semibold text-brand-ink">{formatInt(c.gestiones)}</span>
                <span className="text-xs text-brand-slate w-16 text-right">{formatPct(c.pct_contacto)} cont.</span>
                <span className="text-xs text-emerald-700 w-14 text-right">{formatInt(c.aceptas)} acep.</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card p-6 mb-6">
        <h2 className="font-display text-xl text-brand-ink uppercase mb-1">Productividad por operador</h2>
        <p className="text-xs text-brand-slate mb-4">Clickeá un encabezado para ordenar.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-brand-bg">
              <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                <th onClick={() => clickSort("operador")} className="px-3 py-2 text-left cursor-pointer select-none hover:text-brand-ink">
                  Operador{sort.k === "operador" ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
                </th>
                <Th k="gestiones">Gestiones</Th>
                <Th k="contactos">Contactos</Th>
                <Th k="pct_contacto">% Cont.</Th>
                <Th k="agendados">Agend.</Th>
                <Th k="aceptas">Aceptas</Th>
                <Th k="tasa_aceptacion_pct">% Acept.</Th>
                <Th k="dias_activos">Días</Th>
                <Th k="prom_diario">Prom./día</Th>
              </tr>
            </thead>
            <tbody>
              {ops.map((o) => (
                <tr key={o.operador} className="border-t border-brand-border hover:bg-brand-bg-soft">
                  <td className="px-3 py-2 font-medium text-brand-ink">{o.operador}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatInt(o.gestiones)}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{formatInt(o.contactos)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatPct(o.pct_contacto)}</td>
                  <td className="px-3 py-2 text-right text-brand-cyan">{formatInt(o.agendados)}</td>
                  <td className="px-3 py-2 text-right text-brand-orange font-semibold">{formatInt(o.aceptas)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatPct(o.tasa_aceptacion_pct)}</td>
                  <td className="px-3 py-2 text-right">{formatInt(o.dias_activos)}</td>
                  <td className="px-3 py-2 text-right">{formatInt(o.prom_diario)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {v?.disponible && (
        <>
          <h2 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold mb-3">La Voz del Cliente en Ventas</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <KpiCard label="Observaciones analizadas" value={formatInt(v.total_observaciones)} hint={`${formatPct(v.pct_con_observacion)} de las gestiones`} accent="purple" />
            <KpiCard label="Motivos de no-venta" value={formatInt(v.no_venta?.total ?? 0)} hint="observaciones de 'No acepta'" accent="orange" />
            <KpiCard label="Motivos distintos" value={formatInt((v.motivos || []).length)} accent="cyan" />
            <KpiCard label="Frases frecuentes" value={formatInt((v.frases || []).length)} accent="neutral" />
          </div>

          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <section className="card p-6">
              <h3 className="text-sm font-semibold text-brand-ink mb-3">Motivos de NO-VENTA (qué dice el cliente)</h3>
              <DistBar data={(v.no_venta?.motivos || []).map((m: any) => ({ label: m.label, cantidad: m.cantidad, pct: m.pct }))} color="#E6332A" />
              <div className="mt-3 space-y-1.5">
                {(v.no_venta?.motivos || []).filter((m: any) => m.ejemplos?.length).slice(0, 4).map((m: any) => (
                  <p key={m.label} className="text-xs text-brand-slate"><b className="text-brand-ink">{m.label}:</b> “{m.ejemplos[0]}”</p>
                ))}
              </div>
            </section>
            <section className="card p-6">
              <h3 className="text-sm font-semibold text-brand-ink mb-3">Motivos generales (todas las observaciones)</h3>
              <DistBar data={(v.motivos || []).map((m: any) => ({ label: m.label, cantidad: m.cantidad, pct: m.pct }))}
                palette={["#00B2BF", "#662483", "#E6332A", "#F39200", "#0891b2", "#7c3aed"]} />
            </section>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <section className="card p-6">
              <h3 className="text-sm font-semibold text-brand-ink mb-3">Nube de palabras</h3>
              <TagCloud tags={v.nube || []} max={40} />
            </section>
            <section className="card p-6">
              <h3 className="text-sm font-semibold text-brand-ink mb-3">Frases frecuentes</h3>
              <div className="space-y-1">
                {(v.frases || []).slice(0, 12).map((f: any) => (
                  <div key={f.frase} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 text-brand-graphite">“{f.frase}”</span>
                    <span className="font-semibold text-brand-ink">{formatInt(f.cantidad)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </AppShell>
  );
}
