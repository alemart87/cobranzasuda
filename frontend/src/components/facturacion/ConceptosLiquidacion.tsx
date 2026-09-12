"use client";

/** Observación: qué conceptos de la liquidación de Claro (con su nombre exacto) alimentan
 *  cada fila del simulador. Se muestra bajo los EERR y bajo el recupero por reconexión. */

export const CONCEPTOS_RECUPERO = {
  devuelto: ["RECONEXIONES", "REVERSO DESCUENTO PORTABILIDAD NUMERICA", "RECUPERO INCENTIVOS REVERSO PENALIDAD", "REVERSO PENALIZACION POR DEUDA", "RECUPERO ACTIVACION"],
  descontado: ["SUSPENSIONES", "DESCUENTO PORTABILIDAD NUMERICA", "DESCUENTO INCENTIVOS POR PENALIDAD", "PENALIZACION POR DEUDA"],
};

const FILAS: Array<{ fila: string; conceptos: string[]; nota?: string }> = [
  { fila: "Activaciones (cuota 1)", conceptos: ["ACTIVACIONES · cuota 1"] },
  { fila: "Plus portabilidad", conceptos: ["ACTIVACION PORTABILIDAD NUMERICA"] },
  { fila: "Bono productividad", conceptos: ["INCENTIVO PRODUCTIVIDAD"] },
  { fila: "Bono efectividad", conceptos: ["INCENTIVO EFECTIVIDAD DISTRIBUCION"] },
  { fila: "Residual", conceptos: ["RESIDUAL"] },
  { fila: "Cuota 2", conceptos: ["ACTIVACIONES · cuota 2"] },
  { fila: "Legajos", conceptos: ["LINEA CON DOCUMENTACION FALTANTE", "AJUSTE LEGAJO"], nota: "neto de DEVOLUCION DESCUENTO DOCUMENTACION ACTIVACION" },
  { fila: "Devoluciones por caídas", conceptos: ["SUSPENSIONES", "DESCUENTO PORTABILIDAD NUMERICA", "PENALIZACION POR DEUDA", "REVERSO ACTIVACION", "CANCELACIONES"], nota: "netas del recupero por reconexión (ver conceptos devueltos)" },
  { fila: "Devolución bono efectividad", conceptos: ["DESCUENTO INCENTIVOS POR PENALIDAD"], nota: "neto de RECUPERO INCENTIVOS REVERSO PENALIDAD" },
  { fila: "Recálculo bono productividad", conceptos: ["RECALCULO INCENTIVO PRODUCTIVIDAD"] },
];

const NO_MODELADOS = ["PENALIZACIÓN POR MIGRACIÓN DE NEGOCIO", "CAMBIO DE PLAN", "CONCEPTO INICIO DE PRESUSPENSION POR DEUDA"];

function Chip({ c }: { c: string }) {
  return <span className="inline-block px-1.5 py-0.5 rounded bg-white border border-brand-border font-mono text-[10px] text-brand-ink whitespace-nowrap">{c}</span>;
}

/** Observación corta para el campo "Recupero por reconexión". */
export function ObservacionRecupero() {
  return (
    <div className="rounded-md border border-brand-border bg-brand-bg-soft p-2 text-[10px] text-brand-graphite space-y-1">
      <div><b className="text-brand-ink">Observación · cómo se calcula el recupero.</b> Es lo que Claro devuelve en liquidaciones posteriores sobre lo que descontó por caídas, medido con estos conceptos de la liquidación:</div>
      <div><span className="font-semibold text-emerald-700">Devuelto:</span> <span className="inline-flex flex-wrap gap-1 align-middle">{CONCEPTOS_RECUPERO.devuelto.map((c) => <Chip key={c} c={c} />)}</span></div>
      <div><span className="font-semibold text-brand-primary">Descontado:</span> <span className="inline-flex flex-wrap gap-1 align-middle">{CONCEPTOS_RECUPERO.descontado.map((c) => <Chip key={c} c={c} />)}</span></div>
      <div>Recupero = devuelto ÷ descontado, ponderado sobre 5 liquidaciones reales (21,0% · 14,4% · 6,8% · 10,8% · 3,0%) = <b>10,5%</b>. Cada liquidación por separado salta porque los reversos corresponden a descuentos de meses anteriores; el valor de conjunto es el que vale.</div>
    </div>
  );
}

/** Observación completa para los EERR: cada fila y los conceptos de la liquidación que la alimentan. */
export function ObservacionConceptosEERR() {
  return (
    <div className="rounded-md border border-brand-border bg-brand-bg-soft p-3 mt-3">
      <div className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate mb-1.5">Observación · indicadores de la liquidación de Claro que alimentan cada fila</div>
      <div className="grid md:grid-cols-2 gap-x-6 gap-y-1.5">
        {FILAS.map((f) => (
          <div key={f.fila} className="text-[11px] text-brand-graphite">
            <span className="font-semibold text-brand-ink">{f.fila}:</span>{" "}
            <span className="inline-flex flex-wrap gap-1 align-middle">{f.conceptos.map((c) => <Chip key={c} c={c} />)}</span>
            {f.nota && <span className="block text-[10px] text-brand-slate">{f.nota}</span>}
          </div>
        ))}
      </div>
      <div className="text-[10px] text-brand-slate mt-2 pt-2 border-t border-brand-border">
        <b>Recupero por reconexión</b> (neto de las devoluciones): devuelto = {CONCEPTOS_RECUPERO.devuelto.join(" + ")} ÷ descontado = {CONCEPTOS_RECUPERO.descontado.join(" + ")}. Ponderado de 5 liquidaciones: 10,5%.
        {" "}<b>No modelados</b> (no aparecen en el EERR): {NO_MODELADOS.join(", ")}.
      </div>
    </div>
  );
}
