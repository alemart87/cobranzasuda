"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/format";

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "viewer" });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = () => apiFetch<UserRow[]>("/api/v1/users").then(setUsers);
  useEffect(() => { load(); }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(null);
    try {
      await apiFetch("/api/v1/users", { method: "POST", body: JSON.stringify(form) });
      setOk("Usuario creado");
      setForm({ email: "", password: "", full_name: "", role: "viewer" });
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

  return (
    <AppShell>
      <h1 className="text-2xl font-bold text-brand-secondary mb-6">Gestión de Usuarios</h1>

      <div className="grid md:grid-cols-2 gap-6">
        <form onSubmit={onSubmit} className="bg-white border border-brand-neutral-200 rounded-lg p-6 space-y-4">
          <h2 className="font-semibold text-brand-secondary">Crear viewer</h2>
          <input
            type="email"
            placeholder="Email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full px-3 py-2 border border-brand-neutral-300 rounded-md"
          />
          <input
            type="text"
            placeholder="Nombre completo"
            required
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            className="w-full px-3 py-2 border border-brand-neutral-300 rounded-md"
          />
          <input
            type="password"
            placeholder="Contraseña (mín. 8)"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full px-3 py-2 border border-brand-neutral-300 rounded-md"
          />
          {error && <div className="text-sm text-red-600">{error}</div>}
          {ok && <div className="text-sm text-green-600">{ok}</div>}
          <button className="bg-brand-primary text-white px-4 py-2 rounded-md font-medium hover:bg-brand-secondary">
            Crear viewer
          </button>
        </form>

        <div className="bg-white border border-brand-neutral-200 rounded-lg p-6">
          <h2 className="font-semibold text-brand-secondary mb-3">Usuarios registrados</h2>
          <div className="space-y-2">
            {users.length === 0 && <div className="text-sm text-brand-neutral-500">Sin usuarios</div>}
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between border border-brand-neutral-200 rounded-md p-3">
                <div>
                  <div className="font-medium text-sm">{u.full_name} <span className="text-xs text-brand-neutral-500">({u.role})</span></div>
                  <div className="text-xs text-brand-neutral-500">{u.email} · creado {formatDate(u.created_at)}</div>
                </div>
                <button
                  onClick={() => toggleActive(u)}
                  className={`text-xs px-3 py-1 rounded-md ${
                    u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}
                >
                  {u.is_active ? "Activo" : "Inactivo"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
