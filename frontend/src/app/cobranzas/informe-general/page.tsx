"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Cell, Pie, PieChart, ResponsiveContainer, Tooltip,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { MonthNavigator } from "@/components/MonthNavigator";
import { PrintButton } from "@/components/PrintButton";
import { AsesoresDetalleTabla } from "@/components/charts/AsesoresDetalleTabla";
import { LlamadasPorDiaChart } from "@/components/charts/LlamadasPorDiaChart";
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
        <div className="print-only" style={{ borderTop: "4px solid #E6332A", paddingTop: 10, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 800, color: "#E6332A", fontSize: 18 }}>voicenter</div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#64748b" }}>Operaciones · Sudameris Seguros</div>
          </div>
          <h1 style={{ margin: "8px 0 2px", fontSize: 22, textTransform: "uppercase", color: "#0f172a" }}>{titulo || "Informe General"}</h1>
          <div style={{ fontSize: 12, color: "#64748b" }}>{month ? monthLabel(month) : ""}</div>
        </div>

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
  return (
    <Block title="Resumen Gerencial">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {ov.rendimiento && <KpiCard label="Rendimiento estimativo" value={`${ov.rendimiento.pct}%`} hint={`${formatInt(ov.rendimiento.gestiones)} gest. / ${formatInt(ov.rendimiento.asegurados)} aseg.`} accent="primary" />}
        {ov.llamadas && <KpiCard label="Llamadas" value={formatInt(ov.llamadas.total_llamadas)} hint={`${formatInt(ov.llamadas.efectivas_total)} efectivas`} accent="purple" />}
        {ov.llamadas && <KpiCard label="Total hablado" value={`${(ov.llamadas.total_talk_seg / 3600).toFixed(1)} hs`} hint={`AHT ${fmtMinSeg(ov.llamadas.aht_seg)}`} accent="cyan" />}
        {ov.gestiones && <KpiCard label="Gestiones" value={formatInt(ov.gestiones.total_gestiones)} hint={`${formatInt(ov.gestiones.promesas_totales)} promesas`} accent="secondary" />}
      </div>
      {c && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <KpiCard label="Pólizas" value={formatInt(c.polizas)} accent="secondary" />
            <KpiCard label="Asegurados" value={formatInt(c.asegurados)} accent="cyan" />
            <KpiCard label="Clientes en mora" value={formatInt(c.asegurados_mora)} accent="orange" />
            <KpiCard label="Saldo total" value={formatGs(c.saldo_total)} accent="primary" />
            <KpiCard label="Saldo en mora" value={formatGs(c.saldo_mora)} accent="orange" />
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-bg border-b border-brand-border">
                <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                  <th className="px-3 py-2 text-left">Cartera</th>
                  <th className="px-3 py-2 text-right">Pólizas</th>
                  <th className="px-3 py-2 text-right">Asegurados</th>
                  <th className="px-3 py-2 text-right">Saldo total</th>
                  <th className="px-3 py-2 text-right">Saldo en mora</th>
                </tr>
              </thead>
              <tbody>
                {c.items.map((it: any) => (
                  <tr key={it.fuente} className="border-t border-brand-border">
                    <td className="px-3 py-2 font-medium text-brand-ink">{it.nombre}</td>
                    <td className="px-3 py-2 text-right">{formatInt(it.polizas)}</td>
                    <td className="px-3 py-2 text-right">{formatInt(it.asegurados)}</td>
                    <td className="px-3 py-2 text-right">{formatGs(it.saldo_total)}</td>
                    <td className="px-3 py-2 text-right text-brand-orange">{formatGs(it.saldo_mora)}</td>
                  </tr>
                ))}
              </tbody>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiCard label="Total llamadas" value={formatInt(k.total_llamadas)} accent="primary" />
        <KpiCard label="Talk time" value={k.total_talk_hms} hint={`${k.total_talk_horas} hs`} accent="cyan" />
        <KpiCard label="Efectivas" value={formatInt(k.efectivas_total)} hint={`${k.pct_efectivas}%`} accent="primary" />
        <KpiCard label="AHT" value={k.aht_hms} accent="neutral" />
      </div>
      <div className="card p-5 mb-4">
        <h3 className="text-sm font-semibold text-brand-ink mb-3">Llamadas por día y asesor</h3>
        <LlamadasPorDiaChart data={r.data.serie_diaria_llamadas} usuarios={r.data.usuarios} />
      </div>
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-brand-ink mb-3">Detalle por operador</h3>
        <AsesoresDetalleTabla asesores={r.data.asesores} />
      </div>
    </Block>
  );
}

function GestionesPreview({ r }: { r: any }) {
  const f = r.data.funnel_equipo;
  const subs = r.data.subestados || [];
  const pie = subs.map((s: any) => ({ name: s.subestado, value: s.cantidad }));
  return (
    <Block title="Reporte de Gestiones">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiCard label="Total gestiones" value={formatInt(f.gestiones)} accent="secondary" />
        <KpiCard label="Contactos efectivos" value={formatInt(f.contactos_efectivos)} hint={`${f.pct_contactos_efectivos}%`} accent="primary" />
        <KpiCard label="Promesas" value={formatInt(f.promesas)} hint={`${f.pct_promesas_sobre_contactos}%`} accent="cyan" />
        <KpiCard label="Cumplidas" value={formatInt(f.promesas_cumplidas)} hint={`${f.pct_promesas_cumplidas}%`} accent="orange" />
      </div>
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-brand-ink mb-3">Distribución por subestado</h3>
        <div className="grid md:grid-cols-2 gap-5 items-center">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={pie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={110} paddingAngle={2}>
                {pie.map((_: any, i: number) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1">
            {subs.slice(0, 14).map((s: any, i: number) => (
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
    </Block>
  );
}
