"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/format";

interface AuditRow {
  id: number;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  ip_address: string | null;
  occurred_at: string;
  extra: Record<string, any>;
}

export default function AdminAuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);

  useEffect(() => {
    apiFetch<AuditRow[]>("/api/v1/audit?limit=200").then(setRows);
  }, []);

  return (
    <AppShell>
      <h1 className="text-2xl font-bold text-brand-secondary mb-6">Auditoría</h1>
      <div className="bg-white border border-brand-neutral-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-brand-neutral-100">
            <tr>
              <th className="px-3 py-2 text-left">Fecha</th>
              <th className="px-3 py-2 text-left">Usuario</th>
              <th className="px-3 py-2 text-left">Acción</th>
              <th className="px-3 py-2 text-left">Recurso</th>
              <th className="px-3 py-2 text-left">IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-brand-neutral-200">
                <td className="px-3 py-2 text-xs text-brand-neutral-500">{formatDate(r.occurred_at)}</td>
                <td className="px-3 py-2 text-xs">{r.user_id ?? "—"}</td>
                <td className="px-3 py-2 font-medium">{r.action}</td>
                <td className="px-3 py-2 text-xs">
                  {r.resource_type && (
                    <span className="text-brand-neutral-600">{r.resource_type}{r.resource_id ? `:${r.resource_id.slice(0, 8)}` : ""}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-brand-neutral-500">{r.ip_address ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
