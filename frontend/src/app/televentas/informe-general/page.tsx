"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bar, BarChart, Cell, CartesianGrid, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { MonthNavigator } from "@/components/MonthNavigator";
import { PrintButton, PrintCover } from "@/components/PrintButton";
import { apiFetch, getUser } from "@/lib/api";
import { formatGs, formatInt, formatPct } from "@/lib/format";
import { monthLabel } from "@/lib/month";

const PIE = ["#F39200", "#00B2BF", "#E6332A", "#662483", "#10B981", "#0F1116"];
const MOTIVO: Record<string, string> = { baja_produccion: "Baja producción", bajas_llamadas: "Bajas llamadas" };

export default function TeleventasInformePage() {
  const [user, setUser] = useState<any>(null);
  const [months, setMonths] = useState<string[]>([]);
  const [month, setMonth] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [loading, setLoading] = useState(true);
  const [ov, setOv] = useState<any>(null);
  const [llamadas, setLlamadas] = useState<any>(null);
  const [produccion, setProduccion] = useState<any>(null);
  const [crm, setCrm] = useState<any>(null);
  const [incGerencial, setIncGerencial] = useState(true);
  const [incLlamadas, setIncLlamadas] = useState(true);
  const [incProduccion, setIncProduccion] = useState(true);
  const [incCrm, setIncCrm] = useState(true);

  useEffect(() => { setUser(getUser()); load(); }, []);

  const load = (m?: string | null) => {
    setLoading(true);
    apiFetch<any>(`/api/v1/televentas/overview${m ? `?month=${m}` : ""}`).then(async (d) => {
      setOv(d); setMonth(d.month);
      setTitulo((t) => t || `Informe de Televentas — ${d.month ? monthLabel(d.month) : ""}`);
      setMonths(d.available_months || []);
      const [ll, pr, crmList] = await Promise.all([
        d.llamadas_report_id ? apiFetch<any>(`/api/v1/televentas/llamadas/reports/${d.llamadas_report_id}`).catch(() => null) : null,
        d.produccion_report_id ? apiFetch<any>(`/api/v1/televentas/produccion/reports/${d.produccion_report_id}`).catch(() => null) : null,
        apiFetch<{ items: any[] }>("/api/v1/televentas/crm/reports").catch(() => ({ items: [] })),
      ]);
      setLlamadas(ll); setProduccion(pr);
      const crmPub = (crmList.items || []).find((r: any) => r.is_published && r.period_month?.slice(0, 7) === d.month);
      setCrm(crmPub ? await apiFetch<any>(`/api/v1/televentas/crm/reports/${crmPub.id}`).catch(() => null) : null);
    }).finally(() => setLoading(false));
  };

  const canUse = user && (user.role === "superadmin" || user.role === "analyst");
  const o = ov?.overview;

  if (user && !canUse) {
    return <AppShell><div className="card p-8 text-center"><p className="text-brand-slate">El informe general es solo para analistas y superadmin.</p></div></AppShell>;
  }

  return (
    <AppShell>
      <div className="no-print">
        <div className="mb-2 text-xs text-brand-slate">
          <Link href="/televentas" className="hover:text-brand-primary">Televentas</Link>
          <span className="mx-2">/</span><span className="text-brand-ink font-semibold">Informe General</span>
        </div>
        <div className="mb-5">
          <h1 className="font-display text-3xl sm:text-4xl text-brand-ink uppercase">Informe General de Televentas</h1>
          <p className="text-sm text-brand-slate mt-1 max-w-2xl">Consolidá gerencial + llamadas + producción en un PDF corporativo. Solo aparecen los reportes publicados del mes.</p>
        </div>
        <div className="card p-5 mb-6 flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-5">
            <div>
              <label className="label">Mes</label>
              {months.length > 0 ? <MonthNavigator months={months} value={month} onChange={(m) => { setMonth(m); load(m); }} />
                : <p className="text-sm text-brand-slate">Sin meses con datos publicados.</p>}
            </div>
            <div className="flex-1 min-w-[240px]">
              <label className="label">Título del informe</label>
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Incluir</label>
            <div className="flex flex-wrap gap-3">
              <Toggle label="Resumen gerencial" checked={incGerencial} avail={!!o} onChange={setIncGerencial} />
              <Toggle label="Reporte de Llamadas" checked={incLlamadas} avail={!!llamadas} onChange={setIncLlamadas} />
              <Toggle label="Reporte de Producción" checked={incProduccion} avail={!!produccion} onChange={setIncProduccion} />
              <Toggle label="Gestiones CRM" checked={incCrm} avail={!!crm} onChange={setIncCrm} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <PrintButton label="Imprimir / Guardar PDF" className="!btn-primary" />
            {loading && <span className="text-xs text-brand-slate">Cargando…</span>}
          </div>
        </div>
        <div className="mb-3 text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold">Vista previa del informe</div>
      </div>

      <PrintCover titulo={titulo} periodo={month ? monthLabel(month) : undefined} />

      {!loading && !o && <div className="card p-10 text-center text-brand-slate">No hay reportes publicados para este mes.</div>}

      {incGerencial && o && <GerencialPrint o={o} month={month} />}
      {incLlamadas && llamadas && <LlamadasPrint r={llamadas} />}
      {incProduccion && produccion && <ProduccionPrint r={produccion} />}
      {incCrm && crm && <CrmPrint r={crm} />}
    </AppShell>
  );
}

function CrmPrint({ r }: { r: any }) {
  const k = r.data.kpis;
  const v = r.data.voz_ventas || {};
  return (
    <Block title="Gestiones CRM">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiCard label="Gestiones" value={formatInt(k.total_gestiones)} hint={`${formatInt(k.prom_gestiones_dia)} /día`} accent="primary" />
        <KpiCard label="Contactos" value={formatInt(k.contactos)} hint={`${formatPct(k.tasa_contacto_pct)} tasa de contacto`} accent="cyan" />
        <KpiCard label="Agendados" value={formatInt(k.agendados)} accent="purple" />
        <KpiCard label="Aceptas" value={formatInt(k.aceptas)} hint={`${formatPct(k.tasa_aceptacion_pct)} sobre contactos`} accent="orange" />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-brand-ink mb-3">Funnel por subestado</h3>
          <div className="space-y-1.5">
            {(r.data.por_subestado || []).map((s: any) => (
              <div key={s.subestado} className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-brand-graphite">{s.subestado}</span>
                <span className="font-semibold text-brand-ink">{formatInt(s.cantidad)}</span>
                <span className="text-xs text-brand-slate w-12 text-right">{formatPct(s.pct)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-brand-ink mb-3">Motivos de no-venta (qué dice el cliente)</h3>
          <div className="space-y-1.5">
            {(v.no_venta?.motivos || []).slice(0, 8).map((m: any) => (
              <div key={m.label} className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-brand-graphite">{m.label}</span>
                <span className="font-semibold text-brand-ink">{formatInt(m.cantidad)}</span>
                <span className="text-xs text-brand-slate w-12 text-right">{formatPct(m.pct)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Block>
  );
}

function Toggle({ label, checked, avail, onChange }: { label: string; checked: boolean; avail: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm ${!avail ? "opacity-50 border-brand-border" : "cursor-pointer border-brand-border hover:border-brand-orange"}`}>
      <input type="checkbox" checked={checked && avail} disabled={!avail} onChange={(e) => onChange(e.target.checked)} className="accent-brand-orange" />
      <span className="font-medium text-brand-ink">{label}</span>
      {!avail && <span className="text-[10px] uppercase tracking-wider2 text-brand-mist">no publicado</span>}
    </label>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="font-display text-xl text-brand-ink uppercase mb-3 pb-1 border-b-2 border-brand-orange inline-block">{title}</h2>
      {children}
    </section>
  );
}

function GerencialPrint({ o, month }: { o: any; month: string | null }) {
  const k = o.kpis;
  const daily = mergeDaily(o.llam_por_dia, o.prod_por_dia);
  return (
    <Block title={`Resumen Gerencial${month ? ` · ${monthLabel(month)}` : ""}`}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <KpiCard label="Prima emitida" value={formatGs(k.prima_emitida)} hint={`${formatInt(k.polizas_emitidas)} pólizas`} accent="primary" />
        <KpiCard label="Ticket promedio" value={formatGs(k.ticket_promedio)} accent="cyan" />
        <KpiCard label="Prima anulada" value={formatGs(k.prima_anulada)} hint={`${formatInt(k.polizas_anuladas)} anuladas`} accent="orange" />
        <KpiCard label="Conversión" value={formatPct(k.conversion_pct)} accent="purple" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard label="Llamadas" value={formatInt(k.total_llamadas)} hint={`${formatInt(k.contestadas)} contest.`} accent="cyan" />
        <KpiCard label="% Contestadas" value={formatPct(k.pct_contestadas)} hint={`TMO ${k.tmo_hms}`} accent="neutral" />
        <KpiCard label="Días productivos" value={formatInt(k.dias_productivos)} hint={`${formatInt(k.dias_no_productivos)} sin ventas`} accent="primary" />
        <KpiCard label="Vendedores en alerta" value={formatInt(o.alertas.length)} accent={o.alertas.length ? "orange" : "neutral"} />
      </div>

      {o.alertas.length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-brand-ink mb-2">Alertas de vendedores</h3>
          <div className="grid md:grid-cols-3 gap-2">
            {o.alertas.map((a: any) => (
              <div key={a.vendedor} className="card p-3 border-l-4 border-brand-orange">
                <div className="font-semibold text-brand-ink text-sm">{a.vendedor}</div>
                <div className="text-[11px] text-brand-orange">{a.motivos.map((m: string) => MOTIVO[m] ?? m).join(" · ")}</div>
                <div className="text-[11px] text-brand-slate">Prima {formatGs(a.prima_emitida)} · {formatInt(a.llamadas)} llam.</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-5 mb-4">
        <h3 className="text-sm font-semibold text-brand-ink mb-3">Tendencia diaria (llamadas vs prima)</h3>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={daily}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="fecha" fontSize={10} /><YAxis yAxisId="l" fontSize={10} />
            <YAxis yAxisId="r" orientation="right" fontSize={10} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
            <Tooltip formatter={(v: any, n: any) => (n === "Prima" ? formatGs(v as number) : v)} />
            <Bar yAxisId="l" dataKey="llamadas" name="Llamadas" fill="#00B2BF" radius={[3, 3, 0, 0]} />
            <Line yAxisId="r" dataKey="prima" name="Prima" stroke="#F39200" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg border-b border-brand-border">
            <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
              <th className="px-3 py-2 text-left">Vendedor</th><th className="px-3 py-2 text-right">Llamadas</th>
              <th className="px-3 py-2 text-right">Contest.</th><th className="px-3 py-2 text-right">Pólizas</th>
              <th className="px-3 py-2 text-right">Prima emitida</th><th className="px-3 py-2 text-right">Conv.</th>
            </tr>
          </thead>
          <tbody>
            {o.por_vendedor.map((v: any) => (
              <tr key={v.vendedor} className="border-t border-brand-border">
                <td className="px-3 py-2 font-medium text-brand-ink">{v.vendedor}</td>
                <td className="px-3 py-2 text-right">{formatInt(v.llamadas)}</td>
                <td className="px-3 py-2 text-right text-emerald-700">{formatInt(v.contestadas)}</td>
                <td className="px-3 py-2 text-right font-semibold">{formatInt(v.polizas)}</td>
                <td className="px-3 py-2 text-right font-semibold">{formatGs(v.prima_emitida)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatPct(v.conversion_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Block>
  );
}

function LlamadasPrint({ r }: { r: any }) {
  const k = r.data.kpis;
  return (
    <Block title="Reporte de Llamadas">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiCard label="Total llamadas" value={formatInt(k.total_llamadas)} hint={`${formatInt(k.promedio_diario)} /día`} accent="primary" />
        <KpiCard label="Contestadas" value={formatInt(k.contestadas)} hint={formatPct(k.pct_contestadas)} accent="cyan" />
        <KpiCard label="TMO" value={k.tmo_hms} accent="purple" />
        <KpiCard label="Días operativos" value={formatInt(k.dias_operativos)} accent="neutral" />
      </div>
      <div className="card p-5 mb-4">
        <h3 className="text-sm font-semibold text-brand-ink mb-3">Llamadas por día</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={r.data.por_dia}>
            <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="fecha" fontSize={10} /><YAxis fontSize={10} /><Tooltip />
            <Bar dataKey="contestadas" name="Contestadas" stackId="a" fill="#00B2BF" />
            <Bar dataKey="no_contestadas" name="No contest." stackId="a" fill="#F39200" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg"><tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
            <th className="px-3 py-2 text-left">Vendedor</th><th className="px-3 py-2 text-right">Llamadas</th>
            <th className="px-3 py-2 text-right">Contest.</th><th className="px-3 py-2 text-right">% Contest.</th><th className="px-3 py-2 text-right">TMO</th>
          </tr></thead>
          <tbody>
            {r.data.por_vendedor.map((v: any) => (
              <tr key={v.vendedor} className="border-t border-brand-border">
                <td className="px-3 py-2 font-medium text-brand-ink">{v.vendedor}</td>
                <td className="px-3 py-2 text-right font-semibold">{formatInt(v.llamadas)}</td>
                <td className="px-3 py-2 text-right text-emerald-700">{formatInt(v.contestadas)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatPct(v.pct_contestadas)}</td>
                <td className="px-3 py-2 text-right font-mono">{v.tmo_hms}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Block>
  );
}

function ProduccionPrint({ r }: { r: any }) {
  const k = r.data.kpis;
  const pie = r.data.por_producto.map((p: any) => ({ name: p.producto, value: p.prima }));
  return (
    <Block title="Reporte de Producción">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiCard label="Pólizas emitidas" value={formatInt(k.polizas_emitidas)} accent="primary" />
        <KpiCard label="Prima emitida" value={formatGs(k.prima_emitida)} accent="cyan" />
        <KpiCard label="Ticket promedio" value={formatGs(k.ticket_promedio)} accent="purple" />
        <KpiCard label="Prima anulada" value={formatGs(k.prima_anulada)} hint={`${formatInt(k.polizas_anuladas)} anul.`} accent="orange" />
      </div>
      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-brand-ink mb-3">Producción por día</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={r.data.por_dia}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="fecha" fontSize={10} />
              <YAxis fontSize={10} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} /><Tooltip formatter={(v: any) => formatGs(v as number)} />
              <Bar dataKey="prima" name="Prima" fill="#F39200" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-brand-ink mb-3">Tipos de póliza</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={90} paddingAngle={2}>
                {pie.map((_: any, i: number) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
              </Pie>
              <Tooltip formatter={(v: any) => formatGs(v as number)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg"><tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
            <th className="px-3 py-2 text-left">Vendedor</th><th className="px-3 py-2 text-right">Pólizas</th>
            <th className="px-3 py-2 text-right">Prima emitida</th><th className="px-3 py-2 text-right">Ticket</th><th className="px-3 py-2 text-right">Prima anulada</th>
          </tr></thead>
          <tbody>
            {r.data.por_vendedor.map((v: any) => (
              <tr key={v.vendedor} className="border-t border-brand-border">
                <td className="px-3 py-2 font-medium text-brand-ink">{v.vendedor}</td>
                <td className="px-3 py-2 text-right font-semibold">{formatInt(v.polizas)}</td>
                <td className="px-3 py-2 text-right text-emerald-700 font-semibold">{formatGs(v.prima_emitida)}</td>
                <td className="px-3 py-2 text-right">{formatGs(v.ticket)}</td>
                <td className="px-3 py-2 text-right text-brand-orange">{formatGs(v.prima_anulada)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Block>
  );
}

function mergeDaily(llam: any[] = [], prod: any[] = []) {
  const map: Record<string, any> = {};
  for (const d of llam) map[d.fecha] = { fecha: d.fecha, llamadas: d.llamadas, prima: 0 };
  for (const d of prod) map[d.fecha] = { ...(map[d.fecha] || { fecha: d.fecha, llamadas: 0 }), prima: d.prima };
  return Object.values(map).sort((a: any, b: any) => a.fecha.localeCompare(b.fecha));
}
