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
  allowed_modules: string[] | null;
  granted_modules: string[] | null;
  can_use_agent: boolean;
  created_at: string;
  last_login_at: string | null;
}

interface ModuleInfo {
  slug: string;
  name: string;
  description: string;
  available: boolean;
  color: string;
}

const ROLE_LABELS: Record<string, string> = {
  analyst: "Analista (interno Voicenter)",
  client: "Cliente (Sudameris — solo lectura)",
  facturacion: "Analista de Facturación (Televentas Claro)",
};

const ROLE_OPTIONS: { value: string; title: string; desc: string }[] = [
  { value: "analyst", title: "Analista", desc: "Carga archivos, publica y elimina reportes." },
  { value: "client", title: "Cliente", desc: "Solo ve reportes publicados." },
  { value: "facturacion", title: "Analista de Facturación", desc: "Acceso completo SOLO al módulo Televentas Claro · Facturación (sube liquidaciones, compara, agente IA). Sin acceso a los demás módulos." },
];

interface FormState {
  email: string;
  password: string;
  full_name: string;
  role: string;
  // null = acceso total; array = solo los slugs marcados
  allowed_modules: string[] | null;
  can_use_agent: boolean;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [form, setForm] = useState<FormState>({
    email: "", password: "", full_name: "", role: "analyst", allowed_modules: null, can_use_agent: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPwd, setResetPwd] = useState("");
  const [editingModulesUser, setEditingModulesUser] = useState<UserRow | null>(null);
  const [editingModules, setEditingModules] = useState<string[] | null>(null);

  const load = () => apiFetch<UserRow[]>("/api/v1/users").then(setUsers);
  useEffect(() => {
    load();
    apiFetch<ModuleInfo[]>("/api/v1/modules").then(setModules);
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(null);
    try {
      // Para analista, no enviar allowed_modules (siempre tiene todo)
      const payload: any = {
        email: form.email,
        password: form.password,
        full_name: form.full_name,
        role: form.role,
      };
      if (form.role === "client") payload.allowed_modules = form.allowed_modules;
      payload.can_use_agent = form.can_use_agent;

      await apiFetch("/api/v1/users", { method: "POST", body: JSON.stringify(payload) });
      setOk(`Usuario "${form.email}" creado como ${ROLE_LABELS[form.role]}`);
      setForm({ email: "", password: "", full_name: "", role: "analyst", allowed_modules: null, can_use_agent: false });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleFormModule = (slug: string) => {
    if (form.allowed_modules === null) {
      // estaba en "todos" → pasar a lista con solo este desmarcado
      setForm({ ...form, allowed_modules: modules.filter((m) => m.slug !== slug).map((m) => m.slug) });
      return;
    }
    const has = form.allowed_modules.includes(slug);
    setForm({
      ...form,
      allowed_modules: has
        ? form.allowed_modules.filter((s) => s !== slug)
        : [...form.allowed_modules, slug],
    });
  };

  const setFormAllAccess = () => setForm({ ...form, allowed_modules: null });

  const openEditModules = (u: UserRow) => {
    setEditingModulesUser(u);
    setEditingModules(u.allowed_modules ?? null);
  };

  const saveEditModules = async () => {
    if (!editingModulesUser) return;
    await apiFetch(`/api/v1/users/${editingModulesUser.id}`, {
      method: "PATCH",
      body: JSON.stringify({ allowed_modules: editingModules }),
    });
    setEditingModulesUser(null);
    setEditingModules(null);
    load();
  };

  const toggleEditingModule = (slug: string) => {
    if (editingModules === null) {
      setEditingModules(modules.filter((m) => m.slug !== slug).map((m) => m.slug));
      return;
    }
    const has = editingModules.includes(slug);
    setEditingModules(has ? editingModules.filter((s) => s !== slug) : [...editingModules, slug]);
  };

  const toggleActive = async (u: UserRow) => {
    await apiFetch(`/api/v1/users/${u.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: !u.is_active }),
    });
    load();
  };

  const toggleAgent = async (u: UserRow) => {
    await apiFetch(`/api/v1/users/${u.id}`, {
      method: "PATCH",
      body: JSON.stringify({ can_use_agent: !u.can_use_agent }),
    });
    load();
  };

  const toggleFacturacion = async (u: UserRow) => {
    const cur = u.granted_modules || [];
    const has = cur.includes("televentas_claro");
    const next = has ? cur.filter((s) => s !== "televentas_claro") : [...cur, "televentas_claro"];
    await apiFetch(`/api/v1/users/${u.id}`, {
      method: "PATCH",
      body: JSON.stringify({ granted_modules: next }),
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
            <div className="grid grid-cols-1 gap-2">
              {ROLE_OPTIONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setForm({ ...form, role: r.value })}
                  className={`p-3 text-left rounded-md border text-xs transition-all ${
                    form.role === r.value
                      ? "border-brand-primary bg-brand-primary-light text-brand-primary-dark"
                      : "border-brand-border text-brand-slate hover:border-brand-mist"
                  }`}
                >
                  <div className="font-semibold uppercase tracking-wider2 text-[10px] mb-0.5">{r.title}</div>
                  <div className="text-[11px] opacity-80">{r.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Selector de módulos visible solo para clientes */}
          {form.role === "client" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label !mb-0">Operativas habilitadas</label>
                <button
                  type="button"
                  onClick={setFormAllAccess}
                  className={`text-[10px] uppercase tracking-wider2 font-semibold px-2 py-1 rounded ${
                    form.allowed_modules === null
                      ? "bg-brand-cyan text-white"
                      : "bg-brand-bg text-brand-slate hover:bg-brand-border"
                  }`}
                >
                  Acceso a todas
                </button>
              </div>
              <p className="text-xs text-brand-slate mb-2">
                Seleccioná las operativas que este cliente podrá visualizar.
              </p>
              <div className="space-y-2">
                {modules.map((m) => {
                  const checked = form.allowed_modules === null || form.allowed_modules.includes(m.slug);
                  return (
                    <label
                      key={m.slug}
                      className={`flex items-start gap-2.5 p-2.5 rounded-md border cursor-pointer transition-colors ${
                        checked ? "border-brand-primary bg-brand-primary-light/30" : "border-brand-border"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleFormModule(m.slug)}
                        className="mt-0.5 accent-brand-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: m.color }} />
                          <span className="text-sm font-semibold text-brand-ink">{m.name}</span>
                          {!m.available && <span className="badge-neutral">Próximamente</span>}
                        </div>
                        <div className="text-[11px] text-brand-slate mt-0.5">{m.description}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Agente de Experiencia (IA) */}
          <label className="flex items-start gap-2.5 p-2.5 rounded-md border border-brand-border cursor-pointer hover:border-brand-cyan">
            <input
              type="checkbox"
              checked={form.can_use_agent}
              onChange={(e) => setForm({ ...form, can_use_agent: e.target.checked })}
              className="mt-0.5 accent-brand-cyan"
            />
            <div>
              <div className="text-sm font-semibold text-brand-ink">Agente de Experiencia (IA)</div>
              <div className="text-[11px] text-brand-slate">Habilita el chat con IA sobre los datos de Atención.</div>
            </div>
          </label>

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
                modules={modules}
                onToggle={toggleActive}
                onToggleAgent={toggleAgent}
                onToggleFacturacion={toggleFacturacion}
                onResetPwd={() => setResetUserId(u.id)}
                onUploadPhoto={onUploadPhoto}
                onEditModules={() => openEditModules(u)}
              />
            ))}
          </ul>
        </div>
      </div>

      {/* Modal editar módulos del cliente */}
      {editingModulesUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 max-w-lg w-full space-y-4">
            <div>
              <h3 className="font-display text-xl text-brand-ink uppercase">Operativas habilitadas</h3>
              <p className="text-xs text-brand-slate mt-1">
                Cliente: <b>{editingModulesUser.full_name}</b> · {editingModulesUser.email}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditingModules(null)}
              className={`text-[10px] uppercase tracking-wider2 font-semibold px-2 py-1 rounded ${
                editingModules === null ? "bg-brand-cyan text-white" : "bg-brand-bg text-brand-slate hover:bg-brand-border"
              }`}
            >
              Acceso a todas
            </button>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {modules.map((m) => {
                const checked = editingModules === null || editingModules.includes(m.slug);
                return (
                  <label
                    key={m.slug}
                    className={`flex items-start gap-2.5 p-2.5 rounded-md border cursor-pointer ${
                      checked ? "border-brand-primary bg-brand-primary-light/30" : "border-brand-border"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleEditingModule(m.slug)}
                      className="mt-0.5 accent-brand-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: m.color }} />
                        <span className="text-sm font-semibold text-brand-ink">{m.name}</span>
                        {!m.available && <span className="badge-neutral">Próximamente</span>}
                      </div>
                      <div className="text-[11px] text-brand-slate mt-0.5">{m.description}</div>
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-brand-border">
              <button
                onClick={() => { setEditingModulesUser(null); setEditingModules(null); }}
                className="btn-secondary"
              >
                Cancelar
              </button>
              <button onClick={saveEditModules} className="btn-primary">Guardar</button>
            </div>
          </div>
        </div>
      )}

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
  modules,
  onToggle,
  onToggleAgent,
  onToggleFacturacion,
  onResetPwd,
  onUploadPhoto,
  onEditModules,
}: {
  user: UserRow;
  modules: ModuleInfo[];
  onToggle: (u: UserRow) => void;
  onToggleAgent: (u: UserRow) => void;
  onToggleFacturacion: (u: UserRow) => void;
  onResetPwd: () => void;
  onUploadPhoto: (u: UserRow, f: File) => void;
  onEditModules: () => void;
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
          ) : user.role === "facturacion" ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider2 text-white" style={{ background: "#662483" }}>Facturación</span>
          ) : (
            <span className="badge-primary">Cliente</span>
          )}
          {!user.is_active && <span className="badge-neutral">Inactivo</span>}
          {user.can_use_agent && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-cyan/10 text-brand-cyan font-semibold uppercase tracking-wider2">Agente IA</span>
          )}
        </div>
        <div className="text-xs text-brand-slate truncate">{user.email}</div>
        <div className="text-[10px] text-brand-slate uppercase tracking-wider2 mt-0.5">
          Alta {formatDate(user.created_at)} ·
          {user.last_login_at ? ` Últ. acceso ${formatDate(user.last_login_at)}` : " Sin acceso aún"}
        </div>
        {user.role === "client" && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {user.allowed_modules === null ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-cyan/10 text-brand-cyan font-semibold uppercase tracking-wider2">
                Todas las operativas
              </span>
            ) : user.allowed_modules.length === 0 ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-bg text-brand-slate font-semibold uppercase tracking-wider2">
                Sin operativas
              </span>
            ) : (
              user.allowed_modules.map((s) => {
                const m = modules.find((mm) => mm.slug === s);
                return (
                  <span
                    key={s}
                    className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider2 text-white"
                    style={{ background: m?.color ?? "#5B6275" }}
                  >
                    {m?.name ?? s}
                  </span>
                );
              })
            )}
          </div>
        )}
      </div>
      <div className="flex gap-1.5 flex-col">
        {user.role === "client" && (
          <button onClick={onEditModules} className="text-xs px-2.5 py-1 rounded border border-brand-border hover:border-brand-cyan hover:text-brand-cyan">
            Operativas
          </button>
        )}
        {user.role !== "facturacion" && (
          <button onClick={() => onToggleAgent(user)} className={`text-xs px-2.5 py-1 rounded border ${user.can_use_agent ? "border-brand-cyan text-brand-cyan" : "border-brand-border hover:border-brand-cyan hover:text-brand-cyan"}`}>
            {user.can_use_agent ? "Agente IA: ON" : "Agente IA: OFF"}
          </button>
        )}
        {user.role === "analyst" && (
          <button onClick={() => onToggleFacturacion(user)} className={`text-xs px-2.5 py-1 rounded border ${(user.granted_modules || []).includes("televentas_claro") ? "border-[#662483] text-[#662483]" : "border-brand-border hover:border-[#662483] hover:text-[#662483]"}`}>
            {(user.granted_modules || []).includes("televentas_claro") ? "Facturación: ON" : "Facturación: OFF"}
          </button>
        )}
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
