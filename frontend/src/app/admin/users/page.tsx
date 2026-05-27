"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { apiFetch, getToken } from "@/lib/api";
import { formatDate } from "@/lib/format";

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  photo_url: string | null;
  created_at: string;
  last_login_at: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  analyst: "Analista (interno Voicenter)",
  client: "Cliente (Sudameris — solo lectura)",
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "analyst" });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPwd, setResetPwd] = useState("");

  const load = () => apiFetch<UserRow[]>("/api/v1/users").then(setUsers);
  useEffect(() => {
    load();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(null);
    try {
      await apiFetch("/api/v1/users", { method: "POST", body: JSON.stringify(form) });
      setOk(`Usuario "${form.email}" creado como ${ROLE_LABELS[form.role]}`);
      setForm({ email: "", password: "", full_name: "", role: "analyst" });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleActive = async (u: UserRow) => {
    await apiFetch(`/api/v1/users/${u.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: !u.is_active }),
    });
    load();
  };

  const onResetPwd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUserId || !resetPwd) return;
    await apiFetch(`/api/v1/users/${resetUserId}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ new_password: resetPwd }),
    });
    setOk("Contraseña reseteada");
    setResetUserId(null);
    setResetPwd("");
  };

  const onUploadPhoto = async (u: UserRow, file: File) => {
    const form = new FormData();
    form.append("file", file);
    const token = getToken();
    const r = await fetch(`/api/v1/users/${u.id}/photo`, {
      method: "POST",
      body: form,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (r.ok) load();
  };

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-display text-3xl text-brand-ink uppercase">Gestión de Usuarios</h1>
        <p className="text-sm text-brand-slate mt-1">
          Crear analistas (cargan archivos y publican) o clientes (solo ven reportes publicados).
        </p>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Formulario crear */}
        <form onSubmit={onSubmit} className="card p-6 space-y-4 lg:col-span-2 h-fit">
          <h2 className="font-display text-xl text-brand-ink uppercase">Crear nuevo usuario</h2>

          <div>
            <label className="label">Tipo de usuario</label>
            <div className="grid grid-cols-2 gap-2">
              {(["analyst", "client"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setForm({ ...form, role: r })}
                  className={`p-3 text-left rounded-md border text-xs transition-all ${
                    form.role === r
                      ? "border-brand-primary bg-brand-primary-light text-brand-primary-dark"
                      : "border-brand-border text-brand-slate hover:border-brand-mist"
                  }`}
                >
                  <div className="font-semibold uppercase tracking-wider2 text-[10px] mb-0.5">
                    {r === "analyst" ? "Analista" : "Cliente"}
                  </div>
                  <div className="text-[11px] opacity-80">
                    {r === "analyst"
                      ? "Carga archivos, publica y elimina reportes."
                      : "Solo ve reportes publicados."}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="label">Nombre completo</label>
            <input
              type="text"
              required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="label">Contraseña inicial</label>
            <input
              type="text"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="input"
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          {error && (
            <div className="bg-brand-primary-light border border-brand-primary/30 text-brand-primary-dark text-xs rounded-md p-2.5">
              {error}
            </div>
          )}
          {ok && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-md p-2.5">
              {ok}
            </div>
          )}
          <button type="submit" className="btn-primary w-full">Crear usuario</button>
        </form>

        {/* Lista de usuarios */}
        <div className="card lg:col-span-3 overflow-hidden">
          <div className="px-5 py-4 border-b border-brand-border">
            <h2 className="font-display text-xl text-brand-ink uppercase">Usuarios registrados</h2>
            <p className="text-xs text-brand-slate mt-0.5">{users.length} usuario(s) en total</p>
          </div>
          {users.length === 0 && (
            <div className="p-8 text-center text-sm text-brand-slate">Sin usuarios todavía.</div>
          )}
          <ul className="divide-y divide-brand-border">
            {users.map((u) => (
              <UserListItem
                key={u.id}
                user={u}
                onToggle={toggleActive}
                onResetPwd={() => setResetUserId(u.id)}
                onUploadPhoto={onUploadPhoto}
              />
            ))}
          </ul>
        </div>
      </div>

      {/* Modal reset password */}
      {resetUserId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <form onSubmit={onResetPwd} className="card p-6 max-w-md w-full space-y-4">
            <h3 className="font-display text-xl text-brand-ink uppercase">Resetear contraseña</h3>
            <p className="text-xs text-brand-slate">
              La nueva contraseña reemplaza la actual. Compartila al usuario por canal seguro.
            </p>
            <input
              type="text"
              required
              minLength={8}
              value={resetPwd}
              onChange={(e) => setResetPwd(e.target.value)}
              className="input"
              placeholder="Nueva contraseña (mín. 8 caracteres)"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setResetUserId(null)} className="btn-secondary">
                Cancelar
              </button>
              <button type="submit" className="btn-primary">Aplicar</button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}

function UserListItem({
  user,
  onToggle,
  onResetPwd,
  onUploadPhoto,
}: {
  user: UserRow;
  onToggle: (u: UserRow) => void;
  onResetPwd: () => void;
  onUploadPhoto: (u: UserRow, f: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <li className="p-4 flex items-center gap-4 hover:bg-brand-bg-soft">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        title="Cambiar foto"
        className="relative group"
      >
        <Avatar name={user.full_name} photoUrl={user.photo_url} size={44} />
        <span className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] uppercase tracking-wider2 transition-opacity">
          Cambiar
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUploadPhoto(user, f);
        }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-brand-ink text-sm truncate">{user.full_name}</span>
          {user.role === "analyst" ? (
            <span className="badge-cyan">Analista</span>
          ) : (
            <span className="badge-primary">Cliente</span>
          )}
          {!user.is_active && <span className="badge-neutral">Inactivo</span>}
        </div>
        <div className="text-xs text-brand-slate truncate">{user.email}</div>
        <div className="text-[10px] text-brand-slate uppercase tracking-wider2 mt-0.5">
          Alta {formatDate(user.created_at)} ·
          {user.last_login_at ? ` Últ. acceso ${formatDate(user.last_login_at)}` : " Sin acceso aún"}
        </div>
      </div>
      <div className="flex gap-1.5">
        <button onClick={onResetPwd} className="text-xs px-2.5 py-1 rounded border border-brand-border hover:border-brand-cyan hover:text-brand-cyan">
          Resetear PWD
        </button>
        <button onClick={() => onToggle(user)} className="text-xs px-2.5 py-1 rounded border border-brand-border hover:border-brand-primary hover:text-brand-primary">
          {user.is_active ? "Desactivar" : "Activar"}
        </button>
      </div>
    </li>
  );
}
