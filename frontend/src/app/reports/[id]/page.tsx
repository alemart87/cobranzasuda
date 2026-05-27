"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { CarteraDonut } from "@/components/charts/CarteraDonut";
import { TramosBarChart } from "@/components/charts/TramosBarChart";
import { TopDeudoresTable } from "@/components/charts/TopDeudoresTable";
import { RecuperoFunnel } from "@/components/charts/RecuperoFunnel";
import { OrganizadorBars } from "@/components/charts/OrganizadorBars";
import { apiFetch } from "@/lib/api";
import { formatDate, formatGs, formatInt, formatPct } from "@/lib/format";

interface ReportDetail {
  id: string;
  period_month: string | null;
  generated_at: string;
  asegurados_total: number;
  polizas_total: number;
  saldo_total: number;
  vencido_total: number;
  asegurados_en_mora: number;
  recupero_total: number;
  asegurados_pagaron: number;
  data: {
    cartera: {
      kpis: any;
      tramos: any[];
      top_deudores: any[];
      organizadores: any[];
      secciones: any[];
    };
    recupero: { kpis: any };
    proyeccion_total: any;
  };
}

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ReportDetail>(`/api/v1/reports/${params.id}`)
      .then(setReport)
      .catch((e) => setError(e.message));
  }, [params.id]);

  if (error)
    return (
      <AppShell>
        <div className="text-brand-primary">{error}</div>
      </AppShell>
    );
  if (!report)
    return (
      <AppShell>
        <div className="text-brand-slate">Cargando reporte…</div>
      </AppShell>
    );

  const aVencer =
    (report.data?.cartera?.kpis?.a_vencer_total as number) ??
    report.saldo_total - report.vencido_total;
  const r = report.data.recupero.kpis;

  return (
    <AppShell>
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-3xl text-brand-ink uppercase">
            Reporte de Cobranzas
          </h1>
          <p className="text-sm text-brand-slate mt-1">
            Período: <b>{report.period_month ?? "—"}</b> · Generado:{" "}
            {formatDate(report.generated_at)}
          </p>
        </div>
      </div>

      {/* KPIs hero */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Asegurados únicos" value={formatInt(report.asegurados_total)} accent="primary" />
        <KpiCard label="Pólizas" value={formatInt(report.polizas_total)} accent="neutral" />
        <KpiCard label="Saldo total" value={formatGs(report.saldo_total)} accent="secondary" />
        <KpiCard
          label="Saldo en mora"
          value={formatGs(report.vencido_total)}
          hint={`${report.asegurados_en_mora} asegurados`}
          accent="danger"
        />
      </div>

      {/* 1. Cartera vs Vencido */}
      <section className="card p-6 mb-6">
        <h2 className="font-display text-xl text-brand-ink uppercase mb-4">
          1. Cartera vs Vencido
        </h2>
        <div className="grid md:grid-cols-2 gap-6 items-center">
          <CarteraDonut aVencer={aVencer} vencido={report.vencido_total} />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>A vencer (vigente)</span>
              <b>{formatGs(aVencer)}</b>
            </div>
            <div className="flex justify-between text-brand-primary">
              <span>Vencido (mora)</span>
              <b>{formatGs(report.vencido_total)}</b>
            </div>
            <div className="border-t border-brand-border pt-2 flex justify-between">
              <span>Total</span>
              <b>{formatGs(report.saldo_total)}</b>
            </div>
            <div className="text-xs text-brand-slate mt-3">
              {formatPct((report.vencido_total / report.saldo_total) * 100)} de la cartera
              está en mora.
            </div>
          </div>
        </div>
      </section>

      {/* 2. Tramos */}
      <section className="card p-6 mb-6">
        <h2 className="font-display text-xl text-brand-ink uppercase mb-4">
          2. Distribución del vencido por tramo
        </h2>
        <TramosBarChart tramos={report.data.cartera.tramos} />
      </section>

      {/* 3. Top deudores */}
      <section className="card p-6 mb-6">
        <h2 className="font-display text-xl text-brand-ink uppercase mb-4">
          3. Top 10 deudores en mora
        </h2>
        <TopDeudoresTable deudores={report.data.cartera.top_deudores} />
      </section>

      {/* 4. Recupero funnel */}
      <section className="card p-6 mb-6">
        <h2 className="font-display text-xl text-brand-ink uppercase mb-4">
          4. Recupero del mes
        </h2>
        <RecuperoFunnel
          vencidoTotal={r.vencido_total}
          recuperoTotal={r.recupero_total}
          pctRecuperoTotal={r.pct_recupero_total_vs_vencido ?? 0}
          asegPagaron={r.asegurados_pagaron ?? 0}
          asegEnMora={r.asegurados_en_mora ?? 0}
        />
        <div className="grid md:grid-cols-3 gap-4 mt-6">
          <KpiCard
            label="Recupero total"
            value={formatGs(r.recupero_total)}
            hint={`${r.total_pagos} pagos cruzados`}
            accent="primary"
          />
          <KpiCard
            label="Asegurados que pagaron"
            value={formatInt(r.asegurados_pagaron)}
            accent="cyan"
          />
          <KpiCard
            label="% s/ vencido"
            value={`${(r.pct_recupero_total_vs_vencido ?? 0).toFixed(1)} %`}
            hint="recupero total / saldo en mora"
            accent="secondary"
          />
        </div>
      </section>

      {/* 5. Por organizador */}
      <section className="card p-6 mb-6">
        <h2 className="font-display text-xl text-brand-ink uppercase mb-4">
          5. Top 10 organizadores
        </h2>
        <OrganizadorBars organizadores={report.data.cartera.organizadores} />
      </section>

      {/* Proyección */}
      {report.data.proyeccion_total && (
        <section className="card p-6 mb-6">
          <h2 className="font-display text-xl text-brand-ink uppercase mb-2">
            Perspectiva al cierre de mes
          </h2>
          <p className="text-xs text-brand-slate mb-4">
            Proyección manteniendo ritmo actual + 30 % de incremento en los últimos{" "}
            {report.data.proyeccion_total.dias_boost} días del mes.
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            <KpiCard
              label="Ejecutado al día"
              value={formatGs(report.data.proyeccion_total.ejecutado)}
              accent="neutral"
            />
            <KpiCard
              label="Adicional proyectado"
              value={formatGs(
                report.data.proyeccion_total.adicional_normal +
                  report.data.proyeccion_total.adicional_boost,
              )}
              accent="primary"
            />
            <KpiCard
              label="Total proyectado al cierre"
              value={formatGs(report.data.proyeccion_total.proyectado_total)}
              accent="primary"
            />
          </div>
        </section>
      )}
    </AppShell>
  );
}
