"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { MonthNavigator } from "@/components/MonthNavigator";
import { PrintButton, PrintCover } from "@/components/PrintButton";
import { DistBar } from "@/components/charts/atencion/DistBar";
import { MultiLinea, type LineaSerie } from "@/components/charts/atencion/MultiLinea";
import { SerieDia } from "@/components/charts/atencion/SerieDia";
import { apiFetch, getUser } from "@/lib/api";
import { formatInt, formatPct } from "@/lib/format";
import { monthLabel } from "@/lib/month";

const ESTADO_COLORS: Record<string, string> = {
  Cerrado: "#2563eb", "En proceso": "#F39200", Pendiente: "#94a3b8",
};
const sameMonth = (p: string | null, m: string) => !!p && p.slice(0, 7) === m;
const hms = (s: number) => {
  s = Math.round(s || 0);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export default function AtencionInformeGeneralPage() {
  const [user, setUser] = useState<any>(null);
  const [months, setMonths] = useState<string[]>([]);
  const [month, setMonth] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [loading, setLoading] = useState(true);
  const [llamadas, setLlamadas] = useState<any>(null);
  const [gestiones, setGestiones] = useState<any>(null);
  const [incResumen, setIncResumen] = useState(true);
  const [incLlamadas, setIncLlamadas] = useState(true);
  const [incGestiones, setIncGestiones] = useState(true);
  const [lists, setLists] = useState<{ ll: any[]; ge: any[] }>({ ll: [], ge: [] });

  useEffect(() => {
    setUser(getUser());
    (async () => {
      try {
        const [ll, ge] = await Promise.all([
          apiFetch<{ items: any[] }>("/api/v1/atencion/llamadas/reports"),
          apiFetch<{ items: any[] }>("/api/v1/atencion/gestiones/reports"),
        ]);
        const pubLl = ll.items.filter((r) => r.is_published && r.period_month);
        const pubGe = ge.items.filter((r) => r.is_published && r.period_month);
        setLists({ ll: pubLl, ge: pubGe });
        const ms = Array.from(new Set([...pubLl, ...pubGe].map((r) => r.period_month.slice(0, 7)))).sort().reverse();
        setMonths(ms);
        if (ms[0]) selectMonth(ms[0], pubLl, pubGe);
        else setLoading(false);
      } catch {
        setLoading(false);
      }
    })();
  }, []);

  const selectMonth = async (m: string, pubLl = lists.ll, pubGe = lists.ge) => {
    setMonth(m);
    setLoading(true);
    setTitulo((t) => t && !t.startsWith("Informe de Atención") ? t : `Informe de Atención al Cliente — ${monthLabel(m)}`);
    const l = pubLl.find((r) => sameMonth(r.period_month, m));
    const g = pubGe.find((r) => sameMonth(r.period_month, m));
    const [ld, gd] = await Promise.all([
      l ? apiFetch<any>(`/api/v1/atencion/llamadas/reports/${l.id}`).catch(() => null) : null,
      g ? apiFetch<any>(`/api/v1/atencion/gestiones/reports/${g.id}`).catch(() => null) : null,
    ]);
    setLlamadas(ld);
    setGestiones(gd);
    setLoading(false);
  };

  const canUse = user && (user.role === "superadmin" || user.role === "analyst");
  if (user && !canUse) {
    return <AppShell><div className="card p-8 text-center"><p className="text-brand-slate">El informe general es solo para analistas y superadmin.</p></div></AppShell>;
  }

  return (
    <AppShell>
      <div className="no-print">
        <div className="mb-2 text-xs text-brand-slate">
          <Link href="/atencion" className="hover:text-brand-primary">Atención</Link>
          <span className="mx-2">/</span><span className="text-brand-ink font-semibold">Informe General</span>
        </div>
        <div className="mb-5">
          <h1 className="font-display text-3xl sm:text-4xl text-brand-ink uppercase">Informe General de Atención</h1>
          <p className="text-sm text-brand-slate mt-1 max-w-2xl">
            Consolidá llamadas + gestiones del mes en un PDF corporativo para presentar al cliente.
            Solo aparecen los reportes publicados.
          </p>
        </div>
        <div className="card p-5 mb-6 flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-5">
            <div>
              <label className="label">Mes</label>
              {months.length > 0
                ? <MonthNavigator months={months} value={month} onChange={(m) => selectMonth(m)} />
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
              <Toggle label="Resumen gerencial" checked={incResumen} avail={!!(llamadas || gestiones)} onChange={setIncResumen} />
              <Toggle label="Reporte de Llamadas" checked={incLlamadas} avail={!!llamadas} onChange={setIncLlamadas} />
              <Toggle label="Reporte de Gestiones" checked={incGestiones} avail={!!gestiones} onChange={setIncGestiones} />
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

      {!loading && !llamadas && !gestiones && (
        <div className="card p-10 text-center text-brand-slate">No hay reportes de Atención publicados para este mes.</div>
      )}

      {incResumen && (llamadas || gestiones) && <ResumenPrint ll={llamadas} ge={gestiones} month={month} />}
      {incLlamadas && llamadas && <LlamadasPrint r={llamadas} />}
      {incGestiones && gestiones && <GestionesPrint r={gestiones} />}
    </AppShell>
  );
}

function Toggle({ label, checked, avail, onChange }: { label: string; checked: boolean; avail: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm ${!avail ? "opacity-50 border-brand-border" : "cursor-pointer border-brand-border hover:border-brand-cyan"}`}>
      <input type="checkbox" checked={checked && avail} disabled={!avail} onChange={(e) => onChange(e.target.checked)} className="accent-brand-cyan" />
      <span className="font-medium text-brand-ink">{label}</span>
      {!avail && <span className="text-[10px] uppercase tracking-wider2 text-brand-mist">no publicado</span>}
    </label>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="font-display text-xl text-brand-ink uppercase mb-3 pb-1 border-b-2 border-brand-cyan inline-block">{title}</h2>
      {children}
    </section>
  );
}

function ResumenPrint({ ll, ge, month }: { ll: any; ge: any; month: string | null }) {
  const lk = ll?.data?.kpis;
  const gk = ge?.data?.kpis;
  return (
    <Block title={`Resumen Gerencial${month ? ` · ${monthLabel(month)}` : ""}`}>
      {lk && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <KpiCard label="Llamadas ingresadas" value={formatInt(lk.llamadas_ingresadas)} accent="cyan" />
          <KpiCard label="Contestadas" value={formatInt(lk.contestadas)} hint={`Nivel de atención ${formatPct(lk.nivel_atencion_pct)}`} accent="primary" />
          <KpiCard label="Abandonadas" value={formatInt(lk.abandonadas)} hint={formatPct(lk.abandono_pct)} accent="orange" />
          <KpiCard label="SLA" value={formatPct(lk.sla_pct)} hint={`AHT ${hms(lk.aht_seg)}`} accent="purple" />
        </div>
      )}
      {gk && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Gestiones" value={formatInt(gk.total_gestiones)} accent="purple" />
          <KpiCard label="Cerradas" value={formatInt(gk.cerrados)} hint={formatPct(gk.pct_cerrados)} accent="cyan" />
          <KpiCard label="Pendientes" value={formatInt(gk.pendientes)} hint={gk.en_proceso != null ? `+ ${formatInt(gk.en_proceso)} en proceso` : undefined} accent="orange" />
          <KpiCard label="Operadores / Motivos" value={`${formatInt(lk?.operadores_activos ?? 0)} / ${formatInt(gk.motivos_distintos)}`} hint="operadores · motivos distintos" accent="neutral" />
        </div>
      )}
    </Block>
  );
}

function LlamadasPrint({ r }: { r: any }) {
  const k = r.data.kpis;
  const colas = (r.data.por_cola || []).map((c: any) => ({ label: c.cola, cantidad: c.oferta, pct: c.nivel_atencion_pct }));
  return (
    <Block title="Reporte de Llamadas">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <KpiCard label="Ingresadas" value={formatInt(k.llamadas_ingresadas)} hint={`${formatInt(k.dias_operativos)} días`} accent="cyan" />
        <KpiCard label="Contestadas" value={formatInt(k.contestadas)} hint={`Atención ${formatPct(k.nivel_atencion_pct)}`} accent="primary" />
        <KpiCard label="Abandonadas" value={formatInt(k.abandonadas)} hint={formatPct(k.abandono_pct)} accent="orange" />
        <KpiCard label="SLA / AHT" value={formatPct(k.sla_pct)} hint={`AHT ${hms(k.aht_seg)}`} accent="purple" />
      </div>
      <div className="card p-5 mb-4">
        <h3 className="text-sm font-semibold text-brand-ink mb-3">Llamadas por día</h3>
        <SerieDia data={r.data.por_dia} bars={[
          { key: "oferta", name: "Ingresadas", color: "#94a3b8" },
          { key: "contestadas", name: "Contestadas", color: "#00B2BF" },
          { key: "abandonadas", name: "Abandonadas", color: "#E6332A" },
        ]} line={{ key: "nivel_atencion_pct", name: "Nivel atención %", color: "#662483" }} />
      </div>
      {colas.length > 0 && (
        <div className="card p-5 mb-4">
          <h3 className="text-sm font-semibold text-brand-ink mb-3">Por cola de atención</h3>
          <DistBar data={colas} color="#00B2BF" />
        </div>
      )}
      {(r.data.operadores || []).length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-bg border-b border-brand-border">
              <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                <th className="px-3 py-2 text-left">Operador</th>
                <th className="px-3 py-2 text-right">Entrantes</th>
                <th className="px-3 py-2 text-right">Salientes</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">AHT</th>
              </tr>
            </thead>
            <tbody>
              {r.data.operadores.map((o: any) => (
                <tr key={o.operador} className="border-t border-brand-border">
                  <td className="px-3 py-2 font-medium text-brand-ink">{o.operador}</td>
                  <td className="px-3 py-2 text-right">{formatInt(o.entrantes)}</td>
                  <td className="px-3 py-2 text-right">{formatInt(o.salientes)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatInt(o.total)}</td>
                  <td className="px-3 py-2 text-right font-mono">{hms(o.aht_seg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Block>
  );
}

function GestionesPrint({ r }: { r: any }) {
  const k = r.data.kpis;
  const d = r.data;
  const estados: string[] = d.estados_lista || [];
  const lineSeries: LineaSerie[] = estados.map((e, i) => ({
    key: e, name: e, color: ESTADO_COLORS[e] ?? ["#00B2BF", "#E6332A", "#662483", "#F39200"][i % 4],
  }));
  const rye = d.por_responsable_estado;
  return (
    <Block title="Reporte de Gestiones">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <KpiCard label="Gestiones" value={formatInt(k.total_gestiones)} accent="purple" />
        <KpiCard label="Cerradas" value={formatInt(k.cerrados)} hint={formatPct(k.pct_cerrados)} accent="cyan" />
        <KpiCard label="Pendientes" value={formatInt(k.pendientes)} hint={k.en_proceso != null ? `+ ${formatInt(k.en_proceso)} en proceso` : undefined} accent="orange" />
        <KpiCard label="Motivos distintos" value={formatInt(k.motivos_distintos)} accent="secondary" />
      </div>

      {(d.serie_estado_dia || []).length > 0 && (
        <div className="card p-5 mb-4">
          <h3 className="text-sm font-semibold text-brand-ink mb-3">Gestiones por día y estado</h3>
          <MultiLinea data={d.serie_estado_dia} series={lineSeries} />
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-brand-ink mb-3">Por tipo de caso</h3>
          <DistBar data={d.por_tipo || []} palette={["#00B2BF", "#E6332A", "#662483", "#F39200"]} />
        </div>
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-brand-ink mb-3">Por canal de contacto</h3>
          <DistBar data={d.por_canal || []} palette={["#662483", "#00B2BF", "#F39200", "#E6332A"]} />
        </div>
      </div>
      <div className="card p-5 mb-4">
        <h3 className="text-sm font-semibold text-brand-ink mb-3">Top motivos de contacto</h3>
        <DistBar data={(d.top_motivos || []).slice(0, 10)} color="#E6332A" />
      </div>

      {rye?.responsables?.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-bg border-b border-brand-border">
              <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                <th className="px-3 py-2 text-left">Responsable</th>
                {rye.estados.map((e: string) => <th key={e} className="px-3 py-2 text-right">{e}</th>)}
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rye.responsables.map((row: any) => (
                <tr key={row.responsable} className="border-t border-brand-border">
                  <td className="px-3 py-2 font-medium text-brand-ink">{row.responsable}</td>
                  {rye.estados.map((e: string) => (
                    <td key={e} className="px-3 py-2 text-right">{formatInt(row.por_estado?.[e] ?? 0)}</td>
                  ))}
                  <td className="px-3 py-2 text-right font-semibold">{formatInt(row.total)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-brand-ink bg-brand-bg font-semibold">
                <td className="px-3 py-2 text-brand-ink">Total general</td>
                {rye.estados.map((e: string) => (
                  <td key={e} className="px-3 py-2 text-right">{formatInt(rye.totales?.[e] ?? 0)}</td>
                ))}
                <td className="px-3 py-2 text-right">{formatInt(rye.totales?.total ?? 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Block>
  );
}
