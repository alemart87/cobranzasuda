"use client";

import { formatGs, formatInt } from "@/lib/format";

/** Estructura operativa necesaria: cuadros de headcount (vendedores, supervisores, backoffice…),
 *  remuneración promedio del vendedor y costo total de la estructura. Compartido por el simulador
 *  mensual (sección propia) y el anual (bloque colapsable, estructura fija del mes 1). */
export function EstructuraOperativa({ costos, p, ventas, sinCard = false, titulo = "Estructura operativa necesaria", intro }: {
  costos: any; p: any; ventas: number; sinCard?: boolean; titulo?: string; intro?: string;
}) {
  if (!costos?.headcount) return null;
  const hc = costos.headcount;
  const cuadros: Array<[string, number, string, string]> = [
    ["Vendedores", hc.vendedores, "#E6332A", `salarios fijos ${formatGs(costos.rrhh.operadores_salario)}/mes`],
    ["Supervisores", hc.supervisores, "#F39200", `salarios ${formatGs(costos.rrhh.supervisores)}/mes`],
    ["Backoffice", hc.backoffice, "#0EA5E9", `salarios ${formatGs(costos.rrhh.backoffice)}/mes`],
    ["Coordinador", hc.coordinadores, "#662483", `salario ${formatGs(costos.rrhh.coordinadores)}/mes`],
    ["Controllers", hc.controllers, "#00B2BF", `salarios ${formatGs(costos.rrhh.controllers)}/mes`],
    ["SubGerencia Comercial", hc.subgerencia ?? 0, "#E6332A", costos.rrhh.subgerencia > 0 ? `salario ${formatGs(costos.rrhh.subgerencia)}/mes` : "no incorporada (costo 0)"],
    ["Total personas", hc.total, "#0F1116", `RRHH con IPS y aguinaldo ${formatGs(costos.rrhh_total)}/mes`],
  ];
  const v = costos.vendedor;
  // Velocidad de ventas: VPH = ventas por vendedor por mes ÷ horas trabajadas en el mes.
  const horasDia = Number(p.costos.horas_dia) || 0, diasMes = Number(p.costos.dias_mes) || 0;
  const horasMes = horasDia * diasMes;
  const ventasVend = hc.vendedores > 0 ? ventas / hc.vendedores : 0;
  const vph = horasMes > 0 ? ventasVend / horasMes : 0;
  const vpd = diasMes > 0 ? ventasVend / diasMes : 0;
  const f2 = (x: number) => x.toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const f1 = (x: number) => x.toLocaleString("es-PY", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const cuerpo = (
    <>
      {!sinCard && <h2 className="font-display text-xl text-brand-ink uppercase mb-1">{titulo}</h2>}
      <p className="text-xs text-brand-slate mb-4">
        {intro ?? `Para ${formatInt(ventas)} ventas efectivas`}, con {p.costos.ventas_por_vendedor} ventas por vendedor, 1 supervisor cada {p.costos.supervisor_cada_vendedores} vendedores y 1 backoffice cada {p.costos.backoffice_cada_ventas} ventas.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {cuadros.map(([label, n, color, hint]) => (
          <div key={label} className="rounded-md border border-brand-border bg-white p-4 text-center" style={{ borderTop: `4px solid ${color}` }}>
            <div className="text-[10px] uppercase tracking-wider2 text-brand-slate font-bold">{label}</div>
            <div className="font-display text-4xl text-brand-ink leading-tight mt-1">{formatInt(n)}</div>
            <div className="text-[10px] text-brand-slate mt-1">{hint}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-md border border-brand-border bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <div className="text-[10px] uppercase tracking-wider2 text-brand-slate font-bold">Velocidad de ventas · VPH</div>
          <div className="text-[10px] text-brand-slate">{formatInt(ventas)} ventas del mes ÷ {formatInt(hc.vendedores)} vendedores = {f1(ventasVend)} ventas por vendedor</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-md border border-brand-primary/40 bg-brand-primary/5 p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider2 text-brand-primary font-bold">VPH · ventas por hora</div>
            <div className="font-display text-3xl text-brand-primary leading-tight mt-1">{f2(vph)}</div>
            <div className="text-[10px] text-brand-slate mt-1">por vendedor · {f1(ventasVend)} ÷ {formatInt(horasMes)} h</div>
          </div>
          <div className="rounded-md border border-brand-border p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider2 text-brand-slate font-bold">Ventas por día</div>
            <div className="font-display text-3xl text-brand-ink leading-tight mt-1">{f2(vpd)}</div>
            <div className="text-[10px] text-brand-slate mt-1">por vendedor · {f1(ventasVend)} ÷ {formatInt(diasMes)} días</div>
          </div>
          <div className="rounded-md border border-brand-border p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider2 text-brand-slate font-bold">Horas por venta</div>
            <div className="font-display text-3xl text-brand-ink leading-tight mt-1">{vph > 0 ? f1(1 / vph) : "—"}</div>
            <div className="text-[10px] text-brand-slate mt-1">tiempo de vendedor que cuesta una venta</div>
          </div>
          <div className="rounded-md border border-brand-border p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider2 text-brand-slate font-bold">Jornada</div>
            <div className="font-display text-3xl text-brand-ink leading-tight mt-1">{formatInt(horasMes)} h</div>
            <div className="text-[10px] text-brand-slate mt-1">{horasDia} h × {diasMes} días al mes</div>
          </div>
        </div>
      </div>
      {v && (
        <div className="mt-4 rounded-md border border-brand-border bg-brand-bg-soft p-4">
          <div className="text-[10px] uppercase tracking-wider2 text-brand-slate font-bold mb-2">Cuánto gana un vendedor promedio por mes</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <div className="text-[10px] text-brand-slate">Salario fijo</div>
              <div className="font-display text-xl text-brand-ink">{formatGs(v.salario_fijo)}</div>
              <div className="text-[10px] text-brand-slate">{formatGs(p.costos.salario_hora)} la hora × {formatInt(horasMes)} h</div>
            </div>
            <div>
              <div className="text-[10px] text-brand-slate">Por cada venta</div>
              <div className="font-display text-xl text-brand-primary">{formatGs(v.variable_por_venta)}</div>
              <div className="text-[10px] text-brand-slate">{formatGs(v.comision_por_venta)} de comisión{v.plus_por_venta > 0 ? ` + ${formatGs(v.plus_por_venta)} de plus` : ""}</div>
            </div>
            <div>
              <div className="text-[10px] text-brand-slate">Variable del mes</div>
              <div className="font-display text-xl text-brand-ink">{formatGs(v.comision_promedio + v.plus_promedio)}</div>
              <div className="text-[10px] text-brand-slate">{v.ventas_promedio} ventas × {formatGs(v.variable_por_venta)}</div>
            </div>
            <div>
              <div className="text-[10px] text-brand-slate">Ingreso total</div>
              <div className="font-display text-xl text-brand-ink">{formatGs(v.ingreso_promedio)}</div>
              <div className="text-[10px] text-brand-slate">fijo + variable · el variable es el {v.pct_variable_sobre_ingreso}% del total</div>
            </div>
          </div>
          <div className="mt-3 grid md:grid-cols-2 gap-2 text-[11px] text-brand-graphite">
            <div className="rounded-md border border-brand-border bg-white px-3 py-2">
              <b className="text-brand-ink">Lo que le cuesta a Voicenter cada venta en remuneración variable:</b>{" "}
              <span className="font-mono font-bold text-brand-primary">{formatGs(v.comision_con_cargas_por_venta)}</span>.
              {" "}La comisión paga IPS ({p.costos.ips_pct}%) y aguinaldo; el plus no paga cargas.
            </div>
            <div className="rounded-md border border-brand-border bg-white px-3 py-2">
              <b className="text-brand-ink">Comparado con lo que factura Claro:</b> la comisión + plus de todos los vendedores equivale al{" "}
              <span className="font-mono font-bold text-brand-primary">{v.peso_sobre_facturacion_pct}%</span> de la facturación bruta del mes
              {" "}y al <span className="font-mono font-bold">{v.peso_sobre_neto_12_pct}%</span> de lo que queda neto a 12 meses. Solo para comparar: la remuneración se carga como monto por venta, no como porcentaje.
            </div>
          </div>
        </div>
      )}
      <div className="mt-3 rounded-md border border-brand-border bg-brand-bg-soft px-3 py-2 text-[11px] text-brand-graphite grid grid-cols-2 md:grid-cols-4 gap-2">
        <div><span className="block text-[10px] text-brand-slate">Costo total de la estructura</span><b className="text-brand-ink">{formatGs(costos.total)}</b> por mes</div>
        <div><span className="block text-[10px] text-brand-slate">Por venta</span><b className="text-brand-ink">{formatGs(costos.costo_por_venta)}</b> ({formatGs(costos.total)} ÷ {formatInt(ventas)})</div>
        <div><span className="block text-[10px] text-brand-slate">Por persona</span><b className="text-brand-ink">{formatGs(Math.round(costos.total / Math.max(hc.total, 1)))}</b> ({formatInt(hc.total)} personas)</div>
        <div><span className="block text-[10px] text-brand-slate">Incluye</span>salarios, comisiones, IPS, aguinaldo, plus, logística y operativos</div>
      </div>
    </>
  );
  return sinCard ? <div>{cuerpo}</div> : <section className="card p-5">{cuerpo}</section>;
}
