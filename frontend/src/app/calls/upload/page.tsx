"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { apiFetch, getToken } from "@/lib/api";

export default function CallsUploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
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
          `/api/v1/calls/uploads/${uploadId}`,
        );
        setStatus(data.status);
        if (data.status === "completed") {
          clearInterval(interval);
          const reports = await apiFetch<{ items: { id: string }[] }>("/api/v1/calls/reports");
          if (reports.items[0]) router.push(`/calls/reports/${reports.items[0].id}`);
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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Seleccionar archivo");
      return;
    }
    setError(null);
    setSubmitting(true);
    setStatus("uploading");

    const form = new FormData();
    form.append("file", file);
    form.append("period_month", periodMonth);

    try {
      const token = getToken();
      const r = await fetch("/api/v1/calls/uploads", {
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
      <h1 className="text-2xl font-bold text-brand-secondary mb-1">Subir Reporte de Llamadas</h1>
      <p className="text-sm text-brand-neutral-500 mb-6">
        Archivo Reporte Cobranzas con la hoja <b>Bsse de llamadas</b> (export de Genesys / contact center).
      </p>
      <form
        onSubmit={onSubmit}
        className="bg-white border border-brand-neutral-200 rounded-lg p-6 max-w-2xl space-y-5"
      >
        <div>
          <label className="block text-sm font-medium text-brand-neutral-700 mb-1">
            Archivo Excel (.xlsx)
          </label>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-brand-neutral-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-brand-primary file:text-white hover:file:bg-brand-secondary"
          />
          {file && (
            <p className="mt-1 text-xs text-brand-neutral-600">
              ✓ {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-brand-neutral-700 mb-1">
            Mes del reporte
          </label>
          <input
            type="date"
            value={periodMonth}
            onChange={(e) => setPeriodMonth(e.target.value)}
            className="px-3 py-2 border border-brand-neutral-300 rounded-md"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md p-3">
            {error}
          </div>
        )}

        {status && status !== "completed" && !error && (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded-md p-3">
            Estado: <b>{status}</b>… (procesando)
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !!uploadId}
          className="bg-brand-primary text-white px-5 py-2 rounded-md font-medium hover:bg-brand-secondary disabled:opacity-60"
        >
          {submitting ? "Subiendo…" : "Procesar archivo"}
        </button>
      </form>
    </AppShell>
  );
}
