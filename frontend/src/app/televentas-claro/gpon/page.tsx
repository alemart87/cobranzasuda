"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Area, Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { PrintButton, PrintCover } from "@/components/PrintButton";
import { Bloque } from "@/components/facturacion/Bloque";
import { EstructuraOperativa } from "@/components/facturacion/EstructuraOperativa";
import { NumeroInput } from "@/components/facturacion/NumeroInput";
import { dominiosAlineados } from "@/components/facturacion/ejes";
import { Lectura } from "@/components/televentas/Lectura";
import { apiFetch } from "@/lib/api";
import { formatGs, formatInt } from "@/lib/format";

/** Negocio GPON (fibra + TV): cohorte del mes 1 + proyección anual multicohorte, con motor propio
 *  calibrado con las liquidaciones GPON 385–389. Misma lógica de anualidad que pospago. */

const M = (v: number) => `${Math.round(v / 1e6)}M`;

function Campo({ label, hint, value, onChange, step = 1, suffix }: { label: string; hint?: string; value: number; onChange: (v: number) => void; step?: number; suffix?: string }) {
  return (
    <label className="flex items-center gap-3">
      <span className="flex-1"><span className="block text-sm text-brand-ink">{label}</span>{hint && <span className="block text-[10px] text-brand-slate">{hint}</span>}</span>
      <span className="flex items-center gap-1"><NumeroInput step={step} value={value} onChange={onChange} className="input max-w-[120px] !py-1 text-sm text-right" />{suffix && <span className="text-xs text-brand-slate w-4">{suffix}</span>}</span>
    </label>
  );
}

function Grupo({ titulo, hint, abierto = false, children }: { titulo: string; hint?: string; abierto?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(abierto);
  return (
    <div className="rounded-md border border-brand-border bg-white">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-2.5 text-left">
        <span className="text-[11px] uppercase tracking-wider2 font-bold text-brand-ink">{titulo}{hint && <span className="ml-2 normal-case tracking-normal font-normal text-brand-slate">· {hint}</span>}</span>
        <span className="text-brand-slate text-xs">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="px-4 pb-4 space-y-2">{children}</div>}
    </div>
  );
}

export default function GponPage() {
  const [p, setP] = useState<any>(null);
  const [defaults, setDefaults] = useState<any>(null);
  const [res, setRes] = useState<any>(null);
  const [horizonte, setHorizonte] = useState<12 | 18 | 24>(12);
  const [ventas, setVentas] = useState<number[]>([]);
  const [nombres, setNombres] = useState<string[]>([]);
  const [anual, setAnual] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<any>(null);
  const set = (k: string, v: any) => setP((prev: any) => ({ ...prev, [k]: v }));
  const setC = (k: string, v: any) => setP((prev: any) => ({ ...prev, costos: { ...prev.costos, [k]: v } }));
  const setPlan = (i: number, k: string, v: any) => setP((prev: any) => ({ ...prev, planes: prev.planes.map((pl: any, j: number) => (j === i ? { ...pl, [k]: v } : pl)) }));
  const setEscala = (i: number, k: string, v: number) => setP((prev: any) => ({ ...prev, escala_bono: prev.escala_bono.map((e: any, j: number) => (j === i ? { ...e, [k]: v } : e)) }));
  const setCurva = (i: number, v: number) => setP((prev: any) => ({ ...prev, mora_curva_pct: prev.mora_curva_pct.map((x: number, j: number) => (j === i ? v : x)) }));
  const nombreMes = (i: number) => (nombres[i] || "").trim() || `Mes ${i + 1}`;

  useEffect(() => {
    apiFetch<any>("/api/v1/facturacion/gpon/parametros").then((d) => {
      setP(d.parametros); setDefaults(d.parametros);
      const v = Number(d.parametros.ventas) || 0;
      setVentas(Array(12).fill(v)); setNombres(Array(12).fill(""));
    }).catch((e) => setError(e.message));
  }, []);

  const simular = useCallback((params: any, vpm: number[], h: number, nm: string[]) => {
    Promise.all([
      apiFetch<any>("/api/v1/facturacion/gpon/simulador", { method: "POST", body: JSON.stringify({ parametros: params }) }),
      apiFetch<any>("/api/v1/facturacion/gpon/anual", { method: "POST", body: JSON.stringify({ parametros: params, ventas_por_mes: vpm, horizonte: h, nombres_meses: nm }) }),
    ]).then(([r, a]) => { setRes(r); setAnual(a); setError(null); }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!p || ventas.length !== horizonte) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => simular(p, ventas, horizonte, nombres), 250);
    return () => clearTimeout(timer.current);
  }, [p, ventas, horizonte, nombres, simular]);

  const cambiarHorizonte = (h: 12 | 18 | 24) => {
    setHorizonte(h);
    setVentas((prev) => { const base = prev[prev.length - 1] ?? Number(p?.ventas) ?? 0; return h > prev.length ? [...prev, ...Array(h - prev.length).fill(base)] : prev.slice(0, h); });
    setNombres((prev) => Array.from({ length: h }, (_, i) => prev[i] ?? ""));
  };
  // Las ventas del mes 1 salen del parámetro "ventas": mantenerlas sincronizadas.
  useEffect(() => { if (p) setVentas((prev) => prev.map((x, i) => (i === 0 ? Number(p.ventas) || 0 : x))); }, [p?.ventas]);  // eslint-disable-line react-hooks/exhaustive-deps

  const meses: any[] = anual?.meses ?? [];
  const a = anual?.anual;
  const ejes = dominiosAlineados(meses.flatMap((x: any) => [x.ingreso_neto, x.costo_total, x.resultado, x.ola_devoluciones]), meses.map((x: any) => x.margen_pct));
  const d = res?.derivados, pl = res?.por_linea;
  const mixTotal = p ? p.planes.reduce((s: number, x: any) => s + Number(x.mix_pct || 0), 0) : 0;

  return (
    <AppShell>
      <PrintCover titulo="Negocio GPON · Proyección" periodo={anual ? `${horizonte} meses · ${formatInt(a.ventas)} activaciones` : undefined} />
      <div className="mb-2 text-xs text-brand-slate no-print">
        <Link href="/televentas-claro" className="hover:text-brand-primary">Televentas Claro</Link><span className="mx-2">/</span><span className="text-brand-ink font-semibold">GPON</span>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="font-display text-3xl text-brand-ink uppercase">Negocio GPON · fibra y TV</h1>
          <p className="text-sm text-brand-slate mt-1 max-w-3xl">Motor propio calibrado con las liquidaciones GPON 385 a 389 (enero a mayo 2026, 1.100 activaciones). Cuota 1 al activar, cuota 2 al mes 2, bono fijo por objetivo, legajos, mora neta de reversos y recálculo al día 180. Sin residual ni portabilidad.</p>
        </div>
        <PrintButton />
      </div>
      {error && <div className="card p-3 mb-4 text-sm text-brand-primary">{error}</div>}
      {!p && !error && <div className="card p-6 text-sm text-brand-slate">Cargando…</div>}

      {p && (
        <div className="grid xl:grid-cols-[380px_1fr] gap-6">
          {/* ===== Variables ===== */}
          <section className="space-y-2 no-print">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="font-display text-xl text-brand-ink uppercase">Variables GPON</h2>
              {defaults && <button onClick={() => setP(defaults)} className="text-[11px] text-brand-primary font-semibold hover:underline">Restaurar valores reales</button>}
            </div>
            <Grupo titulo="Activaciones y objetivo" abierto>
              <Campo label="Activaciones del mes 1" hint="real ene–may: 188 a 239" value={p.ventas} onChange={(v) => set("ventas", v)} step={5} />
              <Campo label="Objetivo de líneas (bono fijo)" hint="% cumplimiento = activaciones ÷ objetivo" value={p.objetivo} onChange={(v) => set("objetivo", v)} step={5} />
              <Campo label="Activaciones que cobran el bono" hint="real 91% (218 de 239)" value={p.pct_bono_cobrado} onChange={(v) => set("pct_bono_cobrado", v)} suffix="%" />
              <Campo label="Bono adicional (a mano)" hint="Gs del mes 1; no se devuelve" value={p.bono_adicional} onChange={(v) => set("bono_adicional", v)} step={1000000} />
            </Grupo>
            <Grupo titulo="Planes, cuotas y mezcla" hint={`mix ${Math.round(mixTotal)}%`}>
              {p.planes.map((pl: any, i: number) => (
                <div key={i} className="rounded-md border border-brand-border p-2 space-y-1">
                  <input value={pl.nombre} onChange={(e) => setPlan(i, "nombre", e.target.value)} className="input !py-0.5 text-sm w-full" />
                  <div className="grid grid-cols-4 gap-1 text-[10px] text-brand-slate">
                    <label>Cuota 1<NumeroInput step={5000} value={Number(pl.cuota1)} onChange={(n) => setPlan(i, "cuota1", n)} className="input !py-0.5 !px-1 text-[11px] text-right w-full" /></label>
                    <label>Cuota 2<NumeroInput step={5000} value={Number(pl.cuota2)} onChange={(n) => setPlan(i, "cuota2", n)} className="input !py-0.5 !px-1 text-[11px] text-right w-full" /></label>
                    <label>Penalidad mora<NumeroInput step={5000} value={Number(pl.penalidad_mora)} onChange={(n) => setPlan(i, "penalidad_mora", n)} className="input !py-0.5 !px-1 text-[11px] text-right w-full" /></label>
                    <label>Mix %<NumeroInput step={1} value={Number(pl.mix_pct)} onChange={(n) => setPlan(i, "mix_pct", n)} className="input !py-0.5 !px-1 text-[11px] text-right w-full" /></label>
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-brand-slate">Real: Fibra 60 70% · Fibra 30 18% · TV 12%. Penalidad de mora por plan: promedio de lo que Claro descuenta y no revierte (630.000 / 350.000 / 315.000 en Fibra 60).</p>
            </Grupo>
            <Grupo titulo="Cuota 2 y legajos">
              <Campo label="Mes de la cuota 2" hint="día 59–91, mediana 73 → liquidación del mes 2" value={p.cuota2_mes} onChange={(v) => set("cuota2_mes", v)} />
              <Campo label="Líneas que cobran cuota 2" hint="real 86–97% por cohorte" value={p.cuota2_pct_lineas} onChange={(v) => set("cuota2_pct_lineas", v)} suffix="%" />
              <Campo label="De esas, con importe completo" hint="el resto cobra la mitad (legajo incompleto)" value={p.cuota2_pct_completa} onChange={(v) => set("cuota2_pct_completa", v)} suffix="%" />
              <Campo label="Líneas con documentación faltante" hint="mes 1 · real 11%" value={p.legajo_pct} onChange={(v) => set("legajo_pct", v)} suffix="%" />
              <Campo label="Descuento por legajo (% de la cuota 1)" hint="real 200.000 sobre 400.000" value={p.legajo_pct_cuota1} onChange={(v) => set("legajo_pct_cuota1", v)} suffix="%" />
            </Grupo>
            <Grupo titulo="Bono fijo y recálculo" hint="escala vigente">
              {p.escala_bono.map((e: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-brand-slate w-8">≥</span>
                  <NumeroInput value={Number(e.desde_pct)} onChange={(n) => setEscala(i, "desde_pct", n)} className="input !py-0.5 text-sm text-right w-20" /><span className="text-xs">%</span>
                  <span className="text-brand-slate">→</span>
                  <NumeroInput step={1000} value={Number(e.monto)} onChange={(n) => setEscala(i, "monto", n)} className="input !py-0.5 text-sm text-right w-28" /><span className="text-xs">Gs/línea</span>
                </div>
              ))}
              <p className="text-[10px] text-brand-slate">Historial ene–may 2026 con la tabla anterior: 100.000 (ene, mar), 50.000 (abr), 0 (feb, may).</p>
              <Campo label="Mes del recálculo" hint="día 150–180" value={p.recalculo_mes} onChange={(v) => set("recalculo_mes", v)} />
              <Campo label="Líneas castigadas en el recálculo" hint="devuelven el 100% del bono · real 23–26%" value={p.pct_recalculo} onChange={(v) => set("pct_recalculo", v)} suffix="%" />
              <button onClick={() => set("bonos_activos", p.bonos_activos === false)} className={`px-3 py-1.5 rounded-md text-xs font-bold ${p.bonos_activos === false ? "bg-brand-ink text-white" : "border border-brand-border text-brand-graphite"}`}>{p.bonos_activos === false ? "Bonos desactivados · reactivar" : "Simular sin bonos"}</button>
            </Grupo>
            <Grupo titulo="Mora (penalización por deuda neta)" hint="el riesgo principal de GPON">
              <Campo label="Líneas que quedan en mora" hint="deuda no revertida a los 6 meses · real 26% de la cohorte" value={p.mora_pct_lineas} onChange={(v) => set("mora_pct_lineas", v)} suffix="%" />
              <Campo label="% de la penalidad que se pierde" hint="100 = tabla completa por plan" value={p.mora_penalidad_pct} onChange={(v) => set("mora_penalidad_pct", v)} suffix="%" />
              <div className="text-[10px] text-brand-slate">Curva acumulada de la mora por mes (% del total final). Real: primera penalización p25 día 65, mediana 93, p75 132, máximo 180.</div>
              <div className="grid grid-cols-7 gap-1">
                {p.mora_curva_pct.map((x: number, i: number) => (
                  <label key={i} className="text-[10px] text-brand-slate">M{i}<NumeroInput step={1} value={Number(x)} onChange={(n) => setCurva(i, n)} className="input !py-0.5 !px-1 text-[11px] text-right w-full" /></label>
                ))}
              </div>
              <Campo label="Chargeback (meses)" hint="180 días exactos" value={p.chargeback_meses} onChange={(v) => set("chargeback_meses", v)} />
              <Campo label="Otros reversos" hint="reversos de activación y cancelaciones · % de la cuota 1" value={p.otros_pct} onChange={(v) => set("otros_pct", v)} step={0.1} suffix="%" />
              <Campo label="Ajuste de comisiones negociado" hint="sobre cuota 1 y 2; + mejora" value={p.ajuste_comisiones_pct} onChange={(v) => set("ajuste_comisiones_pct", v)} step={0.5} suffix="%" />
            </Grupo>
            <Grupo titulo="Costos de estructura" hint="mismas reglas que pospago">
              <Campo label="Ventas por vendedor" value={p.costos.ventas_por_vendedor} onChange={(v) => setC("ventas_por_vendedor", v)} />
              <Campo label="Supervisor cada N vendedores" value={p.costos.supervisor_cada_vendedores} onChange={(v) => setC("supervisor_cada_vendedores", v)} />
              <Campo label="Backoffice cada N ventas" value={p.costos.backoffice_cada_ventas} onChange={(v) => setC("backoffice_cada_ventas", v)} />
              <Campo label="Coordinadores" value={p.costos.coordinadores} onChange={(v) => setC("coordinadores", v)} />
              <Campo label="Controllers" value={p.costos.controllers} onChange={(v) => setC("controllers", v)} />
              <Campo label="Comisión por venta (con IPS y aguinaldo)" value={p.costos.comision_por_venta} onChange={(v) => setC("comision_por_venta", v)} step={1000} />
              <Campo label="Plus por venta (sin cargas)" value={p.costos.plus_por_venta} onChange={(v) => setC("plus_por_venta", v)} step={1000} />
              <Campo label="Salario por hora" value={p.costos.salario_hora} onChange={(v) => setC("salario_hora", v)} step={100} />
              <Campo label="Supervisor salario" value={p.costos.supervisor_salario} onChange={(v) => setC("supervisor_salario", v)} step={100000} />
              <Campo label="Supervisor premio" value={p.costos.supervisor_premio} onChange={(v) => setC("supervisor_premio", v)} step={100000} />
              <Campo label="Backoffice salario" value={p.costos.backoffice_salario} onChange={(v) => setC("backoffice_salario", v)} step={100000} />
              <Campo label="Controller salario + premio" value={p.costos.controller_salario} onChange={(v) => setC("controller_salario", v)} step={100000} />
              <Campo label="SubGerencia Comercial (salario)" value={p.costos.subgerencia_salario} onChange={(v) => setC("subgerencia_salario", v)} step={500000} />
              <Campo label="Operativos por venta" value={p.costos.operativo_por_venta} onChange={(v) => setC("operativo_por_venta", v)} step={500} />
              <Campo label="Logística por venta (Central)" hint="GPON: la instalación la hace Claro · 0 por defecto" value={p.costos.logistica_central} onChange={(v) => setC("logistica_central", v)} step={5000} />
              <Campo label="IPS %" value={p.costos.ips_pct} onChange={(v) => setC("ips_pct", v)} step={0.5} suffix="%" />
            </Grupo>
          </section>

          {/* ===== Resultados ===== */}
          <div className="space-y-6">
            {res && d && (
              <>
                <section className="card p-5">
                  <h2 className="font-display text-xl text-brand-ink uppercase mb-1">Cohorte del mes 1 · {formatInt(d.activaciones)} activaciones</h2>
                  <p className="text-xs text-brand-slate mb-3">Cumplimiento {d.cumplimiento_pct}% del objetivo → bono {formatGs(d.monto_bono)} por línea{d.escalon_bono ? ` (escalón ≥${d.escalon_bono}%)` : " (bajo el mínimo: 0)"}.</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                    <KpiCard label="Facturado mes 1" value={formatGs(res.bruto_mes0)} hint={`cuota 1 ${formatGs(res.mes0.activaciones_cuota1)} + bono ${formatGs(res.mes0.bono_fijo)}`} accent="primary" />
                    <KpiCard label="Queda a 6 meses" value={formatGs(res.neto_6)} hint={`${res.pct_retenido_6}% de lo facturado`} accent="cyan" />
                    <KpiCard label="Queda a 12 meses" value={formatGs(res.neto_12)} hint="sin residual: igual que a 6 meses" accent="cyan" />
                    <KpiCard label="Costo de la estructura" value={formatGs(res.costos.total)} hint={`${res.costos.headcount.total} personas · ${formatGs(res.costos.costo_por_venta)} por línea`} accent="orange" />
                    <KpiCard label="Margen real (12 m)" value={formatGs(res.margen.meses12)} hint={`${res.margen.pct_12}% sobre lo que queda`} accent={res.margen.meses12 >= 0 ? "cyan" : "danger"} />
                    <KpiCard label="Por línea de por vida" value={formatGs(pl.neto_12)} hint={`${pl.multiplo_cuota1}× la cuota 1 · margen ${formatGs(pl.margen)}`} accent="purple" />
                  </div>
                  <div className="overflow-x-auto mt-4">
                    <table className="w-full text-sm min-w-[560px]">
                      <thead className="bg-brand-bg border-b border-brand-border"><tr className="text-[10px] uppercase tracking-wider2 text-brand-slate"><th className="px-3 py-2 text-left">Por línea (de por vida)</th><th className="px-3 py-2 text-right">Gs</th><th className="px-3 py-2 text-left">Criterio</th></tr></thead>
                      <tbody>
                        {([
                          ["+ Cuota 1", pl.cuota1, "al activar, ponderada por mezcla de planes"],
                          ["+ Cuota 2 esperada", pl.cuota2_esperada, `mes ${p.cuota2_mes} · ${p.cuota2_pct_lineas}% de las líneas, ${p.cuota2_pct_completa}% completa`],
                          ["+ Bono fijo", pl.bono, `${formatGs(d.monto_bono)} × ${p.pct_bono_cobrado}% de las activaciones`],
                          ["− Legajos", pl.legajos, `${p.legajo_pct}% de las líneas × ${p.legajo_pct_cuota1}% de la cuota 1`],
                          ["− Mora neta", pl.mora, `${p.mora_pct_lineas}% de las líneas × penalidad ponderada ${formatGs(d.penalidad_ponderada)}`],
                          ["− Recálculo del bono", pl.recalculo, `${p.pct_recalculo}% de las líneas devuelven el bono en el mes ${p.recalculo_mes}`],
                          ["= Queda por línea", pl.neto_12, `${pl.multiplo_cuota1}× la cuota 1`],
                          ["− Costo por línea", -pl.costo, "estructura del mes ÷ activaciones"],
                          ["= Margen por línea", pl.margen, ""],
                        ] as Array<[string, number, string]>).map(([l, v, c]) => (
                          <tr key={l} className={`border-t border-brand-border ${l.startsWith("=") ? "font-bold bg-brand-bg-soft" : ""}`}><td className="px-3 py-1.5">{l}</td><td className={`px-3 py-1.5 text-right font-mono ${v < 0 ? "text-brand-primary" : ""}`}>{formatGs(v)}</td><td className="px-3 py-1.5 text-[11px] text-brand-slate">{c}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ResponsiveContainer width="100%" height={220} className="mt-4">
                    <ComposedChart data={res.meses} margin={{ top: 8, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" fontSize={10} tickFormatter={(v) => `M${v}`} />
                      <YAxis fontSize={10} tickFormatter={M} />
                      <Tooltip formatter={(v: any) => formatGs(Number(v))} labelFormatter={(l) => `Mes ${l}`} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <ReferenceLine y={0} stroke="#0F1116" />
                      <Bar dataKey="cuota2" name="Cuota 2" stackId="f" fill="#10B981" />
                      <Bar dataKey="legajos" name="Legajos" stackId="f" fill="#94a3b8" />
                      <Bar dataKey="mora" name="Mora neta" stackId="f" fill="#E6332A" />
                      <Bar dataKey="recalculo" name="Recálculo bono" stackId="f" fill="#F39200" />
                      <Line dataKey="acumulado" name="Acumulado de la cohorte" stroke="#0F1116" strokeWidth={2} dot={{ r: 2 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <Lectura>El mes 0 factura cuota 1 y bono. En el mes {p.cuota2_mes} entra la cuota 2 (verde). La mora (rojo) se va descontando entre los meses 1 y 6 según la curva; en el mes {p.recalculo_mes} Claro recalcula el bono. Después del mes 6 no hay más movimientos: GPON no tiene residual.</Lectura>
                </section>
              </>
            )}

            {/* ===== Proyección anual ===== */}
            {anual && a && (
              <>
                <section className="card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <h2 className="font-display text-xl text-brand-ink uppercase">Proyección · {horizonte} meses</h2>
                    <div className="inline-flex rounded-md border border-brand-border overflow-hidden no-print">
                      {([12, 18, 24] as const).map((h) => <button key={h} onClick={() => cambiarHorizonte(h)} className={`px-3 py-1.5 text-xs font-bold ${horizonte === h ? "bg-brand-primary text-white" : "text-brand-graphite hover:bg-brand-bg"}`}>{h} meses</button>)}
                    </div>
                  </div>
                  <div className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate mb-2">Activaciones por mes · el mes 1 fija la estructura ({anual.headcount.vendedores} vendedores, {anual.headcount.total} personas)</div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-12 gap-2">
                    {ventas.map((v, i) => (
                      <label key={i} className={`text-[10px] ${i === 0 ? "text-brand-primary font-bold" : "text-brand-slate"}`}>
                        <input value={nombres[i] ?? ""} placeholder={`Mes ${i + 1}`} onChange={(e) => setNombres((prev) => prev.map((x, j) => (j === i ? e.target.value.slice(0, 40) : x)))} className="no-print w-full bg-transparent border-b border-dashed border-brand-border focus:border-brand-primary outline-none text-[10px] font-semibold placeholder:text-brand-slate/70" />
                        <span className="print-only">{nombreMes(i)}</span>
                        <NumeroInput step={5} min={0} value={v} disabled={i === 0} onChange={(n) => setVentas((prev) => prev.map((x, j) => (j === i ? n : x)))} className={`input !py-1 !px-1.5 text-sm text-right w-full ${i === 0 ? "bg-brand-bg-soft" : ""}`} />
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-2 no-print text-[11px]">
                    <button onClick={() => setVentas((prev) => prev.map((x, i) => (i === 0 ? x : prev[0])))} className="text-brand-primary font-semibold hover:underline">Igualar todos al mes 1</button>
                    <button onClick={() => setVentas((prev) => prev.map((x, i) => (i === 0 ? x : Math.round(prev[0] * Math.pow(1.02, i)))))} className="text-brand-primary font-semibold hover:underline">Crecer 2% mensual</button>
                    <button onClick={() => setVentas((prev) => prev.map((x, i) => (i === 0 ? x : Math.round(prev[0] * Math.pow(0.98, i)))))} className="text-brand-primary font-semibold hover:underline">Caer 2% mensual</button>
                  </div>
                </section>

                <div className="rounded-md border-l-4 border-brand-ink bg-brand-bg-soft px-4 py-3">
                  <h3 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-bold mb-1">Conclusión del período</h3>
                  <p className="text-[15px] text-brand-ink leading-relaxed font-medium">{anual.conclusion}</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                  <KpiCard label={`Activaciones en ${horizonte} meses`} value={formatInt(a.ventas)} hint={`${formatInt(Math.round(a.ventas / horizonte))} por mes`} accent="neutral" />
                  <KpiCard label="Facturación bruta" value={formatGs(a.facturacion_bruta)} hint={`bonos ${formatGs(a.bonos)}`} accent="primary" />
                  <KpiCard label="Ingreso neto liquidado" value={formatGs(a.ingreso_neto)} hint={`ajustes ${formatGs(a.ajustes)}`} accent="cyan" />
                  <KpiCard label="Costos" value={formatGs(a.costos)} hint={`fijos ${formatGs(a.costos_fijos_mes)}/mes`} accent="orange" />
                  <KpiCard label={`Resultado a ${horizonte} meses`} value={formatGs(a.resultado)} hint={`${a.margen_pct}% · régimen ${formatGs(a.regimen.resultado_mes)}/mes (${a.regimen.margen_pct}%)`} accent={a.resultado >= 0 ? "cyan" : "danger"} />
                  <KpiCard label="Con la cola" value={formatGs(a.resultado_con_cola)} hint={`por cobrar ${formatGs(a.cola_post.cobros)} · por devolver ${formatGs(a.cola_post.devoluciones)}`} accent={a.resultado_con_cola >= 0 ? "cyan" : "danger"} />
                </div>

                <section className="card p-5">
                  <h2 className="font-display text-lg text-brand-ink uppercase mb-1">Resultado mes a mes</h2>
                  <p className="text-xs text-brand-slate mb-3">Ingreso neto (con cuota 2, legajos, mora y recálculo de las cohortes anteriores) vs costos; barras de resultado y línea de margen del mes. El área roja es la ola de devoluciones heredadas.</p>
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={meses} margin={{ top: 8, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" fontSize={10} tickFormatter={(v: number) => nombreMes(v - 1).length > 8 ? nombreMes(v - 1).slice(0, 7) + "…" : nombreMes(v - 1)} />
                      <YAxis yAxisId="l" fontSize={10} tickFormatter={M} domain={ejes.izq} allowDataOverflow />
                      <YAxis yAxisId="r" orientation="right" fontSize={10} tickFormatter={(v: number) => `${Math.round(v)}%`} domain={ejes.der} ticks={ejes.ticksDer} allowDataOverflow />
                      <Tooltip formatter={(v: any, name: any) => (name === "Margen del mes" ? `${Number(v).toFixed(1)}%` : formatGs(Number(v)))} labelFormatter={(l) => nombreMes(Number(l) - 1)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <ReferenceLine yAxisId="l" y={0} stroke="#0F1116" />
                      <Bar yAxisId="l" dataKey="ingreso_neto" name="Ingreso neto" fill="#0EA5E9" fillOpacity={0.6} />
                      <Bar yAxisId="l" dataKey="costo_total" name="Costos" fill="#F39200" fillOpacity={0.6} />
                      <Area yAxisId="l" dataKey="ola_devoluciones" name="Ola de devoluciones heredadas" stroke="#E6332A" fill="#E6332A" fillOpacity={0.28} type="monotone" />
                      <Bar yAxisId="l" dataKey="resultado" name="Resultado">{meses.map((m: any) => <Cell key={m.mes} fill={m.resultado >= 0 ? "#10B981" : "#E6332A"} />)}</Bar>
                      <Line yAxisId="r" dataKey="margen_pct" name="Margen del mes" stroke="#0F1116" strokeWidth={2.5} dot={{ r: 2.5 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <Lectura>Los meses 1 y 2 no heredan ajustes. En el mes {Number(p.cuota2_mes) + 1} entra la cuota 2 de la primera cohorte y el resultado sube; desde el mes {Number(p.recalculo_mes) + 1} la ola de mora y recálculo está completa y el negocio queda en régimen: ese margen es el real.</Lectura>
                </section>

                <Bloque titulo={`Estado de resultados a ${horizonte} meses (EERR)`} abierto envuelto={false} hint="liquidación mes a mes · estructura fija del mes 1">
                  <div className="card overflow-x-auto">
                    <table className="w-full text-xs min-w-[900px]">
                      <thead className="bg-brand-bg border-b border-brand-border"><tr className="text-[9px] uppercase tracking-wider2 text-brand-slate">
                        <th className="px-3 py-2 text-left sticky left-0 bg-brand-bg">Concepto</th>{meses.map((m: any) => <th key={m.mes} className="px-2 py-2 text-right whitespace-nowrap">{nombreMes(m.mes - 1)}</th>)}<th className="px-3 py-2 text-right bg-brand-primary/5 text-brand-primary">Total</th>
                      </tr></thead>
                      <tbody>
                        {([
                          ["Activaciones", "ventas", "int", "head"], ["INGRESOS DEL MES", null, null, "sep"],
                          ["Cuota 1", "activaciones_cuota1", "gs", "row"], ["Bono fijo", "bono_fijo", "gs", "row"], ["Bono adicional", "bono_adicional", "gs", "row"],
                          ["Facturación bruta", "facturacion_bruta", "gs", "sub"], ["AJUSTES DE COHORTES ANTERIORES", null, null, "sep"],
                          ["+ Cuota 2", "cuota2", "gs", "row"], ["− Legajos", "legajos", "gs", "row"], ["− Mora neta (penalizaciones − reversos)", "mora", "gs", "row"],
                          ["− Recálculo del bono", "recalculo", "gs", "row"], ["− Otros reversos", "otros", "gs", "row"],
                          ["INGRESO NETO LIQUIDADO", "ingreso_neto", "gs", "total"], ["TOTAL COSTOS", "costo_total", "gs", "sub"],
                          ["RESULTADO", "resultado", "gs", "total"], ["Margen %", "margen_pct", "pct", "pct"], ["Acumulado", "acumulado", "gs", "pct"],
                        ] as Array<[string, string | null, string | null, string]>).map(([label, key, fmt, tipo]) => {
                          const val = (m: any) => (key ? Number(m[key] ?? 0) : 0);
                          const total = key === "margen_pct" ? a.margen_pct : key === "acumulado" ? a.resultado : meses.reduce((s: number, m: any) => s + val(m), 0);
                          const cls = tipo === "sep" ? "bg-brand-bg text-[9px] uppercase tracking-wider2 text-brand-slate font-bold" : tipo === "sub" ? "bg-brand-bg-soft font-semibold border-t border-brand-border" : tipo === "total" ? "bg-brand-ink text-white font-bold" : tipo === "pct" ? "text-brand-graphite italic" : tipo === "head" ? "font-semibold" : "";
                          const f = (v: number) => (fmt === "int" ? formatInt(v) : fmt === "pct" ? `${Math.round(v * 10) / 10}%` : formatGs(v));
                          return (
                            <tr key={label} className={cls}>
                              <td className={`px-3 py-1 sticky left-0 ${tipo === "total" ? "bg-brand-ink" : tipo === "sub" ? "bg-brand-bg-soft" : tipo === "sep" ? "bg-brand-bg" : "bg-white"} ${tipo === "row" ? "pl-6" : ""}`}>{label}</td>
                              {meses.map((m: any) => <td key={m.mes} className={`px-2 py-1 text-right font-mono ${key && val(m) < 0 && tipo !== "total" ? "text-brand-primary" : ""}`}>{key ? f(val(m)) : ""}</td>)}
                              <td className={`px-3 py-1 text-right font-mono font-bold ${tipo === "total" ? "" : "bg-brand-primary/5"}`}>{key ? f(total) : ""}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Bloque>

                <Bloque titulo="Estructura operativa necesaria" hint={`${anual.headcount.vendedores} vendedores · ${anual.headcount.total} personas · ${formatGs(res?.costos?.total ?? 0)}/mes`}>
                  {res && <EstructuraOperativa costos={res.costos} p={p} ventas={Number(p.ventas)} sinCard intro={`Estructura del mes 1, fija para los ${horizonte} meses. Dimensionada para ${formatInt(Number(p.ventas))} activaciones`} />}
                </Bloque>

                <Bloque titulo="Cómo se calcula el año" hint="criterios del modelo GPON">
                  <div className="text-[12px] text-brand-graphite space-y-2">
                    <p><b className="text-brand-ink">Cada mes es una cohorte.</b> Sus activaciones facturan cuota 1 y bono fijo en ese mes. Después, esa cohorte cobra la cuota 2 en el mes {p.cuota2_mes} ({p.cuota2_pct_lineas}% de las líneas), pierde legajos en el mes 1 ({p.legajo_pct}%), va perdiendo la mora entre el mes 1 y el 6 según la curva (hasta el {p.mora_pct_lineas}% de las líneas, penalidad por plan) y devuelve el bono de las líneas caídas en el mes {p.recalculo_mes} ({p.pct_recalculo}%). Después del mes 6 no pasa nada más: no hay residual.</p>
                    <p><b className="text-brand-ink">El mes N de la proyección</b> suma la facturación de la cohorte N más los ajustes que le tocan de todas las cohortes anteriores. Por eso los meses 1 y 2 se ven "limpios" y desde el mes {Number(p.recalculo_mes) + 1} el resultado se estabiliza: ese es el régimen.</p>
                    <p><b className="text-brand-ink">Costos:</b> la estructura se dimensiona con el mes 1 (ventas por vendedor, supervisor cada N, backoffice cada N ventas) y queda fija; solo comisiones, plus y operativos varían con las activaciones de cada mes. Sin logística de entregas: la instalación la hace Claro.</p>
                    <p><b className="text-brand-ink">Cola:</b> al cerrar el horizonte, las últimas cohortes todavía tienen cuota 2 por cobrar y mora y recálculo por devolver. "Con la cola" es el resultado cuando todo eso ya pasó.</p>
                    <p><b className="text-brand-ink">Calibración:</b> la cohorte real de enero 2026 (239 líneas) dejó 515.000 por línea a los 5 meses; el modelo con la escala anterior del bono da 511.000. Con la escala vigente (120.000 al 100%) la unidad sube a {pl ? formatGs(pl.neto_12) : "—"} por línea.</p>
                  </div>
                </Bloque>
              </>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
