"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
        photo_url: data.user_photo_url ?? null,
      });
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Lado izquierdo: panel de marca */}
      <div className="hidden lg:flex flex-col justify-between p-12 text-white relative overflow-hidden"
           style={{
             background: "linear-gradient(135deg, #B81F18 0%, #E6332A 55%, #F39200 100%)",
           }}>
        <div className="flex items-center gap-4">
          <div className="bg-white rounded-lg px-4 py-2.5 shadow-elevated">
            <img src="/logo-voicenter-color.png" alt="Voicenter" className="h-9 w-auto block" />
          </div>
        </div>

        <div className="space-y-6 max-w-md">
          <h1 className="font-display text-5xl uppercase leading-tight">
            Operaciones<br />
            <span className="text-white/90">Sudameris Seguros</span>
          </h1>
          <p className="text-white/90 text-base leading-relaxed">
            Plataforma que disponibiliza información útil para la gestión de Cobranzas, Atención al Cliente, Ventas y procesos operativos.
          </p>
          <div className="grid grid-cols-2 gap-3 pt-4">
            <div className="flex items-center gap-2.5">
              <div className="w-1.5 h-8 bg-white/60 rounded-full" />
              <div>
                <div className="font-display text-sm uppercase tracking-wider2">Cobranzas</div>
                <div className="text-[11px] text-white/70">Cartera y recupero</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-1.5 h-8 bg-white/60 rounded-full" />
              <div>
                <div className="font-display text-sm uppercase tracking-wider2">Atención</div>
                <div className="text-[11px] text-white/70">Servicio y NPS</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-1.5 h-8 bg-white/60 rounded-full" />
              <div>
                <div className="font-display text-sm uppercase tracking-wider2">Ventas</div>
                <div className="text-[11px] text-white/70">Gestión comercial</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-1.5 h-8 bg-white/60 rounded-full" />
              <div>
                <div className="font-display text-sm uppercase tracking-wider2">Operativos</div>
                <div className="text-[11px] text-white/70">KPIs y trazabilidad</div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-[11px] text-white/70 uppercase tracking-wider2">
          Operado por Voicenter S.A.
        </div>

        {/* decorativo */}
        <div className="absolute -right-32 -bottom-32 w-96 h-96 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute -right-20 top-20 w-48 h-48 rounded-full bg-white/5 blur-2xl" />
      </div>

      {/* Lado derecho: formulario */}
      <div className="flex items-center justify-center px-6 py-12 bg-brand-bg-soft">
        <div className="w-full max-w-md">
          {/* logo mobile */}
          <div className="lg:hidden flex justify-center mb-8">
            <img src="/logo-voicenter-color.png" alt="Voicenter" className="h-12 w-auto" />
          </div>

          <div className="mb-8">
            <h2 className="font-display text-3xl text-brand-ink uppercase">Iniciar sesión</h2>
            <p className="text-sm text-brand-slate mt-2">
              Acceso protegido. Solicite credenciales al administrador.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="label">Correo electrónico</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="usuario@sudameris.com.py"
                autoComplete="email"
              />
            </div>
            <div>
              <label htmlFor="password" className="label">Contraseña</label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div className="bg-brand-primary-light border border-brand-primary/30 text-brand-primary-dark text-sm rounded-md px-3 py-2.5">
                {error}
              </div>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full text-base py-3">
              {loading ? "Verificando…" : "Ingresar a la plataforma"}
            </button>
          </form>

          <div className="mt-10 pt-6 border-t border-brand-border text-center text-[11px] text-brand-slate uppercase tracking-wider2">
            © {new Date().getFullYear()} Voicenter S.A.
          </div>
        </div>
      </div>
    </div>
  );
}
