"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { MonthNavigator } from "@/components/MonthNavigator";
import { apiFetch, getUser } from "@/lib/api";
import { formatInt, formatPct } from "@/lib/format";
import { monthLabel, useMonthFilter } from "@/lib/month";

interface LlamadasSummary {
  id: string;
  period_month: string | null;
  generated_at: string;
  llamadas_ingresadas: number;
  contestadas: number;
  abandonadas: number;
  nivel_atencion_pct: number;
  sla_pct: number;
  aht_seg: number;
  operadores_activos: number;
  is_published: boolean;
}

function fmtMinSeg(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = Math.round(seg % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function AtencionLlamadasListPage() {
  const [items, setItems] = useState<LlamadasSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    setUser(getUser());
    apiFetch<{ items: LlamadasSummary[] }>("/api/v1/atencion/llamadas/reports")
      .then((d) => setItems(d.items))
      .finally(() => setLoading(false));
  }, []);

  const canManage = user && (user.role === "superadmin" || user.role === "analyst");
  const { months, month, setMonth, filtered } = useMonthFilter(items);

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-3xl text-brand-ink uppercase">Reportes de Llamadas</h1>
          <p className="text-sm text-brand-slate mt-1">
            {user?.role === "client"
              ? "Reportes de atención telefónica publicados."
              : "Histórico de reportes de llamadas de atención al cliente."}
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Link href="/atencion/publicaciones" className="btn-ghost">Publicaciones</Link>
            <Link href="/atencion/llamadas/upload" className="btn-primary">+ Subir nuevo</Link>
          </div>
        )}
      </div>

      {loading && <div className="text-brand-slate">Cargando…</div>}

      {!loading && items.length === 0 && (
        <div className="card p-12 text-center">
          <p className="text-brand-slate">No hay reportes de llamadas aún.</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <>
          {months.length > 0 && (
            <div className="mb-4 flex items-center gap-3">
              <MonthNavigator months={months} value={month} onChange={setMonth} />
              <span className="text-xs text-brand-slate">
                {filtered.length} reporte(s) en {month ? monthLabel(month) : "—"}
              </span>
            </div>
          )}
          <div className="card overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-brand-bg border-b border-brand-border">
                <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                  <th className="px-4 py-3 text-left">Período</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-right">Ingresadas</th>
                  <th className="px-4 py-3 text-right">Contestadas</th>
                  <th className="px-4 py-3 text-right">Atención</th>
                  <th className="px-4 py-3 text-right">SLA</th>
                  <th className="px-4 py-3 text-right">AHT</th>
                  <th className="px-4 py-3 text-right">Operadores</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-brand-border hover:bg-brand-bg-soft">
                    <td className="px-4 py-3 font-semibold text-brand-ink">{r.period_month ?? "—"}</td>
                    <td className="px-4 py-3">
                      {r.is_published ? (
                        <span className="badge-success">Publicado</span>
                      ) : (
                        <span className="badge-neutral">Borrador</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{formatInt(r.llamadas_ingresadas)}</td>
                    <td className="px-4 py-3 text-right text-brand-cyan font-semibold">{formatInt(r.contestadas)}</td>
                    <td className="px-4 py-3 text-right">{formatPct(r.nivel_atencion_pct)}</td>
                    <td className="px-4 py-3 text-right">{formatPct(r.sla_pct)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtMinSeg(r.aht_seg)}</td>
                    <td className="px-4 py-3 text-right">{r.operadores_activos}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link href={`/atencion/llamadas/reports/${r.id}`} className="text-brand-primary font-semibold hover:underline">
                        Ver →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AppShell>
  );
}
