"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { formatGs, formatInt } from "@/lib/format";
import { monthLabel } from "@/lib/month";

interface Params {
  ticket_promedio: number; conversion_pct: number; contactabilidad_pct: number;
  llamadas_asesor_dia: number; dias_habiles: number; intentos_por_registro: number;
  tasa_anulacion_pct: number;
}

const PARAM_DEFS: Array<{ key: keyof Params; label: string; hint: string; step: number; suffix?: string }> = [
  { key: "ticket_promedio", label: "Ticket promedio (Gs)", hint: "prima emitida ÷ pólizas", step: 10000 },
  { key: "conversion_pct", label: "Conversión %", hint: "pólizas ÷ llamadas contestadas", step: 0.1, suffix: "%" },
  { key: "contactabilidad_pct", label: "Contactabilidad %", hint: "contestadas (≥34s) ÷ llamadas", step: 0.5, suffix: "%" },
  { key: "llamadas_asesor_dia", label: "Llamadas / asesor / día", hint: "ritmo de marcación", step: 1 },
  { key: "dias_habiles", label: "Días hábiles del mes", hint: "días operativos", step: 1 },
  { key: "intentos_por_registro", label: "Intentos por registro", hint: "marcaciones promedio a cada registro de la base", step: 0.5 },
  { key: "tasa_anulacion_pct", label: "Tasa de anulación %", hint: "prima anulada ÷ emitida (histórica)", step: 0.5, suffix: "%" },
];

function simular(p: Params, metaPrima: number | null, asesores: number | null) {
  const ticket = Math.max(p.ticket_promedio, 1);
  const conv = Math.max(p.conversion_pct, 0.01) / 100;
  const contact = Math.max(p.contactabilidad_pct, 0.01) / 100;
  const capMes = Math.max(p.llamadas_asesor_dia, 1) * Math.max(p.dias_habiles, 1);
  const intentos = Math.max(p.intentos_por_registro, 0.1);
  const anul = Math.min(Math.max(p.tasa_anulacion_pct, 0), 90) / 100;
  if (metaPrima != null) {
    const emitir = metaPrima / (1 - anul);
    const polizas = emitir / ticket;
    const contactos = polizas / conv;
    const llamadas = contactos / contact;
    return {
      modo: "meta" as const, emitir, polizas: Math.ceil(polizas), contactos: Math.ceil(contactos),
      llamadas: Math.ceil(llamadas), asesores: llamadas / capMes,
      registros: Math.ceil(llamadas / intentos), capMes,
    };
  }
  const llamadas = (asesores ?? 0) * capMes;
  const contactos = llamadas * contact;
  const polizas = contactos * conv;
  const emitida = polizas * ticket;
  return {
    modo: "dotacion" as const, llamadas: Math.round(llamadas), contactos: Math.round(contactos),
    polizas: Math.round(polizas * 10) / 10, emitida, neta: emitida * (1 - anul),
    registros: Math.ceil(llamadas / intentos), capMes,
  };
}

export default function SimuladorPage() {
  const [meta, setMeta] = useState<any>(null);
  const [params, setParams] = useState<Params | null>(null);
  const [modo, setModo] = useState<"meta" | "dotacion">("meta");
  const [metaPrima, setMetaPrima] = useState("500000000");
  const [asesores, setAsesores] = useState("20");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<any>("/api/v1/televentas/simulador").then((d) => {
      setMeta(d.parametros);
      if (d.parametros?.disponible) {
        const { disponible, meses_usados, mensaje, ...p } = d.parametros;
        setParams(p as Params);
      }
    }).finally(() => setLoading(false));
  }, []);

  const r = useMemo(() => {
    if (!params) return null;
    const m = Number(metaPrima), a = Number(asesores);
    if (modo === "meta" && m > 0) return simular(params, m, null);
    if (modo === "dotacion" && a > 0) return simular(params, null, a);
    return null;
  }, [params, modo, metaPrima, asesores]);

  const escenarios = useMemo(() => {
    if (!params || modo !== "meta" || !(Number(metaPrima) > 0)) return [];
    return ([["Conservador", 0.85], ["Base", 1], ["Optimista", 1.15]] as const).map(([n, f]) => {
      const p = { ...params, conversion_pct: params.conversion_pct * f };
      const s = simular(p, Number(metaPrima), null);
      return { nombre: n, conv: p.conversion_pct, asesores: Math.ceil(s.modo === "meta" ? s.asesores : 0), llamadas: s.llamadas, registros: s.registros };
    });
  }, [params, modo, metaPrima]);

  const setP = (k: keyof Params, v: string) => params && setParams({ ...params, [k]: Number(v) });

  return (
    <AppShell>
      <div className="mb-2 text-xs text-brand-slate">
        <Link href="/televentas" className="hover:text-brand-primary">Televentas</Link>
        <span className="mx-2">/</span><span className="text-brand-ink font-semibold">Simulador</span>
      </div>
      <div className="mb-6">
        <h1 className="font-display text-3xl sm:text-4xl text-brand-ink uppercase">Simulador de Ventas</h1>
        <p className="text-sm text-brand-slate mt-1 max-w-3xl">
          Proyectá el call center: cuántos asesores y cuántos registros de base hacen falta para una meta de prima
          — o cuánto puede vender una dotación. Parámetros sembrados con las <b>tasas reales</b> de la operación.
        </p>
      </div>

      {loading && <div className="text-brand-slate">Cargando tasas reales…</div>}

      {!loading && meta && !meta.disponible && (
        <div className="card p-8 text-center text-brand-slate">
          {meta.mensaje || "Se necesita al menos un mes publicado completo (llamadas + producción)."}
        </div>
      )}

      {!loading && params && (
        <div className="grid lg:grid-cols-5 gap-6">
          {/* Parámetros */}
          <section className="card p-5 lg:col-span-2 h-fit">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="font-display text-xl text-brand-ink uppercase">Parámetros del modelo</h2>
            </div>
            <p className="text-[11px] text-brand-slate mb-4">
              Basados en {meta.meses_usados?.map((m: string) => monthLabel(m)).join(", ")} (publicados). Ajustalos para simular otros supuestos.
            </p>
            <div className="space-y-3">
              {PARAM_DEFS.map((d) => (
                <div key={d.key} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-brand-ink">{d.label}</div>
                    <div className="text-[10px] text-brand-slate">{d.hint}</div>
                  </div>
                  <input type="number" step={d.step} value={params[d.key]} onChange={(e) => setP(d.key, e.target.value)}
                    className="input max-w-[130px] !py-1.5 text-sm text-right" />
                </div>
              ))}
            </div>
          </section>

          {/* Simulación */}
          <div className="lg:col-span-3 space-y-6">
            <section className="card p-5">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="flex rounded-md border border-brand-border overflow-hidden">
                  <button onClick={() => setModo("meta")} className={`px-4 py-2 text-sm font-semibold ${modo === "meta" ? "bg-brand-primary text-white" : "text-brand-graphite hover:bg-brand-bg"}`}>Por meta de prima</button>
                  <button onClick={() => setModo("dotacion")} className={`px-4 py-2 text-sm font-semibold ${modo === "dotacion" ? "bg-brand-primary text-white" : "text-brand-graphite hover:bg-brand-bg"}`}>Por dotación</button>
                </div>
                {modo === "meta" ? (
                  <label className="flex items-center gap-2 text-sm">
                    Meta de prima <b>neta</b> (Gs)
                    <input type="number" step={10000000} value={metaPrima} onChange={(e) => setMetaPrima(e.target.value)} className="input max-w-[180px] !py-1.5 text-right" />
                  </label>
                ) : (
                  <label className="flex items-center gap-2 text-sm">
                    Asesores disponibles
                    <input type="number" step={1} value={asesores} onChange={(e) => setAsesores(e.target.value)} className="input max-w-[100px] !py-1.5 text-right" />
                  </label>
                )}
              </div>

              {r && r.modo === "meta" && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                    <Res label="Asesores necesarios" value={`${Math.ceil(r.asesores)}`} hint={`${r.asesores.toFixed(1)} exacto`} big accent="#E6332A" />
                    <Res label="Registros de base" value={formatInt(r.registros)} hint="a marcar en el mes" big accent="#0EA5E9" />
                    <Res label="Prima a emitir" value={formatGs(r.emitir)} hint="cubre la anulación" big accent="#F39200" />
                  </div>
                  <Cadena pasos={[
                    { label: "Prima neta objetivo", valor: formatGs(Number(metaPrima)) },
                    { label: "Prima a emitir", valor: formatGs(r.emitir) },
                    { label: "Pólizas", valor: formatInt(r.polizas) },
                    { label: "Contactos", valor: formatInt(r.contactos) },
                    { label: "Llamadas", valor: formatInt(r.llamadas) },
                    { label: "Asesores", valor: `${Math.ceil(r.asesores)}` },
                    { label: "Registros de base", valor: formatInt(r.registros) },
                  ]} />
                  <p className="text-[11px] text-brand-slate mt-3">
                    Capacidad por asesor: {formatInt(r.capMes)} llamadas/mes ({params.llamadas_asesor_dia}/día × {params.dias_habiles} días).
                  </p>
                </>
              )}

              {r && r.modo === "dotacion" && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                    <Res label="Prima neta proyectada" value={formatGs(r.neta)} hint={`emitida ${formatGs(r.emitida)}`} big accent="#10B981" />
                    <Res label="Pólizas proyectadas" value={`${r.polizas}`} big accent="#F39200" />
                    <Res label="Registros de base" value={formatInt(r.registros)} hint="necesarios en el mes" big accent="#0EA5E9" />
                  </div>
                  <Cadena pasos={[
                    { label: "Asesores", valor: asesores },
                    { label: "Llamadas", valor: formatInt(r.llamadas) },
                    { label: "Contactos", valor: formatInt(r.contactos) },
                    { label: "Pólizas", valor: `${r.polizas}` },
                    { label: "Prima emitida", valor: formatGs(r.emitida) },
                    { label: "Prima neta", valor: formatGs(r.neta) },
                  ]} />
                </>
              )}
            </section>

            {escenarios.length > 0 && (
              <section className="card p-5">
                <h2 className="font-display text-lg text-brand-ink uppercase mb-1">Escenarios de conversión</h2>
                <p className="text-xs text-brand-slate mb-3">Sensibilidad ±15% sobre la conversión base.</p>
                <table className="w-full text-sm">
                  <thead className="bg-brand-bg">
                    <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                      <th className="px-3 py-2 text-left">Escenario</th>
                      <th className="px-3 py-2 text-right">Conversión</th>
                      <th className="px-3 py-2 text-right">Asesores</th>
                      <th className="px-3 py-2 text-right">Llamadas</th>
                      <th className="px-3 py-2 text-right">Registros base</th>
                    </tr>
                  </thead>
                  <tbody>
                    {escenarios.map((e) => (
                      <tr key={e.nombre} className={`border-t border-brand-border ${e.nombre === "Base" ? "bg-brand-bg-soft font-semibold" : ""}`}>
                        <td className="px-3 py-2 text-brand-ink">{e.nombre}</td>
                        <td className="px-3 py-2 text-right font-mono">{e.conv.toFixed(2)}%</td>
                        <td className="px-3 py-2 text-right">{e.asesores}</td>
                        <td className="px-3 py-2 text-right">{formatInt(e.llamadas)}</td>
                        <td className="px-3 py-2 text-right">{formatInt(e.registros)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <p className="text-[11px] text-brand-slate">
              Modelo lineal sobre promedios históricos: no contempla curva de aprendizaje de asesores nuevos,
              estacionalidad ni calidad diferencial de bases. Usalo como orden de magnitud gerencial.
            </p>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Res({ label, value, hint, big, accent }: { label: string; value: string; hint?: string; big?: boolean; accent: string }) {
  return (
    <div className="card p-4 relative overflow-hidden">
      <div className="absolute top-0 bottom-0 left-0 w-1" style={{ background: accent }} />
      <div className="text-[11px] uppercase tracking-wider2 text-brand-slate">{label}</div>
      <div className={`font-display text-brand-ink ${big ? "text-2xl" : "text-lg"}`}>{value}</div>
      {hint && <div className="text-[11px] text-brand-slate mt-0.5">{hint}</div>}
    </div>
  );
}

function Cadena({ pasos }: { pasos: Array<{ label: string; valor: string }> }) {
  return (
    <div className="flex flex-wrap items-stretch gap-1.5">
      {pasos.map((p, i) => (
        <div key={p.label} className="flex items-center gap-1.5">
          <div className="rounded-md border border-brand-border px-3 py-1.5 bg-brand-bg-soft">
            <div className="text-[10px] uppercase tracking-wider2 text-brand-slate">{p.label}</div>
            <div className="text-sm font-semibold text-brand-ink">{p.valor}</div>
          </div>
          {i < pasos.length - 1 && <span className="text-brand-mist">→</span>}
        </div>
      ))}
    </div>
  );
}
