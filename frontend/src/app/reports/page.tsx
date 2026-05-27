"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
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
}

export default function ReportsListPage() {
  const [items, setItems] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ items: ReportSummary[] }>("/api/v1/reports")
      .then((d) => setItems(d.items))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <h1 className="text-2xl font-bold text-brand-secondary mb-1">Reportes</h1>
      <p className="text-sm text-brand-neutral-500 mb-6">Listado de análisis generados.</p>

      {loading && <div>Cargando…</div>}

      {!loading && items.length === 0 && (
        <div className="bg-white border border-brand-neutral-200 rounded-lg p-8 text-center">
          <p className="text-brand-neutral-600">No hay reportes aún.</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="bg-white border border-brand-neutral-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-brand-neutral-100">
              <tr>
                <th className="px-4 py-3 text-left">Período</th>
                <th className="px-4 py-3 text-left">Generado</th>
                <th className="px-4 py-3 text-right">Asegurados</th>
                <th className="px-4 py-3 text-right">Pólizas</th>
                <th className="px-4 py-3 text-right">Saldo</th>
                <th className="px-4 py-3 text-right">Vencido</th>
                <th className="px-4 py-3 text-right">Recupero</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-t border-brand-neutral-200 hover:bg-brand-neutral-50">
                  <td className="px-4 py-3 font-medium">{r.period_month ?? "—"}</td>
                  <td className="px-4 py-3 text-brand-neutral-500">{formatDate(r.generated_at)}</td>
                  <td className="px-4 py-3 text-right">{formatInt(r.asegurados_total)}</td>
                  <td className="px-4 py-3 text-right">{formatInt(r.polizas_total)}</td>
                  <td className="px-4 py-3 text-right">{formatGs(r.saldo_total)}</td>
                  <td className="px-4 py-3 text-right text-brand-accent font-semibold">
                    {formatGs(r.vencido_total)}
                  </td>
                  <td className="px-4 py-3 text-right text-brand-primary font-semibold">
                    {formatGs(r.recupero_total)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/reports/${r.id}`} className="text-brand-primary hover:underline font-medium">
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
