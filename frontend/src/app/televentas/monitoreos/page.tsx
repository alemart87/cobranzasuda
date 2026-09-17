"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { PrintButton, PrintCover } from "@/components/PrintButton";
import { apiFetch, getToken } from "@/lib/api";

/** Monitoreos de Calidad (Televentas Sudameris): carga del export "Detalle General de
 *  Monitoreo", análisis semántico (% de calidad, temas de mejora, protocolo, por asesor)
 *  y flujo de devolución al asesor (pendiente de devolución → devuelto) con comentarios
 *  del líder y del operador. */

const BANDA_CLS: Record<string, string> = {
  excelente: "bg-emerald-100 text-emerald-700", bueno: "bg-brand-cyan/10 text-brand-cyan",
  regular: "bg-brand-orange/10 text-brand-orange", critico: "bg-brand-primary/10 text-brand-primary", sin_dato: "bg-brand-bg text-brand-slate",
};
const BANDA_LABEL: Record<string, string> = { excelente: "Excelente", bueno: "Bueno", regular: "Regular", critico: "Crítico", sin_dato: "—" };
const fecha = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");
const fechaHora = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("es-PY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const dur = (s: number) => `${Math.floor((s || 0) / 60)}m ${String((s || 0) % 60).padStart(2, "0")}s`;
const hoyIso = () => new Date().toISOString().slice(0, 10);
const hace = (dias: number) => { const d = new Date(); d.setDate(d.getDate() - dias); return d.toISOString().slice(0, 10); };

export default function MonitoreosPage() {
  const [desde, setDesde] = useState(hace(45));
  const [hasta, setHasta] = useState(hoyIso());
  const [operador, setOperador] = useState("");
  const [estado, setEstado] = useState("");
  const [an, setAn] = useState<any>(null);
  const [lista, setLista] = useState<any[]>([]);
  const [uploads, setUploads] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<any>(null);
  // carga
  const [file, setFile] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [resultadoCarga, setResultadoCarga] = useState<any>(null);
  // devolución
  const [comLider, setComLider] = useState("");
  const [comOperador, setComOperador] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    const q = new URLSearchParams();
    if (desde) q.set("desde", desde);
    if (hasta) q.set("hasta", hasta);
    if (operador) q.set("operador", operador);
    apiFetch<any>(`/api/v1/televentas/monitoreos/analisis?${q.toString()}`).then(setAn).catch((e) => setError(e.message));
    const q2 = new URLSearchParams(q);
    if (estado) q2.set("estado", estado);
    apiFetch<any>(`/api/v1/televentas/monitoreos?${q2.toString()}`).then((d) => setLista(d.monitoreos ?? [])).catch((e) => setError(e.message));
    apiFetch<any>("/api/v1/televentas/monitoreos/uploads").then((d) => setUploads(d.uploads ?? [])).catch(() => setUploads([]));
  }, [desde, hasta, operador, estado]);
  useEffect(() => { cargar(); }, [cargar]);

  const abrir = async (id: string) => {
    if (abierto === id) { setAbierto(null); setDetalle(null); return; }
    setAbierto(id); setDetalle(null); setComLider(""); setComOperador("");
    try {
      const d = await apiFetch<any>(`/api/v1/televentas/monitoreos/${id}`);
      setDetalle(d); setComLider(d.comentario_lider ?? ""); setComOperador(d.comentario_operador ?? "");
    } catch (e: any) { setError(e.message); }
  };

  const accion = async (id: string, accion: string, comentario: string) => {
    if (!comentario.trim()) { setError("La devolución necesita un comentario."); return; }
    setGuardando(true); setError(null);
    try {
      const d = await apiFetch<any>(`/api/v1/televentas/monitoreos/${id}/devolucion`, { method: "POST", body: JSON.stringify({ accion, comentario }) });
      setDetalle(d); cargar();
    } catch (e: any) { setError(e.message); } finally { setGuardando(false); }
  };

  const subir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setError("Seleccioná el archivo de monitoreos."); return; }
    setSubiendo(true); setError(null); setResultadoCarga(null);
    try {
      const form = new FormData(); form.append("file", file);
      const token = getToken();
      const r = await fetch("/api/v1/televentas/monitoreos/uploads", { method: "POST", body: form, headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.detail || "Error al subir");
      setResultadoCarga(body); setFile(null); cargar();
    } catch (err: any) { setError(err.message); } finally { setSubiendo(false); }
  };

  const r = an?.resumen;
  const operadoresOpts = useMemo(() => (an?.por_operador ?? []).map((o: any) => o.operador), [an]);
  const chartOps = (an?.por_operador ?? []).map((o: any) => ({ operador: o.operador.length > 22 ? o.operador.slice(0, 21) + "…" : o.operador, precision: o.precision_promedio ?? 0, banda: o.banda, n: o.n }));
  const chartTemas = (an?.temas ?? []).slice(0, 8).map((t: any) => ({ tema: t.label, n: t.n, pct: t.pct }));

  return (
    <AppShell>
      <PrintCover titulo="Monitoreos de Calidad · Televentas" periodo={`Período ${desde} al ${hasta}${operador ? ` · ${operador}` : ""}`} />
      <div className="mb-2 text-xs text-brand-slate no-print">
        <Link href="/televentas" className="hover:text-brand-primary">Televentas</Link><span className="mx-2">/</span><span className="text-brand-ink font-semibold">Monitoreos de Calidad</span>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="font-display text-3xl text-brand-ink uppercase">Monitoreos de Calidad</h1>
          <p className="text-sm text-brand-slate mt-1 max-w-3xl">Evaluaciones de llamadas del monitoreador: % de calidad, temas de mejora detectados en las sugerencias, cumplimiento del protocolo y devolución de cada monitoreo al asesor con comentarios del líder y del operador.</p>
        </div>
        <PrintButton />
      </div>

      {/* Carga + filtros */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6 no-print">
        <form onSubmit={subir} className="card p-5">
          <div className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate mb-2">Subir export de monitoreos</div>
          <p className="text-xs text-brand-slate mb-3">Archivo "Detalle General de Monitoreo" (.xls / .xlsx) con id_monitoreo, operador, comentarios, sugerencias y total_precision. Un monitoreo ya cargado se actualiza sin perder su devolución.</p>
          <input type="file" accept=".xls,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-brand-slate file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:uppercase file:tracking-wider2 file:bg-brand-ink file:text-white hover:file:bg-brand-orange cursor-pointer" />
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <button type="submit" disabled={subiendo || !file} className="btn-primary">{subiendo ? "Procesando…" : "Cargar y analizar"}</button>
            {resultadoCarga && <span className="text-xs text-emerald-700 font-semibold">{resultadoCarga.filas} filas · {resultadoCarga.nuevos} nuevos · {resultadoCarga.actualizados} actualizados</span>}
          </div>
          {uploads.length > 0 && (
            <div className="mt-3 text-[11px] text-brand-slate">Últimas cargas: {uploads.slice(0, 3).map((u) => `${u.filename} (${u.filas}) ${fecha(u.created_at)}`).join(" · ")}</div>
          )}
        </form>
        <div className="card p-5">
          <div className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate mb-2">Período y filtros</div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-brand-slate">Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="input mt-1" /></label>
            <label className="text-xs text-brand-slate">Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="input mt-1" /></label>
            <label className="text-xs text-brand-slate">Asesor
              <select value={operador} onChange={(e) => setOperador(e.target.value)} className="input mt-1">
                <option value="">Todos</option>
                {operadoresOpts.map((o: string) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="text-xs text-brand-slate">Devolución
              <select value={estado} onChange={(e) => setEstado(e.target.value)} className="input mt-1">
                <option value="">Todas</option><option value="pendiente">Pendiente de devolución</option><option value="devuelto">Devuelto</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      {error && <div className="card p-3 mb-4 text-sm text-brand-primary">{error}</div>}

      {r && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
            <KpiCard label="Monitoreos" value={String(r.monitoreos)} hint={`${r.operadores} asesores · ${r.monitoreadores} monitoreador(es)`} accent="neutral" />
            <KpiCard label="% de calidad" value={r.pct_calidad != null ? `${r.pct_calidad}%` : "—"} hint={`mediana ${r.precision_mediana ?? "—"} · mín ${r.precision_min ?? "—"} · máx ${r.precision_max ?? "—"}`} accent={r.pct_calidad >= 90 ? "cyan" : r.pct_calidad >= 80 ? "secondary" : "primary"} />
            <KpiCard label="Excelentes (≥ 90)" value={`${r.pct_excelente}%`} hint={`${r.pct_bajo_80}% por debajo de 80`} accent="cyan" />
            <KpiCard label="Protocolo cumplido" value={r.protocolo_pct != null ? `${r.protocolo_pct}%` : "—"} hint="pasos del speech detectados" accent="purple" />
            <KpiCard label="Críticos" value={String(r.criticos)} hint={`${r.casos_puntuales} caso(s) puntual(es) · ${r.ventas_cerradas} ventas cerradas`} accent={r.criticos ? "primary" : "neutral"} />
            <KpiCard label="Pendientes de devolución" value={String(r.pendientes_devolucion)} hint={`${r.devueltos} devueltos (${r.pct_devueltos}%)`} accent={r.pendientes_devolucion ? "orange" : "cyan"} />
          </div>

          <section className="card p-5 mb-6">
            <h2 className="font-display text-xl text-brand-ink uppercase mb-2">Hallazgos</h2>
            <ul className="space-y-1.5 text-sm text-brand-ink">
              {an.hallazgos.map((h: string, i: number) => <li key={i} className="flex gap-2"><span className="text-brand-primary font-bold">›</span><span>{h}</span></li>)}
            </ul>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
              {an.bandas.map((b: any) => (
                <div key={b.key} className="rounded-md border border-brand-border px-3 py-2 text-center" style={{ borderTopColor: b.color, borderTopWidth: 3 }}>
                  <div className="font-display text-2xl leading-none" style={{ color: b.color }}>{b.n}</div>
                  <div className="text-[10px] uppercase tracking-wider2 text-brand-slate mt-1">{b.label} · {b.pct}%</div>
                </div>
              ))}
            </div>
          </section>

          <div className="grid xl:grid-cols-2 gap-4 mb-6">
            <section className="card p-5">
              <h2 className="font-display text-lg text-brand-ink uppercase">Temas de mejora</h2>
              <p className="text-[11px] text-brand-slate mb-2">Detectados en las sugerencias del monitoreador. Cuántos monitoreos los mencionan.</p>
              {chartTemas.length === 0 ? <div className="text-sm text-brand-slate py-6 text-center">Sin sugerencias en el período.</div> : (
                <ResponsiveContainer width="100%" height={Math.max(180, chartTemas.length * 30 + 30)}>
                  <BarChart data={chartTemas} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                    <XAxis type="number" allowDecimals={false} fontSize={10} />
                    <YAxis type="category" dataKey="tema" width={170} fontSize={10} />
                    <Tooltip formatter={(v: any, _n: any, item: any) => [`${v} monitoreos (${item.payload.pct}%)`, "Menciones"]} />
                    <Bar dataKey="n" fill="#E6332A" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              <div className="mt-3 space-y-2">
                {(an.temas ?? []).slice(0, 5).map((t: any) => (
                  <div key={t.key} className="rounded-md border border-brand-border px-3 py-2 text-[12px]">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold text-brand-ink">{t.label} <span className="text-[10px] text-brand-slate font-normal">· {t.grupo}</span></span>
                      <span className="font-mono text-xs text-brand-graphite">{t.n} monitoreos · {t.operadores_n} asesores · calidad {t.precision_promedio ?? "—"}%</span>
                    </div>
                    <div className="text-brand-slate">{t.desc}</div>
                    {t.ejemplos?.[0] && <div className="text-brand-graphite italic mt-1">“{t.ejemplos[0].texto}” — {t.ejemplos[0].operador}</div>}
                  </div>
                ))}
              </div>
            </section>
            <section className="card p-5">
              <h2 className="font-display text-lg text-brand-ink uppercase">Calidad por asesor</h2>
              <p className="text-[11px] text-brand-slate mb-2">Precisión promedio del período. Color según banda.</p>
              {chartOps.length === 0 ? <div className="text-sm text-brand-slate py-6 text-center">Sin monitoreos.</div> : (
                <ResponsiveContainer width="100%" height={Math.max(180, chartOps.length * 26 + 30)}>
                  <BarChart data={chartOps} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                    <XAxis type="number" domain={[0, 100]} fontSize={10} />
                    <YAxis type="category" dataKey="operador" width={150} fontSize={10} />
                    <Tooltip formatter={(v: any, _n: any, item: any) => [`${v}% en ${item.payload.n} monitoreo(s)`, "Calidad"]} />
                    <Bar dataKey="precision" radius={[0, 3, 3, 0]}>
                      {chartOps.map((o: any, i: number) => <Cell key={i} fill={o.banda === "excelente" ? "#10B981" : o.banda === "bueno" ? "#0EA5E9" : o.banda === "regular" ? "#F39200" : "#E6332A"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate mb-1">Protocolo del speech (detectado en los comentarios)</div>
                <div className="space-y-1">
                  {(an.protocolo ?? []).map((p: any) => (
                    <div key={p.key} className="flex items-center gap-2 text-[11px]">
                      <span className="w-52 text-brand-graphite truncate">{p.label}</span>
                      <div className="flex-1 h-2 rounded-full bg-brand-bg overflow-hidden"><div className="h-full" style={{ width: `${p.pct}%`, background: p.pct >= 70 ? "#10B981" : p.pct >= 40 ? "#F39200" : "#E6332A" }} /></div>
                      <span className="w-10 text-right font-mono">{p.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          <section className="card overflow-x-auto mb-6">
            <div className="px-5 pt-4 pb-2"><h2 className="font-display text-lg text-brand-ink uppercase">Seguimiento por asesor</h2></div>
            <table className="w-full text-sm min-w-[820px]">
              <thead className="bg-brand-bg border-b border-brand-border"><tr className="text-[10px] uppercase tracking-wider2 text-brand-slate">
                <th className="px-3 py-2 text-left">Asesor</th><th className="px-3 py-2 text-right">Monitoreos</th><th className="px-3 py-2 text-right">Calidad</th>
                <th className="px-3 py-2 text-left">Banda</th><th className="px-3 py-2 text-left">Temas de mejora</th><th className="px-3 py-2 text-right">Protocolo</th>
                <th className="px-3 py-2 text-right">Críticos</th><th className="px-3 py-2 text-right">Ventas</th><th className="px-3 py-2 text-right">Devolución</th>
              </tr></thead>
              <tbody>
                {(an.por_operador ?? []).map((o: any) => (
                  <tr key={o.operador} className="border-t border-brand-border">
                    <td className="px-3 py-2 font-semibold text-brand-ink"><button onClick={() => setOperador(operador === o.operador ? "" : o.operador)} className="hover:text-brand-primary text-left">{o.operador}</button><div className="text-[10px] text-brand-slate font-normal">último {fecha(o.ultimo)}</div></td>
                    <td className="px-3 py-2 text-right font-mono">{o.n}</td>
                    <td className="px-3 py-2 text-right font-mono"><b>{o.precision_promedio ?? "—"}%</b> <span className="text-[10px] text-brand-slate">{o.precision_min}–{o.precision_max}</span></td>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${BANDA_CLS[o.banda]}`}>{BANDA_LABEL[o.banda]}</span></td>
                    <td className="px-3 py-2 text-[11px] text-brand-graphite">{o.temas.length ? o.temas.map((t: any) => `${t.label} (${t.n})`).join(" · ") : <span className="text-emerald-700">sin observaciones</span>}</td>
                    <td className="px-3 py-2 text-right font-mono">{o.protocolo_pct ?? "—"}%</td>
                    <td className={`px-3 py-2 text-right font-mono ${o.criticos ? "text-brand-primary font-bold" : ""}`}>{o.criticos}</td>
                    <td className="px-3 py-2 text-right font-mono">{o.ventas}</td>
                    <td className="px-3 py-2 text-right text-[11px]"><span className="text-emerald-700 font-semibold">{o.devueltos}</span> / <span className={o.pendientes ? "text-brand-orange font-semibold" : ""}>{o.pendientes} pend.</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      {/* Lista de monitoreos con devolución */}
      <section className="card mb-6">
        <div className="px-5 pt-4 pb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg text-brand-ink uppercase">Monitoreos y devolución</h2>
          <span className="text-[11px] text-brand-slate">{lista.length} monitoreo(s) · tocá uno para ver la evaluación y devolverlo</span>
        </div>
        <div className="divide-y divide-brand-border">
          {lista.length === 0 && <div className="px-5 py-8 text-center text-sm text-brand-slate">No hay monitoreos en el período. Subí el export para empezar.</div>}
          {lista.map((m) => {
            const a = m.analisis ?? {};
            const open = abierto === m.id;
            return (
              <div key={m.id}>
                <button onClick={() => abrir(m.id)} className="w-full text-left px-5 py-3 hover:bg-brand-bg-soft flex flex-wrap items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${BANDA_CLS[a.banda ?? "sin_dato"]}`}>{m.precision ?? "—"}%</span>
                  <span className="font-semibold text-brand-ink">{m.operador}</span>
                  <span className="text-[11px] text-brand-slate">{fecha(m.fecha_monitoreo)} · {m.tipo_producto} · {dur(m.duracion_seg)} · {m.monitoreador}</span>
                  {m.critico && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-primary text-white">CRÍTICO</span>}
                  {a.venta_cerrada && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">venta</span>}
                  <span className="ml-auto flex items-center gap-2">
                    {(a.temas ?? []).slice(0, 3).map((t: string) => <span key={t} className="hidden md:inline px-1.5 py-0.5 rounded bg-brand-bg text-[10px] text-brand-graphite">{t}</span>)}
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${m.estado_devolucion === "devuelto" ? "bg-emerald-100 text-emerald-700" : "bg-brand-orange/10 text-brand-orange"}`}>{m.estado_devolucion === "devuelto" ? "Devuelto" : "Pendiente de devolución"}</span>
                  </span>
                </button>
                {open && (
                  <div className="px-5 pb-5 bg-brand-bg-soft">
                    {!detalle ? <div className="text-sm text-brand-slate py-3">Cargando…</div> : (
                      <div className="grid lg:grid-cols-2 gap-4 pt-3">
                        <div className="space-y-3">
                          <div className="rounded-md border border-brand-border bg-white p-3">
                            <div className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate">Comentarios del monitoreador</div>
                            <p className="text-[12px] text-brand-ink mt-1 whitespace-pre-line">{detalle.comentarios || "—"}</p>
                          </div>
                          <div className="rounded-md border border-brand-primary/30 bg-white p-3">
                            <div className="text-[10px] uppercase tracking-wider2 font-bold text-brand-primary">Sugerencias / qué mejorar</div>
                            <p className="text-[12px] text-brand-ink mt-1 whitespace-pre-line">{detalle.sugerencias || "Sin observaciones: llamada conforme."}</p>
                            {detalle.compromiso && <p className="text-[11px] text-brand-slate mt-1">Compromiso: {detalle.compromiso}</p>}
                          </div>
                          <div className="rounded-md border border-brand-border bg-white p-3 text-[11px] text-brand-graphite">
                            <div className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate mb-1">Análisis semántico</div>
                            <div>Temas: {(detalle.analisis?.temas ?? []).length ? (detalle.analisis.temas as string[]).join(", ") : "ninguno"} · Protocolo {detalle.analisis?.protocolo_pct ?? "—"}% · {detalle.analisis?.venta_cerrada ? "venta cerrada" : "sin venta"}</div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {Object.entries(detalle.analisis?.protocolo ?? {}).map(([k, v]) => <span key={k} className={`px-1.5 py-0.5 rounded text-[10px] ${v ? "bg-emerald-100 text-emerald-700" : "bg-brand-bg text-brand-slate line-through"}`}>{k}</span>)}
                            </div>
                            <div className="mt-1 text-[10px]">Llamada del {fecha(detalle.fecha_llamada)} · {detalle.tipo_llamada} · {detalle.tipo_contacto} · motivo {detalle.motivo_llamada} · grabación {detalle.id_grabacion || "—"}</div>
                          </div>
                        </div>
                        <div className="space-y-3 no-print">
                          <div className="rounded-md border border-brand-border bg-white p-3">
                            <div className="flex items-center justify-between">
                              <div className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate">Devolución al asesor</div>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${detalle.estado_devolucion === "devuelto" ? "bg-emerald-100 text-emerald-700" : "bg-brand-orange/10 text-brand-orange"}`}>{detalle.estado_devolucion === "devuelto" ? `Devuelto por ${detalle.devuelto_por} · ${fechaHora(detalle.devuelto_at)}` : "Pendiente de devolución"}</span>
                            </div>
                            <label className="block text-[11px] text-brand-slate mt-2">Comentario del líder
                              <textarea value={comLider} onChange={(e) => setComLider(e.target.value)} rows={3} className="input mt-1 w-full" placeholder="Qué se conversó con el asesor, qué se le pidió trabajar…" />
                            </label>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {detalle.estado_devolucion !== "devuelto"
                                ? <button disabled={guardando} onClick={() => accion(detalle.id, "devolver", comLider)} className="btn-primary text-sm">Marcar como devuelto</button>
                                : <button disabled={guardando} onClick={() => accion(detalle.id, "comentar_lider", comLider)} className="px-3 py-2 rounded-md border border-brand-border text-sm hover:border-brand-ink">Guardar comentario del líder</button>}
                              {detalle.estado_devolucion === "devuelto" && <button disabled={guardando} onClick={() => accion(detalle.id, "reabrir", "Se reabre la devolución.")} className="px-3 py-2 rounded-md border border-brand-border text-sm text-brand-slate hover:border-brand-ink">Reabrir</button>}
                            </div>
                            <label className="block text-[11px] text-brand-slate mt-3">Comentario del operador
                              <textarea value={comOperador} onChange={(e) => setComOperador(e.target.value)} rows={2} className="input mt-1 w-full" placeholder="Cómo lo recibió el asesor, a qué se compromete…" />
                            </label>
                            <button disabled={guardando} onClick={() => accion(detalle.id, "comentar_operador", comOperador)} className="mt-2 px-3 py-2 rounded-md border border-brand-border text-sm hover:border-brand-ink">Guardar comentario del operador</button>
                          </div>
                          {(detalle.seguimiento ?? []).length > 0 && (
                            <div className="rounded-md border border-brand-border bg-white p-3">
                              <div className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate mb-1">Seguimiento</div>
                              <ol className="space-y-1 text-[11px]">
                                {[...detalle.seguimiento].reverse().map((s: any, i: number) => (
                                  <li key={i} className="flex gap-2"><span className="font-mono text-brand-slate w-24 flex-shrink-0">{fechaHora(s.fecha)}</span><span><b>{s.autor}</b> · {s.accion}{s.comentario ? `: ${s.comentario}` : ""}</span></li>
                                ))}
                              </ol>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
