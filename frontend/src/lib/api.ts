"use client";

const TOKEN_KEY = "vc_token";
const USER_KEY = "vc_user";

export interface CurrentUserInfo {
  email: string;
  role: string;
  full_name: string;
  photo_url?: string | null;
  allowed_modules?: string[] | null; // null = acceso a todos
  granted_modules?: string[] | null; // módulos restringidos habilitados (analistas)
  can_use_agent?: boolean;
  can_view_facturacion?: boolean; // módulo Televentas Claro
  can_view_logistica?: boolean; // módulo Logística (QuadMinds)
}

export function setSession(token: string, refreshToken: string, user: CurrentUserInfo) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem("vc_refresh", refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("vc_refresh");
  localStorage.removeItem(USER_KEY);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): CurrentUserInfo | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

/** Actualiza (merge) el usuario guardado en localStorage tras editar el perfil. */
export function saveUser(partial: Partial<CurrentUserInfo>): void {
  if (typeof window === "undefined") return;
  const cur = getUser() ?? ({} as CurrentUserInfo);
  localStorage.setItem(USER_KEY, JSON.stringify({ ...cur, ...partial }));
}

export async function apiFetch<T = any>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...((opts.headers as Record<string, string>) || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!(opts.body instanceof FormData) && opts.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Sesión expirada");
  }
  if (!res.ok) {
    let detail = "Error";
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {}
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}
