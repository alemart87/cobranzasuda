"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { periodLabel } from "@/lib/month";

/** Breve reseña del registro — SIEMPRE visible al entrar al comparativo y al semanal:
 *  últimos análisis del Analizador y compromisos de reunión pendientes. */
export function ResenaRegistro() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    apiFetch<any>("/api/v1/televentas/analizador/resumen").then(setData).catch(() => setData(null));
  }, []);

  if (!data || (data.ultimos_analisis?.length === 0 && data.compromisos_pendientes === 0)) return null;

  return (
    <section className="mb-6 rounded-md border border-brand-border bg-brand-bg-soft px-4 py-3 no-print">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[10px] uppercase tracking-wider2 font-bold text-brand-slate shrink-0">
          Registro
        </span>
        {(data.ultimos_analisis ?? []).map((a: any) => {
          const periodos = String(a.meses || "").split(",").filter(Boolean);
          const periodo = periodos[periodos.length - 1];
          return (
            <Link key={a.id} href={`/televentas/analizador/${a.id}`}
              className="flex items-center gap-1.5 text-xs text-brand-graphite hover:text-brand-primary">
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${a.tipo === "semanal" ? "bg-brand-cyan/10 text-brand-cyan" : "bg-brand-bg text-brand-slate border border-brand-border"}`}>
                {a.tipo === "semanal" ? "Semanal" : "Mensual"}
              </span>
              <span className="font-medium">{periodLabel(periodo)}</span>
              <span className={`font-bold ${a.alcanzado ? "text-emerald-600" : "text-brand-primary"}`}>
                {a.alcanzado ? "Confirmada" : "Rechazada"}
              </span>
              {a.cumplimiento_pct != null && <span>({a.cumplimiento_pct}%)</span>}
            </Link>
          );
        })}
        {data.compromisos_pendientes > 0 && (
          <Link href="/televentas/semanal"
            className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:underline">
            <span className="inline-block h-2 w-2 rounded-full bg-brand-primary animate-pulse" />
            {data.compromisos_pendientes} compromiso(s) de reunión pendiente(s) →
          </Link>
        )}
        {data.compromisos_pendientes === 0 && (
          <Link href="/televentas/semanal" className="ml-auto text-xs font-semibold text-brand-graphite hover:text-brand-primary">
            Reporte semanal →
          </Link>
        )}
      </div>
    </section>
  );
}
