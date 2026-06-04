"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { apiFetch, getToken } from "@/lib/api";

interface FileSlot {
  key: "entrantes" | "estados" | "intervalo" | "colas";
  label: string;
  hint: string;
}

const SLOTS: FileSlot[] = [
  { key: "entrantes", label: "Entrantes / Salientes por agente", hint: "Interacciones por operador (voz / mensaje)." },
  { key: "estados", label: "Estados por agente", hint: "Tiempos por estado / auxiliares." },
  { key: "intervalo", label: "Llamadas por intervalo", hint: "Métricas de cola por intervalo de 30 min." },
  { key: "colas", label: "Colas de atención", hint: "Detalle de colas + totales del período." },
];

export default function AtencionLlamadasUploadPage() {
  const router = useRouter();
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [periodMonth, setPeriodMonth] = useState<string>(
    new Date().toISOString().slice(0, 7) + "-01",
  );
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);

  useEffect(() => {
    if (!uploadId) return;
    const interval = setInterval(async () => {
      try {
        const data = await apiFetch<{ status: string; last_error: string | null }>(
          `/api/v1/atencion/llamadas/uploads/${uploadId}`,
        );
        setStatus(data.status);
        if (data.status === "completed") {
          clearInterval(interval);
          const reports = await apiFetch<{ items: { id: string }[] }>("/api/v1/atencion/llamadas/reports");
          if (reports.items[0]) router.push(`/atencion/llamadas/reports/${reports.items[0].id}`);
        } else if (data.status === "failed") {
          clearInterval(interval);
          setError(data.last_error || "Error desconocido");
        }
      } catch (e: any) {
        clearInterval(interval);
        setError(e.message);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [uploadId, router]);

  const setSlot = (key: string, f: File | null) =>
    setFiles((prev) => ({ ...prev, [key]: f }));

  const allReady = SLOTS.every((s) => files[s.key]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allReady) {
      setError("Cargá los 4 archivos antes de procesar.");
      return;
    }
    setError(null);
    setSubmitting(true);
    setStatus("uploading");

    const form = new FormData();
    SLOTS.forEach((s) => form.append(s.key, files[s.key] as File));
    form.append("period_month", periodMonth);

    try {
      const token = getToken();
      const r = await fetch("/api/v1/atencion/llamadas/uploads", {
        method: "POST",
        body: form,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.detail || "Error al subir");
      }
      const data = await r.json();
      setUploadId(data.id);
      setStatus("pending");
    } catch (err: any) {
      setError(err.message);
      setStatus(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="mb-2 text-xs text-brand-slate">
        <Link href="/atencion" className="hover:text-brand-primary">Atención</Link>
        <span className="mx-2">/</span>
        <span className="text-brand-ink font-semibold">Subir Llamadas</span>
      </div>
      <div className="mb-6">
        <h1 className="font-display text-3xl text-brand-ink uppercase">Subir Reporte de Llamadas</h1>
        <p className="text-sm text-brand-slate mt-1">
          Los <b>4 archivos</b> se procesan juntos. Acepta <code>.xls</code> y <code>.xlsx</code>.
          Las fechas se toman del contenido; el período es solo etiqueta de la publicación.
        </p>
      </div>

      <form onSubmit={onSubmit} className="card p-7 max-w-3xl space-y-6">
        <div className="grid sm:grid-cols-2 gap-5">
          {SLOTS.map((s) => (
            <div key={s.key}>
              <label className="label">{s.label}</label>
              <p className="text-xs text-brand-slate -mt-1 mb-1.5">{s.hint}</p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setSlot(s.key, e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-brand-slate file:mr-4 file:py-2.5 file:px-5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:uppercase file:tracking-wider2 file:bg-brand-ink file:text-white hover:file:bg-brand-cyan cursor-pointer"
              />
              {files[s.key] && (
                <p className="mt-1.5 text-xs text-emerald-700 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {files[s.key]!.name} ({(files[s.key]!.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
          ))}
        </div>

        <div>
          <label className="label">Período del reporte (etiqueta)</label>
          <input
            type="date"
            value={periodMonth}
            onChange={(e) => setPeriodMonth(e.target.value)}
            className="input max-w-xs"
          />
        </div>

        {error && (
          <div className="bg-brand-primary-light border border-brand-primary/30 text-brand-primary-dark text-sm rounded-md p-3">
            {error}
          </div>
        )}

        {status && status !== "completed" && !error && (
          <div className="bg-brand-cyan/10 border border-brand-cyan/30 text-brand-cyan text-sm rounded-md p-3 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-brand-cyan animate-pulse" />
            Estado: <b>{status}</b> · procesando los 4 archivos…
          </div>
        )}

        <button type="submit" disabled={submitting || !!uploadId || !allReady} className="btn-primary text-base">
          {submitting ? "Subiendo…" : "Procesar los 4 archivos"}
        </button>
      </form>
    </AppShell>
  );
}
