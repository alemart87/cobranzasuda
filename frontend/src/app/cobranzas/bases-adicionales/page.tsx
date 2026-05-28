"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { apiFetch, getUser } from "@/lib/api";
import { formatDate, formatGs, formatInt } from "@/lib/format";

interface ReportSummary {
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
}

const TIPOS = [
  {
    slug: "debitos_automaticos",
    label: "Débitos Automáticos",
    short: "Banca",
    description:
      "Cartera de débitos automáticos vía banca. Se gestiona pero no recibe pagos directos.",
    accent: "cyan" as const,
  },
  {
    slug: "bancard",
    label: "Bancard",
    short: "Bancard",
    description:
      "Cartera Bancard. Se gestiona pero no recibe pagos directos.",
    accent: "purple" as const,
  },
];

const ACCENT_CLS = {
  cyan: { bar: "bg-brand-cyan", badge: "bg-brand-cyan/10 text-brand-cyan" },
  purple: { bar: "bg-brand-purple", badge: "bg-brand-purple/10 text-brand-purple" },
} as const;

export default function BasesAdicionalesHubPage() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(getUser());
    apiFetch<{ items: ReportSummary[] }>("/api/v1/bases-adicionales/reports")
      .then((d) => setReports(d.items))
      .finally(() => setLoading(false));
  }, []);

  const canManage = user && (user.role === "superadmin" || user.role === "analyst");

  const latestByTipo = (tipo: string) =>
    reports.find((r) => r.tipo === tipo) ?? null;

  return (
    <AppShell>
      <div className="mb-2 text-xs text-brand-slate">
        <Link href="/operativas" className="hover:text-brand-primary">Operativas</Link>
        <span className="mx-2">/</span>
        <Link href="/cobranzas" className="hover:text-brand-primary">Cobranzas</Link>
        <span className="mx-2">/</span>
        <span className="text-brand-ink font-semibold">Bases Adicionales</span>
      </div>

      <div className="mb-8">
        <h1 className="font-display text-4xl text-brand-ink uppercase">Bases Adicionales</h1>
        <p className="text-sm text-brand-slate mt-1 max-w-3xl">
          Carteras complementarias que se gestionan operativamente pero no reciben pagos.
          La información se guarda para futuros cruces con la base de gestiones.
        </p>
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

      {loading && <div className="text-brand-slate">Cargando…</div>}

      <div className="grid md:grid-cols-2 gap-5">
        {TIPOS.map((t) => {
          const latest = latestByTipo(t.slug);
          const v = ACCENT_CLS[t.accent];
          return (
            <div key={t.slug} className="card p-6 relative overflow-hidden">
              <div className={`absolute top-0 left-0 right-0 h-1.5 ${v.bar}`} />
              <div className="flex items-start justify-between mb-3 mt-1">
                <div>
                  <h2 className="font-display text-2xl text-brand-ink uppercase">{t.label}</h2>
                  <p className="text-xs text-brand-slate mt-1 max-w-md">{t.description}</p>
                </div>
                <span className={`text-[10px] uppercase tracking-wider2 font-semibold px-2 py-1 rounded ${v.badge}`}>
                  {t.short}
                </span>
              </div>

              {latest ? (
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider2 text-brand-slate">Pólizas</div>
                      <div className="font-display text-xl text-brand-ink">{formatInt(latest.polizas)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider2 text-brand-slate">Asegurados</div>
                      <div className="font-display text-xl text-brand-ink">{formatInt(latest.asegurados)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider2 text-brand-slate">Saldo</div>
                      <div className="font-display text-xl text-brand-ink">{formatGs(latest.saldo_total)}</div>
                    </div>
                  </div>
                  <div className="text-[11px] text-brand-slate flex items-center gap-2">
                    {latest.is_published ? (
                      <span className="badge-success">Publicado</span>
                    ) : (
                      <span className="badge-neutral">Borrador</span>
                    )}
                    <span>· Período {latest.period_month ?? "—"} · {formatDate(latest.generated_at)}</span>
                  </div>
                  <div className="flex gap-2 pt-2 border-t border-brand-border">
                    <Link
                      href={`/cobranzas/bases-adicionales/reports/${latest.id}`}
                      className="text-sm text-brand-primary font-semibold hover:underline"
                    >
                      Ver último reporte →
                    </Link>
                    {canManage && (
                      <Link
                        href={`/cobranzas/bases-adicionales/upload/${t.slug}`}
                        className="text-sm text-brand-slate hover:text-brand-ink ml-auto"
                      >
                        + Cargar nuevo
                      </Link>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <div className="text-sm text-brand-slate italic mb-3">
                    Sin reportes cargados aún.
                  </div>
                  {canManage && (
                    <Link
                      href={`/cobranzas/bases-adicionales/upload/${t.slug}`}
                      className="btn-primary inline-block"
                    >
                      Cargar primera base
                    </Link>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Listado completo */}
      {reports.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold mb-3">
            Todos los reportes
          </h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-brand-bg border-b border-brand-border">
                <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                  <th className="px-4 py-3 text-left">Base</th>
                  <th className="px-4 py-3 text-left">Período</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-right">Pólizas</th>
                  <th className="px-4 py-3 text-right">Asegurados</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => {
                  const t = TIPOS.find((x) => x.slug === r.tipo);
                  return (
                    <tr key={r.id} className="border-t border-brand-border hover:bg-brand-bg-soft">
                      <td className="px-4 py-3 font-semibold text-brand-ink">{t?.label ?? r.tipo}</td>
                      <td className="px-4 py-3">{r.period_month ?? "—"}</td>
                      <td className="px-4 py-3">
                        {r.is_published ? (
                          <span className="badge-success">Publicado</span>
                        ) : (
                          <span className="badge-neutral">Borrador</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">{formatInt(r.polizas)}</td>
                      <td className="px-4 py-3 text-right">{formatInt(r.asegurados)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatGs(r.saldo_total)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/cobranzas/bases-adicionales/reports/${r.id}`}
                          className="text-brand-primary font-semibold hover:underline"
                        >
                          Ver →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </AppShell>
  );
}
