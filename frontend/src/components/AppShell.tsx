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

// Navegación interna del módulo Cobranzas (aparece SOLO cuando estás dentro)
const COBRANZAS_NAV: NavItem[] = [
  { href: "/cobranzas", label: "Inicio", roles: ["superadmin", "analyst", "client"] },
  { href: "/reports", label: "Reportes de Cartera", roles: ["superadmin", "analyst", "client"] },
  { href: "/calls/reports", label: "Reportes de Llamadas", roles: ["superadmin", "analyst", "client"] },
  { href: "/upload", label: "Subir Cartera", roles: ["superadmin", "analyst"] },
  { href: "/calls/upload", label: "Subir Llamadas", roles: ["superadmin", "analyst"] },
];

const COBRANZAS_PREFIXES = ["/cobranzas", "/reports", "/upload", "/calls"];

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadmin",
  analyst: "Analista",
  client: "Cliente",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUserInfo | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setUser(getUser());
  }, [router]);

  const onLogout = () => {
    clearSession();
    router.push("/login");
  };

  if (!user) return null;

  const adminItems = ADMIN_NAV.filter((n) => n.roles.includes(user.role));
  const inCobranzas = COBRANZAS_PREFIXES.some((p) => pathname?.startsWith(p));
  const cobranzasItems = COBRANZAS_NAV.filter((n) => n.roles.includes(user.role));

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
            <div className="px-6 py-2 flex items-center gap-2 overflow-x-auto">
              <Link
                href="/operativas"
                className="text-[10px] uppercase tracking-wider2 font-semibold text-white/60 hover:text-white mr-3 flex-shrink-0"
              >
                ← Operativas
              </Link>
              <span className="text-white/30 mr-2 flex-shrink-0">·</span>
              <span className="text-[10px] uppercase tracking-wider2 font-bold text-white/80 mr-3 flex-shrink-0">
                Cobranzas
              </span>
              <div className="flex items-center gap-1 ml-2">
                {cobranzasItems.map((item) => {
                  const active =
                    pathname === item.href ||
                    (item.href !== "/cobranzas" && pathname?.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
                        active
                          ? "bg-brand-primary text-white"
                          : "text-white/70 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
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
