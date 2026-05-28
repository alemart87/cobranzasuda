"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { apiFetch, getUser } from "@/lib/api";
import { formatGs, formatInt } from "@/lib/format";

interface CarteraItem {
  nombre: string;
  fuente: string;
  polizas: number;
  asegurados: number;
  saldo_total: number;
  saldo_mora: number;
  asegurados_mora: number;
  recibe_pagos: boolean;
}
interface Overview {
  period_month: string | null;
  carteras: {
    items: CarteraItem[];
    polizas: number;
    asegurados: number;
    saldo_total: number;
    saldo_mora: number;
    asegurados_mora: number;
  } | null;
  llamadas: {
    total_llamadas: number;
    total_talk_seg: number;
    aht_seg: number;
    efectivas_total: number;
    asesores_activos: number;
  } | null;
  gestiones: {
    total_gestiones: number;
    clientes_unicos: number;
    promesas_totales: number;
    cobros_totales: number;
    pct_promesas_cumplidas: number;
    asesores_activos: number;
  } | null;
  rendimiento: { pct: number; clientes_gestionados: number; asegurados: number } | null;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
function monthLabel(iso: string): string {
  const [y, m] = iso.split("-");
  const name = MONTH_NAMES[Number(m) - 1];
  return name ? `${name} ${y}` : iso;
}
function fmtMinSeg(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = Math.round(seg % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
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
  {
    href: "/cobranzas/bases-adicionales",
    title: "Subir Bases Adicionales",
    description: "Débitos Automáticos o Bancard. Elegí la base y procesá el Excel.",
    icon: ICONS.folder,
    variant: "orange",
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

/** Encabezado de grupo con regla, para ordenar el panel gerencial. */
function GroupHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] uppercase tracking-wider2 text-brand-graphite font-bold mb-3 flex items-center gap-3">
      <span className="flex-shrink-0">{children}</span>
      <span className="h-px flex-1 bg-brand-border" />
    </h3>
  );
}

function Metric({
  label, value, sub, accentClass,
}: { label: string; value: ReactNode; sub?: ReactNode; accentClass?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider2 text-brand-slate">{label}</div>
      <div className={`font-display text-lg leading-tight ${accentClass ?? "text-brand-ink"}`}>{value}</div>
      {sub && <div className="text-[11px] text-brand-slate mt-0.5">{sub}</div>}
    </div>
  );
}

export default function CobranzasHubPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    setUser(getUser());
    apiFetch<Overview>("/api/v1/overview").then(setOverview).catch(() => {});
  }, []);

  const ov = overview;
  const hasOverview = !!(ov && (ov.carteras || ov.llamadas || ov.gestiones));

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

      {/* Resumen gerencial (datos publicados del mes) */}
      {hasOverview && ov && (
        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-4">
            <SectionLabel>
              Resumen gerencial{ov.period_month ? ` · ${monthLabel(ov.period_month)}` : ""}
            </SectionLabel>
            <span className="text-[11px] text-brand-mist">Solo datos publicados</span>
          </div>

          {/* Rendimiento estimativo — métrica titular */}
          <div className="card p-5 mb-6 relative overflow-hidden flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="absolute top-0 bottom-0 left-0 w-1.5 bg-brand-primary" />
            <div className="sm:pr-6 sm:border-r sm:border-brand-border sm:min-w-[210px]">
              <div className="text-[10px] uppercase tracking-wider2 text-brand-slate font-semibold">
                Rendimiento estimativo
              </div>
              <div className="font-display text-5xl text-brand-primary leading-none mt-1">
                {ov.rendimiento ? `${ov.rendimiento.pct}%` : "—"}
              </div>
            </div>
            <div className="text-sm text-brand-slate">
              Cobertura estimada de gestión <b className="text-brand-ink">por cliente</b> sobre la cartera del mes.
              <div className="text-brand-ink font-semibold mt-1">
                {ov.rendimiento
                  ? `${formatInt(ov.rendimiento.clientes_gestionados)} clientes gestionados ÷ ${formatInt(ov.rendimiento.asegurados)} asegurados`
                  : "Faltan datos de cartera o de gestiones publicados."}
              </div>
            </div>
          </div>

          {/* Cartera */}
          <GroupHeading>Cartera</GroupHeading>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard label="Pólizas totales" value={formatInt(ov.carteras?.polizas ?? 0)} hint={`${ov.carteras?.items.length ?? 0} carteras`} accent="secondary" />
            <KpiCard label="Asegurados" value={formatInt(ov.carteras?.asegurados ?? 0)} accent="cyan" />
            <KpiCard label="Saldo total operado" value={formatGs(ov.carteras?.saldo_total ?? 0)} accent="primary" />
            <KpiCard label="Saldo en mora" value={formatGs(ov.carteras?.saldo_mora ?? 0)} hint={`${formatInt(ov.carteras?.asegurados_mora ?? 0)} clientes en mora`} accent="orange" />
          </div>

          {/* Operación */}
          <GroupHeading>Operación del mes</GroupHeading>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard label="Llamadas" value={ov.llamadas ? formatInt(ov.llamadas.total_llamadas) : "—"} hint={ov.llamadas ? `${formatInt(ov.llamadas.efectivas_total)} efectivas · ${ov.llamadas.asesores_activos} asesores` : "sin reporte publicado"} accent="purple" />
            <KpiCard label="Total hablado" value={ov.llamadas ? `${(ov.llamadas.total_talk_seg / 3600).toFixed(1)} hs` : "—"} accent="cyan" />
            <KpiCard label="Prom. conversación" value={ov.llamadas ? `${fmtMinSeg(ov.llamadas.aht_seg)} min` : "—"} hint="por contacto (AHT)" accent="secondary" />
            <KpiCard label="Gestiones" value={ov.gestiones ? formatInt(ov.gestiones.total_gestiones) : "—"} hint={ov.gestiones ? `${formatInt(ov.gestiones.clientes_unicos)} clientes · ${formatInt(ov.gestiones.promesas_totales)} promesas` : "sin reporte publicado"} accent="primary" />
          </div>

          {/* Detalle por cartera */}
          {ov.carteras && ov.carteras.items.length > 0 && (
            <>
              <GroupHeading>Detalle por cartera</GroupHeading>
              <div className="grid md:grid-cols-3 gap-4">
                {ov.carteras.items.map((c) => (
                  <div key={c.fuente} className="card p-4">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <h4 className="font-display text-base text-brand-ink uppercase leading-tight">{c.nombre}</h4>
                      <span className={`text-[10px] uppercase tracking-wider2 font-semibold px-2 py-0.5 rounded ${c.recibe_pagos ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {c.recibe_pagos ? "Recibe pagos" : "Sin pagos"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <Metric label="Pólizas" value={formatInt(c.polizas)} />
                      <Metric label="Asegurados" value={formatInt(c.asegurados)} />
                      <Metric label="Saldo total" value={formatGs(c.saldo_total)} />
                      <Metric
                        label="Saldo en mora"
                        value={formatGs(c.saldo_mora)}
                        sub={`${formatInt(c.asegurados_mora)} clientes`}
                        accentClass="text-brand-orange"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {!hasOverview && overview !== null && (
        <section className="mb-10">
          <div className="card p-6 text-center">
            <p className="text-brand-slate text-sm">
              Aún no hay datos publicados del mes para el resumen gerencial.
              Publicá los reportes desde el Centro de Publicaciones.
            </p>
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
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {uploadActions.map((a) => (
              <ActionCard key={a.href} a={a} />
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
