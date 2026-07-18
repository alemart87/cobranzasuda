"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { InsightsPanel } from "@/components/televentas/InsightsPanel";
import { apiFetch } from "@/lib/api";
import { formatInt, formatPct } from "@/lib/format";

const CAT = { entregado: "#10B981", fallido: "#E6332A", en_curso: "#0EA5E9", pendiente: "#F39200", otro: "#94A3B8" };
const CATLBL: Record<string, string> = { entregado: "Entregado", fallido: "Fallido", en_curso: "En curso", pendiente: "Pendiente", otro: "Otro" };

export default function LogisticaDashboard() {
  const [cfg, setCfg] = useState<any>(null);
  const [ping, setPing] = useState<any>(null);
  const [ger, setGer] = useState<any>(null);
  const [mapa, setMapa] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [diag, setDiag] = useState<any>(null);
  const hoy = new Date().toISOString().slice(0, 10);
  const hace30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [desde, setDesde] = useState(hace30);
  const [hasta, setHasta] = useState(hoy);

  useEffect(() => {
    apiFetch<any>("/api/v1/logistica/config").then(setCfg).catch(() => {});
    apiFetch<any>("/api/v1/logistica/ping").then(setPing).catch(() => {});
  }, []);

  const cargar = () => {
    setLoading(true); setErr(null);
    Promise.all([
      apiFetch<any>(`/api/v1/logistica/gerencial?desde=${desde}&hasta=${hasta}`),
      apiFetch<any>(`/api/v1/logistica/mapa?desde=${desde}&hasta=${hasta}`).catch(() => null),
    ]).then(([g, m]) => { setGer(g); setMapa(m); }).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { if (cfg?.configurado) cargar(); else setLoading(false); }, [cfg]);

  const runDiag = () => apiFetch<any>("/api/v1/logistica/diagnostico").then(setDiag).catch((e) => setDiag({ ok: false, error: e.message }));

  const e = ger?.entregas; const r = e?.resumen; const ru = ger?.rutas;
  const puntos: any[] = mapa?.puntos ?? [];
  const cats = ["entregado", "fallido", "en_curso", "pendiente", "otro"] as const;

  return (
    <AppShell>
      <div className="mb-2 text-xs text-brand-slate">
        <Link href="/operativas" className="hover:text-brand-primary">Operativas</Link>
        <span className="mx-2">/</span><span className="text-brand-ink font-semibold">Logística</span>
      </div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-brand-ink uppercase">Logística</h1>
          <p className="text-sm text-brand-slate mt-1">Panel gerencial de entregas, rutas y flota (QuadMinds), con alertas y zonas de calor.</p>
        </div>
        <Link href="/logistica/agente" className="btn-primary inline-flex items-center gap-2">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
          Agente de Logística
        </Link>
      </div>

      {cfg && !cfg.configurado && (
        <div className="card p-6 mb-6 border-l-4 border-brand-orange">
          <h2 className="font-semibold text-brand-ink mb-1">Falta configurar la API de QuadMinds</h2>
          <p className="text-sm text-brand-slate">Cargá <code>QUADMINDS_API_KEY</code> en el servidor (header <code>{cfg.auth_header}</code>) y reiniciá el backend.</p>
        </div>
      )}

      {cfg?.configurado && (
        <div className="card p-4 mb-6 flex flex-wrap items-end gap-4 no-print">
          <div><label className="label">Desde</label><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="input max-w-[160px]" /></div>
          <div><label className="label">Hasta</label><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="input max-w-[160px]" /></div>
          <button onClick={cargar} className="btn-ghost">Actualizar</button>
          <button onClick={runDiag} className="btn-ghost text-xs">Diagnóstico</button>
          {ping?.ok && <span className="text-xs text-emerald-700 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Conectado</span>}
          {diag && (
            <div className="w-full text-xs card p-3 mt-1">
              {diag.ok ? <span className="text-emerald-700">✓ modo {diag.esquema_fecha?.modo} · estado ej.: <b>{diag.estado_detectado ?? "—"}</b> · campos: {(diag.campos_disponibles || []).join(", ")}</span>
                : <span className="text-brand-primary">{diag.error || diag.mensaje}</span>}
            </div>
          )}
        </div>
      )}

      {loading && <div className="text-brand-slate">Cargando panel…</div>}
      {err && <div className="card p-4 text-brand-primary text-sm mb-6">{err}</div>}

      {!loading && ger && e && (
        <>
          {ger.alertas?.length > 0 && <InsightsPanel insights={ger.alertas} titulo="Alertas gerenciales" />}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <KpiCard label="Órdenes" value={formatInt(e.total_ordenes)} hint={`${e.dias} día(s)`} accent="primary" />
            <KpiCard label="Entregadas" value={formatInt(r.entregado)} hint={formatPct(r.pct_entregado)} accent="cyan" />
            <KpiCard label="Fallidas" value={formatInt(r.fallido)} hint={formatPct(r.pct_fallido)} accent="orange" />
            <KpiCard label="Efectividad" value={formatPct(r.efectividad_sobre_cerradas)} hint="entregadas / cerradas" accent="secondary" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KpiCard label="Rutas" value={formatInt(ru?.total_rutas ?? 0)} accent="cyan" />
            <KpiCard label="Rutas atrasadas" value={formatInt(ru?.overdue ?? 0)} accent={ru?.overdue ? "orange" : "neutral"} />
            <KpiCard label="Km ejecutados" value={formatInt(ru?.km_ejecutado ?? 0)} hint={`desvío ${formatPct(ru?.km_desvio_pct ?? 0)}`} accent="neutral" />
            <KpiCard label="Choferes activos" value={formatInt(ru?.por_driver?.length ?? 0)} accent="purple" />
          </div>

          <section className="card p-6 mb-6">
            <h2 className="font-display text-xl text-brand-ink uppercase mb-4">Entregas por día</h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={e.por_dia}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="fecha" fontSize={10} /><YAxis fontSize={11} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
                {cats.map((c, i) => <Bar key={c} dataKey={c} name={CATLBL[c]} stackId="a" fill={CAT[c]} radius={i === cats.length - 1 ? [3, 3, 0, 0] : undefined} />)}
              </BarChart>
            </ResponsiveContainer>
          </section>

          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <section className="card p-6">
              <h2 className="font-display text-xl text-brand-ink uppercase mb-1">Zonas de calor (entregas)</h2>
              <p className="text-xs text-brand-slate mb-3">{puntos.length ? `${formatInt(puntos.length)} puntos ubicados` : "Sin coordenadas en las órdenes del rango."}</p>
              {puntos.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="lng" name="Lng" domain={["dataMin", "dataMax"]} fontSize={10} tickFormatter={(v) => v.toFixed(2)} />
                    <YAxis type="number" dataKey="lat" name="Lat" domain={["dataMin", "dataMax"]} fontSize={10} tickFormatter={(v) => v.toFixed(2)} />
                    <ZAxis range={[24, 24]} />
                    <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v: any) => v} />
                    {(["fallido", "en_curso", "pendiente", "otro", "entregado"] as const).map((c) => (
                      <Scatter key={c} name={CATLBL[c]} data={puntos.filter((p) => p.categoria === c)} fill={CAT[c]} fillOpacity={0.55} />
                    ))}
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-40 flex items-center justify-center text-sm text-brand-slate text-center">Las órdenes de este rango no traen lat/lng. El agente puede cruzar con PoIs si tienen coordenadas.</div>
              )}
            </section>

            <section className="card p-6">
              <h2 className="font-display text-xl text-brand-ink uppercase mb-4">Rutas por estado</h2>
              {ru?.por_estado?.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={ru.por_estado} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" /><XAxis type="number" fontSize={11} /><YAxis type="category" dataKey="estado" fontSize={11} width={90} /><Tooltip />
                    <Bar dataKey="cantidad" radius={[0, 4, 4, 0]}>
                      {ru.por_estado.map((s: any, i: number) => <Cell key={i} fill={s.estado === "overdue" ? "#E6332A" : ["finished", "closed"].includes(s.estado) ? "#10B981" : "#0EA5E9"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="h-40 flex items-center justify-center text-sm text-brand-slate">Sin rutas en el rango.</div>}
            </section>
          </div>

          {ru?.por_driver?.length > 0 && (
            <section className="card p-6">
              <h2 className="font-display text-xl text-brand-ink uppercase mb-4">Choferes</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-brand-bg"><tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                    <th className="px-3 py-2 text-left">Chofer (id)</th><th className="px-3 py-2 text-right">Rutas</th>
                    <th className="px-3 py-2 text-right">Finalizadas</th><th className="px-3 py-2 text-right">Atrasadas</th>
                    <th className="px-3 py-2 text-right">Km ejec.</th>
                  </tr></thead>
                  <tbody>
                    {ru.por_driver.slice(0, 30).map((d: any) => (
                      <tr key={d.driver} className="border-t border-brand-border">
                        <td className="px-3 py-2 font-medium text-brand-ink">{d.driver}</td>
                        <td className="px-3 py-2 text-right">{formatInt(d.rutas)}</td>
                        <td className="px-3 py-2 text-right text-emerald-700">{formatInt(d.finished)}</td>
                        <td className={`px-3 py-2 text-right ${d.overdue ? "text-brand-primary font-semibold" : ""}`}>{formatInt(d.overdue)}</td>
                        <td className="px-3 py-2 text-right">{formatInt(d.km_eje)}</td>
                      </tr>
                    ))}
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
