"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { MonthNavigator } from "@/components/MonthNavigator";
import { PrintButton, PrintCover } from "@/components/PrintButton";
import { AsesoresDetalleTabla } from "@/components/charts/AsesoresDetalleTabla";
import { AsesoresLlamadasChart } from "@/components/charts/AsesoresLlamadasChart";
import { LlamadasPorDiaChart } from "@/components/charts/LlamadasPorDiaChart";
import { TalkPorDiaChart } from "@/components/charts/TalkPorDiaChart";
import { apiFetch, getUser } from "@/lib/api";
import { formatGs, formatInt, formatPct } from "@/lib/format";
import { monthLabel } from "@/lib/month";

const sameMonth = (period: string | null, month: string) => !!period && period.slice(0, 7) === month;
const fmtMinSeg = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const PIE = ["#9CA3AF", "#00B2BF", "#E6332A", "#F39200", "#662483", "#0F1116", "#10B981", "#EC4899", "#8B5CF6", "#FB923C"];

export default function InformeGeneralPage() {
  const [user, setUser] = useState<any>(null);
  const [months, setMonths] = useState<string[]>([]);
  const [month, setMonth] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [loading, setLoading] = useState(false);

  const [overview, setOverview] = useState<any>(null);
  const [llamadas, setLlamadas] = useState<any>(null);
  const [gestiones, setGestiones] = useState<any>(null);

  const [incGerencial, setIncGerencial] = useState(true);
  const [incLlamadas, setIncLlamadas] = useState(true);
  const [incGestiones, setIncGestiones] = useState(true);

  useEffect(() => {
    setUser(getUser());
    apiFetch<any>("/api/v1/overview").then((d) => {
      setMonths(d.available_months || []);
      setMonth(d.available_months?.[0] ?? null);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!month) return;
    setLoading(true);
    setTitulo((t) => t || `Informe General — ${monthLabel(month)}`);
    (async () => {
      try {
        const ov = await apiFetch<any>(`/api/v1/overview?month=${month}`);
        setOverview(ov);

        const calls = await apiFetch<{ items: any[] }>("/api/v1/calls/reports");
        const cs = calls.items.find((r) => r.is_published && sameMonth(r.period_month, month));
        setLlamadas(cs ? await apiFetch<any>(`/api/v1/calls/reports/${cs.id}`) : null);

        const gest = await apiFetch<{ items: any[] }>("/api/v1/gestiones/reports");
        const gs = gest.items.find((r) => r.is_published && sameMonth(r.period_month, month));
        setGestiones(gs ? await apiFetch<any>(`/api/v1/gestiones/reports/${gs.id}`) : null);
      } finally {
        setLoading(false);
      }
    })();
  }, [month]);

  const canUse = user && (user.role === "superadmin" || user.role === "analyst");

  const availability = useMemo(() => ({
    gerencial: !!(overview && (overview.carteras || overview.llamadas || overview.gestiones)),
    llamadas: !!llamadas,
    gestiones: !!gestiones,
  }), [overview, llamadas, gestiones]);

  if (user && !canUse) {
    return <AppShell><div className="card p-8 text-center"><p className="text-brand-slate">El informe general es solo para analistas y superadmin.</p></div></AppShell>;
  }

  return (
    <AppShell>
      {/* Controles (no se imprimen) */}
      <div className="no-print">
        <div className="mb-2 text-xs text-brand-slate">
          <Link href="/cobranzas" className="hover:text-brand-primary">Cobranzas</Link>
          <span className="mx-2">/</span>
          <span className="text-brand-ink font-semibold">Informe General</span>
        </div>
        <div className="mb-5">
          <h1 className="font-display text-3xl sm:text-4xl text-brand-ink uppercase">Informe General del Mes</h1>
          <p className="text-sm text-brand-slate mt-1 max-w-2xl">
            Armá un informe consolidado (gerencial + llamadas + gestiones), elegí qué incluir y un título, y guardalo como PDF.
            Solo aparecen los reportes publicados del mes.
          </p>
        </div>

        <div className="card p-5 mb-6 flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-5">
            <div>
              <label className="label">Mes</label>
              {months.length > 0
                ? <MonthNavigator months={months} value={month} onChange={setMonth} />
                : <p className="text-sm text-brand-slate">Sin meses con datos publicados.</p>}
            </div>
            <div className="flex-1 min-w-[240px]">
              <label className="label">Título del informe</label>
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="input" placeholder="Informe General — Mayo 2026" />
            </div>
          </div>

          <div>
            <label className="label">Incluir en el informe</label>
            <div className="flex flex-wrap gap-3">
              <Toggle label="Resumen gerencial" checked={incGerencial} disabled={!availability.gerencial} onChange={setIncGerencial} avail={availability.gerencial} />
              <Toggle label="Reporte de Llamadas" checked={incLlamadas} disabled={!availability.llamadas} onChange={setIncLlamadas} avail={availability.llamadas} />
              <Toggle label="Reporte de Gestiones" checked={incGestiones} disabled={!availability.gestiones} onChange={setIncGestiones} avail={availability.gestiones} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <PrintButton label="Imprimir / Guardar PDF" className="!btn-primary" />
            {loading && <span className="text-xs text-brand-slate">Cargando datos…</span>}
          </div>
        </div>
      </div>

      {/* Vista imprimible */}
      <div>
        <PrintCover titulo={titulo} periodo={month ? monthLabel(month) : undefined} />

        {/* En pantalla, un encabezado de preview */}
        <div className="no-print mb-3 text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold">Vista previa del informe</div>

        {incGerencial && availability.gerencial && <GerencialPreview ov={overview} />}
        {incLlamadas && availability.llamadas && <LlamadasPreview r={llamadas} />}
        {incGestiones && availability.gestiones && <GestionesPreview r={gestiones} />}

        {!loading && !availability.gerencial && !availability.llamadas && !availability.gestiones && (
          <div className="card p-10 text-center text-brand-slate">No hay reportes publicados para este mes.</div>
        )}
      </div>
    </AppShell>
  );
}

function Toggle({ label, checked, disabled, onChange, avail }: { label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; avail: boolean }) {
  return (
    <label className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm ${disabled ? "opacity-50 border-brand-border" : "cursor-pointer border-brand-border hover:border-brand-cyan"}`}>
      <input type="checkbox" checked={checked && avail} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="accent-brand-cyan" />
      <span className="font-medium text-brand-ink">{label}</span>
      {!avail && <span className="text-[10px] uppercase tracking-wider2 text-brand-mist">no publicado</span>}
    </label>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7" style={{ pageBreakInside: "auto" }}>
      <h2 className="font-display text-xl text-brand-ink uppercase mb-3 pb-1 border-b-2 border-brand-primary inline-block">{title}</h2>
      {children}
    </section>
  );
}

function GerencialPreview({ ov }: { ov: any }) {
  const c = ov.carteras;
  const g = ov.gestiones;
  const l = ov.llamadas;
  const pctMora = c && c.asegurados ? (c.asegurados_mora / c.asegurados) * 100 : 0;
  return (
    <Block title="Resumen Gerencial">
      {/* Operación del mes */}
      <h3 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold mb-2">Operación del mes</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        {ov.rendimiento && <KpiCard label="Rendimiento estimativo" value={`${ov.rendimiento.pct}%`} hint={`${formatInt(ov.rendimiento.gestiones)} gest. / ${formatInt(ov.rendimiento.asegurados)} aseg.`} accent="primary" />}
        {l && <KpiCard label="Llamadas" value={formatInt(l.total_llamadas)} hint={`${formatInt(l.efectivas_total)} efectivas`} accent="purple" />}
        {l && <KpiCard label="Total hablado" value={`${(l.total_talk_seg / 3600).toFixed(1)} hs`} hint={`AHT ${fmtMinSeg(l.aht_seg)}`} accent="cyan" />}
        {l && <KpiCard label="Asesores activos" value={formatInt(l.asesores_activos)} accent="neutral" />}
      </div>
      {g && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <KpiCard label="Gestiones" value={formatInt(g.total_gestiones)} accent="secondary" />
          <KpiCard label="Contactos efectivos" value={formatInt(g.contactos_efectivos)} hint={`${formatPct(g.pct_contactos_efectivos)}`} accent="primary" />
          <KpiCard label="Promesas obtenidas" value={formatInt(g.promesas_totales)} hint={`${formatPct(g.pct_promesas)}`} accent="cyan" />
          <KpiCard label="Promesas cumplidas" value={formatInt(g.cobros_totales)} hint={`${formatPct(g.pct_promesas_cumplidas)}`} accent="orange" />
        </div>
      )}

      {c && (
        <>
          <h3 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold mb-2">Cartera consolidada</h3>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
            <KpiCard label="Pólizas" value={formatInt(c.polizas)} accent="secondary" />
            <KpiCard label="Asegurados" value={formatInt(c.asegurados)} accent="cyan" />
            <KpiCard label="Clientes en mora" value={formatInt(c.asegurados_mora)} hint={`${formatPct(pctMora)} de la cartera`} accent="orange" />
            <KpiCard label="Saldo total" value={formatGs(c.saldo_total)} accent="primary" />
            <KpiCard label="Saldo en mora" value={formatGs(c.saldo_mora)} accent="orange" />
            <KpiCard label="Recupero" value={formatGs(c.recupero)} accent="neutral" />
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-bg border-b border-brand-border">
                <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                  <th className="px-3 py-2 text-left">Cartera</th>
                  <th className="px-3 py-2 text-right">Pólizas</th>
                  <th className="px-3 py-2 text-right">Asegurados</th>
                  <th className="px-3 py-2 text-right">En mora</th>
                  <th className="px-3 py-2 text-right">Saldo total</th>
                  <th className="px-3 py-2 text-right">Saldo en mora</th>
                  <th className="px-3 py-2 text-right">Recupero</th>
                </tr>
              </thead>
              <tbody>
                {c.items.map((it: any) => (
                  <tr key={it.fuente} className="border-t border-brand-border">
                    <td className="px-3 py-2 font-medium text-brand-ink">{it.nombre}</td>
                    <td className="px-3 py-2 text-right">{formatInt(it.polizas)}</td>
                    <td className="px-3 py-2 text-right">{formatInt(it.asegurados)}</td>
                    <td className="px-3 py-2 text-right">{formatInt(it.asegurados_mora)}</td>
                    <td className="px-3 py-2 text-right">{formatGs(it.saldo_total)}</td>
                    <td className="px-3 py-2 text-right text-brand-orange">{formatGs(it.saldo_mora)}</td>
                    <td className="px-3 py-2 text-right">{formatGs(it.recupero)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-brand-ink font-semibold bg-brand-bg">
                  <td className="px-3 py-2 text-brand-ink">Total</td>
                  <td className="px-3 py-2 text-right">{formatInt(c.polizas)}</td>
                  <td className="px-3 py-2 text-right">{formatInt(c.asegurados)}</td>
                  <td className="px-3 py-2 text-right">{formatInt(c.asegurados_mora)}</td>
                  <td className="px-3 py-2 text-right">{formatGs(c.saldo_total)}</td>
                  <td className="px-3 py-2 text-right text-brand-orange">{formatGs(c.saldo_mora)}</td>
                  <td className="px-3 py-2 text-right">{formatGs(c.recupero)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </Block>
  );
}

function LlamadasPreview({ r }: { r: any }) {
  const k = r.data.kpis;
  return (
    <Block title="Reporte de Llamadas">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <KpiCard label="Total llamadas" value={formatInt(k.total_llamadas)} hint={`${formatInt(k.promedio_diario)} /día`} accent="primary" />
        <KpiCard label="Talk time" value={k.total_talk_hms} hint={`${k.total_talk_horas} hs`} accent="cyan" />
        <KpiCard label="Efectivas" value={formatInt(k.efectivas_total)} hint={`${k.pct_efectivas}%`} accent="primary" />
        <KpiCard label="No efectivas" value={formatInt(k.no_efectivas_total)} accent="orange" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard label="AHT" value={k.aht_hms} accent="neutral" />
        <KpiCard label="Promedio diario" value={formatInt(k.promedio_diario)} accent="cyan" />
        <KpiCard label="Días operativos" value={formatInt(k.dias_operativos)} accent="neutral" />
        <KpiCard label="Asesores activos" value={formatInt(k.asesores_activos)} accent="purple" />
      </div>
      <div className="card p-5 mb-4">
        <h3 className="text-sm font-semibold text-brand-ink mb-3">Llamadas por día y asesor</h3>
        <LlamadasPorDiaChart data={r.data.serie_diaria_llamadas} usuarios={r.data.usuarios} />
      </div>
      <div className="card p-5 mb-4">
        <h3 className="text-sm font-semibold text-brand-ink mb-3">Tiempo hablado por día</h3>
        <TalkPorDiaChart data={r.data.serie_diaria_talk} usuarios={r.data.usuarios} />
      </div>
      <div className="card p-5 mb-4">
        <h3 className="text-sm font-semibold text-brand-ink mb-3">Ranking de asesores por llamadas</h3>
        <AsesoresLlamadasChart asesores={r.data.asesores} />
      </div>
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-brand-ink mb-3">Detalle por operador</h3>
        <AsesoresDetalleTabla asesores={r.data.asesores} />
      </div>
    </Block>
  );
}

function MiniFunnelTable({ rows, labelHeader }: { rows: any[]; labelHeader: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-brand-bg">
          <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
            <th className="px-3 py-2 text-left">{labelHeader}</th>
            <th className="px-3 py-2 text-right">Gestiones</th>
            <th className="px-3 py-2 text-right">Contactos</th>
            <th className="px-3 py-2 text-right">% Cont.</th>
            <th className="px-3 py-2 text-right">Promesas</th>
            <th className="px-3 py-2 text-right">% Prom.</th>
            <th className="px-3 py-2 text-right">Cumplidas</th>
            <th className="px-3 py-2 text-right">% Cumpl.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.label} className="border-t border-brand-border">
              <td className="px-3 py-2 font-medium text-brand-ink max-w-xs truncate" title={a.label}>{a.label}</td>
              <td className="px-3 py-2 text-right font-semibold">{formatInt(a.gestiones)}</td>
              <td className="px-3 py-2 text-right">{formatInt(a.contactos_efectivos)}</td>
              <td className="px-3 py-2 text-right font-mono text-brand-primary">{formatPct(a.pct_contactos_efectivos)}</td>
              <td className="px-3 py-2 text-right text-brand-cyan font-semibold">{formatInt(a.promesas)}</td>
              <td className="px-3 py-2 text-right font-mono text-brand-cyan">{formatPct(a.pct_promesas_sobre_contactos)}</td>
              <td className="px-3 py-2 text-right text-brand-orange font-semibold">{formatInt(a.promesas_cumplidas)}</td>
              <td className="px-3 py-2 text-right font-mono text-brand-orange">{formatPct(a.pct_promesas_cumplidas)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GestionesPreview({ r }: { r: any }) {
  const f = r.data.funnel_equipo;
  const subs = r.data.subestados || [];
  const pie = subs.map((s: any) => ({ name: s.subestado, value: s.cantidad }));
  const max = Math.max(f.gestiones, 1);
  const w = (v: number) => `${Math.max((v / max) * 100, 6)}%`;
  const funnelRows = [
    { label: "Total gestiones", value: f.gestiones, hint: "Base del funnel", color: "bg-brand-ink" },
    { label: "Contactos efectivos", value: f.contactos_efectivos, hint: `${formatPct(f.pct_contactos_efectivos)} sobre gestiones`, color: "bg-brand-primary" },
    { label: "Promesas obtenidas", value: f.promesas, hint: `${formatPct(f.pct_promesas_sobre_contactos)} sobre contactos`, color: "bg-brand-cyan" },
    { label: "Promesas cumplidas", value: f.promesas_cumplidas, hint: `${formatPct(f.pct_promesas_cumplidas)} sobre promesas`, color: "bg-brand-orange" },
  ];
  const matrix = r.data.matrix_subestados;
  return (
    <Block title="Reporte de Gestiones">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiCard label="Total gestiones" value={formatInt(f.gestiones)} accent="secondary" />
        <KpiCard label="Contactos efectivos" value={formatInt(f.contactos_efectivos)} hint={formatPct(f.pct_contactos_efectivos)} accent="primary" />
        <KpiCard label="Promesas" value={formatInt(f.promesas)} hint={formatPct(f.pct_promesas_sobre_contactos)} accent="cyan" />
        <KpiCard label="Cumplidas" value={formatInt(f.promesas_cumplidas)} hint={formatPct(f.pct_promesas_cumplidas)} accent="orange" />
      </div>

      <div className="card p-5 mb-4">
        <h3 className="text-sm font-semibold text-brand-ink mb-3">Funnel del equipo</h3>
        <div className="space-y-2.5">
          {funnelRows.map((row) => (
            <div key={row.label}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-sm font-medium text-brand-graphite">{row.label}</span>
                <span className="text-sm font-bold text-brand-ink">{formatInt(row.value)}</span>
              </div>
              <div className="h-6 bg-brand-bg rounded">
                <div className={`h-full rounded flex items-center justify-end px-3 text-xs text-white ${row.color}`} style={{ width: w(row.value) }}>{row.hint}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5 mb-4">
        <h3 className="text-sm font-semibold text-brand-ink mb-3">Distribución por subestado</h3>
        <div className="grid md:grid-cols-2 gap-5 items-center">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pie} dataKey="value" nameKey="name" innerRadius={60} outerRadius={120} paddingAngle={2}>
                {pie.map((_: any, i: number) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1">
            {subs.map((s: any, i: number) => (
              <div key={s.subestado} className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded shrink-0" style={{ background: PIE[i % PIE.length] }} />
                <span className="flex-1 text-brand-graphite">{s.subestado}</span>
                <span className="font-semibold text-brand-ink">{formatInt(s.cantidad)}</span>
                <span className="text-xs text-brand-slate w-12 text-right">{formatPct(s.pct)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {matrix && matrix.data.length > 0 && (
        <div className="card p-5 mb-4">
          <h3 className="text-sm font-semibold text-brand-ink mb-3">Subestados por operador</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={matrix.data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="usuario" fontSize={11} interval={0} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {matrix.subestados.map((s: string, i: number) => (
                <Bar key={s} dataKey={s} stackId="a" fill={PIE[i % PIE.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="card p-5 mb-4">
        <h3 className="text-sm font-semibold text-brand-ink mb-3">Funnel por asesor</h3>
        <MiniFunnelTable rows={r.data.asesores.map((a: any) => ({ ...a, label: a.usuario }))} labelHeader="Asesor" />
      </div>

      {r.data.campanas?.length > 0 && (
        <div className="card p-5 mb-4">
          <h3 className="text-sm font-semibold text-brand-ink mb-3">Funnel por base de datos / campaña</h3>
          <MiniFunnelTable rows={r.data.campanas.map((c: any) => ({ ...c, label: c.campana }))} labelHeader="Base / Campaña" />
        </div>
      )}

      {r.data.serie_diaria?.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-brand-ink mb-3">Gestiones por día</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={r.data.serie_diaria}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="fecha" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Bar dataKey="gestiones" fill="#E6332A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Block>
  );
}
