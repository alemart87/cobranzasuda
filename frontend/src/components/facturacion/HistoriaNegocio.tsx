"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatGs, formatInt } from "@/lib/format";
import { describirVariaciones } from "./MesAfectado";

/** Historia del negocio: línea de tiempo animada del escenario anual. Al dar play el
 *  gráfico se va construyendo mes a mes y aparecen los hitos (con alertas) que explican
 *  qué pasa en cada momento: primeras caídas, cuota 2, recálculo de bonos, meses en
 *  pérdida, meses afectados, cierre con la cola. Velocidad ajustable. */

type Severidad = "info" | "ok" | "warning" | "alert";
type Hito = { paso: number; titulo: string; detalle: string; severidad: Severidad; valor?: number };

const SEV: Record<Severidad, { cls: string; punto: string; icono: string; label: string }> = {
  info: { cls: "border-sky-300 bg-sky-50 text-sky-900", punto: "#0EA5E9", icono: "●", label: "Hito" },
  ok: { cls: "border-emerald-300 bg-emerald-50 text-emerald-900", punto: "#10B981", icono: "✔", label: "Bien" },
  warning: { cls: "border-amber-300 bg-amber-50 text-amber-900", punto: "#F59E0B", icono: "▲", label: "Atención" },
  alert: { cls: "border-brand-primary/40 bg-brand-primary/5 text-brand-primary", punto: "#E6332A", icono: "⚠", label: "Alerta" },
};

const M = (v: number) => `${Math.round(v / 1e6)}M`;
const VELOCIDADES = [0.5, 1, 2, 4];

/** Construye los hitos de la historia a partir del resultado anual. */
function armarHitos(res: any, p: any, nombre: (i: number) => string): Hito[] {
  const meses: any[] = res.meses ?? [];
  const a = res.anual;
  const h = meses.length;
  const hc = res.headcount ?? {};
  const out: Hito[] = [];
  const bonosActivos = p?.bonos_activos !== false;
  const chb = Number(p?.chargeback_meses ?? 6);
  let primeraCaida = false, primeraCuota2 = false, primerRecalculo = false, primerResidual = false;
  let enPerdida = false;

  for (let t = 0; t < h; t++) {
    const m = meses[t];
    const prev = meses[t - 1];
    if (t === 0) {
      out.push({ paso: 0, severidad: "info", titulo: "Arranca la operación",
        detalle: `${hc.vendedores} vendedores, ${hc.supervisores} supervisores, ${hc.backoffice} backoffice; costo fijo ${formatGs(a.costos_fijos_mes)}/mes y objetivo CO ${formatInt(Number(p?.objetivo_co ?? 0))}. ${nombre(0)} factura ${formatGs(m.facturacion_bruta)} y todavía no devuelve nada.` });
    }
    if (m.afectado) {
      out.push({ paso: t, severidad: "info", titulo: `${nombre(t)} se comporta distinto`,
        detalle: describirVariaciones(m.variaciones ?? {}, p).join(" · ") || "variaciones propias del mes." });
    }
    if (m.bono_adicional > 0) {
      out.push({ paso: t, severidad: "ok", titulo: "Bono adicional cargado a mano", detalle: `${formatGs(m.bono_adicional)} entran a la facturación de ${nombre(t)}; no se devuelven.`, valor: m.bono_adicional });
    }
    if (bonosActivos && m.monto_bono_productividad === 0) {
      out.push({ paso: t, severidad: "alert", titulo: "Sin bono productividad",
        detalle: `${nombre(t)} llega al ${m.cumplimiento_pct}% del objetivo: por debajo del 90% el bono productividad no se liquida (${formatGs(m.bono_productividad)}).` });
    } else if (bonosActivos && m.escalon_productividad >= 110) {
      out.push({ paso: t, severidad: "ok", titulo: "Escalón máximo del bono", detalle: `${nombre(t)} cumple el ${m.cumplimiento_pct}% del objetivo: bono productividad de ${formatGs(m.monto_bono_productividad)} por línea.` });
    }
    if (!primeraCaida && m.clawbacks < 0) {
      primeraCaida = true;
      out.push({ paso: t, severidad: "warning", titulo: "Llegan las primeras caídas",
        detalle: `Las líneas de ${nombre(0)} que se cortan en el chargeback empiezan a devolverse: ${formatGs(Math.abs(m.clawbacks))} en ${nombre(t)}. Desde acá cada mes descuenta las caídas de los anteriores.`, valor: m.clawbacks });
    }
    if (!primerResidual && m.residual > 0) {
      primerResidual = true;
      out.push({ paso: t, severidad: "ok", titulo: "Empieza a cobrarse el residual", detalle: `${formatGs(m.residual)} de residual sobre las líneas activas de ${nombre(0)}; se cobra ${p?.residual_meses ?? 12} liquidaciones por cohorte.` });
    }
    if (!primeraCuota2 && m.cuota2 > 0) {
      primeraCuota2 = true;
      out.push({ paso: t, severidad: "ok", titulo: "Primera cuota 2", detalle: `Las líneas de ${nombre(0)} activas al día 90 con legajo completo cobran la cuota 2: ${formatGs(m.cuota2)}.`, valor: m.cuota2 });
    }
    if (!primerRecalculo && m.recalculo_productividad < 0) {
      primerRecalculo = true;
      out.push({ paso: t, severidad: "warning", titulo: "Recálculo del bono productividad",
        detalle: `Claro descuenta el bono de las líneas de ${nombre(0)} que no llegaron activas al día 180: ${formatGs(Math.abs(m.recalculo_productividad))}.`, valor: m.recalculo_productividad });
    }
    if (t === chb) {
      out.push({ paso: t, severidad: "info", titulo: `${nombre(0)} sale del chargeback`, detalle: `Pasaron ${chb} meses: la primera cohorte ya no devuelve caídas; de acá en más solo suma residual.` });
    }
    if (m.resultado < 0 && !enPerdida) {
      enPerdida = true;
      out.push({ paso: t, severidad: "alert", titulo: "Mes en pérdida", detalle: `${nombre(t)} liquida ${formatGs(m.ingreso_neto)} contra ${formatGs(m.costo_total)} de costos: ${formatGs(m.resultado)}.`, valor: m.resultado });
    } else if (m.resultado >= 0 && enPerdida) {
      enPerdida = false;
      out.push({ paso: t, severidad: "ok", titulo: "Vuelve a ganar", detalle: `${nombre(t)} cierra con ${formatGs(m.resultado)} (${m.margen_pct}% sobre ingreso neto).`, valor: m.resultado });
    }
    if (prev && Math.sign(prev.acumulado) !== Math.sign(m.acumulado) && m.acumulado !== 0 && prev.acumulado !== 0) {
      out.push({ paso: t, severidad: m.acumulado > 0 ? "ok" : "alert", titulo: m.acumulado > 0 ? "El acumulado cruza a positivo" : "El acumulado cae a negativo",
        detalle: `Acumulado del período en ${nombre(t)}: ${formatGs(m.acumulado)}.`, valor: m.acumulado });
    }
    if (a.peor_mes === m.mes && h > 1) out.push({ paso: t, severidad: "warning", titulo: "El peor mes del período", detalle: `${nombre(t)}: resultado ${formatGs(m.resultado)}.` });
    if (a.mejor_mes === m.mes && h > 1 && t !== 0) out.push({ paso: t, severidad: "ok", titulo: "El mejor mes del período", detalle: `${nombre(t)}: resultado ${formatGs(m.resultado)}.` });
    if (t === 12) out.push({ paso: t, severidad: "info", titulo: `${nombre(0)} completa su residual`, detalle: "La primera cohorte cobró las 12 liquidaciones: a partir de acá se mantiene en su nivel final de zafra." });
  }
  // Cierre con la cola
  const cola = a.cola_post_12 ?? {};
  const v = a.veredicto ?? {};
  out.push({ paso: h, severidad: "info", titulo: `Fin de los ${h} meses`,
    detalle: `Resultado del período ${formatGs(a.resultado)} (${a.margen_pct}%). Las últimas cohortes todavía tienen ${formatGs(cola.cobros ?? 0)} por cobrar (hasta el mes ${cola.ultimo_mes_residual}) y ${formatGs(Math.abs(cola.devoluciones ?? 0))} por devolver (hasta el mes ${cola.ultimo_mes_caidas}).` });
  out.push({ paso: h, severidad: v.gana ? "ok" : "alert", titulo: v.gana ? `Cierre: ganamos ${formatGs(v.resultado_final)}` : `Cierre: perdemos ${formatGs(Math.abs(v.resultado_final ?? 0))}`,
    detalle: v.la_cola_lo_da_vuelta ? "La cola pendiente da vuelta el signo del período." : "Con todas las caídas y todo el residual cobrado, este es el número final.", valor: v.resultado_final });
  return out;
}

export function HistoriaNegocio({ res, p, nombre }: { res: any; p: any; nombre: (i: number) => string }) {
  const meses: any[] = res?.meses ?? [];
  const h = meses.length;
  const a = res?.anual;
  const [paso, setPaso] = useState(-1);          // -1 = sin generar; 0..h-1 = mes; h = cierre
  const [play, setPlay] = useState(false);
  const [vel, setVel] = useState(1);
  const timer = useRef<any>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const hitos = useMemo(() => (res && a ? armarHitos(res, p, nombre) : []), [res, p, nombre, a]);

  // Reiniciar cuando cambia el escenario.
  useEffect(() => { setPaso(-1); setPlay(false); }, [res]);

  useEffect(() => {
    if (!play) { clearTimeout(timer.current); return; }
    if (paso >= h) { setPlay(false); return; }
    timer.current = setTimeout(() => setPaso((x) => Math.min(x + 1, h)), 1500 / vel);
    return () => clearTimeout(timer.current);
  }, [play, paso, vel, h]);

  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" }); }, [paso]);

  if (!res || !a || !h) return null;

  const iniciar = () => { setPaso(0); setPlay(true); };
  const visibles = hitos.filter((x) => x.paso <= paso);
  const actualesHitos = hitos.filter((x) => x.paso === paso);
  const data = meses.map((m, i) => ({
    mes: m.mes, nombre: nombre(i),
    ingreso_neto: i <= paso ? m.ingreso_neto : null,
    costo_total: i <= paso ? m.costo_total : null,
    resultado: i <= paso ? m.resultado : null,
    acumulado: i <= paso ? m.acumulado : null,
    lineas: i <= paso ? m.lineas_activas : null,
  }));
  const mesActual = paso >= 0 && paso < h ? meses[paso] : null;
  const cierre = paso >= h;
  const marcadores = hitos.filter((x) => x.paso < h && x.paso <= paso && x.severidad !== "info")
    .reduce<Record<number, Hito>>((acc, x) => { if (!acc[x.paso] || x.severidad === "alert") acc[x.paso] = x; return acc; }, {});

  return (
    <div>
      <style>{`@keyframes hn-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } } .hn-in { animation: hn-in .45s ease-out both; }`}</style>

      {/* ===== Controles ===== */}
      <div className="no-print flex flex-wrap items-center gap-3 mb-4">
        {paso < 0 ? (
          <button onClick={iniciar} className="btn-primary !px-6 !py-2.5 text-base shadow-lg">▶ Generar la historia</button>
        ) : (
          <>
            <button onClick={() => (paso >= h ? iniciar() : setPlay(!play))} className="btn-primary !px-5 !py-2 text-sm">
              {paso >= h ? "↻ Volver a ver" : play ? "❚❚ Pausa" : "▶ Play"}
            </button>
            <div className="inline-flex rounded-md border border-brand-border overflow-hidden">
              <button onClick={() => { setPlay(false); setPaso((x) => Math.max(0, x - 1)); }} className="px-2.5 py-1.5 text-xs font-bold text-brand-graphite hover:bg-brand-bg" title="Mes anterior">‹</button>
              <button onClick={() => { setPlay(false); setPaso((x) => Math.min(h, x + 1)); }} className="px-2.5 py-1.5 text-xs font-bold text-brand-graphite hover:bg-brand-bg border-l border-brand-border" title="Mes siguiente">›</button>
            </div>
            <button onClick={() => { setPlay(false); setPaso(-1); }} className="text-xs text-brand-slate hover:text-brand-ink">Reiniciar</button>
          </>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate">Velocidad</span>
          <div className="inline-flex rounded-md border border-brand-border overflow-hidden">
            {VELOCIDADES.map((v) => (
              <button key={v} onClick={() => setVel(v)} className={`px-2.5 py-1 text-xs font-bold ${vel === v ? "bg-brand-ink text-white" : "text-brand-graphite hover:bg-brand-bg"}`}>{v}×</button>
            ))}
          </div>
        </div>
      </div>

      {paso < 0 ? (
        <div className="rounded-md border-2 border-dashed border-brand-border p-8 text-center">
          <div className="font-display text-2xl text-brand-ink uppercase">La historia de estos {h} meses</div>
          <p className="text-sm text-brand-slate mt-2 max-w-2xl mx-auto">
            Al dar play el gráfico se construye mes a mes y van apareciendo los hitos: cuándo llegan las primeras caídas, cuándo se cobra la
            cuota 2, cuándo Claro recalcula los bonos, qué meses pierden, qué meses se comportan distinto y cómo cierra el negocio con
            todas las caídas. {hitos.length} hitos preparados.
          </p>
        </div>
      ) : (
        <>
          {/* ===== Barra de progreso / scrubber ===== */}
          <div className="no-print flex items-center gap-1 mb-3">
            {meses.map((m, i) => {
              const mk = marcadores[i];
              return (
                <button key={m.mes} onClick={() => { setPlay(false); setPaso(i); }} title={nombre(i)}
                  className={`relative flex-1 h-2.5 rounded-sm transition-colors ${i < paso ? "bg-brand-ink" : i === paso ? "bg-brand-primary" : "bg-brand-border"}`}>
                  {mk && i <= paso && <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full" style={{ background: SEV[mk.severidad].punto }} />}
                </button>
              );
            })}
            <button onClick={() => { setPlay(false); setPaso(h); }} title="Cierre" className={`w-6 h-2.5 rounded-sm ${paso >= h ? "bg-brand-primary" : "bg-brand-border"}`} />
          </div>

          <div className="grid lg:grid-cols-[1fr_360px] gap-4">
            {/* ===== Escena: mes actual + gráfico ===== */}
            <div>
              <div key={paso} className="hn-in rounded-md bg-brand-ink text-white px-5 py-3 mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider2 font-bold text-white/60">{cierre ? "Cierre" : `Paso ${paso + 1} de ${h}`}</div>
                  <div className="font-display text-2xl uppercase leading-tight">{cierre ? `Después del mes ${h}: la cola` : nombre(paso)}</div>
                </div>
                {mesActual ? (
                  <div className="flex flex-wrap gap-4 text-right">
                    <div><div className="text-[9px] uppercase tracking-wider2 text-white/60">Ventas</div><div className="font-mono text-sm font-bold">{formatInt(mesActual.ventas)}</div></div>
                    <div><div className="text-[9px] uppercase tracking-wider2 text-white/60">Ingreso neto</div><div className="font-mono text-sm font-bold">{formatGs(mesActual.ingreso_neto)}</div></div>
                    <div><div className="text-[9px] uppercase tracking-wider2 text-white/60">Costos</div><div className="font-mono text-sm font-bold">{formatGs(mesActual.costo_total)}</div></div>
                    <div><div className="text-[9px] uppercase tracking-wider2 text-white/60">Resultado</div><div className={`font-mono text-sm font-bold ${mesActual.resultado < 0 ? "text-brand-primary" : "text-emerald-300"}`}>{formatGs(mesActual.resultado)}</div></div>
                    <div><div className="text-[9px] uppercase tracking-wider2 text-white/60">Acumulado</div><div className={`font-mono text-sm font-bold ${mesActual.acumulado < 0 ? "text-brand-primary" : "text-emerald-300"}`}>{formatGs(mesActual.acumulado)}</div></div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-4 text-right">
                    <div><div className="text-[9px] uppercase tracking-wider2 text-white/60">Por cobrar</div><div className="font-mono text-sm font-bold text-emerald-300">{formatGs(a.cola_post_12?.cobros ?? 0)}</div></div>
                    <div><div className="text-[9px] uppercase tracking-wider2 text-white/60">Por devolver</div><div className="font-mono text-sm font-bold text-brand-primary">{formatGs(Math.abs(a.cola_post_12?.devoluciones ?? 0))}</div></div>
                    <div><div className="text-[9px] uppercase tracking-wider2 text-white/60">Resultado final</div><div className={`font-mono text-sm font-bold ${a.veredicto?.gana ? "text-emerald-300" : "text-brand-primary"}`}>{formatGs(a.veredicto?.resultado_final ?? 0)}</div></div>
                  </div>
                )}
              </div>

              {/* Variables en juego del mes */}
              {mesActual && (
                <div key={`v${paso}`} className="hn-in flex flex-wrap gap-1.5 mb-3">
                  {[
                    ["Objetivo CO", formatInt(Number(mesActual.variaciones?.objetivo_co ?? p?.objetivo_co ?? 0))],
                    ["Cumplimiento", `${mesActual.cumplimiento_pct}%`],
                    ["Bono prod.", mesActual.monto_bono_productividad ? `${formatGs(mesActual.monto_bono_productividad)}/línea` : "sin bono"],
                    ["Porta", `${mesActual.variaciones?.porta_pct ?? p?.porta_pct}%`],
                    ["Efectividad", `${mesActual.variaciones?.efectividad_pct ?? p?.efectividad_pct}%`],
                    ["Líneas activas", formatInt(mesActual.lineas_activas)],
                    ["Residual", formatGs(mesActual.residual)],
                    ["Cuota 2", formatGs(mesActual.cuota2)],
                    ["Caídas", formatGs(mesActual.clawbacks)],
                  ].map(([k, v]) => (
                    <span key={k} className="px-2 py-0.5 rounded-full border border-brand-border bg-white text-[11px] text-brand-graphite"><b className="text-brand-slate font-semibold">{k}</b> {v}</span>
                  ))}
                </div>
              )}

              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={data} margin={{ top: 16, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" fontSize={10} tickFormatter={(v: number) => { const n = nombre(v - 1); return n.length > 10 ? n.slice(0, 9) + "…" : n; }} />
                  <YAxis yAxisId="l" fontSize={10} tickFormatter={M} />
                  <YAxis yAxisId="r" orientation="right" fontSize={10} tickFormatter={M} />
                  <Tooltip formatter={(v: any, n: any) => (n === "Líneas activas" ? formatInt(Number(v)) : formatGs(Number(v)))} labelFormatter={(l) => nombre(Number(l) - 1)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine yAxisId="l" y={0} stroke="#0F1116" />
                  <Bar yAxisId="l" dataKey="ingreso_neto" name="Ingreso neto" fill="#0EA5E9" fillOpacity={0.55} isAnimationActive animationDuration={500} />
                  <Bar yAxisId="l" dataKey="costo_total" name="Costos" fill="#F39200" fillOpacity={0.55} isAnimationActive animationDuration={500} />
                  <Area yAxisId="l" dataKey="resultado" name="Resultado del mes" stroke="#662483" fill="#662483" fillOpacity={0.12} strokeWidth={1.5} connectNulls={false} isAnimationActive animationDuration={500} />
                  <Line yAxisId="r" dataKey="acumulado" name="Acumulado" stroke="#0F1116" strokeWidth={2.5} dot={{ r: 2.5 }} connectNulls={false} isAnimationActive animationDuration={500} />
                  {Object.entries(marcadores).map(([i, hx]) => (
                    <ReferenceDot key={i} yAxisId="r" x={Number(i) + 1} y={meses[Number(i)].acumulado} r={7} fill={SEV[hx.severidad].punto} stroke="#fff" strokeWidth={2}
                      label={{ value: SEV[hx.severidad].icono, position: "top", fontSize: 11, fill: SEV[hx.severidad].punto }} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* ===== Feed de hitos ===== */}
            <div className="rounded-md border border-brand-border bg-white flex flex-col max-h-[520px]">
              <div className="px-3 py-2 border-b border-brand-border flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate">Hitos y alertas</span>
                <span className="text-[11px] text-brand-slate">{visibles.length} de {hitos.length}</span>
              </div>
              <div ref={feedRef} className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {visibles.length === 0 && <p className="text-[12px] text-brand-slate p-2">Todavía no pasó nada: dale play.</p>}
                {visibles.map((x, i) => {
                  const s = SEV[x.severidad];
                  const nuevo = x.paso === paso;
                  return (
                    <div key={i} className={`${nuevo ? "hn-in" : ""} rounded-md border px-2.5 py-2 ${s.cls} ${nuevo ? "ring-2 ring-offset-1" : "opacity-80"}`} style={nuevo ? { ["--tw-ring-color" as any]: s.punto } : undefined}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-bold">{s.icono} {x.titulo}</span>
                        <span className="text-[10px] font-semibold opacity-70 whitespace-nowrap">{x.paso >= h ? "Cierre" : nombre(x.paso)}</span>
                      </div>
                      <p className="text-[11px] leading-snug mt-0.5 opacity-90">{x.detalle}</p>
                    </div>
                  );
                })}
              </div>
              {actualesHitos.length > 0 && (
                <div className="px-3 py-1.5 border-t border-brand-border text-[10px] text-brand-slate">
                  {actualesHitos.length} hito(s) en este paso{actualesHitos.some((x) => x.severidad === "alert") ? " · hay alertas" : ""}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Impresión: la historia completa como lista */}
      <div className="print-only mt-4">
        <div className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate mb-1">Hitos de la historia</div>
        <ol className="space-y-1">
          {hitos.map((x, i) => (
            <li key={i} className="text-[11px] text-brand-ink"><b>{x.paso >= h ? "Cierre" : nombre(x.paso)} · {SEV[x.severidad].label}:</b> {x.titulo}. <span className="text-brand-graphite">{x.detalle}</span></li>
          ))}
        </ol>
      </div>
    </div>
  );
}
