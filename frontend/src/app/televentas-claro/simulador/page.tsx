"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { PrintButton, PrintCover } from "@/components/PrintButton";
import { InsightsPanel } from "@/components/televentas/InsightsPanel";
import { Lectura } from "@/components/televentas/Lectura";
import { apiFetch } from "@/lib/api";
import { formatGs, formatInt } from "@/lib/format";

const MES0_LABEL: Record<string, string> = {
  activaciones_cuota1: "Activaciones (cuota 1)",
  portabilidad: "Plus portabilidad",
  bono_productividad: "Bono productividad",
  bono_efectividad: "Bono efectividad",
};
const MES0_COLOR: Record<string, string> = {
  activaciones_cuota1: "#0F1116", portabilidad: "#0EA5E9", bono_productividad: "#E6332A", bono_efectividad: "#F39200",
};
const M = (v: number) => `${Math.round(v / 1e6)}M`;

function Grupo({ titulo, hint, abierto = false, children }: { titulo: string; hint?: string; abierto?: boolean; children: React.ReactNode }) {
  return (
    <details open={abierto} className="border border-brand-border rounded-md bg-white">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-brand-ink flex items-baseline justify-between gap-2">
        {titulo}{hint && <span className="text-[10px] font-normal text-brand-slate">{hint}</span>}
      </summary>
      <div className="px-3 pb-3 space-y-2">{children}</div>
    </details>
  );
}

function Campo({ label, hint, value, onChange, step = 1, suffix }: { label: string; hint?: string; value: number; onChange: (v: number) => void; step?: number; suffix?: string }) {
  return (
    <label className="flex items-center gap-3">
      <span className="flex-1">
        <span className="block text-sm text-brand-ink">{label}</span>
        {hint && <span className="block text-[10px] text-brand-slate">{hint}</span>}
      </span>
      <span className="flex items-center gap-1">
        <input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
          className="input max-w-[120px] !py-1 text-sm text-right" />
        {suffix && <span className="text-xs text-brand-slate w-4">{suffix}</span>}
      </span>
    </label>
  );
}

export default function SimuladorFacturacionPage() {
  const [p, setP] = useState<any>(null);
  const [defaults, setDefaults] = useState<any>(null);
  const [res, setRes] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<any>(null);

  useEffect(() => {
    apiFetch<any>("/api/v1/facturacion/simulador/parametros").then((d) => {
      setP(d.parametros); setDefaults(d.parametros);
    }).catch((e) => setError(e.message));
  }, []);

  const simular = useCallback((params: any) => {
    apiFetch<any>("/api/v1/facturacion/simulador", { method: "POST", body: JSON.stringify({ parametros: params }) })
      .then((d) => { setRes(d); setError(null); })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!p) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => simular(p), 250);
    return () => clearTimeout(timer.current);
  }, [p, simular]);

  const set = (k: string, v: any) => setP((prev: any) => ({ ...prev, [k]: v }));
  const setPlan = (i: number, k: string, v: any) => setP((prev: any) => ({ ...prev, planes: prev.planes.map((pl: any, j: number) => (j === i ? { ...pl, [k]: v } : pl)) }));
  const setEscala = (key: string, i: number, k: string, v: number) => setP((prev: any) => ({ ...prev, [key]: prev[key].map((e: any, j: number) => (j === i ? { ...e, [k]: v } : e)) }));
  const setZafra = (i: number, v: number) => setP((prev: any) => ({ ...prev, zafra_pct: prev.zafra_pct.map((z: number, j: number) => (j === i ? v : z)) }));

  const d = res?.derivados;
  const b = res?.bonos;
  const mes0Data = useMemo(() => res ? Object.entries(res.mes0).map(([k, v]) => ({ key: k, nombre: MES0_LABEL[k] ?? k, valor: v as number })) : [], [res]);
  const zafraData = useMemo(() => p ? p.zafra_pct.map((z: number, i: number) => ({ mes: `M${i}`, activas: z, lineas: res?.meses?.[i]?.lineas_activas ?? 0 })) : [], [p, res]);
  const mixTotal = p ? p.planes.reduce((s: number, pl: any) => s + Number(pl.mix_pct || 0), 0) : 0;

  return (
    <AppShell>
      <PrintCover titulo={`Simulación de Facturación${res ? ` — ${formatInt(p.ventas)} ventas` : ""}`}
        periodo={res ? `Facturación del mes ${formatGs(res.bruto_mes0)} · queda a 6 meses ${formatGs(res.neto_6)} (${res.pct_retenido_6}%) · Televentas Claro` : undefined} />

      <div className="mb-2 text-xs text-brand-slate no-print">
        <Link href="/televentas-claro" className="hover:text-brand-primary">Televentas Claro</Link>
        <span className="mx-2">/</span><span className="text-brand-ink font-semibold">Simulador de facturación</span>
      </div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-brand-ink uppercase">Simulador de Facturación</h1>
          <p className="text-sm text-brand-slate mt-1 max-w-3xl">
            Cargá la cantidad de ventas del mes y el simulador genera la facturación del mes, cuánto queda realmente
            a los 6 meses (chargeback) y a los 12 (residual), y el peso de los bonos sobre la facturación neta.
            Todas las variables de negocio y componentes de facturación son editables.
          </p>
        </div>
        <PrintButton label="Imprimir / Guardar PDF" />
      </div>

      {error && <p className="text-sm text-brand-primary mb-4">{error}</p>}
      {!p && !error && <div className="text-brand-slate">Cargando variables de negocio…</div>}

      {p && (
        <div className="grid lg:grid-cols-5 gap-6 print:block">
          {/* ===== Zona de variables de negocio (editables) ===== */}
          <section className="lg:col-span-2 space-y-2 no-print">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="font-display text-xl text-brand-ink uppercase">Variables de negocio</h2>
              {defaults && <button onClick={() => setP(defaults)} className="text-[11px] text-brand-primary font-semibold hover:underline">Restaurar valores reales</button>}
            </div>

            <Grupo titulo="Ventas y objetivo" abierto>
              <Campo label="Ventas del mes" hint="ventas entregadas a Claro" value={p.ventas} onChange={(v) => set("ventas", v)} step={10} />
              <Campo label="Efectividad" hint="activaciones ÷ ventas (define el bono efectividad)" value={p.efectividad_pct} onChange={(v) => set("efectividad_pct", v)} step={0.5} suffix="%" />
              <Campo label="Objetivo CO (Claro)" hint="objetivo mensual de líneas para el bono productividad" value={p.objetivo_co} onChange={(v) => set("objetivo_co", v)} step={10} />
              <Campo label="Líneas en estado A" hint="activaciones que suman para el bono" value={p.pct_estado_a} onChange={(v) => set("pct_estado_a", v)} step={0.5} suffix="%" />
              <Campo label="Portabilidad" hint="% de activaciones con portación" value={p.porta_pct} onChange={(v) => set("porta_pct", v)} step={1} suffix="%" />
            </Grupo>

            <Grupo titulo="Tarifas por plan y mix" hint={`mix ${mixTotal.toFixed(1)}%`}>
              <table className="w-full text-[11px]">
                <thead><tr className="text-brand-slate uppercase tracking-wider2 text-[9px]">
                  <th className="text-left">Plan</th><th>Mix %</th><th>Cuota 1</th><th>Cuota 2</th><th>Porta plus</th><th>Abono</th>
                </tr></thead>
                <tbody>
                  {p.planes.map((pl: any, i: number) => (
                    <tr key={pl.plan}>
                      <td className="font-semibold text-brand-ink py-0.5">{pl.plan}</td>
                      {(["mix_pct", "cuota1", "cuota2", "porta_plus", "abono"] as const).map((k) => (
                        <td key={k}><input type="number" value={pl[k]} onChange={(e) => setPlan(i, k, Number(e.target.value))} className="input !py-0.5 !px-1 text-[11px] text-right w-full" /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Grupo>

            <Grupo titulo="Cuota 2 y legajos">
              <Campo label="Mes de cobro de la cuota 2" hint="línea activa al día 90" value={p.cuota2_mes} onChange={(v) => set("cuota2_mes", v)} />
              <Campo label="Legajo incompleto" hint="cobra cuota 2 al 50% y descuenta media cuota 1" value={p.legajo_incompleto_pct} onChange={(v) => set("legajo_incompleto_pct", v)} step={0.5} suffix="%" />
              <Campo label="Legajo no presentado" hint="descuenta la cuota 1 completa" value={p.legajo_no_presentado_pct} onChange={(v) => set("legajo_no_presentado_pct", v)} step={0.5} suffix="%" />
            </Grupo>

            <Grupo titulo="Residual">
              <Campo label="Residual" hint="% sobre el abono acreditado" value={p.residual_pct} onChange={(v) => set("residual_pct", v)} step={0.5} suffix="%" />
              <Campo label="Abono acreditado" hint="% del abono del plan que Claro acredita" value={p.pct_abono_acreditado} onChange={(v) => set("pct_abono_acreditado", v)} step={1} suffix="%" />
              <Campo label="Meses de residual" value={p.residual_meses} onChange={(v) => set("residual_meses", v)} />
            </Grupo>

            <Grupo titulo="Bono productividad (concepto 1771)" hint="escala editable">
              <p className="text-[10px] text-brand-slate">Por línea en estado A. % cumplimiento = activaciones netas ÷ objetivo CO. Bajo la escala mínima liquida 0. Al 6º mes se descuenta el de las líneas no activas (1871).</p>
              {p.escala_productividad.map((e: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-brand-slate w-8">≥</span>
                  <input type="number" value={e.desde_pct} onChange={(ev) => setEscala("escala_productividad", i, "desde_pct", Number(ev.target.value))} className="input !py-0.5 text-sm text-right w-20" /><span className="text-xs">%</span>
                  <span className="text-brand-slate">→</span>
                  <input type="number" step={1000} value={e.monto} onChange={(ev) => setEscala("escala_productividad", i, "monto", Number(ev.target.value))} className="input !py-0.5 text-sm text-right w-28" /><span className="text-xs">Gs/línea</span>
                </div>
              ))}
              <Campo label="Mes del recálculo" hint="líneas no activas al día 180" value={p.recalculo_productividad_mes} onChange={(v) => set("recalculo_productividad_mes", v)} />
            </Grupo>

            <Grupo titulo="Bono efectividad distribución (concepto 1891)" hint="escala editable">
              <p className="text-[10px] text-brand-slate">Por venta entregada (activación cuota 1), según efectividad = activaciones ÷ ventas. Bajo la escala mínima liquida 0; se descuenta en las líneas penalizadas.</p>
              {p.escala_efectividad.map((e: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-brand-slate w-8">≥</span>
                  <input type="number" value={e.desde_pct} onChange={(ev) => setEscala("escala_efectividad", i, "desde_pct", Number(ev.target.value))} className="input !py-0.5 text-sm text-right w-20" /><span className="text-xs">%</span>
                  <span className="text-brand-slate">→</span>
                  <input type="number" step={1000} value={e.monto} onChange={(ev) => setEscala("escala_efectividad", i, "monto", Number(ev.target.value))} className="input !py-0.5 text-sm text-right w-28" /><span className="text-xs">Gs/venta</span>
                </div>
              ))}
            </Grupo>

            <Grupo titulo="Zafra (líneas activas por mes)" hint="curva editable">
              <p className="text-[10px] text-brand-slate">% de líneas nuevas activas en cada mes de antigüedad. Sembrada con la zafra tipo del negocio (cohortes jul-25 a ene-26).</p>
              <div className="grid grid-cols-4 gap-1.5">
                {p.zafra_pct.map((z: number, i: number) => (
                  <label key={i} className="text-[10px] text-brand-slate">M{i}
                    <input type="number" step={0.5} value={z} onChange={(e) => setZafra(i, Number(e.target.value))} className="input !py-0.5 !px-1 text-[11px] text-right w-full" />
                  </label>
                ))}
              </div>
              {defaults && <button onClick={() => set("zafra_pct", defaults.zafra_pct)} className="text-[11px] text-brand-primary font-semibold hover:underline">Restaurar zafra tipo</button>}
            </Grupo>

            <Grupo titulo="Chargeback y recuperos">
              <Campo label="Meses de chargeback" hint="ventana de devolución (180 días)" value={p.chargeback_meses} onChange={(v) => set("chargeback_meses", v)} />
              <Campo label="Caídas penalizables" hint="% de caídas dentro del chargeback que Claro descuenta" value={p.pct_caidas_penalizables} onChange={(v) => set("pct_caidas_penalizables", v)} step={5} suffix="%" />
              <Campo label="Recupero por reconexión" hint="% de los descuentos que se recupera" value={p.recupero_pct} onChange={(v) => set("recupero_pct", v)} step={5} suffix="%" />
              <label className="flex items-center gap-2 text-sm text-brand-ink">
                <input type="checkbox" checked={!!p.clawback_incluye_residual} onChange={(e) => set("clawback_incluye_residual", e.target.checked)} className="accent-brand-primary" />
                La suspensión penalizable descuenta cuota 1 + un residual (214.431)
              </label>
            </Grupo>
          </section>

          {/* ===== Resultados ===== */}
          <div className="lg:col-span-3 space-y-6">
            {res && d && b && (
              <>
                <div className="print-only card p-4">
                  <h3 className="text-sm font-semibold text-brand-ink mb-2">Supuestos de la simulación</h3>
                  <p className="text-xs text-brand-graphite leading-relaxed">
                    Ventas <b>{formatInt(p.ventas)}</b> · efectividad <b>{p.efectividad_pct}%</b> · objetivo CO <b>{formatInt(p.objetivo_co)}</b> ·
                    portabilidad <b>{p.porta_pct}%</b> · mix {p.planes.map((pl: any) => `${pl.plan} ${pl.mix_pct}%`).join(", ")} ·
                    residual <b>{p.residual_pct}%</b> × {p.pct_abono_acreditado}% del abono × {p.residual_meses} meses · chargeback <b>{p.chargeback_meses} meses</b> ·
                    zafra {p.zafra_pct.map((z: number) => `${z}`).join(" / ")}
                  </p>
                </div>

                <section className="card p-5 border-l-4 border-brand-ink bg-white">
                  <h2 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-bold mb-2">Conclusión ejecutiva</h2>
                  <p className="text-[15px] text-brand-ink leading-relaxed font-medium">{res.conclusion}</p>
                </section>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard label="Facturación del mes" value={formatGs(res.bruto_mes0)} hint={`${formatInt(d.activaciones)} activaciones`} accent="primary" />
                  <KpiCard label="Queda a 6 meses" value={formatGs(res.neto_6)} hint={`${res.pct_retenido_6}% de lo facturado`} accent={res.pct_retenido_6 >= 75 ? "cyan" : "orange"} />
                  <KpiCard label="Queda a 12 meses" value={formatGs(res.neto_12)} hint={`${res.pct_retenido_12}% con residual completo`} accent="cyan" />
                  <KpiCard label="Peso de los bonos" value={`${b.peso_mes0_pct}%`} hint={`del mes · ${b.peso_neto_6_pct}% del neto a 6 meses`} accent="purple" />
                </div>

                <div className="grid xl:grid-cols-2 gap-6 print:block">
                  <section className="card p-5 print:mb-5">
                    <h2 className="font-display text-lg text-brand-ink uppercase mb-1">Facturación del mes por componente</h2>
                    <p className="text-xs text-brand-slate mb-3">Cuota 1 {formatGs(d.cuota1_ponderada)} · porta {formatGs(d.porta_plus_ponderado)} · bono productividad {formatGs(d.monto_bono_productividad)} ({d.cumplimiento_pct}% del objetivo) · bono efectividad {formatGs(d.monto_bono_efectividad)}.</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={mes0Data} layout="vertical" margin={{ left: 40, right: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" fontSize={10} tickFormatter={M} />
                        <YAxis type="category" dataKey="nombre" fontSize={10} width={130} />
                        <Tooltip formatter={(v: any) => formatGs(Number(v))} />
                        <Bar dataKey="valor" radius={[0, 3, 3, 0]}>
                          {mes0Data.map((x) => <Cell key={x.key} fill={MES0_COLOR[x.key]} />)}
                          <LabelList dataKey="valor" position="right" formatter={(v: any) => M(Number(v))} fontSize={10} fontWeight={700} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <Lectura>
                      Cada barra es un componente de la liquidación del mes de activación. Las dos barras de bonos
                      dependen de umbrales: si el cumplimiento del objetivo o la efectividad caen bajo la escala, esas
                      barras desaparecen enteras — por eso su peso se analiza aparte más abajo.
                    </Lectura>
                  </section>

                  <section className="card p-5">
                    <h2 className="font-display text-lg text-brand-ink uppercase mb-1">Qué queda de la facturación: mes 0 → mes 12</h2>
                    <p className="text-xs text-brand-slate mb-3">Barras: movimiento de cada mes (residual y cuota 2 suman; clawbacks, legajos y recálculo restan). Línea: acumulado real de la cohorte.</p>
                    <ResponsiveContainer width="100%" height={230}>
                      <ComposedChart data={res.meses} margin={{ top: 8, right: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="mes" fontSize={10} tickFormatter={(v: number) => `M${v}`} />
                        <YAxis yAxisId="l" fontSize={10} tickFormatter={M} />
                        <YAxis yAxisId="r" orientation="right" fontSize={10} tickFormatter={M} />
                        <Tooltip formatter={(v: any) => formatGs(Number(v))} labelFormatter={(l) => `Mes ${l}`} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar yAxisId="l" dataKey="neto_mes" name="Movimiento del mes">
                          {res.meses.map((m: any) => <Cell key={m.mes} fill={m.mes === 0 ? "#0F1116" : m.neto_mes < 0 ? "#E6332A" : "#10B981"} />)}
                        </Bar>
                        <Line yAxisId="r" dataKey="acumulado" name="Acumulado real" stroke="#0EA5E9" strokeWidth={2.5} dot={{ r: 2.5 }} />
                        <ReferenceLine yAxisId="l" x={p.chargeback_meses} stroke="#F39200" strokeDasharray="4 3" label={{ value: "fin chargeback", position: "top", fill: "#F39200", fontSize: 10 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                    <Lectura>
                      El mes 0 es lo que se factura al activar. Los meses siguientes muestran lo que Claro devuelve (rojo:
                      líneas que caen dentro del chargeback, legajos, recálculo del bono al mes 6) y lo que se sigue
                      cobrando (verde: residual y cuota 2). La línea celeste es lo que realmente queda: compará su valor
                      en el mes 6 contra la barra del mes 0.
                    </Lectura>
                  </section>
                </div>

                {/* Mes 0 vs mes 6 vs mes 12 */}
                <section className="card overflow-x-auto">
                  <div className="px-4 pt-4">
                    <h2 className="font-display text-lg text-brand-ink uppercase">Mes 0 vs mes 6 vs mes 12</h2>
                    <p className="text-xs text-brand-slate mb-2">Descomposición de lo facturado y de lo que se pierde o suma después.</p>
                  </div>
                  <table className="w-full text-sm min-w-[640px]">
                    <thead className="bg-brand-bg border-b border-brand-border"><tr className="text-[10px] uppercase tracking-wider2 text-brand-slate">
                      <th className="px-3 py-2 text-left">Concepto</th><th className="px-3 py-2 text-right">A 6 meses</th><th className="px-3 py-2 text-right">A 12 meses</th>
                    </tr></thead>
                    <tbody>
                      {([
                        ["Facturado en el mes 0", () => res.bruto_mes0, () => res.bruto_mes0],
                        ["+ Residual", (n: number) => res.meses.slice(1, n + 1).reduce((s: number, m: any) => s + m.residual, 0)],
                        ["+ Cuota 2", (n: number) => res.meses.slice(1, n + 1).reduce((s: number, m: any) => s + m.cuota2, 0)],
                        ["− Legajos", (n: number) => res.meses.slice(1, n + 1).reduce((s: number, m: any) => s + m.legajos, 0)],
                        ["− Clawbacks por caídas (cuota 1, porta, residual)", (n: number) => res.meses.slice(1, n + 1).reduce((s: number, m: any) => s + m.clawbacks, 0)],
                        ["− Devolución de bonos (efectividad + recálculo productividad)", (n: number) => res.meses.slice(1, n + 1).reduce((s: number, m: any) => s + m.clawback_bonos + m.recalculo_productividad, 0)],
                      ] as Array<[string, (n: number) => number, ((n: number) => number)?]>).map(([label, f6, f12]) => {
                        const v6 = f6(6), v12 = (f12 ?? f6)(12);
                        return (
                          <tr key={label} className="border-t border-brand-border">
                            <td className="px-3 py-1.5 text-brand-ink">{label}</td>
                            <td className={`px-3 py-1.5 text-right font-mono ${v6 < 0 ? "text-brand-primary" : ""}`}>{formatGs(v6)}</td>
                            <td className={`px-3 py-1.5 text-right font-mono ${v12 < 0 ? "text-brand-primary" : ""}`}>{formatGs(v12)}</td>
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 border-brand-ink bg-brand-bg-soft font-bold">
                        <td className="px-3 py-2 text-brand-ink">Queda realmente</td>
                        <td className="px-3 py-2 text-right font-mono">{formatGs(res.neto_6)} <span className="text-xs text-brand-slate">({res.pct_retenido_6}%)</span></td>
                        <td className="px-3 py-2 text-right font-mono">{formatGs(res.neto_12)} <span className="text-xs text-brand-slate">({res.pct_retenido_12}%)</span></td>
                      </tr>
                    </tbody>
                  </table>
                </section>

                {/* Peso de los bonos */}
                <section className="card p-5">
                  <h2 className="font-display text-lg text-brand-ink uppercase mb-1">Peso de los bonos sobre la facturación neta</h2>
                  <p className="text-xs text-brand-slate mb-3">Los bonos dependen de umbrales: valen mucho y se pierden enteros. Este análisis se genera con cada simulación.</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <KpiCard label="Bonos del mes" value={formatGs(b.mes0)} hint={`${b.peso_mes0_pct}% de la facturación`} accent="primary" />
                    <KpiCard label="Bonos que quedan a 6 meses" value={formatGs(b.netos_6)} hint={`${b.peso_neto_6_pct}% del neto · devueltos ${formatGs(Math.abs(b.devueltos_6))}`} accent="orange" />
                    <KpiCard label="Mes sin bonos" value={formatGs(b.sin_bonos_mes0)} hint="si se pierden ambas escalas" accent="neutral" />
                    <KpiCard label="Neto a 6 meses sin bonos" value={formatGs(b.sin_bonos_6)} accent="neutral" />
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    {([["Bono productividad", b.distancia_productividad, p.escala_productividad, "cumplimiento del objetivo CO"],
                       ["Bono efectividad", b.distancia_efectividad, p.escala_efectividad, "efectividad (activaciones ÷ ventas)"]] as any[]).map(([titulo, dist, escala, medida]) => (
                      <div key={titulo} className="rounded-md border border-brand-border p-3">
                        <div className="text-sm font-semibold text-brand-ink mb-1">{titulo} — {medida}: <span className="font-mono">{dist.valor_pct}%</span></div>
                        <table className="w-full text-xs mb-2">
                          <tbody>
                            {[...escala].sort((a: any, c: any) => c.desde_pct - a.desde_pct).map((e: any) => {
                              const actual = dist.escalon_actual && e.desde_pct === dist.escalon_actual.desde_pct;
                              return (
                                <tr key={e.desde_pct} className={actual ? "bg-brand-primary/10 font-bold" : ""}>
                                  <td className="py-0.5">≥ {e.desde_pct}%</td>
                                  <td className="py-0.5 text-right font-mono">{formatGs(e.monto)}</td>
                                  <td className="py-0.5 text-right text-[10px] text-brand-slate">{actual ? "← escalón actual" : ""}</td>
                                </tr>
                              );
                            })}
                            {!dist.escalon_actual && <tr className="bg-brand-primary/10 font-bold"><td className="py-0.5">bajo la escala</td><td className="text-right font-mono">Gs 0</td><td className="text-right text-[10px] text-brand-slate">← actual</td></tr>}
                          </tbody>
                        </table>
                        <p className="text-[11px] text-brand-graphite">
                          {dist.siguiente_escalon ? <>Faltan <b>{formatInt(dist.faltan_unidades)} {dist.unidad}</b> para el escalón {dist.siguiente_escalon.desde_pct}%. </> : <>Está en el escalón máximo. </>}
                          {dist.escalon_actual && <>Margen antes de bajar de escalón: <b>{formatInt(dist.margen_unidades)} {dist.unidad}</b>.</>}
                        </p>
                      </div>
                    ))}
                  </div>
                  <Lectura>
                    El escalón resaltado es el que paga hoy. "Faltan N" dice cuántas activaciones más suben todas las líneas
                    al escalón siguiente; "margen" dice cuántas se pueden perder antes de caer al inferior. Un mes que cierra
                    apenas por debajo de un umbral pierde el bono de todas las líneas, no solo de las que faltaron.
                  </Lectura>
                </section>

                <section className="card p-5">
                  <h2 className="font-display text-lg text-brand-ink uppercase mb-1">Zafra: líneas activas por mes de antigüedad</h2>
                  <p className="text-xs text-brand-slate mb-3">Residual por línea activa: {formatGs(d.residual_por_linea)}/mes · clawback por línea caída: {formatGs(d.clawback_por_linea)}.</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <ComposedChart data={zafraData} margin={{ top: 8, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" fontSize={10} />
                      <YAxis yAxisId="l" fontSize={10} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
                      <YAxis yAxisId="r" orientation="right" fontSize={10} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar yAxisId="r" dataKey="lineas" name="Líneas activas" fill="#0EA5E9" fillOpacity={0.35} />
                      <Line yAxisId="l" dataKey="activas" name="% activas (zafra)" stroke="#0F1116" strokeWidth={2.5} dot={{ r: 3 }} />
                      <ReferenceLine yAxisId="l" x={`M${p.chargeback_meses}`} stroke="#F39200" strokeDasharray="4 3" />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <Lectura>
                    La línea negra es el porcentaje de la cohorte que sigue activa cada mes; las barras, cuántas líneas
                    son. Cada escalón hacia abajo antes de la línea naranja (fin del chargeback) genera devoluciones; después
                    solo deja de cobrarse el residual. La caída del mes 1 es la primera factura impaga: la palanca más grande.
                  </Lectura>
                </section>

                <InsightsPanel insights={res.recomendaciones} titulo="Recomendaciones (se actualizan con cada cambio)" />

                <section className="card p-5">
                  <h2 className="font-display text-lg text-brand-ink uppercase mb-2">Criterios del modelo</h2>
                  <div className="text-xs text-brand-graphite leading-relaxed space-y-1.5">
                    <p><b>Activaciones</b> = ventas × efectividad. <b>Mes 0</b> = cuota 1 por plan (mix) + plus de portabilidad (% portadas) + bono productividad + bono efectividad.</p>
                    <p><b>Bono productividad (1771)</b>: por línea en estado A; % cumplimiento = activaciones netas ÷ objetivo CO comunicado por Claro; escala por tramos (bajo el mínimo, 0). Al 6º mes se descuenta el de las líneas no activas al día 180 (1871).</p>
                    <p><b>Bono efectividad (1891)</b>: por venta entregada (activación cuota 1) según efectividad = activaciones ÷ ventas; escala por tramos (bajo el mínimo, 0). Se descuenta en las líneas penalizadas.</p>
                    <p><b>Cuota 2</b>: al mes +3, líneas activas al día 90 (zafra M3); legajo incompleto cobra el 50%; legajo no presentado descuenta la cuota 1.</p>
                    <p><b>Residual</b>: {p.residual_pct}% del abono acreditado ({p.pct_abono_acreditado}% del abono del plan) por línea activa, durante {p.residual_meses} liquidaciones.</p>
                    <p><b>Chargeback</b>: las líneas que caen dentro de los {p.chargeback_meses} meses (según la zafra) devuelven cuota 1{p.clawback_incluye_residual ? " + un residual" : ""}, el plus de portabilidad y el bono efectividad, neto del recupero por reconexión.</p>
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
