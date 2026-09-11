"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { PrintButton, PrintCover } from "@/components/PrintButton";
import { VariablesNegocio } from "@/components/facturacion/VariablesNegocio";
import { Lectura } from "@/components/televentas/Lectura";
import { apiFetch } from "@/lib/api";
import { formatGs, formatInt } from "@/lib/format";

const M = (v: number) => `${Math.round(v / 1e6)}M`;

/** Simulador ANUAL (independiente): el mes 1 fija estructura y objetivo; los meses
 *  2..12 solo cambian las ventas. Balance de 12 meses con todas las cohortes. */
export default function SimuladorAnualPage() {
  const [p, setP] = useState<any>(null);
  const [defaults, setDefaults] = useState<any>(null);
  const [seteado, setSeteado] = useState(false);
  const [horizonte, setHorizonte] = useState<12 | 18>(12);
  const [ventas, setVentas] = useState<number[]>([]);
  const [res, setRes] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<any>(null);

  useEffect(() => {
    apiFetch<any>("/api/v1/facturacion/simulador/parametros").then((d) => {
      setP(d.parametros); setDefaults(d.parametros);
    }).catch((e) => setError(e.message));
  }, []);

  const simular = useCallback((params: any, vpm: number[], h: number) => {
    apiFetch<any>("/api/v1/facturacion/simulador/anual", {
      method: "POST", body: JSON.stringify({ parametros: params, ventas_por_mes: vpm, horizonte: h }),
    }).then((d) => { setRes(d); setError(null); }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!seteado || !p || ventas.length !== horizonte) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => simular(p, ventas, horizonte), 250);
    return () => clearTimeout(timer.current);
  }, [seteado, p, ventas, horizonte, simular]);

  const setear = () => {
    const v1 = Number(p.ventas) || 0;
    setVentas([v1, ...Array(horizonte - 1).fill(v1)]);
    setSeteado(true);
  };
  const cambiarHorizonte = (h: 12 | 18) => {
    setHorizonte(h);
    setVentas((prev) => {
      if (!prev.length) return prev;
      const base = prev[prev.length - 1] ?? prev[0];
      return h > prev.length ? [...prev, ...Array(h - prev.length).fill(base)] : prev.slice(0, h);
    });
  };
  const HorizonteToggle = () => (
    <div className="inline-flex rounded-md border border-brand-border overflow-hidden no-print">
      {([12, 18] as const).map((h) => (
        <button key={h} onClick={() => cambiarHorizonte(h)}
          className={`px-3 py-1.5 text-xs font-bold ${horizonte === h ? "bg-brand-primary text-white" : "text-brand-graphite hover:bg-brand-bg"}`}>
          {h} meses
        </button>
      ))}
    </div>
  );
  const editarMes1 = () => { setSeteado(false); setRes(null); };
  const setVenta = (i: number, v: number) => setVentas((prev) => prev.map((x, j) => (j === i ? v : x)));

  const meses: any[] = res?.meses ?? [];
  const a = res?.anual;
  const hc = res?.headcount;

  return (
    <AppShell>
      <PrintCover titulo={`Simulación de Facturación a ${horizonte} meses`}
        periodo={a ? `${formatInt(a.ventas)} ventas en ${horizonte} meses · ingreso neto ${formatGs(a.ingreso_neto)} · resultado ${formatGs(a.resultado)} (${a.margen_pct}%)${p?.bonos_activos === false ? " · SIN BONOS" : ""} · Televentas Claro` : undefined} />

      <div className="mb-2 text-xs text-brand-slate no-print">
        <Link href="/televentas-claro" className="hover:text-brand-primary">Televentas Claro</Link>
        <span className="mx-2">/</span><span className="text-brand-ink font-semibold">Simulador anual</span>
      </div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-brand-ink uppercase">Simulador Anual</h1>
          <p className="text-sm text-brand-slate mt-1 max-w-3xl">
            Balance a 12 o 18 meses. Seteás el mes 1 (objetivo, tarifas, zafra y estructura); los meses siguientes solo cambian
            las ventas. La estructura fija del mes 1 se mantiene todo el año: lo que varía con las ventas son los bonos,
            las comisiones y la logística. Cada mes liquida su facturación más los ajustes (chargeback, cuota 2, residual)
            de los meses anteriores.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate no-print">Horizonte</span>
          <HorizonteToggle />
          <PrintButton label="Imprimir / Guardar PDF" />
        </div>
      </div>

      {error && <p className="text-sm text-brand-primary mb-4">{error}</p>}
      {!p && !error && <div className="text-brand-slate">Cargando variables de negocio…</div>}

      {/* ===== Paso 1: setear el mes 1 ===== */}
      {p && !seteado && (
        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2">
            <VariablesNegocio p={p} setP={setP} defaults={defaults} titulo="Mes 1 — variables y estructura" />
          </div>
          <div className="lg:col-span-3">
            <section className="card p-6 border-2 border-brand-primary">
              <div className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate mb-1">Paso 1 de 2</div>
              <h2 className="font-display text-2xl text-brand-ink uppercase mb-2">Setear el mes 1</h2>
              <p className="text-sm text-brand-graphite leading-relaxed mb-4">
                Con las ventas del mes 1 (<b>{formatInt(Number(p.ventas) || 0)}</b>) se dimensiona la estructura:
                {" "}<b>{Math.ceil((Number(p.ventas) || 0) / Math.max(Number(p.costos.ventas_por_vendedor) || 1, 1))} vendedores</b>,
                {" "}{Math.ceil(Math.ceil((Number(p.ventas) || 0) / Math.max(Number(p.costos.ventas_por_vendedor) || 1, 1)) / Math.max(Number(p.costos.supervisor_cada_vendedores) || 1, 1))} supervisores,
                {" "}{Math.ceil((Number(p.ventas) || 0) / Math.max(Number(p.costos.backoffice_cada_ventas) || 1, 1))} backoffice, {p.costos.coordinadores} coordinador y {p.costos.controllers} controllers.
                Esa estructura y el objetivo CO de <b>{formatInt(Number(p.objetivo_co) || 0)}</b> quedan fijos para los {horizonte} meses.
              </p>
              <button onClick={setear} disabled={!(Number(p.ventas) > 0)} className="btn-primary !px-6 !py-3 text-base shadow-lg disabled:opacity-50">
                Setear mes 1 y fijar la estructura →
              </button>
              <p className="text-[11px] text-brand-slate mt-3">Después vas a cargar solo las ventas de los meses 2 a {horizonte}. Podés volver a editar el mes 1 cuando quieras.</p>
            </section>
          </div>
        </div>
      )}

      {/* ===== Paso 2: ventas por mes + resultados ===== */}
      {p && seteado && (
        <div className="space-y-6">
          <section className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate">Mes 1 seteado · estructura fija</div>
                <div className="text-sm text-brand-ink mt-1">
                  {hc ? <><b>{hc.vendedores}</b> vendedores · <b>{hc.supervisores}</b> supervisores · <b>{hc.backoffice}</b> backoffice · {hc.coordinadores} coordinador · {hc.controllers} controllers</> : "calculando…"}
                  {" "}· objetivo CO <b>{formatInt(Number(p.objetivo_co))}</b> · {p.costos.ventas_por_vendedor} ventas/vendedor
                  {a ? <> · costo fijo <b>{formatGs(a.costos_fijos_mes)}</b>/mes</> : null}
                  {p.bonos_activos === false ? <span className="ml-2 px-1.5 py-0.5 rounded bg-brand-ink text-white text-[10px] font-bold">SIN BONOS</span> : null}
                </div>
              </div>
              <button onClick={editarMes1} className="no-print text-sm text-brand-graphite border border-brand-border rounded px-3 py-2 hover:border-brand-primary">Editar mes 1</button>
            </div>
            <div className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate mb-2">Ventas efectivas por mes</div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-12 gap-2">
              {ventas.map((v, i) => (
                <label key={i} className={`text-[10px] ${i === 0 ? "text-brand-primary font-bold" : "text-brand-slate"}`}>
                  Mes {i + 1}{i === 0 ? " (seteado)" : ""}
                  <input type="number" step={10} value={v} disabled={i === 0} onChange={(e) => setVenta(i, Number(e.target.value))}
                    className={`input !py-1 !px-1.5 text-sm text-right w-full ${i === 0 ? "bg-brand-bg-soft" : ""}`} />
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-2 no-print">
              <button onClick={() => setVentas((prev) => prev.map((x, i) => (i === 0 ? x : prev[0])))} className="text-[11px] text-brand-primary font-semibold hover:underline">Igualar todos al mes 1</button>
              <button onClick={() => setVentas((prev) => prev.map((x, i) => (i === 0 ? x : Math.round(prev[0] * Math.pow(1.02, i)))))} className="text-[11px] text-brand-primary font-semibold hover:underline">Crecer 2% mensual</button>
              <button onClick={() => setVentas((prev) => prev.map((x, i) => (i === 0 ? x : Math.round(prev[0] * Math.pow(0.98, i)))))} className="text-[11px] text-brand-primary font-semibold hover:underline">Caer 2% mensual</button>
            </div>
          </section>

          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-md border-2 px-4 py-3 ${p.bonos_activos === false ? "border-brand-ink bg-brand-ink text-white" : "border-brand-border bg-white"}`}>
            <div>
              <div className={`text-[10px] uppercase tracking-wider2 font-bold ${p.bonos_activos === false ? "text-white/70" : "text-brand-slate"}`}>Escenario de bonos</div>
              <div className="text-sm font-semibold">
                {p.bonos_activos === false
                  ? `Bonos DESACTIVADOS — los ${horizonte} meses se calculan sin bono productividad ni bono efectividad`
                  : "Bonos activos — cada mes liquida según las escalas de Claro"}
              </div>
            </div>
            <button onClick={() => setP((prev: any) => ({ ...prev, bonos_activos: prev.bonos_activos === false }))}
              className={`no-print px-4 py-2 rounded-md text-sm font-bold transition-colors ${p.bonos_activos === false ? "bg-white text-brand-ink hover:bg-brand-bg" : "bg-brand-primary text-white hover:bg-brand-primary/90"}`}>
              {p.bonos_activos === false ? "Reactivar bonos" : "Simular sin bonos"}
            </button>
          </div>


          <div className="rounded-md border-2 border-brand-primary bg-brand-primary/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider2 font-bold text-brand-primary">Ajuste de comisiones</div>
              <div className="text-sm font-semibold text-brand-ink">
                {Number(p.ajuste_comisiones_pct || 0) === 0
                  ? "Sin ajuste — cuota 1, cuota 2 y plus de portabilidad según tarifa vigente"
                  : `Cuota 1, cuota 2 y plus de portabilidad ${Number(p.ajuste_comisiones_pct) > 0 ? "mejoran" : "bajan"} ${Math.abs(Number(p.ajuste_comisiones_pct))}%`}
              </div>
              <div className="text-[11px] text-brand-slate">Simula una renegociación de comisiones con Claro. No afecta bonos ni residual; las devoluciones por chargeback siguen los montos ajustados.</div>
            </div>
            <label className="flex items-center gap-2 text-sm no-print">
              <span className="text-brand-graphite">Ajuste</span>
              <input type="number" step={0.5} value={p.ajuste_comisiones_pct ?? 0}
                onChange={(e) => setP((prev: any) => ({ ...prev, ajuste_comisiones_pct: Number(e.target.value) }))}
                className="input max-w-[90px] !py-1.5 text-right font-bold text-brand-primary" />
              <span className="text-brand-graphite">%</span>
            </label>
          </div>

          {res && a && (
            <>
              <section className="card p-5 border-l-4 border-brand-ink bg-white">
                <h2 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-bold mb-2">Conclusión del período ({horizonte} meses)</h2>
                <p className="text-[15px] text-brand-ink leading-relaxed font-medium">{res.conclusion}</p>
              </section>

              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <KpiCard label={`Ventas en ${horizonte} meses`} value={formatInt(a.ventas)} hint={`${formatInt(Math.round(a.ventas / horizonte))} por mes`} accent="neutral" />
                <KpiCard label="Facturación bruta" value={formatGs(a.facturacion_bruta)} hint={`suma de los ${horizonte} meses`} accent="primary" />
                <KpiCard label="Ingreso neto liquidado" value={formatGs(a.ingreso_neto)} hint={`ajustes ${formatGs(a.ajustes)}`} accent="cyan" />
                <KpiCard label="Costos del período" value={formatGs(a.costos)} hint={`fijos ${formatGs(a.costos_fijos_mes)}/mes`} accent="orange" />
                <KpiCard label={`Resultado a ${horizonte} meses`} value={formatGs(a.resultado)} hint={`${a.margen_pct}% sobre ingreso neto`} accent={a.resultado >= 0 ? "cyan" : "primary"} />
                <KpiCard label={`Con cola post-${horizonte}`} value={formatGs(a.resultado_con_cola)} hint={`pendiente ${formatGs(a.cola_post_12.total)}`} accent={a.resultado_con_cola >= 0 ? "cyan" : "primary"} />
              </div>

              <div className="grid xl:grid-cols-2 gap-6 print:block">
                <section className="card p-5 print:mb-5">
                  <h2 className="font-display text-lg text-brand-ink uppercase mb-1">Resultado mes a mes</h2>
                  <p className="text-xs text-brand-slate mb-3">Ingreso neto liquidado (con ajustes de cohortes anteriores) vs costos; barras de resultado y línea de acumulado.</p>
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={meses} margin={{ top: 8, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" fontSize={10} tickFormatter={(v: number) => `M${v}`} />
                      <YAxis yAxisId="l" fontSize={10} tickFormatter={M} />
                      <YAxis yAxisId="r" orientation="right" fontSize={10} tickFormatter={M} />
                      <Tooltip formatter={(v: any) => formatGs(Number(v))} labelFormatter={(l) => `Mes ${l}`} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <ReferenceLine yAxisId="l" y={0} stroke="#0F1116" />
                      <Bar yAxisId="l" dataKey="ingreso_neto" name="Ingreso neto" fill="#0EA5E9" fillOpacity={0.6} />
                      <Bar yAxisId="l" dataKey="costo_total" name="Costos" fill="#F39200" fillOpacity={0.6} />
                      <Bar yAxisId="l" dataKey="resultado" name="Resultado">
                        {meses.map((m: any) => <Cell key={m.mes} fill={m.resultado >= 0 ? "#10B981" : "#E6332A"} />)}
                      </Bar>
                      <Line yAxisId="r" dataKey="acumulado" name="Acumulado" stroke="#0F1116" strokeWidth={2.5} dot={{ r: 2.5 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <Lectura>
                    Cada mes liquida la facturación de sus ventas más lo que devuelven o suman las cohortes anteriores. El mes 1
                    no tiene ajustes (todavía no cayó nada); desde el mes 2 llegan los chargebacks y desde el 3 la cuota 2. Por
                    eso el mes 1 suele verse mejor que el resto: el año real es la línea negra de acumulado.
                  </Lectura>
                </section>

                <section className="card p-5">
                  <h2 className="font-display text-lg text-brand-ink uppercase mb-1">Ventas vs estructura fija</h2>
                  <p className="text-xs text-brand-slate mb-3">Ventas de cada mes contra el objetivo CO y la capacidad de la estructura ({hc?.vendedores} vendedores × {p.costos.ventas_por_vendedor}).</p>
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={meses.map((m: any) => ({ ...m, capacidad: (hc?.vendedores ?? 0) * Number(p.costos.ventas_por_vendedor) }))} margin={{ top: 8, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" fontSize={10} tickFormatter={(v: number) => `M${v}`} />
                      <YAxis yAxisId="l" fontSize={10} />
                      <YAxis yAxisId="r" orientation="right" fontSize={10} tickFormatter={(v: number) => `${v}`} />
                      <Tooltip labelFormatter={(l) => `Mes ${l}`} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar yAxisId="l" dataKey="ventas" name="Ventas">
                        {meses.map((m: any) => <Cell key={m.mes} fill={m.monto_bono_productividad > 0 ? "#0EA5E9" : "#E6332A"} />)}
                      </Bar>
                      <ReferenceLine yAxisId="l" y={Number(p.objetivo_co)} stroke="#E6332A" strokeDasharray="6 3" label={{ value: `Objetivo ${formatInt(Number(p.objetivo_co))}`, position: "insideTopRight", fill: "#E6332A", fontSize: 10, fontWeight: 700 }} />
                      <Line yAxisId="l" dataKey="capacidad" name="Capacidad de la estructura" stroke="#0F1116" strokeDasharray="4 3" dot={false} />
                      <Line yAxisId="r" dataKey="ventas_por_vendedor" name="Ventas por vendedor" stroke="#662483" strokeWidth={2} dot={{ r: 2.5 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <Lectura>
                    Barras: ventas del mes (rojas cuando no alcanzan el 90% del objetivo y el bono productividad se pierde). La línea
                    punteada negra es lo que la estructura fija puede vender; la violeta, las ventas reales por vendedor. Un mes
                    por debajo de la capacidad paga la misma estructura con menos ingresos.
                  </Lectura>
                </section>
              </div>

              {/* ===== EERR anual ===== */}
              <section className="card overflow-x-auto">
                <div className="px-4 pt-4">
                  <h2 className="font-display text-xl text-brand-ink uppercase">Estado de resultados a {horizonte} meses (EERR)</h2>
                  <p className="text-xs text-brand-slate mb-2">Liquidación mes a mes con estructura fija del mes 1. Cada columna es un mes calendario; la última, el total del período.</p>
                </div>
                <table className="w-full text-[11px]" style={{ minWidth: `${300 + meses.length * 74}px` }}>
                  <thead className="border-b border-brand-border">
                    <tr className="text-[9px] uppercase tracking-wider2 text-brand-slate">
                      <th className="px-3 py-2 text-left sticky left-0 bg-white">Concepto</th>
                      {meses.map((m: any) => <th key={m.mes} className="px-2 py-2 text-right">M{m.mes}</th>)}
                      <th className="px-3 py-2 text-right bg-brand-primary/5 text-brand-primary">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ["Ventas", "ventas", "int", "head"],
                      ["INGRESOS DEL MES", null, null, "sep"],
                      ["Activaciones (cuota 1)", "activaciones_cuota1", "gs", "row"],
                      ["Plus portabilidad", "portabilidad", "gs", "row"],
                      ["Bono productividad", "bono_productividad", "gs", "row"],
                      ["Bono efectividad", "bono_efectividad", "gs", "row"],
                      ["Facturación bruta", "facturacion_bruta", "gs", "sub"],
                      ["AJUSTES DE COHORTES ANTERIORES", null, null, "sep"],
                      ["+ Residual", "residual", "gs", "row"],
                      ["+ Cuota 2", "cuota2", "gs", "row"],
                      ["− Legajos", "legajos", "gs", "row"],
                      ["− Devoluciones por caídas", "clawbacks", "gs", "row"],
                      ["− Devolución bono efectividad", "clawback_bonos", "gs", "row"],
                      ["− Recálculo bono productividad", "recalculo_productividad", "gs", "row"],
                      ["INGRESO NETO LIQUIDADO", "ingreso_neto", "gs", "total"],
                      ["COSTOS", null, null, "sep"],
                      ["Estructura fija (salarios, cargas, premios logística)", "_fijo", "gs", "row"],
                      ["Comisiones de vendedores", "_comisiones", "gs", "row"],
                      ["Logística de entregas", "_logistica", "gs", "row"],
                      ["Operativos", "_operativos", "gs", "row"],
                      ["TOTAL COSTOS", "costo_total", "gs", "sub"],
                      ["RESULTADO", "resultado", "gs", "total"],
                      ["Margen %", "margen_pct", "pct", "pct"],
                      ["Acumulado", "acumulado", "gs", "pct"],
                    ] as Array<[string, string | null, string | null, string]>).map(([label, key, fmt, tipo]) => {
                      const val = (m: any): number => {
                        if (!key) return 0;
                        if (key === "_fijo") return m.costo_total - m.costos.rrhh.operadores_comisiones * (1 + Number(p.costos.ips_pct) / 100) * (p.costos.aguinaldo ? 13 / 12 : 1) - m.costos.logistica_entregas - m.costos.operativos;
                        if (key === "_comisiones") return m.costos.rrhh.operadores_comisiones * (1 + Number(p.costos.ips_pct) / 100) * (p.costos.aguinaldo ? 13 / 12 : 1);
                        if (key === "_logistica") return m.costos.logistica_entregas;
                        if (key === "_operativos") return m.costos.operativos;
                        return Number(m[key] ?? 0);
                      };
                      const anualVal = key === "margen_pct" ? a.margen_pct : key === "acumulado" ? a.resultado : meses.reduce((s: number, m: any) => s + val(m), 0);
                      const cls = tipo === "sep" ? "bg-brand-bg text-[9px] uppercase tracking-wider2 text-brand-slate font-bold"
                        : tipo === "sub" ? "bg-brand-bg-soft font-semibold border-t border-brand-border"
                        : tipo === "total" ? "bg-brand-ink text-white font-bold"
                        : tipo === "pct" ? "text-brand-graphite italic" : tipo === "head" ? "font-semibold" : "";
                      const f = (v: number) => fmt === "int" ? formatInt(v) : fmt === "pct" ? `${Math.round(v * 10) / 10}%` : formatGs(v);
                      return (
                        <tr key={label} className={cls}>
                          <td className={`px-3 py-1 sticky left-0 ${tipo === "total" ? "bg-brand-ink" : tipo === "sub" ? "bg-brand-bg-soft" : tipo === "sep" ? "bg-brand-bg" : "bg-white"} ${tipo === "row" ? "pl-6" : ""}`}>{label}</td>
                          {meses.map((m: any) => (
                            <td key={m.mes} className={`px-2 py-1 text-right font-mono whitespace-nowrap ${tipo !== "total" && tipo !== "sep" && val(m) < 0 ? "text-brand-primary" : ""}`}>
                              {tipo === "sep" ? "" : f(key === "margen_pct" ? m.margen_pct : val(m))}
                            </td>
                          ))}
                          <td className={`px-3 py-1 text-right font-mono whitespace-nowrap ${tipo !== "total" ? "bg-brand-primary/5" : ""} ${tipo !== "total" && tipo !== "sep" && anualVal < 0 ? "text-brand-primary" : ""}`}>
                            {tipo === "sep" ? "" : f(anualVal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="px-4 py-3">
                  <Lectura>
                    Leé cada columna como la liquidación de ese mes: lo que facturan las ventas del mes, más lo que las cohortes
                    anteriores devuelven (chargeback) o suman (cuota 2, residual), menos los costos — los fijos no cambian, los
                    variables siguen a las ventas. La columna "Total" es el balance del período; la cola posterior (residual por
                    cobrar y devoluciones pendientes de las últimas cohortes) se informa aparte en los KPIs.
                  </Lectura>
                </div>
              </section>

              {/* Bonos por mes */}
              <section className="card overflow-x-auto">
                <div className="px-4 pt-4">
                  <h2 className="font-display text-lg text-brand-ink uppercase">Bonos mes a mes</h2>
                  <p className="text-xs text-brand-slate mb-2">Cumplimiento del objetivo CO ({formatInt(Number(p.objetivo_co))}) y escalón alcanzado cada mes. Bonos del período: {formatGs(a.bonos)} · devueltos {formatGs(Math.abs(a.devolucion_bonos))}.</p>
                </div>
                <table className="w-full text-xs min-w-[720px]">
                  <thead className="bg-brand-bg text-[10px] uppercase tracking-wider2 text-brand-slate">
                    <tr><th className="px-3 py-1.5 text-left">Mes</th><th className="px-3 py-1.5 text-right">Ventas</th><th className="px-3 py-1.5 text-right">Cumplimiento</th><th className="px-3 py-1.5 text-center">Escalón</th><th className="px-3 py-1.5 text-right">Bono/línea</th><th className="px-3 py-1.5 text-right">Bono productividad</th><th className="px-3 py-1.5 text-right">Bono efectividad</th></tr>
                  </thead>
                  <tbody>
                    {meses.map((m: any) => (
                      <tr key={m.mes} className="border-t border-brand-border">
                        <td className="px-3 py-1 font-medium">Mes {m.mes}</td>
                        <td className="px-3 py-1 text-right">{formatInt(m.ventas)}</td>
                        <td className="px-3 py-1 text-right font-mono">{m.cumplimiento_pct}%</td>
                        <td className="px-3 py-1 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${m.escalon_productividad ? "bg-emerald-100 text-emerald-700" : "bg-brand-primary/10 text-brand-primary"}`}>
                            {m.escalon_productividad ? `≥ ${m.escalon_productividad}%` : "sin bono"}
                          </span>
                        </td>
                        <td className="px-3 py-1 text-right font-mono">{formatGs(m.monto_bono_productividad)}</td>
                        <td className="px-3 py-1 text-right font-mono">{formatGs(m.bono_productividad)}</td>
                        <td className="px-3 py-1 text-right font-mono">{formatGs(m.bono_efectividad)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}
