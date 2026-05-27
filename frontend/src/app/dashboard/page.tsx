"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
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
  asegurados_en_mora: number;
  recupero_total: number;
  recupero_sobre_mora: number;
  is_published: boolean;
}

interface CallSummary {
  id: string;
  period_month: string | null;
  total_llamadas: number;
  total_talk_seg: number;
  asesores_activos: number;
  is_published: boolean;
}

export default function DashboardPage() {
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [calls, setCalls] = useState<CallSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    setUser(getUser());
    Promise.all([
      apiFetch<{ items: ReportSummary[] }>("/api/v1/reports").then((d) => setReport(d.items[0] ?? null)),
      apiFetch<{ items: CallSummary[] }>("/api/v1/calls/reports").then((d) => setCalls(d.items[0] ?? null)),
    ]).finally(() => setLoading(false));
  }, []);

  const isClient = user?.role === "client";

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="font-display text-4xl text-brand-ink uppercase">
          Hola, <span className="text-brand-primary">{user?.full_name?.split(" ")[0] ?? ""}</span>
        </h1>
        <p className="text-sm text-brand-slate mt-1">
          {isClient
            ? "Reportes más recientes publicados para visualización."
            : "Resumen ejecutivo de los reportes más recientes."}
        </p>
      </div>

      {loading && <div className="text-brand-slate">Cargando…</div>}

      {!loading && !report && !calls && (
        <div className="card p-12 text-center">
          <p className="text-brand-slate mb-4">
            {isClient ? "Aún no hay reportes publicados." : "No hay reportes generados todavía."}
          </p>
          {!isClient && (
            <Link href="/upload" className="btn-primary">+ Subir primer archivo</Link>
          )}
        </div>
      )}

      {/* Cobranzas */}
      {report && (
        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-display text-2xl text-brand-ink uppercase">
              Cobranzas <span className="text-brand-slate text-base ml-2">· {report.period_month}</span>
            </h2>
            <Link href={`/reports/${report.id}`} className="text-sm font-semibold text-brand-primary hover:underline">
              Ver reporte completo →
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="Asegurados" value={formatInt(report.asegurados_total)} accent="primary" />
            <KpiCard label="Saldo total" value={formatGs(report.saldo_total)} accent="secondary" />
            <KpiCard label="Saldo en mora" value={formatGs(report.vencido_total)} hint={`${report.asegurados_en_mora} asegurados`} accent="danger" />
            <KpiCard label="Recupero del mes" value={formatGs(report.recupero_total)} accent="cyan" />
          </div>
        </section>
      )}

      {/* Llamadas */}
      {calls && (
        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-display text-2xl text-brand-ink uppercase">
              Llamadas <span className="text-brand-slate text-base ml-2">· {calls.period_month}</span>
            </h2>
            <Link href={`/calls/reports/${calls.id}`} className="text-sm font-semibold text-brand-primary hover:underline">
              Ver reporte completo →
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KpiCard label="Total llamadas" value={formatInt(calls.total_llamadas)} accent="cyan" />
            <KpiCard label="Talk time" value={`${(calls.total_talk_seg / 3600).toFixed(1)} hs`} accent="purple" />
            <KpiCard label="Asesores activos" value={`${calls.asesores_activos}`} accent="orange" />
          </div>
        </section>
      )}
    </AppShell>
  );
}
