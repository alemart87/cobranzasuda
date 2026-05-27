"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { apiFetch } from "@/lib/api";
import { formatGs, formatInt, formatDate } from "@/lib/format";

interface ReportSummary {
  id: string;
  period_month: string | null;
  generated_at: string;
  asegurados_total: number;
  polizas_total: number;
  saldo_total: number;
  vencido_total: number;
  asegurados_en_mora: number;
  recupero_total: number;
  recupero_sobre_mora: number;
}

export default function DashboardPage() {
  const [latest, setLatest] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ items: ReportSummary[] }>("/api/v1/reports")
      .then((data) => setLatest(data.items[0] ?? null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-secondary">Dashboard</h1>
        <p className="text-sm text-brand-neutral-500">Resumen del reporte más reciente</p>
      </div>

      {loading && <div className="text-brand-neutral-500">Cargando…</div>}

      {!loading && !latest && (
        <div className="bg-white border border-brand-neutral-200 rounded-lg p-8 text-center">
          <p className="text-brand-neutral-600 mb-4">
            No hay reportes generados todavía.
          </p>
          <Link
            href="/upload"
            className="inline-block bg-brand-primary text-white px-4 py-2 rounded-md font-medium hover:bg-brand-secondary"
          >
            Subir primer archivo
          </Link>
        </div>
      )}

      {!loading && latest && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard label="Asegurados únicos" value={formatInt(latest.asegurados_total)} accent="primary" />
            <KpiCard label="Pólizas" value={formatInt(latest.polizas_total)} accent="neutral" />
            <KpiCard label="Saldo total cartera" value={formatGs(latest.saldo_total)} accent="secondary" />
            <KpiCard label="Saldo en mora" value={formatGs(latest.vencido_total)} accent="danger" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <KpiCard
              label="Asegurados en mora"
              value={formatInt(latest.asegurados_en_mora)}
              accent="danger"
            />
            <KpiCard
              label="Recupero del mes"
              value={formatGs(latest.recupero_total)}
              accent="primary"
            />
            <KpiCard
              label="Recupero efectivo sobre mora"
              value={formatGs(latest.recupero_sobre_mora)}
              accent="primary"
            />
          </div>
          <div className="bg-white border border-brand-neutral-200 rounded-lg p-6">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-lg font-semibold text-brand-secondary">Último reporte</h2>
              <span className="text-xs text-brand-neutral-500">
                Generado: {formatDate(latest.generated_at)}
              </span>
            </div>
            <Link
              href={`/reports/${latest.id}`}
              className="inline-block bg-brand-primary text-white px-4 py-2 rounded-md font-medium hover:bg-brand-secondary"
            >
              Ver reporte completo →
            </Link>
          </div>
        </>
      )}
    </AppShell>
  );
}
