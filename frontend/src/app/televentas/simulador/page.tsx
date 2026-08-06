"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { PrintButton, PrintCover } from "@/components/PrintButton";
import { InsightsPanel } from "@/components/televentas/InsightsPanel";
import { Lectura } from "@/components/televentas/Lectura";
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

  // La variabilidad histórica (IC 95% de la regresión diaria) se aplica RELATIVA a la
  // conversión vigente del modelo — así el rango siempre envuelve al escenario base,
  // incluso si el usuario ajustó la conversión a mano.
  const convBounds = useMemo(() => {
    if (!params || !conv?.ic95_pct || !conv.pct) return null;
    const piso = Math.max(params.conversion_pct * (conv.ic95_pct[0] / conv.pct), 0.01);
    const techo = Math.max(params.conversion_pct * (conv.ic95_pct[1] / conv.pct), 0.01);
    return { piso: Math.round(piso * 100) / 100, techo: Math.round(techo * 100) / 100 };
  }, [params, conv]);

  // Plan prudente: asesores necesarios si la conversión rinde en su piso histórico.
  const rangoAsesores = useMemo(() => {
    if (!params || modo !== "meta" || !(Number(metaPrima) > 0) || !convBounds) return null;
    const conTecho: any = simular({ ...params, conversion_pct: convBounds.techo }, Number(metaPrima), null);
    const conPiso: any = simular({ ...params, conversion_pct: convBounds.piso }, Number(metaPrima), null);
    return { min: Math.ceil(conTecho.asesores), max: Math.ceil(conPiso.asesores) };
  }, [params, modo, metaPrima, convBounds]);

  // Curva: asesores necesarios según nivel de meta (con banda IC si hay regresión).
  const curvaDotacion = useMemo(() => {
    if (!params || !(Number(metaPrima) > 0)) return [];
    const base = Number(metaPrima);
    const pts: any[] = [];
    for (let f = 0.4; f <= 1.61; f += 0.2) {
      const m = base * f;
      const row: any = { meta: `${Math.round(m / 1e6)}M`, base: Math.ceil((simular(params, m, null) as any).asesores) };
      if (convBounds) {
        row.techo = Math.ceil((simular({ ...params, conversion_pct: convBounds.techo }, m, null) as any).asesores);
        row.prudente = Math.ceil((simular({ ...params, conversion_pct: convBounds.piso }, m, null) as any).asesores);
      }
      pts.push(row);
    }
    return pts;
  }, [params, metaPrima, convBounds]);

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
        titulo: `La conversión cargada (${params.conversion_pct}%) es muy distinta de la observada`,
        detalle: `En los ${conv.n} días reales analizados, la conversión se movió entre ${lo}% y ${hi}%. Si se usa un valor fuera de ese rango, la proyección es una hipótesis, no una expectativa respaldada por datos.` });
      if (conv.r2 < 0.4) out.push({ tipo: "estadistica", severidad: "warning",
        titulo: `Relación llamadas-ventas poco consistente (R² ${conv.r2})`,
        detalle: "Las ventas diarias no siguen de cerca a las llamadas (desfase de emisión, calidad de base variable). Recomendación: decidir con el plan prudente, no con el escenario probable." });
    } else if (reg) {
      out.push({ tipo: "estadistica", severidad: "info",
        titulo: "Aún sin regresión diaria",
        detalle: reg.mensaje || "Se necesitan al menos 5 días con datos de llamadas y producción en los meses elegidos." });
    }
    return out;
  }, [params, r, reg, conv, dotActual, modo, metaPrima, asesores]);

  const maxX = Math.max(...(reg?.puntos ?? []).map((p: any) => p.contestadas), 0);
  const fitData = conv ? [{ contestadas: 0, polizas: 0 }, { contestadas: maxX, polizas: (maxX * conv.pct) / 100 }] : [];

  // Ritmo IDEAL: llamadas promedio por asesor/día necesarias para que la meta se
  // cumpla con la conversión OBSERVADA en los días reales (misma regresión del
  // gráfico de validación). Se calcula sobre la dotación del último mes completo.
  const idealRitmo = useMemo(() => {
    if (!params || !r || r.modo !== "meta" || !conv?.pct) return null;
    const contact = Math.max(params.contactabilidad_pct, 0.01) / 100;
    const dias = Math.max(params.dias_habiles, 1);
    const dot = dotActual ?? Math.ceil(r.asesores);
    if (!dot) return null;
    const llamadas = (r.polizas / (conv.pct / 100)) / contact;
    const llamadasPiso = (r.polizas / (Math.max(conv.ic95_pct[0], 0.01) / 100)) / contact;
    return {
      dot,
      ideal: Math.ceil(llamadas / (dot * dias)),
      prudente: Math.ceil(llamadasPiso / (dot * dias)),
    };
  }, [params, r, conv, dotActual]);

  // TMO diario (si los reportes lo traen): promedio general y TMO de los días
  // con mejor conversión — la referencia de "tiempo medio ideal".
  const tmoPuntos = useMemo(() => (reg?.puntos ?? []).filter((p: any) => (p.tmo_seg ?? 0) > 0), [reg]);
  const tmoStats = useMemo(() => {
    if (tmoPuntos.length < 5) return null;
    const prom = tmoPuntos.reduce((s: number, p: any) => s + p.tmo_seg, 0) / tmoPuntos.length;
    const conVentas = tmoPuntos.filter((p: any) => p.contestadas > 0);
    if (conVentas.length < 4) return { prom: Math.round(prom), mejores: null };
    const ordenados = [...conVentas].sort((a: any, b: any) => b.polizas / b.contestadas - a.polizas / a.contestadas);
    const top = ordenados.slice(0, Math.max(Math.floor(ordenados.length / 2), 1));
    const mejores = top.reduce((s: number, p: any) => s + p.tmo_seg, 0) / top.length;
    return { prom: Math.round(prom), mejores: Math.round(mejores) };
  }, [tmoPuntos]);

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

  // Conclusión ejecutiva: la decisión ideal en lenguaje claro y concreto.
  const conclusion = useMemo(() => {
    if (!params || !r) return null;
    if (r.modo === "meta") {
      const need = Math.ceil(r.asesores);
      const prudente = rangoAsesores?.max ?? null;
      const partes: string[] = [];
      partes.push(`Para vender ${formatGs(Number(metaPrima))} netos al mes se necesitan ${need} asesores y una base de ${formatInt(r.registros)} registros frescos.`);
      if (dotActual != null) {
        if (dotActual >= need) {
          partes.push(`La dotación actual (${dotActual} asesores) alcanza: la meta es lograble sin contrataciones.`);
        } else {
          const proy: any = simular(params, null, dotActual);
          partes.push(`Con la dotación actual (${dotActual}) se llegaría a ${formatGs(proy.neta)}: faltan ${formatGs(Number(metaPrima) - proy.neta)} para la meta.`);
        }
      }
      if (prudente != null && prudente > need) {
        partes.push(`Decisión recomendada: planificar con ${prudente} asesores. Ese es el plan prudente — cubre la meta aun si la conversión rinde en su piso histórico (${convBounds!.piso}% en vez de ${params.conversion_pct}%). Con ${need} la meta se logra solo si el mes rinde como el promedio.`);
      } else {
        partes.push(`Decisión recomendada: si la meta es un compromiso firme, usar el escenario conservador de la tabla de escenarios; ${need} asesores alcanzan si el mes rinde como el promedio.`);
      }
      return partes.join(" ");
    }
    const piso = convBounds ? (simular({ ...params, conversion_pct: convBounds.piso }, null, Number(asesores)) as any).neta : null;
    return `Con ${asesores} asesores la venta esperada es ${formatGs(r.neta)} netos al mes, usando ${formatInt(r.registros)} registros de base.` +
      (piso != null
        ? ` En un mes flojo (conversión en su piso histórico) serían ${formatGs(piso)}. Decisión recomendada: comprometer ${formatGs(piso)} como meta y tratar el resto como potencial adicional.`
        : " Decisión recomendada: comprometer una meta por debajo de la proyección para conservar margen.");
  }, [params, r, rangoAsesores, convBounds, dotActual, metaPrima, asesores]);

  return (
    <AppShell>
      <div className="mb-2 text-xs text-brand-slate">
        <Link href="/televentas" className="hover:text-brand-primary">Televentas</Link>
        <span className="mx-2">/</span><span className="text-brand-ink font-semibold">Simulador</span>
      </div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-brand-ink uppercase">Simulador de Ventas</h1>
          <p className="text-sm text-brand-slate mt-1 max-w-3xl">
            Proyectá el call center: cuántos asesores y cuántos registros de base hacen falta para una meta de prima
            — o cuánto puede vender una dotación. Parámetros sembrados con las <b>tasas reales</b> de la operación.{" "}
            <Link href="/televentas/simulador/metodologia" className="text-brand-primary font-semibold hover:underline no-print">
              ¿Cómo funciona el modelo? →
            </Link>
          </p>
        </div>
        <PrintButton label="Imprimir / Guardar PDF" />
      </div>

      <PrintCover
        titulo={`Simulación de Ventas${modo === "meta" && Number(metaPrima) > 0 ? ` — Meta ${formatGs(Number(metaPrima))} netos` : modo === "dotacion" ? ` — ${asesores} asesores` : ""}`}
        periodo={meta?.meses_usados?.length ? `Modelo basado en ${meta.meses_usados.map((m: string) => monthLabel(m)).join(", ")}` : undefined}
      />

      {loading && <div className="text-brand-slate">Cargando tasas reales…</div>}

      {!loading && meta && !meta.disponible && (
        <div className="card p-8 text-center text-brand-slate">
          {meta.mensaje || "Se necesita al menos un mes publicado completo (llamadas + producción)."}
        </div>
      )}

      {!loading && params && (
        <div className="grid lg:grid-cols-5 gap-6 print:block">
          {/* Parámetros (interactivos — en el PDF van como 'Supuestos') */}
          <section className="card p-5 lg:col-span-2 h-fit no-print">
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
            {/* Supuestos del modelo — solo en el PDF */}
            <div className="print-only card p-4">
              <h3 className="text-sm font-semibold text-brand-ink mb-2">Supuestos del modelo (tasas reales de la operación)</h3>
              <p className="text-xs text-brand-graphite leading-relaxed">
                Meses base: <b>{mesesSel.map((m) => monthLabel(m)).join(", ")}</b> ·
                Ticket promedio: <b>{formatGs(params.ticket_promedio)}</b> ·
                Conversión: <b>{params.conversion_pct}%</b>{conv ? ` (IC 95%: ${conv.ic95_pct[0]}–${conv.ic95_pct[1]}%, R² ${conv.r2}, ${conv.n} días)` : ""} ·
                Contactabilidad: <b>{params.contactabilidad_pct}%</b> ·
                Ritmo: <b>{params.llamadas_asesor_dia} llamadas/asesor/día × {params.dias_habiles} días</b> ·
                Anulación: <b>{params.tasa_anulacion_pct}%</b> ·
                Intentos por registro: <b>{params.intentos_por_registro}</b>
              </p>
            </div>

            {/* Conclusión ejecutiva — siempre visible y en el PDF */}
            {conclusion && (
              <section className="card p-5 border-l-4 border-brand-ink bg-white">
                <h2 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-bold mb-2">Conclusión ejecutiva</h2>
                <p className="text-[15px] text-brand-ink leading-relaxed font-medium">{conclusion}</p>
              </section>
            )}

            <section className="card p-5">
              <div className="flex flex-wrap items-center gap-3 mb-4 no-print">
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
                    {rangoAsesores && convBounds && (
                      <> · <b className="text-brand-ink">Plan prudente: {rangoAsesores.max} asesores</b> — cubre la meta aun si la conversión rinde en su piso histórico ({convBounds.piso}%).</>
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
                  <p className="text-xs text-brand-slate mb-3">Cuántos asesores hacen falta para cada nivel de meta mensual.</p>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={curvaDotacion} margin={{ top: 8, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="meta" fontSize={11} />
                      <YAxis fontSize={11} allowDecimals={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {convBounds && <Line dataKey="prudente" name="Plan prudente (mes flojo)" stroke="#E6332A" strokeDasharray="4 3" dot={false} />}
                      <Line dataKey="base" name="Escenario probable" stroke="#0F1116" strokeWidth={2.5} dot={{ r: 3 }} />
                      {convBounds && <Line dataKey="techo" name="Mejor caso (mes fuerte)" stroke="#10B981" strokeDasharray="4 3" dot={false} />}
                    </LineChart>
                  </ResponsiveContainer>
                  <Lectura>
                    Buscá la meta en el eje horizontal (en millones de Gs) y subí hasta la línea negra: esa altura es la cantidad
                    de asesores que se necesitan en el escenario más probable. La línea roja punteada indica cuántos harían falta
                    si el mes rinde flojo (conversión en su piso histórico) — es la referencia para planificar sin riesgo. La verde,
                    cuántos bastarían en un mes muy bueno.
                  </Lectura>
                </section>
              )}

              {reg?.puntos?.length >= 5 && (
                <section className="card p-5">
                  <h2 className="font-display text-lg text-brand-ink uppercase mb-1">Validación con datos reales</h2>
                  <p className="text-xs text-brand-slate mb-2">
                    Relación entre llamadas atendidas y pólizas, día por día ({reg.n_dias} días reales de los meses elegidos).
                  </p>
                  {conv && (
                    <div className="flex flex-wrap gap-2 mb-3 text-[11px]">
                      <span className="px-2 py-1 rounded bg-brand-bg">Conversión observada: <b>{conv.pct}%</b></span>
                      <span className="px-2 py-1 rounded bg-brand-bg">Varía entre <b>{conv.ic95_pct[0]}%</b> y <b>{conv.ic95_pct[1]}%</b> (95% de los casos)</span>
                      <span className="px-2 py-1 rounded bg-brand-bg">Consistencia (R²): <b>{conv.r2}</b></span>
                      {idealRitmo && (
                        <span className="px-2 py-1 rounded bg-brand-primary text-white font-semibold">
                          Ideal para la meta: <b>{idealRitmo.ideal}</b> llamadas/asesor/día (con {idealRitmo.dot} asesores)
                        </span>
                      )}
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
                        <Scatter name="Tendencia" data={fitData} fill="#E6332A" line={{ stroke: "#E6332A", strokeWidth: 2 }} shape={() => <g />} legendType="line" />
                      )}
                    </ScatterChart>
                  </ResponsiveContainer>
                  <Lectura>
                    Cada punto azul es un día real de operación: a la derecha, más llamadas atendidas ese día; más arriba, más
                    pólizas vendidas. La línea roja es la tendencia promedio. Cuanto más pegados están los puntos a la línea,
                    más confiable es proyectar ventas a partir de llamadas; si están muy dispersos, conviene decidir con el
                    plan prudente y no con el escenario probable.
                    {idealRitmo && (
                      <> El recuadro rojo indica el ritmo de marcación ideal por asesor para alcanzar la meta con la
                      conversión observada en estos datos.</>
                    )}
                  </Lectura>
                </section>
              )}

              {reg?.puntos?.length >= 5 && (
                <section className="card p-5">
                  <h2 className="font-display text-lg text-brand-ink uppercase mb-1">Llamadas por asesor por día</h2>
                  <p className="text-xs text-brand-slate mb-2">
                    Ritmo real de marcación de cada día frente al ideal necesario para la meta.
                  </p>
                  {idealRitmo && (
                    <div className="flex flex-wrap gap-2 mb-3 text-[11px]">
                      <span className="px-2 py-1 rounded bg-brand-primary text-white font-semibold">
                        Ideal: <b>{idealRitmo.ideal}</b> llamadas/asesor/día
                      </span>
                      <span className="px-2 py-1 rounded bg-brand-orange/10 text-brand-orange font-semibold">
                        En un mes flojo: {idealRitmo.prudente} llamadas/asesor/día
                      </span>
                      <span className="px-2 py-1 rounded bg-brand-bg">Ritmo actual: <b>{params.llamadas_asesor_dia}</b></span>
                    </div>
                  )}
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={reg.puntos} margin={{ top: 8, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="fecha" fontSize={10} tickFormatter={(f: string) => f.slice(5)} minTickGap={24} />
                      <YAxis fontSize={11} allowDecimals={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="promedio_por_asesor" name="Llamadas/asesor (real)" fill="#0EA5E9" fillOpacity={0.7} />
                      {idealRitmo && (
                        <ReferenceLine y={idealRitmo.ideal} stroke="#E6332A" strokeWidth={2} strokeDasharray="6 3"
                          label={{ value: `Ideal: ${idealRitmo.ideal}`, position: "insideTopRight", fill: "#E6332A", fontSize: 11, fontWeight: 700 }} />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                  <Lectura>
                    Cada barra es el promedio real de llamadas que hizo cada asesor ese día.
                    {idealRitmo ? (
                      <> La línea roja punteada es el ritmo ideal: si cada asesor promedia ese número de llamadas por día,
                      la meta se alcanza con la conversión observada en los datos reales. Días consistentemente por debajo
                      de la línea significan que la meta exigirá más asesores, mejores bases o más conversión. La referencia
                      naranja del encabezado indica el ritmo que cubriría la meta incluso en un mes flojo.</>
                    ) : (
                      <> Sirve para ver la consistencia del ritmo de marcación del equipo día a día. Para ver el ritmo ideal
                      frente a una meta, usá el modo &quot;Por meta de prima&quot;.</>
                    )}
                  </Lectura>
                </section>
              )}

              {tmoPuntos.length >= 5 && (
                <section className="card p-5">
                  <h2 className="font-display text-lg text-brand-ink uppercase mb-1">Tiempo medio de llamada por día</h2>
                  <p className="text-xs text-brand-slate mb-2">
                    TMO diario de las llamadas atendidas (≥34s), con la referencia de los días que mejor convirtieron.
                  </p>
                  {tmoStats && (
                    <div className="flex flex-wrap gap-2 mb-3 text-[11px]">
                      <span className="px-2 py-1 rounded bg-brand-bg">TMO promedio: <b>{mmss(tmoStats.prom)} min</b></span>
                      {tmoStats.mejores != null && (
                        <span className="px-2 py-1 rounded bg-emerald-600 text-white font-semibold">
                          TMO de los días con mejor conversión: <b>{mmss(tmoStats.mejores)} min</b>
                        </span>
                      )}
                    </div>
                  )}
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={tmoPuntos} margin={{ top: 8, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="fecha" fontSize={10} tickFormatter={(f: string) => f.slice(5)} minTickGap={24} />
                      <YAxis fontSize={11} tickFormatter={(s: number) => mmss(s)} />
                      <Tooltip formatter={(v: any) => [`${mmss(Number(v))} min`, "TMO del día"]} />
                      <Line dataKey="tmo_seg" name="TMO del día" stroke="#0F1116" strokeWidth={2} dot={{ r: 2.5 }} />
                      {tmoStats?.mejores != null && (
                        <ReferenceLine y={tmoStats.mejores} stroke="#10B981" strokeWidth={2} strokeDasharray="6 3"
                          label={{ value: `Mejores días: ${mmss(tmoStats.mejores)}`, position: "insideTopRight", fill: "#10B981", fontSize: 11, fontWeight: 700 }} />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                  <Lectura>
                    La línea negra muestra cuánto duró en promedio una llamada atendida cada día. La línea verde es la
                    referencia ideal: el tiempo medio de los días que mejor convirtieron llamadas en pólizas. Si el TMO diario
                    se aleja mucho de esa referencia — conversaciones demasiado cortas (poco argumentario) o demasiado largas
                    (sin cierre) — conviene revisar el guion y el manejo de objeciones en esos días.
                  </Lectura>
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
