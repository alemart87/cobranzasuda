"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { InsightsPanel } from "@/components/televentas/InsightsPanel";
import { apiFetch } from "@/lib/api";
import { formatGs, formatInt } from "@/lib/format";
import { monthLabel } from "@/lib/month";

interface Params {
  ticket_promedio: number; conversion_pct: number; contactabilidad_pct: number;
  llamadas_asesor_dia: number; dias_habiles: number; intentos_por_registro: number;
  tasa_anulacion_pct: number;
}

const PARAM_DEFS: Array<{ key: keyof Params; label: string; hint: string; step: number; suffix?: string }> = [
  { key: "ticket_promedio", label: "Ticket promedio (Gs)", hint: "prima emitida ÷ pólizas", step: 10000 },
  { key: "conversion_pct", label: "Conversión %", hint: "pólizas ÷ llamadas contestadas", step: 0.1, suffix: "%" },
  { key: "contactabilidad_pct", label: "Contactabilidad %", hint: "contestadas (≥34s) ÷ llamadas", step: 0.5, suffix: "%" },
  { key: "llamadas_asesor_dia", label: "Llamadas / asesor / día", hint: "ritmo de marcación", step: 1 },
  { key: "dias_habiles", label: "Días hábiles del mes", hint: "días operativos", step: 1 },
  { key: "intentos_por_registro", label: "Intentos por registro", hint: "marcaciones promedio a cada registro de la base", step: 0.5 },
  { key: "tasa_anulacion_pct", label: "Tasa de anulación %", hint: "prima anulada ÷ emitida (histórica)", step: 0.5, suffix: "%" },
];

function simular(p: Params, metaPrima: number | null, asesores: number | null) {
  const ticket = Math.max(p.ticket_promedio, 1);
  const conv = Math.max(p.conversion_pct, 0.01) / 100;
  const contact = Math.max(p.contactabilidad_pct, 0.01) / 100;
  const capMes = Math.max(p.llamadas_asesor_dia, 1) * Math.max(p.dias_habiles, 1);
  const intentos = Math.max(p.intentos_por_registro, 0.1);
  const anul = Math.min(Math.max(p.tasa_anulacion_pct, 0), 90) / 100;
  if (metaPrima != null) {
    const emitir = metaPrima / (1 - anul);
    const polizas = emitir / ticket;
    const contactos = polizas / conv;
    const llamadas = contactos / contact;
    return {
      modo: "meta" as const, emitir, polizas: Math.ceil(polizas), contactos: Math.ceil(contactos),
      llamadas: Math.ceil(llamadas), asesores: llamadas / capMes,
      registros: Math.ceil(llamadas / intentos), capMes,
    };
  }
  const llamadas = (asesores ?? 0) * capMes;
  const contactos = llamadas * contact;
  const polizas = contactos * conv;
  const emitida = polizas * ticket;
  return {
    modo: "dotacion" as const, llamadas: Math.round(llamadas), contactos: Math.round(contactos),
    polizas: Math.round(polizas * 10) / 10, emitida, neta: emitida * (1 - anul),
    registros: Math.ceil(llamadas / intentos), capMes,
  };
}

export default function SimuladorPage() {
  const [meta, setMeta] = useState<any>(null);
  const [params, setParams] = useState<Params | null>(null);
  const [modo, setModo] = useState<"meta" | "dotacion">("meta");
  const [metaPrima, setMetaPrima] = useState("500000000");
  const [asesores, setAsesores] = useState("20");
  const [loading, setLoading] = useState(true);
  const [mesesSel, setMesesSel] = useState<string[]>([]);
  const [reg, setReg] = useState<any>(null);

  const cargar = (meses?: string[]) => {
    setLoading(true);
    const q = meses?.length ? `?meses=${meses.join(",")}` : "";
    apiFetch<any>(`/api/v1/televentas/simulador${q}`).then((d) => {
      setMeta(d.parametros);
      setReg(d.regresion ?? null);
      if (d.parametros?.disponible) {
        const { disponible, meses_usados, meses_disponibles, mensaje, ...p } = d.parametros;
        setParams(p as Params);
        setMesesSel(meses_usados || []);
      }
    }).finally(() => setLoading(false));
  };
  useEffect(() => { cargar(); }, []);

  const toggleMes = (m: string) => {
    const next = mesesSel.includes(m) ? mesesSel.filter((x) => x !== m) : [...mesesSel, m];
    if (next.length === 0) return; // siempre al menos un mes
    setMesesSel(next);
    cargar(next); // re-siembra las tasas pooled con la nueva selección
  };

  const r = useMemo(() => {
    if (!params) return null;
    const m = Number(metaPrima), a = Number(asesores);
    if (modo === "meta" && m > 0) return simular(params, m, null);
    if (modo === "dotacion" && a > 0) return simular(params, null, a);
    return null;
  }, [params, modo, metaPrima, asesores]);

  const escenarios = useMemo(() => {
    if (!params || modo !== "meta" || !(Number(metaPrima) > 0)) return [];
    return ([["Conservador", 0.85], ["Base", 1], ["Optimista", 1.15]] as const).map(([n, f]) => {
      const p = { ...params, conversion_pct: params.conversion_pct * f };
      const s = simular(p, Number(metaPrima), null);
      return { nombre: n, conv: p.conversion_pct, asesores: Math.ceil(s.modo === "meta" ? s.asesores : 0), llamadas: s.llamadas, registros: s.registros };
    });
  }, [params, modo, metaPrima]);

  const setP = (k: keyof Params, v: string) => params && setParams({ ...params, [k]: Number(v) });

  const conv = reg?.conversion; // regresión diaria: {pct, ic95_pct, r2, n}
  const dotActual = meta?.meses_disponibles?.[0]?.agentes ?? null; // mes completo más reciente

  // Rango de asesores según el IC 95% de la conversión diaria.
  const rangoAsesores = useMemo(() => {
    if (!params || modo !== "meta" || !(Number(metaPrima) > 0) || !conv?.ic95_pct) return null;
    const lo: any = simular({ ...params, conversion_pct: conv.ic95_pct[1] }, Number(metaPrima), null);
    const hi: any = simular({ ...params, conversion_pct: Math.max(conv.ic95_pct[0], 0.01) }, Number(metaPrima), null);
    return { min: Math.ceil(lo.asesores), max: Math.ceil(hi.asesores) };
  }, [params, modo, metaPrima, conv]);

  // Curva: asesores necesarios según nivel de meta (con banda IC si hay regresión).
  const curvaDotacion = useMemo(() => {
    if (!params || !(Number(metaPrima) > 0)) return [];
    const base = Number(metaPrima);
    const pts: any[] = [];
    for (let f = 0.4; f <= 1.61; f += 0.2) {
      const m = base * f;
      const row: any = { meta: `${Math.round(m / 1e6)}M`, base: Math.ceil((simular(params, m, null) as any).asesores) };
      if (conv?.ic95_pct) {
        row.optimista = Math.ceil((simular({ ...params, conversion_pct: conv.ic95_pct[1] }, m, null) as any).asesores);
        row.conservador = Math.ceil((simular({ ...params, conversion_pct: Math.max(conv.ic95_pct[0], 0.01) }, m, null) as any).asesores);
      }
      pts.push(row);
    }
    return pts;
  }, [params, metaPrima, conv]);

  // Recomendaciones dinámicas (se recalculan con cada cambio de parámetros/meta).
  const recomendaciones = useMemo(() => {
    if (!params || !r) return [];
    const out: any[] = [];
    const capMes = Math.max(params.llamadas_asesor_dia, 1) * Math.max(params.dias_habiles, 1);
    if (r.modo === "meta") {
      const need = Math.ceil(r.asesores);
      if (dotActual != null) {
        if (need > dotActual) {
          const contact = Math.max(params.contactabilidad_pct, 0.01) / 100;
          const convReq = (r.polizas / (dotActual * capMes * contact)) * 100;
          const proy: any = simular(params, null, dotActual);
          out.push({ tipo: "dotacion", severidad: "alert",
            titulo: `Faltan ${need - dotActual} asesores para la meta`,
            detalle: `Con la dotación del último mes (${dotActual}) proyectás ${formatGs(proy.neta)} netos. Opciones: sumar ${need - dotActual} asesores, o subir la conversión a ${convReq.toFixed(2)}% (hoy ${params.conversion_pct}%).` });
        } else {
          out.push({ tipo: "dotacion", severidad: "info",
            titulo: "La dotación actual alcanza",
            detalle: `Necesitás ${need} asesores y el último mes operaron ${dotActual}. Margen: ${dotActual - need}.` });
        }
      }
      const ahorroConv = need - Math.ceil((simular({ ...params, conversion_pct: params.conversion_pct + 0.5 }, Number(metaPrima), null) as any).asesores);
      if (ahorroConv > 0) out.push({ tipo: "palanca", severidad: "info",
        titulo: `Palanca: +0,5 pt de conversión ≈ −${ahorroConv} asesores`,
        detalle: `Subir la conversión de ${params.conversion_pct}% a ${(params.conversion_pct + 0.5).toFixed(2)}% (coaching de cierre, mejores bases) reduce la dotación necesaria de ${need} a ${need - ahorroConv}.` });
      const ahorroRitmo = need - Math.ceil((simular({ ...params, llamadas_asesor_dia: params.llamadas_asesor_dia + 5 }, Number(metaPrima), null) as any).asesores);
      if (ahorroRitmo > 0) out.push({ tipo: "palanca", severidad: "info",
        titulo: `Palanca: +5 llamadas/asesor/día ≈ −${ahorroRitmo} asesores`,
        detalle: `Pasar de ${params.llamadas_asesor_dia} a ${params.llamadas_asesor_dia + 5} llamadas por asesor/día cubre la misma meta con menos dotación.` });
      if (params.tasa_anulacion_pct >= 10) out.push({ tipo: "anulacion", severidad: "warning",
        titulo: `La anulación (${params.tasa_anulacion_pct}%) encarece la meta`,
        detalle: `Para ${formatGs(Number(metaPrima))} netos hay que emitir ${formatGs(r.emitir)}. Reducir la anulación a la mitad ahorraría ${formatGs(r.emitir - Number(metaPrima) / (1 - params.tasa_anulacion_pct / 200))} de emisión.` });
      out.push({ tipo: "base", severidad: "info",
        titulo: `Base de datos: ${formatInt(r.registros)} registros frescos`,
        detalle: `A ${params.intentos_por_registro} intento(s) por registro se necesitan ${formatInt(r.llamadas)} marcaciones. Bases agotadas bajan la contactabilidad y rompen la proyección.` });
    } else {
      out.push({ tipo: "proyeccion", severidad: "info",
        titulo: `Con ${asesores} asesores: ${formatGs(r.neta)} netos proyectados`,
        detalle: conv?.ic95_pct
          ? `Rango estadístico (IC 95% de la conversión diaria): entre ${formatGs((simular({ ...params, conversion_pct: Math.max(conv.ic95_pct[0], 0.01) }, null, Number(asesores)) as any).neta)} y ${formatGs((simular({ ...params, conversion_pct: conv.ic95_pct[1] }, null, Number(asesores)) as any).neta)}.`
          : `Requiere ${formatInt(r.registros)} registros de base en el mes.` });
    }
    if (conv) {
      const [lo, hi] = conv.ic95_pct;
      if (params.conversion_pct < lo || params.conversion_pct > hi) out.push({ tipo: "estadistica", severidad: "warning",
        titulo: `La conversión del modelo (${params.conversion_pct}%) está fuera del rango estadístico`,
        detalle: `La regresión diaria (${conv.n} días) estima conversión entre ${lo}% y ${hi}% (IC 95%). Revisá los meses seleccionados o el supuesto ingresado.` });
      if (conv.r2 < 0.4) out.push({ tipo: "estadistica", severidad: "warning",
        titulo: `Relación llamadas→ventas débil (R² ${conv.r2})`,
        detalle: "Las ventas diarias no siguen de cerca a las llamadas (desfase de emisión, calidad de base variable). Usá los rangos, no el punto exacto." });
    } else if (reg) {
      out.push({ tipo: "estadistica", severidad: "info",
        titulo: "Aún sin regresión diaria",
        detalle: reg.mensaje || "Se necesitan al menos 5 días con datos de llamadas y producción en los meses elegidos." });
    }
    return out;
  }, [params, r, reg, conv, dotActual, modo, metaPrima, asesores]);

  const maxX = Math.max(...(reg?.puntos ?? []).map((p: any) => p.contestadas), 0);
  const fitData = conv ? [{ contestadas: 0, polizas: 0 }, { contestadas: maxX, polizas: (maxX * conv.pct) / 100 }] : [];

  return (
    <AppShell>
      <div className="mb-2 text-xs text-brand-slate">
        <Link href="/televentas" className="hover:text-brand-primary">Televentas</Link>
        <span className="mx-2">/</span><span className="text-brand-ink font-semibold">Simulador</span>
      </div>
      <div className="mb-6">
        <h1 className="font-display text-3xl sm:text-4xl text-brand-ink uppercase">Simulador de Ventas</h1>
        <p className="text-sm text-brand-slate mt-1 max-w-3xl">
          Proyectá el call center: cuántos asesores y cuántos registros de base hacen falta para una meta de prima
          — o cuánto puede vender una dotación. Parámetros sembrados con las <b>tasas reales</b> de la operación.
        </p>
      </div>

      {loading && <div className="text-brand-slate">Cargando tasas reales…</div>}

      {!loading && meta && !meta.disponible && (
        <div className="card p-8 text-center text-brand-slate">
          {meta.mensaje || "Se necesita al menos un mes publicado completo (llamadas + producción)."}
        </div>
      )}

      {!loading && params && (
        <div className="grid lg:grid-cols-5 gap-6">
          {/* Parámetros */}
          <section className="card p-5 lg:col-span-2 h-fit">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="font-display text-xl text-brand-ink uppercase">Parámetros del modelo</h2>
            </div>

            <p className="text-[11px] text-brand-slate mb-2">
              <b>Meses base</b> — elegí cuáles alimentan las tasas (un mes atípico distorsiona el modelo).
              Las tasas se calculan sobre los <b>totales</b> de los meses elegidos.
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {(meta.meses_disponibles || []).map((m: any) => {
                const on = mesesSel.includes(m.mes);
                return (
                  <button key={m.mes} onClick={() => toggleMes(m.mes)}
                    title={`Conv. ${m.conversion_pct}% · Contacto ${m.contactabilidad_pct}% · ${m.agentes} agentes`}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      on ? "bg-brand-primary text-white border-brand-primary" : "border-brand-border text-brand-graphite hover:border-brand-primary"}`}>
                    {monthLabel(m.mes)} · {m.conversion_pct}%
                  </button>
                );
              })}
            </div>
            {(meta.meses_disponibles || []).length > 1 && (
              <div className="mb-4 overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead><tr className="text-brand-slate uppercase tracking-wider2 text-[9px]">
                    <th className="text-left py-1">Mes</th><th className="text-right">Conv.%</th>
                    <th className="text-right">Cont.%</th><th className="text-right">Ticket</th>
                    <th className="text-right">Llam/as/día</th><th className="text-right">Agentes</th>
                  </tr></thead>
                  <tbody>
                    {meta.meses_disponibles.map((m: any) => (
                      <tr key={m.mes} className={`border-t border-brand-border ${mesesSel.includes(m.mes) ? "" : "opacity-40"}`}>
                        <td className="py-1 font-medium text-brand-ink">{monthLabel(m.mes)}</td>
                        <td className="text-right font-mono">{m.conversion_pct}%</td>
                        <td className="text-right font-mono">{m.contactabilidad_pct}%</td>
                        <td className="text-right">{formatGs(m.ticket_promedio)}</td>
                        <td className="text-right">{m.llamadas_asesor_dia}</td>
                        <td className="text-right">{m.agentes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="space-y-3">
              {PARAM_DEFS.map((d) => (
                <div key={d.key} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-brand-ink">{d.label}</div>
                    <div className="text-[10px] text-brand-slate">{d.hint}</div>
                  </div>
                  <input type="number" step={d.step} value={params[d.key]} onChange={(e) => setP(d.key, e.target.value)}
                    className="input max-w-[130px] !py-1.5 text-sm text-right" />
                </div>
              ))}
            </div>
          </section>

          {/* Simulación */}
          <div className="lg:col-span-3 space-y-6">
            <section className="card p-5">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="flex rounded-md border border-brand-border overflow-hidden">
                  <button onClick={() => setModo("meta")} className={`px-4 py-2 text-sm font-semibold ${modo === "meta" ? "bg-brand-primary text-white" : "text-brand-graphite hover:bg-brand-bg"}`}>Por meta de prima</button>
                  <button onClick={() => setModo("dotacion")} className={`px-4 py-2 text-sm font-semibold ${modo === "dotacion" ? "bg-brand-primary text-white" : "text-brand-graphite hover:bg-brand-bg"}`}>Por dotación</button>
                </div>
                {modo === "meta" ? (
                  <label className="flex items-center gap-2 text-sm">
                    Meta de prima <b>neta</b> (Gs)
                    <input type="number" step={10000000} value={metaPrima} onChange={(e) => setMetaPrima(e.target.value)} className="input max-w-[180px] !py-1.5 text-right" />
                  </label>
                ) : (
                  <label className="flex items-center gap-2 text-sm">
                    Asesores disponibles
                    <input type="number" step={1} value={asesores} onChange={(e) => setAsesores(e.target.value)} className="input max-w-[100px] !py-1.5 text-right" />
                  </label>
                )}
              </div>

              {r && r.modo === "meta" && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                    <Res label="Asesores necesarios" value={`${Math.ceil(r.asesores)}`} hint={`${r.asesores.toFixed(1)} exacto`} big accent="#E6332A" />
                    <Res label="Registros de base" value={formatInt(r.registros)} hint="a marcar en el mes" big accent="#0EA5E9" />
                    <Res label="Prima a emitir" value={formatGs(r.emitir)} hint="cubre la anulación" big accent="#F39200" />
                  </div>
                  <Cadena pasos={[
                    { label: "Prima neta objetivo", valor: formatGs(Number(metaPrima)) },
                    { label: "Prima a emitir", valor: formatGs(r.emitir) },
                    { label: "Pólizas", valor: formatInt(r.polizas) },
                    { label: "Contactos", valor: formatInt(r.contactos) },
                    { label: "Llamadas", valor: formatInt(r.llamadas) },
                    { label: "Asesores", valor: `${Math.ceil(r.asesores)}` },
                    { label: "Registros de base", valor: formatInt(r.registros) },
                  ]} />
                  <p className="text-[11px] text-brand-slate mt-3">
                    Capacidad por asesor: {formatInt(r.capMes)} llamadas/mes ({params.llamadas_asesor_dia}/día × {params.dias_habiles} días).
                    {rangoAsesores && (
                      <> · <b className="text-brand-ink">Rango estadístico: {rangoAsesores.min}–{rangoAsesores.max} asesores</b> (IC 95% de la conversión diaria).</>
                    )}
                  </p>
                </>
              )}

              {r && r.modo === "dotacion" && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                    <Res label="Prima neta proyectada" value={formatGs(r.neta)} hint={`emitida ${formatGs(r.emitida)}`} big accent="#10B981" />
                    <Res label="Pólizas proyectadas" value={`${r.polizas}`} big accent="#F39200" />
                    <Res label="Registros de base" value={formatInt(r.registros)} hint="necesarios en el mes" big accent="#0EA5E9" />
                  </div>
                  <Cadena pasos={[
                    { label: "Asesores", valor: asesores },
                    { label: "Llamadas", valor: formatInt(r.llamadas) },
                    { label: "Contactos", valor: formatInt(r.contactos) },
                    { label: "Pólizas", valor: `${r.polizas}` },
                    { label: "Prima emitida", valor: formatGs(r.emitida) },
                    { label: "Prima neta", valor: formatGs(r.neta) },
                  ]} />
                </>
              )}
            </section>

            {recomendaciones.length > 0 && (
              <InsightsPanel insights={recomendaciones} titulo="Recomendaciones (se actualizan con cada cambio)" />
            )}

            {escenarios.length > 0 && (
              <section className="card p-5">
                <h2 className="font-display text-lg text-brand-ink uppercase mb-1">Escenarios de conversión</h2>
                <p className="text-xs text-brand-slate mb-3">Sensibilidad ±15% sobre la conversión base.</p>
                <table className="w-full text-sm">
                  <thead className="bg-brand-bg">
                    <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                      <th className="px-3 py-2 text-left">Escenario</th>
                      <th className="px-3 py-2 text-right">Conversión</th>
                      <th className="px-3 py-2 text-right">Asesores</th>
                      <th className="px-3 py-2 text-right">Llamadas</th>
                      <th className="px-3 py-2 text-right">Registros base</th>
                    </tr>
                  </thead>
                  <tbody>
                    {escenarios.map((e) => (
                      <tr key={e.nombre} className={`border-t border-brand-border ${e.nombre === "Base" ? "bg-brand-bg-soft font-semibold" : ""}`}>
                        <td className="px-3 py-2 text-brand-ink">{e.nombre}</td>
                        <td className="px-3 py-2 text-right font-mono">{e.conv.toFixed(2)}%</td>
                        <td className="px-3 py-2 text-right">{e.asesores}</td>
                        <td className="px-3 py-2 text-right">{formatInt(e.llamadas)}</td>
                        <td className="px-3 py-2 text-right">{formatInt(e.registros)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <div className="grid xl:grid-cols-2 gap-6">
              {curvaDotacion.length > 0 && (
                <section className="card p-5">
                  <h2 className="font-display text-lg text-brand-ink uppercase mb-1">Dotación según meta</h2>
                  <p className="text-xs text-brand-slate mb-3">Asesores necesarios para distintos niveles de meta{conv ? " (banda = IC 95% de la conversión diaria)" : ""}.</p>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={curvaDotacion} margin={{ top: 8, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="meta" fontSize={11} />
                      <YAxis fontSize={11} allowDecimals={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {conv && <Line dataKey="conservador" name="Conservador (IC inf.)" stroke="#E6332A" strokeDasharray="4 3" dot={false} />}
                      <Line dataKey="base" name="Base" stroke="#0F1116" strokeWidth={2.5} dot={{ r: 3 }} />
                      {conv && <Line dataKey="optimista" name="Optimista (IC sup.)" stroke="#10B981" strokeDasharray="4 3" dot={false} />}
                    </LineChart>
                  </ResponsiveContainer>
                </section>
              )}

              {reg?.puntos?.length >= 5 && (
                <section className="card p-5">
                  <h2 className="font-display text-lg text-brand-ink uppercase mb-1">Validación estadística</h2>
                  <p className="text-xs text-brand-slate mb-2">
                    Regresión lineal (mínimos cuadrados, por el origen) sobre los <b>{reg.n_dias} días reales</b> de los meses elegidos:
                    contestadas/día → pólizas/día.
                  </p>
                  {conv && (
                    <div className="flex flex-wrap gap-2 mb-3 text-[11px]">
                      <span className="px-2 py-1 rounded bg-brand-bg font-mono">β = {conv.pct}%</span>
                      <span className="px-2 py-1 rounded bg-brand-bg font-mono">IC 95%: {conv.ic95_pct[0]}–{conv.ic95_pct[1]}%</span>
                      <span className="px-2 py-1 rounded bg-brand-bg font-mono">R² = {conv.r2}</span>
                      <span className="px-2 py-1 rounded bg-brand-bg font-mono">pooled: {params.conversion_pct}%</span>
                    </div>
                  )}
                  <ResponsiveContainer width="100%" height={220}>
                    <ScatterChart margin={{ top: 8, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" dataKey="contestadas" name="Contestadas/día" fontSize={11} domain={[0, "dataMax"]} />
                      <YAxis type="number" dataKey="polizas" name="Pólizas/día" fontSize={11} allowDecimals={false} />
                      <ZAxis range={[28, 28]} />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                      <Scatter name="Días" data={reg.puntos} fill="#0EA5E9" fillOpacity={0.6} />
                      {fitData.length > 0 && (
                        <Scatter name="Ajuste" data={fitData} fill="#E6332A" line={{ stroke: "#E6332A", strokeWidth: 2 }} shape={() => <g />} legendType="line" />
                      )}
                    </ScatterChart>
                  </ResponsiveContainer>
                </section>
              )}
            </div>

            <p className="text-[11px] text-brand-slate">
              Modelo: estimador de razón (pooled) sobre los meses elegidos + regresión OLS por el origen sobre los días reales
              para validar la relación e informar el intervalo de confianza. No contempla curva de aprendizaje de asesores
              nuevos, estacionalidad ni calidad diferencial de bases — usalo como rango gerencial, no como punto exacto.
            </p>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Res({ label, value, hint, big, accent }: { label: string; value: string; hint?: string; big?: boolean; accent: string }) {
  return (
    <div className="card p-4 relative overflow-hidden">
      <div className="absolute top-0 bottom-0 left-0 w-1" style={{ background: accent }} />
      <div className="text-[11px] uppercase tracking-wider2 text-brand-slate">{label}</div>
      <div className={`font-display text-brand-ink ${big ? "text-2xl" : "text-lg"}`}>{value}</div>
      {hint && <div className="text-[11px] text-brand-slate mt-0.5">{hint}</div>}
    </div>
  );
}

function Cadena({ pasos }: { pasos: Array<{ label: string; valor: string }> }) {
  return (
    <div className="flex flex-wrap items-stretch gap-1.5">
      {pasos.map((p, i) => (
        <div key={p.label} className="flex items-center gap-1.5">
          <div className="rounded-md border border-brand-border px-3 py-1.5 bg-brand-bg-soft">
            <div className="text-[10px] uppercase tracking-wider2 text-brand-slate">{p.label}</div>
            <div className="text-sm font-semibold text-brand-ink">{p.valor}</div>
          </div>
          {i < pasos.length - 1 && <span className="text-brand-mist">→</span>}
        </div>
      ))}
    </div>
  );
}
