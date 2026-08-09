"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatGs, formatInt } from "@/lib/format";
import { periodLabel } from "@/lib/month";
import { Lectura } from "@/components/televentas/Lectura";

const VEREDICTO: Record<string, { label: string; cls: string }> = {
  ok: { label: "OK", cls: "bg-emerald-100 text-emerald-700" },
  atencion: { label: "Atención", cls: "bg-brand-orange/10 text-brand-orange" },
  causa: { label: "Causa", cls: "bg-brand-primary/10 text-brand-primary" },
};

function fmtVal(v: number, formato: string) {
  if (formato === "gs") return formatGs(v);
  if (formato === "pct") return `${v}%`;
  return formatInt(v);
}

/** Cuerpo completo del informe del Analizador (método científico).
 *  Se usa expandido dentro del comparativo y en la página imprimible del informe. */
export function InformeAnalisis({ res, meses }: { res: any; meses: string[] }) {
  const obs = res?.observacion;
  if (!res || !obs) return null;
  const serieMeses = (res.series?.meses ?? []).map((m: any) => ({ ...m, label: periodLabel(m.mes) }));
  const descomp = (res.descomposicion ?? []).map((d: any) => ({ ...d, abs: Math.abs(d.aporte_gs) }));
  const mesAnalizado = meses[meses.length - 1];

  return (
    <div className="space-y-5">
      {/* 1. Hipótesis y resultado */}
      <div className={`rounded-md border-l-4 p-4 ${obs.alcanzado ? "border-emerald-500 bg-emerald-50/50" : "border-brand-primary bg-brand-primary/5"}`}>
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate">Hipótesis</span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${obs.alcanzado ? "bg-emerald-100 text-emerald-700" : "bg-brand-primary/10 text-brand-primary"}`}>
            {obs.alcanzado ? "CONFIRMADA" : "RECHAZADA"}
          </span>
        </div>
        <p className="text-sm text-brand-ink font-medium">{res.hipotesis}</p>
        <p className="text-xs text-brand-graphite mt-1">
          Producción real: <b>{formatGs(obs.prima_neta)}</b> · Objetivo: <b>{formatGs(obs.objetivo)}</b> ·
          Cumplimiento: <b>{obs.cumplimiento_pct}%</b> · Brecha: <b>{formatGs(obs.brecha_gs)}</b>
        </p>
      </div>

      <div className="grid xl:grid-cols-2 gap-5 print:block">
        {/* 2. Producción vs objetivo */}
        <div className="mb-0 print:mb-5">
          <h3 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-bold mb-2">Producción vs objetivo</h3>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={serieMeses} margin={{ top: 16, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis fontSize={10} tickFormatter={(v: number) => `${Math.round(v / 1e6)}M`} />
              <Tooltip formatter={(v: any) => formatGs(Number(v))} />
              <Bar dataKey="prima_neta" name="Prima neta" fill="#0EA5E9" fillOpacity={0.75} radius={[3, 3, 0, 0]}>
                <LabelList dataKey="prima_neta" position="top" formatter={(v: any) => `${Math.round(Number(v) / 1e6)}M`} fontSize={11} fontWeight={700} />
              </Bar>
              <ReferenceLine y={obs.objetivo} stroke="#E6332A" strokeWidth={2} strokeDasharray="6 3" ifOverflow="extendDomain"
                label={{ value: `Objetivo ${Math.round(obs.objetivo / 1e6)}M`, position: "insideTopRight", fill: "#E6332A", fontSize: 11, fontWeight: 700 }} />
            </ComposedChart>
          </ResponsiveContainer>
          <Lectura>
            Las barras son la prima neta real de cada mes seleccionado; la línea roja es el objetivo del mes
            analizado (el más reciente). Si la última barra no llega a la línea, la hipótesis se rechaza y el
            resto del informe explica por qué.
          </Lectura>
        </div>

        {/* 3. Descomposición de la variación */}
        {descomp.length > 0 && (
          <div>
            <h3 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-bold mb-2">Qué explicó la variación (aporte exacto en Gs)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={descomp} layout="vertical" margin={{ left: 30, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" fontSize={10} tickFormatter={(v: number) => `${Math.round(v / 1e6)}M`} />
                <YAxis type="category" dataKey="factor" fontSize={10} width={170} />
                <Tooltip formatter={(v: any) => formatGs(Number(v))} />
                <Bar dataKey="aporte_gs" name="Aporte (Gs)" radius={[0, 3, 3, 0]}>
                  {descomp.map((d: any, i: number) => (
                    <Cell key={i} fill={d.aporte_gs < 0 ? "#E6332A" : "#10B981"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <Lectura>
              La producción es volumen de contactos × conversión × ticket × retención. Cada barra muestra cuántos
              guaraníes aportó (verde) o restó (rojo) cada factor frente al período de referencia — la suma de las
              barras reproduce exactamente la variación total (descomposición LMDI). La barra roja más larga es la
              causa dominante y donde conviene actuar primero.
            </Lectura>
          </div>
        )}
      </div>

      {/* 4. Verificación de datos */}
      {res.verificaciones?.length > 0 && (
        <div>
          <h3 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-bold mb-2">Verificación de datos (funnel vs referencia)</h3>
          <div className="overflow-x-auto border border-brand-border rounded-md">
            <table className="w-full text-xs min-w-[560px]">
              <thead className="bg-brand-bg text-[10px] uppercase tracking-wider2 text-brand-slate">
                <tr>
                  <th className="px-3 py-1.5 text-left">Eslabón</th>
                  <th className="px-3 py-1.5 text-right">Referencia</th>
                  <th className="px-3 py-1.5 text-right">{periodLabel(mesAnalizado)}</th>
                  <th className="px-3 py-1.5 text-right">Δ%</th>
                  <th className="px-3 py-1.5 text-center">Veredicto</th>
                </tr>
              </thead>
              <tbody>
                {res.verificaciones.map((v: any) => {
                  const st = VEREDICTO[v.veredicto] ?? VEREDICTO.ok;
                  return (
                    <tr key={v.clave} className="border-t border-brand-border">
                      <td className="px-3 py-1.5 font-medium text-brand-ink">{v.factor}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{fmtVal(v.referencia, v.formato)}</td>
                      <td className="px-3 py-1.5 text-right font-mono font-semibold">{fmtVal(v.actual, v.formato)}</td>
                      <td className={`px-3 py-1.5 text-right font-mono ${v.delta_pct != null && v.delta_pct < 0 ? "text-brand-primary" : "text-emerald-600"}`}>
                        {v.delta_pct != null ? `${v.delta_pct > 0 ? "+" : ""}${v.delta_pct}%` : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${st.cls}`}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Conclusión y acciones */}
      <div className="rounded-md border-l-4 border-brand-ink bg-white border border-brand-border p-4">
        <h3 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-bold mb-1">Conclusión</h3>
        <p className="text-sm text-brand-ink leading-relaxed font-medium">{res.conclusion}</p>
      </div>
      {res.acciones?.length > 0 && (
        <div>
          <h3 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-bold mb-2">Acciones posibles</h3>
          <ul className="space-y-1.5">
            {res.acciones.map((a: string, i: number) => (
              <li key={i} className="text-sm text-brand-graphite flex gap-2">
                <span className="text-brand-primary font-bold shrink-0">{i + 1}.</span>{a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 6. Análisis adicionales sugeridos */}
      {res.analisis_sugeridos?.length > 0 && (
        <div>
          <h3 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-bold mb-2">Análisis adicionales sugeridos</h3>
          <div className="grid md:grid-cols-2 gap-3">
            {res.analisis_sugeridos.map((s: any, i: number) => (
              <div key={i} className="card p-3 border-l-4 border-brand-cyan">
                <div className="text-sm font-semibold text-brand-ink">
                  {s.ruta ? (
                    <Link href={s.ruta} className="hover:text-brand-primary">{s.titulo} →</Link>
                  ) : s.titulo}
                </div>
                <p className="text-xs text-brand-slate mt-0.5 leading-relaxed">{s.detalle}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-brand-slate">{res.metodo}</p>
    </div>
  );
}
