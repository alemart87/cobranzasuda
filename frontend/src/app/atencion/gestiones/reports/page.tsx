"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { MonthNavigator } from "@/components/MonthNavigator";
import { apiFetch, getUser } from "@/lib/api";
import { formatInt, formatPct } from "@/lib/format";
import { monthLabel, useMonthFilter } from "@/lib/month";

interface GestionSummary {
  id: string;
  period_month: string | null;
  generated_at: string;
  total_gestiones: number;
  cerrados: number;
  pendientes: number;
  pct_cerrados: number;
  is_published: boolean;
}

export default function AtencionGestionesListPage() {
  const [items, setItems] = useState<GestionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    setUser(getUser());
    apiFetch<{ items: GestionSummary[] }>("/api/v1/atencion/gestiones/reports")
      .then((d) => setItems(d.items))
      .finally(() => setLoading(false));
  }, []);

  const canManage = user && (user.role === "superadmin" || user.role === "analyst");
  const { months, month, setMonth, filtered } = useMonthFilter(items);

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-3xl text-brand-ink uppercase">Reportes de Gestiones</h1>
          <p className="text-sm text-brand-slate mt-1">
            {user?.role === "client"
              ? "Registros de contacto publicados."
              : "Histórico de gestiones de atención al cliente."}
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Link href="/atencion/publicaciones" className="btn-ghost">Publicaciones</Link>
            <Link href="/atencion/gestiones/upload" className="btn-primary">+ Subir nuevo</Link>
          </div>
        )}
      </div>

      {loading && <div className="text-brand-slate">Cargando…</div>}

      {!loading && items.length === 0 && (
        <div className="card p-12 text-center">
          <p className="text-brand-slate">No hay reportes de gestiones aún.</p>
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
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-brand-bg border-b border-brand-border">
                <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                  <th className="px-4 py-3 text-left">Período</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-right">Gestiones</th>
                  <th className="px-4 py-3 text-right">Cerrados</th>
                  <th className="px-4 py-3 text-right">Pendientes</th>
                  <th className="px-4 py-3 text-right">% Cerrados</th>
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
                    <td className="px-4 py-3 text-right font-semibold">{formatInt(r.total_gestiones)}</td>
                    <td className="px-4 py-3 text-right text-emerald-700 font-semibold">{formatInt(r.cerrados)}</td>
                    <td className="px-4 py-3 text-right text-brand-orange font-semibold">{formatInt(r.pendientes)}</td>
                    <td className="px-4 py-3 text-right">{formatPct(r.pct_cerrados)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link href={`/atencion/gestiones/reports/${r.id}`} className="text-brand-primary font-semibold hover:underline">
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
