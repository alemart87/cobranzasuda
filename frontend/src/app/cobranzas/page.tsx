"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { MonthNavigator } from "@/components/MonthNavigator";
import { apiFetch, getUser } from "@/lib/api";
import { formatGs, formatInt } from "@/lib/format";
import { getPreferredMonth, monthLabel, pickInitialMonth, setPreferredMonth, toMonth } from "@/lib/month";

interface CarteraItem {
  nombre: string;
  fuente: string;
  polizas: number;
  asegurados: number;
  saldo_total: number;
  saldo_mora: number;
  asegurados_mora: number;
  recupero: number;
  recibe_pagos: boolean;
}
interface Overview {
  period_month: string | null;
  available_months: string[];
  carteras: {
    items: CarteraItem[];
    polizas: number;
    asegurados: number;
    saldo_total: number;
    saldo_mora: number;
    asegurados_mora: number;
    recupero: number;
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
    contactos_efectivos: number;
    pct_contactos_efectivos: number;
    promesas_totales: number;
    pct_promesas: number;
    cobros_totales: number;
    pct_promesas_cumplidas: number;
    asesores_activos: number;
  } | null;
  rendimiento: { pct: number; gestiones: number; asegurados: number } | null;
}

function fmtMinSeg(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = Math.round(seg % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Gestiones por cliente: el rendimiento (gestiones/asegurados) interpretado como
// "veces que se gestiona a cada cliente". Media ideal (buenas prácticas): 2–2.5.
function vecesStatus(gestiones: number, asegurados: number) {
  const v = asegurados > 0 ? gestiones / asegurados : 0;
  let label = "Sin datos";
  let cls = "bg-brand-bg text-brand-slate";
  if (asegurados > 0) {
    if (v < 2) {
      label = "Por debajo de lo ideal";
      cls = "bg-amber-50 text-amber-700";
    } else if (v <= 2.5) {
      label = "En rango ideal";
      cls = "bg-emerald-50 text-emerald-700";
    } else {
      label = "Por encima de lo ideal";
      cls = "bg-amber-50 text-amber-700";
    }
  }
  return { v, label, cls };
}

// Estado vs. referencia de mercado. min obligatorio; max opcional (banda).
function benchStatus(v: number, min: number, max?: number) {
  if (v < min) return { label: "Bajo referencia", cls: "bg-amber-50 text-amber-700" };
  if (max != null && v > max) return { label: "Sobre referencia", cls: "bg-emerald-50 text-emerald-700" };
  return { label: "En referencia", cls: "bg-emerald-50 text-emerald-700" };
}

const GEST_ACCENT: Record<string, string> = {
  cyan: "border-l-brand-cyan",
  purple: "border-l-brand-purple",
  primary: "border-l-brand-primary",
};

function GestionStat({
  label, pct, hint, refText, accent, min, max,
}: {
  label: string; pct: number; hint: string; refText: string;
  accent: "cyan" | "purple" | "primary"; min: number; max?: number;
}) {
  const s = benchStatus(pct, min, max);
  return (
    <div className={`card p-5 border-l-[3px] ${GEST_ACCENT[accent]}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider2 text-brand-slate font-semibold">{label}</span>
        <span className={`text-[10px] uppercase tracking-wider2 font-semibold px-2 py-0.5 rounded whitespace-nowrap ${s.cls}`}>
          {s.label}
        </span>
      </div>
      <div className="font-display text-3xl text-brand-ink mt-1 leading-none">{pct.toFixed(1)} %</div>
      <div className="text-[11px] text-brand-slate mt-1.5">{hint}</div>
      <div className="text-[10px] text-brand-mist mt-1">Referencia de mercado: {refText}</div>
    </div>
  );
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
  const [month, setMonth] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const loadOverview = (m: string | null) =>
    apiFetch<Overview>(`/api/v1/overview${m ? `?month=${m}` : ""}`)
      .then((d) => {
        setOverview(d);
        setMonth(toMonth(d.period_month) ?? m);
      })
      .catch(() => {});

  useEffect(() => {
    setUser(getUser());
    // Primera carga: traer el mes más reciente + meses disponibles, luego
    // respetar la preferencia del usuario si ese mes tiene datos.
    apiFetch<Overview>("/api/v1/overview")
      .then((d) => {
        const desired = pickInitialMonth(d.available_months);
        if (desired && toMonth(d.period_month) !== desired) {
          setMonth(desired);
          loadOverview(desired);
        } else {
          setOverview(d);
          setMonth(toMonth(d.period_month));
        }
      })
      .catch(() => {});
  }, []);

  const onMonth = (m: string) => {
    setMonth(m);
    setPreferredMonth(m);
    loadOverview(m);
  };

  const ov = overview;
  const hasOverview = !!(ov && (ov.carteras || ov.llamadas || ov.gestiones));

  // Detalle por cartera (colapsable) — se renderiza justo debajo del consolidado.
  const detallePorCartera =
    ov?.carteras && ov.carteras.items.length > 0 ? (
      <div className="mb-6">
        <button
          type="button"
          onClick={() => setDetailOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 card hover:bg-brand-bg-soft transition-colors"
          aria-expanded={detailOpen}
        >
          <span className="text-[11px] uppercase tracking-wider2 text-brand-graphite font-bold">
            Detalle por cartera
          </span>
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-brand-primary">
            {detailOpen ? "Ocultar" : "Ver detalle"}
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${detailOpen ? "rotate-180" : ""}`}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </button>

        {detailOpen && (
          <div className="mt-4 animate-fade">
            <p className="text-xs text-brand-slate mb-3">
              Las carteras adicionales (Débitos Automáticos y Bancard) <b className="text-brand-ink">no cuentan con datos de pagos</b> según informe de Sudameris Seguros; por eso no registran saldo recuperado.
            </p>
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
                    <Metric
                      label="Saldo recuperado"
                      value={c.recibe_pagos ? formatGs(c.recupero) : "—"}
                      sub={c.recibe_pagos ? "del mes" : "sin datos de pagos"}
                      accentClass={c.recibe_pagos ? "text-brand-cyan" : "text-brand-mist"}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    ) : null;

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
        <h1 className="font-display text-3xl sm:text-4xl text-brand-ink uppercase">Cobranzas</h1>
        <p className="text-sm text-brand-slate mt-1 max-w-2xl">
          Cartera, recupero del mes, reporte operativo de contact center y proyecciones.
        </p>
      </div>

      {/* Resumen gerencial (datos publicados, navegable por mes) */}
      {ov && ov.available_months.length > 0 && (
        <section className="mb-10">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <SectionLabel>Resumen gerencial</SectionLabel>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-brand-mist hidden sm:inline">Solo datos publicados</span>
              <MonthNavigator months={ov.available_months} value={month} onChange={onMonth} />
            </div>
          </div>

          {!hasOverview && (
            <div className="card p-8 text-center">
              <p className="text-brand-slate text-sm">
                No hay datos publicados para {month ? monthLabel(month) : "este mes"}. Probá con otro mes.
              </p>
            </div>
          )}

          {hasOverview && (
          <>
          {/* Rendimiento estimativo — métrica titular */}
          <div className="card p-5 mb-6 relative overflow-hidden flex flex-col lg:flex-row lg:items-center gap-5">
            <div className="absolute top-0 bottom-0 left-0 w-1.5 bg-brand-primary" />
            <div className="lg:pr-6 lg:border-r lg:border-brand-border lg:min-w-[200px]">
              <div className="text-[10px] uppercase tracking-wider2 text-brand-slate font-semibold">
                Rendimiento estimativo
              </div>
              <div className="font-display text-5xl text-brand-primary leading-none mt-1">
                {ov.rendimiento ? `${ov.rendimiento.pct}%` : "—"}
              </div>
            </div>
            <div className="text-sm text-brand-slate lg:flex-1">
              Indicador estimativo del <b className="text-brand-ink">avance de gestión sobre los clientes</b> de la cartera del mes.
              <div className="text-brand-ink font-semibold mt-1">
                {ov.rendimiento
                  ? `${formatInt(ov.rendimiento.gestiones)} gestiones ÷ ${formatInt(ov.rendimiento.asegurados)} asegurados`
                  : "Faltan datos de cartera o de gestiones publicados."}
              </div>
            </div>
            {ov.rendimiento && (() => {
              const s = vecesStatus(ov.rendimiento.gestiones, ov.rendimiento.asegurados);
              return (
                <div className="lg:pl-6 lg:border-l lg:border-brand-border lg:min-w-[230px] pt-4 border-t border-brand-border lg:pt-0 lg:border-t-0">
                  <div className="text-[10px] uppercase tracking-wider2 text-brand-slate font-semibold">
                    Gestiones por cliente
                  </div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="font-display text-3xl text-brand-ink leading-none">{s.v.toFixed(1)}×</span>
                    <span className={`text-[10px] uppercase tracking-wider2 font-semibold px-2 py-0.5 rounded ${s.cls}`}>
                      {s.label}
                    </span>
                  </div>
                  <div className="text-[11px] text-brand-slate mt-1.5 leading-snug">
                    Se gestiona a cada cliente ~<b className="text-brand-ink">{s.v.toFixed(1)} veces</b> en el mes.
                    Media ideal: <b className="text-brand-ink">2 a 2.5</b> veces/cliente (buenas prácticas).
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Operación */}
          <GroupHeading>Operación del mes</GroupHeading>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard label="Llamadas" value={ov.llamadas ? formatInt(ov.llamadas.total_llamadas) : "—"} hint={ov.llamadas ? `${formatInt(ov.llamadas.efectivas_total)} efectivas · ${ov.llamadas.asesores_activos} asesores` : "sin reporte publicado"} accent="purple" />
            <KpiCard label="Total hablado" value={ov.llamadas ? `${(ov.llamadas.total_talk_seg / 3600).toFixed(1)} hs` : "—"} accent="cyan" />
            <KpiCard label="Prom. conversación" value={ov.llamadas ? `${fmtMinSeg(ov.llamadas.aht_seg)} min` : "—"} hint="por contacto (AHT)" accent="secondary" />
            <KpiCard label="Gestiones" value={ov.gestiones ? formatInt(ov.gestiones.total_gestiones) : "—"} hint={ov.gestiones ? `${formatInt(ov.gestiones.promesas_totales)} promesas · ${formatInt(ov.gestiones.cobros_totales)} cobros` : "sin reporte publicado"} accent="primary" />
          </div>

          {/* Gestiones · detalle (funnel del equipo) */}
          {ov.gestiones && (
            <>
              <GroupHeading>Gestiones · detalle</GroupHeading>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <GestionStat
                  label="% Contactos efectivos"
                  pct={ov.gestiones.pct_contactos_efectivos}
                  hint={`${formatInt(ov.gestiones.contactos_efectivos)} de ${formatInt(ov.gestiones.total_gestiones)} gestiones`}
                  refText="40 a 50%"
                  accent="cyan"
                  min={40}
                  max={50}
                />
                <GestionStat
                  label="% Promesas"
                  pct={ov.gestiones.pct_promesas}
                  hint={`${formatInt(ov.gestiones.promesas_totales)} promesas sobre contactos`}
                  refText="superior a 40%"
                  accent="purple"
                  min={40}
                />
                <GestionStat
                  label="% Promesas cumplidas"
                  pct={ov.gestiones.pct_promesas_cumplidas}
                  hint={`${formatInt(ov.gestiones.cobros_totales)} cobros sobre promesas`}
                  refText="superior a 40%"
                  accent="primary"
                  min={40}
                />
              </div>
            </>
          )}

          {/* Cartera — consolidado de todas las carteras */}
          <GroupHeading>Cartera · todas las carteras</GroupHeading>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            <KpiCard label="Pólizas totales" value={formatInt(ov.carteras?.polizas ?? 0)} hint={`${ov.carteras?.items.length ?? 0} carteras`} accent="secondary" />
            <KpiCard label="Asegurados" value={formatInt(ov.carteras?.asegurados ?? 0)} accent="cyan" />
            <KpiCard label="Clientes en mora" value={formatInt(ov.carteras?.asegurados_mora ?? 0)} accent="orange" />
            <KpiCard label="Saldo total operado" value={formatGs(ov.carteras?.saldo_total ?? 0)} accent="primary" />
            <KpiCard label="Saldo en mora" value={formatGs(ov.carteras?.saldo_mora ?? 0)} accent="orange" />
          </div>

          {/* Detalle por cartera (colapsable), debajo del consolidado */}
          {detallePorCartera}

          </>
          )}
        </section>
      )}

      {overview && overview.available_months.length === 0 && (
        <section className="mb-10">
          <div className="card p-6 text-center">
            <p className="text-brand-slate text-sm">
              Aún no hay datos publicados para el resumen gerencial.
              Publicá los reportes del mes desde el Centro de Publicaciones.
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
