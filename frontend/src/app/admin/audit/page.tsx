"use client";

import { useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
  Line, LineChart,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { KpiCard } from "@/components/KpiCard";
import { apiFetch } from "@/lib/api";
import { formatDate, formatInt } from "@/lib/format";

interface UsageData {
  rango_dias: number;
  total_eventos: number;
  serie_diaria: Array<{
    fecha: string;
    eventos: number;
    superadmin: number;
    analyst: number;
    client: number;
  }>;
  top_acciones: Array<{ action: string; count: number }>;
  usuarios: Array<{
    user_id: string;
    email: string;
    full_name: string;
    role: string;
    logins: number;
    views: number;
    actions: number;
    first_seen: string | null;
    last_seen: string | null;
    permanencia_promedio_min: number;
    sesiones: number;
  }>;
}

interface AuditRow {
  id: number;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  ip_address: string | null;
  occurred_at: string;
}

export default function AdminAuditPage() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [days, setDays] = useState(30);

  useEffect(() => {
    apiFetch<UsageData>(`/api/v1/audit/usage?days=${days}`).then(setUsage);
    apiFetch<AuditRow[]>("/api/v1/audit?limit=300").then(setRows);
  }, [days]);

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl text-brand-ink uppercase">Auditoría y Uso</h1>
          <p className="text-sm text-brand-slate mt-1">
            Trazabilidad completa de acciones y métricas de permanencia por usuario.
          </p>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-xs px-3 py-1.5 rounded ${
                days === d
                  ? "bg-brand-primary text-white"
                  : "bg-white border border-brand-border text-brand-slate hover:border-brand-primary"
              }`}
            >
              {d} días
            </button>
          ))}
        </div>
      </div>

      {usage && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KpiCard label="Eventos totales" value={formatInt(usage.total_eventos)} accent="primary" />
            <KpiCard label="Usuarios activos" value={`${usage.usuarios.length}`} accent="cyan" />
            <KpiCard label="Días analizados" value={`${usage.rango_dias}`} accent="neutral" />
            <KpiCard
              label="Acción más frecuente"
              value={usage.top_acciones[0]?.action ?? "—"}
              hint={usage.top_acciones[0] ? `${usage.top_acciones[0].count} veces` : ""}
              accent="orange"
            />
          </div>

          {/* Serie de uso diario */}
          <section className="card p-6 mb-6">
            <h2 className="font-display text-xl text-brand-ink uppercase mb-1">
              Actividad diaria por tipo de usuario
            </h2>
            <p className="text-xs text-brand-slate mb-4">
              Eventos disparados por superadmin, analistas y clientes en el período.
            </p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={usage.serie_diaria}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="fecha" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="client" stackId="a" fill="#E6332A" name="Clientes" />
                <Bar dataKey="analyst" stackId="a" fill="#00B2BF" name="Analistas" />
                <Bar dataKey="superadmin" stackId="a" fill="#0F1116" name="Superadmin" />
              </BarChart>
            </ResponsiveContainer>
          </section>

          {/* Tendencia de logins */}
          <section className="card p-6 mb-6">
            <h2 className="font-display text-xl text-brand-ink uppercase mb-1">
              Tendencia general de uso
            </h2>
            <p className="text-xs text-brand-slate mb-4">Volumen total de eventos por día.</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={usage.serie_diaria}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="fecha" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Line type="monotone" dataKey="eventos" stroke="#662483" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </section>

          {/* Ranking de usuarios */}
          <section className="card p-6 mb-6">
            <h2 className="font-display text-xl text-brand-ink uppercase mb-4">
              Ranking de usuarios — permanencia y actividad
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate border-b border-brand-border">
                    <th className="px-3 py-2 text-left">Usuario</th>
                    <th className="px-3 py-2 text-left">Rol</th>
                    <th className="px-3 py-2 text-right">Logins</th>
                    <th className="px-3 py-2 text-right">Vistas</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                    <th className="px-3 py-2 text-right">Sesiones</th>
                    <th className="px-3 py-2 text-right">Permanencia avg (min)</th>
                    <th className="px-3 py-2 text-left">Último acceso</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.usuarios.map((u) => (
                    <tr key={u.user_id} className="border-b border-brand-border hover:bg-brand-bg-soft">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Avatar name={u.full_name} size={28} />
                          <div className="min-w-0">
                            <div className="font-semibold text-brand-ink text-xs truncate">{u.full_name}</div>
                            <div className="text-[10px] text-brand-slate truncate">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {u.role === "client" ? (
                          <span className="badge-primary">Cliente</span>
                        ) : u.role === "analyst" ? (
                          <span className="badge-cyan">Analista</span>
                        ) : (
                          <span className="badge-neutral">{u.role}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{u.logins}</td>
                      <td className="px-3 py-2 text-right">{u.views}</td>
                      <td className="px-3 py-2 text-right">{u.actions}</td>
                      <td className="px-3 py-2 text-right">{u.sesiones}</td>
                      <td className="px-3 py-2 text-right font-mono">{u.permanencia_promedio_min}</td>
                      <td className="px-3 py-2 text-xs text-brand-slate">
                        {u.last_seen ? formatDate(u.last_seen) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Top acciones */}
          <section className="card p-6 mb-6">
            <h2 className="font-display text-xl text-brand-ink uppercase mb-4">
              Acciones más frecuentes
            </h2>
            <ResponsiveContainer width="100%" height={Math.max(usage.top_acciones.length * 30, 200)}>
              <BarChart data={usage.top_acciones} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" fontSize={11} />
                <YAxis type="category" dataKey="action" width={180} fontSize={11} />
                <Tooltip />
                <Bar dataKey="count" fill="#F39200" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </section>
        </>
      )}

      {/* Log raw */}
      <section className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-brand-border">
          <h2 className="font-display text-xl text-brand-ink uppercase">Log de eventos</h2>
          <p className="text-xs text-brand-slate mt-0.5">Últimos 300 registros.</p>
        </div>
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-xs">
            <thead className="bg-brand-bg sticky top-0">
              <tr className="text-[10px] uppercase tracking-wider2 text-brand-slate">
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Usuario</th>
                <th className="px-3 py-2 text-left">Acción</th>
                <th className="px-3 py-2 text-left">Recurso</th>
                <th className="px-3 py-2 text-left">IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-brand-border hover:bg-brand-bg-soft">
                  <td className="px-3 py-2 text-brand-slate whitespace-nowrap">{formatDate(r.occurred_at)}</td>
                  <td className="px-3 py-2 truncate max-w-[180px]">{r.user_id ?? "—"}</td>
                  <td className="px-3 py-2 font-semibold">{r.action}</td>
                  <td className="px-3 py-2 text-brand-slate">
                    {r.resource_type ? `${r.resource_type}:${r.resource_id?.slice(0, 8)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-brand-slate">{r.ip_address ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
