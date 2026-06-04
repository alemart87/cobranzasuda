"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { getUser } from "@/lib/api";

type Variant = "cyan" | "purple" | "primary" | "orange";

interface ActionTile {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  variant: Variant;
  forRoles: string[];
}

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
       strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const ICONS = {
  phone: svg(
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
  ),
  clipboard: svg(
    <>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" />
    </>
  ),
  upload: svg(
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5" /><path d="M12 3v12" />
    </>
  ),
  megaphone: svg(
    <>
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </>
  ),
};

const VIEW_ACTIONS: ActionTile[] = [
  {
    href: "/atencion/llamadas/reports",
    title: "Reportes de Llamadas",
    description: "Llamadas ingresadas y contestadas, niveles de servicio y atención, abandono, AHT, entrantes/salientes por operador y auxiliares.",
    icon: ICONS.phone,
    variant: "cyan",
    forRoles: ["superadmin", "analyst", "client"],
  },
  {
    href: "/atencion/gestiones/reports",
    title: "Reportes de Gestiones",
    description: "Registros de contacto: por tipo de caso, por estado, top de motivos y por canal de contacto.",
    icon: ICONS.clipboard,
    variant: "purple",
    forRoles: ["superadmin", "analyst", "client"],
  },
];

const UPLOAD_ACTIONS: ActionTile[] = [
  {
    href: "/atencion/llamadas/upload",
    title: "Subir Llamadas",
    description: "Procesar los 4 archivos del período (Entrantes/Salientes, Estados, Llamadas por intervalo, Colas de atención).",
    icon: ICONS.upload,
    variant: "cyan",
    forRoles: ["superadmin", "analyst"],
  },
  {
    href: "/atencion/gestiones/upload",
    title: "Subir Gestiones",
    description: "Procesar el export de gestiones del CRM de atención al cliente.",
    icon: ICONS.upload,
    variant: "purple",
    forRoles: ["superadmin", "analyst"],
  },
  {
    href: "/atencion/publicaciones",
    title: "Publicaciones",
    description: "Publicar, despublicar y eliminar los reportes de Atención. Los clientes solo ven lo publicado.",
    icon: ICONS.megaphone,
    variant: "primary",
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

export default function AtencionHubPage() {
  const [user, setUser] = useState<any>(null);
  useEffect(() => setUser(getUser()), []);

  const role = user?.role;
  const viewActions = VIEW_ACTIONS.filter((a) => !role || a.forRoles.includes(role));
  const uploadActions = UPLOAD_ACTIONS.filter((a) => !role || a.forRoles.includes(role));

  return (
    <AppShell>
      <div className="mb-2 text-xs text-brand-slate">
        <Link href="/operativas" className="hover:text-brand-primary">Operativas</Link>
        <span className="mx-2">/</span>
        <span className="text-brand-ink font-semibold">Atención al Cliente</span>
      </div>
      <div className="mb-8 pb-5 border-b border-brand-border">
        <h1 className="font-display text-3xl sm:text-4xl text-brand-ink uppercase">Atención al Cliente</h1>
        <p className="text-sm text-brand-slate mt-1 max-w-2xl">
          Reporte de Llamadas (entrantes/salientes, niveles de servicio, abandono, AHT y auxiliares) y
          Reporte de Gestiones (motivos, canales y estados de los registros de contacto).
        </p>
      </div>

      <section className="mb-10">
        <SectionLabel>Ver reportes</SectionLabel>
        <div className="grid md:grid-cols-2 gap-4">
          {viewActions.map((a) => (
            <ActionCard key={a.href} a={a} />
          ))}
        </div>
      </section>

      {uploadActions.length > 0 && (
        <section>
          <SectionLabel>Cargar datos · gestión</SectionLabel>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {uploadActions.map((a) => (
              <ActionCard key={a.href} a={a} />
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
