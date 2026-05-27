"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Brand } from "./Brand";
import { CurrentUserInfo, clearSession, getToken, getUser } from "@/lib/api";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/upload", label: "Subir Cobranzas" },
  { href: "/reports", label: "Reportes Cobranzas" },
  { href: "/calls/upload", label: "Subir Llamadas" },
  { href: "/calls/reports", label: "Reportes Llamadas" },
];

const ADMIN_NAV = [
  { href: "/admin/users", label: "Usuarios" },
  { href: "/admin/audit", label: "Auditoría" },
];

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

  const isSuperadmin = user.role === "superadmin";
  const allNav = isSuperadmin ? [...NAV, ...ADMIN_NAV] : NAV;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-brand-neutral-200 px-6 py-3 flex items-center justify-between">
        <Brand />
        <nav className="flex items-center gap-1">
          {allNav.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? "bg-brand-primary text-white"
                    : "text-brand-neutral-700 hover:bg-brand-neutral-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          <div className="text-right leading-tight">
            <div className="text-sm font-medium text-brand-neutral-900">{user.full_name}</div>
            <div className="text-xs text-brand-neutral-500 capitalize">{user.role}</div>
          </div>
          <button
            onClick={onLogout}
            className="text-sm px-3 py-1.5 rounded-md border border-brand-neutral-300 hover:bg-brand-neutral-100"
          >
            Cerrar sesión
          </button>
        </div>
      </header>
      <main className="flex-1 px-6 py-6">{children}</main>
      <footer className="border-t border-brand-neutral-200 px-6 py-3 text-xs text-brand-neutral-500 text-center">
        © {new Date().getFullYear()} Voicenter S.A. · Cobranzas Sudameris Seguros
      </footer>
    </div>
  );
}
