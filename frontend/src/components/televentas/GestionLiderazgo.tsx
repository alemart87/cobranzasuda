"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch } from "@/lib/api";
import { weekLabel } from "@/lib/month";

/** Gestión de liderazgo y seguimiento (reunión semanal Televentas · Sudameris).
 *  Qué acciones se tomaron en la semana, cuántas mitigaciones se aplicaron y a qué
 *  asesor, quién las hizo, qué alertas siguen sin atender y cómo van los compromisos. */

const ESTADO_ALERTA: Record<string, { label: string; color: string; cls: string }> = {
  activa: { label: "Activa · sin plan", color: "#E6332A", cls: "bg-brand-primary/10 text-brand-primary" },
  en_mitigacion: { label: "En mitigación", color: "#F39200", cls: "bg-brand-orange/10 text-brand-orange" },
  mitigada: { label: "Mitigada", color: "#10B981", cls: "bg-emerald-100 text-emerald-700" },
  apagada: { label: "Apagada", color: "#9CA3AF", cls: "bg-brand-bg text-brand-slate" },
};
const ACCION_CLS: Record<string, string> = {
  mitigar: "bg-brand-orange/10 text-brand-orange", resolver: "bg-emerald-100 text-emerald-700",
  apagar: "bg-brand-bg text-brand-slate", reactivar: "bg-brand-primary/10 text-brand-primary",
  comentar: "bg-brand-cyan/10 text-brand-cyan", creada: "bg-brand-bg text-brand-slate", actualizada: "bg-brand-bg text-brand-slate",
};
const ESTADO_COMP: Record<string, { label: string; color: string }> = {
  pendiente: { label: "Pendiente", color: "#E6332A" }, en_proceso: { label: "En proceso", color: "#F39200" }, cumplido: { label: "Cumplido", color: "#10B981" },
};

const fechaCorta = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit" }) : "—");
const fechaHora = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("es-PY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

function Kpi({ label, valor, sub, tono = "ink" }: { label: string; valor: string | number; sub?: string; tono?: "ink" | "primary" | "ok" | "orange" | "cyan" }) {
  const cls = { ink: "text-brand-ink border-l-brand-ink", primary: "text-brand-primary border-l-brand-primary", ok: "text-emerald-600 border-l-emerald-500", orange: "text-brand-orange border-l-brand-orange", cyan: "text-brand-cyan border-l-brand-cyan" }[tono];
  return (
    <div className={`card p-4 border-l-[3px] ${cls.split(" ")[1]}`}>
      <div className="text-[10px] uppercase tracking-wider2 font-semibold text-brand-slate">{label}</div>
      <div className={`mt-1 font-display text-3xl leading-none ${cls.split(" ")[0]}`}>{valor}</div>
      {sub && <div className="mt-1 text-[11px] text-brand-slate">{sub}</div>}
    </div>
  );
}

function Barra({ partes, total }: { partes: Array<{ n: number; color: string; label: string }>; total: number }) {
  if (!total) return <div className="h-2.5 rounded-full bg-brand-bg" />;
  return (
    <div className="flex h-2.5 rounded-full overflow-hidden bg-brand-bg">
      {partes.filter((p) => p.n > 0).map((p) => <div key={p.label} title={`${p.label}: ${p.n}`} style={{ width: `${(p.n / total) * 100}%`, background: p.color }} />)}
    </div>
  );
}

export function GestionLiderazgo({ semana, desde, hasta }: { semana: string; desde?: string | null; hasta?: string | null }) {
  const [g, setG] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [verTodo, setVerTodo] = useState(false);

  useEffect(() => {
    setG(null); setError(null);
    const q = new URLSearchParams({ semana });
    if (desde) q.set("desde", desde);
    if (hasta) q.set("hasta", hasta);
    apiFetch<any>(`/api/v1/televentas/semanal/gestion?${q.toString()}`).then(setG).catch((e) => setError(e.message));
  }, [semana, desde, hasta]);

  if (error) return <section className="card p-5 mb-6 text-sm text-brand-primary">{error}</section>;
  if (!g) return <section className="card p-5 mb-6 text-sm text-brand-slate">Cargando gestión de la semana…</section>;

  const r = g.resumen, al = g.alertas, comp = g.compromisos;
  const asesores: any[] = al.por_asesor ?? [];
  const asesoresGrafico = asesores.filter((a) => a.abiertas > 0 || a.mitigaciones_semana + a.resueltas_semana + a.comentarios_semana > 0);
  const chartData = asesoresGrafico.map((a) => ({
    asesor: a.asesor.length > 18 ? a.asesor.slice(0, 17) + "…" : a.asesor,
    "Mitigaciones iniciadas": a.mitigaciones_semana, "Resueltas": a.resueltas_semana, "Comentarios": a.comentarios_semana,
    "Sin atender": a.estado === "activa" ? 1 : 0,
  }));
  const timeline: any[] = al.timeline ?? [];
  const tl = verTodo ? timeline : timeline.slice(0, 8);
  const sem = comp.semana, arr = comp.arrastrados;

  return (
    <section className="mb-6 print:break-inside-avoid">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <div>
          <h2 className="font-display text-xl text-brand-ink uppercase">Gestión de liderazgo y seguimiento</h2>
          <p className="text-xs text-brand-slate">{weekLabel(semana)} · acciones registradas entre {fechaCorta(g.periodo.desde)} y {fechaCorta(g.periodo.hasta)} sobre las alertas de eficiencia y los compromisos de la reunión.</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
        <Kpi label="Acciones de la semana" valor={r.acciones_semana} sub={`${r.lideres_activos} líder(es) actuaron`} />
        <Kpi label="Mitigaciones aplicadas" valor={r.mitigaciones_semana} sub={`a ${r.asesores_mitigados} asesor(es)`} tono="orange" />
        <Kpi label="Alertas abiertas" valor={r.alertas_abiertas} sub={`${al.estado_actual.activa} activas · ${al.estado_actual.en_mitigacion} en mitigación`} tono="primary" />
        <Kpi label="Sin atender" valor={r.sin_atender} sub={r.sin_atender_nunca ? `${r.sin_atender_nunca} nunca gestionada(s)` : "todas tuvieron gestión"} tono={r.sin_atender ? "primary" : "ok"} />
        <Kpi label="Compromisos de la semana" valor={`${r.compromisos_cumplidos}/${r.compromisos_semana}`} sub={`${sem.cumplimiento_pct}% cumplidos`} tono={sem.total && sem.cumplido === sem.total ? "ok" : "cyan"} />
        <Kpi label="Arrastrados" valor={r.arrastrados} sub="de semanas anteriores sin cumplir" tono={r.arrastrados ? "orange" : "ok"} />
      </div>

      <div className="grid xl:grid-cols-2 gap-4 mb-4">
        {/* Mitigaciones por asesor */}
        <div className="card p-5">
          <h3 className="font-display text-base text-brand-ink uppercase">Mitigaciones por asesor</h3>
          <p className="text-[11px] text-brand-slate mb-2">Acciones de la semana sobre cada asesor con alerta. En rojo, los que siguen activos sin plan.</p>
          {chartData.length === 0 ? (
            <div className="text-sm text-brand-slate py-8 text-center">Sin alertas abiertas ni acciones en la semana.</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 34 + 40)}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                <XAxis type="number" allowDecimals={false} fontSize={10} />
                <YAxis type="category" dataKey="asesor" width={120} fontSize={10} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Mitigaciones iniciadas" stackId="a" fill="#F39200" />
                <Bar dataKey="Resueltas" stackId="a" fill="#10B981" />
                <Bar dataKey="Comentarios" stackId="a" fill="#0EA5E9" />
                <Bar dataKey="Sin atender" stackId="a" fill="#E6332A">
                  {chartData.map((d, i) => <Cell key={i} fill="#E6332A" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="grid grid-cols-4 gap-2 mt-2">
            {Object.entries(ESTADO_ALERTA).map(([k, v]) => (
              <div key={k} className="rounded-md border border-brand-border px-2 py-1.5 text-center">
                <div className="font-display text-xl leading-none" style={{ color: v.color }}>{al.estado_actual[k] ?? 0}</div>
                <div className="text-[9px] uppercase tracking-wider2 text-brand-slate mt-0.5">{v.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Quién gestionó + sin atender */}
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="font-display text-base text-brand-ink uppercase">Quién gestionó esta semana</h3>
            {al.por_lider.length === 0 ? (
              <div className="text-sm text-brand-slate py-4">Nadie registró acciones sobre alertas en la semana.</div>
            ) : (
              <div className="space-y-2 mt-2">
                {al.por_lider.map((l: any) => (
                  <div key={l.lider} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand-border px-3 py-2">
                    <div>
                      <div className="text-sm font-semibold text-brand-ink">{l.lider}</div>
                      <div className="text-[10px] text-brand-slate">{l.asesores_n} asesor(es): {l.asesores.join(", ")}</div>
                    </div>
                    <div className="flex flex-wrap gap-1 text-[10px] font-bold">
                      <span className="px-2 py-0.5 rounded bg-brand-ink text-white">{l.acciones} acciones</span>
                      {l.mitigar > 0 && <span className={`px-2 py-0.5 rounded ${ACCION_CLS.mitigar}`}>{l.mitigar} mitigar</span>}
                      {l.resolver > 0 && <span className={`px-2 py-0.5 rounded ${ACCION_CLS.resolver}`}>{l.resolver} resolver</span>}
                      {l.apagar > 0 && <span className={`px-2 py-0.5 rounded ${ACCION_CLS.apagar}`}>{l.apagar} apagar</span>}
                      {l.comentar > 0 && <span className={`px-2 py-0.5 rounded ${ACCION_CLS.comentar}`}>{l.comentar} comentarios</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className={`card p-5 ${al.sin_atender.length ? "border-l-4 border-l-brand-primary" : ""}`}>
            <h3 className="font-display text-base text-brand-ink uppercase">Alertas sin atender</h3>
            <p className="text-[11px] text-brand-slate mb-2">Activas sin plan de mitigación. Días desde la última gestión (o desde que se generó).</p>
            {al.sin_atender.length === 0 ? (
              <div className="text-sm text-emerald-700 font-semibold">Todas las alertas abiertas tienen un plan en curso.</div>
            ) : (
              <ul className="space-y-1.5">
                {al.sin_atender.map((s: any) => (
                  <li key={s.alerta_id} className="flex items-center justify-between gap-2 text-sm">
                    <span><b className="text-brand-ink">{s.asesor}</b> <span className="text-[10px] text-brand-slate">{s.mes} · {s.severidad}</span></span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${(s.dias_sin_accion ?? 0) >= 7 ? "bg-brand-primary text-white" : "bg-brand-primary/10 text-brand-primary"}`}>
                      {s.dias_sin_accion ?? "—"} días{s.nunca_gestionada ? " · nunca gestionada" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Tabla por asesor */}
      <div className="card overflow-x-auto mb-4">
        <div className="px-5 pt-4 pb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-base text-brand-ink uppercase">Seguimiento por asesor</h3>
          <span className="text-[11px] text-brand-slate">{asesores.length} asesor(es) con alerta · semana / histórico</span>
        </div>
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-brand-bg border-b border-brand-border">
            <tr className="text-[10px] uppercase tracking-wider2 text-brand-slate">
              <th className="px-3 py-2 text-left">Asesor</th>
              <th className="px-3 py-2 text-left">Estado</th>
              <th className="px-3 py-2 text-left">Motivo</th>
              <th className="px-3 py-2 text-right">Mitigaciones</th>
              <th className="px-3 py-2 text-right">Resueltas</th>
              <th className="px-3 py-2 text-right">Acciones sem.</th>
              <th className="px-3 py-2 text-left">Última acción</th>
              <th className="px-3 py-2 text-right">Días</th>
            </tr>
          </thead>
          <tbody>
            {asesores.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-brand-slate">No hay alertas de eficiencia registradas.</td></tr>}
            {asesores.map((a) => {
              const e = ESTADO_ALERTA[a.estado] ?? ESTADO_ALERTA.activa;
              return (
                <tr key={a.asesor} className="border-t border-brand-border align-top">
                  <td className="px-3 py-2 font-semibold text-brand-ink">{a.asesor}<div className="text-[10px] text-brand-slate font-normal">{a.mes} · {a.severidad ?? "—"}{a.indice != null ? ` · índice ${a.indice}` : ""}</div></td>
                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${e.cls}`}>{e.label}</span></td>
                  <td className="px-3 py-2 text-[11px] text-brand-graphite max-w-[220px]">{a.motivo ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono"><b>{a.mitigaciones_semana}</b> <span className="text-brand-slate text-xs">/ {a.mitigaciones_total}</span></td>
                  <td className="px-3 py-2 text-right font-mono"><b>{a.resueltas_semana}</b> <span className="text-brand-slate text-xs">/ {a.resueltas_total}</span></td>
                  <td className="px-3 py-2 text-right font-mono">{a.acciones_semana}</td>
                  <td className="px-3 py-2 text-[11px]">
                    {a.ultima_accion ? (
                      <>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${ACCION_CLS[a.ultima_accion.accion] ?? ""}`}>{a.ultima_accion.label}</span>
                        <span className="text-brand-slate"> · {a.ultima_accion.autor} · {fechaCorta(a.ultima_accion.fecha)}</span>
                        {a.ultima_accion.comentario && <div className="text-brand-graphite italic max-w-[260px]">“{a.ultima_accion.comentario}”</div>}
                      </>
                    ) : <span className="text-brand-primary font-semibold">Sin gestión</span>}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${(a.dias_sin_accion ?? 99) >= 7 && a.abiertas ? "text-brand-primary font-bold" : ""}`}>{a.dias_sin_accion ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        {/* Bitácora de acciones */}
        <div className="card p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-display text-base text-brand-ink uppercase">Bitácora de la semana</h3>
            {timeline.length > 8 && <button onClick={() => setVerTodo((v) => !v)} className="no-print text-[11px] text-brand-primary font-semibold hover:underline">{verTodo ? "Ver menos" : `Ver las ${timeline.length}`}</button>}
          </div>
          {tl.length === 0 ? (
            <div className="text-sm text-brand-slate py-4">Sin acciones registradas en la semana.</div>
          ) : (
            <ol className="mt-2 space-y-2">
              {tl.map((t: any, i: number) => (
                <li key={`${t.alerta_id}-${i}`} className="flex gap-3 text-sm">
                  <div className="w-[76px] flex-shrink-0 text-[10px] font-mono text-brand-slate pt-1">{fechaHora(t.fecha)}</div>
                  <div className="flex-1 border-l-2 border-brand-border pl-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${ACCION_CLS[t.accion] ?? ""}`}>{t.label}</span>
                      <b className="text-brand-ink">{t.asesor}</b>
                      <span className="text-[11px] text-brand-slate">por {t.autor}</span>
                    </div>
                    {t.comentario && <div className="text-[12px] text-brand-graphite mt-0.5">“{t.comentario}”</div>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Compromisos de la reunión */}
        <div className="card p-5">
          <h3 className="font-display text-base text-brand-ink uppercase">Compromisos de la reunión</h3>
          <p className="text-[11px] text-brand-slate mb-3">Semana actual por responsable, más lo arrastrado de semanas anteriores.</p>
          {(["Voicenter", "Sudameris"] as const).map((resp) => {
            const x = sem.por_responsable[resp];
            return (
              <div key={resp} className="mb-3">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${resp === "Voicenter" ? "bg-brand-cyan/10 text-brand-cyan" : "bg-brand-purple/10 text-brand-purple"}`}>{resp}</span>
                  <span className="font-mono text-xs text-brand-graphite">{x.cumplido}/{x.total} cumplidos · {x.en_proceso} en proceso · {x.pendiente} pendientes</span>
                </div>
                <Barra total={x.total} partes={[{ n: x.cumplido, color: ESTADO_COMP.cumplido.color, label: "Cumplidos" }, { n: x.en_proceso, color: ESTADO_COMP.en_proceso.color, label: "En proceso" }, { n: x.pendiente, color: ESTADO_COMP.pendiente.color, label: "Pendientes" }]} />
              </div>
            );
          })}
          <div className="rounded-md border border-brand-border bg-brand-bg-soft px-3 py-2 text-[12px] text-brand-graphite">
            <b className="text-brand-ink">Arrastrados:</b> {arr.total ? `${arr.total} compromiso(s) de semanas anteriores sin cumplir (${arr.en_proceso} en proceso, ${arr.pendiente} sin empezar).` : "nada pendiente de semanas anteriores."}
            {arr.items.slice(0, 4).map((c: any) => (
              <div key={c.id} className="mt-1 flex items-start gap-2"><span className="text-[10px] font-mono text-brand-slate pt-0.5">{c.semana}</span><span className="flex-1">{c.descripcion} <span className="text-[10px] text-brand-slate">· {c.responsable}</span></span></div>
            ))}
          </div>
          <div className="mt-2 text-[11px] text-brand-slate">Histórico: {comp.historico.cumplido} cumplidos de {comp.historico.total} ({comp.historico.cumplimiento_pct}%).</div>
        </div>
      </div>
    </section>
  );
}
