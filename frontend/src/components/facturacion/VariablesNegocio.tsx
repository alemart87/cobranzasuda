"use client";

import { formatGs } from "@/lib/format";

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

/** Panel "Variables de negocio": TODAS las variables editables del simulador de
 *  facturación (ventas, tarifas, cuota 2, residual, bonos, zafra, chargeback, costos).
 *  Compartido por el simulador mensual y el anual. */
export function VariablesNegocio({ p, setP, defaults, titulo = "Variables de negocio", extra }: {
  p: any; setP: (fn: any) => void; defaults: any; titulo?: string; extra?: React.ReactNode;
}) {
  const set = (k: string, v: any) => setP((prev: any) => ({ ...prev, [k]: v }));
  const setPlan = (i: number, k: string, v: any) => setP((prev: any) => ({ ...prev, planes: prev.planes.map((pl: any, j: number) => (j === i ? { ...pl, [k]: v } : pl)) }));
  const setEscala = (key: string, i: number, k: string, v: number) => setP((prev: any) => ({ ...prev, [key]: prev[key].map((e: any, j: number) => (j === i ? { ...e, [k]: v } : e)) }));
  const setC = (k: string, v: any) => setP((prev: any) => ({ ...prev, costos: { ...prev.costos, [k]: v } }));
  const setZafra = (i: number, v: number) => setP((prev: any) => ({ ...prev, zafra_pct: prev.zafra_pct.map((z: number, j: number) => (j === i ? v : z)) }));
  const mixTotal = p ? p.planes.reduce((s: number, pl: any) => s + Number(pl.mix_pct || 0), 0) : 0;
  if (!p) return null;
  return (
    <section className="space-y-2 no-print">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="font-display text-xl text-brand-ink uppercase">{titulo}</h2>
              {defaults && <button onClick={() => setP(defaults)} className="text-[11px] text-brand-primary font-semibold hover:underline">Restaurar valores reales</button>}
            </div>

            <Grupo titulo="Ventas y objetivo" abierto>
              <Campo label="Ventas efectivas del mes" hint="ya son las activaciones (cuota 1): no se descuentan" value={p.ventas} onChange={(v) => set("ventas", v)} step={10} />
              <Campo label="Efectividad de entregas" hint="solo define el escalón del bono efectividad" value={p.efectividad_pct} onChange={(v) => set("efectividad_pct", v)} step={0.5} suffix="%" />
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

            <Grupo titulo="Costos de la estructura" hint="indicador principal: ventas por vendedor" abierto>
              <Campo label="Ventas por vendedor" hint="define la dotación (1.900 ventas ÷ 20 = 95 vendedores)" value={p.costos.ventas_por_vendedor} onChange={(v) => setC("ventas_por_vendedor", v)} />
              <Campo label="Vendedores por supervisor" hint="1 supervisor cada N vendedores" value={p.costos.supervisor_cada_vendedores} onChange={(v) => setC("supervisor_cada_vendedores", v)} />
              <Campo label="Ventas por backoffice" hint="1 backoffice cada N ventas" value={p.costos.backoffice_cada_ventas} onChange={(v) => setC("backoffice_cada_ventas", v)} step={10} />
              <Campo label="Coordinadores" value={p.costos.coordinadores} onChange={(v) => setC("coordinadores", v)} />
              <Campo label="Controllers" value={p.costos.controllers} onChange={(v) => setC("controllers", v)} />
              <div className="border-t border-brand-border pt-2 text-[10px] uppercase tracking-wider2 text-brand-slate font-bold">Operador (por hora)</div>
              <Campo label="Salario por hora" value={p.costos.salario_hora} onChange={(v) => setC("salario_hora", v)} step={100} />
              <Campo label="Horas por día" value={p.costos.horas_dia} onChange={(v) => setC("horas_dia", v)} step={0.5} />
              <Campo label="Días por mes" value={p.costos.dias_mes} onChange={(v) => setC("dias_mes", v)} />
              <Campo label="Comisión de vendedores" hint="% sobre las comisiones facturadas" value={p.costos.comision_vendedores_pct} onChange={(v) => setC("comision_vendedores_pct", v)} step={1} suffix="%" />
              <label className="flex items-center gap-2 text-sm text-brand-ink">
                <input type="checkbox" checked={!!p.costos.comision_incluye_bonos} onChange={(e) => setC("comision_incluye_bonos", e.target.checked)} className="accent-brand-primary" />
                La base de la comisión incluye los bonos
              </label>
              <div className="border-t border-brand-border pt-2 text-[10px] uppercase tracking-wider2 text-brand-slate font-bold">Salarios mensuales</div>
              <Campo label="Supervisor" hint="salario" value={p.costos.supervisor_salario} onChange={(v) => setC("supervisor_salario", v)} step={10000} />
              <Campo label="Supervisor — premio" value={p.costos.supervisor_premio} onChange={(v) => setC("supervisor_premio", v)} step={10000} />
              <Campo label="Coordinador" hint="salario" value={p.costos.coordinador_salario} onChange={(v) => setC("coordinador_salario", v)} step={10000} />
              <Campo label="Coordinador — premio" value={p.costos.coordinador_premio} onChange={(v) => setC("coordinador_premio", v)} step={10000} />
              <Campo label="Backoffice" value={p.costos.backoffice_salario} onChange={(v) => setC("backoffice_salario", v)} step={10000} />
              <Campo label="Controller" hint="salario" value={p.costos.controller_salario} onChange={(v) => setC("controller_salario", v)} step={10000} />
              <Campo label="Controller — premio" value={p.costos.controller_premio} onChange={(v) => setC("controller_premio", v)} step={10000} />
              <label className="flex items-center gap-3 rounded-md border-2 border-brand-primary bg-brand-primary/5 px-2 py-1.5">
                <span className="flex-1">
                  <span className="block text-sm font-bold text-brand-primary">SubGerencia Comercial</span>
                  <span className="block text-[10px] text-brand-primary/80">en análisis · salario mensual, 0 = no incorporada · suma IPS y aguinaldo</span>
                </span>
                <input type="number" step={100000} value={p.costos.subgerencia_salario ?? 0} onChange={(e) => setC("subgerencia_salario", Number(e.target.value))}
                  className="input max-w-[120px] !py-1 text-sm text-right font-bold text-brand-primary border-brand-primary" />
              </label>
              <Campo label="IPS" hint="sobre todos los costos de RRHH" value={p.costos.ips_pct} onChange={(v) => setC("ips_pct", v)} step={0.5} suffix="%" />
              <label className="flex items-center gap-2 text-sm text-brand-ink">
                <input type="checkbox" checked={!!p.costos.aguinaldo} onChange={(e) => setC("aguinaldo", e.target.checked)} className="accent-brand-primary" />
                Previsión de aguinaldo: (RRHH + IPS) ÷ 12
              </label>
              <div className="border-t border-brand-border pt-2 text-[10px] uppercase tracking-wider2 text-brand-slate font-bold">Logística y operativos</div>
              <Campo label="Entrega en Central" hint="Gs por venta" value={p.costos.logistica_central} onChange={(v) => setC("logistica_central", v)} step={1000} />
              <Campo label="Entrega en Interior" hint="Gs por venta" value={p.costos.logistica_interior} onChange={(v) => setC("logistica_interior", v)} step={1000} />
              <Campo label="Entregas en Interior" hint="el resto es Central" value={p.costos.logistica_interior_pct} onChange={(v) => setC("logistica_interior_pct", v)} step={5} suffix="%" />
              <Campo label="Premios a logística" hint="fijo mensual" value={p.costos.logistica_premios} onChange={(v) => setC("logistica_premios", v)} step={1000000} />
              <Campo label="Costo operativo por venta" value={p.costos.operativo_por_venta} onChange={(v) => setC("operativo_por_venta", v)} step={500} />
            </Grupo>
                {extra}
    </section>
  );
}
