"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatGs, formatInt } from "@/lib/format";
import { Campo } from "./Campo";
import { NumeroInput } from "./NumeroInput";

/** Zona de STAFF del simulador convergente: rotación, postulantes, capacitación, calidad de reclutamiento a 90 días
 *  y ausentismo. Es un escenario aparte: no toca la proyección. La configuración vive en `p.staff` (se guarda con la
 *  simulación; el motor de la proyección la ignora). */

export const STAFF_UI_DEFAULT = {
  staff_inicial: null as number | null, rotacion_pct: 10, rotacion_base: "inicial", rotacion_por_mes: [] as (number | null)[],
  postulantes_por_mes: 20, postulantes_lista: [] as (number | null)[], efectividad_capacitacion_pct: 50,
  calidad_reclutamiento_90_pct: 70, dias_capacitacion: 10, ausentismo_pct: 12, productividad_presente: null as number | null,
  pago_capacitacion_pct: 100, costo_reclutamiento_postulante: 0, ventas_modo: "capacidad",
};

export const staffDe = (p: any) => ({ ...STAFF_UI_DEFAULT, ...(p?.staff ?? {}) });

const f1 = (v: number) => Number(v ?? 0).toLocaleString("es-PY", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const M = (v: number) => `${(Number(v || 0) / 1e6).toLocaleString("es-PY", { maximumFractionDigits: 0 })} M`;
const pct = (v: number | null | undefined) => (v == null || !Number.isFinite(Number(v)) ? "—" : `${Number(v).toLocaleString("es-PY", { maximumFractionDigits: 1 })}%`);

/** Variables de staff: se usan en el mes 1 y en la zona de staff de la simulación abierta. */
export function VariablesStaff({ p, setP, vendedoresPlan, ventasMes1 }: { p: any; setP: (fn: any) => void; vendedoresPlan: number; ventasMes1: number }) {
  const s = staffDe(p);
  const set = (k: string, v: any) => setP((prev: any) => ({ ...prev, staff: { ...staffDe(prev), [k]: v } }));
  const vpv = Number(p?.costos?.ventas_por_vendedor) || 0;
  const prod = s.productividad_presente ?? vpv;
  const aus = Math.min(Math.max(Number(s.ausentismo_pct) || 0, 0), 99) / 100;
  const necesaria = prod > 0 ? ventasMes1 / (prod * (1 - aus)) : 0;
  const staffIni = s.staff_inicial ?? vendedoresPlan;
  const e = Number(s.efectividad_capacitacion_pct) / 100, q = Number(s.calidad_reclutamiento_90_pct) / 100;
  const bajasRot = (Number(s.rotacion_pct) / 100) * staffIni;
  const quedan = Number(s.postulantes_por_mes) * e * q;
  const reposicion = e * q > 0 ? Math.ceil(bajasRot / (e * q)) : null;
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate border-b border-brand-border pb-1 mb-2">Staff y rotación</div>
        <div className="space-y-2">
          <Campo label="Staff inicial (vendedores)" hint={`vacío = la dotación del plan (${formatInt(vendedoresPlan)}) · con ausentismo el plan necesita ${formatInt(Math.ceil(necesaria))}`}
            value={Number(staffIni)} onChange={(v) => set("staff_inicial", v)} step={1} />
          <div className="flex flex-wrap gap-3 text-[11px] pl-1">
            <button onClick={() => set("staff_inicial", null)} className={`font-semibold hover:underline ${s.staff_inicial == null ? "text-emerald-700" : "text-brand-primary"}`}>{s.staff_inicial == null ? "✓ " : ""}Dotación del plan ({formatInt(vendedoresPlan)})</button>
            <button onClick={() => set("staff_inicial", Math.ceil(necesaria))} className="text-brand-primary font-semibold hover:underline">Dotación necesaria con ausentismo ({formatInt(Math.ceil(necesaria))})</button>
          </div>
          <Campo label="Rotación mensual" hint={s.rotacion_base === "actual" ? "% del staff consolidado de cada mes que se va" : `% de la dotación inicial que se va cada mes: ${f1(bajasRot)} vendedores; 20% sin reponer = 5 meses y no queda nadie`}
            value={Number(s.rotacion_pct)} onChange={(v) => set("rotacion_pct", v)} step={1} suffix="%" />
          <label className="flex items-center gap-2 text-[11px] text-brand-graphite pl-1">
            <span>Base de la rotación:</span>
            <select value={s.rotacion_base} onChange={(e2) => set("rotacion_base", e2.target.value)} className="input !py-0.5 !px-1 text-[11px] w-auto">
              <option value="inicial">dotación inicial (lineal)</option>
              <option value="actual">staff consolidado del mes</option>
            </select>
          </label>
          <Campo label="Ausentismo diario" hint="promedio de vendedores que faltan cada día: los presentes son los que venden" value={Number(s.ausentismo_pct)} onChange={(v) => set("ausentismo_pct", v)} step={0.5} suffix="%" />
          <Campo label="Ventas por vendedor presente (mes completo)" hint={`vacío = ventas por vendedor del mes 1 (${f1(vpv)}). Si ese ${f1(vpv)} sale de la nómina real (ya trae el ausentismo), cargá ${f1(vpv / Math.max(1 - aus, 0.01))}`}
            value={Number(prod)} onChange={(v) => set("productividad_presente", v)} step={0.5} />
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate border-b border-brand-border pb-1 mb-2">Reclutamiento y capacitación</div>
        <div className="space-y-2">
          <Campo label="Postulantes por mes" hint="entran a capacitación cada mes · se puede cambiar por mes en la grilla" value={Number(s.postulantes_por_mes)} onChange={(v) => set("postulantes_por_mes", v)} step={1} />
          <Campo label="Calidad de capacitación" hint="% de postulantes que aprueba y se suma al staff" value={Number(s.efectividad_capacitacion_pct)} onChange={(v) => set("efectividad_capacitacion_pct", v)} step={5} suffix="%" />
          <Campo label="Calidad de reclutamiento a 90 días" hint="% de los aprobados que sigue a los 90 días (el resto se va en sus 3 primeros meses)" value={Number(s.calidad_reclutamiento_90_pct)} onChange={(v) => set("calidad_reclutamiento_90_pct", v)} step={5} suffix="%" />
          <Campo label="Duración de la capacitación" hint={`días hábiles sin vender; con ${formatInt(Number(p?.costos?.dias_mes) || 23)} días al mes, los nuevos venden ${f1(Math.max(0, (Number(p?.costos?.dias_mes) || 23) - Number(s.dias_capacitacion)))} días el mes que ingresan`}
            value={Number(s.dias_capacitacion)} onChange={(v) => set("dias_capacitacion", v)} step={1} suffix="d" />
          <Campo label="Pago durante la capacitación" hint="% del salario diario del operador, por postulante, con IPS y aguinaldo" value={Number(s.pago_capacitacion_pct)} onChange={(v) => set("pago_capacitacion_pct", v)} step={10} suffix="%" />
          <Campo label="Costo de reclutamiento por postulante" hint="Gs: avisos, entrevistas, exámenes · 0 = sin costo" value={Number(s.costo_reclutamiento_postulante)} onChange={(v) => set("costo_reclutamiento_postulante", v)} step={10000} />
          <label className="flex items-center gap-2 text-[11px] text-brand-graphite pl-1">
            <span>Ventas del escenario:</span>
            <select value={s.ventas_modo} onChange={(e2) => set("ventas_modo", e2.target.value)} className="input !py-0.5 !px-1 text-[11px] w-auto">
              <option value="capacidad">lo que puede vender el staff</option>
              <option value="tope_plan">como máximo las ventas del plan</option>
            </select>
          </label>
        </div>
      </div>
      <div className="rounded-md border border-brand-border bg-brand-bg-soft px-3 py-2 text-[11px] text-brand-graphite">
        Cada mes se van <b>{f1(bajasRot)}</b> por rotación. De <b>{f1(Number(s.postulantes_por_mes))}</b> postulantes aprueban <b>{f1(Number(s.postulantes_por_mes) * e)}</b> y a los 90 días quedan <b>{f1(quedan)}</b>.
        {reposicion != null && <> Para reponer la rotación hacen falta <b className={Number(s.postulantes_por_mes) >= reposicion ? "text-emerald-700" : "text-brand-primary"}>{formatInt(reposicion)} postulantes por mes</b>.</>}
      </div>
    </div>
  );
}

/** La zona completa: explicación, variables, grilla por mes, dinámica de dotación y margen proyección vs staff. */
export function ZonaStaff({ p, setP, staffRes, plan, horizonte, nombreMes, nombreCorto, vendedoresPlan }: {
  p: any; setP: (fn: any) => void; staffRes: any; plan: any; horizonte: number;
  nombreMes: (i: number) => string; nombreCorto: (i: number) => string; vendedoresPlan: number;
}) {
  const s = staffDe(p);
  const filas: any[] = staffRes?.meses ?? [];
  const a = staffRes?.anual;
  const pm: any[] = plan?.meses ?? [];
  const pa = plan?.anual;
  const setLista = (k: "postulantes_lista" | "rotacion_por_mes", i: number, v: number | null) => setP((prev: any) => {
    const st = staffDe(prev);
    const lista = Array.from({ length: horizonte }, (_, j) => (st[k]?.[j] ?? null));
    lista[i] = v;
    return { ...prev, staff: { ...st, [k]: lista } };
  });
  const limpiar = (k: "postulantes_lista" | "rotacion_por_mes") => setP((prev: any) => ({ ...prev, staff: { ...staffDe(prev), [k]: [] } }));
  const ventasMes1 = Number(pm[0]?.ventas ?? p?.ventas ?? 0);
  const data = filas.map((f, i) => ({
    mes: f.mes, staff: f.staff_cierre, productivo: f.staff_productivo, necesaria: f.dotacion_necesaria,
    margen_plan: pm[i]?.margen_pct ?? null, margen_staff: f.margen_pct, resultado_plan: pm[i]?.resultado ?? 0, resultado_staff: f.resultado,
  }));
  const difTotal = a && pa ? a.resultado - pa.resultado : 0;

  const filaDin: Array<[string, (f: any) => string, string?]> = [
    ["Staff al inicio", (f) => f1(f.staff_inicio), "font-semibold"],
    ["− Bajas por rotación", (f) => f.bajas_rotacion ? `−${f1(f.bajas_rotacion)}` : "0", "text-brand-primary"],
    ["− Bajas de nuevos antes de 90 días", (f) => f.bajas_90 ? `−${f1(f.bajas_90)}` : "0", "text-brand-primary"],
    ["+ Aprobados que ingresan", (f) => f.aprobados ? `+${f1(f.aprobados)}` : "0", "text-emerald-700"],
    ["= Staff al cierre", (f) => f1(f.staff_cierre), "font-bold"],
    ["  de los cuales en prueba (< 90 días)", (f) => f1(f.en_prueba), "text-brand-slate"],
    ["Staff productivo (los nuevos, desde que terminan la capacitación)", (f) => f1(f.staff_productivo)],
    ["Presentes (− ausentismo)", (f) => f1(f.presentes)],
    ["Dotación necesaria para el plan", (f) => f1(f.dotacion_necesaria), "text-brand-slate"],
    ["Brecha (productivo − necesaria)", (f) => `${f.brecha > 0 ? "+" : ""}${f1(f.brecha)}`],
    ["Ventas del plan (pospago)", (f) => formatInt(f.ventas_plan), "text-brand-slate"],
    ["Ventas que hace el staff (pospago)", (f) => formatInt(f.ventas), "font-semibold"],
    ["GPON que hace el staff", (f) => formatInt(f.ventas_gpon ?? 0)],
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-md border-l-4 border-brand-purple bg-brand-purple/5 px-4 py-3 text-[12px] text-brand-graphite space-y-1">
        <div className="font-bold text-brand-ink">Escenario aparte: la proyección de arriba no cambia.</div>
        <div>Esta zona toma las mismas variables, ventas del plan, GPON y meses afectados, y calcula cuántos vendedores hay realmente cada mes:</div>
        <ul className="list-disc pl-5 space-y-0.5">
          <li><b>Staff al cierre</b> = staff al inicio − bajas por rotación − nuevos que se van antes de los 90 días + aprobados de la capacitación.</li>
          <li>Los aprobados venden recién cuando terminan la capacitación; el <b>ausentismo</b> descuenta presentes.</li>
          <li><b>Ventas del staff</b> = presentes × ventas por vendedor presente (y GPON = presentes × GPON por asesor). Con esas ventas y esos vendedores se recalculan facturación, bonos, chargebacks y costos, más el costo de capacitar.</li>
          <li>Abajo, el <b>margen en Gs y en %</b> mes a mes de la proyección contra el del staff real.</li>
        </ul>
      </div>

      <div className="grid xl:grid-cols-3 gap-5">
        <div className="xl:col-span-1 rounded-md border border-brand-border bg-white p-4">
          <VariablesStaff p={p} setP={setP} vendedoresPlan={vendedoresPlan} ventasMes1={ventasMes1} />
        </div>
        <div className="xl:col-span-2 space-y-4">
          {a && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { t: "Staff inicial → final", v: `${f1(a.staff_inicial)} → ${f1(a.staff_final)}`, s: a.mes_sin_staff ? `sin staff desde ${nombreMes(a.mes_sin_staff - 1)}` : `mínimo ${f1(a.staff_minimo)}`, rojo: a.staff_final < a.staff_inicial },
                { t: "Dotación necesaria (mes 1)", v: f1(a.dotacion_necesaria_mes1), s: `${formatInt(ventasMes1)} ventas ÷ (${f1(a.productividad_presente)} × ${f1(100 - a.ausentismo_pct)}% presentes)` },
                { t: "Postulantes para reponer", v: a.postulantes_reposicion != null ? `${formatInt(a.postulantes_reposicion)} / mes` : "—", s: `cargados ${f1(s.postulantes_por_mes)} / mes`, rojo: a.postulantes_reposicion != null && s.postulantes_por_mes < a.postulantes_reposicion },
                { t: "Incorporados que quedan (90 días)", v: f1(a.incorporados_90), s: `de ${formatInt(a.postulantes)} postulantes · ${f1(a.aprobados)} aprobados` },
                { t: "Costo de capacitación y reclutamiento", v: M(a.costo_capacitacion + a.costo_reclutamiento), s: `en ${horizonte} meses` },
                { t: "Meses bajo la dotación necesaria", v: `${a.meses_bajo_necesidad.length} de ${horizonte}`, s: a.meses_bajo_necesidad.length ? `desde ${nombreMes(a.meses_bajo_necesidad[0] - 1)}` : "cubre el plan todos los meses", rojo: a.meses_bajo_necesidad.length > 0 },
              ].map((k) => (
                <div key={k.t} className={`rounded-md border bg-white px-3 py-2 ${k.rojo ? "border-brand-primary/50" : "border-brand-border"}`}>
                  <div className="text-[9px] uppercase tracking-wider2 text-brand-slate font-bold">{k.t}</div>
                  <div className={`font-display text-xl leading-tight ${k.rojo ? "text-brand-primary" : "text-brand-ink"}`}>{k.v}</div>
                  <div className="text-[10px] text-brand-slate">{k.s}</div>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-md border border-brand-border bg-white p-3">
            <div className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate mb-1">Staff mes a mes contra la dotación necesaria para el plan</div>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={data} margin={{ top: 8, right: 12, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" fontSize={9} tickFormatter={(v: number) => nombreCorto(v - 1)} />
                <YAxis fontSize={9} domain={[0, "auto"]} />
                <Tooltip labelFormatter={(l) => nombreMes(Number(l) - 1)} formatter={(v: any, n: any) => [f1(Number(v)), n]} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="staff" name="Staff al cierre" fill="#662483" fillOpacity={0.35} />
                <Line dataKey="productivo" name="Staff productivo" stroke="#662483" strokeWidth={2} dot={{ r: 2 }} />
                <Line dataKey="necesaria" name="Dotación necesaria" stroke="#E6332A" strokeDasharray="5 3" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-brand-border bg-white overflow-x-auto">
        <div className="px-4 pt-3 flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate">Postulantes y rotación por mes · editables (vacío = el valor base)</div>
          <div className="no-print flex gap-3 text-[11px]">
            <button onClick={() => limpiar("postulantes_lista")} className="text-brand-purple font-semibold hover:underline">Postulantes: todos a la base</button>
            <button onClick={() => limpiar("rotacion_por_mes")} className="text-brand-purple font-semibold hover:underline">Rotación: toda a la base</button>
          </div>
        </div>
        <table className="w-full text-[11px]" style={{ minWidth: `${220 + horizonte * 64}px` }}>
          <thead><tr className="text-[9px] uppercase tracking-wider2 text-brand-slate">
            <th className="px-3 py-1 text-left sticky left-0 bg-white">Mes</th>
            {Array.from({ length: horizonte }, (_, i) => <th key={i} className="px-1 py-1 text-right" title={nombreMes(i)}>{nombreCorto(i)}</th>)}
          </tr></thead>
          <tbody>
            {([["Postulantes", "postulantes_lista", Number(s.postulantes_por_mes), 1], ["Rotación %", "rotacion_por_mes", Number(s.rotacion_pct), 1]] as const).map(([label, k, baseV, step]) => (
              <tr key={k} className="border-t border-brand-border/60">
                <td className="px-3 py-1 sticky left-0 bg-white font-semibold text-brand-ink whitespace-nowrap">{label} <span className="text-[9px] text-brand-slate font-normal">base {f1(baseV)}</span></td>
                {Array.from({ length: horizonte }, (_, i) => {
                  const v = s[k]?.[i];
                  const propio = v != null;
                  return (
                    <td key={i} className="px-1 py-1">
                      <NumeroInput step={step} min={0} value={propio ? Number(v) : baseV} onChange={(n) => setLista(k, i, n)}
                        className={`input !py-0.5 !px-1 text-[11px] text-right w-full ${propio ? "border-brand-purple text-brand-purple font-bold" : "border-dashed"}`} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filas.length > 0 && (
        <div className="rounded-md border border-brand-border bg-white overflow-x-auto">
          <div className="px-4 pt-3 text-[10px] uppercase tracking-wider2 font-bold text-brand-slate">Dinámica de la dotación (vendedores)</div>
          <table className="w-full text-[11px]" style={{ minWidth: `${300 + horizonte * 64}px` }}>
            <thead><tr className="text-[9px] uppercase tracking-wider2 text-brand-slate">
              <th className="px-3 py-1 text-left sticky left-0 bg-white">Concepto</th>
              {filas.map((f) => <th key={f.mes} className="px-1 py-1 text-right" title={nombreMes(f.mes - 1)}>{nombreCorto(f.mes - 1)}</th>)}
            </tr></thead>
            <tbody>
              {filaDin.map(([label, fn, cls]) => (
                <tr key={label} className={`border-t border-brand-border/50 ${label.startsWith("=") ? "bg-brand-bg-soft" : ""}`}>
                  <td className={`px-3 py-1 sticky left-0 whitespace-nowrap ${label.startsWith("=") ? "bg-brand-bg-soft font-bold" : "bg-white"}`}>{label}</td>
                  {filas.map((f) => (
                    <td key={f.mes} className={`px-1 py-1 text-right font-mono whitespace-nowrap ${cls ?? ""} ${label.startsWith("Brecha") ? (f.brecha < -0.5 ? "text-brand-primary font-bold" : "text-emerald-700") : ""}`}>{fn(f)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filas.length > 0 && pm.length > 0 && (
        <div className="rounded-md border-2 border-brand-purple bg-white overflow-x-auto">
          <div className="px-4 pt-3 flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wider2 font-bold text-brand-purple">Margen: proyección contra staff real · Gs y %</div>
            {a && pa && (
              <div className="text-[12px] text-brand-graphite">
                Período: proyección <b>{formatGs(pa.resultado)}</b> ({pct(pa.margen_pct)}) · con staff <b className={a.resultado >= 0 ? "text-emerald-700" : "text-brand-primary"}>{formatGs(a.resultado)}</b> ({pct(a.margen_pct)}) ·
                diferencia <b className={difTotal >= 0 ? "text-emerald-700" : "text-brand-primary"}>{difTotal >= 0 ? "+" : ""}{formatGs(difTotal)}</b>
              </div>
            )}
          </div>
          <table className="w-full text-[11px]" style={{ minWidth: `${300 + horizonte * 76}px` }}>
            <thead><tr className="text-[9px] uppercase tracking-wider2 text-brand-slate">
              <th className="px-3 py-1 text-left sticky left-0 bg-white">Concepto</th>
              {filas.map((f) => <th key={f.mes} className="px-1 py-1 text-right" title={nombreMes(f.mes - 1)}>{nombreCorto(f.mes - 1)}</th>)}
              <th className="px-2 py-1 text-right bg-brand-purple/5 text-brand-purple">Total</th>
            </tr></thead>
            <tbody>
              {([
                ["Resultado de la proyección (Gs)", (i: number) => pm[i]?.resultado ?? 0, pa?.resultado ?? 0, "gs"],
                ["Margen de la proyección %", (i: number) => pm[i]?.margen_pct ?? 0, pa?.margen_pct ?? 0, "pct"],
                ["Ingreso neto con staff (Gs)", (i: number) => filas[i]?.ingreso_neto ?? 0, a?.ingreso_neto ?? 0, "gs"],
                ["Costos con staff, incluye capacitación (Gs)", (i: number) => filas[i]?.costo_total ?? 0, a?.costos ?? 0, "gs"],
                ["  de los cuales capacitación y reclutamiento", (i: number) => (filas[i]?.costo_capacitacion ?? 0) + (filas[i]?.costo_reclutamiento ?? 0), (a?.costo_capacitacion ?? 0) + (a?.costo_reclutamiento ?? 0), "gs"],
                ["Resultado con staff (Gs)", (i: number) => filas[i]?.resultado ?? 0, a?.resultado ?? 0, "gs"],
                ["Margen con staff %", (i: number) => filas[i]?.margen_pct ?? null, a?.margen_pct ?? null, "pct"],
                ["Diferencia de resultado (Gs)", (i: number) => (filas[i]?.resultado ?? 0) - (pm[i]?.resultado ?? 0), difTotal, "dif"],
              ] as Array<[string, (i: number) => any, any, string]>).map(([label, fn, tot, fmt]) => (
                <tr key={label} className={`border-t border-brand-border/50 ${label.startsWith("Resultado con") || label.startsWith("Margen con") ? "bg-brand-purple/5 font-semibold" : ""} ${label.startsWith("Diferencia") ? "font-bold" : ""}`}>
                  <td className="px-3 py-1 sticky left-0 bg-white whitespace-nowrap">{label}</td>
                  {filas.map((_, i) => {
                    const v = fn(i) as number;
                    return <td key={i} className={`px-1 py-1 text-right font-mono whitespace-nowrap ${v < 0 ? "text-brand-primary" : fmt === "dif" && v > 0 ? "text-emerald-700" : ""}`}>{fmt === "pct" ? pct(v) : fmt === "dif" ? `${v > 0 ? "+" : ""}${M(v)}` : M(v)}</td>;
                  })}
                  <td className={`px-2 py-1 text-right font-mono whitespace-nowrap bg-brand-purple/5 ${tot < 0 ? "text-brand-primary" : fmt === "dif" && tot > 0 ? "text-emerald-700" : ""}`}>{fmt === "pct" ? pct(tot) : fmt === "dif" ? `${tot > 0 ? "+" : ""}${M(tot)}` : M(tot)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3">
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={data} margin={{ top: 8, right: 12, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" fontSize={9} tickFormatter={(v: number) => nombreCorto(v - 1)} />
                <YAxis fontSize={9} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip labelFormatter={(l) => nombreMes(Number(l) - 1)} formatter={(v: any, n: any) => [pct(Number(v)), n]} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <ReferenceLine y={0} stroke="#0F1116" />
                <Line dataKey="margen_plan" name="Margen de la proyección" stroke="#9CA3AF" strokeWidth={2} strokeDasharray="5 3" dot={false} />
                <Line dataKey="margen_staff" name="Margen con staff real" stroke="#662483" strokeWidth={2.5} dot={{ r: 2.5 }} />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="text-[11px] text-brand-slate mt-2">
              El costo de capacitación se carga en el mes en que entran los postulantes (días × salario diario × % pagado, con IPS y aguinaldo). Supervisores, backoffice,
              coordinación y controllers son los del plan; solo cambian los vendedores. Si el staff cae por debajo de lo necesario, bajan las ventas y pueden perderse los bonos por objetivo.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
