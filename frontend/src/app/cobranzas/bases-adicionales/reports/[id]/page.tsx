"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { apiFetch, getUser } from "@/lib/api";
import { formatDate, formatGs, formatInt } from "@/lib/format";

interface ReportDetail {
  id: string;
  upload_id: string;
  tipo: string;
  period_month: string | null;
  generated_at: string;
  polizas: number;
  asegurados: number;
  saldo_total: number;
  is_published: boolean;
  title: string | null;
  data: {
    kpis: Record<string, number>;
    tramos: { tramo: string; monto: number }[];
    top_deudores: { asegurado: string; saldo: number }[];
    polizas_detalle: any[];
  };
}

const TIPO_LABELS: Record<string, string> = {
  debitos_automaticos: "Débitos Automáticos",
  bancard: "Bancard",
};

export default function BaseAdicionalReportDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    setUser(getUser());
    apiFetch<ReportDetail>(`/api/v1/bases-adicionales/reports/${id}`)
      .then(setReport)
      .finally(() => setLoading(false));
  }, [id]);

  const togglePublish = async () => {
    if (!report) return;
    const updated = await apiFetch<ReportDetail>(
      `/api/v1/bases-adicionales/reports/${id}/publish`,
      {
        method: "POST",
        body: JSON.stringify({ is_published: !report.is_published }),
      },
    );
    setReport({ ...report, is_published: updated.is_published });
  };

  if (loading) {
    return (
      <AppShell>
        <div className="text-brand-slate">Cargando…</div>
      </AppShell>
    );
  }

  if (!report) {
    return (
      <AppShell>
        <div className="card p-8">
          <p className="text-brand-slate">No se encontró el reporte.</p>
        </div>
      </AppShell>
    );
  }

  const canManage = user && (user.role === "superadmin" || user.role === "analyst");
  const tipoLabel = TIPO_LABELS[report.tipo] ?? report.tipo;
  const tramoChart = (report.data.tramos || []).map((t) => ({
    tramo: t.tramo,
    monto: Number(t.monto),
  }));

  return (
    <AppShell>
      <div className="mb-2 text-xs text-brand-slate">
        <Link href="/operativas" className="hover:text-brand-primary">Operativas</Link>
        <span className="mx-2">/</span>
        <Link href="/cobranzas" className="hover:text-brand-primary">Cobranzas</Link>
        <span className="mx-2">/</span>
        <Link href="/cobranzas/bases-adicionales" className="hover:text-brand-primary">
          Bases Adicionales
        </Link>
        <span className="mx-2">/</span>
        <span className="text-brand-ink font-semibold">{tipoLabel}</span>
      </div>

      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl text-brand-ink uppercase">
            Base — {tipoLabel}
          </h1>
          <p className="text-sm text-brand-slate mt-1">
            Período: <b>{report.period_month ?? "—"}</b> · Generado: {formatDate(report.generated_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {report.is_published ? (
            <span className="badge-success">Publicado</span>
          ) : (
            <span className="badge-neutral">Borrador</span>
          )}
          {canManage && (
            <button onClick={togglePublish} className="btn-secondary">
              {report.is_published ? "Despublicar" : "Publicar"}
            </button>
          )}
        </div>
      </div>

      {/* Banners institucionales */}
      <div className="grid md:grid-cols-2 gap-3 mb-8">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-md px-4 py-3 flex items-start gap-2.5">
          <span className="text-amber-500 text-base leading-5">⚠</span>
          <div>
            <div className="font-semibold">Sin aplicación de pagos</div>
            <div className="text-xs mt-0.5">
              Sudameris Seguros no enviará pagos para aplicar a estas bases.
            </div>
          </div>
        </div>
        <div className="bg-brand-cyan/10 border border-brand-cyan/30 text-brand-cyan text-sm rounded-md px-4 py-3 flex items-start gap-2.5">
          <span className="text-brand-cyan text-base leading-5">🔧</span>
          <div>
            <div className="font-semibold">En proceso de desarrollo</div>
            <div className="text-xs mt-0.5">
              Cruce con base de gestiones · próximamente disponible.
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <section className="mb-8">
        <h2 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold mb-3">
          Composición de la cartera
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Pólizas" value={formatInt(report.polizas)} accent="secondary" />
          <KpiCard label="Asegurados" value={formatInt(report.asegurados)} accent="cyan" />
          <KpiCard label="Saldo total" value={formatGs(report.saldo_total)} accent="primary" />
          <KpiCard
            label="Ticket promedio"
            value={formatGs(report.polizas ? report.saldo_total / report.polizas : 0)}
            hint="por póliza"
            accent="purple"
          />
        </div>
      </section>

      {/* Tramos */}
      <section className="grid lg:grid-cols-5 gap-6 mb-8">
        <div className="lg:col-span-3 card p-5">
          <h3 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold mb-3">
            Distribución por tramo de mora
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={tramoChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="tramo" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`}
              />
              <Tooltip
                formatter={(v: any) => formatGs(Number(v))}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="monto" fill="#E6332A" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="lg:col-span-2 card p-5">
          <h3 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold mb-3">
            Detalle por tramo
          </h3>
          <table className="w-full text-sm">
            <tbody>
              {tramoChart.map((t) => {
                const pct = report.saldo_total
                  ? (t.monto / report.saldo_total) * 100
                  : 0;
                return (
                  <tr key={t.tramo} className="border-t border-brand-border first:border-t-0">
                    <td className="py-2 text-brand-slate">{t.tramo}</td>
                    <td className="py-2 text-right font-semibold text-brand-ink">
                      {formatGs(t.monto)}
                    </td>
                    <td className="py-2 text-right text-xs text-brand-slate w-14">
                      {pct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top deudores */}
      {report.data.top_deudores && report.data.top_deudores.length > 0 && (
        <section className="mb-8">
          <h2 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold mb-3">
            Top 20 deudores
          </h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-brand-bg border-b border-brand-border">
                <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                  <th className="px-4 py-3 text-left w-10">#</th>
                  <th className="px-4 py-3 text-left">Asegurado</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {report.data.top_deudores.map((d, i) => (
                  <tr key={i} className="border-t border-brand-border hover:bg-brand-bg-soft">
                    <td className="px-4 py-2.5 text-brand-slate">{i + 1}</td>
                    <td className="px-4 py-2.5 font-semibold text-brand-ink">{d.asegurado}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-brand-primary">
                      {formatGs(d.saldo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="text-xs text-brand-slate">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-mist" />
          Pólizas guardadas para cruce futuro con gestiones:{" "}
          <b>{formatInt(report.data.polizas_detalle?.length || 0)}</b>
        </div>
      </section>
    </AppShell>
  );
}
