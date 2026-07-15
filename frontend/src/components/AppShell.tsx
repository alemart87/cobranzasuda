"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Brand } from "./Brand";
import { Avatar } from "./Avatar";
import { CurrentUserInfo, apiFetch, clearSession, getToken, getUser } from "@/lib/api";

interface NavItem {
  href: string;
  label: string;
  roles: string[];
}

// Solo SuperAdmin tiene items en el nav principal del header
const ADMIN_NAV: NavItem[] = [
  { href: "/admin/users", label: "Usuarios", roles: ["superadmin"] },
  { href: "/admin/audit", label: "Auditoría", roles: ["superadmin"] },
  { href: "/admin/costos-agente", label: "Costos IA", roles: ["superadmin"] },
];

// Navegación interna del módulo Cobranzas (aparece SOLO cuando estás dentro),
// organizada en grupos para no saturar la barra.
const NAV_INICIO = { href: "/cobranzas", label: "Inicio" };
// Vistas (todos los roles). Incluye Carteras Totales y Bases Adicionales para
// que el cliente/gerente las vea en el navbar, no solo en el hub.
const NAV_REPORTS = [
  { href: "/cobranzas/carteras-totales", label: "Carteras Totales" },
  { href: "/reports", label: "Cartera DXP" },
  { href: "/calls/reports", label: "Llamadas" },
  { href: "/gestiones/reports", label: "Gestiones" },
  { href: "/cobranzas/bases-adicionales", label: "Bases Adicionales" },
];
const NAV_UPLOADS = [
  { href: "/upload", label: "Cartera" },
  { href: "/calls/upload", label: "Llamadas" },
  { href: "/gestiones/upload", label: "Gestiones" },
  { href: "/cobranzas/bases-adicionales", label: "Bases Adicionales" },
];

const COBRANZAS_PREFIXES = ["/cobranzas", "/reports", "/upload", "/calls", "/gestiones", "/publicaciones"];

// Navegación interna del módulo Atención al Cliente (100% independiente de Cobranzas).
const NAV_ATENCION_INICIO = { href: "/atencion", label: "Inicio" };
const NAV_ATENCION_REPORTS = [
  { href: "/atencion/llamadas/reports", label: "Llamadas" },
  { href: "/atencion/gestiones/reports", label: "Gestiones" },
];
const NAV_ATENCION_UPLOADS = [
  { href: "/atencion/llamadas/upload", label: "Llamadas" },
  { href: "/atencion/gestiones/upload", label: "Gestiones" },
];
const ATENCION_PREFIXES = ["/atencion"];

// --- Televentas Claro · Facturación (módulo restringido) ---
const NAV_TELEVENTAS_INICIO = { href: "/televentas-claro", label: "Inicio" };
const TELEVENTAS_PREFIXES = ["/televentas-claro"];

// --- Televentas (ventas de pólizas) ---
const NAV_VENTAS_INICIO = { href: "/televentas", label: "Inicio" };
const NAV_VENTAS_REPORTS = [
  { href: "/televentas/llamadas/reports", label: "Llamadas" },
  { href: "/televentas/produccion/reports", label: "Producción" },
];
const NAV_VENTAS_UPLOADS = [
  { href: "/televentas/llamadas/upload", label: "Llamadas" },
  { href: "/televentas/produccion/upload", label: "Producción" },
];
// OJO: "/televentas" hace prefix-match con "/televentas-claro"; se resuelve
// chequeando inTeleventas (claro) ANTES que inVentas.
const VENTAS_PREFIXES = ["/televentas"];

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadmin",
  analyst: "Analista",
  client: "Cliente",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUserInfo | null>(null);
  const [canUseAgent, setCanUseAgent] = useState(false);
  const [canFacturacion, setCanFacturacion] = useState(false);
  const [uploadsOpen, setUploadsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [agentChromeOpen, setAgentChromeOpen] = useState(false);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setUser(getUser());
    // Refrescar capacidad de agente desde el backend (no viene en el login).
    apiFetch<{ can_use_agent?: boolean; can_view_facturacion?: boolean }>("/api/v1/auth/me")
      .then((me) => { setCanUseAgent(!!me.can_use_agent); setCanFacturacion(!!me.can_view_facturacion); })
      .catch(() => {});
  }, [router]);

  // Cerrar menús al navegar.
  useEffect(() => {
    setUploadsOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  const onLogout = () => {
    clearSession();
    router.push("/login");
  };

  if (!user) return null;

  const adminItems = ADMIN_NAV.filter((n) => n.roles.includes(user.role));
  const inTeleventas = TELEVENTAS_PREFIXES.some((p) => pathname?.startsWith(p));
  // Ventas: "/televentas" pero NO "/televentas-claro" (facturación tiene prioridad).
  const inVentas = !inTeleventas && VENTAS_PREFIXES.some((p) => pathname?.startsWith(p));
  const inAtencion = !inTeleventas && !inVentas && ATENCION_PREFIXES.some((p) => pathname?.startsWith(p));
  const inCobranzas = !inAtencion && !inTeleventas && !inVentas && COBRANZAS_PREFIXES.some((p) => pathname?.startsWith(p));
  const canManage = user.role === "superadmin" || user.role === "analyst";
  // En los Agentes (Experiencia / Facturación) colapsamos el chrome → workspace amplio.
  const inFacturacionAgent = pathname?.startsWith("/televentas-claro/agente") ?? false;
  const inVentasAgent = pathname?.startsWith("/televentas/agente") ?? false;
  const isAgent = (pathname?.startsWith("/atencion/agente") || inFacturacionAgent || inVentasAgent) ?? false;
  const showChrome = !isAgent || agentChromeOpen;

  const isActive = (href: string) =>
    pathname === href || (href !== "/cobranzas" && (pathname?.startsWith(href) ?? false));
  const pill = (active: boolean) =>
    `px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
      active ? "bg-brand-primary text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
    }`;
  const uploadsActive = NAV_UPLOADS.some((u) => isActive(u.href));
  const atencionUploadsActive = NAV_ATENCION_UPLOADS.some((u) => isActive(u.href));
  const ventasUploadsActive = NAV_VENTAS_UPLOADS.some((u) => isActive(u.href));
  const navDivider = <span className="w-px h-4 bg-white/15 mx-1.5 flex-shrink-0" aria-hidden />;
  const mobilePill = (active: boolean) =>
    `block px-3 py-2 rounded-md text-sm font-medium ${
      active ? "bg-brand-primary-light text-brand-primary-dark" : "text-brand-graphite hover:bg-brand-bg"
    }`;
  const mobileGroupLabel = "px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider2 text-brand-mist font-semibold";

  return (
    <div className="min-h-screen flex flex-col bg-brand-bg">
      {/* Header principal: logo (link a Operativas) + acciones admin + perfil */}
      {showChrome && (
      <header className="bg-white border-b border-brand-border shadow-soft sticky top-0 z-30">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          {/* Brand clickable → vuelve a Operativas */}
          <Link href="/operativas" className="hover:opacity-90 transition-opacity flex-shrink-0">
            <Brand logoHeight={40} />
          </Link>

          {/* Top nav: SOLO items administrativos (Superadmin) — desktop */}
          {adminItems.length > 0 && (
            <nav className="hidden md:flex items-center gap-1">
              {adminItems.map((item) => {
                const active = pathname?.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={active ? "nav-link-active" : "nav-link"}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}

          {/* Perfil + hamburguesa */}
          <div className="flex items-center gap-3 sm:gap-4">
            <Link href="/perfil" className="flex items-center gap-3 group" title="Mi perfil">
              <div className="text-right leading-tight hidden sm:block">
                <div className="text-sm font-semibold text-brand-ink group-hover:text-brand-primary transition-colors">{user.full_name}</div>
                <div className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                  {ROLE_LABELS[user.role] ?? user.role}
                </div>
              </div>
              <Avatar name={user.full_name} photoUrl={user.photo_url} size={40} />
            </Link>
            <button onClick={onLogout} className="btn-ghost hidden md:inline-flex" title="Cerrar sesión">
              Salir
            </button>
            {/* Hamburguesa (mobile/tablet) */}
            <button
              type="button"
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-md text-brand-ink hover:bg-brand-bg"
              aria-label="Menú"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((o) => !o)}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {mobileOpen ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
              </svg>
            </button>
          </div>
        </div>

        {/* Drawer mobile: navegación completa (admin + cobranzas + cargar) */}
        {mobileOpen && (
          <div className="md:hidden border-t border-brand-border bg-white animate-fade max-h-[75vh] overflow-y-auto">
            <nav className="px-3 py-3 flex flex-col">
              <Link href="/perfil" className={mobilePill(pathname === "/perfil")}>Mi perfil</Link>
              <Link href="/operativas" className={mobilePill(pathname === "/operativas")}>← Operativas</Link>

              {adminItems.length > 0 && (
                <>
                  <div className={mobileGroupLabel}>Administración</div>
                  {adminItems.map((item) => (
                    <Link key={item.href} href={item.href} className={mobilePill(isActive(item.href))}>
                      {item.label}
                    </Link>
                  ))}
                </>
              )}

              {inTeleventas ? (
                <>
                  <div className={mobileGroupLabel}>Televentas Claro · Facturación</div>
                  <Link href="/televentas-claro" className={mobilePill(pathname === "/televentas-claro")}>Inicio</Link>
                  <Link href="/televentas-claro/compare" className={mobilePill(isActive("/televentas-claro/compare"))}>Comparar</Link>
                  <Link href="/televentas-claro/agente" className={mobilePill(isActive("/televentas-claro/agente"))}>Agente IA</Link>
                  {canManage && (
                    <Link href="/televentas-claro/upload" className={mobilePill(isActive("/televentas-claro/upload"))}>Subir liquidación</Link>
                  )}
                </>
              ) : inVentas ? (
                <>
                  <div className={mobileGroupLabel}>Televentas</div>
                  <Link href={NAV_VENTAS_INICIO.href} className={mobilePill(pathname === NAV_VENTAS_INICIO.href)}>{NAV_VENTAS_INICIO.label}</Link>
                  {NAV_VENTAS_REPORTS.map((item) => (
                    <Link key={item.href} href={item.href} className={mobilePill(isActive(item.href))}>{item.label}</Link>
                  ))}
                  {canUseAgent && (
                    <Link href="/televentas/agente" className={mobilePill(inVentasAgent)}>Agente IA</Link>
                  )}
                  {canManage && (
                    <>
                      <Link href="/televentas/informe-general" className={mobilePill(isActive("/televentas/informe-general"))}>Informe General</Link>
                      <Link href="/televentas/publicaciones" className={mobilePill(isActive("/televentas/publicaciones"))}>Publicaciones</Link>
                    </>
                  )}
                  {canManage && (
                    <>
                      <div className={mobileGroupLabel}>Cargar datos</div>
                      {NAV_VENTAS_UPLOADS.map((item) => (
                        <Link key={item.href} href={item.href} className={mobilePill(isActive(item.href))}>Subir {item.label}</Link>
                      ))}
                    </>
                  )}
                </>
              ) : inAtencion ? (
                <>
                  <div className={mobileGroupLabel}>Atención al Cliente</div>
                  <Link href={NAV_ATENCION_INICIO.href} className={mobilePill(pathname === NAV_ATENCION_INICIO.href)}>{NAV_ATENCION_INICIO.label}</Link>
                  {NAV_ATENCION_REPORTS.map((item) => (
                    <Link key={item.href} href={item.href} className={mobilePill(isActive(item.href))}>
                      {item.label}
                    </Link>
                  ))}
                  {canUseAgent && (
                    <Link href="/atencion/agente" className={mobilePill(isActive("/atencion/agente"))}>Agente IA</Link>
                  )}
                  {canManage && (
                    <Link href="/atencion/publicaciones" className={mobilePill(isActive("/atencion/publicaciones"))}>Publicaciones</Link>
                  )}
                  {canManage && (
                    <>
                      <div className={mobileGroupLabel}>Cargar datos</div>
                      {NAV_ATENCION_UPLOADS.map((item) => (
                        <Link key={item.href} href={item.href} className={mobilePill(isActive(item.href))}>
                          Subir {item.label}
                        </Link>
                      ))}
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className={mobileGroupLabel}>Cobranzas</div>
                  <Link href={NAV_INICIO.href} className={mobilePill(isActive(NAV_INICIO.href))}>{NAV_INICIO.label}</Link>
                  {NAV_REPORTS.map((item) => (
                    <Link key={item.href} href={item.href} className={mobilePill(isActive(item.href))}>
                      {item.label}
                    </Link>
                  ))}
                  {canManage && (
                    <>
                      <Link href="/cobranzas/informe-general" className={`${mobilePill(isActive("/cobranzas/informe-general"))} inline-flex items-center gap-2`}>
                        Informe General
                        <span className="rounded-full bg-brand-primary text-white text-[9px] font-bold uppercase tracking-wide px-1.5 py-px leading-none">Nuevo</span>
                      </Link>
                      <Link href="/publicaciones" className={mobilePill(isActive("/publicaciones"))}>Publicaciones</Link>
                    </>
                  )}

                  {canManage && (
                    <>
                      <div className={mobileGroupLabel}>Cargar datos</div>
                      {NAV_UPLOADS.map((item) => (
                        <Link key={item.href} href={item.href} className={mobilePill(isActive(item.href))}>
                          Subir {item.label}
                        </Link>
                      ))}
                    </>
                  )}
                </>
              )}

              <button onClick={onLogout} className="mt-3 text-left px-3 py-2 rounded-md text-sm font-medium text-brand-primary hover:bg-brand-primary-light">
                Cerrar sesión
              </button>
            </nav>
          </div>
        )}

        {/* Nav del módulo Cobranzas (desktop): SOLO cuando estás dentro del módulo */}
        {inCobranzas && (
          <div className="bg-brand-ink text-white hidden md:block">
            <div className="px-4 sm:px-6 py-2 flex items-center gap-1 flex-wrap">
              <Link
                href="/operativas"
                className="text-[10px] uppercase tracking-wider2 font-semibold text-white/55 hover:text-white flex-shrink-0"
              >
                ← Operativas
              </Link>
              {navDivider}
              <span className="text-[10px] uppercase tracking-wider2 font-bold text-white/80 flex-shrink-0">
                Cobranzas
              </span>
              {navDivider}

              {/* Inicio */}
              <Link href={NAV_INICIO.href} className={pill(isActive(NAV_INICIO.href))}>
                {NAV_INICIO.label}
              </Link>

              {navDivider}

              {/* Grupo: Reportes */}
              <span className="text-[10px] uppercase tracking-wider2 font-semibold text-white/40 px-1.5 flex-shrink-0">
                Reportes
              </span>
              {NAV_REPORTS.map((item) => (
                <Link key={item.href} href={item.href} className={pill(isActive(item.href))}>
                  {item.label}
                </Link>
              ))}

              {canManage && (
                <>
                  {navDivider}
                  <Link href="/cobranzas/informe-general" className={`${pill(isActive("/cobranzas/informe-general"))} inline-flex items-center gap-1.5`}>
                    Informe General
                    <span className="rounded-full bg-brand-primary text-white text-[9px] font-bold uppercase tracking-wide px-1.5 py-px leading-none">Nuevo</span>
                  </Link>
                  <Link href="/publicaciones" className={pill(isActive("/publicaciones"))}>
                    Publicaciones
                  </Link>

                  {navDivider}
                  {/* Menú Cargar (colapsa los 3 "subir") */}
                  <div className="relative flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setUploadsOpen((o) => !o)}
                      className={`${pill(uploadsActive)} inline-flex items-center gap-1.5`}
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <path d="m17 8-5-5-5 5" />
                        <path d="M12 3v12" />
                      </svg>
                      Cargar
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${uploadsOpen ? "rotate-180" : ""}`}>
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    {uploadsOpen && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setUploadsOpen(false)} />
                        <div className="absolute left-0 top-full mt-1.5 z-40 min-w-[180px] bg-white text-brand-ink rounded-md shadow-elevated border border-brand-border py-1 overflow-hidden">
                          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider2 text-brand-mist font-semibold">
                            Procesar archivos
                          </div>
                          {NAV_UPLOADS.map((item) => (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setUploadsOpen(false)}
                              className={`block px-3 py-2 text-sm font-medium hover:bg-brand-bg ${
                                isActive(item.href) ? "text-brand-primary" : "text-brand-graphite"
                              }`}
                            >
                              {item.label}
                            </Link>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Nav del módulo Atención (desktop): SOLO cuando estás dentro del módulo */}
        {inAtencion && (
          <div className="bg-brand-ink text-white hidden md:block">
            <div className="px-4 sm:px-6 py-2 flex items-center gap-1 flex-wrap">
              <Link
                href="/operativas"
                className="text-[10px] uppercase tracking-wider2 font-semibold text-white/55 hover:text-white flex-shrink-0"
              >
                ← Operativas
              </Link>
              {navDivider}
              <span className="text-[10px] uppercase tracking-wider2 font-bold text-brand-cyan flex-shrink-0">
                Atención
              </span>
              {navDivider}

              <Link href={NAV_ATENCION_INICIO.href} className={pill(pathname === NAV_ATENCION_INICIO.href)}>
                {NAV_ATENCION_INICIO.label}
              </Link>

              {navDivider}
              <span className="text-[10px] uppercase tracking-wider2 font-semibold text-white/40 px-1.5 flex-shrink-0">
                Reportes
              </span>
              {NAV_ATENCION_REPORTS.map((item) => (
                <Link key={item.href} href={item.href} className={pill(isActive(item.href))}>
                  {item.label}
                </Link>
              ))}

              {canUseAgent && (
                <>
                  {navDivider}
                  <Link href="/atencion/agente" className={`${pill(isActive("/atencion/agente"))} inline-flex items-center gap-1.5 ring-1 ring-brand-cyan/40`}>
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
                    Agente IA
                  </Link>
                </>
              )}

              {canManage && (
                <>
                  {navDivider}
                  <Link href="/atencion/publicaciones" className={pill(isActive("/atencion/publicaciones"))}>
                    Publicaciones
                  </Link>

                  {navDivider}
                  <div className="relative flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setUploadsOpen((o) => !o)}
                      className={`${pill(atencionUploadsActive)} inline-flex items-center gap-1.5`}
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <path d="m17 8-5-5-5 5" />
                        <path d="M12 3v12" />
                      </svg>
                      Cargar
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${uploadsOpen ? "rotate-180" : ""}`}>
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    {uploadsOpen && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setUploadsOpen(false)} />
                        <div className="absolute left-0 top-full mt-1.5 z-40 min-w-[180px] bg-white text-brand-ink rounded-md shadow-elevated border border-brand-border py-1 overflow-hidden">
                          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider2 text-brand-mist font-semibold">
                            Procesar archivos
                          </div>
                          {NAV_ATENCION_UPLOADS.map((item) => (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setUploadsOpen(false)}
                              className={`block px-3 py-2 text-sm font-medium hover:bg-brand-bg ${
                                isActive(item.href) ? "text-brand-cyan" : "text-brand-graphite"
                              }`}
                            >
                              {item.label}
                            </Link>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Nav del módulo Televentas Claro (desktop) */}
        {inTeleventas && (
          <div className="bg-brand-ink text-white hidden md:block">
            <div className="px-4 sm:px-6 py-2 flex items-center gap-1 flex-wrap">
              <Link href="/operativas" className="text-[10px] uppercase tracking-wider2 font-semibold text-white/55 hover:text-white flex-shrink-0">
                ← Operativas
              </Link>
              {navDivider}
              <span className="text-[10px] uppercase tracking-wider2 font-bold text-[#a06cc4] flex-shrink-0">
                Televentas Claro
              </span>
              {navDivider}
              <Link href={NAV_TELEVENTAS_INICIO.href} className={pill(pathname === NAV_TELEVENTAS_INICIO.href)}>
                {NAV_TELEVENTAS_INICIO.label}
              </Link>
              <Link href="/televentas-claro/compare" className={pill(isActive("/televentas-claro/compare"))}>
                Comparar
              </Link>
              <Link href="/televentas-claro/agente" className={`${pill(inFacturacionAgent)} inline-flex items-center gap-1.5 ring-1 ring-[#a06cc4]/40`}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
                Agente IA
              </Link>
              {canManage && (
                <>
                  {navDivider}
                  <Link href="/televentas-claro/upload" className={`${pill(isActive("/televentas-claro/upload"))} inline-flex items-center gap-1.5`}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" />
                    </svg>
                    Subir liquidación
                  </Link>
                </>
              )}
            </div>
          </div>
        )}

        {/* Nav del módulo Televentas (ventas de pólizas) — desktop */}
        {inVentas && (
          <div className="bg-brand-ink text-white hidden md:block">
            <div className="px-4 sm:px-6 py-2 flex items-center gap-1 flex-wrap">
              <Link href="/operativas" className="text-[10px] uppercase tracking-wider2 font-semibold text-white/55 hover:text-white flex-shrink-0">
                ← Operativas
              </Link>
              {navDivider}
              <span className="text-[10px] uppercase tracking-wider2 font-bold text-brand-orange flex-shrink-0">
                Televentas
              </span>
              {navDivider}
              <Link href={NAV_VENTAS_INICIO.href} className={pill(pathname === NAV_VENTAS_INICIO.href)}>
                {NAV_VENTAS_INICIO.label}
              </Link>
              {navDivider}
              <span className="text-[10px] uppercase tracking-wider2 font-semibold text-white/40 px-1.5 flex-shrink-0">
                Reportes
              </span>
              {NAV_VENTAS_REPORTS.map((item) => (
                <Link key={item.href} href={item.href} className={pill(isActive(item.href))}>
                  {item.label}
                </Link>
              ))}
              {canUseAgent && (
                <>
                  {navDivider}
                  <Link href="/televentas/agente" className={`${pill(inVentasAgent)} inline-flex items-center gap-1.5 ring-1 ring-brand-orange/40`}>
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
                    Agente IA
                  </Link>
                </>
              )}
              {canManage && (
                <>
                  {navDivider}
                  <Link href="/televentas/informe-general" className={`${pill(isActive("/televentas/informe-general"))} inline-flex items-center gap-1.5`}>
                    Informe General
                    <span className="rounded-full bg-brand-primary text-white text-[9px] font-bold uppercase tracking-wide px-1.5 py-px leading-none">Nuevo</span>
                  </Link>
                  <Link href="/televentas/publicaciones" className={pill(isActive("/televentas/publicaciones"))}>
                    Publicaciones
                  </Link>
                  {navDivider}
                  <div className="relative flex-shrink-0">
                    <button type="button" onClick={() => setUploadsOpen((o) => !o)} className={`${pill(ventasUploadsActive)} inline-flex items-center gap-1.5`}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" />
                      </svg>
                      Cargar
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${uploadsOpen ? "rotate-180" : ""}`}>
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    {uploadsOpen && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setUploadsOpen(false)} />
                        <div className="absolute left-0 top-full mt-1.5 z-40 min-w-[180px] bg-white text-brand-ink rounded-md shadow-elevated border border-brand-border py-1 overflow-hidden">
                          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider2 text-brand-mist font-semibold">Procesar archivos</div>
                          {NAV_VENTAS_UPLOADS.map((item) => (
                            <Link key={item.href} href={item.href} onClick={() => setUploadsOpen(false)}
                              className={`block px-3 py-2 text-sm font-medium hover:bg-brand-bg ${isActive(item.href) ? "text-brand-orange" : "text-brand-graphite"}`}>
                              {item.label}
                            </Link>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </header>
      )}

      {/* Workspace del Agente: chrome colapsado en una barra slim */}
      {isAgent && (
        agentChromeOpen ? (
          <button
            onClick={() => setAgentChromeOpen(false)}
            className="w-full bg-brand-ink text-white/60 hover:text-white text-[10px] uppercase tracking-wider2 font-semibold py-1 flex items-center justify-center gap-1.5"
          >
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m18 15-6-6-6 6" /></svg>
            Contraer menú
          </button>
        ) : (
          <div className="sticky top-0 z-30 bg-brand-ink text-white flex items-center justify-between px-3 sm:px-4 py-1.5">
            <div className="flex items-center gap-3 min-w-0">
              <Link href={inFacturacionAgent ? "/televentas-claro" : "/atencion"} className="text-[11px] uppercase tracking-wider2 text-white/60 hover:text-white flex-shrink-0">
                {inFacturacionAgent ? "← Televentas Claro" : "← Atención"}
              </Link>
              <span className={`text-[11px] uppercase tracking-wider2 font-bold truncate ${inFacturacionAgent ? "text-[#a06cc4]" : "text-brand-cyan"}`}>
                {inFacturacionAgent ? "Agente de Facturación" : "Agente de Experiencia"}
              </span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <button onClick={() => setAgentChromeOpen(true)} className="text-[11px] uppercase tracking-wider2 text-white/60 hover:text-white inline-flex items-center gap-1">
                Menú
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6" /></svg>
              </button>
              <Link href="/perfil" title="Mi perfil"><Avatar name={user.full_name} photoUrl={user.photo_url} size={26} /></Link>
              <button onClick={onLogout} className="text-[11px] uppercase tracking-wider2 text-white/60 hover:text-white">Salir</button>
            </div>
          </div>
        )
      )}

      {/* Main */}
      <main className={isAgent
        ? "flex-1 flex min-h-0 w-full"
        : "flex-1 px-4 sm:px-6 py-6 sm:py-8 max-w-screen-2xl w-full mx-auto"}>{children}</main>

      {/* Footer (oculto en el workspace del agente) */}
      {!isAgent && (
        <footer className="border-t border-brand-border bg-white px-4 sm:px-6 py-3 text-[11px] text-brand-slate flex flex-wrap items-center justify-between gap-1">
          <span>© {new Date().getFullYear()} Voicenter S.A.</span>
          <span className="font-display tracking-wider2 uppercase">Operaciones · Sudameris Seguros</span>
        </footer>
      )}
    </div>
  );
}
