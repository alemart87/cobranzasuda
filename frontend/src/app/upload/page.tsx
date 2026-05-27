"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { apiFetch, getToken } from "@/lib/api";

export default function UploadPage() {
  const router = useRouter();
  const [dxp, setDxp] = useState<File | null>(null);
  const [boca, setBoca] = useState<File | null>(null);
  const [cobrado, setCobrado] = useState<File | null>(null);
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
          `/api/v1/uploads/${uploadId}`,
        );
        setStatus(data.status);
        if (data.status === "completed") {
          clearInterval(interval);
          const reports = await apiFetch<{ items: { id: string }[] }>("/api/v1/reports");
          if (reports.items[0]) router.push(`/reports/${reports.items[0].id}`);
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
    if (!dxp || !boca || !cobrado) {
      setError("Subir los 3 archivos requeridos");
      return;
    }
    setError(null);
    setSubmitting(true);
    setStatus("uploading");

    const form = new FormData();
    form.append("dxp", dxp);
    form.append("boca", boca);
    form.append("cobrado", cobrado);
    form.append("period_month", periodMonth);

    try {
      const token = getToken();
      const r = await fetch("/api/v1/uploads", {
        method: "POST",
        body: form,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.detail || "Error al subir archivos");
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
      <div className="mb-6">
        <h1 className="font-display text-3xl text-brand-ink uppercase">Subir Cobranzas</h1>
        <p className="text-sm text-brand-slate mt-1">
          Cargar los 3 archivos requeridos del mes: DXP Voicenter, Boca de Cobranzas y Cobrado 186.
        </p>
      </div>

      <form onSubmit={onSubmit} className="card p-7 max-w-3xl space-y-5">
        <FileInput label="DXP Voicenter" hint="Archivo XLSX exportado de DXP" file={dxp} onChange={setDxp} />
        <FileInput label="Boca de Cobranzas" hint="Pagos del mes en XLSX" file={boca} onChange={setBoca} />
        <FileInput label="Cobrado 186 Voicenter" hint="Pagos cobrados directamente" file={cobrado} onChange={setCobrado} />

        <div>
          <label className="label">Mes del reporte</label>
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
            Estado: <b>{status}</b> · procesando en segundo plano…
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !!uploadId}
          className="btn-primary text-base"
        >
          {submitting ? "Subiendo…" : "Procesar archivos"}
        </button>
      </form>
    </AppShell>
  );
}

function FileInput({
  label,
  hint,
  file,
  onChange,
}: {
  label: string;
  hint?: string;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {hint && <p className="text-xs text-brand-slate -mt-1 mb-1.5">{hint}</p>}
      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="block w-full text-sm text-brand-slate file:mr-4 file:py-2.5 file:px-5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:uppercase file:tracking-wider2 file:bg-brand-ink file:text-white hover:file:bg-brand-primary cursor-pointer"
      />
      {file && (
        <p className="mt-1.5 text-xs text-emerald-700 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          {file.name} ({(file.size / 1024).toFixed(1)} KB)
        </p>
      )}
    </div>
  );
}
