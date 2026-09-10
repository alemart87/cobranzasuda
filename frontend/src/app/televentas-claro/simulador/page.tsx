"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { PrintButton, PrintCover } from "@/components/PrintButton";
import { InsightsPanel } from "@/components/televentas/InsightsPanel";
import { Lectura } from "@/components/televentas/Lectura";
import { VariablesNegocio } from "@/components/facturacion/VariablesNegocio";
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

  const d = res?.derivados;
  const b = res?.bonos;
  const mes0Data = useMemo(() => res ? Object.entries(res.mes0).map(([k, v]) => ({ key: k, nombre: MES0_LABEL[k] ?? k, valor: v as number })) : [], [res]);
  const zafraData = useMemo(() => p ? p.zafra_pct.map((z: number, i: number) => ({ mes: `M${i}`, activas: z, lineas: res?.meses?.[i]?.lineas_activas ?? 0 })) : [], [p, res]);

  return (
    <AppShell>
      <PrintCover titulo={`Simulación de Facturación${res ? ` — ${formatInt(p.ventas)} ventas` : ""}`}
        periodo={res ? `Facturación del mes ${formatGs(res.bruto_mes0)} · queda a 6 meses ${formatGs(res.neto_6)} (${res.pct_retenido_6}%) · margen a 6 meses ${formatGs(res.margen?.meses6 ?? 0)}${p.bonos_activos === false ? " · SIN BONOS" : ""} · Televentas Claro` : undefined} />

      <div className="mb-2 text-xs text-brand-slate no-print">
        <Link href="/televentas-claro" className="hover:text-brand-primary">Televentas Claro</Link>
        <span className="mx-2">/</span><span className="text-brand-ink font-semibold">Simulador de facturación</span>
      </div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-brand-ink uppercase">Simulador de Facturación</h1>
          <p className="text-sm text-brand-slate mt-1 max-w-3xl">
            Cargá la cantidad de ventas efectivas del mes y el simulador genera la facturación del mes, cuánto queda realmente
            a los 6 meses (chargeback) y a los 12 (residual), el peso de los bonos y el margen contra el costo de la estructura.
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
          <div className="lg:col-span-2">
            <VariablesNegocio p={p} setP={setP} defaults={defaults} />
          </div>

          {/* ===== Resultados ===== */}
          <div className="lg:col-span-3 space-y-6">
            {res && d && b && (
              <>
                <div className={`flex flex-wrap items-center justify-between gap-3 rounded-md border-2 px-4 py-3 ${p.bonos_activos === false ? "border-brand-ink bg-brand-ink text-white" : "border-brand-border bg-white"}`}>
                  <div>
                    <div className={`text-[10px] uppercase tracking-wider2 font-bold ${p.bonos_activos === false ? "text-white/70" : "text-brand-slate"}`}>Escenario de bonos</div>
                    <div className="text-sm font-semibold">
                      {p.bonos_activos === false
                        ? "Bonos DESACTIVADOS — resultado sin bono productividad ni bono efectividad"
                        : "Bonos activos — se liquidan según las escalas de Claro"}
                    </div>
                  </div>
                  <button onClick={() => set("bonos_activos", p.bonos_activos === false)}
                    className={`no-print px-4 py-2 rounded-md text-sm font-bold transition-colors ${p.bonos_activos === false ? "bg-white text-brand-ink hover:bg-brand-bg" : "bg-brand-primary text-white hover:bg-brand-primary/90"}`}>
                    {p.bonos_activos === false ? "Reactivar bonos" : "Simular sin bonos"}
                  </button>
                </div>

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
                {res.costos && res.margen && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <KpiCard label="Costo de la estructura" value={formatGs(res.costos.total)} hint={`${res.costos.headcount.total} personas · ${formatGs(res.costos.costo_por_venta)} por venta`} accent="neutral" />
                    <KpiCard label="Margen del mes" value={formatGs(res.margen.mes0)} hint={`${res.margen.pct_mes0}% de lo facturado`} accent={res.margen.mes0 >= 0 ? "cyan" : "primary"} />
                    <KpiCard label="Margen a 6 meses" value={formatGs(res.margen.meses6)} hint={`${res.margen.pct_6}% de lo que queda · la cifra que decide`} accent={res.margen.meses6 >= 0 ? "cyan" : "primary"} />
                    <KpiCard label="Punto de equilibrio (6 m)" value={res.margen.breakeven_ventas_6 ? `${formatInt(res.margen.breakeven_ventas_6)} ventas` : "no cierra"} hint={res.margen.breakeven_ventas_6 ? "ventas para margen cero a 6 meses" : "con esta estructura no hay volumen que lo cierre"} accent={res.margen.breakeven_ventas_6 ? "orange" : "primary"} />
                  </div>
                )}

                {/* ===== EERR ===== */}
                {res.costos && res.margen && (() => {
                  const sumM = (k: string, n: number) => res.meses.slice(1, n + 1).reduce((acc: number, m: any) => acc + (m[k] ?? 0), 0);
                  const devBonos = (n: number) => sumM("clawback_bonos", n) + sumM("recalculo_productividad", n);
                  const c = res.costos, r0 = res.bruto_mes0, r6 = res.neto_6, r12 = res.neto_12;
                  type Fila = { label: string; v: [number, number, number]; tipo?: "ingreso" | "ajuste" | "sub" | "costo" | "total" | "pct" | "head" };
                  const filas: Fila[] = [
                    { label: "INGRESOS — facturación del mes", v: [0, 0, 0], tipo: "head" },
                    { label: "Activaciones (cuota 1)", v: [res.mes0.activaciones_cuota1, res.mes0.activaciones_cuota1, res.mes0.activaciones_cuota1], tipo: "ingreso" },
                    { label: "Plus portabilidad", v: [res.mes0.portabilidad, res.mes0.portabilidad, res.mes0.portabilidad], tipo: "ingreso" },
                    { label: "Bono productividad", v: [res.mes0.bono_productividad, res.mes0.bono_productividad, res.mes0.bono_productividad], tipo: "ingreso" },
                    { label: "Bono efectividad", v: [res.mes0.bono_efectividad, res.mes0.bono_efectividad, res.mes0.bono_efectividad], tipo: "ingreso" },
                    { label: "Facturación bruta", v: [r0, r0, r0], tipo: "sub" },
                    { label: "AJUSTES POSTERIORES — chargeback, cuota 2 y residual", v: [0, 0, 0], tipo: "head" },
                    { label: "+ Residual cobrado", v: [0, sumM("residual", 6), sumM("residual", 12)], tipo: "ajuste" },
                    { label: "+ Cuota 2 cobrada", v: [0, sumM("cuota2", 6), sumM("cuota2", 12)], tipo: "ajuste" },
                    { label: "− Legajos faltantes / incompletos", v: [0, sumM("legajos", 6), sumM("legajos", 12)], tipo: "ajuste" },
                    { label: "− Devoluciones por caídas (cuota 1, portabilidad, residual)", v: [0, sumM("clawbacks", 6), sumM("clawbacks", 12)], tipo: "ajuste" },
                    { label: "− Devolución de bonos (efectividad y recálculo productividad)", v: [0, devBonos(6), devBonos(12)], tipo: "ajuste" },
                    { label: "INGRESO NETO", v: [r0, r6, r12], tipo: "total" },
                    { label: "COSTOS DE LA ESTRUCTURA", v: [0, 0, 0], tipo: "head" },
                    { label: `Operadores — salario (${c.headcount.vendedores} × ${formatGs(c.salario_operador_mes)})`, v: [c.rrhh.operadores_salario, c.rrhh.operadores_salario, c.rrhh.operadores_salario], tipo: "costo" },
                    { label: `Operadores — comisiones ${p.costos.comision_vendedores_pct}%`, v: [c.rrhh.operadores_comisiones, c.rrhh.operadores_comisiones, c.rrhh.operadores_comisiones], tipo: "costo" },
                    { label: `Supervisores (${c.headcount.supervisores})`, v: [c.rrhh.supervisores, c.rrhh.supervisores, c.rrhh.supervisores], tipo: "costo" },
                    { label: `Coordinación (${c.headcount.coordinadores})`, v: [c.rrhh.coordinadores, c.rrhh.coordinadores, c.rrhh.coordinadores], tipo: "costo" },
                    { label: `Backoffice (${c.headcount.backoffice})`, v: [c.rrhh.backoffice, c.rrhh.backoffice, c.rrhh.backoffice], tipo: "costo" },
                    { label: `Controllers (${c.headcount.controllers})`, v: [c.rrhh.controllers, c.rrhh.controllers, c.rrhh.controllers], tipo: "costo" },
                    { label: `IPS ${p.costos.ips_pct}%`, v: [c.ips, c.ips, c.ips], tipo: "costo" },
                    { label: "Previsión de aguinaldo (÷ 12)", v: [c.aguinaldo, c.aguinaldo, c.aguinaldo], tipo: "costo" },
                    { label: "Logística — entregas", v: [c.logistica_entregas, c.logistica_entregas, c.logistica_entregas], tipo: "costo" },
                    { label: "Logística — premios", v: [c.logistica_premios, c.logistica_premios, c.logistica_premios], tipo: "costo" },
                    { label: "Costos operativos", v: [c.operativos, c.operativos, c.operativos], tipo: "costo" },
                    { label: "TOTAL COSTOS", v: [c.total, c.total, c.total], tipo: "sub" },
                    { label: "RESULTADO (MARGEN)", v: [res.margen.mes0, res.margen.meses6, res.margen.meses12], tipo: "total" },
                    { label: "Margen sobre ingreso neto", v: [res.margen.pct_mes0, res.margen.pct_6, res.margen.pct_12], tipo: "pct" },
                    { label: "Resultado por venta", v: [res.margen.mes0 / d.activaciones, res.margen.meses6 / d.activaciones, res.margen.meses12 / d.activaciones], tipo: "pct" },
                  ];
                  const cls = (t?: string) => t === "head" ? "bg-brand-bg text-[10px] uppercase tracking-wider2 text-brand-slate font-bold"
                    : t === "sub" ? "bg-brand-bg-soft font-semibold text-brand-ink border-t border-brand-border"
                    : t === "total" ? "bg-brand-ink text-white font-bold"
                    : t === "pct" ? "text-brand-graphite italic"
                    : "text-brand-ink";
                  return (
                    <section className="card overflow-x-auto">
                      <div className="px-4 pt-4">
                        <h2 className="font-display text-xl text-brand-ink uppercase">Estado de resultados (EERR)</h2>
                        <p className="text-xs text-brand-slate mb-2">
                          Un mes de estructura produce una cohorte de {formatInt(d.activaciones)} ventas. El EERR se lee en tres cortes: lo facturado
                          en el mes, lo que realmente queda a 6 meses (fin del chargeback) y a 12 (residual completo). La columna de 6 meses es la que decide.
                        </p>
                      </div>
                      <table className="w-full text-sm min-w-[720px]">
                        <thead className="border-b border-brand-border">
                          <tr className="text-[10px] uppercase tracking-wider2 text-brand-slate">
                            <th className="px-4 py-2 text-left">Concepto</th>
                            <th className="px-4 py-2 text-right">Mes 0</th>
                            <th className="px-4 py-2 text-right bg-brand-primary/5 text-brand-primary">A 6 meses</th>
                            <th className="px-4 py-2 text-right">A 12 meses</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filas.map((f) => (
                            <tr key={f.label} className={cls(f.tipo)}>
                              <td className={`px-4 ${f.tipo === "head" ? "py-1.5" : "py-1"} ${f.tipo === "ingreso" || f.tipo === "ajuste" || f.tipo === "costo" ? "pl-7" : ""}`}>{f.label}</td>
                              {f.v.map((v, i) => (
                                <td key={i} className={`px-4 py-1 text-right font-mono whitespace-nowrap ${i === 1 && f.tipo !== "total" ? "bg-brand-primary/5" : ""} ${f.tipo !== "head" && f.tipo !== "total" && v < 0 ? "text-brand-primary" : ""}`}>
                                  {f.tipo === "head" ? "" : f.tipo === "pct" && f.label.startsWith("Margen") ? `${v}%` : f.tipo === "pct" ? formatGs(v) : (f.tipo === "ajuste" && v === 0) ? "—" : formatGs(v)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="px-4 py-3">
                        <Lectura>
                          Ingresos menos ajustes posteriores da el ingreso neto de la cohorte; menos el costo de la estructura que la produjo, el
                          resultado. En el mes 0 casi siempre da positivo porque todavía no se devolvió nada; la columna de 6 meses ya descontó las
                          caídas del chargeback y es el margen real del negocio. La de 12 suma el residual completo.
                        </Lectura>
                      </div>
                    </section>
                  );
                })()}

                {/* ===== Estructura necesaria ===== */}
                {res.costos && (
                  <section className="card p-5">
                    <h2 className="font-display text-xl text-brand-ink uppercase mb-1">Estructura necesaria</h2>
                    <p className="text-xs text-brand-slate mb-4">
                      Para {formatInt(d.activaciones)} ventas efectivas, con {p.costos.ventas_por_vendedor} ventas por vendedor, 1 supervisor cada {p.costos.supervisor_cada_vendedores} vendedores y 1 backoffice cada {p.costos.backoffice_cada_ventas} ventas.
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                      {([
                        ["Vendedores", res.costos.headcount.vendedores, "#E6332A", `${formatGs(res.costos.rrhh.operadores_salario)} salarios`],
                        ["Supervisores", res.costos.headcount.supervisores, "#F39200", formatGs(res.costos.rrhh.supervisores)],
                        ["Backoffice", res.costos.headcount.backoffice, "#0EA5E9", formatGs(res.costos.rrhh.backoffice)],
                        ["Coordinador", res.costos.headcount.coordinadores, "#662483", formatGs(res.costos.rrhh.coordinadores)],
                        ["Controllers", res.costos.headcount.controllers, "#00B2BF", formatGs(res.costos.rrhh.controllers)],
                        ["Total personas", res.costos.headcount.total, "#0F1116", `${formatGs(res.costos.rrhh_total)} RRHH con cargas`],
                      ] as Array<[string, number, string, string]>).map(([label, n, color, hint]) => (
                        <div key={label} className="rounded-md border border-brand-border bg-white p-4 text-center" style={{ borderTop: `4px solid ${color}` }}>
                          <div className="text-[10px] uppercase tracking-wider2 text-brand-slate font-bold">{label}</div>
                          <div className="font-display text-4xl text-brand-ink leading-tight mt-1">{formatInt(n)}</div>
                          <div className="text-[10px] text-brand-slate mt-1">{hint}</div>
                        </div>
                      ))}
                    </div>
                    {res.costos.vendedor && (
                      <div className="mt-4 rounded-md border border-brand-border bg-brand-bg-soft p-4">
                        <div className="text-[10px] uppercase tracking-wider2 text-brand-slate font-bold mb-2">Remuneración promedio del vendedor</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <div className="text-[10px] text-brand-slate">Salario fijo (mes)</div>
                            <div className="font-display text-xl text-brand-ink">{formatGs(res.costos.vendedor.salario_fijo)}</div>
                            <div className="text-[10px] text-brand-slate">{formatGs(p.costos.salario_hora)} × {p.costos.horas_dia} h × {p.costos.dias_mes} días</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-brand-slate">Comisión promedio (mes)</div>
                            <div className="font-display text-xl text-brand-primary">{formatGs(res.costos.vendedor.comision_promedio)}</div>
                            <div className="text-[10px] text-brand-slate">{p.costos.comision_vendedores_pct}% sobre {formatGs(res.costos.vendedor.base_comision)} ÷ {res.costos.headcount.vendedores} vendedores</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-brand-slate">Comisión por venta promedio</div>
                            <div className="font-display text-xl text-brand-ink">{formatGs(res.costos.vendedor.comision_por_venta)}</div>
                            <div className="text-[10px] text-brand-slate">{p.costos.comision_vendedores_pct}% de {formatGs(res.costos.vendedor.base_por_venta)} facturados por venta</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-brand-slate">Ingreso total promedio (mes)</div>
                            <div className="font-display text-xl text-brand-ink">{formatGs(res.costos.vendedor.ingreso_promedio)}</div>
                            <div className="text-[10px] text-brand-slate">fijo + comisión · {res.costos.vendedor.pct_comision_sobre_ingreso}% variable · {res.costos.vendedor.ventas_promedio} ventas/vendedor</div>
                          </div>
                        </div>
                      </div>
                    )}
                    <p className="text-[11px] text-brand-slate mt-3">
                      Costo total de la estructura {formatGs(res.costos.total)} / mes · {formatGs(res.costos.costo_por_venta)} por venta ·
                      {" "}{formatGs(Math.round(res.costos.total / Math.max(res.costos.headcount.total, 1)))} por persona · operador {formatGs(res.costos.salario_operador_mes)}/mes
                      ({formatGs(p.costos.salario_hora)} × {p.costos.horas_dia} h × {p.costos.dias_mes} días).
                    </p>
                  </section>
                )}

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

                {/* Margen del negocio */}
                {res.costos && res.margen && (
                  <section className="card p-5">
                    <h2 className="font-display text-lg text-brand-ink uppercase mb-1">Margen del negocio: facturación vs costos</h2>
                    <p className="text-xs text-brand-slate mb-3">
                      La estructura de un mes produce la cohorte: su costo se compara con lo facturado (mes 0) y con lo que realmente queda a 6 y 12 meses.
                    </p>
                    <div>
                      <div>
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={[
                            { etapa: "Mes 0", facturacion: res.bruto_mes0, costos: res.costos.total, margen: res.margen.mes0 },
                            { etapa: "A 6 meses", facturacion: res.neto_6, costos: res.costos.total, margen: res.margen.meses6 },
                            { etapa: "A 12 meses", facturacion: res.neto_12, costos: res.costos.total, margen: res.margen.meses12 },
                          ]} margin={{ top: 8, right: 12 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="etapa" fontSize={11} />
                            <YAxis fontSize={10} tickFormatter={M} />
                            <Tooltip formatter={(v: any) => formatGs(Number(v))} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <ReferenceLine y={0} stroke="#0F1116" />
                            <Bar dataKey="facturacion" name="Facturación que queda" fill="#0EA5E9" radius={[3, 3, 0, 0]} />
                            <Bar dataKey="costos" name="Costo de la estructura" fill="#F39200" radius={[3, 3, 0, 0]} />
                            <Bar dataKey="margen" name="Margen" radius={[3, 3, 0, 0]}>
                              {[res.margen.mes0, res.margen.meses6, res.margen.meses12].map((v: number, i: number) => <Cell key={i} fill={v >= 0 ? "#10B981" : "#E6332A"} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        <Lectura>
                          Tres cortes de la misma cohorte: lo facturado en el mes, lo que queda tras el chargeback (6 meses) y con el
                          residual completo (12). La barra naranja es el costo de la estructura que produjo esas ventas; la verde/roja,
                          el margen. El corte que decide el negocio es el de 6 meses: ahí ya no hay devoluciones pendientes.
                        </Lectura>
                      </div>
                    </div>
                  </section>
                )}

                {/* Peso de los bonos */}
                <section className="card p-5">
                  <h2 className="font-display text-lg text-brand-ink uppercase mb-1">Peso de los bonos sobre la facturación neta</h2>
                  <p className="text-xs text-brand-slate mb-3">Los bonos dependen de umbrales: valen mucho y se pierden enteros. Este análisis se genera con cada simulación.</p>
                  {p.bonos_activos === false && (
                    <p className="text-xs font-semibold text-brand-ink bg-brand-bg-soft border border-brand-border rounded px-3 py-2 mb-3">
                      Bonos desactivados por el usuario: todos los resultados de la página corresponden al escenario sin bonos. Las escalas se muestran solo como referencia.
                    </p>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <KpiCard label="Bonos del mes" value={formatGs(b.mes0)} hint={`${b.peso_mes0_pct}% de la facturación`} accent="primary" />
                    <KpiCard label="Bonos que quedan a 6 meses" value={formatGs(b.netos_6)} hint={`${b.peso_neto_6_pct}% del neto · devueltos ${formatGs(Math.abs(b.devueltos_6))}`} accent="orange" />
                    <KpiCard label="Mes sin bonos" value={formatGs(b.sin_bonos_mes0)} hint="si se pierden ambas escalas" accent="neutral" />
                    <KpiCard label="Neto a 6 meses sin bonos" value={formatGs(b.sin_bonos_6)} accent="neutral" />
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    {([["Bono productividad", b.distancia_productividad, p.escala_productividad, "cumplimiento del objetivo CO"],
                       ["Bono efectividad", b.distancia_efectividad, p.escala_efectividad, "efectividad de entregas"]] as any[]).map(([titulo, dist, escala, medida]) => (
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
                          {dist.siguiente_escalon ? <>Faltan <b>{dist.unidad === "pts" ? `${dist.faltan_pct} puntos` : `${formatInt(dist.faltan_unidades)} ${dist.unidad}`}</b> para el escalón {dist.siguiente_escalon.desde_pct}%. </> : <>Está en el escalón máximo. </>}
                          {dist.escalon_actual && <>Margen antes de bajar de escalón: <b>{dist.unidad === "pts" ? `${dist.margen_pct} puntos` : `${formatInt(dist.margen_unidades)} ${dist.unidad}`}</b>.</>}
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
                    <p><b>Ventas efectivas</b> = activaciones (cuota 1); la efectividad es de entregas y solo define el escalón de su bono. <b>Mes 0</b> = cuota 1 por plan (mix) + plus de portabilidad (% portadas) + bono productividad + bono efectividad.</p>
                    <p><b>Bono productividad (1771)</b>: por línea en estado A; % cumplimiento = activaciones netas ÷ objetivo CO comunicado por Claro; escala por tramos (bajo el mínimo, 0). Al 6º mes se descuenta el de las líneas no activas al día 180 (1871).</p>
                    <p><b>Bono efectividad (1891)</b>: por venta entregada (activación cuota 1) según la efectividad de entregas; escala por tramos (bajo el mínimo, 0). Se descuenta en las líneas penalizadas.</p>
                    <p><b>Cuota 2</b>: al mes +3, líneas activas al día 90 (zafra M3); legajo incompleto cobra el 50%; legajo no presentado descuenta la cuota 1.</p>
                    <p><b>Residual</b>: {p.residual_pct}% del abono acreditado ({p.pct_abono_acreditado}% del abono del plan) por línea activa, durante {p.residual_meses} liquidaciones.</p>
                    <p><b>Costos</b>: vendedores = ventas ÷ ventas por vendedor; 1 supervisor cada {p.costos.supervisor_cada_vendedores} vendedores; 1 backoffice cada {p.costos.backoffice_cada_ventas} ventas; operador {formatGs(p.costos.salario_hora)}/h × {p.costos.horas_dia} h × {p.costos.dias_mes} días; comisión {p.costos.comision_vendedores_pct}% de las comisiones facturadas; IPS {p.costos.ips_pct}% y aguinaldo (÷12) sobre todo RRHH; logística {formatGs(p.costos.logistica_central)} Central / {formatGs(p.costos.logistica_interior)} Interior ({p.costos.logistica_interior_pct}% Interior) + premios fijos; {formatGs(p.costos.operativo_por_venta)} operativos por venta. Margen = facturación que queda − costo de la estructura del mes.</p>
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
