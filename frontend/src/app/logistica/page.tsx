"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { apiFetch } from "@/lib/api";
import { formatInt, formatPct } from "@/lib/format";

const CATCOL: Record<string, string> = { entregado: "#10B981", fallido: "#E6332A", en_curso: "#0EA5E9", pendiente: "#F39200", otro: "#94A3B8" };

export default function LogisticaDashboard() {
  const [cfg, setCfg] = useState<any>(null);
  const [ping, setPing] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [diag, setDiag] = useState<any>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const runDiag = () => {
    setDiagLoading(true);
    apiFetch<any>("/api/v1/logistica/diagnostico").then(setDiag).catch((e) => setDiag({ ok: false, error: e.message })).finally(() => setDiagLoading(false));
  };
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
    apiFetch<any>(`/api/v1/logistica/entregas?desde=${desde}&hasta=${hasta}`)
      .then(setData).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { if (cfg?.configurado) cargar(); else setLoading(false); }, [cfg]);

  const r = data?.resumen;
  const pieEstados = (data?.por_estado ?? []).slice(0, 8).map((e: any) => ({ name: e.estado, value: e.cantidad }));

  return (
    <AppShell>
      <div className="mb-2 text-xs text-brand-slate">
        <Link href="/operativas" className="hover:text-brand-primary">Operativas</Link>
        <span className="mx-2">/</span><span className="text-brand-ink font-semibold">Logística</span>
      </div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-brand-ink uppercase">Logística</h1>
          <p className="text-sm text-brand-slate mt-1">Entregas, rutas y flota sobre QuadMinds. Datos diarios y estadísticas de entrega.</p>
        </div>
        <Link href="/logistica/agente" className="btn-primary inline-flex items-center gap-2">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
          Agente de Logística
        </Link>
      </div>

      {cfg && !cfg.configurado && (
        <div className="card p-6 mb-6 border-l-4 border-brand-orange">
          <h2 className="font-semibold text-brand-ink mb-1">Falta configurar la API de QuadMinds</h2>
          <p className="text-sm text-brand-slate">Cargá la variable de entorno <code>QUADMINDS_API_KEY</code> en el servidor (header <code>{cfg.auth_header}</code>, base <code>{cfg.base_url}</code>) y reiniciá el backend.</p>
        </div>
      )}
      {ping && cfg?.configurado && ping.ok === false && (
        <div className="card p-4 mb-6 border-l-4 border-brand-primary">
          <p className="text-sm text-brand-primary">La conexión con QuadMinds falló: {ping.error || ping.mensaje}</p>
        </div>
      )}

      {cfg?.configurado && (
        <div className="card p-4 mb-6 flex flex-wrap items-end gap-4 no-print">
          <div><label className="label">Desde</label><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="input max-w-[160px]" /></div>
          <div><label className="label">Hasta</label><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="input max-w-[160px]" /></div>
          <button onClick={cargar} className="btn-ghost">Actualizar</button>
          {ping?.ok && <span className="text-xs text-emerald-700 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Conectado a QuadMinds</span>}
        </div>
      )}

      {cfg?.configurado && (
        <div className="mb-6 no-print">
          <button onClick={runDiag} disabled={diagLoading} className="btn-ghost text-xs">
            {diagLoading ? "Diagnosticando…" : "Diagnóstico de conexión (/orders)"}
          </button>
          {diag && (
            <div className="card p-4 mt-2 text-xs">
              {diag.ok ? (
                <div className="space-y-1">
                  <p className="text-emerald-700 font-semibold">✓ Conectado. Órdenes en la ventana: {diag.ordenes_en_ventana}</p>
                  <p>Esquema de fecha detectado: <code>{JSON.stringify(diag.esquema_fecha)}</code></p>
                  <p>Estado detectado: <b>{diag.estado_detectado ?? "—"}</b> · Fecha detectada: <b>{diag.fecha_detectada ?? "—"}</b></p>
                  <p className="text-brand-slate">Campos de la orden: {(diag.campos_disponibles || []).join(", ")}</p>
                </div>
              ) : (
                <p className="text-brand-primary">No se pudo leer /orders: {diag.error || diag.mensaje}</p>
              )}
            </div>
          )}
        </div>
      )}

      {loading && <div className="text-brand-slate">Cargando…</div>}
      {err && <div className="card p-4 text-brand-primary text-sm">{err}</div>}

      {!loading && data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KpiCard label="Órdenes" value={formatInt(data.total_ordenes)} hint={`${data.dias} día(s)`} accent="primary" />
            <KpiCard label="Entregadas" value={formatInt(r.entregado)} hint={`${formatPct(r.pct_entregado)}`} accent="cyan" />
            <KpiCard label="Fallidas" value={formatInt(r.fallido)} hint={`${formatPct(r.pct_fallido)}`} accent="orange" />
            <KpiCard label="Efectividad" value={formatPct(r.efectividad_sobre_cerradas)} hint="entregadas / cerradas" accent="secondary" />
          </div>

          {data.total_ordenes === 0 ? (
            <div className="card p-10 text-center text-brand-slate">No hay órdenes en el rango seleccionado (o el filtro de fecha no matcheó el campo de la API). Probá otro rango o consultá con el Agente.</div>
          ) : (
            <>
              <section className="card p-6 mb-6">
                <h2 className="font-display text-xl text-brand-ink uppercase mb-4">Entregas por día</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.por_dia}>
                    <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="fecha" fontSize={10} /><YAxis fontSize={11} />
                    <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="entregado" name="Entregado" stackId="a" fill={CATCOL.entregado} />
                    <Bar dataKey="fallido" name="Fallido" stackId="a" fill={CATCOL.fallido} />
                    <Bar dataKey="en_curso" name="En curso" stackId="a" fill={CATCOL.en_curso} />
                    <Bar dataKey="pendiente" name="Pendiente" stackId="a" fill={CATCOL.pendiente} />
                    <Bar dataKey="otro" name="Otro" stackId="a" fill={CATCOL.otro} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </section>

              <div className="grid lg:grid-cols-2 gap-6">
                <section className="card p-6">
                  <h2 className="font-display text-xl text-brand-ink uppercase mb-4">Distribución por estado</h2>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={pieEstados} dataKey="value" nameKey="name" innerRadius={55} outerRadius={110} paddingAngle={2}>
                        {pieEstados.map((_: any, i: number) => <Cell key={i} fill={["#0EA5E9", "#10B981", "#E6332A", "#F39200", "#662483", "#94A3B8", "#EC4899", "#0F1116"][i % 8]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </section>
                <section className="card p-6">
                  <h2 className="font-display text-xl text-brand-ink uppercase mb-4">Estados</h2>
                  <div className="space-y-1.5 max-h-72 overflow-y-auto">
                    {data.por_estado.map((e: any) => (
                      <div key={e.estado} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 text-brand-graphite">{e.estado}</span>
                        <span className="font-semibold text-brand-ink">{formatInt(e.cantidad)}</span>
                        <span className="text-xs text-brand-slate w-12 text-right">{formatPct(e.pct)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
