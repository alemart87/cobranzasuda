"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/Brand";
import { setSession } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.detail || "Error de autenticación");
      }
      const data = await r.json();
      setSession(data.access_token, data.refresh_token, {
        email: data.user_email,
        role: data.user_role,
        full_name: data.user_name,
      });
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-neutral-50 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-md p-8 border border-brand-neutral-200">
        <div className="flex justify-center mb-6"><Brand /></div>
        <h1 className="text-2xl font-bold text-brand-secondary text-center mb-1">Iniciar sesión</h1>
        <p className="text-sm text-brand-neutral-500 text-center mb-6">
          Acceso protegido — solicite credenciales al administrador.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-brand-neutral-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-brand-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary"
              placeholder="admin@voicenter.com.py"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-neutral-700 mb-1">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-brand-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md p-3">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-primary text-white py-2 rounded-md font-medium hover:bg-brand-secondary transition-colors disabled:opacity-60"
          >
            {loading ? "Verificando…" : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
