"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { apiFetch, getUser } from "@/lib/api";
import { formatGs, formatInt } from "@/lib/format";

interface ReportSummary {
  id: string;
  period_month: string | null;
  saldo_total: number;
  vencido_total: number;
  asegurados_en_mora: number;
  recupero_total: number;
}
interface CallSummary {
  id: string;
  period_month: string | null;
  total_llamadas: number;
  total_talk_seg: number;
  asesores_activos: number;
}

interface ActionTile {
  href: string;
  title: string;
  description: string;
  icon: string;
  variant: "primary" | "cyan" | "purple" | "orange";
  forRoles: string[];
}

const ACTIONS: ActionTile[] = [
  {
    href: "/cobranzas/carteras-totales",
    title: "Carteras Totales",
    description: "Vista gerencial: DXP + Débitos Automáticos + Bancard en un mismo panel.",
    icon: "🧮",
    variant: "primary",
    forRoles: ["superadmin", "analyst", "client"],
  },
  {
    href: "/reports",
    title: "Reportes de Cartera",
    description: "Cartera total, vencido por tramo, top deudores y recupero del mes.",
    icon: "📊",
    variant: "primary",
    forRoles: ["superadmin", "analyst", "client"],
  },
  {
    href: "/calls/reports",
    title: "Reportes de Llamadas",
    description: "Operativo contact center: llamadas, talk time, AHT y ranking por operador.",
    icon: "📞",
    variant: "cyan",
    forRoles: ["superadmin", "analyst", "client"],
  },
  {
    href: "/gestiones/reports",
    title: "Reportes de Gestiones",
    description: "Gestiones del CRM: subestados, promesas obtenidas, cumplimiento y cobros por asesor.",
    icon: "📝",
    variant: "purple",
    forRoles: ["superadmin", "analyst", "client"],
  },
  {
    href: "/cobranzas/bases-adicionales",
    title: "Bases Adicionales",
    description: "Débitos Automáticos y Bancard. Carteras que se gestionan sin recibir pagos.",
    icon: "🗂️",
    variant: "orange",
    forRoles: ["superadmin", "analyst", "client"],
  },
  {
    href: "/upload",
    title: "Subir Cartera",
    description: "Procesar los 3 archivos del mes (DXP, Boca de Cobranzas, Cobrado 186).",
    icon: "⬆️",
    variant: "orange",
    forRoles: ["superadmin", "analyst"],
  },
  {
    href: "/calls/upload",
    title: "Subir Llamadas",
    description: "Procesar el reporte de contact center (Bsse de llamadas).",
    icon: "📥",
    variant: "cyan",
    forRoles: ["superadmin", "analyst"],
  },
  {
    href: "/gestiones/upload",
    title: "Subir Gestiones",
    description: "Procesar el export del CRM con gestiones por asesor.",
    icon: "📂",
    variant: "purple",
    forRoles: ["superadmin", "analyst"],
  },
];

const VARIANT_CLS: Record<ActionTile["variant"], { bar: string; iconBg: string }> = {
  primary: { bar: "bg-brand-primary", iconBg: "bg-brand-primary-light text-brand-primary" },
  cyan: { bar: "bg-brand-cyan", iconBg: "bg-brand-cyan/10 text-brand-cyan" },
  purple: { bar: "bg-brand-purple", iconBg: "bg-brand-purple/10 text-brand-purple" },
  orange: { bar: "bg-brand-orange", iconBg: "bg-brand-orange/10 text-brand-orange" },
};

export default function CobranzasHubPage() {
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [calls, setCalls] = useState<CallSummary | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    setUser(getUser());
    apiFetch<{ items: ReportSummary[] }>("/api/v1/reports").then((d) => setReport(d.items[0] ?? null));
    apiFetch<{ items: CallSummary[] }>("/api/v1/calls/reports").then((d) => setCalls(d.items[0] ?? null));
  }, []);

  const actions = ACTIONS.filter((a) => !user || a.forRoles.includes(user.role));

  return (
    <AppShell>
      <div className="mb-2 text-xs text-brand-slate">
        <Link href="/operativas" className="hover:text-brand-primary">Operativas</Link>
        <span className="mx-2">/</span>
        <span className="text-brand-ink font-semibold">Cobranzas</span>
      </div>
      <div className="mb-8">
        <h1 className="font-display text-4xl text-brand-ink uppercase">Cobranzas</h1>
        <p className="text-sm text-brand-slate mt-1">
          Cartera, recupero del mes, reporte operativo de contact center y proyecciones.
        </p>
      </div>

      {/* KPIs del último reporte */}
      {(report || calls) && (
        <section className="mb-10">
          <h2 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold mb-3">
            Último período cargado
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {report && (
              <>
                <KpiCard label="Saldo cartera" value={formatGs(report.saldo_total)} accent="secondary" />
                <KpiCard label="Saldo en mora" value={formatGs(report.vencido_total)} hint={`${report.asegurados_en_mora} aseg.`} accent="primary" />
                <KpiCard label="Recupero del mes" value={formatGs(report.recupero_total)} accent="cyan" />
              </>
            )}
            {calls && (
              <KpiCard
                label="Llamadas operativo"
                value={formatInt(calls.total_llamadas)}
                hint={`${(calls.total_talk_seg / 3600).toFixed(1)} hs talk · ${calls.asesores_activos} asesores`}
                accent="purple"
              />
            )}
          </div>
        </section>
      )}

      {/* Acciones disponibles */}
      <section>
        <h2 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold mb-3">
          Acciones disponibles
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          {actions.map((a) => {
            const v = VARIANT_CLS[a.variant];
            return (
              <Link
                key={a.href}
                href={a.href}
                className="card p-5 flex items-start gap-4 hover:shadow-elevated hover:-translate-y-0.5 transition-all relative overflow-hidden"
              >
                <div className={`absolute top-0 left-0 right-0 h-1 ${v.bar}`} />
                <div className={`w-12 h-12 rounded-md flex items-center justify-center text-2xl mt-1 ${v.iconBg}`}>
                  {a.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-lg text-brand-ink uppercase">{a.title}</h3>
                  <p className="text-sm text-brand-slate mt-1">{a.description}</p>
                  <div className="text-xs text-brand-primary font-semibold mt-2">Abrir →</div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
