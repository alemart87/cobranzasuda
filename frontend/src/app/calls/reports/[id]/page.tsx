"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { PrintButton, PrintHeader } from "@/components/PrintButton";
import { AsesoresDetalleTabla } from "@/components/charts/AsesoresDetalleTabla";
import { AsesoresLlamadasChart } from "@/components/charts/AsesoresLlamadasChart";
import { LlamadasPorDiaChart } from "@/components/charts/LlamadasPorDiaChart";
import { TalkPorDiaChart } from "@/components/charts/TalkPorDiaChart";
import { apiFetch } from "@/lib/api";
import { formatDate, formatInt } from "@/lib/format";

interface CallReportDetail {
  id: string;
  period_month: string | null;
  generated_at: string;
  total_llamadas: number;
  asesores_activos: number;
  dias_operativos: number;
  efectivas_total: number;
  total_talk_seg: number;
  aht_seg: number;
  data: {
    kpis: {
      total_llamadas: number;
      total_talk_hms: string;
      total_talk_horas: number;
      efectivas_total: number;
      no_efectivas_total: number;
      pct_efectivas: number;
      aht_hms: string;
      promedio_diario: number;
      dias_operativos: number;
      asesores_activos: number;
      umbral_efectivo_seg: number;
    };
    asesores: Array<any>;
    serie_diaria_llamadas: Array<Record<string, any>>;
    serie_diaria_talk: Array<Record<string, any>>;
    usuarios: string[];
  };
}

export default function CallReportDetailPage() {
  const params = useParams<{ id: string }>();
  const [report, setReport] = useState<CallReportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<CallReportDetail>(`/api/v1/calls/reports/${params.id}`)
      .then(setReport)
      .catch((e) => setError(e.message));
  }, [params.id]);

  if (error)
    return (
      <AppShell>
        <div className="text-red-600">{error}</div>
      </AppShell>
    );
  if (!report)
    return (
      <AppShell>
        <div>Cargando reporte…</div>
      </AppShell>
    );

  const k = report.data.kpis;

  return (
    <AppShell>
      <PrintHeader titulo="Reporte de Llamadas" subtitulo={`Período: ${report.period_month ?? "—"} · Generado: ${formatDate(report.generated_at)}`} />
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-secondary">Reporte de Llamadas</h1>
          <p className="text-sm text-brand-neutral-500">
            Período: <b>{report.period_month ?? "—"}</b> · Generado: {formatDate(report.generated_at)}
          </p>
        </div>
        <PrintButton />
      </div>

      {/* KPIs equipo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Total llamadas" value={formatInt(k.total_llamadas)} accent="primary" />
        <KpiCard
          label="Talk Time total"
          value={k.total_talk_hms}
          hint={`${k.total_talk_horas} hs`}
          accent="secondary"
        />
        <KpiCard
          label="Llamadas efectivas"
          value={formatInt(k.efectivas_total)}
          hint={`${k.pct_efectivas} % del total (> ${k.umbral_efectivo_seg}s)`}
          accent="primary"
        />
        <KpiCard label="AHT (efectivas)" value={k.aht_hms} accent="neutral" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <KpiCard
          label="Asesores activos"
          value={`${report.asesores_activos}`}
          accent="neutral"
        />
        <KpiCard
          label="Días operativos"
          value={`${report.dias_operativos}`}
          accent="neutral"
        />
        <KpiCard
          label="Promedio llamadas/día"
          value={`${k.promedio_diario}`}
          accent="primary"
        />
      </div>

      {/* Llamadas por día por asesor */}
      <section className="bg-white border border-brand-neutral-200 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-brand-secondary mb-1">
          Llamadas por día y asesor
        </h2>
        <p className="text-xs text-brand-neutral-500 mb-4">
          Barras apiladas: cada color es un operador, altura total = llamadas del día.
        </p>
        <LlamadasPorDiaChart
          data={report.data.serie_diaria_llamadas}
          usuarios={report.data.usuarios}
        />
      </section>

      {/* Talk time por día */}
      <section className="bg-white border border-brand-neutral-200 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-brand-secondary mb-1">
          Tiempo en línea por día (Talk Time)
        </h2>
        <p className="text-xs text-brand-neutral-500 mb-4">
          Minutos en conversación por operador y día.
        </p>
        <TalkPorDiaChart
          data={report.data.serie_diaria_talk}
          usuarios={report.data.usuarios}
        />
      </section>

      {/* Ranking por operador (barras + tabla) */}
      <section className="bg-white border border-brand-neutral-200 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-brand-secondary mb-4">
          Distribución por operador
        </h2>
        <AsesoresLlamadasChart asesores={report.data.asesores} />
      </section>

      <section className="bg-white border border-brand-neutral-200 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-brand-secondary mb-4">
          Detalle por operador
        </h2>
        <AsesoresDetalleTabla asesores={report.data.asesores} />
      </section>
    </AppShell>
  );
}
