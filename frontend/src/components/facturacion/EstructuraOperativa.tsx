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
    ["Vendedores", hc.vendedores, "#E6332A", `${formatGs(costos.rrhh.operadores_salario)} salarios`],
    ["Supervisores", hc.supervisores, "#F39200", formatGs(costos.rrhh.supervisores)],
    ["Backoffice", hc.backoffice, "#0EA5E9", formatGs(costos.rrhh.backoffice)],
    ["Coordinador", hc.coordinadores, "#662483", formatGs(costos.rrhh.coordinadores)],
    ["Controllers", hc.controllers, "#00B2BF", formatGs(costos.rrhh.controllers)],
    ["SubGerencia Comercial", hc.subgerencia ?? 0, "#E6332A", costos.rrhh.subgerencia > 0 ? `${formatGs(costos.rrhh.subgerencia)} · en análisis` : "no incorporada (en análisis)"],
    ["Total personas", hc.total, "#0F1116", `${formatGs(costos.rrhh_total)} RRHH con cargas`],
  ];
  const v = costos.vendedor;
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
      {v && (
        <div className="mt-4 rounded-md border border-brand-border bg-brand-bg-soft p-4">
          <div className="text-[10px] uppercase tracking-wider2 text-brand-slate font-bold mb-2">Remuneración promedio del vendedor</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <div className="text-[10px] text-brand-slate">Salario fijo (mes)</div>
              <div className="font-display text-xl text-brand-ink">{formatGs(v.salario_fijo)}</div>
              <div className="text-[10px] text-brand-slate">{formatGs(p.costos.salario_hora)} × {p.costos.horas_dia} h × {p.costos.dias_mes} días</div>
            </div>
            <div>
              <div className="text-[10px] text-brand-slate">Comisión + plus por venta</div>
              <div className="font-display text-xl text-brand-primary">{formatGs(v.variable_por_venta)}</div>
              <div className="text-[10px] text-brand-slate">{formatGs(v.comision_por_venta)} comisión (con IPS y aguinaldo) + {formatGs(v.plus_por_venta)} plus (sin cargas) · costo real {formatGs(v.comision_con_cargas_por_venta)}/venta</div>
            </div>
            <div>
              <div className="text-[10px] text-brand-slate">Variable promedio (mes)</div>
              <div className="font-display text-xl text-brand-ink">{formatGs(v.comision_promedio + v.plus_promedio)}</div>
              <div className="text-[10px] text-brand-slate">{formatGs(v.comision_promedio)} comisión + {formatGs(v.plus_promedio)} plus · {v.ventas_promedio} ventas/vendedor</div>
            </div>
            <div>
              <div className="text-[10px] text-brand-slate">Ingreso total promedio (mes)</div>
              <div className="font-display text-xl text-brand-ink">{formatGs(v.ingreso_promedio)}</div>
              <div className="text-[10px] text-brand-slate">fijo + comisión + plus · {v.pct_variable_sobre_ingreso}% variable</div>
            </div>
          </div>
          <div className="mt-3 rounded-md border border-dashed border-brand-border bg-white px-3 py-2 text-[11px] text-brand-graphite">
            <b className="text-brand-ink">Referencia · peso de comisión + plus sobre la facturación:</b>{" "}
            <span className="font-mono font-bold text-brand-primary">{v.peso_sobre_facturacion_pct}%</span> del mes ·{" "}
            <span className="font-mono font-bold">{v.peso_sobre_neto_6_pct}%</span> de lo que queda a 6 meses ·{" "}
            <span className="font-mono font-bold">{v.peso_sobre_neto_12_pct}%</span> a 12 meses.
            No es un parámetro: la remuneración se carga como monto por venta y este % solo sirve para comparar.
          </div>
        </div>
      )}
      <p className="text-[11px] text-brand-slate mt-3">
        Costo total de la estructura {formatGs(costos.total)} / mes · {formatGs(costos.costo_por_venta)} por venta ·
        {" "}{formatGs(Math.round(costos.total / Math.max(hc.total, 1)))} por persona · operador {formatGs(costos.salario_operador_mes)}/mes
        ({formatGs(p.costos.salario_hora)} × {p.costos.horas_dia} h × {p.costos.dias_mes} días).
      </p>
    </>
  );
  return sinCard ? <div>{cuerpo}</div> : <section className="card p-5">{cuerpo}</section>;
}
