"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { PrintButton, PrintCover, PrintHeader } from "@/components/PrintButton";
import { Lectura } from "@/components/televentas/Lectura";
import { apiFetch, getUser } from "@/lib/api";
import { formatGs, formatInt } from "@/lib/format";
import { monthLabel } from "@/lib/month";

const ESTADO: Record<string, { label: string; cls: string; orden: number }> = {
  optimo: { label: "Óptimo", cls: "bg-emerald-100 text-emerald-700", orden: 0 },
  a_mejorar: { label: "A mejorar", cls: "bg-brand-orange/10 text-brand-orange", orden: 1 },
  critico: { label: "Crítico", cls: "bg-brand-primary/10 text-brand-primary", orden: 2 },
  baja: { label: "Se recomienda baja", cls: "bg-brand-primary text-white", orden: 3 },
  nuevo_sobresaliente: { label: "Nuevo sobresaliente", cls: "bg-brand-cyan/10 text-brand-cyan", orden: 4 },
  nuevo_desarrollo: { label: "Nuevo en desarrollo", cls: "bg-brand-bg text-brand-graphite border border-brand-border", orden: 5 },
  nuevo_critico: { label: "Nuevo crítico", cls: "bg-brand-orange text-white", orden: 6 },
  observacion: { label: "En observación", cls: "bg-brand-bg text-brand-slate border border-brand-border", orden: 7 },
};

export default function EficienciaPage() {
  const [meses, setMeses] = useState<string[]>([]);
  const [mes, setMes] = useState<string>("");
  const [objetivo, setObjetivo] = useState("300000000");
  const [res, setRes] = useState<any>(null);
  const [analisisId, setAnalisisId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historial, setHistorial] = useState<any[]>([]);
  const [notas, setNotas] = useState<any[]>([]);
  const [nuevaNota, setNuevaNota] = useState("");
  const [verAlgoritmo, setVerAlgoritmo] = useState(false);

  const user = getUser();
  const puedeGenerar = user && user.role !== "client";

  useEffect(() => {
    apiFetch<any>("/api/v1/televentas/eficiencia/meses").then((d) => {
      setMeses(d.meses ?? []);
      if (d.meses?.length) setMes(d.meses[0]);
    }).catch(() => {});
    cargarHistorial();
  }, []);

  const cargarHistorial = () =>
    apiFetch<any>("/api/v1/televentas/eficiencia/analisis").then((d) => setHistorial(d.analisis ?? [])).catch(() => {});

  const generar = async () => {
    if (!mes || !(Number(objetivo) > 0)) return;
    setRunning(true); setError(null);
    try {
      const d = await apiFetch<any>("/api/v1/televentas/eficiencia", {
        method: "POST", body: JSON.stringify({ mes, objetivo_prima: Number(objetivo) }),
      });
      setRes(d); setAnalisisId(d.analisis_id); setNotas([]);
      cargarHistorial();
    } catch (e: any) { setError(e.message); } finally { setRunning(false); }
  };

  const abrir = async (id: string) => {
    try {
      const d = await apiFetch<any>(`/api/v1/televentas/eficiencia/analisis/${id}`);
      setRes(d.data); setAnalisisId(d.id); setNotas(d.notas_detalle ?? []);
      setMes(d.mes); setObjetivo(String(Math.round(d.objetivo_prima)));
    } catch { /* noop */ }
  };

  const agregarNota = async () => {
    if (!analisisId || !nuevaNota.trim()) return;
    try {
      const n = await apiFetch<any>(`/api/v1/televentas/eficiencia/analisis/${analisisId}/notas`, {
        method: "POST", body: JSON.stringify({ texto: nuevaNota.trim() }),
      });
      setNotas([...notas, n]); setNuevaNota("");
      cargarHistorial();
    } catch { /* noop */ }
  };

  const eq = res?.equipo;
  const reglas = res?.reglas;
  const operadores = [...(res?.operadores ?? []), ...(res?.en_observacion ?? [])];

  return (
    <AppShell>
      <PrintCover
        titulo={`Eficiencia del Negocio${res ? ` — ${monthLabel(res.mes)}` : ""}`}
        periodo={res ? `Objetivo del mes: ${formatGs(res.objetivo_prima)} · Clasificación de operadores para decisiones de dotación` : undefined}
      />
      <PrintHeader titulo={`Eficiencia del Negocio${res ? ` · ${monthLabel(res.mes)}` : ""}`}
        subtitulo="Sudameris Seguros paga por hora: la eficiencia por operador es la base de las decisiones de dotación" />

      <div className="mb-2 text-xs text-brand-slate no-print">
        <Link href="/televentas" className="hover:text-brand-primary">Televentas</Link>
        <span className="mx-2">/</span><span className="text-brand-ink font-semibold">Eficiencia del negocio</span>
      </div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-brand-ink uppercase">Eficiencia del Negocio</h1>
          <p className="text-sm text-brand-slate mt-1 max-w-3xl">
            Análisis mensual para decisiones de dotación: comportamiento vs el objetivo del mes y clasificación
            de cada operador contra la media del equipo. El servicio se paga por hora — la improductividad se
            detecta y se resuelve rápido, con reglas públicas y auditables.{" "}
            <Link href="/televentas/eficiencia/como-funciona" className="text-brand-primary font-semibold hover:underline no-print">
              ¿Cómo funciona el scoring? →
            </Link>
          </p>
        </div>
        <PrintButton label="Exportar informe PDF" />
      </div>

      {/* Parámetros */}
      <section className="card p-4 mb-6 no-print">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-[11px] text-brand-slate mb-1">Mes analizado</span>
            <select value={mes} onChange={(e) => setMes(e.target.value)}
              className="text-sm border border-brand-border rounded px-3 py-2 bg-white font-semibold">
              {meses.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-[11px] text-brand-slate mb-1">Objetivo mensual de prima emitida (Gs)</span>
            <input type="number" step={10000000} value={objetivo} onChange={(e) => setObjetivo(e.target.value)}
              className="input max-w-[190px] !py-1.5 text-right" />
          </label>
          {puedeGenerar && (
            <button onClick={generar} disabled={running || !mes || !(Number(objetivo) > 0)} className="btn-primary disabled:opacity-50">
              {running ? "Analizando…" : "Generar análisis"}
            </button>
          )}
          <button onClick={() => setVerAlgoritmo(!verAlgoritmo)}
            className="text-sm text-brand-graphite border border-brand-border rounded px-3 py-2 hover:border-brand-primary">
            {verAlgoritmo ? "Ocultar algoritmo" : "Cómo clasifica el algoritmo"}
          </button>
          {historial.length > 0 && (
            <label className="text-sm ml-auto">
              <span className="block text-[11px] text-brand-slate mb-1">Análisis registrados</span>
              <select value={analisisId ?? ""} onChange={(e) => e.target.value && abrir(e.target.value)}
                className="text-sm border border-brand-border rounded px-3 py-2 bg-white">
                <option value="">Ver análisis anterior…</option>
                {historial.map((h) => (
                  <option key={h.id} value={h.id}>
                    {monthLabel(h.mes)} · {h.created_at ? new Date(h.created_at).toLocaleDateString("es-PY") : ""} · {h.cumplimiento_pct ?? "—"}%{h.notas ? ` · ${h.notas} nota(s)` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {error && <p className="text-sm text-brand-primary mt-2">{error}</p>}
      </section>

      {/* Explicación del algoritmo y compromiso — visible a demanda y SIEMPRE en el PDF */}
      {(verAlgoritmo || res) && (
        <section className={`card p-5 mb-6 ${verAlgoritmo ? "" : "print-only"}`}>
          <h2 className="font-display text-xl text-brand-ink uppercase mb-2">Nuestro algoritmo y compromiso con la eficiencia</h2>
          <div className="text-sm text-brand-graphite leading-relaxed space-y-3">
            <p>
              <b>Compromiso:</b> Sudameris Seguros paga este servicio por hora. Nuestro compromiso es que cada hora
              facturada produzca resultados: medimos a cada operador con reglas públicas, tomamos decisiones rápido
              — y dejamos registro de cada análisis y de cada decisión.
            </p>
            <p>
              <b>Índice de eficiencia (100 = media del equipo establecido):</b> combina la producción por día activo
              (peso 60% — es lo que se paga), la conversión (25% — calidad de la gestión) y el ritmo de llamadas
              (15% — esfuerzo). La media se calcula solo con operadores establecidos, para que los nuevos no la distorsionen.
            </p>
            <div className="grid md:grid-cols-2 gap-3 text-[13px]">
              <div className="bg-brand-bg-soft rounded-md p-3">
                <b>Operadores establecidos (más de 60 días):</b>
                <ul className="mt-1 space-y-0.5">
                  <li>· <b>Óptimo</b>: índice ≥ 100 — en o sobre la media.</li>
                  <li>· <b>A mejorar</b>: 70 a 99 — margen con coaching puntual.</li>
                  <li>· <b>Crítico</b>: 45 a 69 — plan de recuperación inmediato, revisión al mes.</li>
                  <li>· <b>Se recomienda baja</b>: índice menor a 45, o menor a 60 por segundo mes consecutivo.</li>
                </ul>
              </div>
              <div className="bg-brand-bg-soft rounded-md p-3">
                <b>Nuevos asesores (15 a 60 días):</b>
                <ul className="mt-1 space-y-0.5">
                  <li>· <b>Nuevo sobresaliente</b>: índice ≥ 90 — ya rinde al nivel del equipo.</li>
                  <li>· <b>Nuevo en desarrollo</b>: 55 a 89 — despegando, curva normal.</li>
                  <li>· <b>Nuevo crítico</b>: menor a 55 — muy por debajo aun con la curva a favor.</li>
                  <li>· <b>Menos de 15 días</b>: en observación — no se clasifica; el mínimo de datos es innegociable para evaluar con justicia.</li>
                </ul>
              </div>
            </div>
            <p className="text-xs text-brand-slate">
              La antigüedad se mide desde el primer registro histórico de llamadas del operador. Cambiar umbrales o
              pesos es una decisión de negocio y queda versionada en cada análisis registrado.
            </p>
          </div>
        </section>
      )}

      {res && eq && (
        <>
          {/* Comportamiento vs objetivo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KpiCard label="Prima emitida del mes" value={formatGs(eq.prima_emitida)} hint={`objetivo ${formatGs(res.objetivo_prima)}`} accent="primary" />
            <KpiCard label="Cumplimiento" value={eq.cumplimiento_pct != null ? `${eq.cumplimiento_pct}%` : "—"} hint={eq.brecha_gs != null ? `brecha ${formatGs(eq.brecha_gs)}` : undefined} accent={eq.cumplimiento_pct >= 100 ? "cyan" : "orange"} />
            <KpiCard label="Operadores clasificados" value={`${eq.operadores_clasificados}`} hint={`${res.resumen?.observacion ?? 0} en observación`} accent="neutral" />
            <KpiCard label="Cuota por operador" value={eq.cuota_por_operador ? formatGs(eq.cuota_por_operador) : "—"} hint="objetivo ÷ clasificados" accent="neutral" />
          </div>

          {/* Resumen por estado */}
          <div className="flex flex-wrap gap-2 mb-6">
            {Object.entries(ESTADO).map(([k, e]) => {
              const n = res.resumen?.[k] ?? 0;
              if (!n) return null;
              return <span key={k} className={`px-3 py-1.5 rounded-md text-sm font-bold ${e.cls}`}>{e.label}: {n}</span>;
            })}
          </div>

          <div className="grid xl:grid-cols-2 gap-6 mb-6 print:block">
            {/* Avance vs objetivo */}
            {res.serie_acumulada?.length > 0 && (
              <section className="card p-5 print:mb-5">
                <h2 className="font-display text-lg text-brand-ink uppercase mb-1">Comportamiento vs objetivo del mes</h2>
                <p className="text-xs text-brand-slate mb-3">Prima emitida acumulada día a día contra el objetivo prorrateado.</p>
                <ResponsiveContainer width="100%" height={230}>
                  <ComposedChart data={res.serie_acumulada} margin={{ top: 8, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="fecha" fontSize={10} tickFormatter={(f: string) => f.slice(5)} minTickGap={24} />
                    <YAxis fontSize={10} tickFormatter={(v: number) => `${Math.round(v / 1e6)}M`} />
                    <Tooltip formatter={(v: any) => formatGs(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="prima" name="Prima del día" fill="#0EA5E9" fillOpacity={0.5} />
                    <Line dataKey="acumulado" name="Acumulado real" stroke="#0F1116" strokeWidth={2.5} dot={false} />
                    <Line dataKey="objetivo_lineal" name="Objetivo prorrateado" stroke="#E6332A" strokeWidth={2} strokeDasharray="6 3" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
                <Lectura>
                  La línea negra es la prima acumulada real del mes; la roja punteada, el objetivo repartido
                  proporcionalmente en los días. Si la negra corre por debajo de la roja, el mes viene atrasado
                  respecto del objetivo y la brecha final es previsible con anticipación.
                </Lectura>
              </section>
            )}

            {/* Índice por operador */}
            <section className="card p-5">
              <h2 className="font-display text-lg text-brand-ink uppercase mb-1">Índice de eficiencia por operador</h2>
              <p className="text-xs text-brand-slate mb-3">100 = media del equipo establecido. Líneas: umbrales de estado.</p>
              <ResponsiveContainer width="100%" height={Math.max(230, (res.operadores?.length ?? 0) * 26)}>
                <ComposedChart data={res.operadores} layout="vertical" margin={{ left: 40, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={10} domain={[0, (dataMax: number) => Math.max(dataMax, 120)]} />
                  <YAxis type="category" dataKey="vendedor" fontSize={10} width={140} />
                  <Tooltip formatter={(v: any) => [`${v}`, "Índice"]} />
                  <Bar dataKey="indice" name="Índice" fill="#0EA5E9" fillOpacity={0.75} radius={[0, 3, 3, 0]} />
                  <ReferenceLine x={100} stroke="#10B981" strokeWidth={2} label={{ value: "Media (100)", position: "top", fill: "#10B981", fontSize: 10, fontWeight: 700 }} />
                  <ReferenceLine x={70} stroke="#F39200" strokeDasharray="4 3" />
                  <ReferenceLine x={45} stroke="#E6332A" strokeDasharray="4 3" />
                </ComposedChart>
              </ResponsiveContainer>
              <Lectura>
                Cada barra es el índice de eficiencia del operador: 100 es la media del equipo. La línea verde marca
                la media; la naranja (70) separa "a mejorar" de "crítico"; la roja (45) es el umbral de baja. Los
                nuevos asesores se leen con sus propios umbrales (90/55), indicados en su estado.
              </Lectura>
            </section>
          </div>

          {/* Tabla de operadores */}
          <section className="card overflow-x-auto mb-6">
            <div className="px-4 pt-4">
              <h2 className="font-display text-xl text-brand-ink uppercase">Clasificación por operador</h2>
              <p className="text-xs text-brand-slate mb-2">Ordenados por índice. El motivo explica cada clasificación con los números que la sustentan.</p>
            </div>
            <table className="w-full text-sm min-w-[880px]">
              <thead className="bg-brand-bg border-b border-brand-border">
                <tr className="text-[10px] uppercase tracking-wider2 text-brand-slate">
                  <th className="px-3 py-2 text-left">Operador</th>
                  <th className="px-3 py-2 text-center">Estado</th>
                  <th className="px-3 py-2 text-right">Índice</th>
                  <th className="px-3 py-2 text-right">Prima</th>
                  <th className="px-3 py-2 text-right">Prima/día</th>
                  <th className="px-3 py-2 text-right">Conv.%</th>
                  <th className="px-3 py-2 text-right">Llam/día</th>
                  <th className="px-3 py-2 text-right">Días</th>
                  <th className="px-3 py-2 text-right">Antigüedad</th>
                </tr>
              </thead>
              <tbody>
                {operadores.map((o: any) => {
                  const e = ESTADO[o.estado] ?? ESTADO.observacion;
                  return (
                    <tr key={o.vendedor} className="border-t border-brand-border hover:bg-brand-bg-soft align-top">
                      <td className="px-3 py-2">
                        <div className="font-medium text-brand-ink">{o.vendedor}</div>
                        <div className="text-[11px] text-brand-slate max-w-[420px] leading-snug mt-0.5">{o.motivo}</div>
                      </td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold ${e.cls}`}>{e.label}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold">{o.indice ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{formatGs(o.prima)}</td>
                      <td className="px-3 py-2 text-right">{formatGs(o.prima_dia)}</td>
                      <td className="px-3 py-2 text-right font-mono">{o.conversion_pct}%</td>
                      <td className="px-3 py-2 text-right">{o.llamadas_dia}</td>
                      <td className="px-3 py-2 text-right">{o.dias_activos}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{o.antiguedad_dias != null ? `${o.antiguedad_dias} d` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* Conclusión */}
          <section className="card p-5 border-l-4 border-brand-ink mb-6">
            <h2 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-bold mb-2">Conclusión del análisis</h2>
            <p className="text-[15px] text-brand-ink leading-relaxed font-medium">{res.conclusion}</p>
          </section>

          {/* Notas y registros */}
          {analisisId && (
            <section className="card p-5 mb-6">
              <h2 className="font-display text-lg text-brand-ink uppercase mb-1">Notas y registros del análisis</h2>
              <p className="text-xs text-brand-slate mb-3">
                Lo conversado y decidido sobre este análisis queda registrado con autor y fecha.
              </p>
              {notas.length > 0 && (
                <ul className="space-y-2 mb-4">
                  {notas.map((n) => (
                    <li key={n.id} className="rounded-md bg-brand-bg-soft border border-brand-border px-3 py-2">
                      <p className="text-sm text-brand-ink">{n.texto}</p>
                      <p className="text-[10px] text-brand-slate mt-1">
                        {n.autor} · {n.created_at ? new Date(n.created_at).toLocaleString("es-PY") : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2 no-print">
                <input value={nuevaNota} onChange={(e) => setNuevaNota(e.target.value)}
                  placeholder='Ej.: "Se decide baja de Diego Sosa a fin de mes; Carla pasa a coaching con supervisora."'
                  className="input flex-1 !py-2" />
                <button onClick={agregarNota} disabled={!nuevaNota.trim()} className="btn-primary disabled:opacity-50">
                  Registrar nota
                </button>
              </div>
            </section>
          )}

          <p className="text-[11px] text-brand-slate">
            Análisis registrado {analisisId ? `(#${String(analisisId).slice(0, 8)}) ` : ""}con las reglas versión
            vigente (mínimo {reglas?.min_dias_analisis} días para clasificar; nuevo hasta {reglas?.nuevo_max_dias} días;
            pesos {Math.round((reglas?.pesos?.prima_dia ?? 0) * 100)}/{Math.round((reglas?.pesos?.conversion ?? 0) * 100)}/{Math.round((reglas?.pesos?.ritmo ?? 0) * 100)}).
            Sobre este informe se toman decisiones de dotación: cualquier cambio de reglas queda documentado.
          </p>
        </>
      )}

      {!res && (
        <div className="card p-10 text-center text-brand-slate">
          Elegí el mes y el objetivo mensual y generá el análisis — o abrí un análisis registrado.
          La clasificación usa reglas públicas: el botón "Cómo clasifica el algoritmo" las explica.
        </div>
      )}
    </AppShell>
  );
}
