"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { apiFetch, getUser } from "@/lib/api";
import { formatDate, formatInt } from "@/lib/format";

interface GestionReportSummary {
  id: string;
  period_month: string | null;
  generated_at: string;
  total_gestiones: number;
  asesores_activos: number;
  promesas_totales: number;
  cobros_totales: number;
  pct_promesas_cumplidas: number;
  is_published: boolean;
}

export default function GestionReportsListPage() {
  const [items, setItems] = useState<GestionReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    setUser(getUser());
    load();
  }, []);

  const load = () =>
    apiFetch<{ items: GestionReportSummary[] }>("/api/v1/gestiones/reports")
      .then((d) => setItems(d.items))
      .finally(() => setLoading(false));

  const togglePublish = async (r: GestionReportSummary) => {
    await apiFetch(`/api/v1/gestiones/reports/${r.id}/publish`, {
      method: "POST",
      body: JSON.stringify({ is_published: !r.is_published }),
    });
    load();
  };

  const del = async (r: GestionReportSummary) => {
    if (!confirm(`¿Eliminar reporte de gestiones de ${r.period_month ?? "sin período"}?`)) return;
    await apiFetch(`/api/v1/gestiones/reports/${r.id}`, { method: "DELETE" });
    load();
  };

  const canManage = user && (user.role === "superadmin" || user.role === "analyst");

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl text-brand-ink uppercase">Reportes de Gestiones</h1>
          <p className="text-sm text-brand-slate mt-1">
            Operativo del CRM: gestiones, promesas, cobros y cumplimiento por asesor.
          </p>
        </div>
        {canManage && <Link href="/gestiones/upload" className="btn-primary">+ Subir nuevo</Link>}
      </div>

      {loading && <div className="text-brand-slate">Cargando…</div>}

      {!loading && items.length === 0 && (
        <div className="card p-12 text-center">
          <p className="text-brand-slate">No hay reportes de gestiones aún.</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-brand-bg border-b border-brand-border">
              <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                <th className="px-4 py-3 text-left">Período</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-right">Gestiones</th>
                <th className="px-4 py-3 text-right">Asesores</th>
                <th className="px-4 py-3 text-right">Promesas</th>
                <th className="px-4 py-3 text-right">Cobros</th>
                <th className="px-4 py-3 text-right">% Cumpl.</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-t border-brand-border hover:bg-brand-bg-soft">
                  <td className="px-4 py-3 font-semibold text-brand-ink">{r.period_month ?? "—"}</td>
                  <td className="px-4 py-3">
                    {r.is_published ? <span className="badge-success">Publicado</span> : <span className="badge-neutral">Borrador</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{formatInt(r.total_gestiones)}</td>
                  <td className="px-4 py-3 text-right">{r.asesores_activos}</td>
                  <td className="px-4 py-3 text-right text-brand-cyan font-semibold">{formatInt(r.promesas_totales)}</td>
                  <td className="px-4 py-3 text-right text-brand-primary font-semibold">{formatInt(r.cobros_totales)}</td>
                  <td className="px-4 py-3 text-right font-mono">{r.pct_promesas_cumplidas.toFixed(1)} %</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {canManage && (
                      <>
                        <button onClick={() => togglePublish(r)} className="text-xs px-2.5 py-1 mr-1 rounded border border-brand-border hover:border-brand-cyan hover:text-brand-cyan">
                          {r.is_published ? "Despublicar" : "Publicar"}
                        </button>
                        <button onClick={() => del(r)} className="text-xs px-2.5 py-1 mr-1 rounded border border-brand-border hover:border-brand-primary hover:text-brand-primary">
                          Eliminar
                        </button>
                      </>
                    )}
                    <Link href={`/gestiones/reports/${r.id}`} className="text-brand-primary font-semibold hover:underline">
                      Ver →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
