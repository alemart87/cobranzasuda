"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { apiFetch, getUser } from "@/lib/api";
import { formatDate } from "@/lib/format";

type Kind = "televentas_llamadas" | "televentas_produccion" | "televentas_crm";

interface Publication {
  kind: Kind; id: string; title: string | null; period_month: string | null; generated_at: string; is_published: boolean;
}

const KIND_META: Record<Kind, { label: string; api: string; view: (id: string) => string; badge: string }> = {
  televentas_llamadas: {
    label: "Reporte de Llamadas", api: "/api/v1/televentas/llamadas/reports",
    view: (id) => `/televentas/llamadas/reports/${id}`, badge: "bg-brand-cyan/10 text-brand-cyan",
  },
  televentas_produccion: {
    label: "Reporte de Producción", api: "/api/v1/televentas/produccion/reports",
    view: (id) => `/televentas/produccion/reports/${id}`, badge: "bg-brand-orange/10 text-brand-orange",
  },
  televentas_crm: {
    label: "Gestiones CRM", api: "/api/v1/televentas/crm/reports",
    view: (id) => `/televentas/crm/reports/${id}`, badge: "bg-brand-purple/10 text-brand-purple",
  },
};

const KIND_FILTERS = [
  { value: "all", label: "Todos los tipos" },
  { value: "televentas_llamadas", label: "Llamadas" },
  { value: "televentas_produccion", label: "Producción" },
  { value: "televentas_crm", label: "Gestiones CRM" },
];
const STATUS_FILTERS = [
  { value: "all", label: "Todos los estados" },
  { value: "published", label: "Publicados" },
  { value: "draft", label: "Borradores" },
];

export default function TeleventasPublicacionesPage() {
  const [items, setItems] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Publication | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [user, setUser] = useState<any>(null);

  useEffect(() => { setUser(getUser()); load(); }, []);

  const load = async () => {
    try {
      const [ll, pr, crm] = await Promise.all([
        apiFetch<{ items: any[] }>("/api/v1/televentas/llamadas/reports"),
        apiFetch<{ items: any[] }>("/api/v1/televentas/produccion/reports"),
        apiFetch<{ items: any[] }>("/api/v1/televentas/crm/reports"),
      ]);
      const merged: Publication[] = [
        ...ll.items.map((r) => ({ kind: "televentas_llamadas" as Kind, id: r.id, title: r.title, period_month: r.period_month, generated_at: r.generated_at, is_published: r.is_published })),
        ...pr.items.map((r) => ({ kind: "televentas_produccion" as Kind, id: r.id, title: r.title, period_month: r.period_month, generated_at: r.generated_at, is_published: r.is_published })),
        ...crm.items.map((r) => ({ kind: "televentas_crm" as Kind, id: r.id, title: r.title, period_month: r.period_month, generated_at: r.generated_at, is_published: r.is_published })),
      ];
      merged.sort((a, b) => +new Date(b.generated_at) - +new Date(a.generated_at));
      setItems(merged);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const togglePublish = async (p: Publication) => {
    setBusyId(p.id); setActionError(null);
    try {
      await apiFetch(`${KIND_META[p.kind].api}/${p.id}/publish`, { method: "POST", body: JSON.stringify({ is_published: !p.is_published }) });
      await load();
    } catch (e: any) { setActionError(e.message); } finally { setBusyId(null); }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const p = pendingDelete; setDeleting(true); setActionError(null);
    try {
      await apiFetch(`${KIND_META[p.kind].api}/${p.id}`, { method: "DELETE" });
      setPendingDelete(null); await load();
    } catch (e: any) { setActionError(e.message); } finally { setDeleting(false); }
  };

  const canManage = user && (user.role === "superadmin" || user.role === "analyst");
  const filtered = items.filter((i) => {
    if (kindFilter !== "all" && i.kind !== kindFilter) return false;
    if (statusFilter === "published" && !i.is_published) return false;
    if (statusFilter === "draft" && i.is_published) return false;
    return true;
  });
  const publishedCount = items.filter((i) => i.is_published).length;

  if (!loading && !canManage) {
    return <AppShell><div className="card p-8 text-center"><p className="text-brand-slate">El centro de publicaciones es solo para analistas y superadmin.</p></div></AppShell>;
  }

  return (
    <AppShell>
      <div className="mb-2 text-xs text-brand-slate">
        <Link href="/operativas" className="hover:text-brand-primary">Operativas</Link>
        <span className="mx-2">/</span>
        <Link href="/televentas" className="hover:text-brand-primary">Televentas</Link>
        <span className="mx-2">/</span>
        <span className="text-brand-ink font-semibold">Publicaciones</span>
      </div>
      <div className="mb-6">
        <h1 className="font-display text-3xl sm:text-4xl text-brand-ink uppercase">Publicaciones · Televentas</h1>
        <p className="text-sm text-brand-slate mt-1 max-w-3xl">Publicar, despublicar y eliminar reportes de Televentas. Los clientes solo ven lo publicado.</p>
      </div>

      {error && <div className="card p-4 mb-4"><p className="text-brand-primary text-sm">{error}</p></div>}
      {actionError && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-brand-primary/30 bg-brand-primary-light px-4 py-3">
          <p className="text-sm text-brand-primary-dark">{actionError}</p>
          <button onClick={() => setActionError(null)} className="text-brand-primary-dark/60 hover:text-brand-primary-dark text-lg leading-none">×</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="text-sm border border-brand-border rounded px-3 py-2 bg-white">
          {KIND_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-sm border border-brand-border rounded px-3 py-2 bg-white">
          {STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <span className="text-xs text-brand-slate ml-auto">{filtered.length} de {items.length} reportes · {publishedCount} publicados</span>
      </div>

      {loading && <div className="text-brand-slate">Cargando…</div>}
      {!loading && filtered.length === 0 && <div className="card p-12 text-center"><p className="text-brand-slate">No hay reportes para los filtros seleccionados.</p></div>}

      {!loading && filtered.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-brand-bg border-b border-brand-border">
              <tr className="text-[11px] uppercase tracking-wider2 text-brand-slate">
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Período / Título</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-left">Generado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={`${p.kind}-${p.id}`} className="border-t border-brand-border hover:bg-brand-bg-soft">
                  <td className="px-4 py-3"><span className={`text-[10px] uppercase tracking-wider2 font-semibold px-2 py-1 rounded ${KIND_META[p.kind].badge}`}>{KIND_META[p.kind].label}</span></td>
                  <td className="px-4 py-3 font-semibold text-brand-ink">
                    {p.title || p.period_month || "—"}
                    {p.title && p.period_month && <span className="block text-[11px] font-normal text-brand-slate">{p.period_month}</span>}
                  </td>
                  <td className="px-4 py-3">{p.is_published ? <span className="badge-success">Publicado</span> : <span className="badge-neutral">Borrador</span>}</td>
                  <td className="px-4 py-3 text-xs text-brand-slate">{formatDate(p.generated_at)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => togglePublish(p)} disabled={busyId === p.id} className="text-xs px-2.5 py-1 mr-1 rounded border border-brand-border hover:border-brand-cyan hover:text-brand-cyan disabled:opacity-50">
                      {p.is_published ? "Despublicar" : "Publicar"}
                    </button>
                    <button onClick={() => setPendingDelete(p)} disabled={busyId === p.id} className="text-xs px-2.5 py-1 mr-1 rounded border border-brand-border hover:border-brand-primary hover:text-brand-primary disabled:opacity-50">Eliminar</button>
                    <Link href={KIND_META[p.kind].view(p.id)} className="text-brand-primary font-semibold hover:underline">Ver →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete} variant="danger" title="Eliminar reporte"
        confirmLabel="Eliminar definitivamente" cancelLabel="Cancelar" loading={deleting}
        onCancel={() => !deleting && setPendingDelete(null)} onConfirm={confirmDelete}
        message={pendingDelete && (<>Vas a eliminar <b className="text-brand-ink">{KIND_META[pendingDelete.kind].label} · {pendingDelete.title || pendingDelete.period_month || "sin período"}</b>. Esta acción no se puede deshacer.</>)}
      />
    </AppShell>
  );
}
