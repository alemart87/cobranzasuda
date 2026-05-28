"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Brand } from "./Brand";
import { Avatar } from "./Avatar";
import { CurrentUserInfo, clearSession, getToken, getUser } from "@/lib/api";

interface NavItem {
  href: string;
  label: string;
  roles: string[];
}

// Solo SuperAdmin tiene items en el nav principal del header
const ADMIN_NAV: NavItem[] = [
  { href: "/admin/users", label: "Usuarios", roles: ["superadmin"] },
  { href: "/admin/audit", label: "Auditoría", roles: ["superadmin"] },
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
];

const COBRANZAS_PREFIXES = ["/cobranzas", "/reports", "/upload", "/calls", "/gestiones", "/publicaciones"];

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadmin",
  analyst: "Analista",
  client: "Cliente",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUserInfo | null>(null);
  const [uploadsOpen, setUploadsOpen] = useState(false);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setUser(getUser());
  }, [router]);

  // Cerrar el menú "Cargar" al navegar.
  useEffect(() => {
    setUploadsOpen(false);
  }, [pathname]);

  const onLogout = () => {
    clearSession();
    router.push("/login");
  };

  if (!user) return null;

  const adminItems = ADMIN_NAV.filter((n) => n.roles.includes(user.role));
  const inCobranzas = COBRANZAS_PREFIXES.some((p) => pathname?.startsWith(p));
  const canManage = user.role === "superadmin" || user.role === "analyst";

  const isActive = (href: string) =>
    pathname === href || (href !== "/cobranzas" && (pathname?.startsWith(href) ?? false));
  const pill = (active: boolean) =>
    `px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
      active ? "bg-brand-primary text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
    }`;
  const uploadsActive = NAV_UPLOADS.some((u) => isActive(u.href));
  const navDivider = <span className="w-px h-4 bg-white/15 mx-1.5 flex-shrink-0" aria-hidden />;

  return (
    <div className="min-h-screen flex flex-col bg-brand-bg">
      {/* Header principal: logo (link a Operativas) + acciones admin + perfil */}
      <header className="bg-white border-b border-brand-border shadow-soft sticky top-0 z-30">
        <div className="px-6 py-3 flex items-center justify-between gap-4">
          {/* Brand clickable → vuelve a Operativas */}
          <Link href="/operativas" className="hover:opacity-90 transition-opacity">
            <Brand logoHeight={40} />
          </Link>

          {/* Top nav: SOLO items administrativos (Superadmin) */}
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

          {/* Perfil */}
          <div className="flex items-center gap-4">
            <div className="text-right leading-tight hidden sm:block">
              <div className="text-sm font-semibold text-brand-ink">{user.full_name}</div>
              <div className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                {ROLE_LABELS[user.role] ?? user.role}
              </div>
            </div>
            <Avatar name={user.full_name} photoUrl={user.photo_url} size={40} />
            <button onClick={onLogout} className="btn-ghost" title="Cerrar sesión">
              Salir
            </button>
          </div>
        </div>

        {/* Nav del módulo Cobranzas: SOLO cuando estás dentro del módulo */}
        {inCobranzas && (
          <div className="bg-brand-ink text-white">
            <div className="px-6 py-2 flex items-center gap-1 flex-wrap">
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
      </header>

      {/* Main */}
      <main className="flex-1 px-6 py-8 max-w-screen-2xl w-full mx-auto">{children}</main>

      {/* Footer */}
      <footer className="border-t border-brand-border bg-white px-6 py-3 text-[11px] text-brand-slate flex items-center justify-between">
        <span>© {new Date().getFullYear()} Voicenter S.A.</span>
        <span className="font-display tracking-wider2 uppercase">Operaciones · Sudameris Seguros</span>
      </footer>
    </div>
  );
}
