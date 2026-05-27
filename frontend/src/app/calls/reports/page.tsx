"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { formatDate, formatInt } from "@/lib/format";

interface CallReportSummary {
  id: string;
  period_month: string | null;
  generated_at: string;
  total_llamadas: number;
  asesores_activos: number;
  dias_operativos: number;
  efectivas_total: number;
  total_talk_seg: number;
}

function secToHours(s: number) {
  return (s / 3600).toFixed(1);
}

export default function CallReportsListPage() {
  const [items, setItems] = useState<CallReportSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ items: CallReportSummary[] }>("/api/v1/calls/reports")
      .then((d) => setItems(d.items))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <h1 className="text-2xl font-bold text-brand-secondary mb-1">Reportes de Llamadas</h1>
      <p className="text-sm text-brand-neutral-500 mb-6">
        Histórico de reportes de contact center.
      </p>

      {loading && <div>Cargando…</div>}

      {!loading && items.length === 0 && (
        <div className="bg-white border border-brand-neutral-200 rounded-lg p-8 text-center">
          <p className="text-brand-neutral-600 mb-4">No hay reportes de llamadas aún.</p>
          <Link
            href="/calls/upload"
            className="inline-block bg-brand-primary text-white px-4 py-2 rounded-md hover:bg-brand-secondary"
          >
            Subir primer archivo
          </Link>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="bg-white border border-brand-neutral-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-brand-neutral-100">
              <tr>
                <th className="px-4 py-3 text-left">Período</th>
                <th className="px-4 py-3 text-left">Generado</th>
                <th className="px-4 py-3 text-right">Llamadas</th>
                <th className="px-4 py-3 text-right">Asesores</th>
                <th className="px-4 py-3 text-right">Días</th>
                <th className="px-4 py-3 text-right">Efectivas</th>
                <th className="px-4 py-3 text-right">Talk (hs)</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-t border-brand-neutral-200 hover:bg-brand-neutral-50">
                  <td className="px-4 py-3 font-medium">{r.period_month ?? "—"}</td>
                  <td className="px-4 py-3 text-brand-neutral-500">{formatDate(r.generated_at)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatInt(r.total_llamadas)}</td>
                  <td className="px-4 py-3 text-right">{r.asesores_activos}</td>
                  <td className="px-4 py-3 text-right">{r.dias_operativos}</td>
                  <td className="px-4 py-3 text-right text-brand-primary font-semibold">
                    {formatInt(r.efectivas_total)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{secToHours(r.total_talk_seg)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/calls/reports/${r.id}`}
                      className="text-brand-primary hover:underline font-medium"
                    >
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
