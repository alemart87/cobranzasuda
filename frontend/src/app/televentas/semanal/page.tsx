"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { PrintButton, PrintCover, PrintHeader } from "@/components/PrintButton";
import { InformeAnalisis } from "@/components/televentas/InformeAnalisis";
import { ResenaRegistro } from "@/components/televentas/ResenaRegistro";
import { ReunionSemanal } from "@/components/televentas/ReunionSemanal";
import { GestionLiderazgo } from "@/components/televentas/GestionLiderazgo";
import { apiFetch } from "@/lib/api";
import { formatGs, formatInt, formatPct } from "@/lib/format";
import { weekLabel } from "@/lib/month";

const FMT: Record<string, (v: number) => string> = {
  gs: formatGs, pct: (v) => formatPct(v), int: formatInt,
};

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const INICIO_KEY = "vc_semana_inicio";

export default function SemanalPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [semanaSel, setSemanaSel] = useState<string | null>(null);
  // Corte de la semana operativa: 4 = viernes → jueves (reunión de los viernes).
  const [inicio, setInicio] = useState(4);

  // Analizador semanal
  const [objetivo, setObjetivo] = useState("70000000");
  const [consulta, setConsulta] = useState("");
  const [res, setRes] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandido, setExpandido] = useState(false);

  useEffect(() => {
    const saved = Number(localStorage.getItem(INICIO_KEY));
    if (!Number.isNaN(saved) && saved >= 0 && saved <= 6 && saved !== 4) setInicio(saved);
  }, []);

  useEffect(() => {
    setLoading(true); setData(null); setSemanaSel(null); setRes(null); setExpandido(false);
    apiFetch<any>(`/api/v1/televentas/semanal?inicio=${inicio}`).then((d) => {
      setData(d);
      const sems = d?.semanas ?? [];
      if (sems.length) setSemanaSel(sems[sems.length - 1].semana);
    }).finally(() => setLoading(false));
  }, [inicio]);

  const cambiarInicio = (v: number) => {
    localStorage.setItem(INICIO_KEY, String(v));
    setInicio(v);
  };

  useEffect(() => {
    if (semanaSel) { setRes(null); setExpandido(false); setError(null); }
  }, [semanaSel]);

  const semanas: any[] = data?.semanas ?? [];
  const semana = useMemo(() => semanas.find((s) => s.semana === semanaSel) ?? null, [semanas, semanaSel]);
  const evaluacion = semanaSel ? data?.evaluaciones?.[semanaSel] : null;
  const ultimas = useMemo(() => semanas.slice(-8), [semanas]);

  const ejecutar = async () => {
    if (!semanaSel || !(Number(objetivo) > 0)) return;
    setRunning(true); setError(null); setExpandido(false);
    try {
      const d = await apiFetch<any>("/api/v1/televentas/semanal/analizador", {
        method: "POST",
        body: JSON.stringify({ semana: semanaSel, objetivo_prima: Number(objetivo), consulta: consulta.trim() || null, inicio }),
      });
      setRes(d);
    } catch (e: any) { setError(e.message); } finally { setRunning(false); }
  };

  const obs = res?.observacion;

  return (
    <AppShell>
      <PrintCover
        titulo={`Informe de Reunión Semanal${semanaSel ? ` — ${weekLabel(semanaSel)}` : ""}`}
        periodo={semana ? `Período: ${semana.fecha_inicio} al ${semana.fecha_fin} (corte ${DIAS[inicio]} a ${DIAS[(inicio + 6) % 7]}) · Reunión de seguimiento Voicenter · Sudameris Seguros` : undefined}
      />
      <PrintHeader
        titulo={`Reporte Semanal · ${semanaSel ? weekLabel(semanaSel) : ""}`}
        subtitulo="Reunión de seguimiento semanal Voicenter · Sudameris Seguros"
      />

      <div className="mb-2 text-xs text-brand-slate no-print">
        <Link href="/televentas" className="hover:text-brand-primary">Televentas</Link>
        <span className="mx-2">/</span><span className="text-brand-ink font-semibold">Reporte semanal</span>
      </div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-brand-ink uppercase">Reporte Semanal</h1>
          <p className="text-sm text-brand-slate mt-1 max-w-3xl">
            La semana bajo la lupa: objetivo semanal, analizador con método científico, mejoras y desmejoras
            inter-semanales (incluye gestiones CRM) y los compromisos de la reunión de los viernes con Sudameris.
          </p>
        </div>
        <PrintButton label="Imprimir informe de reunión" />
      </div>

      <ResenaRegistro />

      {loading && <div className="text-brand-slate">Cargando semanas…</div>}
      {!loading && semanas.length === 0 && (
        <div className="card p-10 text-center text-brand-slate">
          No hay datos diarios publicados todavía. El reporte semanal se construye desde los reportes
          publicados de llamadas, producción y gestiones CRM.
        </div>
      )}

      {!loading && semanas.length > 0 && (
        <>
          {/* Selector de corte y de semana */}
          <section className="card p-4 mb-6 no-print">
            <div className="flex flex-wrap items-center gap-3 mb-3 pb-3 border-b border-brand-border">
              <label className="text-sm font-medium text-brand-ink">La semana operativa va de</label>
              <select value={inicio} onChange={(e) => cambiarInicio(Number(e.target.value))}
                className="text-sm border border-brand-border rounded px-3 py-1.5 bg-white font-semibold">
                {DIAS.map((d, i) => (
                  <option key={i} value={i}>{d} a {DIAS[(i + 6) % 7]}{i === 4 ? " (reunión de los viernes)" : ""}</option>
                ))}
              </select>
              <span className="text-[11px] text-brand-slate">
                Todas las semanas de esta vista usan este corte — al cambiarlo se recalcula todo, los números
                de cortes distintos no se mezclan.
              </span>
            </div>
            <label className="label">Semana analizada</label>
            <div className="flex flex-wrap gap-1.5">
              {semanas.slice(-12).map((s) => (
                <button key={s.semana} onClick={() => setSemanaSel(s.semana)}
                  title={`${s.fecha_inicio} → ${s.fecha_fin}${s.completa ? "" : " · semana parcial"}`}
                  className={`px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    s.semana === semanaSel ? "bg-brand-primary text-white border-brand-primary"
                      : "border-brand-border text-brand-graphite hover:border-brand-primary"} ${s.completa ? "" : "opacity-60"}`}>
                  {weekLabel(s.semana)}{s.completa ? "" : " · parcial"}
                </button>
              ))}
            </div>
          </section>

          {semana && (
            <>
              {/* KPIs de la semana */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <KpiCard label="Prima emitida (semana)" value={formatGs(semana.prima)} hint={`${semana.polizas} pólizas`} accent="primary" />
                <KpiCard label="Conversión" value={`${semana.conversion_pct}%`} hint={`${formatInt(semana.contestadas)} atendidas`} accent="purple" />
                <KpiCard label="Llamadas" value={formatInt(semana.llamadas)} hint={`${formatPct(semana.contactabilidad)} contacto`} accent="cyan" />
                <KpiCard label="Gestiones CRM" value={semana.tiene_crm ? formatInt(semana.gestiones_crm) : "—"} hint={semana.tiene_crm ? `${formatPct(semana.tasa_contacto_crm)} contacto CRM` : "sin datos CRM"} accent="orange" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <KpiCard label="Agentes efectivos/día" value={`${semana.agentes_efectivos}`} accent="neutral" />
                <KpiCard label="Ritmo (llam/asesor/día)" value={`${semana.llamadas_prom_asesor_dia}`} accent="neutral" />
                <KpiCard label="Ticket promedio" value={formatGs(semana.ticket_promedio)} accent="neutral" />
                <KpiCard label="Días operativos" value={`${semana.dias_operativos}`} hint={semana.completa ? `${semana.fecha_inicio} → ${semana.fecha_fin}` : "semana parcial"} accent="neutral" />
              </div>

              {/* Analizador semanal */}
              <section className="card p-5 mb-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                  <h2 className="font-display text-xl text-brand-ink uppercase">Analizador semanal</h2>
                  <span className="text-[10px] uppercase tracking-wider2 text-brand-slate font-semibold">Método científico · deja registro</span>
                </div>
                <p className="text-xs text-brand-slate mb-4 max-w-3xl">
                  Se coloca el <b>objetivo de la semana</b> y se contrasta: hipótesis producción-vs-objetivo,
                  verificación del funnel contra las semanas completas previas y descomposición exacta de la
                  variación. Tu consulta se suma a la hipótesis.
                </p>
                <div className="flex flex-wrap items-end gap-3 mb-4 no-print">
                  <label className="text-sm">
                    <span className="block text-[11px] text-brand-slate mb-1">Objetivo de prima emitida de la semana (Gs)</span>
                    <input type="number" step={5000000} value={objetivo} onChange={(e) => setObjetivo(e.target.value)}
                      className="input max-w-[180px] !py-1.5 text-right" />
                  </label>
                  <label className="text-sm flex-1 min-w-[240px]">
                    <span className="block text-[11px] text-brand-slate mb-1">Tu consulta (opcional)</span>
                    <input value={consulta} onChange={(e) => setConsulta(e.target.value)}
                      placeholder='Ej.: "¿el feriado explica la caída?"' className="input w-full !py-1.5" />
                  </label>
                  <button onClick={ejecutar} disabled={running || !(Number(objetivo) > 0)} className="btn-primary disabled:opacity-50">
                    {running ? "Analizando…" : "Analizar la semana"}
                  </button>
                </div>
                {error && <p className="text-sm text-brand-primary mb-3">{error}</p>}

                {res && obs && (
                  <div className={`rounded-lg border-2 p-5 ${obs.alcanzado ? "border-emerald-500 bg-emerald-50/40" : "border-brand-primary bg-brand-primary/5"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-block h-2.5 w-2.5 rounded-full animate-pulse ${obs.alcanzado ? "bg-emerald-500" : "bg-brand-primary"}`} />
                          <span className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate">Informe listo · registrado</span>
                        </div>
                        <div className={`font-display text-2xl uppercase ${obs.alcanzado ? "text-emerald-600" : "text-brand-primary"}`}>
                          Hipótesis {obs.alcanzado ? "confirmada" : "rechazada"}
                        </div>
                        <p className="text-sm text-brand-graphite mt-1">
                          {weekLabel(semanaSel!)}: <b>{formatGs(obs.prima_neta)}</b> de <b>{formatGs(obs.objetivo)}</b> ·
                          cumplimiento <b>{obs.cumplimiento_pct}%</b> · brecha <b>{formatGs(obs.brecha_gs)}</b>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => setExpandido(!expandido)} className="btn-primary !px-5 !py-2.5 text-sm shadow-lg">
                          {expandido ? "Cerrar informe" : "Ver informe →"}
                        </button>
                        {res.log_id && (
                          <Link href={`/televentas/analizador/${res.log_id}`}
                            className="btn-ghost !px-4 !py-2.5 text-sm border border-brand-border rounded">
                            Versión imprimible (PDF)
                          </Link>
                        )}
                      </div>
                    </div>
                    {expandido && (
                      <div className="mt-5 pt-5 border-t border-brand-border">
                        <InformeAnalisis res={res} meses={res.periodos ?? [semanaSel!]} />
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Mejoras / desmejoras / llamativos */}
              {evaluacion && (evaluacion.mejoras?.length > 0 || evaluacion.desmejoras?.length > 0 || evaluacion.llamativos?.length > 0) && (
                <section className="mb-6">
                  <h2 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold mb-3">
                    La semana vs la anterior (incluye gestiones CRM)
                  </h2>
                  <div className="grid lg:grid-cols-3 gap-4">
                    <div className="card p-4 border-t-4 border-emerald-500">
                      <h3 className="text-sm font-bold text-emerald-700 mb-2">Mejoras</h3>
                      {evaluacion.mejoras?.length ? evaluacion.mejoras.map((m: any) => (
                        <div key={m.clave} className="flex items-baseline justify-between text-xs py-1 border-b border-brand-border last:border-0">
                          <span className="text-brand-graphite">{m.metrica}</span>
                          <span className="font-mono font-semibold text-emerald-600">
                            {(FMT[m.formato] ?? formatInt)(m.actual)} <span className="text-[10px]">({m.delta_pct > 0 ? "+" : ""}{m.delta_pct}%)</span>
                          </span>
                        </div>
                      )) : <p className="text-xs text-brand-slate">Sin mejoras significativas (±5%).</p>}
                    </div>
                    <div className="card p-4 border-t-4 border-brand-primary">
                      <h3 className="text-sm font-bold text-brand-primary mb-2">Desmejoras</h3>
                      {evaluacion.desmejoras?.length ? evaluacion.desmejoras.map((m: any) => (
                        <div key={m.clave} className="flex items-baseline justify-between text-xs py-1 border-b border-brand-border last:border-0">
                          <span className="text-brand-graphite">{m.metrica}</span>
                          <span className="font-mono font-semibold text-brand-primary">
                            {(FMT[m.formato] ?? formatInt)(m.actual)} <span className="text-[10px]">({m.delta_pct}%)</span>
                          </span>
                        </div>
                      )) : <p className="text-xs text-brand-slate">Sin desmejoras significativas (±5%).</p>}
                    </div>
                    <div className="card p-4 border-t-4 border-brand-orange">
                      <h3 className="text-sm font-bold text-brand-orange mb-2">Datos llamativos</h3>
                      {evaluacion.llamativos?.length ? evaluacion.llamativos.map((l: any, i: number) => (
                        <p key={i} className="text-xs text-brand-graphite py-1 border-b border-brand-border last:border-0">{l.detalle}</p>
                      )) : <p className="text-xs text-brand-slate">Nada fuera de lo común esta semana.</p>}
                    </div>
                  </div>
                </section>
              )}

              {/* Comparativo entre semanas */}
              <section className="card overflow-x-auto mb-6">
                <div className="px-4 pt-4">
                  <h2 className="font-display text-xl text-brand-ink uppercase">Comparativo entre semanas</h2>
                  <p className="text-xs text-brand-slate mb-2">Últimas {ultimas.length} semanas — ¿se mejora o no? Δ vs la semana previa.</p>
                </div>
                <table className="w-full text-sm min-w-[820px]">
                  <thead className="bg-brand-bg border-b border-brand-border">
                    <tr className="text-[10px] uppercase tracking-wider2 text-brand-slate">
                      <th className="px-3 py-2 text-left">Semana</th>
                      <th className="px-3 py-2 text-right">Llamadas</th>
                      <th className="px-3 py-2 text-right">Atendidas</th>
                      <th className="px-3 py-2 text-right">Conv.%</th>
                      <th className="px-3 py-2 text-right">Pólizas</th>
                      <th className="px-3 py-2 text-right">Prima</th>
                      <th className="px-3 py-2 text-right">Δ Prima</th>
                      <th className="px-3 py-2 text-right">CRM</th>
                      <th className="px-3 py-2 text-right">Agentes/día</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ultimas.map((s, i) => {
                      const prev = i > 0 ? ultimas[i - 1] : null;
                      const dPrima = prev?.prima ? Math.round((s.prima - prev.prima) / prev.prima * 1000) / 10 : null;
                      return (
                        <tr key={s.semana}
                          className={`border-t border-brand-border ${s.semana === semanaSel ? "bg-brand-bg-soft font-semibold" : "hover:bg-brand-bg-soft"}`}>
                          <td className="px-3 py-2 text-brand-ink whitespace-nowrap">
                            {weekLabel(s.semana)}{s.completa ? "" : <span className="text-[10px] text-brand-orange ml-1">parcial</span>}
                          </td>
                          <td className="px-3 py-2 text-right">{formatInt(s.llamadas)}</td>
                          <td className="px-3 py-2 text-right">{formatInt(s.contestadas)}</td>
                          <td className="px-3 py-2 text-right font-mono">{s.conversion_pct}%</td>
                          <td className="px-3 py-2 text-right">{s.polizas}</td>
                          <td className="px-3 py-2 text-right">{formatGs(s.prima)}</td>
                          <td className={`px-3 py-2 text-right font-mono text-xs ${dPrima == null ? "text-brand-mist" : dPrima >= 0 ? "text-emerald-600" : "text-brand-primary"}`}>
                            {dPrima == null ? "—" : `${dPrima > 0 ? "▲ +" : dPrima < 0 ? "▼ " : "→ "}${dPrima}%`}
                          </td>
                          <td className="px-3 py-2 text-right">{s.tiene_crm ? formatInt(s.gestiones_crm) : "—"}</td>
                          <td className="px-3 py-2 text-right">{s.agentes_efectivos}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>

              {/* Dashboard de gestión de liderazgo y seguimiento: acciones, mitigaciones por asesor, compromisos */}
              <GestionLiderazgo semana={semanaSel!} desde={semana?.fecha_inicio} hasta={semana?.fecha_fin} agentes={semana?.agentes_efectivos} />

              {/* Reunión de los viernes: conclusión + compromisos (editar / eliminar / arrastrados) */}
              <ReunionSemanal semana={semanaSel!} />
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
