"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { apiFetch, getUser } from "@/lib/api";

interface ModuleCard {
  slug: string;
  href: string;
  title: string;
  description: string;
  color: string;
  bgGradient: string;
  available: boolean;
  badges: string[];
}

const MODULES: ModuleCard[] = [
  {
    slug: "cobranzas",
    href: "/cobranzas",
    title: "Cobranzas",
    description:
      "Cartera asignada, recupero mensual, tramos de mora, top deudores y proyección al cierre. Más reporte operativo de contact center.",
    color: "#E6332A",
    bgGradient: "linear-gradient(135deg, #B81F18 0%, #E6332A 100%)",
    available: true,
    badges: ["Reportes de cartera", "Reportes de llamadas", "Proyecciones"],
  },
  {
    slug: "atencion",
    href: "/atencion",
    title: "Atención al Cliente",
    description:
      "Análisis de NPS, gestión de detractores, calidad del servicio, motivos de consulta y desempeño por asesor.",
    color: "#00B2BF",
    bgGradient: "linear-gradient(135deg, #007680 0%, #00B2BF 100%)",
    available: false,
    badges: ["NPS", "Detractores", "Calidad"],
  },
  {
    slug: "ventas",
    href: "/ventas",
    title: "Ventas",
    description:
      "Gestión comercial, conversión de leads, performance por canal y asesor, evolución mensual y comparativos.",
    color: "#F39200",
    bgGradient: "linear-gradient(135deg, #C57400 0%, #F39200 100%)",
    available: false,
    badges: ["Pipeline", "Conversión", "Ranking comercial"],
  },
];

export default function OperativasPage() {
  const [userName, setUserName] = useState<string>("");
  const [allowed, setAllowed] = useState<string[] | null>(null);
  const [role, setRole] = useState<string>("");

  useEffect(() => {
    // 1) Pintar rápido con los datos del localStorage para evitar flash.
    const u = getUser();
    setUserName(u?.full_name?.split(" ")[0] ?? "");
    setAllowed(u?.allowed_modules ?? null);
    setRole(u?.role ?? "");
    // 2) Refrescar contra /auth/me para que cambios del superadmin
    //    se reflejen sin necesidad de re-login.
    apiFetch<{ full_name: string; role: string; allowed_modules: string[] | null }>(
      "/api/v1/auth/me",
    )
      .then((me) => {
        setUserName(me.full_name?.split(" ")[0] ?? "");
        setAllowed(me.allowed_modules ?? null);
        setRole(me.role ?? "");
        // Sincronizar el localStorage para que otras pantallas vean lo mismo.
        if (typeof window !== "undefined") {
          const raw = localStorage.getItem("vc_user");
          if (raw) {
            try {
              const stored = JSON.parse(raw);
              stored.full_name = me.full_name;
              stored.role = me.role;
              stored.allowed_modules = me.allowed_modules ?? null;
              localStorage.setItem("vc_user", JSON.stringify(stored));
            } catch {
              /* ignore */
            }
          }
        }
      })
      .catch(() => {
        /* si falla /me, dejamos lo del localStorage */
      });
  }, []);

  // Para cliente, filtrar módulos según allowed_modules.
  // null = acceso a todos; lista = solo los listados.
  const visibleModules = MODULES.filter((m) => {
    if (role !== "client") return true;
    if (allowed === null) return true;
    return allowed.includes(m.slug);
  });

  return (
    <AppShell>
      <div className="mb-10">
        <div className="text-[11px] uppercase tracking-wider2 text-brand-slate mb-2">
          Hub de Operativas
        </div>
        <h1 className="font-display text-5xl text-brand-ink uppercase leading-tight">
          Hola, <span className="text-brand-primary">{userName}</span>
        </h1>
        <p className="text-base text-brand-slate mt-2 max-w-2xl">
          Seleccioná el área operativa para acceder a la información disponible.
        </p>
      </div>

      {visibleModules.length === 0 && (
        <div className="card p-12 text-center">
          <p className="text-brand-slate">
            No tenés operativas habilitadas. Solicitá al administrador el acceso a los módulos correspondientes.
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {visibleModules.map((m) => (
          <ModuleTile key={m.href} module={m} />
        ))}
      </div>

      <div className="mt-10 text-xs text-brand-slate flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-brand-cyan" />
        Más módulos disponibles próximamente. La plataforma se construye de forma incremental.
      </div>
    </AppShell>
  );
}

function ModuleTile({ module }: { module: ModuleCard }) {
  const Wrapper: any = module.available ? Link : "div";
  const wrapperProps: any = module.available ? { href: module.href } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`card relative overflow-hidden p-7 flex flex-col gap-5 transition-all duration-200 ${
        module.available
          ? "hover:shadow-elevated hover:-translate-y-0.5 cursor-pointer"
          : "opacity-95"
      }`}
    >
      {/* Banda de color superior */}
      <div
        className="absolute top-0 left-0 right-0 h-1.5"
        style={{ background: module.bgGradient }}
      />

      {/* Header del card */}
      <div className="flex items-start justify-between gap-3 mt-2">
        <div
          className="w-12 h-12 rounded-md flex items-center justify-center text-white font-display text-2xl uppercase shadow-soft"
          style={{ background: module.bgGradient }}
        >
          {module.title.charAt(0)}
        </div>
        {!module.available && (
          <span className="badge-neutral">Próximamente</span>
        )}
        {module.available && (
          <span className="badge-success">Disponible</span>
        )}
      </div>

      <div>
        <h2 className="font-display text-2xl text-brand-ink uppercase tracking-wide">
          {module.title}
        </h2>
        <p className="text-sm text-brand-slate mt-2 leading-relaxed">{module.description}</p>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-auto">
        {module.badges.map((b) => (
          <span
            key={b}
            className="text-[10px] uppercase tracking-wider2 font-semibold px-2 py-1 rounded bg-brand-bg text-brand-slate"
          >
            {b}
          </span>
        ))}
      </div>

      <div
        className={`flex items-center justify-between pt-4 border-t border-brand-border text-sm font-semibold ${
          module.available ? "text-brand-primary" : "text-brand-slate"
        }`}
      >
        <span>{module.available ? "Ingresar al módulo" : "Habilitación pendiente"}</span>
        {module.available && <span aria-hidden>→</span>}
      </div>
    </Wrapper>
  );
}
