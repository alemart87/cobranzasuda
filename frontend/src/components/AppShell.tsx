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
  roles: string[]; // roles que pueden ver este link
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["superadmin", "analyst", "client"] },
  { href: "/reports", label: "Cobranzas", roles: ["superadmin", "analyst", "client"] },
  { href: "/calls/reports", label: "Llamadas", roles: ["superadmin", "analyst", "client"] },
  { href: "/upload", label: "Subir Cobranzas", roles: ["superadmin", "analyst"] },
  { href: "/calls/upload", label: "Subir Llamadas", roles: ["superadmin", "analyst"] },
  { href: "/admin/users", label: "Usuarios", roles: ["superadmin"] },
  { href: "/admin/audit", label: "Auditoría", roles: ["superadmin"] },
];

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

  const navItems = NAV.filter((n) => n.roles.includes(user.role));

  return (
    <div className="min-h-screen flex flex-col bg-brand-bg">
      {/* Header de marca */}
      <header className="bg-white border-b border-brand-border shadow-soft">
        <div className="px-6 py-3 flex items-center justify-between">
          <Brand logoHeight={40} />
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
        {/* Navegación */}
        <nav className="px-6 pb-2 flex items-center gap-1 overflow-x-auto">
          {navItems.map((item) => {
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
