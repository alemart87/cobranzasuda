"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { apiFetch, getUser } from "@/lib/api";
import { formatDate, formatGs, formatInt } from "@/lib/format";

interface ReportSummary {
  id: string;
  period_month: string | null;
  generated_at: string;
  asegurados_total: number;
  polizas_total: number;
  saldo_total: number;
  vencido_total: number;
  recupero_total: number;
  is_published: boolean;
  title: string | null;
}

export default function ReportsListPage() {
  const [items, setItems] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    setUser(getUser());
    load();
  }, []);

  const load = () =>
    apiFetch<{ items: ReportSummary[] }>("/api/v1/reports")
      .then((d) => setItems(d.items))
      .finally(() => setLoading(false));

  const togglePublish = async (r: ReportSummary) => {
    await apiFetch(`/api/v1/reports/${r.id}/publish`, {
      method: "POST",
      body: JSON.stringify({ is_published: !r.is_published }),
    });
    load();
  };

  const deleteReport = async (r: ReportSummary) => {
    if (!confirm(`¿Eliminar reporte de ${r.period_month ?? "sin período"}?`)) return;
    await apiFetch(`/api/v1/reports/${r.id}`, { method: "DELETE" });
    load();
  };

  const canManage = user && (user.role === "superadmin" || user.role === "analyst");

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl text-brand-ink uppercase">Reportes de Cobranzas</h1>
          <p className="text-sm text-brand-slate mt-1">
            {user?.role === "client"
              ? "Reportes publicados disponibles para visualización."
              : "Gestione publicación y visibilidad de los reportes."}
          </p>
        </div>
        {canManage && (
          <Link href="/upload" className="btn-primary">+ Subir nuevo</Link>
        )}
      </div>

      {loading && <div className="text-brand-slate">Cargando…</div>}

      {!loading && items.length === 0 && (
        <div className="card p-12 text-center">
          <p className="text-brand-slate">No hay reportes disponibles.</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-brand-bg border-b border-brand-border">
              <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                <th className="px-4 py-3 text-left">Período</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-right">Asegurados</th>
                <th className="px-4 py-3 text-right">Saldo</th>
                <th className="px-4 py-3 text-right">Vencido</th>
                <th className="px-4 py-3 text-right">Recupero</th>
                <th className="px-4 py-3 text-left">Generado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-t border-brand-border hover:bg-brand-bg-soft">
                  <td className="px-4 py-3 font-semibold text-brand-ink">{r.period_month ?? "—"}</td>
                  <td className="px-4 py-3">
                    {r.is_published ? (
                      <span className="badge-success">Publicado</span>
                    ) : (
                      <span className="badge-neutral">Borrador</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">{formatInt(r.asegurados_total)}</td>
                  <td className="px-4 py-3 text-right text-brand-slate">{formatGs(r.saldo_total)}</td>
                  <td className="px-4 py-3 text-right text-brand-primary font-semibold">{formatGs(r.vencido_total)}</td>
                  <td className="px-4 py-3 text-right text-brand-cyan font-semibold">{formatGs(r.recupero_total)}</td>
                  <td className="px-4 py-3 text-xs text-brand-slate">{formatDate(r.generated_at)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {canManage && (
                      <>
                        <button onClick={() => togglePublish(r)} className="text-xs px-2.5 py-1 mr-1 rounded border border-brand-border hover:border-brand-cyan hover:text-brand-cyan">
                          {r.is_published ? "Despublicar" : "Publicar"}
                        </button>
                        <button onClick={() => deleteReport(r)} className="text-xs px-2.5 py-1 mr-1 rounded border border-brand-border hover:border-brand-primary hover:text-brand-primary">
                          Eliminar
                        </button>
                      </>
                    )}
                    <Link href={`/reports/${r.id}`} className="text-brand-primary font-semibold hover:underline">
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
