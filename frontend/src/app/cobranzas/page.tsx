"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
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

type Variant = "primary" | "cyan" | "purple" | "orange";

interface ActionTile {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  variant: Variant;
  forRoles: string[];
}

/* Íconos de línea (lucide-style), monocromáticos, heredan color del contenedor. */
const svg = (children: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

const ICONS = {
  layers: svg(
    <>
      <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
      <path d="m2 12.5 8.58 3.91a2 2 0 0 0 1.66 0L21 12.5" />
      <path d="m2 17 8.58 3.91a2 2 0 0 0 1.66 0L21 17" />
    </>
  ),
  chart: svg(
    <>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </>
  ),
  phone: svg(
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
  ),
  clipboard: svg(
    <>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </>
  ),
  folder: svg(
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
  ),
  upload: svg(
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5" />
      <path d="M12 3v12" />
    </>
  ),
};

const VIEW_ACTIONS: ActionTile[] = [
  {
    href: "/cobranzas/carteras-totales",
    title: "Carteras Totales",
    description: "Vista gerencial: DXP + Débitos Automáticos + Bancard en un mismo panel.",
    icon: ICONS.layers,
    variant: "primary",
    forRoles: ["superadmin", "analyst", "client"],
  },
  {
    href: "/reports",
    title: "Reportes de Cartera",
    description: "Cartera total, vencido por tramo, top deudores y recupero del mes.",
    icon: ICONS.chart,
    variant: "primary",
    forRoles: ["superadmin", "analyst", "client"],
  },
  {
    href: "/calls/reports",
    title: "Reportes de Llamadas",
    description: "Operativo contact center: llamadas, talk time, AHT y ranking por operador.",
    icon: ICONS.phone,
    variant: "cyan",
    forRoles: ["superadmin", "analyst", "client"],
  },
  {
    href: "/gestiones/reports",
    title: "Reportes de Gestiones",
    description: "Gestiones del CRM: subestados, promesas obtenidas, cumplimiento y cobros por asesor.",
    icon: ICONS.clipboard,
    variant: "purple",
    forRoles: ["superadmin", "analyst", "client"],
  },
  {
    href: "/cobranzas/bases-adicionales",
    title: "Bases Adicionales",
    description: "Débitos Automáticos y Bancard. Carteras que se gestionan sin recibir pagos.",
    icon: ICONS.folder,
    variant: "orange",
    forRoles: ["superadmin", "analyst", "client"],
  },
];

const UPLOAD_ACTIONS: ActionTile[] = [
  {
    href: "/upload",
    title: "Subir Cartera",
    description: "Procesar los 3 archivos del mes (DXP, Boca de Cobranzas, Cobrado 186).",
    icon: ICONS.upload,
    variant: "primary",
    forRoles: ["superadmin", "analyst"],
  },
  {
    href: "/calls/upload",
    title: "Subir Llamadas",
    description: "Procesar el reporte de contact center (Bsse de llamadas).",
    icon: ICONS.upload,
    variant: "cyan",
    forRoles: ["superadmin", "analyst"],
  },
  {
    href: "/gestiones/upload",
    title: "Subir Gestiones",
    description: "Procesar el export del CRM con gestiones por asesor.",
    icon: ICONS.upload,
    variant: "purple",
    forRoles: ["superadmin", "analyst"],
  },
];

const VARIANT_CLS: Record<Variant, { bar: string; iconBg: string }> = {
  primary: { bar: "bg-brand-primary", iconBg: "bg-brand-primary-light text-brand-primary" },
  cyan: { bar: "bg-brand-cyan", iconBg: "bg-brand-cyan/10 text-brand-cyan" },
  purple: { bar: "bg-brand-purple", iconBg: "bg-brand-purple/10 text-brand-purple" },
  orange: { bar: "bg-brand-orange", iconBg: "bg-brand-orange/10 text-brand-orange" },
};

function ActionCard({ a }: { a: ActionTile }) {
  const v = VARIANT_CLS[a.variant];
  return (
    <Link
      href={a.href}
      className="card group p-5 flex items-start gap-4 hover:shadow-elevated hover:-translate-y-0.5 transition-all relative overflow-hidden"
    >
      <div className={`absolute top-0 bottom-0 left-0 w-1 ${v.bar}`} />
      <div className={`w-11 h-11 rounded-md flex items-center justify-center shrink-0 ${v.iconBg}`}>
        {a.icon}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-display text-lg text-brand-ink uppercase leading-tight">{a.title}</h3>
        <p className="text-sm text-brand-slate mt-1 leading-relaxed">{a.description}</p>
        <div className="text-xs text-brand-primary font-semibold mt-3 inline-flex items-center gap-1">
          Abrir
          <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>→</span>
        </div>
      </div>
    </Link>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[11px] uppercase tracking-wider2 text-brand-slate font-semibold mb-3">
      {children}
    </h2>
  );
}

export default function CobranzasHubPage() {
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [calls, setCalls] = useState<CallSummary | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    setUser(getUser());
    apiFetch<{ items: ReportSummary[] }>("/api/v1/reports").then((d) => setReport(d.items[0] ?? null));
    apiFetch<{ items: CallSummary[] }>("/api/v1/calls/reports").then((d) => setCalls(d.items[0] ?? null));
  }, []);

  const role = user?.role;
  const viewActions = VIEW_ACTIONS.filter((a) => !role || a.forRoles.includes(role));
  const uploadActions = UPLOAD_ACTIONS.filter((a) => !role || a.forRoles.includes(role));

  return (
    <AppShell>
      <div className="mb-2 text-xs text-brand-slate">
        <Link href="/operativas" className="hover:text-brand-primary">Operativas</Link>
        <span className="mx-2">/</span>
        <span className="text-brand-ink font-semibold">Cobranzas</span>
      </div>
      <div className="mb-8 pb-5 border-b border-brand-border">
        <h1 className="font-display text-4xl text-brand-ink uppercase">Cobranzas</h1>
        <p className="text-sm text-brand-slate mt-1 max-w-2xl">
          Cartera, recupero del mes, reporte operativo de contact center y proyecciones.
        </p>
      </div>

      {/* KPIs del último reporte */}
      {(report || calls) && (
        <section className="mb-10">
          <SectionLabel>Último período cargado</SectionLabel>
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

      {/* Ver reportes */}
      <section className="mb-10">
        <SectionLabel>Ver reportes</SectionLabel>
        <div className="grid md:grid-cols-2 gap-4">
          {viewActions.map((a) => (
            <ActionCard key={a.href} a={a} />
          ))}
        </div>
      </section>

      {/* Cargar datos — solo analista/superadmin */}
      {uploadActions.length > 0 && (
        <section>
          <SectionLabel>Cargar datos</SectionLabel>
          <div className="grid md:grid-cols-3 gap-4">
            {uploadActions.map((a) => (
              <ActionCard key={a.href} a={a} />
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
